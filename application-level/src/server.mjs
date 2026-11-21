import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCommandsInput } from './commandValidator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');

const PORT = Number(process.env.PORT || 3000);
const AGENT_URL = (process.env.AGENT_URL || 'http://localhost:8002').replace(/\/+$/, '');
const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS || 5000);
const MAX_BODY_BYTES = 10 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const sseClients = new Set();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;

    req.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_BYTES) {
        reject(new Error('Превышен максимальный размер тела запроса (10 MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Некорректный JSON в теле запроса'));
      }
    });

    req.on('error', reject);
  });
}

function resetPingTimer(client) {
  if (client.pingTimer) {
    clearTimeout(client.pingTimer);
  }
  client.pingTimer = setTimeout(() => {
    if (!client.res.writableEnded) {
      client.res.write('event: ping\ndata: {"type":"ping"}\n\n');
      resetPingTimer(client);
    }
  }, PING_INTERVAL_MS);
}

function broadcastTelemetry(message) {
  const frame = `event: telemetry\ndata: ${JSON.stringify(message)}\n\n`;
  for (const client of sseClients) {
    if (!client.res.writableEnded) {
      client.res.write(frame);
      resetPingTimer(client);
    }
  }
}

function handleSseStream(req, res) {
  req.socket.setNoDelay(true);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write('event: ping\ndata: {"type":"ping"}\n\n');

  const client = { res, pingTimer: null };
  sseClients.add(client);
  resetPingTimer(client);

  req.on('close', () => {
    if (client.pingTimer) {
      clearTimeout(client.pingTimer);
    }
    sseClients.delete(client);
  });
}

async function handleTelemetryIngest(req, res) {
  try {
    const message = await readJsonBody(req);
    broadcastTelemetry(message);
    sendJson(res, 202, { status: 'accepted', clients: sseClients.size });
  } catch (err) {
    sendJson(res, 400, { detail: err.message });
  }
}

async function handleCommandSubmit(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { source: 'validation', detail: err.message });
  }

  const sender = typeof body?.sender === 'string' && body.sender.trim()
    ? body.sender.trim()
    : 'operator';

  let operations;
  try {
    operations = parseCommandsInput(body?.rawInput);
  } catch (err) {
    return sendJson(res, 400, { source: 'validation', detail: err.message });
  }

  const timestamp = new Date().toISOString();
  const isSingle = operations.length === 1;
  const endpoint = isSingle ? '/api/v1/commands' : '/api/v1/commands/batch';
  const agentPayload = isSingle
    ? { sender, timestamp, payload: operations[0] }
    : { sender, timestamp, commands: operations };

  try {
    const agentRes = await fetch(`${AGENT_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentPayload),
      signal: AbortSignal.timeout(5000),
    });

    const responseText = await agentRes.text();
    let agentData = {};
    try {
      agentData = responseText ? JSON.parse(responseText) : {};
    } catch {
      agentData = { detail: responseText };
    }

    if (!agentRes.ok) {
      return sendJson(res, agentRes.status, {
        source: 'agent',
        detail: agentData.detail || `Ошибка агентного уровня (HTTP ${agentRes.status})`,
      });
    }

    return sendJson(res, agentRes.status, {
      data: agentData,
      operationsCount: operations.length,
    });
  } catch (err) {
    return sendJson(res, 502, {
      source: 'agent',
      detail: `Нет ответа от агентного уровня: ${err.message}`,
    });
  }
}

function serveStatic(req, res, pathname) {
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);

  if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Frontend build not found');
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = urlObj;

  if (req.method === 'GET' && pathname === '/api/v1/telemetry/stream') {
    return handleSseStream(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/v1/telemetry') {
    return handleTelemetryIngest(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/v1/commands') {
    return handleCommandSubmit(req, res);
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, pathname);
  }

  return sendJson(res, 404, { detail: 'Not Found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Application server listening on :${PORT} (agent: ${AGENT_URL})`);
});

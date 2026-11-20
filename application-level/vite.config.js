import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const transportTarget = env.PROXY_TRANSPORT_URL || 'http://localhost:8001';
  const agentTarget = env.PROXY_AGENT_URL || 'http://localhost:8002';

  const proxyConfig = {
    // Проксирование SSE-потока телеметрии на транспортный уровень
    '/api/v1/telemetry': {
      target: transportTarget,
      changeOrigin: true,
      timeout: 0,
      proxyTimeout: 0,
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq, req) => {
          proxyReq.setHeader('Accept-Encoding', 'identity');
          req.socket?.setNoDelay(true);
        });
        proxy.on('proxyRes', (proxyRes, req, res) => {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.socket?.setNoDelay(true);
          if (typeof res.flushHeaders === 'function') {
            res.flushHeaders();
          }
        });
      },
    },
    // Проксирование команд управления на агентный уровень
    '/api/v1/commands': {
      target: agentTarget,
      changeOrigin: true,
    },
  };

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: proxyConfig,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      proxy: proxyConfig,
    },
  };
});

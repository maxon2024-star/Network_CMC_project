const LIMITS = {
  MIN_COORD: 0,
  MAX_COORD: 1000,
  MAX_DEPTH: 100,
  MAX_DURATION: 3600,
};

function assertFiniteNumber(value, fieldName, context) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context}: параметр "${fieldName}" должен быть числом`);
  }
}

function validateOperation(op, context) {
  if (!op || typeof op !== 'object') {
    throw new Error(`${context}: некорректная структура операции`);
  }

  if (op.operation !== 'drilling' && op.operation !== 'milling') {
    throw new Error(
      `${context}: неизвестный тип операции "${op.operation}". Допустимы: drilling, milling`
    );
  }

  if (!op.start || typeof op.start !== 'object' || !op.end || typeof op.end !== 'object') {
    throw new Error(`${context}: не заданы координаты start или end`);
  }

  assertFiniteNumber(op.start.x, 'start.x', context);
  assertFiniteNumber(op.start.y, 'start.y', context);
  assertFiniteNumber(op.end.x, 'end.x', context);
  assertFiniteNumber(op.end.y, 'end.y', context);
  assertFiniteNumber(op.depth, 'depth', context);
  assertFiniteNumber(op.duration, 'duration', context);

  const coords = [
    ['start.x', op.start.x],
    ['start.y', op.start.y],
    ['end.x', op.end.x],
    ['end.y', op.end.y],
  ];

  for (const [name, val] of coords) {
    if (val < LIMITS.MIN_COORD || val > LIMITS.MAX_COORD) {
      throw new Error(
        `${context}: координата ${name} (${val}) выходит за пределы рабочей зоны [${LIMITS.MIN_COORD}..${LIMITS.MAX_COORD}]`
      );
    }
  }

  if (op.depth <= 0 || op.depth > LIMITS.MAX_DEPTH) {
    throw new Error(
      `${context}: глубина depth (${op.depth}) должна быть в диапазоне (0..${LIMITS.MAX_DEPTH}]`
    );
  }

  if (op.duration <= 0 || op.duration > LIMITS.MAX_DURATION) {
    throw new Error(
      `${context}: длительность duration (${op.duration}) должна быть в диапазоне (0..${LIMITS.MAX_DURATION}]`
    );
  }

  if (op.operation === 'milling' && op.start.x === op.end.x && op.start.y === op.end.y) {
    throw new Error(
      `${context}: для фрезеровки начальная и конечная точки (${op.start.x}, ${op.start.y}) не должны совпадать`
    );
  }

  return op;
}

function parseTextLine(line, lineNumber) {
  const context = `Строка ${lineNumber}`;
  const parts = line.split(/\s+/);
  const code = parts[0].toUpperCase();

  if (code === 'F' || code === 'MILLING') {
    if (parts.length !== 7) {
      throw new Error(
        `${context}: неверное число параметров для фрезеровки (ожидается 6 чисел: F startX startY endX endY depth duration)`
      );
    }

    const nums = parts.slice(1).map((token) => Number(token));
    if (nums.some((n) => !Number.isFinite(n))) {
      throw new Error(`${context}: все параметры команды "${code}" должны быть числами`);
    }

    const [sx, sy, ex, ey, depth, duration] = nums;
    return validateOperation(
      {
        operation: 'milling',
        start: { x: sx, y: sy },
        end: { x: ex, y: ey },
        depth,
        duration,
      },
      context
    );
  }

  if (code === 'D' || code === 'S' || code === 'DRILLING') {
    if (parts.length !== 5) {
      throw new Error(
        `${context}: неверное число параметров для сверления (ожидается 4 числа: ${code} x y depth duration)`
      );
    }

    const nums = parts.slice(1).map((token) => Number(token));
    if (nums.some((n) => !Number.isFinite(n))) {
      throw new Error(`${context}: все параметры команды "${code}" должны быть числами`);
    }

    const [x, y, depth, duration] = nums;
    return validateOperation(
      {
        operation: 'drilling',
        start: { x, y },
        end: { x, y },
        depth,
        duration,
      },
      context
    );
  }

  throw new Error(
    `${context}: неизвестный код команды "${parts[0]}". Используйте F (фрезеровка) или D / S (сверление)`
  );
}

export function parseCommandsInput(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Программа пуста: введите команду или загрузите непустой файл');
  }

  const trimmed = rawText.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Синтаксическая ошибка JSON: ${err.message}`);
    }

    let rawOperations;
    if (Array.isArray(parsed)) {
      rawOperations = parsed;
    } else if (parsed && Array.isArray(parsed.commands)) {
      rawOperations = parsed.commands;
    } else if (parsed && parsed.payload) {
      rawOperations = [parsed.payload];
    } else {
      rawOperations = [parsed];
    }

    if (rawOperations.length === 0) {
      throw new Error('Список операций в JSON не должен быть пустым');
    }

    return rawOperations.map((op, idx) => validateOperation(op, `Операция #${idx + 1}`));
  }

  const operations = [];
  trimmed.split('\n').forEach((rawLine, index) => {
    const cleanLine = rawLine.trim();
    if (!cleanLine || cleanLine.startsWith('#') || cleanLine.startsWith('//')) {
      return;
    }
    operations.push(parseTextLine(cleanLine, index + 1));
  });

  if (operations.length === 0) {
    throw new Error('В программе не найдено ни одной исполняемой команды');
  }

  return operations;
}

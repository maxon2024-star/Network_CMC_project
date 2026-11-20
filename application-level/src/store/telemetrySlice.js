import { createSlice } from '@reduxjs/toolkit';

const TELEMETRY_WINDOW_SIZE = 5;
const CMC_CHAT_NAME = 'Контроллер_Станка'


const formatTime = () =>
  new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const createMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function pushTelemetryResult(state, isError) {
  state.recentTelemetryResults.push(isError);
  if (state.recentTelemetryResults.length > TELEMETRY_WINDOW_SIZE) {
    state.recentTelemetryResults.shift();
  }
}

const initialState = {
  operatorName: '',
  isConnected: false,
  isExecuting: false,
  finished: true,
  missedPings: 0,
  connectionInterrupted: false,
  recentTelemetryResults: [],
  currentCommand: 'idle',
  position: { x: 0, y: 0, z: 0 },
  messages: [],
};

const telemetrySlice = createSlice({
  name: 'telemetry',
  initialState,
  reducers: {
    loginOperator(state, action) {
      state.operatorName = action.payload.trim();
      state.isConnected = false;
      state.isExecuting = false;
      state.finished = true;
      state.missedPings = 0;
      state.connectionInterrupted = false;
      state.recentTelemetryResults = [];
      state.currentCommand = 'idle';
      state.position = { x: 0, y: 0, z: 0 };
      state.messages = [];
    },
    resetSession(state) {
      state.operatorName = '';
      state.isConnected = false;
      state.isExecuting = false;
      state.finished = true;
      state.missedPings = 0;
      state.connectionInterrupted = false;
      state.recentTelemetryResults = [];
      state.currentCommand = 'idle';
      state.position = { x: 0, y: 0, z: 0 };
      state.messages = [];
    },
    setConnectionStatus(state, action) {
      state.isConnected = Boolean(action.payload);
    },
    startCommandExecution(state) {
      // Обнуление окна ошибок только при старте нового цикла выполнения
      if (!state.isExecuting) {
        state.recentTelemetryResults = [];
      }
      state.isExecuting = true;
      state.finished = false;
      state.missedPings = 0;
      state.connectionInterrupted = false;
    },
    handleSsePing(state) {
      state.isConnected = true;

      if (!state.isExecuting) {
        return;
      }

      // 1-й пинг во время работы агента: «Соединение прервано»
      if (!state.connectionInterrupted) {
        state.missedPings = 1;
        state.connectionInterrupted = true;
        return;
      }

      // 2-й пинг в состоянии прерванного соединения: сброс состояния
      state.isExecuting = false;
      state.finished = true;
      state.missedPings = 0;
      state.connectionInterrupted = false;
      state.recentTelemetryResults = [];
      state.currentCommand = 'idle';
      state.position = { x: 0, y: 0, z: 0 };
      state.messages.push({
        id: createMessageId(),
        sender: CMC_CHAT_NAME,
        timestamp: formatTime(),
        kind: 'error',
        text: 'Состояние станка сброшено из-за потери соединения',
      });
    },
    applyTelemetryMessage(state, action) {
      const msg = action.payload;
      if (!msg || typeof msg !== 'object') {
        return;
      }

      state.isConnected = true;

      // Событие ошибки телеметрии
      if (msg.error) {
        if (state.isExecuting) {
          state.missedPings = 0;
          state.connectionInterrupted = false;
          pushTelemetryResult(state, true);
        }
        return;
      }

      // Успешный event телеметрии
      if (msg.payload) {
        const { commandName, position, finished } = msg.payload;
        const wasExecuting = state.isExecuting || !state.finished;

        state.missedPings = 0;
        state.connectionInterrupted = false;

        if (state.isExecuting || finished === false) {
          pushTelemetryResult(state, false);
        }

        if (commandName !== undefined) {
          state.currentCommand = commandName;
        }
        if (position) {
          state.position = {
            x: position.x ?? state.position.x,
            y: position.y ?? state.position.y,
            z: position.z ?? state.position.z,
          };
        }

        if (finished === true) {
          state.isExecuting = false;
          state.finished = true;
          if (wasExecuting) {
            state.messages.push({
              id: createMessageId(),
              sender: CMC_CHAT_NAME,
              timestamp: formatTime(),
              kind: 'status',
              text: 'Исполнение команд завершено',
            });
          }
        } else if (finished === false) {
          state.isExecuting = true;
          state.finished = false;
        }
      }
    },
    appendOutgoingCommand(state, action) {
      const { sender, text } = action.payload;
      state.messages.push({
        id: createMessageId(),
        sender: `${sender} (Вы)`,
        timestamp: formatTime(),
        kind: 'command',
        text,
      });
    },
    appendOutgoingFile(state, action) {
      const { sender, fileName, fileSize } = action.payload;
      state.messages.push({
        id: createMessageId(),
        sender: `${sender} (Вы)`,
        timestamp: formatTime(),
        kind: 'file',
        fileName,
        fileSize,
      });
    },
    appendSystemNotice(state, action) {
      // Только запись ответа в чат — не затрагивает состояние выполнения и пингов
      const { sender, timestamp, kind, text } = action.payload;
      state.messages.push({
        id: createMessageId(),
        sender: CMC_CHAT_NAME,
        timestamp: timestamp || formatTime(),
        kind: kind || 'status',
        text,
      });
    },
  },
});

export const {
  loginOperator,
  resetSession,
  setConnectionStatus,
  startCommandExecution,
  handleSsePing,
  applyTelemetryMessage,
  appendOutgoingCommand,
  appendOutgoingFile,
  appendSystemNotice,
} = telemetrySlice.actions;

export default telemetrySlice.reducer;

import React from 'react';
import { useSelector } from 'react-redux';

const COMMAND_LABELS = {
  idle: 'Ожидание',
  retract: 'Подъем резца',
  positioning: 'Перемещение XY',
  plunge: 'Опускание резца',
  drilling: 'Сверление',
  milling: 'Фрезеровка',
  return_home: 'Возврат в ноль',
};

function formatCoord(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

export default function MachineParams() {
  const {
    isConnected,
    connectionInterrupted,
    recentTelemetryResults,
    currentCommand,
    position,
  } = useSelector((state) => state.telemetry);

  const isUnstable = recentTelemetryResults.some(Boolean);
  const readableCommand = COMMAND_LABELS[currentCommand] || currentCommand;

  return (
    <aside className="params-card">
      <div className="params-card-top-accent" />

      <div className="connection-badge">
        <span
          className={`connection-dot ${
            isConnected ? 'dot-connected' : 'dot-disconnected'
          }`}
        />
        <span>{isConnected ? 'Подключено' : 'Отключено'}</span>
      </div>

      <h2 className="params-heading">Параметры станка</h2>

      {connectionInterrupted ? (
        <div className="params-section">
          <div className="params-label">Состояние станка</div>
          <div className="interrupted-state-box">
            Соединение прервано
          </div>
        </div>
      ) : (
        <>
          <div className="params-section">
            <div className="params-label">Текущая команда</div>
            <div className="current-command-box">{readableCommand}</div>
          </div>

          <div className="params-section">
            <div className="params-label">Координаты</div>
            <div className="coordinates-row">
              <div className="coord-box">X: {formatCoord(position.x)}</div>
              <div className="coord-box">Y: {formatCoord(position.y)}</div>
              <div className="coord-box">Z: {formatCoord(position.z)}</div>
            </div>
          </div>

          {isUnstable && (
            <div className="params-section">
              <div className="unstable-inline-notice">
                Нестабильное соединение
              </div>
            </div>
          )}
        </>
      )}

      <div className="ephemeral-warning">
        <div className="ephemeral-warning-title">
          <span>&#128203;</span>
          <span>Чат не сохраняется</span>
        </div>
        <p className="ephemeral-warning-text">
          При обновлении страницы (F5) или выходе история чата не сохраняется.
        </p>
      </div>
    </aside>
  );
}

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resetSession } from '../store/telemetrySlice';
import MachineParams from './MachineParams';
import ChatStream from './ChatStream';
import InputBar from './InputBar';

export default function TerminalView() {
  const dispatch = useDispatch();
  const operatorName = useSelector((state) => state.telemetry.operatorName);

  return (
    <section className="view-container">
      <div className="breadcrumb-text">ЧПУ №1 Чат управления</div>
      <h1 className="view-title">
        Программа станка с ЧПУ: Терминал обмена командами и файлами
      </h1>

      <div className="terminal-layout">
        <MachineParams />

        <div className="terminal-panel">
          <div className="terminal-panel-header">
            <div className="terminal-identity">
              <div className="terminal-identity-top">
                <span className="status-dot-green" />
                <span className="terminal-panel-title">Терминал ЧПУ №1</span>
              </div>
              <div className="terminal-operator-label">
                Текущий пользователь:{' '}
                <span className="terminal-operator-highlight">{operatorName}</span>
              </div>
            </div>

            <button
              type="button"
              className="btn-reset-session"
              onClick={() => dispatch(resetSession())}
            >
              Выйти (Сброс)
            </button>
          </div>

          <ChatStream />
          <InputBar />
        </div>
      </div>
    </section>
  );
}

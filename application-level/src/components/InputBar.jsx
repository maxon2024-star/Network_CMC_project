import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sendCncCommands } from '../api/cncApi';
import {
  appendOutgoingCommand,
  appendOutgoingFile,
  startCommandExecution,
  appendSystemNotice,
} from '../store/telemetrySlice';

const CMC_CHAT_NAME = 'Контроллер_Станка'


function formatCommandError(err) {
  if (err?.response) {
    const status = err.response.status;
    const detail = err.response.data?.detail;
    let reason = '';

    if (Array.isArray(detail)) {
      reason = detail.map((item) => item.msg).join('; ');
    } else if (typeof detail === 'string') {
      reason = detail;
    }

    return reason
      ? `Агент не принял команду (код ${status}): ${reason}`
      : `Агент не принял команду (код ${status})`;
  }

  // Нет ответа от агента (сетевая ошибка или таймаут)
  if (err?.request) {
    return 'Агент не принял команду: нет ответа от сервера';
  }

  // Локальная ошибка синтаксиса или выхода за пределы рабочей области
  return err?.message || 'Ошибка синтаксиса или параметров команды';
}

export default function InputBar() {
  const dispatch = useDispatch();
  const operatorName = useSelector((state) => state.telemetry.operatorName);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  const submitRawProgram = async (rawContent) => {
    await sendCncCommands(operatorName, rawContent);
    dispatch(startCommandExecution());
    dispatch(
      appendSystemNotice({
        sender: CMC_CHAT_NAME,
        kind: 'status',
        text: 'Команда принята',
      })
    );
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    dispatch(appendOutgoingCommand({ sender: operatorName, text: trimmed }));
    setText('');

    try {
      await submitRawProgram(trimmed);
    } catch (err) {
      dispatch(
        appendSystemNotice({
          sender: CMC_CHAT_NAME,
          kind: 'error',
          text: formatCommandError(err),
        })
      );
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || sending) return;

    setSending(true);
    const sizeMb = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    dispatch(
      appendOutgoingFile({
        sender: operatorName,
        fileName: file.name,
        fileSize: sizeMb,
      })
    );

    try {
      const content = await file.text();
      await submitRawProgram(content);
    } catch (err) {
      dispatch(
        appendSystemNotice({
          sender: CMC_CHAT_NAME,
          kind: 'error',
          text: formatCommandError(err),
        })
      );
    } finally {
      setSending(false);
      event.target.value = '';
    }
  };

  return (
    <form className="input-bar" onSubmit={handleSend}>
      <button
        type="button"
        className="attach-btn"
        title="Прикрепить файл УП"
        disabled={sending}
        onClick={() => fileInputRef.current?.click()}
      >
        &#128206;
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.json,.nc,.gcode"
        className="hidden-file-input"
        onChange={handleFileChange}
      />

      <input
        type="text"
        className="command-input"
        placeholder="Введите сообщение или прикрепите файл УП..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={sending}
      />

      <button type="submit" className="btn-send" disabled={sending}>
        ОТПРАВИТЬ &gt;
      </button>
    </form>
  );
}

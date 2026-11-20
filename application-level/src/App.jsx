import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  applyTelemetryMessage,
  handleSsePing,
  setConnectionStatus,
} from './store/telemetrySlice';
import Header from './components/Header';
import AuthView from './components/AuthView';
import TerminalView from './components/TerminalView';

export default function App() {
  const dispatch = useDispatch();
  const operatorName = useSelector((state) => state.telemetry.operatorName);

  useEffect(() => {
    if (!operatorName) {
      dispatch(setConnectionStatus(false));
      return;
    }

    const baseSseUrl =
      import.meta.env.VITE_TRANSPORT_SSE_URL || '/api/v1/telemetry/stream';
    const streamUrl = `${baseSseUrl}?username=${encodeURIComponent(operatorName)}`;

    const eventSource = new EventSource(streamUrl);

    const onPing = () => {
      dispatch(handleSsePing());
    };

    const onTelemetry = (event) => {
      dispatch(setConnectionStatus(true));
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'ping') {
          dispatch(handleSsePing());
          return;
        }
        dispatch(applyTelemetryMessage(parsed));
      } catch (err) {
        console.error('Ошибка декодирования SSE-сообщения:', err);
      }
    };

    eventSource.onopen = () => {
      dispatch(setConnectionStatus(true));
    };

    eventSource.addEventListener('ping', onPing);
    eventSource.addEventListener('telemetry', onTelemetry);
    eventSource.onmessage = onTelemetry;

    eventSource.onerror = () => {
      dispatch(setConnectionStatus(false));
    };

    return () => {
      eventSource.removeEventListener('ping', onPing);
      eventSource.removeEventListener('telemetry', onTelemetry);
      eventSource.close();
      dispatch(setConnectionStatus(false));
    };
  }, [operatorName, dispatch]);

  return (
    <div className="page-shell">
      <Header />
      <main className="page-main">
        {!operatorName ? <AuthView /> : <TerminalView />}
      </main>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

export default function ChatStream() {
  const messages = useSelector((state) => state.telemetry.messages);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="chat-stream">
      {messages.map((msg) => {
        if (msg.kind === 'command') {
          return (
            <div key={msg.id} className="msg-row msg-outgoing">
              <div className="msg-meta msg-meta-right">
                <span className="msg-author-operator">{msg.sender}</span>
                <span> &bull; {msg.timestamp}</span>
              </div>
              <pre className="msg-command-bubble">{msg.text}</pre>
            </div>
          );
        }

        if (msg.kind === 'file') {
          return (
            <div key={msg.id} className="msg-row msg-outgoing">
              <div className="msg-meta msg-meta-right">
                <span className="msg-author-operator">{msg.sender}</span>
                <span> &bull; {msg.timestamp}</span>
              </div>
              <div className="msg-file-card">
                <div className="msg-file-badge">TXT</div>
                <div className="msg-file-info">
                  <div className="msg-file-name">{msg.fileName}</div>
                  <div className="msg-file-size">
                    {msg.fileSize} &bull; Загружен
                  </div>
                </div>
              </div>
            </div>
          );
        }

        if (msg.kind === 'error') {
          return (
            <div key={msg.id} className="msg-row msg-incoming">
              <div className="msg-meta">
                <strong>{msg.sender}</strong>
                <span> &bull; {msg.timestamp}</span>
              </div>
              <div className="msg-error-card">
                <div className="msg-error-icon">!</div>
                <div className="msg-error-text">{msg.text}</div>
              </div>
            </div>
          );
        }

        return (
          <div key={msg.id} className="msg-row msg-incoming">
            <div className="msg-meta">
              <strong>{msg.sender}</strong>
              <span> &bull; {msg.timestamp}</span>
            </div>
            <div className="msg-status-bubble">{msg.text}</div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

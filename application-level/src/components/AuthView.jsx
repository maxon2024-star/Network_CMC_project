import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { loginOperator } from '../store/telemetrySlice';

export default function AuthView() {
  const dispatch = useDispatch();
  const [username, setUsername] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!username.trim()) return;
    dispatch(loginOperator(username));
  };

  return (
    <section className="view-container">
      <div className="breadcrumb-text">ЧПУ №1 Авторизация</div>
      <h1 className="view-title">Программа станка с ЧПУ: Авторизация пользователя</h1>

      <div className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-card-top-accent" />
          <h2 className="auth-card-title">Авторизация оператора</h2>
          <p className="auth-card-subtitle">
            Введите имя для открытия SSE-сессии со станком ЧПУ
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="floating-field">
              <label htmlFor="operator-username" className="floating-label">
                Имя пользователя <span className="required-star">*</span>
              </label>
              <input
                id="operator-username"
                type="text"
                className="text-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-crimson btn-full">
              ПОДКЛЮЧИТЬСЯ
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

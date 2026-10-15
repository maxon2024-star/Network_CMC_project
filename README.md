# Телеметрия 2. Программа станка с ЧПУ
> Распределённая информационная система обмена файлами в реальном времени.  
> Курсовой проект по дисциплине «Сетевые технологии в АСОИУ» (МГТУ им. Н.Э. Баумана, 2026 г.)

## 👥 Команда разработчиков (ИУ5-75Б)
| Студент | Роль | Технологический стек |
| :--- | :--- | :--- |
| **Бикматов Д.А.** | Прикладной уровень | React, Redux Toolkit, Axios, MUI, Node.js |
| **Торопыгин А.А.** | Транспортный уровень | Python, Apache Kafka, Docker, WebSocket |
| **Задеба М.А.** | Агентный уровень | Python, FastAPI, ROS 2 Humble, Ubuntu 22.04 |

---

## 📖 Документация
* [Техническое задание (ТЗ)](./docs/ТЗ_бикм_заде_торо.docx)
* [Swagger / OpenAPI 3.0 Спецификация](./docs/openapi.yaml)
* [Диаграммы последовательности](./docs/diagrams/)

---

## 🏗 Архитектура системы
Система состоит из трех независимых веб-сервисов:
1. **Application Level** — UI терминал оператора (чат, отправка команд, получение телеметрии).
2. **Transport Level** — брокер сообщений с эмуляцией потерь (Congestion Simulation 2%), агрегацией сегментов и очередью (Kafka).
3. **Agent Level** — эмулятор станка с ЧПУ (2D-поверхность + Z-ось), генерирующий телеметрию и разбивающий её на сегменты по 256 байт.

---

## 🚀 Быстрый старт (Docker)
Для запуска всей системы необходимо наличие установленного `Docker` и `Docker Compose`.

```bash
# Клонировать репозиторий
git clone https://github.com/maxon2024-star/Network_CMC_project.git
cd Network_CMC_project

# Поднять все сервисы
docker-compose up --build
```
для сваги:
```bash
 docker run -p 8081:8080 -e SWAGGER_JSON=/spec/swaggg.yaml -v ${PWD}:/spec swaggerapi/swagger-ui          
 ```
**Доступ к сервисам:**
* **UI (Прикладной уровень):** [http://localhost:3000](http://localhost:3000)
* **Transport API:** [http://localhost:8001](http://localhost:8001)
* **Agent API (FastAPI):** [http://localhost:8002/docs](http://localhost:8002/docs)

---

## 🛠 Локальный запуск (без Docker)
*(Здесь вы позже напишете инструкции для каждого уровня, например: `npm install`, `pip install -r requirements.txt`, `ros2 launch ...`)*


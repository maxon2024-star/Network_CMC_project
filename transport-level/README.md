# Транспортный уровень (Transport Level Service)

Микросервис гарантированной доставки, буферизации и сборки сегментов телеметрии станка с ЧПУ. Сервис принимает фрагментированные пакеты от агентного уровня, эмулирует заданный процент сетевых потерь, обеспечивает асинхронную передачу через брокер сообщений Apache Kafka, склеивает сегменты в исходные JSON-состояния и отправляет их на прикладной уровень.

## Стек технологий

* **Backend / API:** Python 3.11+, FastAPI, Uvicorn, Pydantic
* **Брокер сообщений и клиент:** Apache Kafka, `aiokafka`
* **HTTP-клиент:** `httpx` (асинхронная отправка агрегированных состояний на прикладной уровень)
* **Контейнеризация:** Docker, Docker Compose

## Архитектура и взаимодействие уровней

```text
[ Agent Level (:8002) ]
          │
          ▼  POST /api/v1/segments (Base64 чанки <= 256 Б)
┌─────────────────────────────────────────────────────────────┐
│                   Transport Level (:8001)                   │
│                                                             │
│  [ FastAPI Router ] ──► [ Loss Simulator (2%) ]             │
│                                │ (98% принятых)             │
│                                ▼                            │
│                    [ Apache Kafka (:9092) ]                 │
│                                │                            │
│                                ▼                            │
│               [ Kafka Consumer & Instant Assembler ]        │
│               (сборка чанков + таймаут потерь 0.5 с)        │
└────────────────────────────────┬────────────────────────────┘
                                 │  POST /api/v1/telemetry
                                 ▼
                    [ Application Level (:3000) ]
```

## Структура проекта

```text
transport-level/
├── app/
│   ├── main.py                # Точка входа FastAPI, эндпоинт POST /api/v1/segments, lifespan
│   ├── kafka_worker.py        # Producer/Consumer Kafka, буфер сборки, детекция потерь, отправка в App
│   ├── models.py              # Pydantic-схемы входящих сегментов и исходящих сообщений телеметрии
│   └── config.py              # Настройки сервиса из переменных окружения
├── Dockerfile                 # Сборка образа транспортного сервиса
├── docker-compose.yml         # Конфигурация контейнеров транспортного уровня и Kafka
├── requirements.txt           # Python-зависимости
└── README.md
```

## Основной функционал

### 1. Приём сегментов и симуляция потерь (`app/main.py`)
* Эндпоинт `POST /api/v1/segments` принимает сегмент телеметрии (`sentAt`, `sender`, `totalSegments`, `segmentNumber`, `payload`).
* Перед постановкой в очередь применяется вероятностный фильтр потерь (`LOSS_PROBABILITY`, по умолчанию `0.02` — 2%):
  * При срабатывании симулятора потерь сегмент отбрасывается и возвращается `200 OK` с флагом `dropped: true`.
  * Уцелевшие сегменты записываются в топик Apache Kafka (`linger_ms=0`) и подтверждаются статусом `202 Accepted` (`queued: true`).

### 2. Немедленная сборка пакетов и быстрая фиксация потерь (`app/kafka_worker.py`)
Фоновый обработчик `TransportBrokerManager` читает сегменты из Kafka с минимальной задержкой (`fetch_max_wait_ms=20`) и группирует их в буфере по идентификатору кадра `sentAt`:
* **Мгновенная сборка:** как только количество полученных сегментов сравнивается с `totalSegments`, чанки сортируются по `segmentNumber`, декодируются из **Base64** в исходный JSON и без задержек отправляются на прикладной уровень (`POST /api/v1/telemetry`, `error: false`).
* **Фиксация потерь при смене кадра:** если из Kafka поступил сегмент нового состояния (`sentAt`), а предыдущий пакет в буфере остался неполным, потеря фиксируется немедленно и на прикладной уровень отправляется уведомление `error: true` (`"Incomplete telemetry segments were received"`).
* **Контроль таймаута последнего пакета:** фоновая задача каждые `0.2` с проверяет время последнего обновления буфера. Если недостающий сегмент завершающего кадра не поступил в течение `0.5` с, буфер закрывается с отправкой `error: true` на прикладной уровень.

## Переменные окружения

| Переменная | Назначение | Значение по умолчанию |
| :--- | :--- | :--- |
| `KAFKA_BOOTSTRAP_SERVERS` | Адрес брокера Apache Kafka | `kafka:9092` |
| `KAFKA_TOPIC` | Имя топика для сегментов телеметрии | `telemetry-segments` |
| `KAFKA_GROUP_ID` | Идентификатор consumer-группы | `transport-assembler-group` |
| `LOSS_PROBABILITY` | Вероятность отбрасывания сегмента (от `0.0` до `1.0`) | `0.02` |
| `APP_TELEMETRY_URL` | Адрес эндпоинта приёма телеметрии на прикладном уровне | `http://host.docker.internal:3000/api/v1/telemetry` |

## Запуск и сборка

### 1. Запуск в Docker (Production)

Соберите образ и запустите транспортный сервис вместе с Kafka из директории `transport-level/`:

```bash
docker compose build --no-cache
docker compose up -d
```

Для отправки собранной телеметрии на прикладной уровень, развёрнутый на другом узле (например, в сети ZeroTier), задайте переменную `APP_TELEMETRY_URL`:

```bash
APP_TELEMETRY_URL=http://<IP_ПРИКЛАДНОГО_УРОВНЯ>:3000/api/v1/telemetry docker compose up -d
```

### 2. Проверка работоспособности

Проверка статуса контейнеров, логов сборки сегментов и тестовой отправки сегмента:

```bash
docker compose ps
docker compose logs -f transport-service
```

Отправка тестового односегментного пакета через `curl`:

```bash
curl -X POST http://localhost:8001/api/v1/segments \
  -H "Content-Type: application/json" \
  -d '{
    "sentAt": "2026-11-21T01:00:00Z",
    "sender": "cnc-agent",
    "totalSegments": 1,
    "segmentNumber": 1,
    "payload": "eyJjb21tYW5kTmFtZSI6ImlkbGUiLCJwb3NpdGlvbiI6eyJ4IjowLCJ5IjowLCJ6IjowfSwiZmluaXNoZWQiOnRydWV9"
  }'
```
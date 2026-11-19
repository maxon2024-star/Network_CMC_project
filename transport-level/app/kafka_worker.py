import asyncio
import base64
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Set

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from app.config import settings
from app.models import SseTelemetryMessage

logger = logging.getLogger(__name__)


class TransportBrokerManager:
    """Управление очередью Kafka, буферизацией и сборкой сегментов."""

    def __init__(self) -> None:
        self.producer: AIOKafkaProducer | None = None
        self.sse_clients: Set[asyncio.Queue] = set()
        self.message_buffers: Dict[str, Dict[str, Any]] = {}
        self._tasks: list[asyncio.Task] = []
        self._running: bool = False

    async def start(self) -> None:
        """Инициализация издателя и запуск фоновых задач обработки."""
        self._running = True
        self.producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            linger_ms=0
        )
        await self.producer.start()

        self._tasks = [
            asyncio.create_task(self._consume_loop()),
            asyncio.create_task(self._aggregation_loop()),
        ]

    async def stop(self) -> None:
        """Остановка фоновых задач и закрытие соединений с брокером."""
        self._running = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

        if self.producer:
            await self.producer.stop()

    async def enqueue_segment(self, segment_data: dict, message_key: str) -> None:
        """Отправка сегмента в топик Kafka с ключом партиционирования."""
        if not self.producer:
            raise RuntimeError("Издатель Kafka не инициализирован")

        await self.producer.send_and_wait(
            settings.kafka_topic,
            value=segment_data,
            key=message_key.encode("utf-8"),
        )

    def register_client(self) -> asyncio.Queue:
        """Регистрация очереди нового SSE-подписчика."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self.sse_clients.add(queue)
        return queue

    def unregister_client(self, queue: asyncio.Queue) -> None:
        """Удаление очереди подписчика при разрыве соединения."""
        self.sse_clients.discard(queue)

    async def _broadcast(self, message: dict) -> None:
        """Рассылка сформированного сообщения всем активным SSE-клиентам."""
        for queue in list(self.sse_clients):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            await queue.put(message)

    async def _consume_loop(self) -> None:
        """Фоновое чтение сегментов из Kafka с автовосстановлением соединения."""
        while self._running:
            consumer = AIOKafkaConsumer(
                settings.kafka_topic,
                bootstrap_servers=settings.kafka_bootstrap_servers,
                group_id=settings.kafka_group_id,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                auto_offset_reset="latest",
                fetch_max_wait_ms=20,
            )
            try:
                await consumer.start()
                async for msg in consumer:
                    if not self._running:
                        break
                    if isinstance(msg.value, dict):
                        await self._store_segment(msg.value)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("Сбой чтения из Kafka: %s. Повтор подключения.", exc)
                await asyncio.sleep(2.0)
            finally:
                await consumer.stop()

    async def _store_segment(self, data: dict) -> None:
        """Сохранение сегмента в буфер и мгновенная отправка при полной сборке."""
        msg_id = data["sentAt"]
        total = data["totalSegments"]
        num = data["segmentNumber"]
        payload = data["payload"]

        if num > total:
            return

        if msg_id not in self.message_buffers:
            self.message_buffers[msg_id] = {
                "total": total,
                "segments": {},
                "cycles_missing": 0,
            }

        buf = self.message_buffers[msg_id]
        buf["segments"][num] = payload
        buf["cycles_missing"] = 0

        # Если все сегменты пакета получены — собираем и отправляем в SSE сразу
        if len(buf["segments"]) == total:
            self.message_buffers.pop(msg_id, None)
            now = datetime.now(timezone.utc).isoformat()
            try:
                payload_json = self._assemble_payload(buf["segments"])
                outgoing = SseTelemetryMessage(
                    timestamp=now,
                    error=False,
                    payload=payload_json,
                )
            except Exception:
                outgoing = SseTelemetryMessage(
                    timestamp=now,
                    error=True,
                    reason="Ошибка декодирования полезных данных сегментов",
                )

            await self._broadcast(outgoing.model_dump(exclude_none=True))

    def _assemble_payload(self, segments: Dict[int, str]) -> dict:
        """Декодирование сегментов из Base64 и сборка исходного JSON."""
        raw_chunks = []
        for idx in sorted(segments.keys()):
            raw_chunks.append(base64.b64decode(segments[idx]))

        combined_bytes = b"".join(raw_chunks)
        return json.loads(combined_bytes.decode("utf-8"))

    async def _aggregation_loop(self) -> None:
        """Периодическая проверка буферов на потерю сегментов по таймауту."""
        while self._running:
            try:
                await asyncio.sleep(settings.aggregation_interval_sec)
            except asyncio.CancelledError:
                break

            now = datetime.now(timezone.utc).isoformat()
            expired_ids = []

            for msg_id, buf in list(self.message_buffers.items()):
                if len(buf["segments"]) < buf["total"]:
                    buf["cycles_missing"] += 1
                    if buf["cycles_missing"] >= settings.max_missing_cycles:
                        error_msg = SseTelemetryMessage(
                            timestamp=now,
                            error=True,
                            reason="Incomplete telemetry segments were received",
                        )
                        await self._broadcast(error_msg.model_dump(exclude_none=True))
                        expired_ids.append(msg_id)

            for msg_id in expired_ids:
                self.message_buffers.pop(msg_id, None)


broker_manager = TransportBrokerManager()

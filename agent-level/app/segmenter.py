import base64
import json
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class TelemetrySegmenter:
    """Разбиение телеметрии на сегменты и отправка на транспортный уровень."""

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None
        # Расчет размера исходного блока байтов для укладки Base64 в лимит 256 байт
        self._raw_chunk_size: int = max(3, (settings.segment_max_bytes // 4) * 3)

    async def start(self) -> None:
        """Инициализация асинхронного HTTP-клиента."""
        self._client = httpx.AsyncClient(timeout=5.0)

    async def stop(self) -> None:
        """Закрытие соединений HTTP-клиента."""
        if self._client:
            await self._client.aclose()

    def build_segments(self, telemetry_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Сериализация телеметрии, нарезка на блоки и кодирование в Base64."""
        raw_bytes = json.dumps(telemetry_data, ensure_ascii=False).encode("utf-8")
        total_segments = max(1, math.ceil(len(raw_bytes) / self._raw_chunk_size))
        sent_at = datetime.now(timezone.utc).isoformat()

        segments: List[Dict[str, Any]] = []
        for index in range(total_segments):
            start_idx = index * self._raw_chunk_size
            end_idx = start_idx + self._raw_chunk_size
            chunk = raw_bytes[start_idx:end_idx]
            encoded_payload = base64.b64encode(chunk).decode("ascii")

            segments.append(
                {
                    "sentAt": sent_at,
                    "totalSegments": total_segments,
                    "segmentNumber": index + 1,
                    "payload": encoded_payload,
                }
            )

        return segments

    async def send_telemetry(self, telemetry_data: Dict[str, Any]) -> None:
        """Формирование сегментов и последовательная отправка HTTP-запросами."""
        if not self._client:
            return

        segments = self.build_segments(telemetry_data)
        for segment in segments:
            try:
                response = await self._client.post(settings.transport_url, json=segment)
                response.raise_for_status()
            except Exception as exc:
                logger.warning(
                    "Сбой отправки сегмента %s/%s: %s",
                    segment["segmentNumber"],
                    segment["totalSegments"],
                    exc,
                )


telemetry_segmenter = TelemetrySegmenter()

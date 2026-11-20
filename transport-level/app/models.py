from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class TransportSegment(BaseModel):
    """Модель входящего сегмента телеметрии."""

    sentAt: str = Field(..., description="Время отправки, идентификатор сообщения")
    totalSegments: int = Field(..., ge=1, description="Общее количество сегментов")
    segmentNumber: int = Field(..., ge=1, description="Порядковый номер сегмента")
    payload: str = Field(..., max_length=344, description="Данные сегмента в формате Base64")


class SegmentAcceptResponse(BaseModel):
    """Модель ответа при обработке входящего сегмента."""

    messageId: str
    segmentNumber: int
    queued: bool
    dropped: bool = False
    detail: str


class SseTelemetryMessage(BaseModel):
    """Модель исходящего сообщения для SSE-потока."""

    type: str = "telemetry"
    sender: str = "transport-level"
    timestamp: str
    error: bool
    payload: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None

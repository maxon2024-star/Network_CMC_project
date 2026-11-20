import asyncio
import json
import random
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.kafka_worker import broker_manager
from app.models import SegmentAcceptResponse, TransportSegment


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управление жизненным циклом подключений к Kafka."""
    await broker_manager.start()
    yield
    await broker_manager.stop()


app = FastAPI(
    title="Transport Level Service",
    lifespan=lifespan,
)


@app.post(
    "/api/v1/segments",
    response_model=SegmentAcceptResponse,
    responses={
        200: {"model": SegmentAcceptResponse},
        202: {"model": SegmentAcceptResponse},
    },
)
async def receive_segment(segment: TransportSegment):
    """Прием сегмента телеметрии, имитация потерь и запись в очередь."""
    if segment.segmentNumber > segment.totalSegments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Номер сегмента превышает общее количество сегментов",
        )

    # Имитация сетевых потерь перед постановкой в очередь
    if random.random() < settings.loss_probability:
        body = SegmentAcceptResponse(
            messageId=segment.sentAt,
            segmentNumber=segment.segmentNumber,
            queued=False,
            dropped=True,
            detail="Сегмент отброшен симулятором потерь",
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=body.model_dump(),
        )

    # Постановка уцелевшего сегмента в очередь Kafka
    try:
        await broker_manager.enqueue_segment(
            segment_data=segment.model_dump(),
            message_key=segment.sentAt,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка записи в очередь Kafka: {exc}",
        )

    body = SegmentAcceptResponse(
        messageId=segment.sentAt,
        segmentNumber=segment.segmentNumber,
        queued=True,
        dropped=False,
        detail="Сегмент принят в транспортную очередь",
    )
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content=body.model_dump(),
    )


@app.get("/api/v1/telemetry/stream")
async def telemetry_stream(username: str = "operator"):
    """Потоковая передача агрегированной телеметрии по протоколу SSE."""

    async def event_generator():
        queue = broker_manager.register_client()
        try:
            yield {
                "event": "ping",
                "data": json.dumps({"type": "ping"}),
            }
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=settings.ping_timeout)
                    yield {
                        "event": "telemetry",
                        "data": json.dumps(message, ensure_ascii=False),
                    }
                except asyncio.TimeoutError:
                    yield {
                        "event": "ping",
                        "data": json.dumps({"type": "ping"}),
                    }
        except asyncio.CancelledError:
            raise
        finally:
            broker_manager.unregister_client(queue)

    return EventSourceResponse(
        event_generator(),
        ping=10000,
    )

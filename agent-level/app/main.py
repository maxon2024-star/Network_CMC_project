import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status

from app.cnc_node import ros_runner
from app.models import (
    CommandAcceptResponse,
    CommandBatchMessage,
    CommandMessage,
)
from app.segmenter import telemetry_segmenter


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управление запуском и остановкой HTTP-клиента и узла ROS 2."""
    loop = asyncio.get_running_loop()
    await telemetry_segmenter.start()
    ros_runner.start(loop=loop)
    yield
    ros_runner.stop()
    await telemetry_segmenter.stop()


app = FastAPI(
    title="Agent Level Service (CNC Emulator)",
    lifespan=lifespan,
)


@app.post(
    "/api/v1/commands",
    response_model=CommandAcceptResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def receive_command(message: CommandMessage):
    """Прием одиночной команды управления от прикладного уровня."""
    if not ros_runner.node:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Узел ROS 2 не инициализирован",
        )

    queue_size = ros_runner.node.enqueue_operations([message.payload])
    return CommandAcceptResponse(
        status="accepted",
        queued_operations=queue_size,
        detail=f"Операция '{message.payload.operation}' добавлена в очередь станка",
    )


@app.post(
    "/api/v1/commands/batch",
    response_model=CommandAcceptResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def receive_command_batch(message: CommandBatchMessage):
    """Прием последовательности команд управления для выполнения в едином цикле."""
    if not ros_runner.node:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Узел ROS 2 не инициализирован",
        )

    queue_size = ros_runner.node.enqueue_operations(message.commands)
    return CommandAcceptResponse(
        status="accepted",
        queued_operations=queue_size,
        detail=f"Последовательность из {len(message.commands)} операций добавлена в очередь",
    )

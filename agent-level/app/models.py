from typing import List, Literal
from pydantic import BaseModel, Field


class Point2D(BaseModel):
    """Координаты точки на 2D-поверхности."""

    x: float = Field(..., description="Координата X")
    y: float = Field(..., description="Координата Y")


class CncOperation(BaseModel):
    """Параметры технологической операции станка с ЧПУ."""

    operation: Literal["drilling", "milling"] = Field(..., description="Тип операции: сверление или фрезеровка")
    start: Point2D = Field(..., description="Начальные координаты")
    end: Point2D = Field(..., description="Конечные координаты")
    depth: float = Field(..., gt=0, description="Глубина обработки")
    duration: float = Field(..., gt=0, description="Длительность выполнения в секундах")


class CommandMessage(BaseModel):
    """Входящее сообщение с командой управления от прикладного уровня."""

    sender: str = Field(..., description="Имя отправителя")
    timestamp: str = Field(..., description="Время отправки команды")
    payload: CncOperation = Field(..., description="Полезная нагрузка команды")


class CommandBatchMessage(BaseModel):
    """Пакет последовательных команд управления станком."""

    sender: str = Field(..., description="Имя отправителя")
    timestamp: str = Field(..., description="Время отправки пакета")
    commands: List[CncOperation] = Field(..., min_length=1, description="Список операций")


class CommandAcceptResponse(BaseModel):
    """Ответ о постановке команды в очередь исполнения станка."""

    status: str
    queued_operations: int
    detail: str


class CutterPosition(BaseModel):
    """Текущее положение резца в пространстве."""

    x: float
    y: float
    z: float


class TelemetryPayload(BaseModel):
    """Структура телеметрических данных станка."""

    commandName: str
    position: CutterPosition
    finished: bool

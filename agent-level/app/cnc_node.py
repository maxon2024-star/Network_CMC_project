import asyncio
import json
import logging
import math
import threading
import time
from collections import deque
from typing import Deque, List, Optional

import rclpy
from rclpy.executors import SingleThreadedExecutor
from rclpy.node import Node
from std_msgs.msg import String

from app.config import settings
from app.models import CncOperation, CutterPosition, TelemetryPayload
from app.segmenter import telemetry_segmenter

logger = logging.getLogger(__name__)


IDLE_XY_SPEED: float = 20.0
IDLE_Z_SPEED: float = 10.0
KINEMATICS_INTERVAL: float = 0.05    # Обновление состояния с частотой 20 Гц
POS_PRECISION: int = 3


class CncMachineNode(Node):
    """Узел ROS 2 для эмуляции работы станка с ЧПУ на 2D-поверхности."""

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        super().__init__("cnc_machine_node")
        self._loop = loop
        self._lock = threading.Lock()
        self._operation_queue: Deque[CncOperation] = deque()

        # Исходное положение резца
        self._home_x: float = 0.0
        self._home_y: float = 0.0
        self._home_z: float = 0.0

        # Текущие координаты и статус станка
        self._pos_x: float = self._home_x
        self._pos_y: float = self._home_y
        self._pos_z: float = self._home_z
        self._phase: str = "idle"
        self._current_command: str = "idle"
        self._finished: bool = True
        self._final_report_pending: bool = False

        # Параметры текущей операции и таймингов
        self._active_op: Optional[CncOperation] = None
        self._op_start_time: float = 0.0
        self._last_tick: float = time.monotonic()

        # Издатель телеметрии в топик ROS 2
        self._telemetry_pub = self.create_publisher(String, "/cnc/telemetry", 10)

        # Таймер обновления кинематики и таймер публикации телеметрии
        self._kinematics_timer = self.create_timer(KINEMATICS_INTERVAL, self._update_kinematics)
        self._telemetry_timer = self.create_timer(
            settings.telemetry_interval_sec, self._publish_telemetry
        )

    def enqueue_operations(self, operations: List[CncOperation]) -> int:
        """Добавление последовательности операций в очередь станка."""
        with self._lock:
            for op in operations:
                self._operation_queue.append(op)
            return len(self._operation_queue)

    def _move_z_towards(self, target_z: float, dt: float) -> bool:
        """Линейное перемещение резца по вертикали с заданной скоростью."""
        dz = target_z - self._pos_z
        max_step = IDLE_Z_SPEED * dt
        if abs(dz) <= max_step:
            self._pos_z = round(target_z, POS_PRECISION)
            return True
        self._pos_z = round(self._pos_z + math.copysign(max_step, dz), POS_PRECISION)
        return False

    def _move_xy_towards(self, target_x: float, target_y: float, dt: float) -> bool:
        """Линейное перемещение резца по плоскости (X, Y) с заданной скоростью."""
        dx = target_x - self._pos_x
        dy = target_y - self._pos_y
        dist = math.hypot(dx, dy)
        max_step = IDLE_XY_SPEED * dt
        if dist <= max_step or dist == 0.0:
            self._pos_x = round(target_x, POS_PRECISION)
            self._pos_y = round(target_y, POS_PRECISION)
            return True
        ratio = max_step / dist
        self._pos_x = round(self._pos_x + dx * ratio, POS_PRECISION)
        self._pos_y = round(self._pos_y + dy * ratio, POS_PRECISION)
        return False

    def _update_kinematics(self) -> None:
        """Расчет траектории и координат резца на каждом шаге симуляции."""
        now = time.monotonic()
        dt = max(0.0, now - self._last_tick)
        self._last_tick = now
        should_publish_now = False

        with self._lock:
            # 1. Режим ожидания или прерывание возврата домой при появлении новой команды
            if self._phase in ("idle", "return_retract", "return_home") and self._operation_queue:
                self._active_op = self._operation_queue.popleft()
                self._finished = False
                self._phase = "retract"

            if self._phase == "idle":
                return

            # 2. Подъем резца на базовую высоту Z = 0.0 перед переездом к следующей точке
            if self._phase == "retract" and self._active_op is not None:
                self._current_command = "retract"
                if self._move_z_towards(self._home_z, dt):
                    self._phase = "positioning"
                else:
                    return

            # 3. Перемещение по плоскости (X, Y) на базовой высоте к старту операции
            if self._phase == "positioning" and self._active_op is not None:
                self._current_command = "positioning"
                if self._move_xy_towards(self._active_op.start.x, self._active_op.start.y, dt):
                    if self._active_op.operation == "milling":
                        self._phase = "plunge"
                    else:
                        self._phase = "executing"
                        self._op_start_time = now
                else:
                    return

            # 4. Отдельное опускание резца на рабочую глубину перед фрезеровкой
            if self._phase == "plunge" and self._active_op is not None:
                self._current_command = "plunge"
                if self._move_z_towards(-self._active_op.depth, dt):
                    self._phase = "executing"
                    self._op_start_time = now
                else:
                    return

            # 5. Выполнение технологической операции (сверление или фрезеровка)
            if self._phase == "executing" and self._active_op is not None:
                self._current_command = self._active_op.operation
                elapsed = now - self._op_start_time
                progress = min(1.0, elapsed / self._active_op.duration)

                if self._active_op.operation == "drilling":
                    self._pos_x = self._active_op.start.x
                    self._pos_y = self._active_op.start.y
                    self._pos_z = -round(self._active_op.depth * progress, POS_PRECISION)
                elif self._active_op.operation == "milling":
                    self._pos_x = round(
                        self._active_op.start.x
                        + (self._active_op.end.x - self._active_op.start.x) * progress,
                        POS_PRECISION,
                    )
                    self._pos_y = round(
                        self._active_op.start.y
                        + (self._active_op.end.y - self._active_op.start.y) * progress,
                        POS_PRECISION,
                    )
                    self._pos_z = -round(self._active_op.depth, POS_PRECISION)

                if progress >= 1.0:
                    self._active_op = None
                    if self._operation_queue:
                        # Переход к следующей операции в очереди через подъем и переезд
                        self._active_op = self._operation_queue.popleft()
                        self._phase = "retract"
                    else:
                        # Очередь пуста — начало цикла возврата в начальную точку
                        self._phase = "return_retract"
                return

            # 6. Подъем резца на базовую высоту перед возвратом домой
            if self._phase == "return_retract":
                self._current_command = "return_home"
                if self._move_z_towards(self._home_z, dt):
                    self._phase = "return_home"
                else:
                    return

            # 7. Возврат в начальное положение (0, 0) на базовой высоте Z = 0.0
            if self._phase == "return_home":
                self._current_command = "return_home"
                if self._move_xy_towards(self._home_x, self._home_y, dt):
                    self._phase = "idle"
                    self._current_command = "idle"
                    self._finished = True
                    self._final_report_pending = True
                    should_publish_now = True
                else:
                    return

        if should_publish_now: self._publish_telemetry()

    def _publish_telemetry(self) -> None:
        """Публикация телеметрии в топик ROS 2 и запуск отправки на транспортный уровень."""
        with self._lock:
            if self._phase == "idle" and self._finished and not self._final_report_pending:
                return

            self._final_report_pending = False

            payload = TelemetryPayload(
                commandName=self._current_command,
                position=CutterPosition(x=self._pos_x, y=self._pos_y, z=self._pos_z),
                finished=self._finished,
            )

        payload_dict = payload.model_dump()

        # Публикация во внутренний топик ROS 2
        ros_msg = String()
        ros_msg.data = json.dumps(payload_dict, ensure_ascii=False)
        self._telemetry_pub.publish(ros_msg)

        # Передача задачи сегментации и HTTP-отправки в цикл событий FastAPI
        asyncio.run_coroutine_threadsafe(
            telemetry_segmenter.send_telemetry(payload_dict),
            self._loop,
        )


class RosAgentRunner:
    """Управление жизненным циклом узла ROS 2 в фоновом потоке."""

    def __init__(self) -> None:
        self.node: Optional[CncMachineNode] = None
        self._executor: Optional[SingleThreadedExecutor] = None
        self._thread: Optional[threading.Thread] = None

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """Инициализация контекста rclpy и запуск исполнителя узла."""
        rclpy.init()
        self.node = CncMachineNode(loop=loop)
        self._executor = SingleThreadedExecutor()
        self._executor.add_node(self.node)

        self._thread = threading.Thread(target=self._spin, daemon=True)
        self._thread.start()

    def _spin(self) -> None:
        """Цикл обработки событий и таймеров ROS 2."""
        if self._executor:
            try:
                self._executor.spin()
            except Exception as exc:
                logger.error("Остановка цикла ROS 2: %s", exc)

    def stop(self) -> None:
        """Завершение работы узла и освобождение ресурсов rclpy."""
        if self._executor:
            self._executor.shutdown()
        if self.node:
            self.node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


ros_runner = RosAgentRunner()

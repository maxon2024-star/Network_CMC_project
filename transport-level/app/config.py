from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Параметры конфигурации транспортного сервиса."""

    port: int = 8001
    kafka_bootstrap_servers: str = "kafka:29092"
    kafka_topic: str = "telemetry-segments"
    kafka_group_id: str = "transport-aggregator-group"
    loss_probability: float = 0.02
    aggregation_interval_sec: int = 5
    max_missing_cycles: int = 3

    class Config:
        env_file = ".env"


settings = Settings()

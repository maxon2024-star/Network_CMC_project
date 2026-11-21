from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Параметры конфигурации транспортного сервиса."""

    port: int = 8001
    kafka_bootstrap_servers: str = "kafka:29092"
    kafka_topic: str = "telemetry-segments"
    kafka_group_id: str = "transport-aggregator-group"
    loss_probability: float = 0.02
    aggregation_interval_sec: float = 0.2
    segment_timeout_sec: float = 0.5
    app_telemetry_url: str = "http://host.docker.internal:3000/api/v1/telemetry"

    class Config:
        env_file = ".env"


settings = Settings()

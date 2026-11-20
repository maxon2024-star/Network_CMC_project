from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Параметры конфигурации агентного сервиса."""

    port: int = 8002
    transport_url: str = "http://host.docker.internal:8001/api/v1/segments"
    segment_max_bytes: int = 64
    telemetry_interval_sec: float = 0.5
    ros_domain_id: int = 52

    class Config:
        env_file = ".env"


settings = Settings()

from dataclasses import dataclass
from typing import ClassVar


@dataclass(frozen=True)
class Settings:
    app_name: str = "hotel-management-backend"
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://hotel:hotelpass@localhost:5432/hotel_db"
    redis_url: str = "redis://localhost:6379/0"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60
    timezone: str = "UTC"
    currency: str = "KES"


settings = Settings()

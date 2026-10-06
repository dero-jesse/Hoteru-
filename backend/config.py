import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    app_name: str = "hotel-management-backend"
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    database_url: str = "postgresql+psycopg://hotel:hotelpass@localhost:5432/hotel_db"
    redis_url: str = "redis://localhost:6379/0"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", "dev-secret-change-me"))
    jwt_algorithm: str = field(default_factory=lambda: os.getenv("JWT_ALGORITHM", "HS256"))
    jwt_expires_minutes: int = field(default_factory=lambda: int(os.getenv("JWT_EXPIRES_MINUTES", "60")))
    timezone: str = field(default_factory=lambda: os.getenv("APP_TIMEZONE", "Africa/Kampala"))
    currency: str = field(default_factory=lambda: os.getenv("APP_CURRENCY", "UGX"))
    vat_rate: float = field(default_factory=lambda: float(os.getenv("VAT_RATE", "0.18")))

    def __post_init__(self) -> None:
        if self.jwt_algorithm != "HS256":
            raise ValueError("Only HS256 JWT signing is supported")
        if self.jwt_expires_minutes <= 0:
            raise ValueError("JWT_EXPIRES_MINUTES must be positive")
        if not 0 <= self.vat_rate <= 1:
            raise ValueError("VAT_RATE must be between 0 and 1")
        if self.app_env != "development" and self.jwt_secret == "dev-secret-change-me":
            raise ValueError("Set a strong JWT_SECRET outside development")


settings = Settings()

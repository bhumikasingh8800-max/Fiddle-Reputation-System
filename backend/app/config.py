"""
Application configuration using Pydantic Settings.
Reads from environment variables or .env file.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "First Fiddle Reputation Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    # Database
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/firstfiddle"


    # Gemini LLM
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.6-flash"

    # Scraping
    SCRAPE_DELAY: float = 2.0
    

    # NLP Models
    SENTIMENT_MODEL: str = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    USE_GPU: bool = False

    # Auth
    # IMPORTANT: override JWT_SECRET_KEY via .env in any real deployment —
    # this default is fine for local dev only.
    JWT_SECRET_KEY: str = "dev-only-change-me-via-env"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
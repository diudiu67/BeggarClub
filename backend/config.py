from pathlib import Path
from pydantic_settings import BaseSettings

# Always resolve .env from the project root (one level up from backend/)
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    DISCORD_TOKEN: str = ""
    YOUTUBE_API_KEY: str = ""
    WEB_SECRET: str = "changeme"
    DATABASE_URL: str = "sqlite+aiosqlite:///./music.db"
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"


settings = Settings()

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
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_PUBLIC_URL: str = ""
    GALLERY_CHANNEL_IDS: str = ""

    @property
    def gallery_channel_ids(self) -> list[int]:
        if not self.GALLERY_CHANNEL_IDS:
            return []
        return [int(c.strip()) for c in self.GALLERY_CHANNEL_IDS.split(",") if c.strip().isdigit()]

    class Config:
        env_file = str(_ENV_FILE)
        extra = "ignore"


settings = Settings()

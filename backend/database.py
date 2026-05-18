from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from models import Base
from config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migrate: safely add new columns to existing tables
        for sql in [
            "ALTER TABLE playlists ADD COLUMN icon VARCHAR DEFAULT '🎵'",
            "ALTER TABLE playlists ADD COLUMN color VARCHAR DEFAULT 'red'",
        ]:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass  # column already exists — safe to ignore


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

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
        # Migrate: safely add new columns to existing tables (idempotent)
        for sql in [
            "ALTER TABLE playlists ADD COLUMN icon VARCHAR DEFAULT '🎵'",
            "ALTER TABLE playlists ADD COLUMN color VARCHAR DEFAULT 'red'",
            "ALTER TABLE gallery_items ADD COLUMN channel_id TEXT DEFAULT ''",
            "ALTER TABLE gallery_items ADD COLUMN starred INTEGER DEFAULT 0",
            "ALTER TABLE strategy_posts ADD COLUMN pinned INTEGER DEFAULT 0",
            "ALTER TABLE strategy_posts ADD COLUMN source TEXT DEFAULT 'discord'",
            # Round 12 backfill: admin-created posts predate the `source` column and
            # got defaulted to 'discord' by the migration above. The `admin-` prefix is
            # set only by routes/strategy.py:create_strategy_post, so it uniquely
            # identifies web-created rows whose Discord dispatch never completed.
            "UPDATE strategy_posts SET source = 'web' "
            "WHERE message_id LIKE 'admin-%' AND (source IS NULL OR source = 'discord')",
        ]:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass  # column already exists — safe to ignore


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

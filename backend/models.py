from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    guild_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    icon = Column(String, default="🎵")
    color = Column(String, default="red")
    created_at = Column(DateTime, default=datetime.utcnow)

    songs = relationship("PlaylistSong", back_populates="playlist", cascade="all, delete-orphan", order_by="PlaylistSong.position")


class PlaylistSong(Base):
    __tablename__ = "playlist_songs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id"), nullable=False)
    video_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    artist = Column(String, default="")
    thumbnail = Column(String, default="")
    duration = Column(Integer, default=0)
    position = Column(Integer, default=0)
    added_at = Column(DateTime, default=datetime.utcnow)

    playlist = relationship("Playlist", back_populates="songs")


class Setting(Base):
    """Key/value store for runtime-toggleable bot config."""
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False, default="")


class GalleryItem(Base):
    __tablename__ = "gallery_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    r2_key = Column(String, nullable=False)
    public_url = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    media_type = Column(String, nullable=False)   # 'image' or 'video'
    uploader = Column(String, nullable=False, default="")
    caption = Column(String, default="")
    source = Column(String, nullable=False, default="web")  # 'discord' or 'web'
    channel_name = Column(String, default="")
    channel_id = Column(String, default="")       # added v2
    starred = Column(Boolean, default=False)      # added v2
    guild_id = Column(String, default="", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ─── Polls ───────────────────────────────────────────────────────────────────

class Poll(Base):
    __tablename__ = "polls"

    id = Column(Integer, primary_key=True, autoincrement=True)
    guild_id = Column(String, nullable=False, index=True)
    channel_id = Column(String, nullable=False, default="")
    message_id = Column(String, nullable=True)          # set after bot posts
    question = Column(String, nullable=False)
    options = Column(String, nullable=False)            # JSON list[str]
    poll_type = Column(String, nullable=False, default="native")  # "native" | "reaction"
    duration_seconds = Column(Integer, nullable=False, default=86400)
    multi_select = Column(Boolean, default=False)       # native only
    anonymous = Column(Boolean, default=False)          # reaction only
    scheduled_for = Column(DateTime, nullable=True)     # None = post immediately
    dispatched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    ends_at = Column(DateTime, nullable=True)           # set after dispatch
    ended_at = Column(DateTime, nullable=True)
    final_results = Column(String, nullable=True)       # JSON {str(idx): count}

    votes = relationship("PollVote", back_populates="poll", cascade="all, delete-orphan")


class PollVote(Base):
    """Tracks individual votes for reaction-type polls."""
    __tablename__ = "poll_votes"

    poll_id = Column(Integer, ForeignKey("polls.id"), primary_key=True)
    user_id = Column(String, primary_key=True)          # composite PK enforces single-vote
    option_index = Column(Integer, nullable=False)

    poll = relationship("Poll", back_populates="votes")


# ─── Birthdays ───────────────────────────────────────────────────────────────

class Birthday(Base):
    __tablename__ = "birthdays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    guild_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False)
    display_name = Column(String, nullable=False, default="")
    birth_month = Column(Integer, nullable=False)   # 1–12
    birth_day = Column(Integer, nullable=False)     # 1–31


# ─── Reminders ───────────────────────────────────────────────────────────────

class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    guild_id = Column(String, nullable=False, index=True)
    channel_id = Column(String, nullable=False, default="")
    text = Column(String, nullable=False)
    recurrence = Column(String, nullable=True)     # None=one-off | "daily:HH:MM" | "weekly:WD:HH:MM" | "monthly:D:HH:MM"
    next_run_at = Column(DateTime, nullable=False)
    last_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    active = Column(Boolean, default=True)


# ─── Strategy Posts ──────────────────────────────────────────────────────────

class StrategyPost(Base):
    __tablename__ = "strategy_posts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    guild_id = Column(String, nullable=False, index=True)
    message_id = Column(String, nullable=False, unique=True)  # Discord snowflake or "admin-{uuid}"
    category = Column(String, nullable=False, default="strategy")  # "strategy" | "guildwar"
    author_name = Column(String, nullable=False, default="")
    author_avatar = Column(String, default="")          # Discord CDN URL
    content = Column(String, default="")                # message text
    media = Column(String, default="[]")                # JSON list[{public_url, r2_key, media_type}]
    position = Column(Integer, default=0)               # manual sort; lower = higher on page
    message_url = Column(String, default="")            # discord.com link (empty for admin-created)
    created_at = Column(DateTime, default=datetime.utcnow)
    pinned = Column(Boolean, default=False)             # pinned posts appear on strategy homepage

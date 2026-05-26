"""
Polls API — admin-gated endpoints for creating and managing Discord polls.
Supports both native Discord polls and custom reaction-embed polls.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, AsyncSessionLocal
from models import Poll, PollVote
from routes.admin import require_admin

router = APIRouter(prefix="/api/admin/polls", tags=["polls"])

# Discord native poll only accepts these exact hour values
_DISCORD_ALLOWED_HOURS = [1, 4, 8, 24, 72, 168, 336]


def _snap_to_discord_hours(seconds: int) -> int:
    """Snap duration_seconds to nearest Discord-allowed poll duration in hours."""
    hours = seconds / 3600
    closest = min(_DISCORD_ALLOWED_HOURS, key=lambda h: abs(h - hours))
    return closest * 3600


def _poll_to_dict(poll: Poll, tallies: dict | None = None) -> dict:
    return {
        "id": poll.id,
        "guild_id": poll.guild_id,
        "channel_id": poll.channel_id,
        "message_id": poll.message_id,
        "question": poll.question,
        "options": json.loads(poll.options) if poll.options else [],
        "poll_type": poll.poll_type,
        "duration_seconds": poll.duration_seconds,
        "multi_select": poll.multi_select,
        "anonymous": poll.anonymous,
        "scheduled_for": poll.scheduled_for.isoformat() if poll.scheduled_for else None,
        "dispatched_at": poll.dispatched_at.isoformat() if poll.dispatched_at else None,
        "created_at": poll.created_at.isoformat() if poll.created_at else None,
        "ends_at": poll.ends_at.isoformat() if poll.ends_at else None,
        "ended_at": poll.ended_at.isoformat() if poll.ended_at else None,
        "final_results": json.loads(poll.final_results) if poll.final_results else None,
        "tallies": tallies,
        "status": _poll_status(poll),
    }


def _poll_status(poll: Poll) -> str:
    if poll.ended_at:
        return "ended"
    if poll.dispatched_at is None:
        return "scheduled"
    return "active"


async def _get_reaction_tallies(poll_id: int, options: list[str]) -> dict:
    """Return {option_index: count} for a reaction poll."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PollVote).where(PollVote.poll_id == poll_id)
        )
        votes = result.scalars().all()
    tallies = {str(i): 0 for i in range(len(options))}
    for vote in votes:
        tallies[str(vote.option_index)] = tallies.get(str(vote.option_index), 0) + 1
    return tallies


# ─── Request models ──────────────────────────────────────────────────────────

class CreatePollRequest(BaseModel):
    guild_id: str
    channel_id: str
    question: str
    options: list[str]           # 2–10 items
    poll_type: str = "native"    # "native" | "reaction"
    duration_seconds: int = 86400
    multi_select: bool = False
    anonymous: bool = False
    scheduled_for: Optional[str] = None  # ISO datetime string or None


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(require_admin)])
async def list_polls(
    guild_id: str = "",
    status: str = "all",         # active | scheduled | ended | all
    db: AsyncSession = Depends(get_db),
):
    q = select(Poll).order_by(desc(Poll.created_at))
    if guild_id:
        q = q.where(Poll.guild_id == guild_id)
    result = await db.execute(q)
    polls = result.scalars().all()

    out = []
    for p in polls:
        ps = _poll_status(p)
        if status != "all" and ps != status:
            continue
        tallies = None
        if ps == "active" and p.poll_type == "reaction":
            tallies = await _get_reaction_tallies(p.id, json.loads(p.options))
        out.append(_poll_to_dict(p, tallies))
    return out


@router.post("", dependencies=[Depends(require_admin)])
async def create_poll(body: CreatePollRequest, db: AsyncSession = Depends(get_db)):
    if not 2 <= len(body.options) <= 10:
        raise HTTPException(400, "Polls must have 2–10 options")
    if any(len(o) > 55 for o in body.options):
        raise HTTPException(400, "Each option must be ≤55 characters")

    scheduled_for = None
    if body.scheduled_for:
        try:
            scheduled_for = datetime.fromisoformat(body.scheduled_for)
            # If naive, treat as UTC
            if scheduled_for.tzinfo is None:
                scheduled_for = scheduled_for.replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "Invalid scheduled_for datetime format")

    # Snap native poll duration
    duration = body.duration_seconds
    if body.poll_type == "native":
        duration = _snap_to_discord_hours(duration)

    poll = Poll(
        guild_id=body.guild_id,
        channel_id=body.channel_id,
        question=body.question,
        options=json.dumps(body.options),
        poll_type=body.poll_type,
        duration_seconds=duration,
        multi_select=body.multi_select,
        anonymous=body.anonymous,
        scheduled_for=scheduled_for,
        created_at=datetime.now(timezone.utc),
    )
    db.add(poll)
    await db.commit()
    await db.refresh(poll)

    # Dispatch immediately if not scheduled
    if scheduled_for is None:
        import bot_runner
        bot_runner.fire_in_fastapi(_dispatch_poll_now(poll.id))

    return _poll_to_dict(poll)


@router.get("/{poll_id}", dependencies=[Depends(require_admin)])
async def get_poll(poll_id: int, db: AsyncSession = Depends(get_db)):
    poll = await db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(404, "Poll not found")
    tallies = None
    if _poll_status(poll) == "active" and poll.poll_type == "reaction":
        tallies = await _get_reaction_tallies(poll.id, json.loads(poll.options))
    return _poll_to_dict(poll, tallies)


@router.post("/{poll_id}/end", dependencies=[Depends(require_admin)])
async def end_poll(poll_id: int, db: AsyncSession = Depends(get_db)):
    poll = await db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(404, "Poll not found")
    if poll.ended_at:
        raise HTTPException(400, "Poll is already ended")

    import bot_runner
    bot_runner.fire_in_fastapi(_end_poll_now(poll_id))
    return {"ok": True}


@router.delete("/{poll_id}", dependencies=[Depends(require_admin)])
async def delete_poll(poll_id: int, db: AsyncSession = Depends(get_db)):
    poll = await db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(404, "Poll not found")

    message_id = poll.message_id
    channel_id = poll.channel_id

    await db.delete(poll)
    await db.commit()

    # Best-effort Discord message delete
    if message_id and channel_id:
        import bot_runner
        bot_runner.fire_in_fastapi(_delete_discord_poll_message(channel_id, message_id))

    return {"ok": True}


# ─── Async helpers (run on bot's event loop via fire_in_fastapi) ──────────────

async def _dispatch_poll_now(poll_id: int):
    """Called immediately after creation or by the scheduler for scheduled polls."""
    from bot import _send_native_poll, _send_reaction_poll
    async with AsyncSessionLocal() as db:
        poll = await db.get(Poll, poll_id)
        if not poll or poll.dispatched_at:
            return
        await _send_poll(poll, db)


async def _send_poll(poll: Poll, db):
    """Route to the correct sender based on poll_type. Updates DB with message_id + times."""
    from bot import bot, _send_native_poll, _send_reaction_poll
    channel = bot.get_channel(int(poll.channel_id))
    if not channel:
        print(f"[Polls] Channel {poll.channel_id} not found for poll {poll.id}")
        return

    now = datetime.now(timezone.utc)
    try:
        if poll.poll_type == "native":
            message_id = await _send_native_poll(channel, poll)
        else:
            message_id = await _send_reaction_poll(channel, poll)

        ends_at = now + timedelta(seconds=poll.duration_seconds)
        poll.message_id = str(message_id)
        poll.dispatched_at = now
        poll.ends_at = ends_at
        await db.commit()
    except Exception as e:
        print(f"[Polls] Failed to dispatch poll {poll.id}: {e}")


async def _end_poll_now(poll_id: int):
    """End a poll, save final results, post a summary reply."""
    from bot import bot, _finalize_poll
    async with AsyncSessionLocal() as db:
        poll = await db.get(Poll, poll_id)
        if not poll or poll.ended_at:
            return
        await _finalize_poll(poll, db, bot)


async def _delete_discord_poll_message(channel_id: str, message_id: str):
    from bot import bot
    try:
        channel = bot.get_channel(int(channel_id))
        if channel:
            msg = await channel.fetch_message(int(message_id))
            await msg.delete()
    except Exception as e:
        print(f"[Polls] Could not delete message {message_id}: {e}")

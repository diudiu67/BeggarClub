"""
Reminders API — admin-managed one-off and recurring channel reminders.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Reminder
from routes.admin import require_admin

router = APIRouter(prefix="/api/admin/reminders", tags=["reminders"])


# ─── Recurrence helpers ──────────────────────────────────────────────────────

def _parse_recurrence_time(time_str: str) -> tuple[int, int]:
    """Parse 'HH:MM' → (hour, minute)."""
    parts = time_str.split(":")
    return int(parts[0]), int(parts[1])


def _compute_next_run(recurrence: str | None, scheduled_for: datetime | None) -> datetime:
    """Compute next_run_at for a new reminder."""
    if recurrence is None:
        if scheduled_for is None:
            raise ValueError("scheduled_for is required for one-off reminders")
        return scheduled_for

    now = datetime.now(timezone.utc)

    if recurrence.startswith("daily:"):
        # "daily:HH:MM"
        time_part = recurrence.split(":", 1)[1]
        h, m = _parse_recurrence_time(time_part)
        candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    if recurrence.startswith("weekly:"):
        # "weekly:WD:HH:MM"  WD=0(Mon)..6(Sun)
        _, wd_str, time_part = recurrence.split(":", 2)
        weekday = int(wd_str)
        h, m = _parse_recurrence_time(time_part)
        candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
        days_ahead = (weekday - candidate.weekday()) % 7
        candidate += timedelta(days=days_ahead)
        if candidate <= now:
            candidate += timedelta(weeks=1)
        return candidate

    if recurrence.startswith("monthly:"):
        # "monthly:D:HH:MM"  D=1..28
        _, day_str, time_part = recurrence.split(":", 2)
        day = int(day_str)
        h, m = _parse_recurrence_time(time_part)
        candidate = now.replace(day=day, hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now:
            if candidate.month == 12:
                candidate = candidate.replace(year=candidate.year + 1, month=1)
            else:
                candidate = candidate.replace(month=candidate.month + 1)
        return candidate

    raise ValueError(f"Unknown recurrence format: {recurrence}")


def _advance_next_run(recurrence: str, last: datetime) -> datetime:
    """Compute the next_run_at after a recurring reminder fires."""
    if recurrence.startswith("daily:"):
        return last + timedelta(days=1)
    if recurrence.startswith("weekly:"):
        return last + timedelta(weeks=1)
    if recurrence.startswith("monthly:"):
        _, day_str, time_part = recurrence.split(":", 2)
        day = int(day_str)
        if last.month == 12:
            return last.replace(year=last.year + 1, month=1, day=day)
        return last.replace(month=last.month + 1, day=day)
    return last + timedelta(days=1)  # fallback


def _reminder_to_dict(r: Reminder) -> dict:
    return {
        "id": r.id,
        "guild_id": r.guild_id,
        "channel_id": r.channel_id,
        "text": r.text,
        "recurrence": r.recurrence,
        "next_run_at": r.next_run_at.isoformat() if r.next_run_at else None,
        "last_run_at": r.last_run_at.isoformat() if r.last_run_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "active": r.active,
        "is_recurring": r.recurrence is not None,
    }


# ─── Request models ──────────────────────────────────────────────────────────

class CreateReminderRequest(BaseModel):
    guild_id: str
    channel_id: str
    text: str
    recurrence: Optional[str] = None        # None = one-off
    scheduled_for: Optional[str] = None     # ISO datetime, required if recurrence is None


class UpdateReminderRequest(BaseModel):
    channel_id: Optional[str] = None
    text: Optional[str] = None
    recurrence: Optional[str] = None
    scheduled_for: Optional[str] = None


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(require_admin)])
async def list_reminders(guild_id: str = "", db: AsyncSession = Depends(get_db)):
    q = select(Reminder).order_by(Reminder.next_run_at)
    if guild_id:
        q = q.where(Reminder.guild_id == guild_id)
    result = await db.execute(q)
    return [_reminder_to_dict(r) for r in result.scalars().all()]


@router.post("", dependencies=[Depends(require_admin)])
async def create_reminder(body: CreateReminderRequest, db: AsyncSession = Depends(get_db)):
    if not body.text.strip():
        raise HTTPException(400, "Reminder text cannot be empty")

    scheduled_for = None
    if body.scheduled_for:
        try:
            scheduled_for = datetime.fromisoformat(body.scheduled_for)
            if scheduled_for.tzinfo is None:
                scheduled_for = scheduled_for.replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "Invalid scheduled_for format")

    try:
        next_run = _compute_next_run(body.recurrence, scheduled_for)
    except ValueError as e:
        raise HTTPException(400, str(e))

    reminder = Reminder(
        guild_id=body.guild_id,
        channel_id=body.channel_id,
        text=body.text,
        recurrence=body.recurrence,
        next_run_at=next_run,
        created_at=datetime.now(timezone.utc),
        active=True,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return _reminder_to_dict(reminder)


@router.put("/{reminder_id}", dependencies=[Depends(require_admin)])
async def update_reminder(
    reminder_id: int,
    body: UpdateReminderRequest,
    db: AsyncSession = Depends(get_db),
):
    r = await db.get(Reminder, reminder_id)
    if not r:
        raise HTTPException(404, "Reminder not found")
    if body.channel_id is not None:
        r.channel_id = body.channel_id
    if body.text is not None:
        r.text = body.text
    if body.recurrence is not None or body.scheduled_for is not None:
        rec = body.recurrence if body.recurrence is not None else r.recurrence
        sf = None
        if body.scheduled_for:
            sf = datetime.fromisoformat(body.scheduled_for)
            if sf.tzinfo is None:
                sf = sf.replace(tzinfo=timezone.utc)
        r.recurrence = rec
        try:
            r.next_run_at = _compute_next_run(rec, sf)
        except ValueError as e:
            raise HTTPException(400, str(e))
    await db.commit()
    await db.refresh(r)
    return _reminder_to_dict(r)


@router.patch("/{reminder_id}/toggle", dependencies=[Depends(require_admin)])
async def toggle_reminder(reminder_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.get(Reminder, reminder_id)
    if not r:
        raise HTTPException(404, "Reminder not found")
    r.active = not r.active
    await db.commit()
    return _reminder_to_dict(r)


@router.delete("/{reminder_id}", dependencies=[Depends(require_admin)])
async def delete_reminder(reminder_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.get(Reminder, reminder_id)
    if not r:
        raise HTTPException(404, "Reminder not found")
    await db.delete(r)
    await db.commit()
    return {"ok": True}

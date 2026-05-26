"""
Birthdays API — admin-managed birthday tracking and announcement config.
No slash commands; admin registers entries via the admin dashboard.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Birthday, Setting
from routes.admin import require_admin, _get_setting, _set_setting

router = APIRouter(prefix="/api/admin/birthdays", tags=["birthdays"])

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _days_until_birthday(month: int, day: int) -> int:
    today = date.today()
    this_year = date(today.year, month, day)
    if this_year < today:
        next_bday = date(today.year + 1, month, day)
    else:
        next_bday = this_year
    return (next_bday - today).days


def _birthday_to_dict(b: Birthday) -> dict:
    days = _days_until_birthday(b.birth_month, b.birth_day)
    today = date.today()
    try:
        this_year_date = date(today.year, b.birth_month, b.birth_day)
        if this_year_date < today:
            next_bday = date(today.year + 1, b.birth_month, b.birth_day)
        else:
            next_bday = this_year_date
    except ValueError:
        next_bday = None

    return {
        "id": b.id,
        "guild_id": b.guild_id,
        "user_id": b.user_id,
        "display_name": b.display_name,
        "birth_month": b.birth_month,
        "birth_day": b.birth_day,
        "next_birthday": next_bday.isoformat() if next_bday else None,
        "days_until": days,
    }


# ─── Request models ──────────────────────────────────────────────────────────

class AddBirthdayRequest(BaseModel):
    guild_id: str
    user_id: str
    display_name: str
    birth_month: int   # 1–12
    birth_day: int     # 1–31


class UpdateBirthdayRequest(BaseModel):
    display_name: Optional[str] = None
    birth_month: Optional[int] = None
    birth_day: Optional[int] = None


class BirthdayConfigRequest(BaseModel):
    guild_id: str
    channel_id: str
    post_hour: int = 9        # 0–23
    message_template: str = "🎂 Happy birthday, {mention}!"


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(require_admin)])
async def list_birthdays(guild_id: str = "", db: AsyncSession = Depends(get_db)):
    q = select(Birthday).order_by(Birthday.birth_month, Birthday.birth_day)
    if guild_id:
        q = q.where(Birthday.guild_id == guild_id)
    result = await db.execute(q)
    items = result.scalars().all()
    return sorted([_birthday_to_dict(b) for b in items], key=lambda x: x["days_until"])


@router.post("", dependencies=[Depends(require_admin)])
async def add_birthday(body: AddBirthdayRequest, db: AsyncSession = Depends(get_db)):
    if not 1 <= body.birth_month <= 12:
        raise HTTPException(400, "birth_month must be 1–12")
    if not 1 <= body.birth_day <= 31:
        raise HTTPException(400, "birth_day must be 1–31")
    # Check duplicate
    existing = await db.execute(
        select(Birthday).where(
            Birthday.guild_id == body.guild_id,
            Birthday.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Birthday already exists for this user")

    b = Birthday(
        guild_id=body.guild_id,
        user_id=body.user_id,
        display_name=body.display_name,
        birth_month=body.birth_month,
        birth_day=body.birth_day,
    )
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return _birthday_to_dict(b)


@router.put("/{birthday_id}", dependencies=[Depends(require_admin)])
async def update_birthday(
    birthday_id: int,
    body: UpdateBirthdayRequest,
    db: AsyncSession = Depends(get_db),
):
    b = await db.get(Birthday, birthday_id)
    if not b:
        raise HTTPException(404, "Birthday not found")
    if body.display_name is not None:
        b.display_name = body.display_name
    if body.birth_month is not None:
        b.birth_month = body.birth_month
    if body.birth_day is not None:
        b.birth_day = body.birth_day
    await db.commit()
    await db.refresh(b)
    return _birthday_to_dict(b)


@router.delete("/{birthday_id}", dependencies=[Depends(require_admin)])
async def delete_birthday(birthday_id: int, db: AsyncSession = Depends(get_db)):
    b = await db.get(Birthday, birthday_id)
    if not b:
        raise HTTPException(404, "Birthday not found")
    await db.delete(b)
    await db.commit()
    return {"ok": True}


@router.get("/config", dependencies=[Depends(require_admin)])
async def get_birthday_config(guild_id: str = ""):
    channel_id = await _get_setting(f"birthday_channel_{guild_id}", "")
    post_hour = int(await _get_setting(f"birthday_post_hour_{guild_id}", "9"))
    message_template = await _get_setting(
        f"birthday_message_{guild_id}",
        "🎂 Happy birthday, {mention}!"
    )
    return {
        "channel_id": channel_id,
        "post_hour": post_hour,
        "message_template": message_template,
    }


@router.put("/config", dependencies=[Depends(require_admin)])
async def save_birthday_config(body: BirthdayConfigRequest):
    await _set_setting(f"birthday_channel_{body.guild_id}", body.channel_id)
    await _set_setting(f"birthday_post_hour_{body.guild_id}", str(body.post_hour))
    await _set_setting(f"birthday_message_{body.guild_id}", body.message_template)
    return {"ok": True}

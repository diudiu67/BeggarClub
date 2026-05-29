import uuid
import mimetypes
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from database import get_db
from models import GalleryItem
from r2 import upload_to_r2, delete_from_r2
from config import settings

router = APIRouter(prefix="/gallery", tags=["gallery"])

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm", "video/quicktime",
}
MAX_SIZE = 100 * 1024 * 1024  # 100 MB


def _to_dict(item: GalleryItem) -> dict:
    return {
        "id": item.id,
        "public_url": item.public_url,
        "original_name": item.original_name,
        "media_type": item.media_type,
        "uploader": item.uploader,
        "caption": item.caption,
        "source": item.source,
        "channel_name": item.channel_name,
        "channel_id": item.channel_id if item.channel_id else "",
        "starred": bool(item.starred) if item.starred is not None else False,
        "guild_id": item.guild_id,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@router.get("/channels")
async def list_gallery_channels(guild_id: str = "", db: AsyncSession = Depends(get_db)):
    """Public — returns configured gallery channels with resolved names and item counts."""
    import bot_runner
    b = bot_runner.get_bot()

    result = []
    for cid in settings.gallery_channel_ids:
        ch = b.get_channel(cid) if b else None
        channel_name = ch.name if ch else str(cid)

        # Count items for this channel_id
        count_q = select(func.count(GalleryItem.id)).where(GalleryItem.channel_id == str(cid))
        if guild_id:
            count_q = count_q.where(GalleryItem.guild_id == guild_id)
        count = await db.scalar(count_q) or 0

        result.append({
            "channel_id": str(cid),
            "channel_name": channel_name,
            "item_count": count,
        })
    return result


@router.get("/items")
async def get_items(
    guild_id: str = "",
    channel_id: str = "",
    starred_only: bool = False,
    limit: int = 500,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(GalleryItem).order_by(desc(GalleryItem.created_at))
    if guild_id:
        q = q.where(GalleryItem.guild_id == guild_id)
    if channel_id:
        q = q.where(GalleryItem.channel_id == channel_id)
    if starred_only:
        q = q.where(GalleryItem.starred == True)
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return {"items": [_to_dict(i) for i in result.scalars().all()]}


@router.patch("/items/{item_id}/star")
async def star_item(item_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle the starred state of a gallery item."""
    result = await db.execute(select(GalleryItem).where(GalleryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Item not found")
    item.starred = not bool(item.starred)
    await db.commit()
    await db.refresh(item)
    return _to_dict(item)


@router.post("/upload")
async def upload_item(
    file: UploadFile = File(...),
    uploader: str = Form(default="Web Upload"),
    caption: str = Form(default=""),
    guild_id: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
):
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported file type: {content_type}")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(400, "File too large (max 100 MB)")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    key = f"{uuid.uuid4().hex}.{ext}"
    media_type = "image" if content_type.startswith("image/") else "video"

    public_url = await upload_to_r2(key, data, content_type)

    item = GalleryItem(
        r2_key=key,
        public_url=public_url,
        original_name=file.filename or key,
        media_type=media_type,
        uploader=uploader,
        caption=caption,
        source="web",
        guild_id=guild_id,
        created_at=datetime.utcnow(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _to_dict(item)


@router.delete("/items/{item_id}")
async def delete_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GalleryItem).where(GalleryItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Item not found")
    await delete_from_r2(item.r2_key)
    await db.delete(item)
    await db.commit()
    return {"ok": True}

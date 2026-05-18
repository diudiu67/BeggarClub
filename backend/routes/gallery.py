import uuid
import mimetypes
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from database import get_db
from models import GalleryItem
from r2 import upload_to_r2, delete_from_r2

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
        "guild_id": item.guild_id,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@router.get("/items")
async def get_items(
    guild_id: str = "",
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(GalleryItem).order_by(desc(GalleryItem.created_at)).limit(limit).offset(offset)
    if guild_id:
        q = select(GalleryItem).where(GalleryItem.guild_id == guild_id).order_by(desc(GalleryItem.created_at)).limit(limit).offset(offset)
    result = await db.execute(q)
    return {"items": [_to_dict(i) for i in result.scalars().all()]}


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

from fastapi import APIRouter, Query, HTTPException
from youtube import search_youtube, get_video_info

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search(q: str = Query(..., min_length=1), limit: int = 25):
    try:
        results = await search_youtube(q, max_results=min(limit, 50))
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/video/{video_id}")
async def video_info(video_id: str):
    info = await get_video_info(video_id)
    if not info:
        raise HTTPException(status_code=404, detail="Video not found")
    return info

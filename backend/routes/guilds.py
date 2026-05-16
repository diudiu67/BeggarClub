from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import bot as discord_bot
import bot_runner

router = APIRouter(prefix="/guilds", tags=["guilds"])


class JoinChannelRequest(BaseModel):
    guild_id: str
    channel_id: str


@router.get("")
async def list_guilds():
    return {"guilds": await bot_runner.run(discord_bot.get_guilds_async())}


@router.get("/{guild_id}/channels")
async def list_voice_channels(guild_id: str):
    channels = await bot_runner.run(discord_bot.get_voice_channels_async(guild_id))
    return {"channels": channels}


@router.post("/join")
async def join_voice(req: JoinChannelRequest):
    success, message = await bot_runner.run(
        discord_bot.join_channel(req.guild_id, req.channel_id)
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True}

"""
Runs the Discord bot in a separate thread with its own event loop.
This prevents uvicorn's event loop from starving discord.py's voice WebSocket events.
"""
import asyncio
import threading
from typing import Optional

_bot_loop: Optional[asyncio.AbstractEventLoop] = None
_fastapi_loop: Optional[asyncio.AbstractEventLoop] = None


def set_fastapi_loop(loop: asyncio.AbstractEventLoop):
    global _fastapi_loop
    _fastapi_loop = loop


def get_fastapi_loop() -> Optional[asyncio.AbstractEventLoop]:
    return _fastapi_loop


def get_bot_loop() -> asyncio.AbstractEventLoop:
    assert _bot_loop is not None, "Bot not started yet"
    return _bot_loop


async def run(coro):
    """Call a bot coroutine from FastAPI's async context and await its result."""
    future = asyncio.run_coroutine_threadsafe(coro, get_bot_loop())
    return await asyncio.wrap_future(future)


def get_bot():
    """Return the discord.py bot instance (or None if not yet started)."""
    try:
        import bot as discord_bot
        return discord_bot.bot
    except Exception:
        return None


def get_started_at() -> float:
    """Return the bot_started_at timestamp (0 if not yet ready)."""
    try:
        import bot as discord_bot
        return discord_bot.get_bot_started_at()
    except Exception:
        return 0.0


def fire_in_fastapi(coro):
    """Schedule a FastAPI coroutine from the bot thread (fire-and-forget)."""
    loop = _fastapi_loop
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(coro, loop)


def fire_in_bot(coro):
    """Schedule a bot coroutine from FastAPI (fire-and-forget). Uses bot's event loop."""
    loop = _bot_loop
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(coro, loop)


def _thread_main(token: str):
    global _bot_loop
    import bot as discord_bot
    _bot_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_bot_loop)
    print("[BotRunner] Bot thread started")
    try:
        _bot_loop.run_until_complete(discord_bot.bot.start(token))
    except Exception as e:
        print(f"[BotRunner] Bot stopped: {e}")


def launch(token: str):
    t = threading.Thread(target=_thread_main, args=(token,), daemon=True)
    t.start()

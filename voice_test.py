"""
Standalone voice connection test — runs OUTSIDE of uvicorn.
This tells us if the problem is network/Discord or our architecture.
"""
import asyncio
import sys
import discord
from pathlib import Path
from dotenv import load_dotenv
import os

# Force UTF-8 output so Chinese bot names don't crash the console
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent / ".env")
TOKEN = os.getenv("DISCORD_TOKEN")
GUILD_ID = 1442890150655819877
# 娛樂時光 voice channel
CHANNEL_ID = 1442890151532695639

intents = discord.Intents.default()
intents.voice_states = True
client = discord.Client(intents=intents)


@client.event
async def on_ready():
    print(f"[OK] Bot connected as: {client.user}")
    guild = client.get_guild(GUILD_ID)
    channel = guild.get_channel(CHANNEL_ID)
    print(f"[..] Trying to join: #{channel.name}")
    try:
        vc = await channel.connect(timeout=30.0)
        print(f"[OK] SUCCESS — joined voice channel!")
        await asyncio.sleep(5)
        await vc.disconnect()
        print(f"[OK] Disconnected cleanly")
    except Exception as e:
        print(f"[FAIL] {type(e).__name__}: {e}")
    await client.close()


print("Starting voice test...")
client.run(TOKEN)

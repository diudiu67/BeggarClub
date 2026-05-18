import asyncio
import boto3
from config import settings


def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


def _upload_sync(key: str, data: bytes, content_type: str) -> str:
    _get_client().put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return f"{settings.R2_PUBLIC_URL}/{key}"


def _delete_sync(key: str):
    _get_client().delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)


async def upload_to_r2(key: str, data: bytes, content_type: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _upload_sync, key, data, content_type)


async def delete_from_r2(key: str):
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _delete_sync, key)

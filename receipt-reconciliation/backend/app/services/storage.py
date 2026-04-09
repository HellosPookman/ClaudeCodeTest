"""S3-compatible object storage service (MinIO for local dev)."""
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
import hashlib
import io
from typing import Optional
from ..config import get_settings

settings = get_settings()


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def ensure_bucket():
    """Create the bucket if it doesn't exist."""
    client = _client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        client.create_bucket(Bucket=settings.s3_bucket)


def upload_file(file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to S3. Returns the object key."""
    ensure_bucket()
    client = _client()
    client.put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return key


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a signed URL for temporary access."""
    client = _client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )


def download_file(key: str) -> bytes:
    client = _client()
    response = client.get_object(Bucket=settings.s3_bucket, Key=key)
    return response["Body"].read()


def delete_file(key: str):
    client = _client()
    client.delete_object(Bucket=settings.s3_bucket, Key=key)


def compute_sha256(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


def compute_perceptual_hash(file_bytes: bytes) -> Optional[str]:
    """Return perceptual hash for images; None for non-image files."""
    try:
        import imagehash
        from PIL import Image
        img = Image.open(io.BytesIO(file_bytes))
        return str(imagehash.phash(img))
    except Exception:
        return None


def build_document_key(document_id: str, filename: str) -> str:
    return f"documents/{document_id}/{filename}"


def build_thumbnail_key(document_id: str) -> str:
    return f"thumbnails/{document_id}/thumb.jpg"


def generate_thumbnail(file_bytes: bytes, mime_type: str) -> Optional[bytes]:
    """Generate a JPEG thumbnail from an image or PDF."""
    try:
        from PIL import Image
        if "pdf" in mime_type:
            from pdf2image import convert_from_bytes
            pages = convert_from_bytes(file_bytes, first_page=1, last_page=1, dpi=72)
            if not pages:
                return None
            img = pages[0]
        else:
            img = Image.open(io.BytesIO(file_bytes))
        img.thumbnail((300, 400))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=80)
        return buf.getvalue()
    except Exception:
        return None

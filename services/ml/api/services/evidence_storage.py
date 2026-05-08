from __future__ import annotations

import hashlib
import hmac
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from ..env import get_env_value


ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_MIME_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
ALLOWED_MIME_TYPES = ALLOWED_IMAGE_MIME_TYPES | ALLOWED_VIDEO_MIME_TYPES
DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
SIGNATURE_TTL_SECONDS = 15 * 60


@dataclass(frozen=True)
class StoredEvidenceFile:
    storage_backend: str
    storage_path: str
    storage_url: str
    original_name: str
    mime_type: str
    size_bytes: int
    checksum_sha256: str
    access_metadata: dict


def get_storage_root() -> Path:
    configured_root = get_env_value("EVIDENCE_STORAGE_ROOT")
    root = Path(configured_root).expanduser() if configured_root else Path(__file__).resolve().parents[2] / "storage" / "evidence"
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def get_max_upload_bytes() -> int:
    raw_value = get_env_value("MAX_EVIDENCE_UPLOAD_BYTES", str(DEFAULT_MAX_UPLOAD_BYTES))
    try:
        return int(raw_value or DEFAULT_MAX_UPLOAD_BYTES)
    except ValueError:
        return DEFAULT_MAX_UPLOAD_BYTES


def _signature_secret() -> bytes:
    secret = get_env_value("MEDIA_SIGNING_SECRET") or get_env_value("SECRET_KEY") or "lexvision-local-media-secret"
    return secret.encode("utf-8")


def _safe_filename(filename: str | None) -> str:
    raw_name = (filename or "evidence").strip() or "evidence"
    cleaned = "".join(char if char.isalnum() or char in {".", "-", "_"} else "_" for char in raw_name)
    return cleaned[:120] or "evidence"


def _extension_for_mime(mime_type: str, original_name: str) -> str:
    suffix = Path(original_name).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm", ".mov"}:
        return suffix
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
    }.get(mime_type, ".bin")


def _validate_magic_bytes(content: bytes, mime_type: str) -> None:
    if mime_type == "image/jpeg" and not content.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded JPEG content is malformed.")
    if mime_type == "image/png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded PNG content is malformed.")
    if mime_type == "image/webp" and not (content.startswith(b"RIFF") and b"WEBP" in content[:16]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded WEBP content is malformed.")
    if mime_type in ALLOWED_VIDEO_MIME_TYPES and b"ftyp" not in content[:64] and mime_type != "video/webm":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded video content is malformed.")


async def store_upload_file(upload: UploadFile, *, citizen_id: str) -> StoredEvidenceFile:
    mime_type = (upload.content_type or "").split(";", 1)[0].strip().lower()
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported evidence type. Upload JPG, PNG, WEBP, MP4, WEBM, or MOV files.",
        )

    content = await upload.read(get_max_upload_bytes() + 1)
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Evidence file is empty.")
    if len(content) > get_max_upload_bytes():
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Evidence file is too large.")

    _validate_magic_bytes(content, mime_type)

    original_name = _safe_filename(upload.filename)
    extension = _extension_for_mime(mime_type, original_name)
    object_id = uuid.uuid4().hex
    relative_path = Path(citizen_id) / f"{object_id}{extension}"
    storage_root = get_storage_root()
    absolute_path = (storage_root / relative_path).resolve()
    if not str(absolute_path).startswith(str(storage_root)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid storage path.")

    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_bytes(content)
    checksum = hashlib.sha256(content).hexdigest()
    return StoredEvidenceFile(
        storage_backend="local",
        storage_path=relative_path.as_posix(),
        storage_url=f"local://{relative_path.as_posix()}",
        original_name=original_name,
        mime_type=mime_type,
        size_bytes=len(content),
        checksum_sha256=checksum,
        access_metadata={
            "uploaded_by_citizen_id": citizen_id,
            "storage_backend": "local",
            "sha256": checksum,
        },
    )


def resolve_local_storage_path(storage_path: str | None, storage_url: str | None = None) -> Path | None:
    candidate = storage_path
    if not candidate and storage_url and storage_url.startswith("local://"):
        candidate = storage_url.replace("local://", "", 1)
    if not candidate:
        return None

    storage_root = get_storage_root()
    absolute_path = (storage_root / candidate).resolve()
    if not str(absolute_path).startswith(str(storage_root)):
        return None
    return absolute_path


def sign_evidence_url(file_id: str, *, ttl_seconds: int = SIGNATURE_TTL_SECONDS) -> str:
    expires = int(time.time()) + ttl_seconds
    payload = f"{file_id}.{expires}".encode("utf-8")
    signature = hmac.new(_signature_secret(), payload, hashlib.sha256).hexdigest()
    return f"/api/media/evidence/{file_id}?expires={expires}&signature={signature}"


def verify_evidence_signature(file_id: str, expires: int | None, signature: str | None) -> bool:
    if not expires or not signature or expires < int(time.time()):
        return False
    payload = f"{file_id}.{expires}".encode("utf-8")
    expected = hmac.new(_signature_secret(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def cleanup_orphaned_local_files(known_storage_paths: set[str], *, older_than_seconds: int = 24 * 60 * 60) -> int:
    storage_root = get_storage_root()
    cutoff = time.time() - older_than_seconds
    deleted = 0
    for path in storage_root.rglob("*"):
        if not path.is_file() or path.stat().st_mtime > cutoff:
            continue
        relative = path.relative_to(storage_root).as_posix()
        if relative in known_storage_paths:
            continue
        path.unlink(missing_ok=True)
        deleted += 1
    return deleted

from __future__ import annotations

import base64
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, status
from fastapi.responses import FileResponse, Response
from jose import JWTError, jwt
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..dependencies import ALGORITHM, SECRET_KEY, get_current_citizen_account
from ..services.evidence_storage import (
    resolve_local_storage_path,
    sign_evidence_url,
    store_upload_file,
    verify_evidence_signature,
)


router = APIRouter(prefix="/api/media", tags=["media"])
PLATE_CROP_DIR = Path(__file__).resolve().parents[2] / "storage" / "plate_crops"


def _bearer_token_from_request(request: Request) -> str | None:
    authorization = request.headers.get("Authorization", "")
    if not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip() or None


def _is_authorized_for_evidence(
    request: Request,
    db: Session,
    evidence_file: models.EvidenceFile,
) -> bool:
    token = _bearer_token_from_request(request)
    if not token:
        return False

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return False

    token_scope = payload.get("token_scope")
    subject = payload.get("sub")
    if token_scope == "citizen":
        return bool(subject and evidence_file.report and evidence_file.report.citizen_id == subject)

    if not subject:
        return False
    user = db.query(models.User).filter(models.User.email == subject).first()
    return bool(user and user.role in {models.RoleEnum.POLICE, models.RoleEnum.ADMIN})


def _get_evidence_file_or_404(db: Session, file_id: str) -> models.EvidenceFile:
    evidence_file = (
        db.query(models.EvidenceFile)
        .options(joinedload(models.EvidenceFile.report))
        .filter(models.EvidenceFile.id == file_id)
        .first()
    )
    if evidence_file is None:
        raise HTTPException(status_code=404, detail="Evidence file not found.")
    return evidence_file


@router.post("/evidence-uploads", response_model=schemas.CitizenEvidenceFileCreate)
async def upload_citizen_evidence(
    upload: UploadFile = File(...),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    stored_file = await store_upload_file(upload, citizen_id=current_citizen.id)
    return schemas.CitizenEvidenceFileCreate(
        type="video" if stored_file.mime_type.startswith("video/") else "image",
        url=stored_file.storage_url,
        name=stored_file.original_name,
        size=stored_file.size_bytes,
        mime_type=stored_file.mime_type,
        storage_backend=stored_file.storage_backend,
        storage_path=stored_file.storage_path,
        checksum_sha256=stored_file.checksum_sha256,
        access_metadata=stored_file.access_metadata,
    )


@router.get("/evidence/{file_id}")
def get_evidence_media(
    file_id: str,
    request: Request,
    expires: Optional[int] = Query(None),
    signature: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    evidence_file = _get_evidence_file_or_404(db, file_id)
    if not verify_evidence_signature(file_id, expires, signature) and not _is_authorized_for_evidence(request, db, evidence_file):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this evidence file.")

    if evidence_file.storage_url.startswith("data:"):
        header, encoded = evidence_file.storage_url.split(",", 1)
        mime_type = evidence_file.mime_type or header.split(";", 1)[0].replace("data:", "") or "application/octet-stream"
        return Response(content=base64.b64decode(encoded), media_type=mime_type)

    local_path = resolve_local_storage_path(evidence_file.storage_path, evidence_file.storage_url)
    if local_path is None or not local_path.exists():
        raise HTTPException(status_code=404, detail="Evidence file content is missing from storage.")

    return FileResponse(
        path=local_path,
        media_type=evidence_file.mime_type or "application/octet-stream",
        filename=evidence_file.original_name,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/plate-crops/{filename}")
def get_plate_crop_media(filename: str):
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid plate crop filename.")

    crop_dir = PLATE_CROP_DIR.resolve()
    crop_path = (crop_dir / filename).resolve()
    if not str(crop_path).startswith(str(crop_dir)) or not crop_path.exists():
        raise HTTPException(status_code=404, detail="Plate crop not found.")

    return FileResponse(
        path=crop_path,
        media_type="image/png",
        filename=filename,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


def build_signed_evidence_url(file_id: str) -> str:
    return sign_evidence_url(file_id)

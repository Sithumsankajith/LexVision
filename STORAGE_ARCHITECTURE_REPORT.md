# LexVision Storage Architecture Report

Generated: 2026-05-08

## Architecture

Evidence media now flows through a storage abstraction instead of being embedded as giant base64 payloads for new citizen submissions.

- Upload endpoint: `POST /api/media/evidence-uploads`
- Serving endpoint: `GET /api/media/evidence/{file_id}`
- Local backend root: `EVIDENCE_STORAGE_ROOT` or `services/ml/storage/evidence`
- Metadata stored in DB: original filename, MIME type, size, backend, relative path, checksum, access metadata, uploaded timestamp
- Backward compatibility: old `data:image/...` and `data:video/...` evidence URLs are still served by the media endpoint and presenters

## Security Controls

- Allowed MIME types: JPG, PNG, WEBP, MP4, WEBM, MOV
- Default max upload size: 25 MB
- Magic-byte checks for supported image/video formats
- Path traversal prevention through resolved path checks
- Signed temporary media URLs with HMAC and expiry
- Citizen access limited to owned reports
- Police/admin bearer tokens can access all evidence
- Broken or missing files return explicit 404 errors

## Database Changes

Migration: `services/ml/migrations/versions/20260508_0006_storage_and_inference_jobs.py`

Added to `evidence_files`:

- `storage_backend`
- `storage_path`
- `checksum_sha256`
- `access_metadata`

Added indexes:

- `ix_evidence_files_checksum_sha256`
- `ix_evidence_reports_vehicle_plate`
- `ix_evidence_reports_violation_created_at`

## Cleanup

Admin endpoint `POST /api/admin/storage/cleanup` removes local files not referenced by `evidence_files`, with an age threshold to avoid deleting in-flight uploads.

## Remaining Storage Work

The abstraction is ready for S3/Firebase Storage. The next backend implementation should add a second provider that returns cloud object keys plus signed cloud URLs while preserving the current DB contract.

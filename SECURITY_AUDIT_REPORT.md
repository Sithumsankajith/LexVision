# LexVision Security Audit Report

Generated: 2026-05-08

## Controls Added

- Production startup validation for `SECRET_KEY`, Redis, SMS provider credentials, CORS origins, media signing secret, and public API URL.
- Production rejects `SMS_PROVIDER=noop`.
- Masked secret logging for startup diagnostics.
- Strict CORS origins outside local development.
- API rate limiting with tighter limits for auth paths.
- Secure response headers: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
- HttpOnly auth cookies are set alongside existing bearer-token responses; logout clears staff and citizen cookies.
- Evidence media access uses signed URLs and authorization checks.
- Upload validation blocks oversized files, unsupported MIME types, malformed image/video content, and path traversal.

## Residual Risks

- Bearer tokens are still stored client-side for the existing app flow; HttpOnly cookies have been added but the frontend still primarily uses bearer headers.
- In-memory rate limiting is per-process. Use Redis-backed rate limiting for multi-replica production.
- CSP is API-safe and conservative; if serving frontend assets from the API domain later, revisit it with asset/CDN requirements.

## Verification

- Production validation smoke rejected noop SMS in production.
- Signed media smoke verified HMAC expiry validation.
- Path traversal smoke returned no resolvable local path.
- Frontend lints and backend tests passed.

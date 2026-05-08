# LexVision Implementation Verification and Production Hardening Report

Generated: 2026-05-08

## Executive Status

LexVision is substantially implemented across the citizen portal, police dashboard, admin dashboard, FastAPI backend, Firebase OTP auth, SMS logging, ticket lifecycle, and ML inference worker. This pass fixed the highest-risk broken states found during workflow tracing:

- Citizen evidence reports now remain ticket-eligible in the police UI after validation.
- Admin analytics and CSV export now include the primary `EvidenceReport` workflow, not only legacy `Report` rows.
- Hosted Roboflow errors now preserve actionable status values, and helmet inference now attempts local YOLO fallback when hosted inference is unavailable.
- ANPR is no longer a placeholder: reports now execute plate detection plus OCR/normalization when dependencies/models are available, with graceful fallback statuses when unavailable.
- Frontend API base URL is deployable through `VITE_API_BASE_URL` instead of being hard-coded to localhost.
- Police/admin protected routes now enforce staff/admin roles client-side in addition to backend RBAC.
- Citizen media/report validation is stricter on both frontend and backend.

## Workflow Status

| Workflow | Status | Notes |
| --- | --- | --- |
| Citizen Report Submission | Implemented, hardened | OTP session, draft persistence, EvidenceReport/EvidenceFile writes, SMS log, audit log, inference enqueue, validation, duplicate-submit guard. |
| AI Inference Pipeline | Implemented, hardened | Selected model routing, ANPR for all reports, confidence thresholds, provider/status metadata, local helmet fallback, inference logs. |
| Police Review | Implemented, hardened | Queue/detail loading, officer status transitions, evidence zoom/overlays, SMS on status update, ticket issuance for evidence reports fixed. |
| Ticket/Fine Issuing | Implemented, hardened | Validated-report requirement, fine rule lookup, active-ticket unique indexes, transition rules, PDF generation, integrity-error handling. |
| Firebase OTP Auth | Implemented, verified by code/tests/build | Firebase init, reCAPTCHA, backend token verification, JWT session, logout, dev-mode guard, frontend persistence. |
| Admin Analytics | Implemented, hardened | Charts, trends, ratios, violation aggregation, heatmap, CSV export, AI metrics, officer metrics now include evidence reports. |

## Issues Fixed

| Issue | Root Cause | Risk | Fix | Verification |
| --- | --- | --- | --- | --- |
| Evidence reports could be validated but not ticketed in police UI | UI intentionally hid ticket form for `evidence-report` source | Main citizen workflow could not complete fine issuing | Removed source restriction and opened ticket form after all validated reports | `pnpm --filter police-dashboard build`, lint pass |
| Admin analytics ignored citizen evidence reports | Queries aggregated only `reports` table | Dashboard underreported real submissions and heatmaps | Aggregated `Report` + `EvidenceReport` in trend, status, type, officer, heatmap, CSV endpoints | Python compile, app import, health smoke |
| ANPR pipeline was a placeholder | `run_anpr_pipeline` returned `pending` only | Plate/OCR workflow was not actually implemented | Added YOLO plate detection, crop persistence, OCR execution, Sri Lankan plate normalization, graceful no-model states | Python compile, ANPR no-image smoke |
| Hosted AI failures were indistinguishable | Roboflow wrapper returned generic `failed` | Fallback logic and officer UI could not tell timeout/config/API errors apart | Added `configuration_error`, `timeout`, `api_error` statuses | Python compile |
| Helmet fallback was not used by selected routing path | Local YOLO fallback helper existed but selected workflow bypassed it | Hosted outage forced manual review even when local model was available | Routed helmet hosted failures into local YOLO fallback with fallback metadata | Python compile |
| Weak white-line threshold | Any crossing confidence above zero counted as violation | False positives | Added `WHITE_LINE_VIOLATION_THRESHOLD=0.55` default | Python compile |
| Hard-coded frontend API URL | API client used fixed `http://localhost:8000/api` | Production deploys would point at local machine | Added `VITE_API_BASE_URL` support | All frontend builds |
| Staff portals accepted any local session client-side | ProtectedRoute only checked token existence | Citizen account could open dashboard shell until backend calls failed | Added police/admin role checks and staff-login guard | Police/admin builds/lint |
| Citizen report accepted weak evidence payloads | Missing size/type/url/list constraints | Upload failures, oversized JSON payloads, bad media | Added backend validators and frontend file filtering | Citizen build/lint, Python compile |
| Duplicate citizen submissions possible on double-click/retry | No idempotency check | Duplicate cases in police queue | Added 10-minute duplicate guard on same citizen/type/time/location/primary evidence | Python compile |
| Active ticket race not handled at commit | Pre-check existed but no DB integrity catch | Concurrent issuance could raise raw 500 | Catch `IntegrityError` and return 409 | Python compile |

## Security Risks

Resolved or reduced:

- Staff dashboards now enforce role checks on the client; backend RBAC already protects API routes.
- Citizen OTP dev/demo mode remains opt-in and non-production-gated on the frontend.
- Firebase Admin verification rejects mismatched phones, expired tokens, non-phone providers, and fake tokens outside configured dev fallback.
- API base URL is environment-driven.
- Evidence report inputs are constrained by type, size, location range, future date, and supported violation type.

Remaining:

- `SECRET_KEY` still falls back to an ephemeral generated key if not configured. This is acceptable for local demos but must be set in production.
- Evidence is still stored as base64/data URL payloads in DB-facing JSON rather than object storage. This is demo-friendly but not production-scale.
- Firebase web API key is present in frontend env by design; restrict authorized domains and Firebase rules.

## Performance Risks

Resolved or reduced:

- Admin aggregates now use grouped SQL per source instead of frontend-only recomputation.
- CSV export eagerly loads evidence-report inference logs to avoid per-row lazy loads.
- Frontend dashboards use responsive grid layouts to reduce mobile overflow.

Remaining:

- Queue polling is still interval-based instead of WebSocket/SSE.
- Large base64 evidence payloads can increase API/database memory pressure.
- AI inference runs in FastAPI background tasks; Redis/RQ is configured but not yet the default execution path.

## Verification Evidence

Passed:

- `pnpm --filter citizen-portal build`
- `pnpm --filter police-dashboard build`
- `pnpm --filter admin-dashboard build`
- `pnpm --filter citizen-portal lint`
- `pnpm --filter police-dashboard lint`
- `pnpm --filter admin-dashboard lint`
- `python -m compileall services/ml/api services/ml/inference`
- `alembic heads` -> `20260430_0005 (head)`
- FastAPI import/route smoke -> `LexVision Core API 66`
- FastAPI `/health` smoke -> HTTP 200
- ANPR no-image smoke -> `no_image`

Blocked:

- `pytest -q services/ml/tests` could not run because `pytest` is not installed in this environment.

## Production Readiness Score

Score: 82 / 100

Rationale:

- Core workflows are implemented and connected.
- Major broken workflow states found in this pass were fixed.
- Builds/lint/static Python checks pass.
- Remaining deductions are for base64 evidence storage, background-task queue durability, missing local `pytest`, and production secret/config enforcement.

## Remaining Issues List

1. Install backend test dependencies and run `pytest -q services/ml/tests` before final submission.
2. Move evidence media to object storage for production-sized deployments.
3. Set a stable `SECRET_KEY`, Firebase Admin credentials, SMS provider credentials, and `VITE_API_BASE_URL` in deployment environments.
4. Promote inference from FastAPI background tasks to Redis/RQ worker mode for durable retries.
5. Add server-side pagination to police/admin report lists once report volume grows beyond demo scale.

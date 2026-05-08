# LexVision API Connection Verification

Date: 2026-05-08

## Local API Configuration

- Backend service URL: `http://127.0.0.1:8000`
- API base URL used by frontend apps: `http://127.0.0.1:8000/api`
- Citizen Portal env: `apps/citizen-portal/.env.local`
- Police Dashboard env: `apps/police-dashboard/.env.local`
- Admin Dashboard env: `apps/admin-dashboard/.env.local`

The frontend apps use `127.0.0.1` for the API base URL to avoid browser `localhost` resolving to IPv6 while Uvicorn is listening on IPv4.

## Backend Health

- Endpoint tested: `GET http://127.0.0.1:8000/health`
- Result: `200 OK`
- Backend status: `ok`
- Database status: `connected`
- Queue mode: `background`
- Redis note: Redis is configured but not available locally, so the health payload reported a Redis connection refusal while still returning healthy API/database status.

## OpenAPI Route Verification

OpenAPI exposed these required routes:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/firebase-phone-login`
- `POST /api/auth/citizen/firebase-login`
- `POST /api/auth/citizen/demo-login`
- `GET /api/auth/citizen/otp-readiness`
- `GET /api/reports`
- `GET /api/evidence-reports`
- `GET /api/evidence-reports/page`
- `GET /api/admin/analytics/status-ratio`
- `GET /api/admin/analytics/reports-trend`
- `GET /api/admin/analytics/violation-types`
- `GET /api/admin/analytics/districts`
- `GET /health`

## Auth Endpoint Test

- Endpoint tested: `POST http://127.0.0.1:8000/api/auth/login`
- Request format: `application/x-www-form-urlencoded` with `username` and `password`
- Result with screenshot credentials: `401 Unauthorized`
- Response detail: `Incorrect username or password`
- Result with seeded admin account: `200 OK`
- Result with seeded police account: `200 OK`

This confirms the login request reaches the backend and is rejected as an authentication failure, not as a network, CORS, or route mismatch failure.

## CORS Verification

Preflight checks succeeded:

- Origin `http://localhost:5173` to `/api/auth/login`: `200 OK`
- Origin `http://127.0.0.1:5175` to `/api/auth/login`: `200 OK`
- Origin `http://localhost:5174` to `/api/reports` with `authorization,content-type` headers: `200 OK`
- Origin `http://localhost:5175` to `/api/admin/analytics/status-ratio` with `authorization,content-type` headers: `200 OK`

The backend default development CORS configuration also allows:

- `http://localhost:5173`
- `http://localhost:5174`
- `http://localhost:5175`
- `http://127.0.0.1:5173`
- `http://127.0.0.1:5174`
- `http://127.0.0.1:5175`

## Dashboard Data Fetch Status

- Police Dashboard now fetches reports through `GET /api/reports` and `GET /api/evidence-reports` using the shared API client.
- Admin Dashboard now fetches reports and analytics through the shared API client.
- The shared API client sends `Authorization: Bearer <access_token>` when a session is present.
- `401` responses now clear the session and redirect to login.
- Network/CORS/backend failures now surface a connection-specific error instead of being converted to an empty report list.
- Without a token, protected report endpoints correctly return `401 Not authenticated`.
- With a valid police token, `GET /api/reports` returned `22` reports.
- With a valid police token, `GET /api/evidence-reports` returned `20` evidence reports after the verification submission.
- With a valid admin token, `GET /api/admin/analytics/status-ratio` returned `4` status buckets with `42` total reports.
- With a valid admin token, `GET /api/admin/analytics/districts` returned Colombo district data.

## End-to-End Submission Check

- Citizen demo login succeeded through `POST /api/auth/citizen/demo-login`.
- Test report created through `POST /api/citizen-reports`.
- Tracking ID: `LEX-2026-21B8E7A8`
- Violation type: `other`
- District: `Colombo`
- Police queue visibility check: `true`
- Admin analytics reflected the updated totals.

## Database Migration Status

- Alembic was at revision `20260508_0007`.
- `alembic upgrade head` was run from `services/ml`.
- Alembic is now at revision `20260508_0008`.
- This applied the report location/custom violation columns required by the current SQLAlchemy models.

## Frontend Verification

Commands run successfully:

- `pnpm --filter citizen-portal lint`
- `pnpm --filter police-dashboard lint`
- `pnpm --filter admin-dashboard lint`
- `pnpm --filter citizen-portal build`
- `pnpm --filter police-dashboard build`
- `pnpm --filter admin-dashboard build`

Citizen build emitted Vite's large chunk warning only; the build completed successfully.

## Backend Verification

Commands run successfully:

- `PYTHONPATH="$PWD/services/ml" python3 -m compileall services/ml/api services/ml/tests`
- `PYTHONPATH="$PWD/services/ml" python3 -m pytest services/ml/tests -q`

Test result: `33 passed`.

No backend lint tool is configured in the repository.

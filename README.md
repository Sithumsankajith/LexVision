# LexVision

LexVision is a multi-app traffic violation workflow for citizen submissions, police review, admin oversight, and ML-assisted evidence analysis. AI assists helmet, red-light, and white-line detection, but human police validation remains required before any enforcement action.

## Apps and Services

- `apps/citizen-portal`: citizen-facing reporting and tracking UI on `http://localhost:5173`
- `apps/police-dashboard`: police review and ticketing UI on `http://localhost:5174`
- `apps/admin-dashboard`: admin analytics and rules UI on `http://localhost:5175`
- `services/ml`: FastAPI backend, worker logic, migrations, and ML integrations on `http://localhost:8000`
- `packages/*`: shared UI, types, and API client code

## Prerequisites

- Node.js 18+
- `pnpm`
- Python 3.10+
- PostgreSQL for the preferred backend database

Redis is not required for the current local demo flow. Inference tasks run through FastAPI background tasks.

## Setup

### 1. Install frontend dependencies

```bash
pnpm install
```

### 2. Set up backend Python dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/ml/requirements.txt
```

### 3. Create environment files

```bash
cp services/ml/.env.example services/ml/.env
cp apps/citizen-portal/.env.example apps/citizen-portal/.env.local
```

Update the copied files with real values or placeholders appropriate for your demo.

## Required Environment Variables

### Backend: `services/ml/.env`

- `DATABASE_URL`: PostgreSQL DSN or SQLite fallback
- `SECRET_KEY`: required for stable JWT auth tokens
- `DEMO_OTP_ENABLED`: set `true` only for local demo OTP mode
- `ROBOFLOW_API_KEY`: required for live Roboflow inference
- `ROBOFLOW_HELMET_MODEL_ID`
- `ROBOFLOW_RED_LIGHT_MODEL_ID`
- `ROBOFLOW_WHITE_LINE_MODEL_ID`
- `HELMET_MODEL_PATH` / `ANPR_MODEL_PATH`: optional local model overrides
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_AUTH_DEV_MODE`: optional local fallback for Firebase Admin verification
- `SMS_PROVIDER` and provider-specific `SMS_*` variables when SMS delivery is enabled

### Citizen portal: `apps/citizen-portal/.env.local`

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional)
- `VITE_FIREBASE_PHONE_TEST_TOKEN` (optional)
- `VITE_DEMO_OTP_ENABLED=true` for local demo OTP mode

## Database and Seeding

Run migrations before starting the backend:

```bash
cd services/ml
PYTHONPATH="$(cd ../.. && pwd)" python3 -m alembic upgrade head
cd ../..
```

Seed demo admin and police accounts if needed:

```bash
PYTHONPATH="$PWD" python3 services/ml/seed_users.py
```

Seeded demo accounts:

- Admin: `admin@lexvision.com` / `admin123`
- Police: `police@lexvision.com` / `police123`

Demo citizen OTP:

- Enable `VITE_DEMO_OTP_ENABLED=true` in the citizen portal and `DEMO_OTP_ENABLED=true` in the backend
- The fixed demo OTP code is `123456`

## Running the Project

### Backend

```bash
cd services/ml
PYTHONPATH="$(cd ../.. && pwd)" python3 -m uvicorn api.server:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend apps

Run each app from the repo root in a separate terminal:

```bash
pnpm dev:citizen
pnpm dev:police
pnpm dev:admin
```

The Vite configs are pinned to these ports:

- Citizen portal: `5173`
- Police dashboard: `5174`
- Admin dashboard: `5175`

## How ML Inference Works

- Citizen and legacy reports are saved first, then queued into the in-process worker via FastAPI background tasks.
- The worker selects one violation model based on the claimed violation type:
  - `helmet` -> helmet model
  - `red_light` -> red-light model
  - `white_line` -> white-line model
- ANPR runs separately for plate extraction and does not choose the violation family.
- AI results are written to `inference_logs` and surfaced to the police dashboard as `ai_summary`.
- Low-confidence or configuration-error paths remain in manual review; the system does not auto-validate reports or auto-issue fines.

## Tests and Verification

### Frontend checks

```bash
pnpm --filter citizen-portal lint
pnpm --filter police-dashboard lint
pnpm --filter admin-dashboard lint

pnpm --filter citizen-portal build
pnpm --filter police-dashboard build
pnpm --filter admin-dashboard build
```

### Backend checks

```bash
PYTHONPATH="$PWD" python3 -m pytest services/ml/tests -q
cd services/ml && PYTHONPATH="$(cd ../.. && pwd)" python3 -m alembic upgrade head
```

Useful runtime endpoints:

- `GET /` -> service banner
- `GET /health` -> backend and queue-mode status
- `GET /docs` -> FastAPI Swagger UI

## Demo Flow

1. Start the backend and all three frontend apps.
2. Log in to the citizen portal with Firebase phone OTP or demo OTP.
3. Submit a citizen report with image evidence.
4. Open the police dashboard and review the queued report plus AI summary.
5. Validate or reject the report manually.
6. Issue a ticket only after manual validation.
7. Use the admin dashboard for analytics, audit logs, and fine rule management.

## Notes

- Do not commit `.env` files, local databases, virtual environments, or temp outputs.
- The backend supports SQLite for quick demo use, but PostgreSQL is the preferred persistent database.
- The current health endpoint reports queue mode as `fastapi_background_tasks`; Redis is not part of the active local execution path.

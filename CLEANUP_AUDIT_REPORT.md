# LexVision Cleanup, Audit, and Stabilization Report

## Status

- Audit started on 2026-05-08.
- This file is being updated during the cleanup pass.
- No working features have been intentionally removed.

## Initial Deletion / Untracking Candidates

These were identified before any cleanup removals. They should be removed from git or archived only when confirmed safe.

| Path | Candidate Action | Reason |
| --- | --- | --- |
| `package-lock.json` | Remove | Repo uses `pnpm` workspace and already has `pnpm-lock.yaml`; dual lockfiles are a maintenance risk. |
| `services/ml/.env` | Untrack | Secrets/config should not live in git. Keep local file, but remove from version control. |
| `services/ml/.venv/` | Untrack | Virtual environment is machine-local and should not be committed. |
| `services/ml/venv/` | Untrack | Duplicate committed virtual environment. |
| `services/ml/db.sqlite3` | Untrack | Local runtime database artifact. |
| `services/ml/api/db.sqlite3` | Remove or untrack | Duplicate SQLite artifact under source tree. |
| `services/ml/temp/test-image_helmet_detection.json` | Remove or ignore | Temporary inference/debug output. |
| `apps/citizen-portal/src/App.css` | Remove | Unreferenced scaffold file. |
| `apps/citizen-portal/src/assets/react.svg` | Remove | Unreferenced Vite scaffold asset. |
| `apps/citizen-portal/public/vite.svg` | Remove | Unreferenced Vite scaffold asset. |
| `apps/citizen-portal/src/pages/portal/Profile.tsx` | Archive or remove | Not routed; `/portal/profile` currently redirects elsewhere. |
| `apps/citizen-portal/src/pages/portal/Profile.module.css` | Archive or remove | Only referenced by the unused `Profile.tsx` component. |
| `services/ml/test_post.py` | Archive or remove | Ad hoc script, not part of automated tests or app startup. |
| `services/ml/test_helmet_api.py` | Archive or remove | Ad hoc script, not part of automated tests or app startup. |
| `services/ml/debug_roboflow_config.py` | Archive or document | Useful utility, but currently a standalone script with no discoverability from main README. |

## Problems Found

### Frontend

- `admin-dashboard` had TS build failures in `Settings.tsx` and `Users.tsx`.
- `citizen-portal` lint failed due `any` usage in the unused profile page and a hook dependency warning in `Login.tsx`.
- `admin-dashboard` and `police-dashboard` had lint scripts but no ESLint tooling/configuration.
- Vite apps were not pinned to stable ports even though the citizen portal redirects assumed fixed police/admin URLs.
- Unused scaffold files were still present in `citizen-portal` (`App.css`, `react.svg`, `vite.svg`).
- `citizen-portal/src/pages/portal/Profile.tsx` was dead code; the route redirected elsewhere and never rendered it.

### Backend / ML

- FastAPI used deprecated `@app.on_event("startup")`.
- Pydantic schemas used deprecated V1 `@validator` and class-based `Config`.
- `services/ml/migrations/versions/26586ad62b8f_fix_unique_active_ticket_constraint.py` failed on fresh SQLite upgrades.
- `services/ml/migrations/versions/59daecb0716e_add_fine_rules_engine.py` attempted unsupported SQLite `ALTER TABLE` foreign-key work.
- `/health` incorrectly claimed Redis was connected even though local inference work currently runs through FastAPI background tasks.

### Security / Repo Hygiene

- `services/ml/.env` was tracked in git.
- Committed local virtual environments existed under `services/ml/.venv/` and `services/ml/venv/`.
- SQLite runtime databases were tracked under `services/ml/db.sqlite3` and `services/ml/api/db.sqlite3`.
- Root ignore rules were incomplete for env files, Python caches, SQLite sidecar files, temp outputs, and local ML runtime artifacts.
- Root used both `pnpm-lock.yaml` and `package-lock.json`.
- A tracked temp inference output existed at `services/ml/temp/test-image_helmet_detection.json`.

## Commands Run So Far

```bash
pnpm install --frozen-lockfile
pnpm install
pnpm --filter citizen-portal exec tsc -b
pnpm --filter police-dashboard exec tsc -b
pnpm --filter admin-dashboard exec tsc -b
pnpm --filter citizen-portal lint
pnpm --filter police-dashboard lint
pnpm --filter admin-dashboard lint
pnpm --filter citizen-portal build
pnpm --filter police-dashboard build
pnpm --filter admin-dashboard build
pnpm dev:citizen
pnpm dev:police
pnpm dev:admin
PYTHONPATH=$PWD python3 -m pytest services/ml/tests -q
PYTHONPATH=$PWD python3 - <<'PY'
from fastapi.testclient import TestClient
from services.ml.api.server import app
with TestClient(app) as client:
    print(client.get('/').status_code)
    print(client.get('/health').json())
PY
PYTHONPATH=$PWD python3 - <<'PY'
from services.ml.api.env import get_roboflow_config
from services.ml.api.worker import attempt_inference
from services.ml.inference.anpr_pipeline import run_anpr_pipeline
from services.ml.inference.helmet_roboflow import run_helmet_detection
from services.ml.inference.red_light_roboflow import run_red_light_detection
from services.ml.inference.white_line_roboflow import run_white_line_detection
print(get_roboflow_config()['api_key_exists'])
print(all(map(callable, [
    attempt_inference,
    run_anpr_pipeline,
    run_helmet_detection,
    run_red_light_detection,
    run_white_line_detection,
])))
PY
cd services/ml && PYTHONPATH="$(cd ../.. && pwd)" python3 -m alembic heads
cd services/ml && PYTHONPATH="$(cd ../.. && pwd)" python3 -m alembic history --verbose
cd services/ml && DATABASE_URL=sqlite:///./alembic_check_verify.sqlite3 PYTHONPATH="$(cd ../.. && pwd)" python3 -m alembic upgrade head
cd services/ml && PYTHONPATH="$(cd ../.. && pwd)" python3 -m alembic upgrade head
PYTHONPATH=$PWD python3 -m uvicorn api.server:app --host 127.0.0.1 --port 8001
curl -s http://127.0.0.1:8001/health
```

## Files Changed

- `CLEANUP_AUDIT_REPORT.md`
- `.gitignore`
- `README.md`
- `apps/admin-dashboard/package.json`
- `apps/admin-dashboard/eslint.config.js`
- `apps/admin-dashboard/src/pages/Dashboard.tsx`
- `apps/admin-dashboard/src/pages/Settings.tsx`
- `apps/admin-dashboard/src/pages/Users.tsx`
- `apps/admin-dashboard/vite.config.ts`
- `apps/citizen-portal/src/pages/public/Login.tsx`
- `apps/citizen-portal/vite.config.ts`
- `apps/police-dashboard/package.json`
- `apps/police-dashboard/eslint.config.js`
- `apps/police-dashboard/src/pages/Settings.tsx`
- `apps/police-dashboard/vite.config.ts`
- `pnpm-lock.yaml`
- `services/ml/.env.example`
- `services/ml/.gitignore`
- `services/ml/api/dependencies.py`
- `services/ml/api/schemas.py`
- `services/ml/api/server.py`
- `services/ml/migrations/versions/26586ad62b8f_fix_unique_active_ticket_constraint.py`
- `services/ml/migrations/versions/59daecb0716e_add_fine_rules_engine.py`

## Files Removed

- Deleted from the repo:
  - `package-lock.json`
  - `apps/citizen-portal/public/vite.svg`
  - `apps/citizen-portal/src/App.css`
  - `apps/citizen-portal/src/assets/react.svg`
  - `apps/citizen-portal/src/pages/portal/Profile.tsx`
  - `apps/citizen-portal/src/pages/portal/Profile.module.css`
  - `services/ml/temp/test-image_helmet_detection.json`
- Removed from git tracking but kept locally/ignored:
  - `services/ml/.env`
  - `services/ml/.venv/`
  - `services/ml/venv/`
  - `services/ml/db.sqlite3`
  - `services/ml/api/db.sqlite3`

## Problems Fixed

- All three frontend apps now type-check, lint, and build successfully.
- `admin-dashboard` now has working lint tooling and a local ESLint config.
- `police-dashboard` now has working lint tooling and a local ESLint config.
- Vite dev ports are now fixed and aligned with the citizen-portal role redirects:
  - citizen `5173`
  - police `5174`
  - admin `5175`
- `citizen-portal` login flow no longer emits the hook dependency lint warning.
- Dead citizen portal profile page/scaffold assets were removed.
- Backend schema code was upgraded from deprecated Pydantic V1 validators/configs.
- FastAPI startup logging was moved to lifespan handling.
- Backend JWT handling no longer uses a hardcoded fallback secret; it now generates an ephemeral key when `SECRET_KEY` is missing and logs a warning.
- Fresh SQLite Alembic upgrades now succeed through head.
- `/health` now reports the real local queue mode instead of falsely claiming Redis connectivity.
- Root README now documents setup, env files, demo credentials, ML behavior, and verification commands.
- Root and ML `.gitignore` rules now cover env files, caches, SQLite artifacts, local temp outputs, and local Python environments.

## Remaining Known Issues

- Browser-driven end-to-end verification was not performed in an actual browser session from this environment, so “no console errors” is verified only indirectly via lint/build and dev-server startup.
- `services/ml/test_post.py`, `services/ml/test_helmet_api.py`, and `services/ml/debug_roboflow_config.py` remain as manual utility scripts; they are still cleanup candidates if the team wants a stricter repo surface.
- Several tracked ML/model artifacts remain in the repo (`best.pt`, `yolov8*.pt`, dataset audit outputs). They were not removed because their demo/training value is unclear without product-owner confirmation.
- The backend still supports both legacy `reports` and newer `evidence_reports` flows. That is intentional for compatibility, but it leaves extra code surface to maintain.

## Final Status

- Completed with safe incremental cleanup and verification.
- Final command checks passed:
  - frontend lint: passed
  - frontend builds: passed
  - backend tests: `27 passed`
  - FastAPI import and health checks: passed
  - fresh SQLite Alembic upgrade: passed
  - app startup checks:
    - backend started on `127.0.0.1:8001`
    - citizen portal started on `http://localhost:5173`
    - police dashboard started on `http://localhost:5174`
    - admin dashboard started on `http://localhost:5175`
- AI routing, manual-review fallback, demo citizen visibility, and ticket lifecycle behaviors are covered by passing tests in:
  - `services/ml/tests/test_worker_helmet_roboflow_integration.py`
  - `services/ml/tests/test_citizen_report_inference_pipeline.py`
  - `services/ml/tests/test_demo_citizen_reports.py`
  - `services/ml/tests/test_tickets.py`

# LexVision Full Deep Technical Analysis Report

Generated: 2026-05-10  
Repository: `/home/sithum/LexVision`  
Analysis basis: local source code, configuration, migrations, tests, checked-in model/training artifacts, and repository documentation. This report does not assume features that are not evidenced by the code. Where implementation evidence is absent, the report marks it as `[Code evidence insufficient]`.

## 1. Project Overview

LexVision is a multi-application traffic violation reporting and enforcement workflow. The implemented system combines citizen-submitted evidence, AI-assisted violation analysis, police review, admin oversight, fine rules, ticket generation, notifications, and ML training/evaluation assets.

The final implemented scope is broader than a simple image classifier. It is a workflow platform with:

- A citizen portal in `apps/citizen-portal` for registration/login, report submission, report tracking, saved drafts, rewards, and notification UI.
- A police dashboard in `apps/police-dashboard` for queue triage, evidence review, AI-assisted decision support, ANPR correction, report validation/rejection, ticket issuing, and history views.
- An admin dashboard in `apps/admin-dashboard` for analytics, audit logs, user management, fine rule management, notifications, and system settings.
- A FastAPI backend in `services/ml/api` that owns auth, RBAC, database models, report APIs, media APIs, inference job dispatch, SMS dispatch, notifications, fine rules, tickets, PDF generation, and analytics.
- A machine learning layer in `services/ml/inference`, `services/ml/training`, `services/ml/evaluation`, and `services/ml/dataset_tools` that supports Roboflow-hosted inference, local YOLOv8 fallback for helmet detection, local YOLOv8 ANPR, EasyOCR plate extraction, Sri Lankan plate normalization, dataset audit tooling, and reproducible training scripts.

Architecturally, the system is a pnpm monorepo plus a Python/FastAPI service. React apps share a common TypeScript API client, shared domain types, and shared UI primitives. The backend uses SQLAlchemy models and Alembic migrations, with PostgreSQL as the intended database and SQLite compatibility for local demos. Asynchronous work is abstracted through `services/ml/api/tasks.py`, which can use Redis/RQ when available or FastAPI `BackgroundTasks` in local mode.

The most important product decision is that AI is advisory. The code repeatedly preserves human police validation as the enforcement boundary. Reports move to `UNDER_REVIEW` after inference; tickets require a validated report; PDFs include a disclaimer that AI-assisted evidence requires police validation.

## 2. Codebase Structure Analysis

The repository is organized as a monorepo:

- `apps/citizen-portal`: React/Vite citizen-facing application.
- `apps/police-dashboard`: React/Vite police workflow application.
- `apps/admin-dashboard`: React/Vite admin application.
- `packages/api-client`: shared frontend API layer. The exported object is still named `mockDb`, but it calls real HTTP endpoints.
- `packages/types`: shared TypeScript domain types for reports, tickets, notifications, AI summaries, fine rules, and Sri Lankan districts.
- `packages/ui`: shared UI components and CSS modules for forms, buttons, navigation, cards, steppers, dashboards, KPI cards, panels, and tables.
- `services/ml/api`: FastAPI backend, SQLAlchemy models, routers, schemas, auth dependencies, task dispatch, storage, SMS, notification, PDF, and worker integration.
- `services/ml/inference`: Roboflow wrappers, YOLOv8 ANPR pipeline, EasyOCR OCR pipeline, plate normalization, and a CLI prediction script.
- `services/ml/training`: reusable YOLOv8 training/evaluation pipeline, target-specific entry points, augmentation monkeypatching, and report rendering.
- `services/ml/evaluation`: ANPR and helmet evaluation scripts.
- `services/ml/dataset_tools`: dataset audit and Pascal VOC to YOLO conversion tooling.
- `services/ml/migrations`: Alembic migration history.
- `runs` and `services/ml/runs`: YOLO training outputs.
- `services/ml/datasets`: local datasets present in the workspace but ignored by git except the README.

The build structure is straightforward. Root `package.json` delegates to pnpm workspace scripts: `dev:citizen`, `dev:police`, `dev:admin`, and per-app builds. Each app is Vite/React/TypeScript. The backend is run with `uvicorn api.server:app` from `services/ml`.

Environment strategy is split:

- Backend env is documented in `services/ml/.env.example`.
- Frontend API URL is documented in `apps/citizen-portal/.env.example`; local `.env.local` files exist in the workspace but are ignored by git.
- Production config is validated by `services/ml/api/production_config.py`.
- `services/ml/api/env.py` centralizes `.env` loading and masked Roboflow diagnostics.

The repo contains production-hardening documentation files, but this report prioritizes source behavior over claims in docs. Some documentation claims are ahead of the frontend integration, especially around the newer evidence storage path.

## 3. Frontend Analysis

The frontend architecture is three dedicated React apps sharing one component and API layer. This avoids role-specific feature flags inside one app and lets each portal optimize navigation and UI density for its audience.

React and routing:

- All apps use `react-router-dom` 7.
- `apps/citizen-portal/src/App.tsx` defines public website routes and `/portal` routes.
- `apps/police-dashboard/src/App.tsx` protects `/dashboard` routes for `POLICE` and `ADMIN`.
- `apps/admin-dashboard/src/App.tsx` protects `/dashboard` routes for `ADMIN` only.
- Protected routes are implemented client-side with `auth.getSession()` from `packages/api-client/src/auth.ts`.

State management:

- There is no Redux/Zustand/global state store. State is local React state plus localStorage and IndexedDB.
- Auth session is stored in localStorage under `lexvision_user_session`.
- Citizen report drafts use IndexedDB in `apps/citizen-portal/src/lib/reportDraft.ts`.
- Notifications use custom hooks with visibility-aware polling.
- Dashboards use interval polling rather than WebSockets or server-sent events.

API communication:

- `packages/api-client/src/auth.ts` normalizes `VITE_API_BASE_URL`, performs login/register/logout, decodes JWT expiry client-side, and stores session state.
- `packages/api-client/src/mockDb.ts` maps backend snake_case API payloads into frontend camelCase domain types.
- The API client handles media URL normalization, plate crop URL normalization, AI summary mapping, ticket mapping, fine rule mapping, and error handling.
- Despite the name `mockDb`, the client is not a mock database in current behavior. It is a real API adapter. The stale name is a maintainability smell because it obscures production responsibility.

Citizen portal:

- Public pages are implemented under `apps/citizen-portal/src/pages/public`.
- Portal pages are implemented under `apps/citizen-portal/src/pages/portal`.
- `ReportWizard.tsx` is the most complex citizen module. It implements multi-step evidence reporting, location entry, geolocation validation, Leaflet/OpenStreetMap reverse geocoding, Sri Lankan district selection, future-date checks, file count limits, 25 MB file validation, draft persistence, auth redirect and resume, and submission.
- `MyReports.tsx` loads profile/rewards/reports and lets citizens claim rewards.
- `MyReportDetail.tsx` presents report status and detail.
- `TrackReport.tsx` supports public lookup by tracking ID.
- `NotificationsPage.tsx` exists, but the hook uses staff notification endpoints. The backend has separate `/api/citizen-notifications` endpoints, so the citizen notification UI is under-integrated with actual citizen notification records.

Important citizen submission integration issue:

- The citizen wizard submits through `mockDb.createReport()`, which calls legacy `/api/reports`.
- The newer evidence-report pipeline is `/api/citizen-reports` plus optional `/api/media/evidence-uploads`.
- The police queue page uses `/api/evidence-reports/page`, which only returns `EvidenceReport` rows.
- Police dashboard `getAllReports()` sees both legacy and evidence reports, but the paginated queue is evidence-report only. This means reports from the active citizen wizard may appear in aggregate views but not necessarily in the main queue path designed for evidence reports.
- This is one of the largest frontend/backend integration gaps.

Police dashboard:

- `Dashboard.tsx` polls all reports every three seconds, computes KPIs, active queue counts, and district workload.
- `Queue.tsx` polls `/api/evidence-reports/page` every five seconds and supports server-side status, violation type, district, search, sort, offset, and limit.
- `ViolationDetails.tsx` is a sophisticated police review surface. It loads a report by ID, loads an existing ticket when applicable, overlays AI bounding boxes, displays ANPR crop and OCR data, allows manual plate correction for evidence reports, supports AI rerun for evidence reports, applies report status transitions, and creates tickets.
- `History.tsx` presents resolved cases.
- `Settings.tsx` is local preferences only.
- `utils/officerAi.ts` converts AI summary data into officer-facing labels, priority, guidance, and relevant detections.

Admin dashboard:

- `Dashboard.tsx` calls admin analytics endpoints for audit logs, violation stats, district stats, status ratios, trends, AI metrics, and ANPR performance.
- `Reports.tsx` loads all legacy and evidence reports and supports client-side filtering/search and CSV export.
- `Users.tsx` lists and creates staff/admin users through admin endpoints.
- `RulesEngine.tsx` creates/updates fine rules.
- `Settings.tsx` calls `/api/admin/configuration/ai-threshold`, but the backend only logs the threshold and does not persist or apply it.
- `Notifications.tsx` and the admin notification hook correctly use staff notification endpoints.

UI system:

- `packages/ui` provides shared primitives and dashboard layout components.
- Styling is CSS module based, with global design tokens in `packages/ui/src/styles/variables.css`.
- The design system uses a professional navy/blue palette, semantic success/warning/error/info colors, shared spacing/radius/shadow variables, and dashboard surfaces.
- Forms are primarily hand-managed with local validation. There is no frontend form library such as React Hook Form.

Frontend limitations:

- Client-side route protection is user-experience-only; backend RBAC is the true control.
- JWTs are stored in localStorage, which carries XSS exposure risk.
- Polling is simple and robust for demos, but it is less efficient than push notifications for high traffic.
- Citizen notifications call staff endpoints rather than citizen endpoints.
- New storage upload API is not used by the active citizen wizard.
- `mockDb.ts` contains a debug `console.log` in AI summary mapping.

## 4. Backend Analysis

The backend is a FastAPI application defined in `services/ml/api/server.py`. It includes routers for auth, citizen reports, evidence reports, legacy reports, tickets, admin, users, fine rules, media, staff notifications, and citizen notifications.

Application lifecycle and middleware:

- `lifespan()` validates production configuration and logs Roboflow config.
- SQLite local compatibility is handled by `ensure_sqlite_schema_compatibility()`, which creates missing columns/indexes for demo databases.
- Startup seeds reward records and default fine rules.
- Middleware implements per-process rate limiting, process-time headers, and security headers.
- CORS is configured from production config and local defaults.
- `/health` reports database connectivity, queue mode, Redis configuration, and queue health.

Routers:

- `auth.py`: public registration, OAuth2 password login, logout, and citizen profile.
- `reports.py`: legacy report lifecycle.
- `citizen_reports.py`: newer citizen evidence report lifecycle.
- `evidence_reports.py`: staff review lifecycle for evidence reports.
- `tickets.py`: dedicated ticket lifecycle.
- `admin.py`: audit logs, analytics, worker health, inference jobs, storage cleanup, heatmap, and CSV exports.
- `users.py`: profile, citizen rewards, and admin user management.
- `fine_rules.py`: fine rule CRUD.
- `media.py`: upload and serve evidence media; serve ANPR crop images.
- `notifications.py`: staff and citizen notification APIs.

Dependency injection:

- `services/ml/api/dependencies.py` defines DB injection, JWT creation/validation, role dependencies, citizen-account resolution, audit logging, and SMS service injection.
- RBAC functions are simple and clear: `get_citizen`, `get_police`, and `get_admin`.
- `get_current_citizen_account` supports citizen-scoped tokens and also maps a staff-style `User` with role `CITIZEN` into a `Citizen` row using `firebase_uid="email:{user.id}"`.

Request lifecycle example for legacy report submission:

1. Frontend calls `POST /api/reports`.
2. `reports.create_report()` requires a user allowed by `get_citizen`.
3. Pydantic validates violation type, location, district, evidence count, future timestamp, and `other` custom description.
4. A `Report` and child `Evidence` rows are persisted.
5. `submit_inference_task()` queues background inference with `report_kind="legacy"`.
6. Audit log records `REPORT_CREATED`.
7. Worker updates status and writes an inference log.
8. Police/admin views consume the presented report.

Request lifecycle example for evidence report submission:

1. Frontend or client calls `POST /api/citizen-reports`.
2. `citizen_reports.create_citizen_report()` requires `get_current_citizen_account`.
3. Duplicate submission detection compares citizen, violation type, incident timestamp, coordinates, creation window, and first evidence metadata.
4. `EvidenceReport` and `EvidenceFile` rows are created.
5. Initial status is recorded via `apply_evidence_report_status()`.
6. SMS and inference tasks are queued best-effort.
7. In-app notifications are created for citizen and police.
8. The worker runs selected violation detection and ANPR.
9. Report moves to `UNDER_REVIEW` or `REJECTED` depending usable evidence.

Business rules:

- Report status transitions are centralized in `services/ml/api/constants.py`.
- Ticket status transitions are also centralized there.
- `TicketCreate` requires exactly one of `report_id` or `evidence_report_id`.
- Tickets require parent report status `VALIDATED`.
- Fine overrides require justification.
- Duplicate active tickets are prevented both in application code and partial unique indexes.
- Citizen-selected `other` reports require custom descriptions and are always manual-review-oriented.

Error handling:

- Routes raise `HTTPException` for validation and authorization failures.
- Task dispatch logs fallback behavior.
- Notification and SMS creation are best-effort and designed not to roll back primary workflows.
- Worker retry handling marks reports rejected after max retries and notifies admins.

Logging:

- Standard Python logging is used.
- Roboflow keys are masked in logs.
- Inference logs are persisted in `inference_logs`.
- Audit logs are persisted for report creation, status updates, ticket creation, ticket status mutation, plate correction, reward claim, and some admin configuration actions.

Backend limitations:

- Most routes are synchronous SQLAlchemy sessions rather than async DB IO.
- Rate limiting is in-memory and per-process.
- No global exception handler standardizes response shape.
- Public registration accepts a role from `UserCreate`; this is a serious security issue because a crafted request can request `ADMIN` or `POLICE` unless otherwise blocked upstream. The UI only sends email/password, but the API schema permits escalation.
- The admin AI threshold endpoint logs the requested value but does not change runtime thresholds.

## 5. Database Analysis

Database architecture uses SQLAlchemy declarative models in `services/ml/api/models.py` with Alembic migrations under `services/ml/migrations/versions`.

Major entities:

- `User`: email/password account for citizen, police, admin roles.
- `Citizen`: newer citizen identity used by evidence reports and SMS/notification flows.
- `Report`: legacy citizen report tied to `User`.
- `Evidence`: legacy evidence rows tied to `Report`, usually data URLs.
- `EvidenceReport`: newer citizen evidence report tied to `Citizen`.
- `EvidenceFile`: newer media metadata tied to `EvidenceReport`.
- `InferenceLog`: AI/ANPR results tied to either `Report` or `EvidenceReport`.
- `InferenceJob`: durable job status for inference dispatch.
- `StatusHistory`: evidence report lifecycle audit.
- `FineRule`: active/versioned penalty rule metadata.
- `TrafficTicket`: enforcement ticket tied to either legacy or evidence reports.
- `TicketStatusHistory`: ticket lifecycle audit.
- `SmsNotification`: SMS dispatch attempts and outcomes.
- `Notification`: in-app notification records.
- `AuditLog`: general audit trail.
- `Reward` and `UserReward`: citizen reward system.

Conceptual ER explanation:

- A `User` can own many legacy `Report` rows.
- A `Report` has many `Evidence` rows, one optional `InferenceLog`, and one optional active `TrafficTicket`.
- A `Citizen` can own many `EvidenceReport` rows.
- An `EvidenceReport` has many `EvidenceFile` rows, many `StatusHistory` rows, many `SmsNotification` rows, one optional `InferenceLog`, and one optional active `TrafficTicket`.
- `TrafficTicket` belongs to exactly one parent report type logically, but database columns are nullable to allow either legacy or evidence parent.
- `TicketStatusHistory` belongs to `TrafficTicket`.
- `Notification` can target either a `User` or a `Citizen` depending audience.
- `FineRule` is copied into ticket snapshots through `fine_rule_id`, `fine_rule_version`, `penal_code`, and `fine_amount`.

Normalization and lifecycle:

- Legacy and newer report paths are partially denormalized in parallel. This preserves backward compatibility but creates duplicated report concepts.
- AI output is stored as both structured columns and a JSON payload in `InferenceLog.bbox_coordinates`. This is pragmatic for fast iteration but trades strict schema validation for flexibility.
- Ticket fields snapshot legal/fine data at issuance time so later fine rule edits do not mutate historical tickets.
- Status-history event listeners store state transitions automatically for evidence reports and tickets.

Indexing:

- Migrations add indexes for tracking IDs, status, dates, districts, report-kind/job status, OCR text, phone number, notification targets, and active ticket uniqueness.
- Partial unique indexes prevent multiple active tickets for the same legacy or evidence report when status is not `CANCELLED` or `CLOSED`.
- Evidence report queue filters benefit from indexes on status, district, violation type, vehicle plate, created_at, and composite status/created_at or violation/created_at indexes.

Database limitations:

- The coexistence of `User` citizens and `Citizen` citizens is an integration debt.
- SQLite compatibility logic mutates schema at startup for local demos; production should rely on Alembic only.
- JSON fields are flexible but harder to query and validate than normalized ML result tables.
- Evidence media access events are not comprehensively audited at retrieval time.

## 6. AI/ML Pipeline Analysis

The implemented AI pipeline is a hybrid hosted/local architecture:

- Hosted Roboflow inference for helmet, red-light, and white-line violation models.
- Local YOLOv8 fallback for helmet detection.
- Local YOLOv8 model for ANPR plate localization.
- EasyOCR for text extraction from cropped plates.
- Sri Lankan plate-format normalization and candidate scoring.
- Manual police review for all enforcement decisions.

YOLOv8 implementation:

- Runtime YOLO usage is in `services/ml/api/worker.py` and `services/ml/inference/anpr_pipeline.py`.
- Training scripts in `services/ml/training` use Ultralytics `YOLO`.
- Local model paths are configured through `HELMET_MODEL_PATH` and `ANPR_MODEL_PATH`.
- Defaults are `services/ml/models/helmet_best.pt` and `services/ml/models/anpr_best.pt`.
- The workspace contains `services/ml/models/anpr_best.pt`, base YOLO weights, and training output weights.

Inference routing:

- `attempt_inference()` selects one specialized violation detector based on the citizen's claimed violation type.
- `helmet` calls `run_helmet_detection()`.
- `red_light` calls `run_red_light_detection()`.
- `white_line` calls `run_white_line_detection()`.
- `other` skips specialized violation models and remains manual review.
- ANPR runs independently for helmet, red-light, white-line, and other when an image is available.

Roboflow integration:

- Shared client logic is in `services/ml/inference/roboflow_common.py`.
- It loads `ROBOFLOW_API_KEY`, optional API URL, and model IDs.
- It handles missing API key, missing `inference-sdk`, timeout, image-not-found, and generic API errors as structured manual-review summaries.
- Model wrappers normalize hosted prediction labels into internal violation families and confidence results.

Fallback architecture:

- Helmet detection has two fallback layers:
  - `helmet_roboflow.py` itself tries a local model when Roboflow returns API/config/timeout failures.
  - `api/worker.py` also attempts local YOLO fallback for certain helmet hosted failures.
- Red-light and white-line wrappers do not have local fallback; they degrade to manual review when Roboflow fails.
- ANPR has local model fallback only in the sense that missing model returns `model_missing`; it does not call a hosted ANPR provider.

Why fallback matters:

- Evidence workflows must not block on an external inference vendor.
- The system preserves operational continuity by forwarding uncertain or failed AI results to police review instead of failing the report submission.
- This is appropriate for a safety/legal workflow because false certainty is more dangerous than manual triage.

Confidence thresholds:

- Helmet threshold defaults to `0.65`.
- Red-light and white-line thresholds default to `0.55`.
- Confidence bands are high `>=0.8`, medium `>=0.5`, low otherwise.
- ANPR detection confidence defaults to `0.15`, which is intentionally permissive for small plate regions.

Post-processing:

- Detections are normalized into `class`, `normalized_class`, confidence, confidence level, and bounding boxes.
- Worker payloads store provider, model ID, status, error, fallback info, claimed/inferred types, and review reason.
- Police UI filters relevant detections and overlays bounding boxes.

Training pipeline:

- `services/ml/training/common.py` defines training targets for `helmet` and `anpr`.
- Helmet default base model is `yolov8s.pt`, default image size `960`, patience `30`.
- ANPR default base model is `yolov8m.pt`, default image size `1280`, patience `40`.
- `services/ml/training/pipeline.py` sets seeds, supports deterministic training, trains via Ultralytics, evaluates selected splits, and writes JSON/Markdown reports.
- `services/ml/training/augmentations.py` monkeypatches Ultralytics Albumentations with traffic-specific blur, motion blur, brightness/contrast, CLAHE, gamma, and compression profiles.
- `train_helmet.py` and `train_anpr.py` are target-specific entry points.
- `evaluate_model.py` evaluates saved YOLO weights without retraining.

Dataset and artifacts:

- Local dataset folders exist for helmet and number plate detection, totaling about 1.8 GB in the workspace. They are gitignored except `datasets/README.md`.
- Helmet datasets include Roboflow-style `Helmet Detection.v1i.yolov8`, `Helmet Detection.v2i.yolov8`, and converted `helmetvd1_yolov8`.
- ANPR datasets include `Automatic Number Plate Recognition.v9i.yolov8` and `Automatic Plate Number Recognition.v4i.yolov8`.
- Dataset audits identify duplicates, invalid boxes, class distribution, and Sri Lanka metadata limitations.
- The ANPR artifact report states a fine-tuned ANPR model achieved precision `0.988`, recall `0.873`, mAP50 `0.962`, mAP50-95 `0.671` in the checked-in report.

CPU/GPU considerations:

- Runtime inference calls YOLO with `device="cpu"` in local paths.
- EasyOCR is initialized with `gpu=False`.
- Training scripts support `--device cuda:0`.
- There is no runtime GPU auto-selection or batching in the API worker.

AI pipeline limitations:

- The active citizen UI submits legacy data URLs, not the newer storage-backed evidence path.
- The worker can decode data-image URLs and filesystem paths, but does not resolve `local://` evidence storage URLs through `resolve_local_storage_path()`. If the newer upload endpoint is used, inference may not find a usable image.
- Red-light and white-line models are hosted-only.
- No MLOps registry, model promotion workflow, drift monitoring, calibration reporting, or GPU worker scheduling exists.
- There is no automated exact-match OCR benchmark tied to real Sri Lankan ground truth in the active pipeline.

## 7. OCR / ANPR Analysis

ANPR is implemented as a two-stage local pipeline:

1. YOLOv8 detects the plate region.
2. EasyOCR reads text from the cropped plate.
3. Plate text is normalized and scored against Sri Lankan plate formats.

Key files:

- `services/ml/inference/anpr_pipeline.py`
- `services/ml/inference/ocr_pipeline.py`
- `services/ml/inference/plate_format.py`
- `services/ml/api/worker.py`
- `services/ml/api/routers/evidence_reports.py`

Preprocessing:

- OCR runs on plate crops, not full evidence frames.
- `OCRPipeline.preprocess_variants()` creates variants including original crop, grayscale/contrast resized image, thresholded image, sharpened image, and adaptive threshold image.
- Skew correction uses OpenCV minimum-area rectangle.
- Denoising, CLAHE, sharpening, Otsu thresholding, and adaptive thresholding are used to improve OCR robustness.

Candidate extraction:

- EasyOCR fragments are sorted left to right.
- Multiple fragments are concatenated and also joined with spaces.
- Candidates below minimum confidence are filtered.
- Candidate selection combines EasyOCR confidence, Sri Lankan format score, normalization confidence adjustment, and a small detection confidence contribution.

Sri Lankan plate handling:

- Province codes supported: `WP`, `CP`, `SP`, `NP`, `EP`, `NW`, `NC`, `UV`, `SG`.
- Supported formats include three-letter series, two-letter series, province-prefixed versions, and legacy numeric plates.
- OCR confusion correction maps common letter/digit mistakes such as `O/Q/D` to `0`, `I/L` to `1`, `S` to `5`, `B` to `8`, and reverse mappings in prefix sections.

Police workflow integration:

- Inference logs store raw OCR text, normalized text, detection confidence, OCR confidence, plate bounding box, crop path, status, validation status, and error.
- `PATCH /api/evidence-reports/{report_id}/plate` lets police/admin users correct OCR output.
- Manual correction is normalized, stored in both `EvidenceReport.vehicle_plate` and `InferenceLog`, and audited with `PLATE_NUMBER_CORRECTED`.
- Citizen users cannot correct plate numbers.

Limitations:

- EasyOCR is generic English OCR, not a Sri Lankan plate-specific OCR model.
- ANPR dataset metadata does not prove Sri Lankan-specific training data.
- Plate crops are served through `/api/media/plate-crops/{filename}` without signed URL or auth enforcement.
- OCR confidence is not legal certainty; it remains advisory.

## 8. Evidence Processing Workflow

Full intended lifecycle:

Citizen upload:

- Citizen fills `ReportWizard.tsx`.
- Frontend validates violation type, time, Sri Lankan location/district, evidence count, evidence type, file size, and custom violation details.
- Draft state is saved in IndexedDB so auth redirects or submission errors do not lose the form.

Backend validation:

- Legacy path: `POST /api/reports` validates `ReportCreate`.
- Newer path: `POST /api/citizen-reports` validates `CitizenEvidenceReportCreate`.
- New media upload path: `POST /api/media/evidence-uploads` validates MIME type, magic bytes, and max file size.

Storage:

- Legacy reports store evidence as data URLs in `evidence.url`.
- Newer evidence reports store `EvidenceFile` metadata and can point to data URLs, local storage URLs, HTTPS URLs, localhost URLs, or server paths.
- `evidence_storage.py` stores uploaded media under `EVIDENCE_STORAGE_ROOT` with SHA-256 checksum and metadata.

Queue:

- `submit_inference_task()` creates or reuses an `InferenceJob`.
- It queues via RQ when Redis is configured and available, or FastAPI `BackgroundTasks` otherwise.

AI inference:

- Worker moves submitted reports to `AI_PROCESSING`.
- Worker selects a primary image.
- Worker runs selected violation detector and ANPR.
- Results are persisted into `InferenceLog`.

OCR:

- ANPR detects plate box, crops plate, runs OCR variants, normalizes candidate text, and returns structured status.

Police review:

- Evidence reports appear in `/api/evidence-reports/page`.
- Police detail page shows evidence, AI detections, ANPR crop/text, manual correction, review notes, and actions.
- Officer can move report to under review, validated, rejected, or closed according to transition rules.

Ticket generation:

- Ticket is created through `/api/tickets` or the legacy `/api/reports/{id}/ticket`.
- Parent report must be `VALIDATED`.
- Fine rule is selected by violation type unless overridden with reason.
- Ticket enters `ISSUED` by default.

Status updates:

- Report and ticket status changes are validated, persisted, audited, and used for notification/SMS dispatch.

Current implementation caveat:

- The active citizen wizard uses the legacy report API, not the newer media/evidence-report path. The full modern lifecycle exists in backend code, but the current frontend is not fully wired to it.

## 9. Authentication & Security Analysis

Actual authentication:

- Active auth is email/password with bcrypt hashing and JWT tokens.
- `POST /api/auth/register` creates a `User`.
- `POST /api/auth/login` uses OAuth2 password form data and returns a bearer token.
- The backend also sets an HttpOnly cookie named `lexvision_staff_session`, but the frontend primarily uses the bearer token in localStorage.
- There is no active OTP/SMS login route. SMS is used for notifications, not authentication.

JWT implementation:

- Tokens are signed with HS256.
- `SECRET_KEY` comes from env; if absent, a random runtime secret is generated and logged as a warning.
- Token expiry defaults to 24 hours in code, while `.env.example` shows `ACCESS_TOKEN_EXPIRE_MINUTES=60`.
- Staff tokens use email subject. Citizen-specific tokens can use citizen ID and `token_scope="citizen"`, but active email login emits staff-style tokens.

RBAC:

- Backend route dependencies enforce actual access:
  - `get_admin`: admin only.
  - `get_police`: police/admin.
  - `get_citizen`: citizen/police/admin.
  - `get_current_citizen_account`: citizen account resolution for evidence reports and citizen notifications.
- Frontend guards are convenience only.

Password handling:

- Passwords are bcrypt-hashed in `auth.py`.
- `passlib` is listed in requirements but direct bcrypt functions are used in active auth code.

Upload security:

- `evidence_storage.py` enforces MIME allowlist, size limit, and magic-byte checks.
- Filenames are sanitized.
- Local storage paths are resolved under the configured storage root.
- Signed evidence URLs use HMAC with expiry.
- Evidence media endpoint accepts either a valid signature or an authorized bearer token.

Security strengths:

- Production config rejects missing critical secrets and disallows noop SMS provider in production.
- CORS origins are explicit outside local development.
- Basic security headers are added.
- Media access has signed URLs and role/citizen ownership checks for `EvidenceFile`.
- Status-changing routes require police/admin roles.

Security issues:

- Public registration can accept `role` because `UserCreate` includes `role: RoleEnum = CITIZEN`. This allows API-level role escalation unless blocked externally.
- Bearer tokens are stored in localStorage.
- Plate crop media endpoint has path traversal checks but no auth/signature.
- Public tracking endpoints expose reports by tracking ID without auth. This is a product choice, but tracking IDs become bearer-like secrets.
- Rate limiting is in-process only and not distributed.
- No token revocation, refresh token rotation, account lockout, password reset, MFA, or session inventory exists.
- `.env.local` files in the workspace contain Firebase public config and a phone test token. They are ignored by git but still present locally. Firebase is not active in current auth code.

## 10. Redis / Background Processing Analysis

Background processing is implemented in `services/ml/api/tasks.py`.

Queue modes:

- `QUEUE_BACKEND=background`: always use FastAPI `BackgroundTasks`.
- `QUEUE_BACKEND=auto`: use RQ when Redis is configured and reachable; otherwise fall back to background tasks.
- `QUEUE_BACKEND=rq`: require Redis and raise if unavailable.

Inference job handling:

- `_create_inference_job()` persists an `InferenceJob` row with report ID, report kind, backend, status, max retries, and idempotency metadata.
- If a queued/processing job already exists for the same report kind/report ID, it is reused.
- RQ jobs call `api.tasks.run_inference_job`.
- Background jobs call the same durable job runner when persistence succeeded.
- Job statuses move through `queued`, `processing`, `completed`, and `failed`.

Retry logic:

- RQ uses retry intervals `[10, 30, 60]`.
- Worker-level `run_inference()` also loops attempts and sleeps two seconds between failures.
- After max retries, reports are marked `REJECTED` and admins are notified.

SMS jobs:

- `submit_sms_task()` uses the same RQ/background selection.
- SMS dispatch is best-effort and logs failures into `sms_notifications`.

Why async matters:

- ML inference and OCR are CPU-heavy and can take seconds.
- Report submission should persist evidence first and return without holding the HTTP request open for model inference.
- Durable job rows make failures visible to admin dashboards.

Limitations:

- FastAPI `BackgroundTasks` are not durable across process crashes.
- RQ worker deployment is implemented but no Docker/systemd/Kubernetes deployment files exist.
- No dead-letter queue or job requeue UI exists.
- Inference model execution is still in Python process space; no GPU worker pool, batching, or autoscaling is implemented.

## 11. Resilience & Failover Analysis

Resilience mechanisms present:

- Roboflow missing API key, missing SDK, timeout, and API errors become structured manual-review summaries.
- Helmet inference has local YOLO fallback.
- Red-light and white-line failure paths degrade to manual review.
- ANPR model missing returns `model_missing` and marks manual review.
- EasyOCR failures return empty/failed OCR output rather than crashing the whole inference pipeline.
- SMS errors are persisted and do not roll back report status.
- Inference job failures are retried and eventually surfaced as rejected/failed state plus admin notification.
- Queue auto mode falls back to background tasks when Redis is unavailable.
- Production config fails fast for missing critical deployment settings.

Architectural importance:

- The workflow's critical guarantee is not "AI always succeeds"; it is "citizen evidence is not lost and police can still review it."
- That is the correct reliability posture for enforcement software. Graceful degradation is safer than automatic decisioning under partial failure.

Tradeoffs:

- Fallback-to-manual-review increases human workload.
- Local YOLO fallback for helmet is useful but duplicated in two modules.
- Red-light and white-line have no local model fallback.
- Background-task fallback is convenient for demos but weaker than Redis/RQ for production.
- Rejection on "no usable image" can be triggered by the unresolved `local://` evidence issue, so storage/inference integration must be fixed before relying on the modern upload path.

## 12. Admin Dashboard Analysis

Admin capabilities implemented:

- Analytics dashboard: total reports, pending review, verified/rejected counts, status distribution, trend chart, violation stats, district stats, AI metrics, ANPR metrics, and recent audit activity.
- Report management: all reports across legacy and evidence tables with filters/search and CSV export.
- User management: list/create users.
- Fine rules engine: create/update rules, active flag, version display.
- Notifications: staff notification center with unread counts, category tabs, mark read/all read, and delete.
- Settings: UI for system name/contact/timezone plus AI threshold selection.

Backend admin endpoints:

- `/api/admin/audit-logs`
- `/api/admin/analytics/reports-trend`
- `/api/admin/analytics/status-ratio`
- `/api/admin/analytics/violation-types`
- `/api/admin/analytics/districts`
- `/api/admin/analytics/ai-metrics`
- `/api/admin/analytics/anpr-performance`
- `/api/admin/analytics/officers`
- `/api/admin/worker/health`
- `/api/admin/inference-jobs`
- `/api/admin/storage/cleanup`
- `/api/admin/analytics/heatmap`
- `/api/admin/export/reports`
- `/api/admin/export/analytics-summary`

Hidden sophistication:

- Admin analytics aggregate legacy `Report` and newer `EvidenceReport` tables.
- Admin worker health exposes queue backend, Redis health, and job counts.
- Storage cleanup removes orphaned local files while preserving recently modified files.
- ANPR performance metrics count OCR success/failure, manual corrections, and failure statuses.

Limitations:

- Settings UI is partly placeholder. AI threshold is not persisted or applied.
- User management has no disable/delete/reset password UI.
- Analytics cache is process-local, not Redis-backed.
- Export endpoints are admin-only; police dashboard tries admin export and catches failure.

## 13. Police Workflow Analysis

The police workflow is the strongest user-facing implementation.

Queue triage:

- `Queue.tsx` uses server-side pagination and filtering against `/api/evidence-reports/page`.
- Filters include status, violation type, district, search, and sort.
- Search spans tracking ID, vehicle plate, district, OCR text, and citizen phone in the backend.

Evidence review:

- `ViolationDetails.tsx` displays evidence images/videos, location, citizen report data, claimed/inferred/final violation data, AI summaries, confidence, and manual review reasons.
- Relevant detections are selected and rendered as bounding boxes.
- Plate bounding box and crop are treated separately to reduce clutter.

AI-assisted decision support:

- Officer guidance is derived from AI confidence, manual review flags, inferred violation type, and failure states.
- The UI supports AI rerun for evidence reports, but not legacy reports.
- The UI warns/requests confirmation before approval if AI is inconclusive.

Manual validation:

- Officer can move cases through under-review, validated, rejected, and closed.
- Backend validates status transitions.
- Validated reports can produce tickets.
- `other` reports are custom/manual by design.

OCR correction:

- Police/admin can correct plate text for evidence reports.
- Correction updates report vehicle plate, inference log OCR fields, and manual correction metadata.

Ticket workflow:

- Officer chooses/loads fine rules, enters optional offender data, notes, and override justification when changing fine details.
- Backend enforces validated parent report and duplicate active ticket prevention.
- Ticket PDF can be downloaded after issue.

Limitations:

- Main queue only uses evidence reports. Legacy reports created by the current citizen wizard may require dashboard/history paths rather than queue path.
- Police export button calls admin CSV and can fail due to RBAC.
- The dashboard identity display is static in layout code rather than derived from the logged-in profile.

## 14. File Storage & Media Handling

Storage paths:

- Legacy evidence: `Evidence.url`, often data URLs.
- Modern evidence: `EvidenceFile.storage_url`, `storage_backend`, `storage_path`, checksum, MIME type, original name, and size.
- Local uploaded evidence root: `EVIDENCE_STORAGE_ROOT` or `services/ml/storage/evidence`.
- ANPR crops: `services/ml/storage/plate_crops`.

Upload handling:

- `POST /api/media/evidence-uploads` accepts `UploadFile`.
- It requires a current citizen account.
- It returns metadata in the same shape accepted by `CitizenEvidenceFileCreate`.

Security controls:

- Allowed MIME types: JPEG, PNG, WEBP, MP4, WEBM, MOV.
- Default max size: 25 MB.
- Magic-byte validation for image formats and basic video checks.
- Path traversal prevention.
- HMAC-signed URLs for evidence media.

Media serving:

- `GET /api/media/evidence/{file_id}` authorizes via signature or bearer token.
- Citizen scoped tokens are checked against report ownership.
- Staff tokens are checked for police/admin.
- Data URLs can be decoded and returned for backward compatibility.
- Local storage files are returned as `FileResponse`.

Limitations:

- Plate crop serving is unauthenticated beyond filename validation.
- No cloud object storage provider is implemented.
- No antivirus/malware scanning, EXIF stripping, image transcoding, or content moderation exists.
- The modern storage path is not wired into the active citizen wizard.
- The worker does not currently decode `local://` paths for inference.

## 15. PDF/Ticket Generation Analysis

PDF generation is implemented in `services/ml/api/services/pdf_generator.py` with `fpdf2`.

Flow:

1. Police/admin creates a ticket after report validation.
2. Ticket stores ticket number, fine snapshot, offender fields, vehicle plate, due date, status, and notes.
3. `GET /api/tickets/{ticket_id}/notice.pdf` checks police/admin auth.
4. Backend generates an in-memory PDF and streams it as an attachment.

Formatting:

- Header/footer are implemented in `TicketNoticePDF`.
- Sections include notice metadata, violation/ticket details, payment instructions, appeal instructions, and legal disclaimer.
- The PDF states that AI-assisted evidence requires police validation.

Evidence integration:

- The PDF includes textual evidence/report/ticket details.
- It does not embed source evidence images or ANPR crop images.

Legal/documentation implications:

- Ticket generation is designed as an enforcement notice, but final legal compliance would require jurisdiction-specific statutory text, payment integration, evidence package integrity, and official officer identity/signature controls. `[Code evidence insufficient]` for full legal-grade notice compliance.

## 16. API Analysis

Major endpoint categories:

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/citizen/me`.
- Legacy reports: `/api/reports`, `/api/reports/{id}`, `/api/reports/tracking/{tracking_id}`, `/api/reports/{id}/status`, `/api/reports/{id}/ticket`, `/api/reports/{id}/evidence`.
- Citizen evidence reports: `/api/citizen-reports`, `/api/citizen-reports/me`, `/api/citizen-reports/me/{id}`, `/api/citizen-reports/tracking/{tracking_id}`.
- Staff evidence reports: `/api/evidence-reports`, `/api/evidence-reports/page`, `/api/evidence-reports/{id}`, `/api/evidence-reports/{id}/status`, `/api/evidence-reports/{id}/rerun-inference`, `/api/evidence-reports/{id}/plate`.
- Tickets: `/api/tickets`, `/api/tickets/{id}`, `/api/tickets/by-report/{id}`, `/api/tickets/by-evidence-report/{id}`, `/api/tickets/{id}/status`, `/api/tickets/{id}/notice.pdf`.
- Fine rules: `/api/fine-rules`, `/api/fine-rules/{violation_type}`, `/api/fine-rules/{rule_id}`.
- Users/rewards: `/api/users/me`, `/api/users/me/reports`, `/api/users/rewards`, `/api/users/rewards/claim/{id}`, admin `/api/users`.
- Media: `/api/media/evidence-uploads`, `/api/media/evidence/{file_id}`, `/api/media/plate-crops/{filename}`.
- Notifications: `/api/notifications` for staff and `/api/citizen-notifications` for citizens.
- Admin: `/api/admin/*`.
- Health/docs: `/`, `/health`, `/docs`.

API design philosophy:

- Role-specific routes are explicit rather than hidden behind one generic report route.
- Backward compatibility is preserved through legacy and evidence report APIs.
- Status mutation endpoints validate transition maps.
- The API returns rich report representations with nested evidence, inference log, and AI summary presenters.
- Public tracking endpoints are intentionally unauthenticated.

Limitations:

- The API has duplicated report models and duplicated ticket creation paths.
- Some frontend calls are mismatched with newer backend endpoints.
- Public register role issue is an API-level vulnerability.

## 17. Configuration & Environment Analysis

Backend environment:

- Database: `DATABASE_URL`
- Redis/queue: `REDIS_URL`, `QUEUE_BACKEND`, `RQ_*`, `INFERENCE_JOB_MAX_RETRIES`
- Evidence storage: `EVIDENCE_STORAGE_ROOT`, `MAX_EVIDENCE_UPLOAD_BYTES`, `MEDIA_SIGNING_SECRET`
- Auth: `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- CORS/rate limits: `CORS_ALLOWED_ORIGINS`, `PUBLIC_API_BASE_URL`, `RATE_LIMIT_PER_MINUTE`, `AUTH_RATE_LIMIT_PER_MINUTE`
- ML: `ROBOFLOW_API_KEY`, model IDs, `HELMET_MODEL_PATH`, `ANPR_MODEL_PATH`, thresholds
- SMS: `SMS_PROVIDER`, sender/country/timeout, Twilio/Mobitel/Dialog/Hutch settings

Frontend environment:

- `VITE_API_BASE_URL`
- Citizen app also documents admin/police dashboard URLs.

Production readiness:

- `production_config.py` has real fail-fast validation.
- Production requires Redis URL, stable secrets, allowed origins, media signing secret, public API base URL, and SMS provider credentials.
- SQLite is allowed for local but PostgreSQL is preferred.

Missing deployment artifacts:

- No Dockerfile, docker-compose, Kubernetes manifests, systemd services, or CI workflow files were found.
- Migrations exist, but deployment automation is manual.
- `.env.example` is clear; actual `.env` is ignored and present locally but not part of git.

## 18. Dependency Analysis

Frontend dependencies:

- React 19.2: UI framework.
- React DOM 19.2: browser rendering.
- React Router DOM 7.13: routing.
- lucide-react: icon system.
- Vite 7.2: dev server/build tool.
- TypeScript 5.9: static typing.
- ESLint and plugins: linting.

Backend/API dependencies:

- FastAPI: web framework and dependency injection.
- Uvicorn: ASGI server.
- SQLAlchemy: ORM.
- Alembic: migrations.
- Pydantic v2: request/response validation.
- psycopg2-binary: PostgreSQL sync driver.
- python-jose: JWT.
- bcrypt: password hashing.
- python-multipart: upload handling.
- redis/rq: queue backend.
- fpdf2: PDF generation.

ML/OCR dependencies:

- ultralytics: YOLOv8 training/inference.
- torch/torchvision/torchaudio: ML runtime.
- OpenCV: image decoding, preprocessing, crops.
- EasyOCR: OCR.
- Albumentations: training augmentation.
- inference-sdk: Roboflow hosted inference.
- pandas/matplotlib/PyYAML/tqdm: training/evaluation/reporting utilities.

Dependency observations:

- `passlib` is installed but active auth uses bcrypt directly.
- `firebase` frontend local env values exist, but Firebase auth/storage is not active in source.
- Heavy model/dataset artifacts exist locally; only some model weights are tracked.

## 19. Engineering Decisions & Tradeoffs

Citizen-driven reporting:

- This design turns traffic evidence collection into a distributed citizen workflow. It increases coverage and civic participation.
- Tradeoff: it introduces evidence authenticity, privacy, false reporting, and moderation risks.
- The code mitigates some risk through police validation, status history, audit logs, and rejection workflows, but does not implement cryptographic chain-of-custody or fraud scoring.

YOLOv8:

- YOLOv8 is appropriate for object detection tasks requiring bounding boxes on traffic images.
- It supports transfer learning, small-object training, CLI/runtime consistency, and a widely used ecosystem.
- Tradeoff: model outputs require dataset quality, threshold tuning, and officer review; object detection alone does not prove legal violations in all contexts.

FastAPI:

- FastAPI provides strong request validation, dependency injection, async-capable routing, OpenAPI docs, and simple integration with Python ML code.
- Tradeoff: active DB access is synchronous and CPU-heavy ML in the web service can affect API responsiveness unless isolated into workers.

React:

- React/Vite enables fast app iteration and component sharing across role-specific portals.
- Tradeoff: multiple apps duplicate some auth/login/layout patterns.

Asynchronous processing:

- Inference and SMS are moved off the request path to avoid blocking report submission.
- Durable `InferenceJob` records improve observability.
- Tradeoff: background task fallback is not production durable.

Cloud vs local inference:

- Roboflow accelerates integration for hosted violation detectors.
- Local YOLO fallback reduces vendor outage impact for helmet detection.
- Tradeoff: hosted dependencies need secrets/network and local inference needs compute/model management.

Maintainability:

- Shared packages reduce frontend duplication.
- Backend routers/services are modular.
- Legacy/new report coexistence increases complexity and must be resolved.

## 20. Code Quality & Software Engineering Analysis

Strengths:

- Clear monorepo organization.
- Strong separation between frontend apps and shared packages.
- Backend route modules are domain-oriented.
- SQLAlchemy models capture a real workflow domain.
- Alembic migrations are present and include idempotent compatibility checks.
- Pydantic validators enforce domain constraints such as Sri Lankan district bounds and custom violation requirements.
- Inference output is structured enough for UI review, analytics, and audit trails.
- Tests cover tickets, citizen report validation, inference routing, ANPR behavior, plate correction, and analytics.
- Resilience paths are explicitly implemented rather than left to unhandled exceptions.

Weaknesses:

- Legacy `Report` and newer `EvidenceReport` pipelines are both active and not fully reconciled.
- The API client name `mockDb` is stale.
- Frontend citizen submission uses legacy API while police queue uses evidence reports.
- Modern storage uploads are not integrated end to end with worker image decoding.
- Public registration role escalation is a critical issue.
- Admin settings threshold is not functional.
- Some generated/local artifacts are present in workspace and can obscure source review.
- Some old scripts at `services/ml/test_api.py`, `test_post.py`, `test_query.py`, `test_admin.py`, `test_helmet_api.py`, and `test_anpr_api.py` appear to be manual/debug scripts rather than formal tests.

Architectural patterns:

- Layered backend: routers, schemas, models, services, tasks, worker, presenters.
- Presenter pattern for API response enrichment in `presenters.py`.
- Event-listener audit pattern for status history.
- Strategy-like provider abstraction for SMS.
- Queue abstraction for RQ/background tasks.
- Adapter pattern in frontend API client mapping backend payloads to UI types.

## 21. UNUSED / DEPRECATED FEATURES

Identified dead/partial/stale areas:

- `packages/api-client/src/mockDb.ts`: name is obsolete and includes debug logging.
- `services/ml/api/worker.py` contains older local ANPR helper functions (`_run_plate_detection`, `_run_plate_ocr`, etc.) while the active path uses `services/ml/inference/anpr_pipeline.py`.
- Helmet fallback exists both in `helmet_roboflow.py` and `api/worker.py`, creating duplicated behavior.
- `services/ml/inference/README.md` mentions Dockerfiles for inference services, but no Dockerfiles were found.
- Firebase env values exist locally, and `Citizen.firebase_uid` remains in the schema/model, but active authentication is email/password/JWT.
- Migration name `20260407_0001_bootstrap_postgres_and_add_citizen_otp_tracking.py` mentions OTP tracking, but active OTP/SMS auth is not implemented.
- SMS providers for Mobitel/Dialog/Hutch exist but intentionally raise provider errors because payload mapping is not finalized.
- `NoopSmsProvider` exists for local behavior and records failure-like outcomes; production config disallows noop.
- Public marketing pages contain claims that are stronger than code evidence in some areas, such as full chain-of-custody. `[Code evidence insufficient]` for legal-grade chain-of-custody.
- Admin settings UI contains editable system name/contact/timezone inputs that are not persisted.
- Local `.env.local` frontend files and `.env` backend file are present but ignored; they should not be treated as deployable config.

Should they remain?

- Keep legacy APIs until frontend is migrated, then deprecate intentionally.
- Remove or rename `mockDb` once migration is stable.
- Remove duplicate worker ANPR helpers or add tests showing why they remain.
- Keep SMS stubs only if they are clearly documented as not production-ready.
- Remove stale Dockerfile mentions or add real deployment files.

## 22. Deployment & Production Readiness

Implemented production-oriented elements:

- Production config validation.
- PostgreSQL-compatible migrations.
- Redis/RQ worker support.
- Durable inference jobs.
- Signed media URLs.
- Basic rate limiting and security headers.
- Audit logs and status histories.
- Admin health/worker/job endpoints.
- Fine rules, ticket lifecycle, and PDF notices.

Missing DevOps/MLOps components:

- No Docker/docker-compose/Kubernetes artifacts.
- No CI workflow found.
- No automated migration deployment script.
- No process manager config for API/worker.
- No object storage provider.
- No GPU worker deployment model.
- No model registry or artifact version promotion process.
- No observability stack for logs, metrics, tracing, alerting.
- No backup/restore runbooks.
- No load testing artifacts.

Scalability:

- PostgreSQL can scale better than SQLite and is the intended production store.
- Redis/RQ can isolate inference and SMS work from request handling.
- Current local background task fallback is single-process and not durable.
- Media on local disk blocks horizontal scaling unless shared storage or object storage is added.
- CPU EasyOCR/YOLO can bottleneck under concurrent uploads.

Production limitations:

- Public role escalation must be fixed before deployment.
- Storage/inference `local://` gap must be fixed before modern media uploads are used in production.
- Plate crop access should be protected.
- Frontend should use HttpOnly cookie auth or stronger token storage strategy.

## 23. Overall System Strengths

The strongest engineering aspects are:

- A real end-to-end workflow from submission to review, validation, ticketing, PDF generation, notifications, and analytics.
- Human-in-the-loop architecture that treats AI as decision support.
- Robust domain modeling of report states, ticket states, fine rules, audit logs, notifications, and inference logs.
- Resilience-aware ML integration with structured failure states and manual review.
- ANPR pipeline sophistication: crop-only OCR, multi-variant preprocessing, candidate scoring, Sri Lankan plate normalization, manual correction, and analytics.
- Shared frontend packages that keep three apps coherent.
- Training and dataset tooling that goes beyond runtime inference and supports reproducibility, dataset audit, augmentation, evaluation, and model reports.

## 24. Overall System Limitations

Current limitations:

- Two report models are active and not fully reconciled.
- Main citizen submission path does not use the newest evidence-report/storage architecture.
- Main police queue only reads evidence reports.
- Citizen notifications are wired to staff endpoints in the frontend.
- Public registration can create privileged roles if a crafted API request includes role.
- Admin AI threshold UI does not affect inference.

AI limitations:

- Red-light and white-line are Roboflow-only in runtime.
- Helmet fallback is duplicated.
- No runtime GPU scheduling or batch inference.
- No model drift monitoring or confidence calibration.
- Dataset quality issues exist: duplicates, invalid boxes, non-Sri-Lanka-specific ANPR metadata.

OCR limitations:

- EasyOCR is generic.
- Plate normalization helps but cannot guarantee correctness.
- Ground-truth OCR evaluation is limited by unavailable plate-text labels in YOLO datasets.

Deployment limitations:

- No container/deployment files.
- Local disk storage prevents easy multi-node scaling.
- Redis worker support exists but must be deployed and monitored externally.

## 25. Future Improvement Recommendations

High-priority fixes:

- Restrict public registration to `CITIZEN` regardless of request body; reserve police/admin creation for admin-only `/api/users`.
- Migrate citizen wizard to `/api/media/evidence-uploads` and `/api/citizen-reports`.
- Update worker image selection to resolve `local://`/`storage_path` via `resolve_local_storage_path()`.
- Update citizen notification frontend to call `/api/citizen-notifications`.
- Protect `/api/media/plate-crops/{filename}` with signed URLs or bearer auth.
- Rename `mockDb` to `apiClient` or split by domain.

Architectural improvements:

- Consolidate legacy `Report` and `EvidenceReport` or add an explicit compatibility facade.
- Move AI threshold config into persisted settings and apply it at runtime.
- Add WebSocket/SSE or push notification support for dashboards.
- Add object storage provider with signed cloud URLs.
- Add access audit logs for media retrieval.

MLOps improvements:

- Add a model registry folder/DB table with active model version, metrics, checksum, and promotion metadata.
- Add automated evaluation gates before model promotion.
- Track OCR correction feedback and use it to measure real-world ANPR accuracy.
- Train a Sri Lankan plate OCR model or OCR fine-tuning dataset.
- Add GPU worker pool support and configurable device selection.

Security improvements:

- Move frontend auth from localStorage bearer tokens toward HttpOnly cookie sessions or short-lived tokens with refresh rotation.
- Add password reset, account lockout, and admin user disable flows.
- Add Redis-backed/distributed rate limiting.
- Add malware scanning and EXIF stripping for uploads.
- Add stronger public tracking privacy controls.

Deployment improvements:

- Add Dockerfile and docker-compose for API, Redis, worker, and frontend apps.
- Add CI for TypeScript builds, lint, backend tests, Alembic upgrade, and security scanning.
- Add monitoring for API latency, worker failures, queue depth, Redis availability, SMS failures, and model inference latency.
- Add database backup/restore documentation and migration rollback procedures.

## Final Assessment

LexVision is not a thin prototype. It contains a substantial multi-role workflow system, real backend domain modeling, AI/ML training and inference assets, resilient job dispatch, OCR/ANPR sophistication, ticket lifecycle enforcement, and admin analytics.

Its main engineering debt is not lack of features; it is integration alignment. The newer evidence-report/storage architecture, police paginated queue, citizen frontend submission, worker image decoding, and citizen notifications need to be brought onto the same path. Once those are reconciled and the role-escalation/security issues are fixed, the system would have a much stronger production posture.

## Appendix A. Module-by-Module Implementation Inventory

This appendix records the major modules reviewed so the report is traceable to actual code locations.

### Frontend Applications

Citizen portal:

- `apps/citizen-portal/src/App.tsx`: top-level route graph, loading overlay, public and portal route grouping.
- `apps/citizen-portal/src/layouts/PublicLayout.tsx`: public/portal shell with shared navigation and footer.
- `apps/citizen-portal/src/components/ProtectedRoute.tsx`: citizen session guard.
- `apps/citizen-portal/src/pages/public/Login.tsx`: email/password login, role-based dashboard redirects for non-citizen accounts, tracking widget, draft resume integration.
- `apps/citizen-portal/src/pages/public/Register.tsx`: email/password registration; no frontend role selection.
- `apps/citizen-portal/src/pages/portal/ReportWizard.tsx`: multi-step citizen report flow, file validation, geolocation, Sri Lankan bounds, draft preservation, auth redirect, and legacy submission.
- `apps/citizen-portal/src/lib/reportDraft.ts`: IndexedDB draft persistence.
- `apps/citizen-portal/src/lib/reportStatus.ts`: frontend status labels and source labels.
- `apps/citizen-portal/src/pages/portal/MyReports.tsx`: citizen report list, profile, rewards, reward claiming.
- `apps/citizen-portal/src/pages/portal/MyReportDetail.tsx`: citizen report details and status timeline.
- `apps/citizen-portal/src/pages/portal/TrackReport.tsx`: unauthenticated tracking lookup.
- `apps/citizen-portal/src/hooks/useNotifications.ts`: polling notification hook, currently wired to staff notification API helpers.

Police dashboard:

- `apps/police-dashboard/src/App.tsx`: protected police/admin route graph.
- `apps/police-dashboard/src/layouts/DashboardLayout.tsx`: dashboard shell, sidebar, topbar, notification dropdown, logout.
- `apps/police-dashboard/src/pages/Dashboard.tsx`: KPI and workload overview based on all reports.
- `apps/police-dashboard/src/pages/Queue.tsx`: paginated evidence report review queue with filters/search/sort.
- `apps/police-dashboard/src/pages/ViolationDetails.tsx`: central officer decision screen; evidence viewer, AI overlay, ANPR correction, status actions, ticket issue, PDF download.
- `apps/police-dashboard/src/pages/History.tsx`: resolved report history.
- `apps/police-dashboard/src/pages/Settings.tsx`: local dashboard preferences.
- `apps/police-dashboard/src/hooks/useNotifications.ts`: staff notification polling and optimistic read/delete handling.
- `apps/police-dashboard/src/utils/officerAi.ts`: AI summary interpretation for officer priority/guidance.

Admin dashboard:

- `apps/admin-dashboard/src/App.tsx`: admin-only route graph.
- `apps/admin-dashboard/src/layouts/DashboardLayout.tsx`: admin shell and notification dropdown.
- `apps/admin-dashboard/src/pages/Dashboard.tsx`: analytics, audit activity, report trends, AI/ANPR metrics.
- `apps/admin-dashboard/src/pages/Reports.tsx`: all-report table and CSV export.
- `apps/admin-dashboard/src/pages/Users.tsx`: staff/admin account creation and user list.
- `apps/admin-dashboard/src/pages/RulesEngine.tsx`: fine rule CRUD interface.
- `apps/admin-dashboard/src/pages/Notifications.tsx`: notification center.
- `apps/admin-dashboard/src/pages/Settings.tsx`: partially implemented platform/AI settings UI.

Shared frontend packages:

- `packages/api-client/src/auth.ts`: API base URL normalization, email/password login/register/logout, localStorage session, JWT expiry parsing, dashboard role checks.
- `packages/api-client/src/mockDb.ts`: real API adapter, mapping layer, media URL resolver, AI summary mapper, report/ticket/fine/notification/admin client methods.
- `packages/types/src/index.ts`: shared domain vocabulary for reports, AI summaries, tickets, notifications, fine rules, rewards, and districts.
- `packages/ui/src/components/*`: reusable UI primitives.
- `packages/ui/src/components/dashboard/*`: reusable dashboard layout, sidebar, topbar, panel, KPI, table, badge components.
- `packages/ui/src/styles/variables.css`: cross-app design tokens.

### Backend API Modules

Core setup:

- `services/ml/api/server.py`: FastAPI app, lifespan, middleware, CORS, startup seeds, SQLite compatibility, router inclusion, health endpoint.
- `services/ml/api/database.py`: SQLAlchemy engine/session/base setup.
- `services/ml/api/env.py`: environment loading and Roboflow config masking.
- `services/ml/api/production_config.py`: production fail-fast validation and CORS origin rules.
- `services/ml/api/constants.py`: role/status enums, report/ticket transition maps, SMS provider enum.
- `services/ml/api/locations.py`: Sri Lankan district normalization and geographic bounds.
- `services/ml/api/violation_types.py`: claimed violation aliases and canonicalization.

Models and validation:

- `services/ml/api/models.py`: all persistence models, relationships, indexes, and status-history event listeners.
- `services/ml/api/schemas.py`: Pydantic request/response models and field/model validators.
- `services/ml/api/presenters.py`: response enrichment for reports, evidence reports, signed evidence URLs, and AI summaries.
- `services/ml/api/tracking.py`: status transition helpers and SMS log creation.
- `services/ml/api/dependencies.py`: DB/current user/current citizen/RBAC/JWT/audit dependencies.

Routers:

- `services/ml/api/routers/auth.py`: public register/login/logout and citizen profile lookup.
- `services/ml/api/routers/reports.py`: legacy reports, status updates, ticket compatibility, evidence lookup.
- `services/ml/api/routers/citizen_reports.py`: newer citizen evidence report creation/list/detail/tracking.
- `services/ml/api/routers/evidence_reports.py`: staff evidence report list/page/detail/status/rerun/plate correction.
- `services/ml/api/routers/tickets.py`: dedicated ticket create/list/detail/status/PDF endpoints.
- `services/ml/api/routers/admin.py`: analytics, audit logs, worker health, inference jobs, storage cleanup, exports.
- `services/ml/api/routers/users.py`: profile, user reports, rewards, admin user list/create.
- `services/ml/api/routers/fine_rules.py`: fine rule CRUD and active rule lookup.
- `services/ml/api/routers/media.py`: evidence upload, signed/authorized media serving, plate crop serving.
- `services/ml/api/routers/notifications.py`: staff and citizen in-app notification APIs.

Services:

- `services/ml/api/services/evidence_storage.py`: local storage provider, upload validation, HMAC signing, path resolution, orphan cleanup.
- `services/ml/api/services/notifications.py`: best-effort in-app notification creation and read/delete state mutation.
- `services/ml/api/services/pdf_generator.py`: enforcement notice PDF generator.
- `services/ml/api/sms/*`: provider abstraction, templates, dispatch service, provider implementations, config, exceptions.

Background work:

- `services/ml/api/tasks.py`: RQ/background queue abstraction, `InferenceJob` persistence, retry metadata, SMS dispatch task.
- `services/ml/api/worker.py`: report inference orchestrator, selected violation model routing, ANPR integration, status updates, inference log writes, notification after inference.
- `services/ml/worker.py`: durable RQ worker entry point.

### Machine Learning and OCR Modules

Inference:

- `services/ml/inference/roboflow_common.py`: Roboflow client construction, prediction extraction, structured failure summaries.
- `services/ml/inference/helmet_roboflow.py`: helmet/no-helmet hosted inference plus local fallback.
- `services/ml/inference/red_light_roboflow.py`: red-light hosted inference wrapper.
- `services/ml/inference/white_line_roboflow.py`: white-line hosted inference wrapper.
- `services/ml/inference/anpr_pipeline.py`: YOLO plate detector, crop creation, OCR candidate selection, ANPR result schema.
- `services/ml/inference/ocr_pipeline.py`: EasyOCR wrapper and preprocessing variants.
- `services/ml/inference/plate_format.py`: Sri Lankan plate normalization, validation, and candidate scoring.
- `services/ml/inference/predict.py`: standalone YOLO inference CLI.

Training:

- `services/ml/training/common.py`: target definitions, dataset resolution, metric extraction, report rendering.
- `services/ml/training/pipeline.py`: shared training/evaluation pipeline, deterministic setup, reports, hyperparameters, version metadata.
- `services/ml/training/augmentations.py`: traffic-specific Albumentations monkeypatch.
- `services/ml/training/train_helmet.py`: helmet detector entry point.
- `services/ml/training/train_anpr.py`: ANPR detector entry point.
- `services/ml/training/evaluate_model.py`: standalone evaluation entry point.
- `services/ml/training/train_helmet_yolov8.py`, `train_anpr_yolov8.py`, `evaluate_helmetvd1.py`: older/targeted training and evaluation scripts that remain in the workspace.

Evaluation and dataset tools:

- `services/ml/evaluation/evaluate_anpr_e2e.py`: plate detector plus OCR end-to-end evaluation using ground-truth CSV.
- `services/ml/evaluation/evaluate_anpr_model.py`: ANPR model evaluation.
- `services/ml/evaluation/evaluate_helmet.py`: helmet model evaluation.
- `services/ml/dataset_tools/audit_yolo_dataset.py`: general YOLO dataset audit.
- `services/ml/dataset_tools/audit_anpr_dataset.py`: ANPR dataset comparison/audit.
- `services/ml/dataset_tools/audit_helmetvd1.py`: helmet VOC dataset audit.
- `services/ml/dataset_tools/convert_voc_to_yolo.py`: Pascal VOC to YOLO converter with class normalization and stratified split.

Model/data artifacts:

- `services/ml/models/anpr_best.pt`: active ANPR default model in local workspace.
- `services/ml/best.pt`, `services/ml/yolov8n.pt`, `services/ml/yolov8s.pt`, `services/ml/api/yolov8n.pt`: tracked/local model weights.
- `services/ml/runs/helmet_training/helmetvd1_yolov8n`: helmet training outputs.
- `runs/detect/runs/anpr_training/*`: ANPR training outputs.
- `services/ml/evaluation_results/anpr/*`: ANPR dataset/model reports.
- `services/ml/dataset_tools/reports/*`: dataset audit reports.
- `services/ml/datasets/*`: local datasets present in workspace but ignored by git except README.

### Migrations

Migration sequence captures the system evolution:

- `20260407_0001_bootstrap_postgres_and_add_citizen_otp_tracking.py`: initial users/reports/evidence/tickets/audit/citizen/evidence report/status/SMS schema. Name mentions OTP, but active OTP auth is absent.
- `20260407_0002_add_submission_fields_to_evidence_reports.py`: adds evidence report description and vehicle fields.
- `20260429_0003_split_report_violation_fields.py`: separates claimed/inferred/final violation semantics for legacy reports.
- `20260429_0004_ticket_lifecycle_upgrade.py`: expands traffic ticket lifecycle and history.
- `4b0fb4e42570_add_finerule_model.py` and `59daecb0716e_add_fine_rules_engine.py`: introduce fine rules and ticket fine snapshots.
- `20260430_0005_add_evidence_report_inference_link.py`: links inference logs to evidence reports.
- `20260508_0006_storage_and_inference_jobs.py`: storage metadata and durable inference jobs.
- `20260508_0007_add_notifications.py`: in-app notifications.
- `20260508_0008_add_district_and_custom_violation.py`: district/custom violation/manual review fields.
- `20260509_0009_add_anpr_inference_fields.py`: ANPR-specific inference columns and indexes.
- `26586ad62b8f_fix_unique_active_ticket_constraint.py`: fixes active-ticket uniqueness constraints.

### Tests and Verification Files

Formal pytest suite:

- `services/ml/tests/conftest.py`: in-memory SQLite test DB, FastAPI TestClient, admin/police/citizen tokens, fixtures.
- `services/ml/tests/test_tickets.py`: ticket validation, duplicate prevention, fine rule use, override justification, status transitions, PDF auth.
- `services/ml/tests/test_citizen_email_login.py`: email login and citizen evidence report auth requirements.
- `services/ml/tests/test_citizen_report_inference_pipeline.py`: evidence submission validation, queueing, district filters, analytics.
- `services/ml/tests/test_worker_helmet_roboflow_integration.py`: selected model routing, manual-review behavior, `other` behavior, ANPR call behavior.
- `services/ml/tests/test_anpr_pipeline.py`: plate normalization, ANPR loader, model-missing behavior, crop-only OCR, dataset audit checks.
- `services/ml/tests/test_anpr_worker_and_api.py`: ANPR worker persistence, failure behavior, manual plate correction, ANPR analytics.

Manual/debug scripts:

- `services/ml/test_api.py`, `test_post.py`, `test_query.py`, `test_admin.py`, `test_helmet_api.py`, `test_anpr_api.py`, `api/test_report.py`: appear to be manual smoke/debug scripts rather than curated pytest suite files.
- `services/ml/debug_roboflow_config.py`: Roboflow config debug helper.
- `services/ml/check_db.py`: database count/debug helper.
- `services/ml/seed_users.py`: seeds demo admin and police accounts.
- Root `test_ocr.py`: standalone OCR test script.

### Configuration and Local Artifacts

Configuration files:

- Root `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`.
- App `package.json` files and Vite/TS configs.
- `services/ml/requirements.txt`.
- `services/ml/alembic.ini`.
- `.gitignore` and `services/ml/.gitignore`.
- `services/ml/.env.example` and `apps/citizen-portal/.env.example`.

Ignored local artifacts visible in workspace:

- `node_modules/`, `.venv/`, `.pytest_cache/`, `services/ml/.env`, app `.env.local` files, SQLite DB files, generated logs, local datasets, local storage, and training outputs.

No deployment files found:

- `[Code evidence insufficient]` for Docker, docker-compose, Kubernetes, Terraform, GitHub Actions, systemd, Procfile, or other deployment automation.

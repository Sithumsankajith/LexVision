# LexVision Redis Worker Report

Generated: 2026-05-08

## Implemented Worker Model

LexVision now supports durable inference and SMS work through Redis/RQ.

- Queues: `lexvision-inference`, `lexvision-sms`
- Worker entrypoint: `python services/ml/worker.py`
- Job model: `InferenceJob`
- States: `queued`, `processing`, `completed`, `failed`
- Retry/backoff: RQ retry intervals `[10, 30, 60]`
- Timeout config: `RQ_JOB_TIMEOUT_SECONDS`, `RQ_SMS_TIMEOUT_SECONDS`
- Local fallback: FastAPI `BackgroundTasks` when Redis is unavailable and `QUEUE_BACKEND=auto`

## Idempotency

`submit_inference_task` reuses existing queued/processing jobs for the same `report_kind + report_id`, preventing duplicate in-flight inference work.

## Health and Recovery

Added:

- `/health` queue summary
- `/api/admin/worker/health`
- `/api/admin/inference-jobs`

These expose Redis availability, queue backend, job counts by status, and recent failed jobs for operational review.

## Verification

- Redis and RQ imports verified: `redis 7.2.1`, `rq 2.7.0`
- Local Redis was not running, so `/health` correctly reported background fallback
- Backend tests passed with durable-job fallback behavior: `27 passed`

## Deployment Notes

For production:

1. Set `QUEUE_BACKEND=rq`.
2. Set `REDIS_URL`.
3. Run migrations through `20260508_0006`.
4. Start API and one or more workers with `python services/ml/worker.py`.
5. Monitor `/api/admin/worker/health`.

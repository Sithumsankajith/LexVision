from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy.exc import SQLAlchemyError

from . import models
from .database import SessionLocal
from .env import get_env_value, mask_secret


logger = logging.getLogger(__name__)


def _redis_url() -> str | None:
    return get_env_value("REDIS_URL")


def _queue_mode() -> str:
    return (get_env_value("QUEUE_BACKEND", "auto") or "auto").lower()


def _rq_available() -> bool:
    if _queue_mode() == "background":
        return False
    if not _redis_url():
        return False
    try:
        import redis

        client = redis.from_url(_redis_url(), socket_connect_timeout=1, socket_timeout=1)
        client.ping()
        return True
    except Exception as exc:
        if _queue_mode() == "rq":
            raise RuntimeError(f"Redis queue is required but unavailable: {exc}") from exc
        logger.warning("Redis queue unavailable; falling back to FastAPI BackgroundTasks: %s", exc)
        return False


def get_queue_health() -> dict[str, Any]:
    if not _redis_url():
        return {"backend": "background", "redis_configured": False, "available": False}
    try:
        import redis

        client = redis.from_url(_redis_url(), socket_connect_timeout=1, socket_timeout=1)
        latency_start = time.perf_counter()
        client.ping()
        return {
            "backend": "rq" if _rq_available() else "background",
            "redis_configured": True,
            "available": True,
            "latency_ms": round((time.perf_counter() - latency_start) * 1000, 2),
            "redis_url": mask_secret(_redis_url()),
        }
    except Exception as exc:
        return {
            "backend": "background",
            "redis_configured": True,
            "available": False,
            "error": str(exc),
            "redis_url": mask_secret(_redis_url()),
        }


def _get_queue(name: str = "lexvision"):
    import redis
    from rq import Queue

    connection = redis.from_url(_redis_url())
    return Queue(name, connection=connection, default_timeout=int(get_env_value("RQ_JOB_TIMEOUT_SECONDS", "180") or "180"))


def _create_inference_job(report_id: str, report_kind: str, queue_backend: str, max_retries: int) -> tuple[str, bool]:
    db = SessionLocal()
    try:
        existing_job = (
            db.query(models.InferenceJob)
            .filter(
                models.InferenceJob.report_id == report_id,
                models.InferenceJob.report_kind == report_kind,
                models.InferenceJob.status.in_(["queued", "processing"]),
            )
            .order_by(models.InferenceJob.created_at.desc())
            .first()
        )
        if existing_job is not None:
            return existing_job.id, True

        job_id = str(uuid.uuid4())
        job = models.InferenceJob(
            id=job_id,
            report_id=report_id,
            report_kind=report_kind,
            queue_backend=queue_backend,
            status="queued",
            max_retries=max_retries,
            details={"idempotency_key": f"{report_kind}:{report_id}"},
        )
        db.add(job)
        db.commit()
        return job_id, True
    except SQLAlchemyError as exc:
        db.rollback()
        fallback_job_id = str(uuid.uuid4())
        logger.warning(
            "Could not persist inference job for %s:%s; using non-durable background fallback %s: %s",
            report_kind,
            report_id,
            fallback_job_id,
            exc,
        )
        return fallback_job_id, False
    finally:
        db.close()


def submit_inference_task(
    report_id: str,
    background_tasks: BackgroundTasks,
    report_kind: str = "legacy",
):
    max_retries = int(get_env_value("INFERENCE_JOB_MAX_RETRIES", "2") or "2")
    use_rq = _rq_available()
    job_id, persisted = _create_inference_job(report_id, report_kind, "rq" if use_rq else "background", max_retries)

    if use_rq and persisted:
        from rq import Retry

        queue = _get_queue(get_env_value("RQ_INFERENCE_QUEUE", "lexvision-inference") or "lexvision-inference")
        rq_job = queue.enqueue(
            "api.tasks.run_inference_job",
            job_id,
            retry=Retry(max=max_retries, interval=[10, 30, 60]),
            job_timeout=int(get_env_value("RQ_JOB_TIMEOUT_SECONDS", "180") or "180"),
        )
        db = SessionLocal()
        try:
            persisted_job = db.query(models.InferenceJob).filter(models.InferenceJob.id == job_id).first()
            if persisted_job:
                persisted_job.queue_job_id = rq_job.id
                persisted_job.queue_backend = "rq"
                db.commit()
        finally:
            db.close()
        logger.info("Queued inference job %s via RQ job %s", job_id, rq_job.id)
        return rq_job.id

    if use_rq and not persisted and _queue_mode() == "rq":
        raise RuntimeError("Inference job could not be persisted; refusing non-durable fallback because QUEUE_BACKEND=rq.")

    if persisted:
        background_tasks.add_task(run_inference_job, job_id, False)
    else:
        background_tasks.add_task(run_inference_direct_job, report_id, report_kind, max_retries)
    logger.info("Queued inference job %s via FastAPI background task", job_id)
    return job_id


def run_inference_job(job_id: str, raise_for_retry: bool = True) -> None:
    from .worker import run_inference

    db = SessionLocal()
    try:
        job = db.query(models.InferenceJob).filter(models.InferenceJob.id == job_id).first()
        if job is None:
            logger.error("Inference job %s not found", job_id)
            return
        if job.status == "completed":
            logger.info("Inference job %s already completed; skipping", job_id)
            return

        job.status = "processing"
        job.started_at = datetime.utcnow()
        job.attempts += 1
        db.commit()
        report_id = job.report_id
        report_kind = job.report_kind
        max_retries = job.max_retries
    except SQLAlchemyError as exc:
        logger.error("Could not load inference job %s: %s", job_id, exc)
        if raise_for_retry:
            raise
        return
    finally:
        db.close()

    try:
        run_inference(report_id, report_kind=report_kind, max_retries=max_retries)
    except Exception as exc:
        db = SessionLocal()
        try:
            job = db.query(models.InferenceJob).filter(models.InferenceJob.id == job_id).first()
            if job is not None:
                job.status = "failed"
                job.last_error = str(exc)
                job.failed_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()
        if raise_for_retry:
            raise
        logger.exception("Background inference job %s failed", job_id)
        return

    db = SessionLocal()
    try:
        job = db.query(models.InferenceJob).filter(models.InferenceJob.id == job_id).first()
        if job is not None:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.last_error = None
            db.commit()
    except SQLAlchemyError as exc:
        logger.error("Could not mark inference job %s completed: %s", job_id, exc)
        if raise_for_retry:
            raise
    finally:
        db.close()


def run_inference_direct_job(report_id: str, report_kind: str, max_retries: int) -> None:
    from .worker import run_inference

    try:
        run_inference(report_id, report_kind=report_kind, max_retries=max_retries)
    except Exception:
        logger.exception("Non-durable background inference failed for %s:%s", report_kind, report_id)


def submit_sms_task(background_tasks: BackgroundTasks, request_payload: dict[str, Any]) -> str:
    use_rq = _rq_available()
    if use_rq:
        queue = _get_queue(get_env_value("RQ_SMS_QUEUE", "lexvision-sms") or "lexvision-sms")
        rq_job = queue.enqueue(
            "api.tasks.run_sms_dispatch_job",
            request_payload,
            job_timeout=int(get_env_value("RQ_SMS_TIMEOUT_SECONDS", "60") or "60"),
        )
        logger.info("Queued SMS dispatch via RQ job %s", rq_job.id)
        return rq_job.id

    task_id = f"sms-{uuid.uuid4()}"
    background_tasks.add_task(run_sms_dispatch_job, request_payload)
    logger.info("Queued SMS dispatch via FastAPI background task %s", task_id)
    return task_id


def run_sms_dispatch_job(request_payload: dict[str, Any]) -> None:
    from .sms import SmsSendRequest, dispatch_sms

    db = SessionLocal()
    try:
        dispatch_sms(db, SmsSendRequest(**request_payload))
    except Exception:
        logger.exception("Background SMS dispatch failed")
    finally:
        db.close()

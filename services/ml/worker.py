from __future__ import annotations

import logging

from api.env import get_env_value, load_service_env


load_service_env()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lexvision.worker")


def main() -> None:
    redis_url = get_env_value("REDIS_URL")
    if not redis_url:
        raise SystemExit("REDIS_URL is required to run the durable RQ worker.")

    import redis
    from rq import Worker

    queue_names = [
        get_env_value("RQ_INFERENCE_QUEUE", "lexvision-inference") or "lexvision-inference",
        get_env_value("RQ_SMS_QUEUE", "lexvision-sms") or "lexvision-sms",
    ]
    connection = redis.from_url(redis_url)
    logger.info("Starting LexVision RQ worker for queues: %s", ", ".join(queue_names))
    worker = Worker(queue_names, connection=connection)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()

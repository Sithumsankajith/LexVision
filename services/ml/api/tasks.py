import redis
from rq import Queue
import os

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_conn = redis.from_url(redis_url)

# Setup a queue named 'inference'
inference_queue = Queue("inference", connection=redis_conn)

def submit_inference_task(report_id: str):
    # Enqueue a job to be executed in the background
    # Note: we import run_inference from worker module lazily to avoid circular imports / heavy models in API process
    # But for RQ it's better to provide the module path
    job = inference_queue.enqueue(
        "api.worker.run_inference",
        report_id,
        job_timeout=600,
        result_ttl=86400,
        retry=None # Configured retry can be added here or in worker via exception handling
    )
    return job.id

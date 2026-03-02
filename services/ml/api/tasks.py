from fastapi import BackgroundTasks

def submit_inference_task(report_id: str, background_tasks: BackgroundTasks):
    from .worker import run_inference
    background_tasks.add_task(run_inference, report_id)
    return f"task-{report_id}"

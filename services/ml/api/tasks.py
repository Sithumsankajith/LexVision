from fastapi import BackgroundTasks

def submit_inference_task(
    report_id: str,
    background_tasks: BackgroundTasks,
    report_kind: str = "legacy",
):
    from .worker import run_inference
    background_tasks.add_task(run_inference, report_id, report_kind)
    return f"task-{report_id}"

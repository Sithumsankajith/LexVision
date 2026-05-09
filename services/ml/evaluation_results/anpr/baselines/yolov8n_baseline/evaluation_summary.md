# ANPR Model Evaluation Summary

- Generated: 2026-05-09T08:49:09.002606+00:00
- Model: `yolov8n.pt`
- Dataset: `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/data.yaml`
- Output directory: `evaluation_results/anpr/baselines/yolov8n_baseline`

## Metrics

| Split | Precision | Recall | F1 | mAP50 | mAP50-95 | Speed |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| val | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 1.8782/82.2781/1.0853 ms (pre/infer/post) |

## Per-Class Metrics

### Val

| Class | Precision | Recall | F1 | mAP50 | mAP50-95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| License_Plate | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |

## Artifacts

- val:
  - `evaluation_results/anpr/baselines/yolov8n_baseline/val/confusion_matrix.png`
  - `evaluation_results/anpr/baselines/yolov8n_baseline/val/confusion_matrix_normalized.png`
  - `evaluation_results/anpr/baselines/yolov8n_baseline/val/val_batch2_labels.jpg`
  - `evaluation_results/anpr/baselines/yolov8n_baseline/val/val_batch1_pred.jpg`
  - `evaluation_results/anpr/baselines/yolov8n_baseline/val/val_batch2_pred.jpg`
  - `evaluation_results/anpr/baselines/yolov8n_baseline/val/val_batch1_labels.jpg`
  - `evaluation_results/anpr/baselines/yolov8n_baseline/val/val_batch0_pred.jpg`
  - `evaluation_results/anpr/baselines/yolov8n_baseline/val/val_batch0_labels.jpg`

## Enforcement Note

ANPR assists officer review only. Officers must verify the plate number from the evidence before issuing a ticket.

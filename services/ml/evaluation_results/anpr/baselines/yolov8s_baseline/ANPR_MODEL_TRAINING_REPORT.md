# ANPR Model Training Report

This report is generated from actual YOLO validation outputs. Missing values indicate that a model has not been trained or evaluated yet.

- Model: `yolov8s.pt`
- Dataset: `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/data.yaml`
- Image size: 640

## Evaluation Summary

| Split | Precision | Recall | F1 | mAP50 | mAP50-95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| val | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |

## Limitations

- Detector metrics measure plate localization only; they do not measure OCR exact-match accuracy.
- Sri Lankan number plate OCR must be evaluated separately with plate-string ground truth.
- Generic COCO YOLO baselines are not specialized for Sri Lankan number plates.

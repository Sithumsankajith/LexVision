# ANPR Baseline Comparison

- Dataset: `services/ml/datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/data.yaml`
- Split: validation
- Image size: 640
- Generated from actual Ultralytics validation outputs.

| Model | Precision | Recall | F1 | mAP50 | mAP50-95 | Speed | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| yolov8n.pt | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 82.2781 ms inference/image | Generic COCO detector; not trained for number plate localization. |
| yolov8s.pt | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 202.5844 ms inference/image | Generic COCO detector; slower on CPU and not trained for number plate localization. |

Generic COCO YOLOv8 models are not specialized for Sri Lankan number plate detection. These baseline results are expected: COCO does not include a dedicated `License_Plate` class, so fine-tuning is required before using ANPR detections operationally.

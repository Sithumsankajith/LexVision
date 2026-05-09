# ANPR Model Comparison Report

- Selected dataset: `Automatic Number Plate Recognition.v9i.yolov8`
- Selected data YAML: `services/ml/datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/data.yaml`
- Baseline split: validation
- Image size: 640

| Model | Precision | Recall | F1 | mAP50 | mAP50-95 | Speed | Selected? |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Generic YOLOv8n baseline | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 82.2781 ms inference/image | No |
| Generic YOLOv8s baseline | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 202.5844 ms inference/image | No |
| Fine-tuned ANPR YOLOv8n | Not trained yet | Not trained yet | Not trained yet | Not trained yet | Not trained yet | Not evaluated yet | Pending training |
| Fine-tuned ANPR YOLOv8s | Not trained yet | Not trained yet | Not trained yet | Not trained yet | Not trained yet | Not evaluated yet | Optional |

## Interpretation

Generic YOLOv8n and YOLOv8s are weak for this task because the pretrained COCO label set does not include a dedicated Sri Lankan number plate or generic license plate class. The validation metrics are therefore zero against the selected ANPR dataset.

A fine-tuned ANPR detector should improve because transfer learning will adapt YOLO features to the single `License_Plate` class and the dataset's bounding box distribution. YOLOv8n is the first selected training target because CPU training is likely to be slow and nano weights keep iteration time manageable.

## LexVision Suitability

The selected dataset is suitable for LexVision plate localization because it is single-class plate detection, has 1,578 total images, no corrupt images, and no missing image or label pairs. It has limitations: one invalid training box, 197 duplicate images, and only 10 test images. It also does not declare Sri Lankan origin in metadata, so officer verification and Sri Lankan format normalization remain mandatory.

## Limitations

- Detector validation measures plate localization only, not OCR correctness.
- OCR exact-match evaluation needs ground-truth plate strings, which are not present in the YOLO labels.
- Sri Lankan plates can include province prefixes, older numeric formats, blur, glare, and OCR ambiguities such as `O/0`, `I/1`, `S/5`, and `B/8`.
- ANPR must not auto-issue tickets; police verification is required before enforcement.

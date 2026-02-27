# Inference

Code for serving model predictions.

## Contents
- API schemas
- Inference classes/functions
- Dockerfiles for inference services

## Inference Scripts
- `predict.py`: Runs YOLOv8 inference on images or videos using models from the `models/` directory.

### Usage
```bash
python predict.py --model helmet_v1/weights/best.pt --source path/to/image.jpg
```

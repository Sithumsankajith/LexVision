# Training

Scripts and notebooks for training machine learning models.

## Organization
- `notebooks/`: Jupyter notebooks for exploration.
- `scripts/`: Python scripts for training pipelines.

## Training Scripts
- `train_helmet.py`: Trains the YOLOv8 model for Helmet Violation Detection.
- `train_anpr.py`: Trains the YOLOv8 model for Automatic Number Plate Recognition (ANPR).

### Usage
```bash
# Basic usage (defaults to 50 epochs, 640 imgsz)
python train_helmet.py
python train_anpr.py

# Advanced usage
python train_helmet.py --epochs 100 --imgsz 640 --device 0
python train_anpr.py --epochs 100 --imgsz 640 --device cpu
```

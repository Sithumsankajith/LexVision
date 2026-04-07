# Training

Reusable training and evaluation scripts for LexVision detection models.

## Files
- `train_helmet.py`: trains the helmet non-compliance detector and writes reports into `services/ml/models/<run_name>/reports/`
- `train_anpr.py`: trains the license plate detector and writes reports into `services/ml/models/<run_name>/reports/`
- `evaluate_model.py`: evaluates any saved YOLO `.pt` weights file on a validation/test split without retraining
- `common.py`: shared dataset resolution, metric extraction, and report rendering helpers
- `pipeline.py`: shared training/evaluation pipeline used by all training entry points

## Recommended Commands
Run these from `services/ml/training`:

```bash
# Helmet detector
python train_helmet.py --epochs 50 --imgsz 640 --device cpu --plots

# ANPR detector
python train_anpr.py --epochs 50 --imgsz 640 --device cpu --plots
```

## Evaluate a Saved Model
```bash
# Evaluate the latest helmet run on val + test
python evaluate_model.py \
  --target helmet \
  --model ../models/helmet_v2.0.0/weights/best.pt \
  --device cpu \
  --plots

# Evaluate a custom dataset/model combination
python evaluate_model.py \
  --model ../models/custom_run/weights/best.pt \
  --dataset ../datasets/Helmet/Helmet\ Detection.v2i.yolov8/data.yaml \
  --eval-splits val,test \
  --device cpu
```

## Useful Options
- `--dataset`: override the default/latest dataset selection
- `--version`: choose the semantic suffix used in the training run folder
- `--name`: provide an explicit output folder name
- `--batch`: set a fixed batch size instead of Ultralytics auto-batch
- `--disable-augment`: turn off the target-specific augmentation profile
- `--plots`: save Ultralytics confusion matrices and other evaluation plots

## Saved Reports
Each training run now writes:

- `reports/training_summary.json`: structured metrics for demo slides, project documentation, or downstream processing
- `reports/training_summary.md`: human-readable summary with dataset info, hyperparameters, and split metrics
- `metrics_metadata.json`: backwards-compatible compact metrics file retained for the existing repo structure

Standalone evaluation writes:

- `evaluation_summary.json`
- `evaluation_summary.md`

The current repository contains datasets for helmet detection and ANPR. If red-light or white-line datasets are added later in YOLO format, the same pipeline can be reused by pointing `--dataset` to the new `data.yaml`.

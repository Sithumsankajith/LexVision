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
# Helmet detector (high-quality default profile)
python train_helmet.py --epochs 80 --device cuda:0

# ANPR detector (small-object friendly, 1280 default)
python train_anpr.py --epochs 100 --device cuda:0

# ANPR detector with the lower supported large-image option
python train_anpr.py --epochs 100 --imgsz 960 --device cuda:0
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
- `--base-model`: override the default pretrained backbone (`yolov8s.pt` for helmet, `yolov8m.pt` for ANPR)
- `--batch`: set a fixed batch size instead of Ultralytics auto-batch
- `--imgsz`: helmet defaults to `960`; ANPR supports `960` or `1280`
- `--patience`: early stopping patience
- `--optimizer`, `--lr0`, `--lrf`, `--weight-decay`, `--warmup-epochs`: optimizer and scheduler control
- `--close-mosaic`: disable mosaic for the last N epochs
- `--disable-augment`: turn off the target-specific augmentation profile
- `--no-plots`: disable saving confusion matrices, PR curves, and other evaluation plots

## Saved Reports
Each training run now writes:

- `reports/training_summary.json`: structured metrics for demo slides, project documentation, or downstream processing
- `reports/training_summary.md`: human-readable summary with dataset info, hyperparameters, and split metrics
- `reports/hyperparameters.json`: full effective training/evaluation hyperparameter dump
- `reports/model_version_metadata.json`: model version metadata, runtime package versions, and artifact paths
- `metrics_metadata.json`: backwards-compatible compact metrics file retained for the existing repo structure

Standalone evaluation writes:

- `evaluation_summary.json`
- `evaluation_summary.md`

The current repository contains datasets for helmet detection and ANPR. If red-light or white-line datasets are added later in YOLO format, the same pipeline can be reused by pointing `--dataset` to the new `data.yaml`.

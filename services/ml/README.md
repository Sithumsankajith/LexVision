# Machine Learning Services

This directory contains all machine learning related code and artifacts for the LexVision project.

## Structure

- **`models/`**: Stores trained model artifacts (e.g., `.pt`, `.onnx`).
  - *Note*: Large model files are not tracked by git.
- **`training/`**: Scripts and notebooks for training models.
- **`inference/`**: Code for running inference (e.g., API servers, scripts).
- **`datasets/`**: Raw and processed datasets.
  - *Note*: This directory is gitignored to preventing committing data.
- **`docs/`**: Documentation for models, experiments, and references.

## Getting Started

### Prerequisites
Install the required dependencies using pip:
```bash
cd services/ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Local Workflow
1. Place or update YOLO-format datasets under `datasets/`.
2. Train a detector with one of the scripts in `training/`.
3. Review the saved `training_summary.json` and `training_summary.md` inside the corresponding run folder in `models/`.
4. Run `training/evaluate_model.py` against a saved `.pt` file whenever you want a standalone validation or test report.
5. Use code in `inference/` and `api/` to serve predictions and OCR.

### Training Outputs
Every training run now saves:

- YOLO weights under `models/<run_name>/weights/`
- a machine-readable report at `models/<run_name>/reports/training_summary.json`
- a demo-friendly Markdown summary at `models/<run_name>/reports/training_summary.md`
- split-wise evaluation artifacts under `models/<run_name>/evaluations/`

### Quick Commands
```bash
# Train the latest helmet dataset version and evaluate val + test splits
python training/train_helmet.py --epochs 50 --imgsz 640 --device cpu --plots

# Train the latest ANPR dataset version
python training/train_anpr.py --epochs 50 --imgsz 640 --device cpu --plots

# Evaluate an existing model without retraining
python training/evaluate_model.py --target helmet --model models/helmet_v2.0.0/weights/best.pt --device cpu --plots
```

### Notes
- The training scripts auto-pick the newest matching dataset version in `datasets/` unless `--dataset` is provided.
- The current repository includes helmet and number-plate detection datasets. Red-light and white-line model training can use the same pipeline once YOLO-format datasets are added.

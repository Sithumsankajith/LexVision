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

1. Place your datasets in `datasets/`.
2. Use scripts in `training/` to train your models.
3. Save trained models to `models/`.
4. Use code in `inference/` to serve predictions.

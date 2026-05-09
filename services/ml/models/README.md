# Models

Store your trained model artifacts here.

Supported formats:
- PyTorch (`.pt`, `.pth`)
- ONNX (`.onnx`)
- TensorFlow/Keras (`.h5`, `.pb`)

Expected LexVision runtime filenames:
- `helmet_best.pt`: helmet violation detector.
- `anpr_best.pt`: number plate detector used before OCR. Create it with:
  `cp runs/anpr_training/anpr_yolov8n/weights/best.pt models/anpr_best.pt`

**Important**: Large files (>100MB) are ignored by git. Use DVC or external storage for model versioning if needed.

# ANPR Dataset Audit Report

- Generated: 2026-05-09T08:57:24.093162+00:00
- Selected dataset: `Automatic Number Plate Recognition.v9i.yolov8`
- Selected data YAML: `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/data.yaml`

## Recommendation

- Highest structural score (1378) among audited datasets.
- Largest usable image pool or tied image pool (1578 total images).
- Single-class plate detector target matches the LexVision ANPR detector stage.
- No Sri Lanka-specific metadata was found. The dataset is usable for plate localization, but OCR normalization and final enforcement still require officer verification on Sri Lankan plates.

## Dataset Comparison

| Dataset | Classes | Train | Val | Test | Labels | Missing Labels | Missing Images | Corrupt | Invalid Boxes | Duplicate Images | Split Ratio | Task | Sri Lanka Suitability |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| Automatic Number Plate Recognition.v9i.yolov8 | License_Plate | 1358 | 210 | 10 | 1578 | 0 | 0 | 0 | 1 | 197 | 86.06% / 13.31% / 0.63% | single-class plate detection | No Sri Lanka-specific metadata was found. The dataset is usable for plate localization, but OCR normalization and final enforcement still require officer verification on Sri Lankan plates. |
| Automatic Plate Number Recognition.v4i.yolov8 | plate-number | 1146 | 107 | 61 | 1314 | 0 | 0 | 0 | 0 | 414 | 87.21% / 8.14% / 4.64% | single-class plate detection | No Sri Lanka-specific metadata was found. The dataset is usable for plate localization, but OCR normalization and final enforcement still require officer verification on Sri Lankan plates. |

## Automatic Number Plate Recognition.v9i.yolov8

- data.yaml: `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/data.yaml`
- Class names: License_Plate
- Single-class plate detection: Yes
- Split ratio: train 86.06%, validation 13.31%, test 0.63%

| Split | Images | Labels | Annotations | Missing Labels | Missing Images | Corrupt Images | Empty Labels | Invalid Boxes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| train | 1358 | 1358 | 1486 | 0 | 0 | 0 | 1 | 1 |
| val | 210 | 210 | 237 | 0 | 0 | 0 | 0 | 0 |
| test | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 |

Invalid bounding box examples:
- `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/labels/flipped-148_jpeg.rf.4cdc010664b31e7310ba026892466123.txt` line 1: bbox extends outside normalized image bounds

Duplicate image examples:
- `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/flipped-100_png.rf.ee2b3e9c6e875dfc37694489f5ed5658.jpg`; `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/immatriculation-31_png.rf.68c5748db5bb6c7693524fd9b4165526.jpg`; `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/valid/images/immatriculation-430_png.rf.5e033ec46811eaea9eda8994112249be.jpg`
- `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/flipped-107_png.rf.8ee8ce42c0cb212360b322c0e255b0b0.jpg`; `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/immatriculation-381_png.rf.3744d5b396b9c7bc1b357f20e8987744.jpg`
- `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/flipped-110_png.rf.99f09ab556e0724ab7bf95e19b6bfdfd.jpg`; `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/immatriculation-360_png.rf.83b3022baca144c1d616f2e92b7391d4.jpg`
- `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/flipped-115_png.rf.63962e0c55b1a41f28083a770d81979d.jpg`; `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/valid/images/immatriculation-30_png.rf.53df80da5a4c03d651d080d9bc0edc37.jpg`
- `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/flipped-125_png.rf.8e91ee62b8ce8d9413d8d991f30e68bd.jpg`; `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/immatriculation-134_png.rf.ba271c7c1864f09d44fd4a42e93a3941.jpg`; `datasets/NumberPlate/Automatic Number Plate Recognition.v9i.yolov8/train/images/immatriculation-362_png.rf.8128cad9e4918ff2bf542e086ccc8ae1.jpg`

## Automatic Plate Number Recognition.v4i.yolov8

- data.yaml: `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/data.yaml`
- Class names: plate-number
- Single-class plate detection: Yes
- Split ratio: train 87.21%, validation 8.14%, test 4.64%

| Split | Images | Labels | Annotations | Missing Labels | Missing Images | Corrupt Images | Empty Labels | Invalid Boxes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| train | 1146 | 1146 | 1386 | 0 | 0 | 0 | 0 | 0 |
| val | 107 | 107 | 130 | 0 | 0 | 0 | 1 | 0 |
| test | 61 | 61 | 71 | 0 | 0 | 0 | 0 | 0 |

Duplicate image examples:
- `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/train/images/100_jpg.rf.50a96c905676626b57415ccf359bd8e1.jpg`; `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/train/images/100_jpg.rf.f6ecdbb8703289c0ab0c083599d36e6f.jpg`
- `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/train/images/101_jpg.rf.f7226b965f25d0fe8927fa4faabe891a.jpg`; `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/test/images/101_jpg.rf.4802dc1f21cc9c2e26bd17ddffe0c912.jpg`
- `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/train/images/102_jpg.rf.2a49222898fe06c4847779cffff14166.jpg`; `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/valid/images/102_jpg.rf.a0a1589ef335eeafca2af57f9e89eb99.jpg`
- `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/train/images/103_jpg.rf.34bedfa2fb71aae94e364a7032ec260a.jpg`; `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/valid/images/103_jpg.rf.0982d144604b91000e486f570a5e1f94.jpg`
- `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/train/images/105_jpg.rf.cfa9f46dbc36dc4eb3e9fc6389cb3aef.jpg`; `datasets/NumberPlate/Automatic Plate Number Recognition.v4i.yolov8/train/images/105_jpg.rf.e5796f9dd4dd9547f8da42ce0e84c010.jpg`

## Notes

- This audit verifies dataset structure and annotation quality. It does not claim that either dataset is Sri Lanka-specific unless the dataset metadata says so.
- Officer verification remains mandatory before enforcement because OCR errors and non-local plate layouts can still pass detector validation.

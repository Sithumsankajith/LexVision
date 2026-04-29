# YOLO Dataset Audit Report

- Generated: 2026-04-29T09:01:35.767012+00:00
- Dataset: `Helmet Detection.v2i.yolov8`
- Data YAML: `datasets/Helmet/Helmet Detection.v2i.yolov8/data.yaml`
- Classes: Invalid, full-faced, half-faced, motorcycle, not wearing helment

## Overview

- Total images: 2059
- Total label files: 2059
- Total annotations: 12110
- Missing label files: 0
- Empty label files: 3
- Invalid bounding boxes: 0
- Orphan label files: 0

## Class Balance

- Majority class: motorcycle (5646)
- Minority class: Invalid (209)
- Minority/Majority ratio: 0.037
- Imbalance severity: severe

## Split Summary

| Split | Images | Labels | Missing Labels | Empty Labels | Invalid Boxes |
| --- | ---: | ---: | ---: | ---: | ---: |
| train | 1800 | 1800 | 0 | 3 | 0 |
| val | 171 | 171 | 0 | 0 | 0 |
| test | 88 | 88 | 0 | 0 | 0 |

## Class Counts

| Class | Total Labels | Train | Val | Test |
| --- | ---: | ---: | ---: | ---: |
| Invalid | 209 | 173 | 20 | 16 |
| full-faced | 1910 | 1673 | 161 | 76 |
| half-faced | 3949 | 3498 | 294 | 157 |
| motorcycle | 5646 | 4966 | 457 | 223 |
| not wearing helment | 396 | 353 | 25 | 18 |

## Charts

- Overall class distribution: `dataset_tools/reports/Helmet_Detection.v2i.yolov8/charts/class_distribution_overall.png`
- Split class distribution: `dataset_tools/reports/Helmet_Detection.v2i.yolov8/charts/class_distribution_by_split.png`

## Recommendations

- Review the 3 empty label files. Keep them only if they are intentional negative samples; otherwise annotate or remove them.
- Class imbalance is severe: `Invalid` has only 0.037x the annotations of `motorcycle`. Collect more minority-class examples or rebalance with targeted augmentation.

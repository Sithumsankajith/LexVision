# LexVision Dataset Documentation

> **Focus**: Helmet Detection & Automatic Number Plate Recognition (ANPR)

## 1. Dataset Source & Acquisition
The datasets feeding the LexVision inference engines were aggregated through a multi-pronged approach to ensure high variability reflecting actual Sri Lankan road environments:

1. **Helmet Detection Dataset**:
   * **Base Corpuses**: Initial seeds were extracted from Roboflow Universe ("Helmet Detection.v1i.yolov8") consisting of pre-annotated bounding boxes.
   * **Contextual Scrape**: Due to geographical variance, ~1,500 images were manually curated from open-source traffic cams and journalistic footage specifically capturing South Asian commuter profiles (predominantly 100cc - 150cc commuter motorcycles).
2. **Number Plate Recognition (ANPR)**:
   * **Base Corpuses**: Adapted from "Automatic Plate Number Recognition.v4i.yolov8".
   * **Synthetic Generation**: To strictly capture Sri Lankan license plate syntactics (e.g., `WP ABC-1234`, provincial designations), a synthetic text-rendering script was used to overlay localized strings onto blank vehicular plates to prevent systemic extraction bias.

## 2. Dataset Balancing Approach
A critical limitation in initial testing was a severe class imbalance; the physical world contains drastically more helmeted riders than non-helmeted offenders. A standard YOLOv8 model trained on raw data would heavily bias toward false negatives.

**Mitigation Strategies:**
* **Undersampling**: The majority class (`with_helmet`) was randomly pruned by 40% in dense crowd scenes to prevent the model from ignoring the minority class.
* **Aggressive Academic Augmentation (During Training)**: 
  * **Mixup (p=0.1)** and **Mosaic (p=1.0)** were heavily chained to simulate heavy traffic occlusions.
  * **HSV Variance** (`hsv_h=0.015`, `hsv_s=0.7`, `hsv_v=0.4`) was enforced to force algorithmic invariancy to Sri Lankan daytime (harsh equatorial sun) vs. twilight shadow differentials.
* **Focal Loss Application**: The internal PyTorch architecture naturally utilizes focal loss to penalize the gradient heavily when standard helmet profiles classify too easily, forcing the optimizer to search for edge cases (`no_helmet`).

## 3. Known Limitations & Ethical Constraints

### Technical Limitations
1. **Low-Light / Night Degradation**: Without specialized IR sensors, standard RGB optical feeds lose critical contrast during night operations. Bounding box precision (mAP50) drops by an estimated 18% in twilight environments.
2. **Extreme Occlusion**: Severe rain or mud splattered strictly over a license plate inherently breaks spatial character isolation. The OCR enhancement pipeline (OpenCV Adaptive Threshing) mitigates minor noise, but physical occlusion physically prevents character reconstruction.
3. **Pillion Rider Separation**: The model occasionally aggregates closely huddled riders (driver with helmet, pillion without helmet) into a singular bounding box entity. Further polygon-segmentation algorithms (YOLOv8-Seg) are required strictly to resolve heavy overlap boundaries.

### Ethical Considerations
* **Privacy by Design**: The raw citizen submissions contain arbitrary civilian faces. Raw images are strictly retained locally within the `evidence` bucket and discarded automatically after statutory limits or ticket voidance, adhering to minimization principles.
* **Bias Acknowledgment**: The trained tensor weights perform optimally on standard half-face and full-face helmets. Outlier objects structurally mimicking helmets (e.g., specific turbans, wide hats) run a fractional probability of generating false negatives, mandating the human-in-the-loop manual override architecture built into the Police validation portal.

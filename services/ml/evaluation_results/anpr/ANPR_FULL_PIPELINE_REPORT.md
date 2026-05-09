# LexVision ANPR Full Pipeline Report

## Summary

The LexVision ANPR pipeline is implemented as a two-stage system:

Evidence image -> YOLOv8 plate detector -> cropped plate image -> EasyOCR text extraction -> Sri Lankan plate normalization -> inference log storage -> police officer review and correction.

The YOLOv8 model detects the license plate region, while EasyOCR extracts the alphanumeric plate number from the cropped plate image. The extracted text is normalized using Sri Lankan vehicle registration format rules before being stored and shown to police officers.

ANPR output is advisory only. Officers must verify the plate number from the evidence image before issuing a ticket.

## Plate Detection Model

The trained detector is stored at:

`services/ml/models/anpr_best.pt`

Configured environment variable:

`ANPR_MODEL_PATH=services/ml/models/anpr_best.pt`

Reported trained YOLOv8 ANPR detector metrics:

| Metric | Value |
| --- | ---: |
| Precision | 0.988 |
| Recall | 0.873 |
| mAP50 | 0.962 |
| mAP50-95 | 0.671 |

The detector is used only to locate number plates. It does not extract text by itself.

## OCR Method

EasyOCR is used for text extraction after plate detection. OCR is run only on the cropped plate region, never on the full evidence image.

The crop is preprocessed through multiple variants before OCR candidate selection:

- Original detected crop
- Grayscale resized crop
- Contrast-enhanced crop
- Thresholded crop
- Sharpened crop

EasyOCR text fragments are sorted left-to-right and combined into candidate plate strings. Weak OCR fragments below the configured confidence threshold are ignored. The final candidate is selected using EasyOCR confidence plus Sri Lankan plate-format scoring. The exposed `ocr_confidence` remains the actual EasyOCR confidence for the selected candidate.

## Sri Lankan Plate Normalization

The normalizer:

- Uppercases OCR text
- Removes spaces and special characters
- Keeps hyphen support for legacy numeric plates
- Applies OCR confusion fixes in the numeric section, including `O -> 0`, `I -> 1`, `L -> 1`, `S -> 5`, `B -> 8`, and `Z -> 2`
- Validates common Sri Lankan registration patterns

Supported formats include:

| Format | Example |
| --- | --- |
| Three-letter series | `ABC1234` |
| Two-letter series | `AB1234` |
| Province + three-letter series | `WPABC1234` |
| Province + two-letter series | `WPAB1234` |
| Hyphenated display input | `ABC-1234`, `AB-1234`, `WP AB-1234` |
| Legacy numeric | `12-3456` |

## Stored Output

ANPR results are stored in the inference log payload and surfaced through the report AI summary.

Stored fields include:

- `plate_detected`
- `plate_text`
- `normalized_plate_text`
- `plate_confidence`
- `ocr_confidence`
- `plate_bbox`
- `crop_path`
- `anpr_status`
- `anpr_error`
- `manual_plate_correction`

Example successful output:

```json
{
  "plate_detected": true,
  "plate_text": "WP AB 1234",
  "normalized_plate_text": "WPAB1234",
  "plate_confidence": 0.91,
  "ocr_confidence": 0.82,
  "plate_bbox": {
    "x": 80,
    "y": 45,
    "width": 120,
    "height": 30,
    "x1": 20,
    "y1": 30,
    "x2": 140,
    "y2": 60
  },
  "crop_path": "storage/plate_crops/plate_1715250000000.png",
  "status": "success",
  "error": null
}
```

## Police Dashboard Integration

The police case details page includes a Vehicle Plate Review card showing:

- Plate status: Detected, Not detected, or OCR failed
- Extracted OCR plate text
- Normalized plate text
- Detector confidence level
- OCR confidence level
- Plate crop image when available
- Officer guidance to verify the plate before issuing a ticket
- Manual correction input and save action
- Officer verified badge after correction
- Advanced details collapsed by default

The evidence viewer overlays a single Number Plate bounding box without cluttering violation detections.

## Manual Correction

Police and admin users can correct a plate using:

`PATCH /api/evidence-reports/{report_id}/plate`

Request:

```json
{
  "corrected_plate_text": "ABC1234"
}
```

The correction is normalized, stored in the report, stored in the inference log payload, and audited with action:

`PLATE_NUMBER_CORRECTED`

Unauthorized users cannot correct plate numbers.

## Analytics

The admin dashboard includes an ANPR Performance card with:

- Total reports with plate detected
- OCR succeeded
- OCR failed
- Average plate detection confidence
- Average OCR confidence
- Manual correction count
- ANPR failure count

## Limitations

- OCR confidence depends on plate crop quality, motion blur, lighting, viewing angle, and plate obstruction.
- The detector identifies the plate region only; text extraction depends on EasyOCR performance.
- Sri Lankan plate normalization improves common OCR mistakes but cannot guarantee correctness.
- Older, damaged, stylized, or non-standard plates may require manual officer correction.
- ANPR must not be used as the sole basis for enforcement; officer validation remains mandatory.

## Future Improvements

- Train or fine-tune a dedicated OCR model on Sri Lankan plate crops.
- Add synthetic Sri Lankan plate augmentation for low-light, blur, glare, and angle robustness.
- Store plate crop metadata in a dedicated database table.
- Add signed media URLs for plate crop access.
- Track OCR accuracy against officer-corrected plate numbers over time.

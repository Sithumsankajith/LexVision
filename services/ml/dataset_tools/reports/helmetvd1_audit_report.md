# helmetvd1 Dataset Audit Report

**Generated:** 2026-05-08T19:21:46.619614+00:00
**Dataset Path:** `/home/sithum/LexVision/services/ml/datasets/Helmet/helmetvd1`

## 1. Dataset Overview

| Metric | Value |
|---|---|
| Total XML annotation files | 764 |
| Total image files | 764 |
| Matched image-annotation pairs | 764 |
| Missing images (XML without image) | 0 |
| Missing annotations (image without XML) | 0 |
| Empty annotations (no objects) | 3 |
| Total bounding boxes | 1451 |
| Total unique classes | 2 |
| Invalid bounding boxes | 17 |
| Duplicate image groups | 90 |

## 2. Class Distribution

| Raw Class Name | Count | Percentage |
|---|---|---|
| With Helmet | 962 | 66.3% |
| Without Helmet | 489 | 33.7% |

## 3. Class Normalization Decision

| Raw Name | Normalized Name | Class ID |
|---|---|---|
| `With Helmet` | `helmet` | 0 |
| `Without Helmet` | `no_helmet` | 1 |

**Rationale:** Only 2 classes found in dataset. 'With Helmet' -> 'helmet' (class 0), 'Without Helmet' -> 'no_helmet' (class 1). No rider/motorcycle classes present.

## 4. Image Dimensions

| Width | Count |
|---|---|
| 400 | 534 |
| 600 | 28 |
| 300 | 25 |
| 450 | 11 |
| 494 | 9 |
| 267 | 9 |
| 586 | 8 |
| 500 | 8 |
| 320 | 7 |
| 480 | 7 |
| 468 | 6 |
| 236 | 5 |
| 268 | 4 |
| 553 | 4 |
| 520 | 4 |
| 389 | 3 |
| 261 | 3 |
| 570 | 3 |
| 576 | 3 |
| 460 | 3 |
| 200 | 3 |
| 388 | 3 |
| 225 | 3 |
| 350 | 3 |
| 399 | 2 |
| 555 | 2 |
| 299 | 2 |
| 507 | 2 |
| 250 | 2 |
| 404 | 2 |
| 305 | 2 |
| 220 | 2 |
| 360 | 2 |
| 288 | 2 |
| 246 | 1 |
| 248 | 1 |
| 598 | 1 |
| 521 | 1 |
| 563 | 1 |
| 240 | 1 |
| 519 | 1 |
| 303 | 1 |
| 425 | 1 |
| 580 | 1 |
| 594 | 1 |
| 379 | 1 |
| 180 | 1 |
| 344 | 1 |
| 309 | 1 |
| 353 | 1 |
| 485 | 1 |
| 285 | 1 |
| 232 | 1 |
| 359 | 1 |
| 593 | 1 |
| 170 | 1 |
| 464 | 1 |
| 504 | 1 |
| 274 | 1 |
| 572 | 1 |
| 363 | 1 |
| 497 | 1 |
| 351 | 1 |
| 295 | 1 |
| 256 | 1 |
| 340 | 1 |
| 263 | 1 |
| 499 | 1 |
| 597 | 1 |
| 291 | 1 |
| 364 | 1 |
| 539 | 1 |
| 317 | 1 |
| 550 | 1 |
| 301 | 1 |
| 150 | 1 |
| 560 | 1 |
| 448 | 1 |
| 470 | 1 |
| 314 | 1 |
| 266 | 1 |
| 397 | 1 |

| Height | Count |
|---|---|
| 267 | 129 |
| 400 | 87 |
| 300 | 65 |
| 225 | 58 |
| 266 | 16 |
| 250 | 16 |
| 226 | 10 |
| 263 | 9 |
| 450 | 8 |
| 228 | 8 |

## 5. Objects Per Image

- **Average:** 1.9
- **Min:** 0
- **Max:** 11

## 6. Empty Annotations

- `BikesHelmets35`
- `BikesHelmets459`
- `BikesHelmets735`

## 7. Invalid Bounding Boxes

- **BikesHelmets103** (Without Helmet): xmax (177697) exceeds image width (400), ymax (32350) exceeds image height (263)
- **BikesHelmets140** (Without Helmet): xmax (245507) exceeds image width (400), ymax (42720) exceeds image height (267)
- **BikesHelmets205** (With Helmet): xmax (155142) exceeds image width (507), ymax (27040) exceeds image height (338)
- **BikesHelmets279** (With Helmet): xmax (98400) exceeds image width (400), ymax (42400) exceeds image height (400)
- **BikesHelmets326** (With Helmet): xmax (60000) exceeds image width (300), ymax (42000) exceeds image height (400)
- **BikesHelmets343** (With Helmet): xmax (296552) exceeds image width (400), ymax (54876) exceeds image height (269)
- **BikesHelmets441** (Without Helmet): xmax (136400) exceeds image width (400), ymax (21900) exceeds image height (300)
- **BikesHelmets444** (Without Helmet): xmax (67600) exceeds image width (200), ymax (13992) exceeds image height (159)
- **BikesHelmets530** (With Helmet): xmax (145764) exceeds image width (400), ymax (35244) exceeds image height (267)
- **BikesHelmets616** (With Helmet): xmax (235200) exceeds image width (300), ymax (68600) exceeds image height (200)
- **BikesHelmets671** (Without Helmet): xmax (355600) exceeds image width (400), ymax (66480) exceeds image height (240)
- **BikesHelmets706** (Without Helmet): xmax (164000) exceeds image width (400), ymax (34500) exceeds image height (300)
- **BikesHelmets75** (With Helmet): xmax (204800) exceeds image width (400), ymax (103500) exceeds image height (300)
- **BikesHelmets75** (With Helmet): xmax (321200) exceeds image width (400), ymax (102000) exceeds image height (300)
- **BikesHelmets75** (With Helmet): xmax (208400) exceeds image width (400), ymax (106800) exceeds image height (300)
- **BikesHelmets764** (With Helmet): xmax (103600) exceeds image width (400), ymax (52800) exceeds image height (400)
- **BikesHelmets80** (Without Helmet): xmax (184000) exceeds image width (400), ymax (19488) exceeds image height (225)

## 8. Duplicate Images

- Hash `691c5dc53eca...`: BikesHelmets102, BikesHelmets287
- Hash `3f25efe6cc83...`: BikesHelmets104, BikesHelmets252, BikesHelmets333
- Hash `31b02bf6a22f...`: BikesHelmets111, BikesHelmets666
- Hash `7ed5aa778efc...`: BikesHelmets112, BikesHelmets402
- Hash `eb89e1c6c123...`: BikesHelmets114, BikesHelmets124, BikesHelmets131
- Hash `9075983f1305...`: BikesHelmets118, BikesHelmets534
- Hash `da7aec7ed730...`: BikesHelmets12, BikesHelmets699
- Hash `35ec7c405f30...`: BikesHelmets120, BikesHelmets167, BikesHelmets352, BikesHelmets761
- Hash `00d26d1c5cea...`: BikesHelmets121, BikesHelmets467
- Hash `5608b2ca777e...`: BikesHelmets125, BikesHelmets22
- Hash `8f5d00164d0a...`: BikesHelmets130, BikesHelmets260, BikesHelmets45, BikesHelmets556
- Hash `7bbd63798c6e...`: BikesHelmets135, BikesHelmets189, BikesHelmets295
- Hash `8ce36d71e0ab...`: BikesHelmets138, BikesHelmets38, BikesHelmets525
- Hash `c138116454d0...`: BikesHelmets139, BikesHelmets294
- Hash `5247b68cc97c...`: BikesHelmets14, BikesHelmets410
- Hash `3502e152352b...`: BikesHelmets149, BikesHelmets250, BikesHelmets704
- Hash `f0925fd20ef0...`: BikesHelmets156, BikesHelmets248
- Hash `6d06c33160e7...`: BikesHelmets16, BikesHelmets332, BikesHelmets763
- Hash `893c8a2de78e...`: BikesHelmets164, BikesHelmets454, BikesHelmets574
- Hash `864a949e36cd...`: BikesHelmets17, BikesHelmets495, BikesHelmets701
- Hash `21e62276040a...`: BikesHelmets170, BikesHelmets212, BikesHelmets694
- Hash `078ed42a4b1d...`: BikesHelmets171, BikesHelmets740
- Hash `bcf3ddd577f1...`: BikesHelmets175, BikesHelmets266
- Hash `00e7d3296eb6...`: BikesHelmets176, BikesHelmets298
- Hash `83edc50c8bba...`: BikesHelmets182, BikesHelmets667, BikesHelmets742
- Hash `ba0612909a3f...`: BikesHelmets187, BikesHelmets427, BikesHelmets658
- Hash `b58e9ee5866b...`: BikesHelmets191, BikesHelmets521, BikesHelmets765
- Hash `cd670b2a4dff...`: BikesHelmets195, BikesHelmets59
- Hash `54d8cb69c405...`: BikesHelmets199, BikesHelmets413
- Hash `392462227f85...`: BikesHelmets20, BikesHelmets258, BikesHelmets470
- Hash `e12e79ba9077...`: BikesHelmets203, BikesHelmets64, BikesHelmets697
- Hash `3d4e2bc03c59...`: BikesHelmets205, BikesHelmets348
- Hash `036ec0d4e5fa...`: BikesHelmets207, BikesHelmets674
- Hash `0b1a2c2e82d5...`: BikesHelmets208, BikesHelmets308, BikesHelmets99
- Hash `035d647c4f67...`: BikesHelmets211, BikesHelmets265, BikesHelmets625
- Hash `5d122bf9ebf3...`: BikesHelmets213, BikesHelmets599
- Hash `0c7c13916e33...`: BikesHelmets216, BikesHelmets230, BikesHelmets359
- Hash `23c3cb113c60...`: BikesHelmets229, BikesHelmets268, BikesHelmets455
- Hash `8b6476f50e17...`: BikesHelmets231, BikesHelmets398
- Hash `95d265c3416e...`: BikesHelmets237, BikesHelmets539, BikesHelmets695
- Hash `dd008b5f24cc...`: BikesHelmets26, BikesHelmets475, BikesHelmets498, BikesHelmets691, BikesHelmets727
- Hash `3d0cf245ca3e...`: BikesHelmets262, BikesHelmets267, BikesHelmets317, BikesHelmets327
- Hash `8abe04cac42f...`: BikesHelmets270, BikesHelmets400
- Hash `41eb4eb620c2...`: BikesHelmets272, BikesHelmets342, BikesHelmets696
- Hash `2ba50c90b977...`: BikesHelmets273, BikesHelmets567
- Hash `31851afbe3b8...`: BikesHelmets276, BikesHelmets89
- Hash `9199066492bd...`: BikesHelmets277, BikesHelmets6
- Hash `849160d9c537...`: BikesHelmets278, BikesHelmets503
- Hash `f1b078ae15f9...`: BikesHelmets284, BikesHelmets414
- Hash `a6f6f93ca0e2...`: BikesHelmets288, BikesHelmets458, BikesHelmets590
- Hash `2e83f3e869f3...`: BikesHelmets29, BikesHelmets713, BikesHelmets732
- Hash `f343a10e89aa...`: BikesHelmets290, BikesHelmets373
- Hash `87411a510459...`: BikesHelmets297, BikesHelmets399, BikesHelmets614
- Hash `cd7f7b5f7154...`: BikesHelmets299, BikesHelmets571, BikesHelmets750
- Hash `c86b9aa949cc...`: BikesHelmets300, BikesHelmets568
- Hash `2be44c882ef6...`: BikesHelmets302, BikesHelmets397, BikesHelmets49
- Hash `802a625e2c12...`: BikesHelmets305, BikesHelmets5, BikesHelmets588, BikesHelmets681, BikesHelmets736
- Hash `c161e7b688af...`: BikesHelmets310, BikesHelmets350
- Hash `751d33781ae9...`: BikesHelmets321, BikesHelmets728
- Hash `186f3ed8bb33...`: BikesHelmets325, BikesHelmets710
- Hash `eda59b30ad74...`: BikesHelmets328, BikesHelmets358, BikesHelmets448, BikesHelmets496, BikesHelmets743
- Hash `381e0fa05254...`: BikesHelmets336, BikesHelmets760
- Hash `7a8045f8e3ba...`: BikesHelmets367, BikesHelmets481
- Hash `70b25c5777d5...`: BikesHelmets368, BikesHelmets407
- Hash `a56f890b8284...`: BikesHelmets371, BikesHelmets528
- Hash `2a9751779956...`: BikesHelmets375, BikesHelmets422
- Hash `710358f62cde...`: BikesHelmets385, BikesHelmets440
- Hash `51da6ec7fe80...`: BikesHelmets389, BikesHelmets608
- Hash `a1e273b2e733...`: BikesHelmets390, BikesHelmets538, BikesHelmets698
- Hash `3af4525be894...`: BikesHelmets393, BikesHelmets430
- Hash `e7d49c9d4e54...`: BikesHelmets394, BikesHelmets47
- Hash `48039ed0c261...`: BikesHelmets40, BikesHelmets81
- Hash `04a0a54ec0e2...`: BikesHelmets416, BikesHelmets610
- Hash `dfba88312de3...`: BikesHelmets425, BikesHelmets552
- Hash `c513b44cebf5...`: BikesHelmets429, BikesHelmets546
- Hash `4e265a5756c7...`: BikesHelmets435, BikesHelmets669
- Hash `3b6ea0ab6e00...`: BikesHelmets453, BikesHelmets575
- Hash `a1380d1aa323...`: BikesHelmets464, BikesHelmets544
- Hash `95cea8c82921...`: BikesHelmets487, BikesHelmets604
- Hash `7f7fb9557b52...`: BikesHelmets502, BikesHelmets718
- Hash `774ccc7c17d9...`: BikesHelmets504, BikesHelmets561, BikesHelmets66
- Hash `e49738277dc5...`: BikesHelmets524, BikesHelmets716
- Hash `72d39ff7f064...`: BikesHelmets569, BikesHelmets603
- Hash `8a9377647cd4...`: BikesHelmets572, BikesHelmets725
- Hash `97a9db190a0d...`: BikesHelmets578, BikesHelmets9
- Hash `7111506a29d5...`: BikesHelmets58, BikesHelmets581, BikesHelmets717
- Hash `748440cb51f1...`: BikesHelmets611, BikesHelmets644
- Hash `4fb944dfa7f3...`: BikesHelmets636, BikesHelmets65, BikesHelmets703
- Hash `897353f27520...`: BikesHelmets689, BikesHelmets708
- Hash `fcea5774858d...`: BikesHelmets753, BikesHelmets88

## 9. Missing Files

- Missing images (have annotation, no image): **0**
- Missing annotations (have image, no annotation): **0**

## 10. Dataset Quality Assessment

**Overall Quality: NEEDS ATTENTION**

- ✅ All annotations have matching images
- ✅ All images have matching annotations
- ❌ 17 invalid bounding boxes
- ⚠️ 3 empty annotations (images with no labeled objects)
- ℹ️ Dataset is moderately small (764 images) — fine-tuning from pretrained weights recommended
- ℹ️ Class imbalance: ~2:1 ratio (helmet vs no_helmet)

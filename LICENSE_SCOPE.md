# License scope

This repository contains material under **different licenses**, plus
**third-party material that is not licensed by the repository owner**. Read this
file before reusing anything.

Copyright (c) 2026 Krish Sachithanand, except where noted otherwise below.

## 1. Original source code — MIT (`LICENSES/MIT.txt`)

The original software written for this project is licensed under the MIT
License:

- `NewtonSimAI_source/` — the constrained-condition tool (the author's own code).
  *Excludes* third-party npm dependencies (see §4).
- `scripts/` — the build and validation scripts.

## 2. Original data and original documentation — CC BY 4.0 (`LICENSES/CC-BY-4.0.txt`)

The original datasets and original written documentation are licensed under the
Creative Commons Attribution 4.0 International License:

- `scoring_data.csv` (reported summary data)
- `data/criterion_level_scoring.csv` and `data/DATA_DICTIONARY.md` (derived data
  and its documentation)
- `README.md`, `README.txt`, `PROVENANCE.md`, `REPRODUCIBILITY.md`,
  `ARTIFACT_AVAILABILITY.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`,
  `RELEASE_NOTES.md`, `RELEASE_CHECKLIST.md`, and the `prompts/` and
  `constrained_simulations/` documentation written for this archive.
- The author-written prompt in `prompts/` (the constrained extraction system
  prompt is also part of the MIT-licensed source; the archived copy and the
  unconstrained question-5 generation prompt are the author's own text).

## 3. Generated Claude Opus 4.6 outputs — included for research inspection

- `unconstrained_simulations/Q05..Q23/` (the generated `index.html`,
  `styles_projectile.css`, `projectile.js`, `main_projectile.py`), and
- `constrained_simulations/` (the constrained tool's generated outputs).

These were produced by AI models from the study inputs. They are included so the
research can be inspected and rerun. **No rights are claimed over these generated
outputs beyond whatever rights the repository owner can lawfully grant**; reuse
of AI-generated material is the reuser's responsibility. They are not placed
under MIT or CC BY 4.0 by this file.

## 4. Third-party dependencies — their own licenses

`NewtonSimAI_source/package.json` (and the generated pages' CDN includes such as
Chart.js and Matter.js) reference third-party libraries that retain their own
licenses. Node dependencies are not vendored here; reinstall with `npm install`.

## 5. Force Concept Inventory (FCI) material — NOT licensed here

The Force Concept Inventory questions/images are third-party assessment material
and are **excluded from both the MIT and CC BY 4.0 licenses**. They are **not
redistributed** in this archive. See `THIRD_PARTY_NOTICES.md` and
`unconstrained_simulations/FCI_INPUTS_NOTICE.md`.

---

SPDX summary: `MIT` (code) and `CC-BY-4.0` (data/docs). Third-party FCI material
and third-party dependencies are excluded from both.

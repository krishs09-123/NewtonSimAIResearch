# Changelog

All notable changes to this research archive are documented here. This project
uses semantic-version tags; the archive is deposited to Zenodo per release.

## [1.0.0] — 2026-07-11

First archived release, prepared for deposit to Zenodo and assignment of a DOI.

### Corrected

- **Unconstrained-condition documentation.** The README files now state the
  methodology correctly: GPT-4o-mini performs question-detail extraction in the
  **constrained** condition only; in the **unconstrained** condition Claude Opus
  4.6 handled both question interpretation and simulation-code generation, and
  GPT-4o-mini was not used.
- **Cross-references** to the manuscript were aligned (rubric = Table II; raw
  data = Table III; FCI questions = Figures 1–5).
- **Unconstrained artifacts** were corrected to the authoritative four-file
  generations. Each generation now includes its own Opus-generated FastAPI
  backend (`main_projectile.py`), verified against the author's original ZIP
  records; run instructions updated to use each generation's own backend.

### Added

- **Derived criterion-level data** (`data/criterion_level_scoring.csv`) with a
  data dictionary (`data/DATA_DICTIONARY.md`), plus
  `scripts/build_criterion_level_scoring.py` (deterministic build) and
  `scripts/validate_research_data.py` (validates exact agreement with the
  reported summary; exits nonzero on any discrepancy).
- **Prompts** (`prompts/`): the constrained extraction system prompt (verbatim
  from source, with provenance), and the exact unconstrained generation prompt
  for question 5 (PDF authoritative + text extraction), with a README noting the
  other four questions' prompts were not retained.
- **Citation and Zenodo metadata** (`CITATION.cff`, `.zenodo.json`).
- **Provenance and reproducibility documentation** (`PROVENANCE.md`,
  `REPRODUCIBILITY.md`, `ARTIFACT_AVAILABILITY.md`, `RELEASE_NOTES.md`,
  `RELEASE_CHECKLIST.md`).
- **Licensing structure** (`LICENSES/MIT.txt`, `LICENSES/CC-BY-4.0.txt`,
  `LICENSE_SCOPE.md`): MIT for original source code; CC BY 4.0 for original data
  and documentation.
- **Release manifest** (`MANIFEST.sha256`) and `scripts/build_manifest.py`.

### Clarified

- **Unavailable original artifacts** are documented rather than reconstructed:
  the constrained extraction JSON configurations, the exact unconstrained
  prompts for questions 16/17/22/23, and a record identifying which of the 36
  archived constrained runs were the five scored outputs.
- **Third-party material.** The Force Concept Inventory question images are
  third-party and were **removed** from the release snapshot (no redistribution
  permission); question numbers, figure mapping, and scenario paraphrases are
  retained (`unconstrained_simulations/FCI_INPUTS_NOTICE.md`,
  `THIRD_PARTY_NOTICES.md`).

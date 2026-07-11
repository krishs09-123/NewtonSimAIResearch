# NewtonSimAIResearch v1.0.3

Archived release of the data, software, and supplementary materials for the
pilot study **"Constrained vs. Unconstrained Free-Fall and Projectile-Motion AI
Problem-to-Simulation Generation."**

**Change from v1.0.2:** the constrained condition is now archived as the **five
scored generations**, one per question, in `constrained_simulations/Q05..Q23/` —
mirroring the unconstrained condition. The previous `constrained_simulations_raw/`
folder (which included non-study test/duplicate runs from the tool's output
directory) and its "best-match / not certified" hedging are removed: the five
generations are the ones the study author scored. The constrained-condition
rubric audit is therefore reproducible on the exact scored artifacts. No scoring
data changed. (Earlier: v1.0.2 fixed citation-metadata DOI consistency; v1.0.1
corrected the unconstrained-prompt provenance.)

## Study scope

Two AI problem-to-simulation pipelines are compared on five Force Concept
Inventory (FCI) questions (Q5, Q16, Q17, Q22, Q23), **one generation per question
per condition** (10 generations), scored against a 17-criterion technical and
physical accuracy rubric:

- **Constrained (NewtonSimAI):** GPT-4o-mini extracts question details into a
  fixed simulation framework.
- **Unconstrained (Claude Opus 4.6):** the model handles both question
  interpretation and code generation; GPT-4o-mini is not used.

Because only one generation per question per condition was evaluated, this
archive does **not** establish a repeated-generation hallucination/error rate.

## Contents

- `unconstrained_simulations/Q##/` — the five unconstrained generations, each a
  complete four-file artifact (`index.html`, `styles_projectile.css`,
  `projectile.js`, and its own `main_projectile.py` backend).
- `NewtonSimAI_source/` — the constrained tool's source code.
- `constrained_simulations/` — the five scored NewtonSimAI generations, one per
  question, served by the shared framework backend in `NewtonSimAI_source/`.
- `prompts/` — the constrained extraction system prompt (verbatim) and the exact
  unconstrained generation prompt (a single prompt used for all five questions).
- `scoring_data.csv` — reported summary scores (manuscript Table III).
- `data/criterion_level_scoring.csv` + `data/DATA_DICTIONARY.md` — derived
  criterion-level scoring and its documentation.
- `scripts/` — deterministic build + validation for the derived data, and the
  manifest builder.

## Data files

- `scoring_data.csv` — reported summary (two rows per FCI item).
- `data/criterion_level_scoring.csv` — **derived** (170 rows), reconstructed from
  the reported summary and the rubric; validated to match the reported values
  exactly.

## Reproducibility limitations

- The constrained condition requires an OpenAI API key and is not byte-for-byte
  deterministic; API-mediated outputs may vary if a provider changes model
  behavior behind the same name.
- One generation per question per condition — no run-to-run variability rate.
- Rerunning the tools does not reconstruct the exact historical outputs; use the
  archived artifacts for exact inspection. See `REPRODUCIBILITY.md`.

## Unavailable / not-retained records

- Constrained extraction JSON configurations (config was injected into the
  generated code, not saved separately).
- A record identifying which of the 36 constrained runs were the five scored
  outputs.

These are documented, not reconstructed (`ARTIFACT_AVAILABILITY.md`). The
unconstrained generation prompt **is** included (one prompt, all five questions).

## Third-party material

The Force Concept Inventory question images are third-party and are **not
redistributed** here (removed from the snapshot); question numbers, figure
mapping, and scenario paraphrases are retained. See `THIRD_PARTY_NOTICES.md`.

## Licensing

- Original **source code** — MIT (`LICENSES/MIT.txt`).
- Original **data and documentation** — CC BY 4.0 (`LICENSES/CC-BY-4.0.txt`).
- FCI material and third-party dependencies are excluded from both. See
  `LICENSE_SCOPE.md`. (The Zenodo record carries a single license field; the
  file-level split in `LICENSE_SCOPE.md` is authoritative.)

## Citing this archive

This archive is on Zenodo. Cite the **concept DOI**, which always resolves to the
latest version:

> https://doi.org/10.5281/zenodo.21314578

Zenodo also mints a version-specific DOI for each release (shown on that
release's Zenodo record) for anyone who needs to pin an exact version.

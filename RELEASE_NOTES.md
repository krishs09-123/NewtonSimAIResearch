# NewtonSimAIResearch v1.0.2

Archived release of the data, software, and supplementary materials for the
pilot study **"Constrained vs. Unconstrained Free-Fall and Projectile-Motion AI
Problem-to-Simulation Generation."**

**Change from v1.0.1:** citation-metadata consistency fix. `CITATION.cff` now
references only the **concept DOI** (which always resolves to the latest
version), removing a version/DOI mismatch; the README and data-availability text
no longer hardcode a version-specific DOI. `REPRODUCIBILITY.md` now states
explicitly that the constrained-condition audit cannot be exactly reproduced
(the five scored runs among the 36 archived are not individually certified). No
data or code changed. (v1.0.1 corrected the unconstrained-prompt provenance: the
single archived prompt was used for all five questions.)

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
- `constrained_simulations_raw/` — the constrained tool's original generation
  history (36 runs; the five scored runs are among them but not individually
  certified).
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

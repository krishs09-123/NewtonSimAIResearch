# Provenance

This file records where the archived materials come from and how they relate to
the study, so that the archive can be understood and audited independently.

**Release candidate assembled:** 2026-07-11
**Repository:** https://github.com/krishs09-123/NewtonSimAIResearch
**Release commit:** the annotated tag for the release is created from `main`
after the preparation branch (`zenodo-release-prep`) is merged. The exact
release commit SHA is recorded on the Git tag and in `RELEASE_NOTES.md` at
release time.

## Study conditions

The pilot study compares two AI problem-to-simulation pipelines, each turning a
Force Concept Inventory (FCI) question into an interactive free-fall /
projectile-motion simulation, scored against a 17-criterion technical and
physical accuracy rubric.

- **Constrained (NewtonSimAI):** GPT-4o-mini extracts structured question
  details, which are normalized and inserted into NewtonSimAI's fixed simulation
  framework.
- **Unconstrained (Claude Opus 4.6):** the model receives the FCI question and
  generation instructions and handles **both** question interpretation and
  simulation-code generation. GPT-4o-mini is **not** used in this condition.

One generation per question per condition was evaluated (10 generations total).

## FCI questions evaluated

Five FCI items: **Q5, Q16, Q17, Q22, Q23** (mapped to manuscript Figures 1–5
respectively). The FCI items themselves are third-party material and are not
redistributed here (see `THIRD_PARTY_NOTICES.md`).

## Models

- **GPT-4o-mini** — constrained-condition extraction step. Called with
  `temperature = 0` (see `prompts/constrained_extraction_system_prompt.txt`).
- **Claude Opus 4.6** — unconstrained-condition generation, via the model's
  **web-based interface** (not the API), per the manuscript.

Exact model build identifiers, request timestamps, seeds, and (for Claude)
sampling parameters are **not** recorded in the available materials and are not
invented here.

## Prompts

- **Available:** the constrained extraction system prompt (verbatim from
  `NewtonSimAI_source/server.js`), and the exact unconstrained generation prompt
  for **question 5** (`prompts/`).
- **Not retained:** the exact unconstrained generation prompts for questions 16,
  17, 22, and 23. See `prompts/README.md`.

## Unavailable / not-retained records

- The constrained extraction JSON configurations (config was injected into the
  generated `projectile.js`, not saved separately).
- A record identifying which of the 36 archived constrained runs were the five
  scored outputs (see `constrained_simulations_raw/PROVENANCE.md`).
- The unconstrained generation prompts for questions 16, 17, 22, 23.

These are stated as limitations, not reconstructed. See
`ARTIFACT_AVAILABILITY.md` for the full inventory.

## Derivation of `data/criterion_level_scoring.csv`

The criterion-level file is **derived**, not an original scoring sheet. It is
produced deterministically from the reported summary (`scoring_data.csv`) and
the published 17-criterion rubric (manuscript Table II) plus the reported
per-item failed-criterion lists (Table III):

1. `scripts/build_criterion_level_scoring.py` expands the reported results into
   one row per (question × condition × criterion), applying the rubric's
   applicability rules (three criteria are conditional, so the applicable count
   ranges 14–17).
2. `scripts/validate_research_data.py` recomputes the per-item met / applicable /
   accuracy / failed values from the criterion-level file and confirms exact
   agreement with `scoring_data.csv` and with an independent hard-coded copy of
   the Table III values, exiting nonzero on any discrepancy.

## Unconstrained artifact provenance

The five unconstrained generations were recovered from the study author's
original ZIP records (`Unconstrained 1–5.zip`). Each generation's four files
were verified: the archived `index.html`, `styles_projectile.css`, and
`projectile.js` are byte-identical to those records, and each generation's own
`main_projectile.py` backend was added from the same records. The
folder→question mapping (U1→Q05, U2→Q22, U3→Q17, U4→Q16, U5→Q23) was confirmed
by content hashing.

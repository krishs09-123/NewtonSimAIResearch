# Constrained vs. Unconstrained AI Problem-to-Simulation Generation

[![DOI](https://zenodo.org/badge/1297605690.svg)](https://doi.org/10.5281/zenodo.21314578)

Supplementary materials and code for the pilot study **"Constrained vs.
Unconstrained Free-Fall and Projectile-Motion AI Problem-to-Simulation
Generation."**

This repository lets a reader inspect everything behind the paper: the
unconstrained simulation artifacts, the constrained tool's source code, the
prompts, and the scored results. (The Force Concept Inventory question inputs
are third-party material and are **not** redistributed here — see
`THIRD_PARTY_NOTICES.md`.)

## DOI / citation

This repository is archived on Zenodo. **Cite the concept DOI**, which always
resolves to the latest archived version:

- **Concept DOI (recommended for the manuscript):**
  [10.5281/zenodo.21314578](https://doi.org/10.5281/zenodo.21314578) — the badge
  above.
- Each release also has its own **version-specific DOI**, shown on that release's
  Zenodo record, if you need to pin an exact version.

See `CITATION.cff` for citation metadata.

---

## The study in brief

The study compares two AI "problem-to-simulation" pipelines. Each turns a Force
Concept Inventory (FCI) physics question into an interactive free-fall /
projectile-motion simulation, and each simulation is audited against a
**17-criterion technical and physical-accuracy rubric** (feature availability +
apparent physics-consistency).

| Condition | What it is | How a simulation is produced | Result |
|-----------|-----------|------------------------------|--------|
| **Constrained** | **NewtonSimAI** — a fixed, hard-coded free-fall / projectile framework | GPT-4o-mini extracts the problem details from the FCI screenshot; the framework renders the simulation | **100% on all five questions** |
| **Unconstrained** | **Claude Opus 4.6** — no framework | Claude Opus 4.6 received the FCI question image and the generation prompt (feature + physics requirements) and handled **both** question-detail interpretation and simulation-code generation | **50%–100%** |

**Condition detail (methodology).**

- *Constrained condition:* GPT-4o-mini extracted structured question details,
  which were normalized and inserted into NewtonSimAI's fixed simulation
  framework.
- *Unconstrained condition:* Claude Opus 4.6 received the FCI question image and
  generation instructions and handled **both** question interpretation and
  simulation-code generation within the unconstrained workflow. **GPT-4o-mini was
  not used in the unconstrained condition.** (Per the manuscript, Claude Opus 4.6
  was used through its web-based interface for this condition.)

Five FCI problems were used — Q5 (free fall), Q16 (projectile), Q17 (free fall),
Q22 (projectile), Q23 (projectile) — with one generation per question per
condition.

**Headline finding:** constraining the generation to a validated framework
produced complete, physics-consistent simulations every time, while the
unconstrained model was capable but inconsistent — ranging from a perfect Q22 to
a 50% Q5 that displayed no motion graphs.

---

## Repository structure

```
NewtonSimAI_Research/
├── README.md                     ← this file (overall project overview)
├── README.txt                    ← detailed reviewer notes (run steps, column defs)
│
├── unconstrained_simulations/    ← Claude Opus 4.6 generations, one per question
│   ├── Q05/  (index.html, styles_projectile.css, projectile.js, main_projectile.py)
│   ├── Q16/  Q17/  Q22/  Q23/   (same 4 generated files each)
│   └── FCI_INPUTS_NOTICE.md      (FCI question inputs are third-party; not redistributed)
│
├── constrained_simulations/      ← NewtonSimAI generations, one per question (the
│   ├── Q05/  Q16/  Q17/  Q22/  Q23/   five scored constrained artifacts)
│   └── README.md
│
├── NewtonSimAI_source/           ← the constrained tool's source code + the
│                                    shared physics backend the constrained sims use
│
├── prompts/                      ← constrained extraction system prompt (verbatim)
│                                    + prompt provenance notes
├── data/                         ← derived criterion-level scoring + data dictionary
│   ├── criterion_level_scoring.csv  (170 rows; reconstructed — see provenance)
│   └── DATA_DICTIONARY.md
├── scripts/                      ← build + validation scripts for the derived data
│
└── scoring_data.csv              ← reported summary scores (manuscript Table III)
```

Licensing, citation, provenance, reproducibility, third-party notices, and a
file manifest are provided in dedicated files at the repository root (added to
prepare this repository as an archived research artifact).

Each `unconstrained_simulations/Q##/` folder holds one complete Claude Opus 4.6
generation as its **four generated files**: `index.html`,
`styles_projectile.css`, `projectile.js`, and its own generated FastAPI backend
`main_projectile.py`. Each generation is self-contained — it runs against its
**own** `main_projectile.py`, not the constrained tool's backend.

The FCI question images that were the inputs are **not redistributed** (they are
third-party material — see `unconstrained_simulations/FCI_INPUTS_NOTICE.md` and
`THIRD_PARTY_NOTICES.md`). For reference, each folder corresponds to an FCI item
and a manuscript figure: Q05 = FCI Q5 = Figure 1, Q16 = FCI Q16 = Figure 2,
Q17 = FCI Q17 = Figure 3, Q22 = FCI Q22 = Figure 4, Q23 = FCI Q23 = Figure 5.

---

## Scored outcomes (unconstrained condition)

From the paper's Table III (Raw Data). Every **constrained** generation scored 100%.

| Question | Manuscript figure | Scenario | Score | Failed criteria |
|----------|-------------------|----------|-------|-----------------|
| **Q05** | Figure 1 | Steel ball thrown straight up (free fall) | **50.00%** *(outlier)* | modifiable mass/height/velocity, speed options, time scrubbing, motion graphs (none displayed), physics-consistency |
| **Q16** | Figure 2 | Cannonball fired off a cliff (projectile) | **94.12%** | enable/disable view of the air-drag force vector |
| **Q17** | Figure 3 | Stone dropped from a one-story roof (free fall) | **93.33%** | correct setup (rendered as projectile, not free fall) |
| **Q22** | Figure 4 | Golf ball driven down a fairway (projectile) | **100.00%** | none |
| **Q23** | Figure 5 | Bowling ball out of a flying airliner (projectile) | **88.24%** | enable/disable view of the gravity and air-drag force vectors |

`scoring_data.csv` has two rows per FCI item (one per condition). Columns:
`fci_question`, `condition`, `criteria_met`, `applicable_criteria` (14–17, since
some criteria apply only to projectile or air-resistance setups),
`accuracy_percent`, `failed_criteria_count`, and `failed_criteria`
(semicolon-separated; empty when nothing failed).

### Criterion-level matrix — `data/criterion_level_scoring.csv`

For criterion-by-criterion inspection, `data/criterion_level_scoring.csv`
expands the summary into **one row per simulation × criterion** (10 simulations
× 17 rubric criteria = **170 rows**). Columns:

| Column | Meaning |
|--------|---------|
| `fci_question` | FCI item number (5, 16, 17, 22, 23) |
| `condition` | `Constrained` or `Unconstrained` |
| `criterion_number` | Rubric criterion index, 1–17 |
| `criterion` | The rubric criterion text (manuscript Table II wording) |
| `applicable` | `true` / `false` — whether this criterion applies to this item's setup |
| `result` | `Pass`, `Fail`, or `Not applicable` |
| `provenance` | Always `Reconstructed from scoring_data.csv and the published rubric` |
| `notes` | Why a criterion is N/A, or the basis of the pass/fail |

> **This file is a DERIVED artifact, not a contemporaneous raw scoring sheet.**
> It is deterministically reconstructed from the reported summary
> (`scoring_data.csv`) and the published rubric (manuscript Table II) plus the
> reported per-item failed-criterion lists (Table III). Regenerate it with
> `scripts/build_criterion_level_scoring.py` and verify it with
> `scripts/validate_research_data.py`, which exits nonzero unless the derived
> file reproduces the reported `met / applicable / accuracy / failed` values for
> all ten item/condition rows exactly. See `data/DATA_DICTIONARY.md` for full
> column definitions and the applicability rules (three criteria are
> conditional, so the applicable-criteria total ranges from 14 to 17).

---

## Reproducing the results

The scoring is a manual application of the 17-criterion rubric to each running
simulation, so "reproducing" means running the artifact and re-checking each
criterion (use `data/criterion_level_scoring.csv` as the expected answer key). What
is and isn't deterministic:

- **Unconstrained condition — fully deterministic.** The five
  `unconstrained_simulations/Q##/` folders are the *fixed generated code* that
  was scored (static HTML/CSS/JS plus each generation's own
  `main_projectile.py`). Running a generation against its **own** backend
  reproduces the same behavior; the trajectory maths are deterministic. A
  reviewer re-checking the rubric against these should land on the same
  per-criterion results.
- **Constrained condition — fully deterministic.** The five
  `constrained_simulations/Q##/` folders are the *fixed generated code* that was
  scored (static HTML/CSS/JS), served by the shared NewtonSimAI backend. Running
  them reproduces the same behavior. (Re-running the **live tool**,
  `NewtonSimAI_source/`, instead re-generates from scratch and calls GPT-4o-mini
  for the extraction step — that path needs an OpenAI API key and is **not**
  byte-for-byte deterministic, so for an exact artifact match use the archived
  generations, not a fresh live run.)

Two things a reviewer should know before testing:

1. **The unconstrained apps open with generic default inputs** (e.g. mass 1,
   height 50, speed 30, angle 45), not each question's scenario — the scoring is
   **feature-based** (is *modifiable mass* present and functional, do the motion
   graphs populate, etc.), not a check of specific numbers. The FCI question
   scenarios are summarized in `unconstrained_simulations/FCI_INPUTS_NOTICE.md`
   (the FCI images themselves are third-party and not redistributed).
2. **A physics backend must be running** (`127.0.0.1:8000`) for the simulations
   to compute — for the unconstrained sims, each generation's **own**
   `main_projectile.py`; and an internet connection is needed for the Chart.js
   plotting library (loaded from its CDN). See below.

---

## Running an unconstrained simulation

Each unconstrained generation is self-contained: its `index.html` +
`projectile.js` fetch their trajectory/force time series from **that
generation's own** FastAPI backend, `main_projectile.py`, which lives in the
same `Q##/` folder. Opening `index.html` without its backend running will render
the page, but the motion will not compute.

1. **Install the backend dependencies** (Python 3.9+):
   ```bash
   pip install fastapi uvicorn
   # On Windows you may need:  py -m pip install fastapi uvicorn
   ```
2. **Start that generation's own backend** from its folder (one generation at a
   time — each backend listens on port 8000):
   ```bash
   cd unconstrained_simulations/Q05        # or Q16 / Q17 / Q22 / Q23
   uvicorn main_projectile:app --host 127.0.0.1 --port 8000
   # On Windows:  py -m uvicorn main_projectile:app --host 127.0.0.1 --port 8000
   ```
3. **Open** that same folder's `index.html` in a browser. The backend allows
   cross-origin requests, so the page fetches its data and animates. (Keep an
   internet connection so the Chart.js plotting library loads from its CDN.)

---

## Running the full constrained tool (NewtonSimAI)

`NewtonSimAI_source/` is the complete source of the constrained-condition tool.
To run it (upload an FCI screenshot → generated simulation), follow
`NewtonSimAI_source/README.md`: install Node.js 18+ and the Python deps above,
create a `.env` from `.env.example` with an OpenAI API key (used only for the
GPT-4o-mini extraction step), then `npm start` and open
`http://localhost:3000`.

**Intentionally excluded** from the source: `node_modules/` (reinstall with
`npm install`) and `.env` (contained a live API key; use `.env.example`).

---

## Constrained generated outputs — `constrained_simulations/`

`constrained_simulations/Q05..Q23/` holds the **five constrained-condition
generations scored in the study**, one per FCI question — the exact generations
the study author audited (each `index.html`, `projectile.js`,
`styles_projectiles.css`). Every constrained generation scored 100% of its
applicable rubric criteria.

Unlike the unconstrained generations, these do **not** ship their own backend —
they are served by the shared NewtonSimAI framework backend
(`NewtonSimAI_source/templates/Projectile_motion/main_projectile.py`) at
`127.0.0.1:8000`. See `constrained_simulations/README.md` for the
question/figure mapping and run steps.

---

## Requirements summary

| Task | Needs |
|------|-------|
| View an unconstrained simulation | Python 3.9+ (`fastapi`, `uvicorn`) + a browser + internet (Chart.js CDN) |
| Run the full constrained tool | the above **plus** Node.js 18+ and an OpenAI API key (see `NewtonSimAI_source/README.md`) |

---

*See `README.txt` for the extended reviewer notes.*

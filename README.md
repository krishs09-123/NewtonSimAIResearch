# Constrained vs. Unconstrained AI Problem-to-Simulation Generation

Supplementary materials and code for the pilot study **"Constrained vs.
Unconstrained Free-Fall and Projectile-Motion AI Problem-to-Simulation
Generation."**

This repository lets a reader inspect everything behind the paper: the
unconstrained simulation artifacts, the constrained tool's source code, the
Force Concept Inventory (FCI) problem inputs, and the scored results.

---

## The study in brief

The study compares two AI "problem-to-simulation" pipelines. Each turns a Force
Concept Inventory (FCI) physics question into an interactive free-fall /
projectile-motion simulation, and each simulation is audited against a
**17-criterion technical rubric** (feature availability + apparent
physics-consistency).

| Condition | What it is | How a simulation is produced | Result |
|-----------|-----------|------------------------------|--------|
| **Constrained** | **NewtonSimAI** — a fixed, hard-coded free-fall / projectile framework | GPT-4o-mini extracts the problem details from the FCI screenshot; the framework renders the simulation | **100% on all five questions** |
| **Unconstrained** | **Claude Opus 4.6** — no framework | Claude Opus 4.6 received the FCI question image and the generation prompt (feature + physics requirements) and handled **both** question-detail interpretation and simulation-code generation | **50%–100%** |

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
│   ├── Q05/   (index.html, projectile.js, styles_projectile.css, No.5.webp)
│   ├── Q16/   (... No.16.webp)
│   ├── Q17/   (... No.17.webp)
│   ├── Q22/   (... No.22.webp)
│   └── Q23/   (... No.23.webp)
│
├── NewtonSimAI_source/           ← the constrained tool's source code
│                                    (also provides the physics backend the
│                                     unconstrained sims call — see below)
│
├── constrained_simulations_raw/  ← the constrained tool's original generated
│                                    outputs (36 historical runs) + provenance
│
├── scoring_data.csv              ← per-simulation summary scores (paper Table 2)
└── criterion_level_scoring.csv   ← full criterion-by-criterion matrix (170 rows)
```

Each `unconstrained_simulations/Q##/` folder holds one generated simulation
plus the FCI question image (`No.<n>.webp`) that was used as its input.

---

## Scored outcomes (unconstrained condition)

From the paper's results table. Every **constrained** generation scored 100%.

| Question | Scenario | Score | Failed criteria |
|----------|----------|-------|-----------------|
| **Q05** | Steel ball thrown straight up (free fall) | **50.00%** *(outlier)* | modifiable mass/height/velocity, speed options, time scrubbing, motion graphs (none displayed), physics-consistency |
| **Q16** | Cannonball fired off a cliff (projectile) | **94.12%** | enable/disable view of the air-drag force vector |
| **Q17** | Stone dropped from a one-story roof (free fall) | **93.33%** | correct setup (rendered as projectile, not free fall) |
| **Q22** | Golf ball driven down a fairway (projectile) | **100.00%** | none |
| **Q23** | Bowling ball out of a flying airliner (projectile) | **88.24%** | enable/disable view of the gravity and air-drag force vectors |

`scoring_data.csv` has two rows per FCI item (one per condition). Columns:
`fci_question`, `condition`, `criteria_met`, `applicable_criteria` (14–17, since
some criteria apply only to projectile or air-resistance setups),
`accuracy_percent`, `failed_criteria_count`, and `failed_criteria`
(semicolon-separated; empty when nothing failed).

### Criterion-level matrix — `criterion_level_scoring.csv`

For criterion-by-criterion verification, `criterion_level_scoring.csv` expands
the summary into **one row per simulation × criterion** (10 simulations × 17
rubric criteria = **170 rows**). Columns:

| Column | Meaning |
|--------|---------|
| `fci_question` | FCI item number (5, 16, 17, 22, 23) |
| `condition` | `Constrained` or `Unconstrained` |
| `criterion` | The rubric criterion (one of the 17, verbatim from the paper's Figure 1) |
| `applicable` | `Yes` / `No` — whether this criterion applies to this problem's setup |
| `result` | `Pass`, `Fail`, or `Not applicable` |
| `evidence_or_notes` | Short note: why a criterion is N/A, or the observed reason a criterion failed |

The 17 criteria and their applicability rules come from the paper's **Figure 1
(Technical Evaluation Rubric)**. Three criteria are conditional: *modifiable
launch angle* and *horizontal velocity constant* apply to projectile-motion
setups only, and the *force_air_drag vector* view applies to air-resistance
setups only — which is why the applicable-criteria total ranges from 14 to 17.
Every Pass/Fail/N/A entry is derived from, and reconciles exactly with, the
recorded per-criterion outcomes in `scoring_data.csv` (paper Table 2): the
matrix reproduces the same met/applicable/failed counts for all ten
simulations. It is an expansion of the study's recorded scoring, not a
re-scoring.

---

## Reproducing the results

The scoring is a manual application of the 17-criterion rubric to each running
simulation, so "reproducing" means running the artifact and re-checking each
criterion (use `criterion_level_scoring.csv` as the expected answer key). What
is and isn't deterministic:

- **Unconstrained condition — fully deterministic.** The five
  `unconstrained_simulations/Q##/` folders are the *fixed generated code* that
  was scored (static HTML/JS). Running them reproduces the exact same behavior;
  the trajectory maths come from the included physics backend, which is
  deterministic. A reviewer re-checking the rubric against these should land on
  the same per-criterion results.
- **Constrained condition — two paths.** (a) *Deterministic:* the exact
  generated outputs are archived in `constrained_simulations_raw/` (static code)
  — run those to reproduce behavior directly. (b) *Live tool:* running
  `NewtonSimAI_source/` re-generates from scratch and calls GPT-4o-mini for the
  extraction step, which needs an OpenAI API key (costs money) and is **not
  byte-for-byte deterministic** — a fresh run can differ in the extracted
  numbers. The rubric criteria it was scored on are framework-guaranteed
  features, so a live run still meets them (the study recorded 100%), but for an
  *exact* artifact match use the archived outputs.

Two things a reviewer should know before testing:

1. **The unconstrained apps open with generic default inputs** (e.g. mass 1,
   height 50, speed 30, angle 45), not each question's scenario — the scoring is
   **feature-based** (is *modifiable mass* present and functional, do the motion
   graphs populate, etc.), not a check of specific numbers. Each folder includes
   its FCI question image (`No.<n>.webp`) so the intended scenario is on hand.
2. **The physics backend must be running** (`127.0.0.1:8000`) for *either*
   condition's simulations to compute, and an internet connection is needed for
   the Chart.js plotting library (loaded from its CDN). See below.

---

## Running an unconstrained simulation

Each simulation page fetches its trajectory/force time series from a small
physics backend (FastAPI, `main_projectile.py`, included in
`NewtonSimAI_source`). Opening `index.html` without the backend running will
render the page, but the motion will not compute.

1. **Install the backend dependencies** (Python 3.9+):
   ```bash
   pip install fastapi uvicorn
   # On Windows you may need:  py -m pip install fastapi uvicorn
   ```
2. **Start the physics backend** from the source template folder:
   ```bash
   cd NewtonSimAI_source/templates/Projectile_motion
   uvicorn main_projectile:app --host 127.0.0.1 --port 8000
   # On Windows:  py -m uvicorn main_projectile:app --host 127.0.0.1 --port 8000
   ```
3. **Open** the desired `unconstrained_simulations/Q##/index.html` in a browser.
   The backend allows cross-origin requests, so the page fetches its data and
   animates. (Keep an internet connection so the Chart.js plotting library loads
   from its CDN.)

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

## Constrained generated outputs — `constrained_simulations_raw/`

Alongside the source, this folder archives the **original generated simulations
the constrained tool produced**, recovered from the actual tool instance used in
the study — **36 historical runs**, each with the tool's emitted `index.html`,
`projectile.js`, and `styles_projectiles.css`. The extracted configuration is
injected into `projectile.js` (not saved as separate JSON), and
`constrained_runs_parameters.csv` tabulates those parameters for all 36 runs.

Because the 36 runs mix the five scored generations with repeated test runs and
nothing logs which folder was scored, individual runs **cannot be certified** as
the exact scored artifact. As a convenience, one best-scenario-fit run per
question is **flagged** (`flagged_best_match` column) with stated confidence.
See `constrained_simulations_raw/PROVENANCE.md` for the full explanation and the
flagging table. (All constrained runs scored 100% on their applicable criteria,
so the flagged run and its near-duplicates are behaviorally equivalent.)

---

## Requirements summary

| Task | Needs |
|------|-------|
| View an unconstrained simulation | Python 3.9+ (`fastapi`, `uvicorn`) + a browser + internet (Chart.js CDN) |
| Run the full constrained tool | the above **plus** Node.js 18+ and an OpenAI API key (see `NewtonSimAI_source/README.md`) |

---

*See `README.txt` for the extended reviewer notes.*

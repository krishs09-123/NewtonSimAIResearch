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
| **Unconstrained** | **Claude Opus 4.6** — no framework | The model is given a prompt (feature + physics requirements) plus the FCI question/screenshot, and writes the simulation code fresh (GPT-4o-mini still extracts the problem details) | **50%–100%** |

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
└── scoring_data.csv              ← the rubric scores reported in the paper
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

## Requirements summary

| Task | Needs |
|------|-------|
| View an unconstrained simulation | Python 3.9+ (`fastapi`, `uvicorn`) + a browser + internet (Chart.js CDN) |
| Run the full constrained tool | the above **plus** Node.js 18+ and an OpenAI API key (see `NewtonSimAI_source/README.md`) |

---

*See `README.txt` for the extended reviewer notes.*

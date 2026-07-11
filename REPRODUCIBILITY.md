# Reproducibility

This document explains what can and cannot be reproduced from this archive, and
how to run each piece. Read the limitations at the end before drawing
conclusions about reproducibility.

## 1. Running the constrained tool (NewtonSimAI)

Requirements:

- **Node.js 18+** (runs `server.js`)
- **Python 3.9+** with **FastAPI** and **Uvicorn** (`pip install fastapi uvicorn`)
- An **OpenAI API key** — required for the GPT-4o-mini question-extraction step

Steps (see `NewtonSimAI_source/README.md` for details):

```bash
cd NewtonSimAI_source
npm install
cp .env.example .env         # then put your OpenAI API key in .env
npm start                    # serves http://localhost:3000; auto-starts the Python backend
```

Upload an FCI screenshot; the tool extracts details (GPT-4o-mini), injects them
into its fixed framework, and renders a simulation.

## 2. Running an unconstrained simulation

Each unconstrained generation is **self-contained** and ships its own backend.

Requirements:

- **Python 3.9+** with **FastAPI** and **Uvicorn**
- A web browser, and an internet connection (the pages load Chart.js — and
  Matter.js — from a CDN)

Steps (one generation at a time; each backend uses port 8000):

```bash
cd unconstrained_simulations/Q05          # or Q16 / Q17 / Q22 / Q23
pip install fastapi uvicorn               # once
uvicorn main_projectile:app --host 127.0.0.1 --port 8000
# then open unconstrained_simulations/Q05/index.html in a browser
```

Do **not** point these at the constrained tool's backend — run each
generation's own `main_projectile.py`.

## 3. Rebuilding and validating the derived data

Standard-library Python only:

```bash
python scripts/build_criterion_level_scoring.py   # writes data/criterion_level_scoring.csv
python scripts/validate_research_data.py          # exits nonzero on any disagreement
```

## 4. Required versions and dependencies (summary)

| Component | Needs |
|-----------|-------|
| Constrained tool | Node.js 18+, Python 3.9+ (`fastapi`, `uvicorn`), OpenAI API key |
| Unconstrained simulations | Python 3.9+ (`fastapi`, `uvicorn`), browser, internet (CDN) |
| Data scripts | Python 3.9+ (standard library only) |

## 5. What reproduces exactly, and what does not

- **Reproduces the reported files exactly:** the fixed generated code that was
  scored is archived for **both** conditions — `unconstrained_simulations/`
  (five generations, each with its own backend) and `constrained_simulations/`
  (the five scored NewtonSimAI generations, served by the shared backend).
  Running them reproduces the same behavior, so the rubric audit can be
  re-performed on the exact scored artifacts. The derived
  `data/criterion_level_scoring.csv` is regenerated deterministically and
  validated against the reported summary.
- **Re-running the live tool does not reproduce the exact historical output:**
  running the **constrained tool** (`NewtonSimAI_source/`) live re-invokes
  GPT-4o-mini and regenerates from scratch, which is not byte-for-byte
  deterministic. For an exact artifact match, use the archived
  `constrained_simulations/` generations rather than a fresh live run.

## Limitations (please read)

- **The constrained condition requires an OpenAI API key** for its extraction
  step; that step incurs cost.
- **API-mediated outputs may vary.** A provider can change model behavior behind
  the same model name over time, so a rerun is not guaranteed to match the
  original extraction/generation.
- **One generation per question per condition** was evaluated (10 total). This
  archive therefore **does not** establish a repeated-generation hallucination or
  error rate; single generations cannot characterize run-to-run variability.
- **Rerunning the system now is not guaranteed to reconstruct the exact
  historical outputs** of either condition. Use the archived artifacts for exact
  inspection; use the tools to rerun the workflow.
- The unconstrained generations were produced through Claude Opus 4.6's
  **web-based interface**; there is no API script that deterministically
  regenerates them.

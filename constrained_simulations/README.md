# Constrained simulations (NewtonSimAI)

These are the **five constrained-condition generations scored in the study**, one
per FCI question — the exact generations the study author audited against the
rubric. Each was produced by the constrained tool (NewtonSimAI): GPT-4o-mini
extracted the question details, which were normalized and injected into the
tool's fixed simulation framework.

| Folder | FCI item | Manuscript figure | Scenario |
|--------|----------|-------------------|----------|
| `Q05/` | FCI Q5 | Figure 1 | Ball thrown straight up (free fall) |
| `Q16/` | FCI Q16 | Figure 2 | Ball launched off an elevated ledge (projectile) |
| `Q17/` | FCI Q17 | Figure 3 | Object dropped from a roof (free fall) |
| `Q22/` | FCI Q22 | Figure 4 | Ball driven down a fairway (projectile) |
| `Q23/` | FCI Q23 | Figure 5 | Object released from a flying airliner (projectile) |

Each folder holds the tool's generated files: `index.html`, `projectile.js`, and
`styles_projectiles.css`. Every constrained generation scored **100%** of its
applicable rubric criteria (manuscript Table III).

## Running a constrained simulation

Unlike the unconstrained generations (which each ship their own backend), the
constrained generations are served by the **NewtonSimAI framework backend**
(`NewtonSimAI_source/templates/Projectile_motion/main_projectile.py`), which they
fetch at `http://127.0.0.1:8000`.

```bash
# start the shared NewtonSimAI physics backend
cd NewtonSimAI_source/templates/Projectile_motion
uvicorn main_projectile:app --host 127.0.0.1 --port 8000
# then open constrained_simulations/Q05/index.html (or Q16 / Q17 / Q22 / Q23)
```

Keep an internet connection so the Chart.js / Matter.js CDN assets load.

## Note on the source

These generations were recovered from the constrained tool instance used in the
study (its `generated/` output directory). That directory also accumulated
additional non-study test/duplicate runs from tool development; those are not
part of the study and are not included here. The five folders above are the
generations that were scored.

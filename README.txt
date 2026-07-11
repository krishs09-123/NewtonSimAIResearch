================================================================================
Constrained vs. Unconstrained AI Problem-to-Simulation Generation
Supplementary Materials
================================================================================

This archive accompanies the pilot study "Constrained vs. Unconstrained Free-Fall
and Projectile-Motion AI Problem-to-Simulation Generation." It lets a reviewer
inspect the unconstrained simulation artifacts, the constrained tool's source
code, the FCI problem inputs, and the scored results reported in the paper.


--------------------------------------------------------------------------------
1. STUDY CONTEXT (what these artifacts are)
--------------------------------------------------------------------------------

The study evaluates two AI "problem-to-simulation" pipelines that turn a Force
Concept Inventory (FCI) physics question into an interactive free-fall /
projectile-motion simulation, and audits each against a 17-criterion technical
rubric (feature availability + apparent physics-consistency).

  * CONSTRAINED condition  = NewtonSimAI. A fixed, hard-coded free-fall /
    projectile framework. GPT-4o-mini extracts the problem details from the FCI
    screenshot; the framework renders the simulation. Source is in
    NewtonSimAI_source/. Scored 100% on all five questions.

  * UNCONSTRAINED condition = Claude Opus 4.6. Claude Opus 4.6 received the FCI
    question image and the generation prompt (stating the feature + physics
    requirements) and handled both question-detail interpretation and
    simulation-code generation, with no framework. These generations are in
    unconstrained_simulations/. Scored 50%-100%.

Five FCI problems were used: Q5 (free fall), Q16 (projectile), Q17 (free fall),
Q22 (projectile), Q23 (projectile). One generation was produced per question per
condition.

This archive contains the UNCONSTRAINED simulation artifacts (the more variable,
more interesting condition), the constrained tool's source, the FCI inputs, and
the full scoring data.


--------------------------------------------------------------------------------
2. ARCHIVE STRUCTURE
--------------------------------------------------------------------------------

NewtonSimAI_Supplementary_Materials/
|
+-- README.txt                     <- this file
|
+-- unconstrained_simulations/     <- Claude Opus 4.6 generations, one per question
|   +-- Q05/   (index.html, projectile.js, styles_projectile.css, No.5.webp)
|   +-- Q16/   (... No.16.webp)
|   +-- Q17/   (... No.17.webp)
|   +-- Q22/   (... No.22.webp)
|   +-- Q23/   (... No.23.webp)
|
+-- NewtonSimAI_source/            <- the constrained tool's source code
|                                     (also provides the physics backend used to
|                                      run the unconstrained sims -- see Section 4)
|
+-- constrained_simulations_raw/   <- the constrained tool's original generated
|                                     outputs (36 historical runs) + PROVENANCE.md
|
+-- scoring_data.csv               <- per-simulation summary scores (paper Table III)
|
+-- criterion_level_scoring.csv    <- full criterion-by-criterion matrix (170 rows)


--------------------------------------------------------------------------------
3. unconstrained_simulations/  (the artifacts + how they map to questions)
--------------------------------------------------------------------------------

Each Q## folder is the unconstrained (Claude Opus 4.6) generation for that FCI
item, together with the FCI question image that was used as the input:

  index.html              The generated simulation page (open this to run it).
  projectile.js           The generated simulation logic (rendering, controls,
                          graphs, and calls to the physics backend).
  styles_projectile.css   The generated styling.
  No.<n>.webp             The FCI question screenshot given to the model for this
                          item (to re-test / reproduce).

Folder-to-question mapping and each item's scored outcome (from the paper,
Table III):

  Q05  = FCI Q5  (steel ball thrown straight up; free fall)      50.00%  [outlier]
         Failed: modifiable mass/height/velocity, speed options, time scrubbing,
         motion graphs (none displayed), physics-consistency.
  Q16  = FCI Q16 (cannonball fired off a cliff; projectile)      94.12%
         Failed: enable/disable view of the air-drag force vector.
  Q17  = FCI Q17 (stone dropped from a one-story roof; free fall) 93.33%
         Failed: correct setup selection (was rendered as projectile, not free fall).
  Q22  = FCI Q22 (golf ball driven down a fairway; projectile)   100.00%
         No failures.
  Q23  = FCI Q23 (bowling ball out of a flying airliner; projectile) 88.24%
         Failed: enable/disable view of the gravity and air-drag force vectors.


--------------------------------------------------------------------------------
4. HOW TO RUN AN UNCONSTRAINED SIMULATION
--------------------------------------------------------------------------------

The simulations are interactive: each page fetches its trajectory/force time
series from a small physics backend (FastAPI, "main_projectile.py", included in
NewtonSimAI_source). They call it at http://127.0.0.1:8000. Opening index.html
without the backend running will render the page, but the motion will not
compute.

To view a simulation:

  1. Install Python 3.9+ and the backend dependencies:
         pip install fastapi uvicorn
     (On Windows you may need:  py -m pip install fastapi uvicorn)

  2. Start the physics backend from the source template folder:
         cd NewtonSimAI_source/templates/Projectile_motion
         uvicorn main_projectile:app --host 127.0.0.1 --port 8000
     (On Windows:  py -m uvicorn main_projectile:app --host 127.0.0.1 --port 8000)

  3. Open the desired unconstrained_simulations/Q##/index.html in a web browser.
     The backend allows cross-origin requests, so the page will fetch its data
     and animate. (Keep an internet connection so the Chart.js plotting library
     can load from its CDN.)

The five FCI question images (No.<n>.webp) are included alongside each simulation
so the input that produced it is on hand.


--------------------------------------------------------------------------------
5. NewtonSimAI_source/  (the constrained tool)
--------------------------------------------------------------------------------

This is the source code of NewtonSimAI, the constrained-condition tool. It also
supplies the physics backend that the unconstrained simulations call (Section 4).
Layout:

  server.js                     Main Node/Express server (the entry point).
  public/                       Front-end upload page (index.html, app.css).
  templates/Projectile_motion/  Simulation template + physics backend:
      index_projectile.html, projectile.js, styles_projectile.css  (template)
      main_projectile.py        FastAPI physics backend (trajectory maths)
      manifest.json, message.txt
  package.json / package-lock.json   Node dependency manifests.
  .env.example                  Template for the environment file you create.
  README.md                     Full setup / run / troubleshooting guide.

To run the full constrained tool (upload an FCI screenshot -> generated sim),
follow NewtonSimAI_source/README.md: install Node 18+ and Python deps, create a
.env from .env.example with an OpenAI API key (used only for the constrained
tool's GPT-4o-mini extraction), then `npm start` and open http://localhost:3000.

Excluded from this archive (intentionally):
  * node_modules/ - reinstall with `npm install`; omitted for size.
  * .env          - contained a live API key; NOT distributed. Use .env.example.


--------------------------------------------------------------------------------
5b. constrained_simulations_raw/  (the constrained tool's generated outputs)
--------------------------------------------------------------------------------

This folder archives the ORIGINAL generated simulations that the constrained
tool (NewtonSimAI) produced, recovered from the actual tool instance used in the
study -- 36 historical runs. Each sim_<hash>/ folder holds the tool's emitted
index.html, projectile.js, and styles_projectiles.css. The extracted config is
injected into projectile.js (dropHeight_m, launchSpeed_mps, launchAngle_deg,
ballMass, airEnabled); the tool did not save a separate JSON config.

  constrained_runs_parameters.csv  Extracted parameters for all 36 runs, plus a
                                   scenario signature and a best-match flag.
  PROVENANCE.md                    Full explanation + the best-match table.

Limitation: the study scored five constrained simulations, but this folder holds
36 runs (the unpruned generation history, mixing scored runs with test runs).
The runs collapse to only 11 distinct parameter signatures and nothing logs
which folder was scored, so no single run can be CERTIFIED as the exact scored
artifact. One best-scenario-fit run per question is flagged (with confidence) in
the CSV and PROVENANCE.md as a convenience, not a certification. All constrained
runs scored 100% on applicable criteria, so a flagged run and its near-duplicates
are behaviorally equivalent for scoring.


--------------------------------------------------------------------------------
6. scoring_data.csv  (the results reported in the paper)
--------------------------------------------------------------------------------

Two rows per FCI item, one per condition. Columns:

  fci_question          FCI item number (5, 16, 17, 22, 23).
  condition             "Constrained" or "Unconstrained".
  criteria_met          Number of rubric criteria the simulation satisfied.
  applicable_criteria   Number of the 17 rubric criteria applicable to this item
                        (some criteria apply only to projectile setups or only to
                        air-resistance setups, so totals vary: 14-17).
  accuracy_percent      criteria_met / applicable_criteria, as a percentage.
  failed_criteria_count Number of applicable criteria not met.
  failed_criteria       Semicolon-separated names of the failed criteria; empty
                        when nothing failed.

All constrained generations scored 100%.


--------------------------------------------------------------------------------
6b. criterion_level_scoring.csv  (full criterion-by-criterion matrix)
--------------------------------------------------------------------------------

For criterion-level verification, criterion_level_scoring.csv expands the
summary into one row per simulation-criterion combination: 10 simulations
(5 questions x 2 conditions) x 17 rubric criteria = 170 rows. Columns:

  fci_question       FCI item number (5, 16, 17, 22, 23).
  condition          "Constrained" or "Unconstrained".
  criterion          The rubric criterion, verbatim from the paper's Table II
                     (Technical and Physical Accuracy Evaluation Rubric).
  applicable         "Yes" / "No" -- whether this criterion applies to the
                     problem's setup.
  result             "Pass", "Fail", or "Not applicable".
  evidence_or_notes  Why a criterion is N/A, or the observed reason it failed.

The 17 criteria and their applicability rules are taken from the paper's
Table II. Three criteria are conditional: "modifiable launch angle" and
"horizontal velocity constant" apply to projectile-motion setups only, and the
"force_air_drag vector" view applies to air-resistance setups only -- which is
why the applicable-criteria total ranges from 14 to 17. Every Pass/Fail/N/A
entry is derived from, and reconciles exactly with, the recorded per-criterion
outcomes in scoring_data.csv (paper Table III); it reproduces the same
met/applicable/failed counts for all ten simulations. This file is an expansion
of the study's recorded scoring, not a re-scoring.


--------------------------------------------------------------------------------
7. REQUIREMENTS SUMMARY
--------------------------------------------------------------------------------

  View an unconstrained simulation:  Python 3.9+ (fastapi, uvicorn) + a browser +
                                     internet (for the Chart.js CDN).
  Run the full constrained tool:     the above, plus Node.js 18+ and an OpenAI
                                     API key. See NewtonSimAI_source/README.md.

================================================================================
End of README
================================================================================

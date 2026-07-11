# Constrained condition — raw generated simulations (provenance)

This folder archives the **original generated outputs of the constrained tool
(NewtonSimAI)** as they existed on the study machine, recovered from the actual
tool instance used during the study (`Research Constrained Version/generated/`,
files dated the study period). It exists to address the reviewer note that the
constrained condition previously shipped only source code, not the generated
artifacts.

## What is here

- **36 generated simulation folders** (`sim_<hash>/`), each containing the
  files the tool emitted: `index.html`, `projectile.js`, `styles_projectiles.css`.
  The extracted problem configuration is **injected into `projectile.js`** (the
  `dropHeight_m`, `launchSpeed_mps`, `launchAngle_deg`, `ballMass`, `airEnabled`
  variables near the top); the tool did **not** save a separate JSON config file.
- **`constrained_runs_parameters.csv`** — one row per run with those extracted
  parameters, a `scenario_signature`, and the best-match flagging described below.

These are runnable the same way as the unconstrained simulations: start the
physics backend (see the top-level README, Section "Running an unconstrained
simulation") and open a run's `index.html`.

## Important limitation (why this is "raw" and not "the five scored artifacts")

The study scored **five** constrained simulations (one per FCI question), but
this folder holds **36 runs** — the complete, unpruned generation history, which
mixes the scored generations with repeated test/trial runs. Two facts make it
impossible to certify *which* folder was the exact scored artifact:

1. **Heavy duplication with no run-level scoring log.** The 36 runs collapse to
   only 11 distinct parameter signatures (e.g., 10 near-identical
   `h0 s50 a90 m0.45` runs). Nothing recorded at generation time marks a given
   folder as "the one that was scored."
2. **The default `airEnabled` flag is not a reliable question fingerprint.** Per
   the paper's method, physics criteria were scored with air resistance
   *disabled* and the air-drag *vector* was checked with air resistance
   *enabled* — i.e., the tester toggled air manually during scoring. So a run's
   stored `airEnabled` default does not necessarily reflect whether its question
   "involves air."

Regenerating now would not recreate the exact historical artifacts either. This
archive is therefore the **honest maximal record**: every run that exists, kept
as-is.

## Best-match flagging (`flagged_best_match` column)

As a convenience, one run per question is flagged as the **best scenario fit**
by its injected parameters. These are **best guesses, not certified** as the
scored artifact, and confidence is stated per row.

| Question | Flagged run | Signature (h/s/a/mass/air) | Why | Confidence |
|----------|-------------|-----------------------------|-----|------------|
| **Q05** — steel ball thrown straight up (free fall) | `sim_0c0e9c474f15f331` | h0 · s50 · a90 · 0.45 kg · air off | Thrown straight up (angle 90, speed > 0), no air = free-fall signature | moderate-high |
| **Q16** — cannonball off a cliff (projectile) | `sim_bbec400394fed270` | h100 · s50 · a0 · 10 kg · air on | Heavy ball launched horizontally from a height with air = cliff cannonball | moderate-high |
| **Q17** — stone dropped from a roof (free fall) | `sim_17498930ee4d5a64` | h100 · s0 · a90 · 0.5 kg · air off | Dropped (speed 0) vertically from a height = free-fall drop | moderate |
| **Q22** — golf ball down a fairway (projectile) | `sim_427b10f7a77689a2` | h0 · s50 · a0 · 0.45 kg · air on | Light ball from ground level with air = golf-on-fairway | moderate |
| **Q23** — bowling ball from a flying airliner (projectile) | `sim_00f5c9d1ef6b41d3` | h100 · s100 · a0 · 6.8 kg · air off | 6.8 kg = regulation bowling-ball mass, launched horizontally at high speed from height = airliner drop; the strongest single mass signal in the set | moderate |

All constrained simulations scored **100%** on their applicable criteria (paper
Table III), so the flagged run and its near-duplicates are behaviorally
equivalent for scoring purposes — the uncertainty is only about *which physical
folder* was the scored one, not about the outcome.

## Verification of the flagged runs

Each of the five flagged runs was loaded against the physics backend and its
rendered behavior checked against its assigned scenario. All five rendered
consistently with the flagging:

| Question | Flagged run | Rendered initial conditions | Observed motion | Match |
|----------|-------------|-----------------------------|-----------------|-------|
| Q05 | `sim_0c0e9c474f15f331` | mass 0.45, height 0, velocity 50, angle **90°**, air off | Ball launched **straight up**, apex directly overhead, vertical return | consistent |
| Q16 | `sim_bbec400394fed270` | mass 10, height 100, velocity 50, angle 0°, air **on** | Projectile launched horizontally from height; **air-drag vector visible** | consistent |
| Q17 | `sim_17498930ee4d5a64` | mass 0.5, height 100, **velocity 0**, angle 90°, air off | **Pure vertical drop** (start/end vertically aligned, no horizontal travel) | consistent |
| Q22 | `sim_427b10f7a77689a2` | mass 0.45, height 0, velocity 50, angle 0°, air **on** | Light ball at ground level with air enabled (flat angle-0 launch) | consistent |
| Q23 | `sim_00f5c9d1ef6b41d3` | mass **6.8**, height 100, velocity 100, angle 0°, air off | Projectile **arc from height** with forward horizontal velocity | consistent |

This confirms the parameter extraction and scenario assignment are correct — it
does **not** upgrade any run to "certified scored artifact," since the run's
near-duplicates would render identically. The velocity-0 drop (Q17) versus the
velocity-50 upward throw (Q05) is a clean qualitative separator between the two
free-fall items.

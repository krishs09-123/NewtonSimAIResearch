# Artifact availability

This table states plainly what is and is not archived, and how each item
relates to the reported study. "Used directly in reported scoring" means the
artifact is (a copy of) something scored in the study, as opposed to the
implementation that produced it or a derived record.

| Artifact | Condition | Status | Location | Original or derived | Used directly in reported scoring | Limitations / provenance notes |
|----------|-----------|--------|----------|---------------------|-----------------------------------|--------------------------------|
| Reported summary scores | Both | Available | `scoring_data.csv` | Reported summary (transcribed from manuscript Table III) | Yes — these are the reported scores | Numeric values reproduce Table III exactly; `failed_criteria` labels use the canonical rubric names. |
| Unconstrained simulations (Q05, Q16, Q17, Q22, Q23) | Unconstrained | Available | `unconstrained_simulations/Q##/` | Original generated artifacts (Claude Opus 4.6) | Yes — these are the scored unconstrained artifacts | Each is the complete 4-file generation (`index.html`, `styles_projectile.css`, `projectile.js`, its own `main_projectile.py`). Verified byte-identical to the author's original ZIP records; `index_projectile.html` archived as `index.html`. |
| NewtonSimAI source code | Constrained | Available | `NewtonSimAI_source/` | Original source code | Indirectly — the implementation that produced the constrained outputs | This is the tool, **not** the exact five scored output folders. `node_modules/` and `.env` excluded. |
| Exact five constrained scored output folders | Constrained | Source code available; **exact experimental output not individually identifiable** | `constrained_simulations_raw/` (36 historical runs) | Original generated artifacts (unpruned generation history) | Partially — the scored five are among the 36 but not certified | The tool never logged which run was scored; the 36 collapse to 11 distinct configs. One best-fit run per question is *flagged, not certified*. See `constrained_simulations_raw/PROVENANCE.md`. |
| Constrained extraction JSON configurations | Constrained | **Not retained** | — | — | Would have been an input to scoring | The tool injected the extracted config directly into `projectile.js` at generation time; no separate JSON record was saved. Not reconstructed. |
| Constrained extraction system prompt | Constrained | Available | `prompts/constrained_extraction_system_prompt.txt` | Original (verbatim from source) | Yes — used for every constrained extraction | Byte-identical to the `const system` string in `server.js`; header records commit + blob hash + model parameters. |
| Unconstrained generation prompt (all five questions) | Unconstrained | Available | `prompts/unconstrained_generation_prompt.pdf` (+ `.txt`) | Original (author's prompt) | Yes — the generation prompt for every unconstrained item | Per the author, this single prompt was used for all five questions (prompt + the question's FCI item as input). PDF is authoritative; the text copy is an auto-extraction. Contains no embedded FCI text/image. |
| Criterion-level scoring records | Both | **Reconstructed from reported summary data** | `data/criterion_level_scoring.csv` | Derived | No — derived, not an independent contemporaneous record | Deterministically rebuilt from `scoring_data.csv` + the published rubric by `scripts/build_criterion_level_scoring.py`; validated to match the reported values exactly by `scripts/validate_research_data.py`. |
| FCI question inputs (images) | Both | **Third-party material — not redistributed** | Removed from snapshot; see `unconstrained_simulations/FCI_INPUTS_NOTICE.md` | Third-party | Yes — they were the model inputs | No redistribution rights held. Question numbers, manuscript-figure mapping, and scenario paraphrases retained; the images themselves are excluded. |
| Manuscript / figures / screenshots | — | **Not included** | — | — | — | The manuscript and its figures are not part of this archive; cite the published article. |

## Summary of what is NOT retained or NOT redistributed

- **Not retained (do not exist in the available records):** the constrained
  extraction JSON configurations; and a record identifying which of the 36
  constrained runs were the five scored outputs. (The unconstrained generation
  prompt **is** available — a single prompt used for all five questions.)
- **Third-party, not redistributed:** the Force Concept Inventory question
  images (removed from the release snapshot).
- **Derived, not original:** `data/criterion_level_scoring.csv` (reconstructed
  from the reported summary and the rubric).

None of the above were regenerated and presented as originals.

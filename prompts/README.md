# Prompts

This folder archives the AI prompts used in the two study conditions, together
with their provenance. Read the availability notes carefully — one exact prompt
is present for every constrained generation, but the exact unconstrained prompt
is present for **question 5 only**.

## Constrained condition — `constrained_extraction_system_prompt.txt`

- **What it is:** the exact system prompt sent to **GPT-4o-mini** for the
  question-detail *extraction* step in the constrained NewtonSimAI pipeline.
- **Provenance:** copied verbatim from the implementation
  (`NewtonSimAI_source/server.js`, the `const system` string in
  `inferSimulationConfigFromImage()`). The file's header records the source
  path, the Git commit, the `server.js` blob hash, and the model call
  parameters (`model = "gpt-4o-mini"`, `temperature = 0`). The archived text is
  byte-identical to the source string.
- **Scope:** used in the **constrained** condition only. GPT-4o-mini was **not**
  used in the unconstrained condition.

## Unconstrained condition — `unconstrained_generation_prompt_question5.*`

- **What it is:** the exact generation prompt given to **Claude Opus 4.6** to
  build the unconstrained simulation for **FCI question 5**. It is a detailed
  "build these 4 files to this contract" specification (file names, server
  injection contract, FastAPI endpoints, required DOM IDs, physics rules, and
  output format).
- **Files:**
  - `unconstrained_generation_prompt_question5.pdf` — the **authoritative**
    record, exactly as provided by the study author.
  - `unconstrained_generation_prompt_question5.txt` — an auto-extracted text
    copy for convenience. PDF-to-text extraction introduces whitespace
    artifacts; the PDF is authoritative. No wording was edited.
- **Important:** this prompt file contains the generation instructions only. It
  does **not** embed the FCI question text or a screenshot (the PDF has zero
  embedded images). The FCI question image/screenshot was supplied separately as
  an input to Claude Opus 4.6; it is third-party Force Concept Inventory
  material and is **not** redistributed here (see `THIRD_PARTY_NOTICES.md`).

### Availability of the other unconstrained prompts

The exact generation prompts used for the unconstrained condition of
**questions 16, 17, 22, and 23 were not provided and are not retained in the
available research records.** They are not reconstructed or invented here. Only
the question-5 prompt was available.

## Method summary, not the original prompt

*The following is a summary of the unconstrained method drawn from the
manuscript and the archived question-5 prompt. It is **not** a substitute for
the original prompts of questions 16, 17, 22, and 23, which were not retained.*

- Per the manuscript, in the unconstrained condition Claude Opus 4.6 received
  the FCI question and generation instructions and handled **both** question
  interpretation and simulation-code generation; GPT-4o-mini was not used. The
  model was interacted with through its **web-based interface** (not the API).
- The manuscript states the unconstrained prompt "explicitly states both feature
  and physical accuracy requirements."
- The archived question-5 prompt is consistent with this: it instructs the model
  to build a 4-file (`index.html`, `styles_projectile.css`, `projectile.js`,
  `main_projectile.py`) no-framework web + FastAPI simulation "from scratch,"
  specifying a detailed frontend/backend contract for the resulting simulation.
- The exact wording of the prompts for the other four questions is unknown from
  the available records and is therefore not represented here.

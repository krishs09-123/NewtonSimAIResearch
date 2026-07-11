# Prompts

This folder archives the AI prompts used in the two study conditions, together
with their provenance. The exact prompt for **both** conditions is present: the
constrained extraction system prompt, and the single unconstrained generation
prompt that was used for **all five** questions.

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

## Unconstrained condition — `unconstrained_generation_prompt.*`

- **What it is:** the exact generation prompt given to **Claude Opus 4.6**. Per
  the study author, this **single prompt was used for all five questions**: each
  unconstrained generation was produced by giving Claude Opus 4.6 this prompt
  **plus that question's FCI item** as input. The prompt text is the same across
  the five questions; the FCI question is the variable. (The source file the
  author provided is named "Prompts for question 5.pdf" — despite the filename,
  it is the common prompt for all five.)
- **What it contains:** a detailed "build these 4 files to this contract"
  specification — file names, server injection contract, FastAPI endpoints,
  required DOM IDs, physics rules, and output format. It is generic (not
  question-specific).
- **Files:**
  - `unconstrained_generation_prompt.pdf` — the **authoritative** record,
    exactly as provided by the study author.
  - `unconstrained_generation_prompt.txt` — an auto-extracted text copy for
    convenience. PDF-to-text extraction introduces whitespace artifacts; the PDF
    is authoritative. No wording was edited.
- **Important:** this prompt contains the generation instructions only. It does
  **not** embed the FCI question text or a screenshot (the PDF has zero embedded
  images). The FCI question was supplied separately as an input per generation;
  it is third-party Force Concept Inventory material and is **not** redistributed
  here (see `THIRD_PARTY_NOTICES.md`).

### How this maps to the manuscript

- Per the manuscript, in the unconstrained condition Claude Opus 4.6 received the
  FCI question and generation instructions and handled **both** question
  interpretation and simulation-code generation; GPT-4o-mini was not used. The
  model was interacted with through its **web-based interface** (not the API).
- The manuscript states the unconstrained prompt "explicitly states both feature
  and physical accuracy requirements." The archived prompt is consistent with
  this: it instructs the model to build a 4-file (`index.html`,
  `styles_projectile.css`, `projectile.js`, `main_projectile.py`) no-framework
  web + FastAPI simulation "from scratch," specifying a detailed frontend/backend
  contract for the resulting simulation.

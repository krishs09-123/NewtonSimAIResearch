# Third-party notices

This archive includes or depends on third-party material that is **not** covered
by this repository's software (MIT) or data/documentation (CC BY 4.0) licenses.
Inclusion or reference here does not transfer ownership.

## Force Concept Inventory (FCI)

The five questions used as study inputs are drawn from the **Force Concept
Inventory (FCI)**, a third-party physics-education assessment instrument.

- The FCI questions and their images are **third-party assessment material**.
- They are **not** covered by this repository's licenses.
- Their use as study inputs, and any description of them here, **does not
  transfer ownership** or grant redistribution rights.
- **The FCI question images are NOT redistributed in this archive.** The
  repository owner does not hold redistribution rights (permission was not
  granted). The five image files were removed from the release snapshot; only
  the question numbers, manuscript-figure mapping, and scenario paraphrases are
  retained (see `unconstrained_simulations/FCI_INPUTS_NOTICE.md`). The archived
  simulations run without them.

Original FCI publication (please cite when referring to the instrument):

> Hestenes, D., Wells, M., & Swackhamer, G. (1992). Force Concept Inventory.
> *The Physics Teacher, 30*(3), 141–158. https://doi.org/10.1119/1.2343497

Access to the FCI is controlled by its authors/publishers; obtain it through the
appropriate channel rather than from this archive.

## Software dependencies

The constrained tool and the generated simulations reference third-party
software libraries, each under its own license, including but not limited to:

- **Node.js packages** declared in `NewtonSimAI_source/package.json` (e.g.
  Express, Multer, the OpenAI SDK). These are **not vendored** in this
  repository; run `npm install` to fetch them under their own licenses.
- **Chart.js** and **Matter.js**, loaded at runtime from a CDN by the generated
  simulation pages, under their respective licenses.
- **FastAPI** and **Uvicorn** (Python), installed via `pip`, under their own
  licenses.

Each dependency's license governs its use; consult the respective projects.

## AI-generated outputs

The generated simulation outputs (`unconstrained_simulations/`,
`constrained_simulations_raw/`) were produced by AI models (Claude Opus 4.6;
GPT-4o-mini for the constrained extraction step). See `LICENSE_SCOPE.md` §3 for
how these are treated.

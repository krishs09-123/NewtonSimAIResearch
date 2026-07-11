# NewtonSimAI — Screenshot → Physics Simulation

Upload a screenshot of a projectile-motion / freefall physics problem, and the app uses
OpenAI's vision model to read it, infer the initial conditions (velocity, angle, height,
mass, air resistance, etc.), and generate an interactive HTML simulation of the motion.

> This app does **not** answer or grade the question — it only configures and renders a simulation.

---

## What you need

| Requirement | Why | Notes |
|-------------|-----|-------|
| **Node.js 18+** | Runs the main web server (`server.js`) | [nodejs.org](https://nodejs.org) — LTS is fine |
| **Python 3.9+** | Runs the FastAPI physics backend (`main_projectile.py`) that `server.js` auto-starts | [python.org](https://python.org). On Windows the launcher `py` must be on your PATH |
| **OpenAI API key** | Used to read the screenshot and infer the simulation config | Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — the vision model (`gpt-4o-mini`) calls cost money |

---

## Setup

### 1. Install Node dependencies

From the project folder:

```bash
npm install
```

> **Windows / PowerShell note:** if you get *"running scripts is disabled on this system"*,
> either run `npm.cmd install`, or allow local scripts once with:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

### 2. Install Python dependencies

```bash
pip install fastapi uvicorn
```

(On Windows you may need `py -m pip install fastapi uvicorn`.)

### 3. Add your OpenAI API key

Create a file named **`.env`** in the project root (copy `.env.example`) and fill it in:

```
OPENAI_API_KEY=sk-your-key-here
```

The `.env` file is git-ignored, so your key stays private.

---

## Running the app

```bash
npm start
```

or

```bash
node server.js
```

You should see:

```
✅ FastAPI started from: ...templates/Projectile_motion
Server running at http://localhost:3000
```

Then open **http://localhost:3000** in your browser.

`server.js` automatically launches the Python FastAPI service on port **8000** — you do
**not** need to start it yourself. Stopping the Node server (Ctrl+C) also stops it.

---

## Configuration (optional)

These environment variables can go in your `.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | *(required)* | Your OpenAI key |
| `PORT` | `3000` | Port for the web server |
| `DEBUG` | `false` | Set to `true` to log the raw vision JSON and inferred config |
| `MAIN_JS_FILENAME` | `projectile.js` | The simulation script inside the template folder |

---

## How it works

1. You upload an image to the web page (served from `public/`).
2. `POST /generate` sends it to OpenAI's vision model, which returns a JSON config
   (velocity, angle, height, mass, air resistance, UI mode…).
3. `server.js` injects those values into the template in `templates/Projectile_motion/`.
4. A unique simulation is written to `generated/sim_<id>/` and served at
   `/sims/sim_<id>/index.html`.

---

## Project structure

```
server.js                     # Main Express server (this is what you run)
public/                       # Front-end page (index.html, app.css)
templates/Projectile_motion/  # Simulation template + FastAPI physics backend
  ├─ index_projectile.html
  ├─ projectile.js            # Simulation logic (values injected at generate time)
  ├─ styles_projectile.css
  └─ main_projectile.py       # FastAPI service (auto-started by server.js)
generated/                    # Created at runtime — one folder per generated sim
.env                          # Your secrets (create this; git-ignored)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find package 'multer'` (or express, openai…) | You didn't install deps — run `npm install` in the project folder |
| `running scripts is disabled on this system` | See the PowerShell note under Setup step 1 |
| `⚠️ FastAPI not started` | Python or `py`/`uvicorn` not found — install Python and `pip install fastapi uvicorn` |
| 401 / auth error from OpenAI | Missing or invalid `OPENAI_API_KEY` in `.env` |
| Port already in use | Set a different `PORT` in `.env`, or free port 3000/8000 |

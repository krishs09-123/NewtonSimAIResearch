// server.js — Screenshot → Simulation (NO QUESTIONS/GRADING)
import multer from "multer";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import express from "express";
import { spawn } from "child_process";
import crypto from "crypto";

// -------------------- ENV / CONSTANTS --------------------
dotenv.config();

const PORT = process.env.PORT || 3000;
const TEMPLATE_ROOT = path.join(process.cwd(), "templates");
const MAIN_JS_FILENAME = process.env.MAIN_JS_FILENAME || "projectile.js";

// DEBUG FLAG
const DEBUG = process.env.DEBUG === "true";

// FASTAPI
const FASTAPI_HOST = "127.0.0.1";
const FASTAPI_PORT = 8000;
const FASTAPI_ENTRY_FILE = "main_projectile.py";
const FASTAPI_MODULE = "main_projectile:app";

// OPENAI
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------------------- EXPRESS --------------------
const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static("public"));
app.use("/data", express.static(path.join(process.cwd(), "data")));

const GENERATED_ROOT = path.join(process.cwd(), "generated");
fs.mkdirSync(GENERATED_ROOT, { recursive: true });
app.use("/sims", express.static(GENERATED_ROOT));

const upload = multer({ storage: multer.memoryStorage() });

// -------------------- HELPERS --------------------
const clamp = (value, def, lo, hi) => {
  const num =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  const use = Number.isFinite(num) ? num : def;
  return Math.max(lo, Math.min(hi, use));
};

const strip = (s) => (s || "").replace(/```json|```/gi, "").trim();

function loadTemplates() {
  if (!fs.existsSync(TEMPLATE_ROOT)) {
    throw new Error(`TEMPLATE_ROOT not found: ${TEMPLATE_ROOT}`);
  }

  const TEXT_EXTS = new Set([
    ".html",
    ".htm",
    ".css",
    ".js",
    ".mjs",
    ".cjs",
    ".json",
    ".txt",
    ".py",
    ".md",
  ]);

  const templates = {};
  const dirents = fs.readdirSync(TEMPLATE_ROOT, { withFileTypes: true });

  for (const d of dirents) {
    if (!d.isDirectory()) continue;

    const templateName = d.name;
    const templateDir = path.join(TEMPLATE_ROOT, templateName);

    const files = {};
    const entries = fs.readdirSync(templateDir, { withFileTypes: true });

    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const filename = ent.name;
      const ext = path.extname(filename).toLowerCase();
      if (!TEXT_EXTS.has(ext)) continue;
      files[filename] = fs.readFileSync(path.join(templateDir, filename), "utf8");
    }

    templates[templateName] = { name: templateName, dir: templateDir, files };
  }

  return templates;
}

// -------------------- TEMPLATE SETUP --------------------
const TEMPLATES = loadTemplates();
const TEMPLATE_NAME = "Projectile_motion"; // <-- your template folder
const TEMPLATE = TEMPLATES[TEMPLATE_NAME];
if (!TEMPLATE) throw new Error(`Template "${TEMPLATE_NAME}" not found`);

// -------------------- FASTAPI RUNNER --------------------
let fastapiProcess = null;
const FASTAPI_PATH = path.join(TEMPLATE.dir, FASTAPI_ENTRY_FILE);

if (fs.existsSync(FASTAPI_PATH)) {
  const py = process.platform === "win32" ? "py" : "python3";
  fastapiProcess = spawn(
    py,
    ["-m", "uvicorn", FASTAPI_MODULE, "--host", FASTAPI_HOST, "--port", FASTAPI_PORT],
    { cwd: TEMPLATE.dir, stdio: "inherit" }
  );
  console.log(`✅ FastAPI started from: ${TEMPLATE.dir}`);
} else {
  console.warn(`⚠️ FastAPI not started — missing: ${FASTAPI_PATH}`);
}

process.on("SIGINT", () => {
  fastapiProcess?.kill();
  process.exit();
});
process.on("SIGTERM", () => {
  fastapiProcess?.kill();
  process.exit();
});
process.on("exit", () => fastapiProcess?.kill());

// -------------------- TEXT INFERENCE HELPERS --------------------
function inferAirOverride(questionText) {
  const t = (questionText || "").toLowerCase();
  if (/(ignore|neglect|no)\s+(air resistance|drag)|vacuum/.test(t)) return false;
  if (/(with|including)\s+(air resistance|drag)|air drag/.test(t)) return true;
  return null;
}

function inferHeightFromText(questionText) {
  const t = String(questionText || "").toLowerCase();

  // "seen from the ground" is viewpoint, not launch location
  const viewpointFromGround =
    /\b(?:as\s+seen|seen)\s+from\s+(?:the\s+)?ground\b/.test(t);

  if (!viewpointFromGround && /\b(from|launched)\s+(?:the\s+)?ground\b/.test(t)) {
    return { heightExplicit: true, height_m: 0 };
  }

  const heightContext = /(height|high|tall|above|building|roof|cliff|platform)/;

  const m =
    t.match(
      /\bheight\s*(?:of|=)?\s*(\d+(?:\.\d+)?)\s*(m|meter|meters)\b(?!\s*(\/|per|\bsec\b|\bsecond\b))/
    ) ||
    t.match(
      /\b(\d+(?:\.\d+)?)\s*(m|meter|meters)\b(?!\s*(\/|per|\bsec\b|\bsecond\b))\s*(high|tall|above)\b/
    ) ||
    (heightContext.test(t)
      ? t.match(
        /\b(\d+(?:\.\d+)?)\s*(m|meter|meters)\b(?!\s*(\/|per|\bsec\b|\bsecond\b))/ // only if height context exists
      )
      : null);

  if (m) return { heightExplicit: true, height_m: Number(m[1]) };
  return { heightExplicit: false, height_m: 0 };
}

function inferDefaultHeightWhenNotExplicit(questionText) {
  const t = String(questionText || "").toLowerCase();
  // "seen from the ground" is viewpoint, not launch location
  const viewpointFromGround =
    /\b(?:as\s+seen|seen)\s+from\s+(?:the\s+)?ground\b/.test(t);

  const launchFromGround =
    !viewpointFromGround && /\bfrom\s+(?:the\s+)?ground\b/.test(t);
  if (/\bgolf\s+ball\b/.test(t) && /\bfairway\b/.test(t)) {
    return 0;
  }
  if (
    /(returns?\s+to\s+the\s+ground|hits?\s+the\s+ground|lands?\s+on\s+the\s+ground)/.test(t) ||
    launchFromGround
  ) {
    return 0;
  }
  return 100; // visualization default
}

// -------------------- SIM CONFIG FROM IMAGE --------------------
const MASS_DEFAULTS_KG = {
  stone: 0.5,
  rock: 0.5,
  ball: 0.45,
  bowling_ball: 6.8,
  cannonball: 7.0,
  human: 70,
  unknown: 10,
};

async function inferSimulationConfigFromImage(imageBuffer, mimeType) {
  const system = `
You are NOT solving a physics question.

You are configuring a physics simulation by setting initial conditions
and choosing which forces act AFTER the object is released.

GENERAL RULES:
- Never select/mention answer choices (A, B, C, D, etc.).
- Never explain which option is correct.
- Never imitate/match a diagram exactly.
- Never invent forces.
- If screenshot is NOT a projectile/freefall-in-flight situation, mark as not supported.

SUPPORTED SCOPE:
- Only projectile motion / freefall while the object is in flight.
- If mainly contact forces / constraints (ramp, pulley, tension, normal, friction while sliding, etc.),
  set "isProjectileLike" = false and explain briefly in "nonProjectileReason".

TEXT EXTRACTION:
- Extract question text into "questionText" as best you can.

AIR RESISTANCE OVERRIDES:
- If text includes ignore/neglect/no air resistance/drag or vacuum -> airResistance=false
- If text includes with/including air resistance/drag -> airResistance=true
- Otherwise airResistance=false

INFERENCE RULES (TEXT FIRST):
- “Dropped”, “released from rest”, “from rest” -> initialVelocity_mps=0 and velocityExplicit=true
- “Thrown straight up” -> launchAngle_deg=90 and angleExplicit=true
- “Fired/launched horizontally”, “rolls off” -> launchAngle_deg=0 and angleExplicit=true
- If variables exist WITHOUT numeric values -> treat as NOT GIVEN (use defaults)
- NEVER output initialVelocity_mps=0 unless text explicitly says from rest/dropped.
- NEVER output launchAngle_deg=0 unless text explicitly says horizontal/rolls off.

HEIGHT RULES (TEXT ONLY):
- If says from the ground -> initialHeight_m=0 and heightExplicit=true
- If explicit numeric height exists -> use it and heightExplicit=true
- Otherwise initialHeight_m=0 and heightExplicit=false (visual default only)

UI MODE:
Choose EXACTLY ONE uiMode: "force" | "velocity" | "motion"
TIE-BREAKERS:
1) If any force terms -> "force"
2) Else if any velocity/acceleration-at-a-point terms -> "velocity"
3) Else if trajectory/range/time/max-height terms -> "motion"
4) Else -> "force"

MASS:
- If mass not explicitly shown -> mass_kg=null and massExplicit=false.
- objectType only if exact phrase appears: stone, rock, ball, bowling ball, cannonball, human.

DEFAULTS:
- initialVelocity_mps=50
- launchAngle_deg=45
- initialHeight_m=0 (visual default only)
- mass_kg=null

OUTPUT:
Return ONLY valid JSON:
{
  "initialVelocity_mps": number,
  "velocityExplicit": boolean,
  "launchAngle_deg": number,
  "angleExplicit": boolean,
  "initialHeight_m": number,
  "heightExplicit": boolean,
  "mass_kg": number | null,
  "massExplicit": boolean,
  "objectType": "stone" | "rock" | "ball" | "bowling_ball" | "cannonball" | "human" | "unknown",
  "forceModel": { "airResistance": boolean },
  "uiMode": "force" | "velocity" | "motion",
  "questionText": string,
  "isProjectileLike": boolean,
  "nonProjectileReason": string,
  "visualHints": {
    "launchDirection": "horizontal" | "upward" | "downward" | "unknown",
    "elevatedLaunch": boolean,
    "approxLaunchAngle_deg": number | null
  }
}
`.trim();

  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const resp = await client.responses.create({
    model: "gpt-4o-mini",
    temperature: 0,
    input: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Infer the simulation config from this screenshot." },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
  });

  let raw = strip(resp.output_text);
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) raw = match[0];

  if (DEBUG) {
    console.log("----- RAW VISION JSON -----");
    console.log(raw);
  }

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    throw new Error("Vision model returned invalid JSON");
  }

  // Not supported gate
  const isProjectileLike = cfg.isProjectileLike !== false;
  const nonProjectileReason = String(cfg.nonProjectileReason || "").trim();
  if (!isProjectileLike) {
    throw new Error(
      nonProjectileReason
        ? `Not a projectile/freefall-in-flight problem: ${nonProjectileReason}`
        : "Not a projectile/freefall-in-flight problem."
    );
  }

  // Normalize object type
  let objectType =
    typeof cfg.objectType === "string" ? cfg.objectType.toLowerCase() : "unknown";
  if (objectType === "bowling ball") objectType = "bowling_ball";
  if (objectType === "cannon ball") objectType = "cannonball";
  if (!Object.prototype.hasOwnProperty.call(MASS_DEFAULTS_KG, objectType)) {
    objectType = "unknown";
  }

  // UI mode normalization
  const uiMode =
    typeof cfg.uiMode === "string" && ["force", "velocity", "motion"].includes(cfg.uiMode)
      ? cfg.uiMode
      : "force";

  const questionText = String(cfg.questionText || "").trim();

  // Height inference (text-only)
  const inferredHeight = inferHeightFromText(questionText);
  const heightExplicit = inferredHeight.heightExplicit;

  let initialHeight_m = heightExplicit
    ? clamp(inferredHeight.height_m, 0, 0, 100)
    : 0;

  if (!heightExplicit) {
    initialHeight_m = inferDefaultHeightWhenNotExplicit(questionText);
  }

  // Air resistance override (text-only)
  const airFlag = cfg.forceModel?.airResistance;
  let airResistance = typeof airFlag === "boolean" ? airFlag : false;
  const airOverride = inferAirOverride(questionText);
  if (airOverride !== null) airResistance = airOverride;

  // Velocity / angle
  const velocityExplicit = cfg.velocityExplicit === true;
  const angleExplicit = cfg.angleExplicit === true;

  let initialVelocity_mps =
    velocityExplicit && Number.isFinite(Number(cfg.initialVelocity_mps))
      ? clamp(cfg.initialVelocity_mps, 50, 0, 100)
      : 50;

  let launchAngle_deg =
    angleExplicit && Number.isFinite(Number(cfg.launchAngle_deg))
      ? clamp(cfg.launchAngle_deg, 45, 0, 90)
      : 45;

  // Diagram-based angle fallback buckets (only if not explicit and not downward)
  const launchDir = String(cfg?.visualHints?.launchDirection || "unknown").toLowerCase();
  const isDownward = launchDir === "downward";

  const approxAngle = Number(cfg?.visualHints?.approxLaunchAngle_deg);
  const approxAngleOk =
    Number.isFinite(approxAngle) && [0, 15, 30, 45, 60, 75, 90].includes(approxAngle);

  if (!angleExplicit && !isDownward && approxAngleOk) {
    launchAngle_deg = clamp(approxAngle, 45, 0, 90);
  }

  // Horizontal overrides (text or diagram)
  const qt = questionText.toLowerCase();
  const textSaysHorizontal = /(fired|launched)\s+horizontally|rolls?\s+off/.test(qt);
  const elevatedLaunch = cfg?.visualHints?.elevatedLaunch === true;

  // Only trust diagram "horizontal" when the launch is clearly elevated (e.g., aircraft drop / off a ledge).
  const isHorizontal = textSaysHorizontal || (launchDir === "horizontal" && elevatedLaunch);

  if (isHorizontal) {
    if (!angleExplicit) launchAngle_deg = 0;
    if (!velocityExplicit) initialVelocity_mps = 100;
  }

  // If text doesn't indicate horizontal and launch isn't elevated, don't let a diagram guess force 0°.
  if (!textSaysHorizontal && !elevatedLaunch && launchAngle_deg === 0) {
    launchAngle_deg = 45;
  }

  // Mass
  const massExplicit = cfg.massExplicit === true;
  const mass_kg =
    massExplicit && Number.isFinite(Number(cfg.mass_kg))
      ? clamp(cfg.mass_kg, 10, 0.1, 100)
      : null;

  const massSim_kg = mass_kg ?? MASS_DEFAULTS_KG[objectType] ?? 10;

  return {
    uiMode,
    objectType,
    initialVelocity_mps,
    launchAngle_deg,
    initialHeight_m,
    mass_kg,
    massSim_kg,
    forceModel: { gravity: true, airResistance },
    ui: {
      forceKey: uiMode === "force",
      velocityKey: uiMode === "velocity",
      motionTracking: uiMode === "motion",
    },
    questionText,
    heightExplicit,
  };
}

// -------------------- JS DEFAULT INJECTION --------------------
async function injectDefaults(simCfg) {
  const js = TEMPLATE.files[MAIN_JS_FILENAME];
  if (!js) throw new Error(`Missing ${MAIN_JS_FILENAME} in template files.`);

  const dropH = simCfg.initialHeight_m ?? 0;
  const mass = simCfg.massSim_kg ?? 10;

  const replaced = js
    .replace(/let dropHeight_m\s*=\s*[^;]+;/, `let dropHeight_m = ${dropH};`)
    .replace(/let launchSpeed_mps\s*=\s*[^;]+;/, `let launchSpeed_mps = ${simCfg.initialVelocity_mps};`)
    .replace(/let launchAngle_deg\s*=\s*[^;]+;/, `let launchAngle_deg = ${simCfg.launchAngle_deg};`)
    .replace(/let ballMass\s*=\s*[^;]+;/, `let ballMass = ${mass};`)
    .replace(/let airEnabled\s*=\s*[^;]+;/, `let airEnabled = ${simCfg.forceModel.airResistance};`)
    .replace(/let forceEnabled\s*=\s*[^;]+;/, `let forceEnabled = ${simCfg.ui.forceKey};`)
    .replace(/let velocityEnabled\s*=\s*[^;]+;/, `let velocityEnabled = ${simCfg.ui.velocityKey};`)
    .replace(/let motionEnabled\s*=\s*[^;]+;/, `let motionEnabled = ${simCfg.ui.motionTracking};`);

  if (DEBUG) {
    console.log("INJECT:", {
      dropH,
      v: simCfg.initialVelocity_mps,
      ang: simCfg.launchAngle_deg,
      air: simCfg.forceModel.airResistance,
      uiMode: simCfg.uiMode,
    });
  }

  return {
    ...TEMPLATE.files,
    [MAIN_JS_FILENAME]: replaced,
  };
}

// -------------------- ROUTES --------------------
app.post("/generate", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image" });
  if (!req.file.mimetype?.startsWith("image/")) {
    return res.status(400).json({ error: "Not an image" });
  }

  try {
    const simCfg = await inferSimulationConfigFromImage(req.file.buffer, req.file.mimetype);

    if (DEBUG) {
      console.log("----- SIM CONFIG -----");
      console.dir(simCfg, { depth: null });
    }

    const files = await injectDefaults(simCfg);

    // Create unique sim folder
    const id = crypto.randomBytes(8).toString("hex");
    const simFolderName = `sim_${id}`;
    const simDir = path.join(GENERATED_ROOT, simFolderName);
    fs.mkdirSync(simDir, { recursive: true });

    // HTML normalization
    let html = files["index_projectile.html"] || files["index.html"] || "";
    if (!html.trim()) throw new Error("Template HTML not found (index_projectile.html or index.html).");

    // Force CSS filename
    if (/styles_projectile\.css/i.test(html)) {
      html = html.replace(/styles_projectile\.css/gi, "styles_projectiles.css");
    }
    if (!/styles_projectiles\.css/i.test(html)) {
      html = html.replace(
        "</head>",
        `  <link rel="stylesheet" href="./styles_projectiles.css" />\n</head>`
      );
    }

    // Force projectile script
    if (/src=["'][^"']*projectile\.js["']/i.test(html)) {
      html = html.replace(/src=["'][^"']*projectile\.js["']/gi, `src="./projectile.js"`);
    } else if (!/projectile\.js/i.test(html)) {
      html = html.replace("</body>", `  <script src="./projectile.js"></script>\n</body>`);
    }

    // Write files
    fs.writeFileSync(path.join(simDir, "index.html"), html, "utf8");
    fs.writeFileSync(path.join(simDir, "projectile.js"), files[MAIN_JS_FILENAME] || "", "utf8");

    const templateCss =
      files["styles_projectiles.css"] ||
      files["styles_projectile.css"] ||
      files["styles.css"] ||
      "";

    fs.writeFileSync(path.join(simDir, "styles_projectiles.css"), templateCss, "utf8");

    return res.json({
      runId: id,
      simUrl: `/sims/${simFolderName}/index.html`,
      simulationConfig: simCfg,
      airEnabled: simCfg.forceModel.airResistance,
      airResistance: simCfg.forceModel.airResistance ? "considered" : "ignored",
      uiMode: simCfg.uiMode,
      questionText: simCfg.questionText, // optional; remove if you don't want to expose it
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
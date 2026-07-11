
window.addEventListener("DOMContentLoaded", () => {
  const { Engine, Render, Runner, World, Bodies, Body, Events } = Matter;
  console.log("LOADED projectile.js version 2025-12-30");

  // -------------------- CONSTANTS --------------------
  const canvasWidth = 800, canvasHeight = 700;
  const g = 9.81;
  const groundHeight_px = 40, ballRadius = 10;
  const maxRange_m = 1200, maxHeight_m = 650;
  const FETCH_INTERVAL = 200;
  const charts = {};
  const TRAIL_MAX_POINTS = 600;
  const TRAIL_MIN_DIST_PX = 3;
  const trailPts = [];
  const GROUND_CENTER_Y = canvasHeight - 100 - groundHeight_px / 2;
  const GROUND_TOP_Y = canvasHeight - 100 - groundHeight_px - ballRadius;
  const CHART_UPDATE_EVERY = 2; // 1 = every fetch, 2 = every other fetch
  const PERF = {
    dotOnlyWhilePlaying: true,
    dotHz: 12,          // dot updates per second
    maxLinePoints: 900, // cap line samples
  };
  const LINE_KEYS = ["x_t", "y_t", "vx_t", "vy_t", "Fg_t", "Fn_t", "ax_t", "ay_t"];
  // All lets
  let trailFrame = 0;
  let visibleKeys = new Set();
  let dropHeight_m = 100;
  let launchSpeed_mps = 100;
  let launchAngle_deg = 0;
  let ballMass = 7;
  let t_s = 0;
  let vx_mps = 0;
  let vy_mps = 0;
  let x_m = 0;
  let y_m = 0;
  let pxPerMeterX = 1;
  let pxPerMeterY = 1;
  let hasLanded = false;
  let ballOnGround = false;
  let isPaused = false;
  let needsChartRedraw = false;


  let trajCache = null; // { meta, series, rest }
  let currentSt = null; // cache latest physics state
  let forceEnabled = false;
  let velocityEnabled = false;
  let motionEnabled = true;
  let accelerationEnabled = false;
  let airEnabled = false;
  let tApex_s = null;
  let tLand_s = null;
  let motionInProgress = false;
  let playbackSpeed = 1.0;
  let scrubber = null;
  let scrubInFlight = false;
  let scrubWasPaused = false;   // was the sim paused when scrub started?
  let scrubWasPlaying = false;  // was it actively playing when scrub started?
  let scrubDebounce = null;
  let freezeMode = null;
  let freezeBusy = false;
  let fetchTimer = null;
  let chartTick = 0;
  let V_RUN_MAX_MS = 1;
  let lastDotUpdate = 0;

  // -------------------- APPLY SERVER INJECTION --------------------
  // server.js injects: <script>window.__SIM_CFG__ = {...}</script> into <head>
  // We must read it BEFORE creating bodies (mass/initial state depend on it).
  (function applyInjectedSimCfg() {
    const cfg = window.__SIM_CFG__;
    if (!cfg || typeof cfg !== "object") return;

    const num = (v, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    dropHeight_m = num(cfg.dropHeight_m, dropHeight_m);
    launchSpeed_mps = num(cfg.launchSpeed_mps, launchSpeed_mps);
    launchAngle_deg = num(cfg.launchAngle_deg, launchAngle_deg);
    ballMass = num(cfg.ballMass, ballMass);

    airEnabled = !!cfg.airEnabled;
    forceEnabled = !!cfg.forceEnabled;
    velocityEnabled = !!cfg.velocityEnabled;
    motionEnabled = !!cfg.motionEnabled;
    accelerationEnabled = !!cfg.accelerationEnabled;

    // enforce exclusivity (exactly one mode true)
    const on = [forceEnabled, velocityEnabled, motionEnabled, accelerationEnabled].filter(Boolean).length;
    if (on !== 1) {
      // fallback: prefer force if ambiguous
      forceEnabled = true;
      velocityEnabled = false;
      motionEnabled = false;
      accelerationEnabled = false;
    }

    console.log("[SIM_CFG] applied injection:", cfg);
  })();

  // -------------------- ENGINE/WORLD --------------------
  const engine = Engine.create();
  engine.gravity.y = 0;
  const ball = Bodies.circle(100, 100, ballRadius, {
    restitution: 0.2,
    frictionAir: 0,
    render: { fillStyle: "#2563eb", strokeStyle: "#1e40af", lineWidth: 2 }
  });
  Body.setMass(ball, ballMass);

  const ground = Bodies.rectangle(
    canvasWidth / 2,
    GROUND_CENTER_Y,
    canvasWidth,
    groundHeight_px,
    { isStatic: true, render: { fillStyle: "#cbd5e1", strokeStyle: "#94a3b8" } }
  );
  World.add(engine.world, [ball, ground]);

  // -------------------- HELPERS --------------------
  const $ = (id) => document.getElementById(id);
  function computeScaling() {
    // Horizontal mapping:
    // x_px = 100 + x_m * pxPerMeterX
    // Keep the projectile inside canvas with some padding.
    const leftPad = 100;     // your origin x
    const rightPad = 60;     // room for labels/dots at end
    const usableW = Math.max(1, canvasWidth - leftPad - rightPad);

    // Vertical mapping:
    // y_px = GROUND_TOP_Y - y_m * pxPerMeterY
    // We want y=0 at ground, and max height to fit up to near top.
    const topPad = 40;       // space at top
    const usableH = Math.max(1, GROUND_TOP_Y - topPad);

    // Choose scales based on configured maxima.
    // (These are your “world bounds” knobs.)
    pxPerMeterX = usableW / Math.max(1e-9, maxRange_m);
    pxPerMeterY = usableH / Math.max(1e-9, maxHeight_m);

    // Clamp to sane values so huge maxRange/maxHeight doesn’t make everything microscopic.
    pxPerMeterX = Math.max(0.05, Math.min(10, pxPerMeterX));
    pxPerMeterY = Math.max(0.05, Math.min(10, pxPerMeterY));
  }

  function isAtRightEdgeValue(v) {
    if (!Number.isFinite(v)) return false;
    return v >= (scrubMax() - edgeTol());
  }
  function endDotActive() {
    if (tLand_s != null && Number.isFinite(tLand_s) && t_s >= (tLand_s - edgeTol())) return true;
    return (freezeMode === "end") || atRightEdgeNow();
  }




  function setMovingDotAtState(st) {
    if (!st) return;

    // allow per-chart custom X for the dot
    const setDotNoUpdate = (chart, xVal, yVal) => {
      const dot = chart.data.datasets[1];
      dot.hidden = false;
      dot.data.length = 0;
      dot.data.push({ x: xVal, y: yVal });
    };

    const tRaw = Number(st.time_s);
    const atEnd = endDotActive() && (tLand_s != null && Number.isFinite(tLand_s));
    const tDotDefault = atEnd ? tLand_s : tRaw;
    const tDot = chartTime(tDotDefault);


    // Start-ground special case (same as your line/history rule)
    const startGroundKick =
      dropHeight_m === 0 && Math.abs(tRaw) <= edgeTol();

    // ------- normal dots (pre-impact) -------
    if (visibleKeys.has("x_t")) setDotNoUpdate(charts.x_t, tDot, st.x);
    if (visibleKeys.has("y_t")) setDotNoUpdate(charts.y_t, tDot, st.y);
    if (visibleKeys.has("vx_t")) setDotNoUpdate(charts.vx_t, tDot, st.vx);
    if (visibleKeys.has("vy_t")) setDotNoUpdate(charts.vy_t, tDot, st.vy);
    if (visibleKeys.has("ax_t")) setDotNoUpdate(charts.ax_t, tDot, st.ax);
    if (visibleKeys.has("ay_t")) setDotNoUpdate(charts.ay_t, tDot, st.ay);

    // Fg dot can stay pre-impact (optional; leaving it consistent with others)
    if (visibleKeys.has("Fg_t")) setDotNoUpdate(charts.Fg_t, tDot, st.Fg);

    // ------- Fn dot: snap to true landing point when at end -------
    if (visibleKeys.has("Fn_t")) {
      if (atEnd) {
        // At end, your line jumps to Fn = Fg at tLand_s — make the dot match that.
        const FgAtEnd = (trajCache?.rest?.Fg ?? st.Fg);
        setDotNoUpdate(charts.Fn_t, chartTime(tLand_s), FgAtEnd);
      } else {
        // Otherwise use your usual Fn plotting rule
        const FnPlot =
          startGroundKick ? st.Fg :
            isAtLandingTime(tRaw) ? st.Fg :
              st.Fn;

        setDotNoUpdate(charts.Fn_t, tDot, FnPlot);
      }
    }

    // update only visible ones
    for (const k of LINE_KEYS) {
      if (visibleKeys.has(k)) charts[k]?.update("none");
    }
  }



  function isPlaying() {
    return motionInProgress && !hasLanded && !isPaused && !scrubInFlight && engine.timing.timeScale > 0;
  }
  function setScrubberEnabled(enabled) {
    if (!scrubber) return;
    scrubber.disabled = !enabled;
    // (optional UX)
    scrubber.style.pointerEvents = enabled ? "auto" : "none";
    scrubber.style.opacity = enabled ? "1" : "0.55";
  }


  function scrubStep() {
    if (!scrubber) return 0.01;
    const s = parseFloat(scrubber.step);
    return Number.isFinite(s) && s > 0 ? s : 0.01;
  }

  function edgeTol() {
    // half a step, but never microscopic
    return Math.max(1e-6, scrubStep() * 0.5);
  }
  function preImpactEps() {
    // Must be slightly bigger than the snap tolerance (edgeTol/endSnap),
    // otherwise clamp01Time will snap us to tLand_s and you’re back to vx/vy=0.
    return edgeTol() * 1.05;
  }

  function preLandingTime() {
    if (tLand_s == null || !Number.isFinite(tLand_s)) return scrubMax();
    return Math.max(0, tLand_s - preImpactEps());
  }



  function scrubMin() {
    if (!scrubber) return 0;
    const v = parseFloat(scrubber.min);
    return Number.isFinite(v) ? v : 0;
  }

  function scrubMax() {
    if (!scrubber) return (tLand_s ?? 10);
    const v = parseFloat(scrubber.max);
    return Number.isFinite(v) ? v : (tLand_s ?? 10);
  }

  // ✅ edge detection is based on the slider itself (robust)



  function clamp01Time(t) {
    if (!Number.isFinite(t)) return 0;

    t = Math.max(0, t);

    if (tLand_s != null) {
      // clamp to end
      t = Math.min(t, tLand_s);

      // snap to landing if we're within half a scrubber step
      const step = scrubber ? parseFloat(scrubber.step || "0.01") : 0.01;
      const endSnap = Math.max(1e-6, step * 0.5);

      if (Math.abs(tLand_s - t) < endSnap) t = tLand_s;
    }

    if (Math.abs(t) < 1e-6) t = 0;
    return t;
  }
  function isAtLandingTime(t) {
    if (tLand_s == null || !Number.isFinite(tLand_s)) return false;

    const step = scrubber ? parseFloat(scrubber.step || "0.01") : 0.01;
    const tol = Math.max(1e-6, step * 0.5); // same idea as your snap

    return t >= (tLand_s - tol);
  }

  const SCRUB_STEP = 0.01;

  function syncScrubberBounds() {
    if (!scrubber) return;

    const land = (tLand_s != null && Number.isFinite(tLand_s)) ? tLand_s : 10;

    // slider max must be reachable with step increments
    const maxSlider = Math.ceil(land / SCRUB_STEP) * SCRUB_STEP;


    scrubber.min = "0";
    scrubber.step = SCRUB_STEP.toFixed(2);
    scrubber.max = maxSlider.toFixed(2);
  }







  function setScrubberValue(t) {
    if (!scrubber) return;
    const land = scrubMax();
    if (tLand_s != null && Number.isFinite(tLand_s) && t >= (tLand_s - preImpactEps())) {
      scrubber.value = String(land);
      return;
    }
    scrubber.value = String(Math.max(0, Math.min(land, t)));

  }



  // ✅ this is the key: treat right-edge as an "impact/end frame" visually
  function shouldShowGroundNow() {
    // Start resting on ground only at the very beginning (height=0)
    if (dropHeight_m === 0 && t_s <= edgeTol()) return true;

    // If we're basically at landing time, show Fn
    if (tLand_s != null && Number.isFinite(tLand_s) && t_s >= (tLand_s - edgeTol())) return true;

    // End frame button or right-edge scrub should show Fn
    if (freezeMode === "end") return true;
    if (atRightEdgeNow()) return true;

    // After actual landing
    if (hasLanded) return true;

    // Otherwise: no Fn during flight
    return false;
  }







  const arrowParams = { headLength: 15, headWidth: 7, tipExtension: 5 };
  // ---- Velocity vector sizing (hard cap = 40px total, incl arrowhead) ----




  //// Map chart keys -> canvas element ids
  const GRAPH_CANVAS = {
    x_t: "graph-x-t",
    y_t: "graph-y-t",
    vx_t: "graph-vx-t",
    vy_t: "graph-vy-t",
    Fg_t: "graph-Fg-t",
    Fn_t: "graph-Fn-t",
    Fg_m: "graph-Fg-m",
    ax_t: "graph-ax-t",
    ay_t: "graph-ay-t",
  };

  function setGraphVisible(chartKey, visible) {
    const canvas = $(GRAPH_CANVAS[chartKey]);
    if (!canvas) return;

    // Pick a wrapper to hide/show (adjust selector if your wrapper class differs)
    const wrap = canvas.closest(".graph-card") || canvas.parentElement;
    if (!wrap) return;

    wrap.style.display = visible ? "" : "none";

    // Chart.js needs a resize when re-shown
    if (visible && charts[chartKey]) {
      charts[chartKey].resize();
      charts[chartKey].update("none");
    }
  }

  function updateGraphVisibility() {
    const show = new Set();

    if (forceEnabled) { show.add("Fg_t"); show.add("Fn_t"); show.add("Fg_m"); }
    if (velocityEnabled) { show.add("vx_t"); show.add("vy_t"); }
    if (motionEnabled) {
      show.add("x_t"); show.add("y_t");
      show.add("vx_t"); show.add("vy_t");
      show.add("ax_t"); show.add("ay_t");
    }
    if (accelerationEnabled) { show.add("ax_t"); show.add("ay_t"); }

    visibleKeys = show; // ✅ THIS WAS MISSING

    Object.keys(GRAPH_CANVAS).forEach((k) => setGraphVisible(k, show.has(k)));
  }






  function buildFgVsMassChart() {
    const c = charts.Fg_m;
    if (!c) return;

    c.data.datasets.forEach(ds => (ds.data.length = 0));

    for (let m = 0; m <= 100; m += 1) {
      c.data.datasets[0].data.push({ x: m, y: g * m });
    }

    c.update("none");
  }



  function updateKeyVisibility() {
    const keyForces = $("keyForces");
    const keyVelocity = $("keyVelocity");
    const keyMotion = $("keyMotion");
    const keyAcceleration = $("keyAcceleration");
    const keyRowFd = $("keyRowFd"); // <-- air resistance row 
    if (!keyForces || !keyVelocity || !keyMotion || !keyAcceleration) return;
    // Section visibility
    keyForces.style.display = forceEnabled ? "block" : "none";
    keyVelocity.style.display = velocityEnabled ? "block" : "none";
    keyMotion.style.display = motionEnabled ? "block" : "none";
    keyAcceleration.style.display = accelerationEnabled ? "block" : "none";
    // Air resistance is a SUB-ITEM of Forces
    if (keyRowFd) {
      keyRowFd.style.display =
        forceEnabled && airEnabled ? "table-row" : "none";
    }
    // Hide air checkbox unless we're in FORCE mode
    const airWrap =
      $("airCheckbox")?.closest("label") ||
      $("airCheckbox")?.parentElement ||
      $("airCheckbox");
    if (airWrap) {
      airWrap.style.display = (forceEnabled ? "inline-flex" : "none");
    }
  }
  function updateUIInteractivity() {
    const moving = isPlaying(); // ✅ only "moving" when actually playing
    setControlsLocked(moving);

    // pause ALWAYS enabled (but we'll override after end below)
    if ($("pauseBtn")) $("pauseBtn").disabled = false;

    // Freeze buttons allowed when NOT playing
    setFreezeButtonsEnabled(!moving && !freezeBusy);

    const ready = !!trajCache?.series?.length;
    setScrubberEnabled(ready && !freezeBusy);
  }



  function drawArrow(ctx, x1, y1, x2, y2, color, label, dashed = false, labelOffset = { x: 0, y: 0 }) {
    label = null;
    const { headLength, headWidth, tipExtension } = arrowParams;
    const dx = x2 - x1, dy = y2 - y1;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    // head
    const tipX = x2 + tipExtension * Math.cos(ang);
    const tipY = y2 + tipExtension * Math.sin(ang);
    const perpX = headWidth * Math.sin(ang);
    const perpY = -headWidth * Math.cos(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLength * Math.cos(ang) + perpX, tipY - headLength * Math.sin(ang) + perpY);
    ctx.lineTo(tipX - headLength * Math.cos(ang) - perpX, tipY - headLength * Math.sin(ang) - perpY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const worldToCanvasY = (y) => GROUND_TOP_Y - y * pxPerMeterY;

  function resetTrail() {
    trailPts.length = 0;
    // seed with current position so line starts immediately
    trailPts.push({ x: ball.position.x, y: ball.position.y });
  }

  function rebuildTrailToTime(tTarget) {
    trailPts.length = 0;
    if (!trajCache?.series) return;

    let last = null;
    for (const p of trajCache.series) {
      if (p.time_s > tTarget) break;
      const x = 100 + p.x * pxPerMeterX;
      const y = worldToCanvasY(p.y);

      if (!last || Math.hypot(x - last.x, y - last.y) >= TRAIL_MIN_DIST_PX) {
        trailPts.push({ x, y });
        last = trailPts[trailPts.length - 1];
        if (trailPts.length > TRAIL_MAX_POINTS) trailPts.shift();
      }
    }
  }
  function setTrailToTime(t) {


    if (!trajCache?.series?.length) {
      resetTrail();
      return;
    }

    // start
    if (t <= 0) {
      resetTrail();              // clears + seeds at current ball.position
      return;
    }

    // any other time
    rebuildTrailToTime(t);
  }



  function sampleTrailPoint() {
    const p = { x: ball.position.x, y: ball.position.y };
    const last = trailPts[trailPts.length - 1];
    if (last) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (Math.hypot(dx, dy) < TRAIL_MIN_DIST_PX) return;
    }
    trailPts.push(p);
    if (trailPts.length > TRAIL_MAX_POINTS) trailPts.shift();
  }

  function drawTrail(ctx) {
    if (trailPts.length < 2) return;
    ctx.save();
    ctx.setLineDash([6, 6]);          // dotted
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";  // subtle
    ctx.beginPath();
    ctx.moveTo(trailPts[0].x, trailPts[0].y);
    for (let i = 1; i < trailPts.length; i++) ctx.lineTo(trailPts[i].x, trailPts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function setControlsLocked(locked) {
    ["heightInput", "velocityInput", "angleInput", "massInput", "restartBtn", "frameStartBtn", "frameApexBtn", "frameEndBtn", "airCheckbox"]
      .forEach(id => { const el = $(id); if (el) el.disabled = locked; });
  }

  function setFreezeButtonsEnabled(enabled) {
    // start/end exist always; apex depends on whether there is an apex
    enabled = enabled && !freezeBusy;
    if ($("frameStartBtn")) $("frameStartBtn").disabled = !enabled;
    if ($("frameEndBtn")) $("frameEndBtn").disabled = !enabled;
    if ($("frameApexBtn")) $("frameApexBtn").disabled = !enabled || (tApex_s == null);
  }

  function setMotionLock(on) {
    motionInProgress = on;
    // lock EVERYTHING except pause
    setControlsLocked(on);
    if ($("pauseBtn")) $("pauseBtn").disabled = false; // always allowed
    // freeze buttons should NEVER work during motion
    setFreezeButtonsEnabled(!on);
  }


  async function runFreezeAction(fn) {
    if (freezeBusy) return;
    freezeBusy = true;

    // cancel any pending scrub rebuilds / previews
    if (scrubDebounce) {
      clearTimeout(scrubDebounce);
      scrubDebounce = null;
    }
    previewToken++;   // cancel previewDotsAtTime in-flight
    rebuildToken++;   // cancel rebuildChartsToTime in-flight

    try {
      await fn();
    } catch (e) {
      console.warn("freeze action failed:", e);
    } finally {
      freezeBusy = false;
      updateUIInteractivity();
    }
  }

  // ✅ STEP 2: reset clears BOTH datasets
  function resetAllCharts() {
    for (const k in charts) {
      if (k === "Fg_m") continue;
      const c = charts[k];
      if (!c) continue;
      c.data.datasets.forEach(ds => (ds.data.length = 0));
      c.update("none");
    }
    buildFgVsMassChart();
    chartTick = 0;

  }
  function resetAllChartsFast() {
    for (const k in charts) {
      if (k === "Fg_m") continue;
      const c = charts[k];
      if (!c) continue;
      c.data.datasets.forEach(ds => (ds.data.length = 0));
    }
    buildFgVsMassChart(); // this one can update once
    chartTick = 0;
  }


  let finalFetchDone = false;

  async function finalFetchOnce() {
    if (finalFetchDone) return;
    finalFetchDone = true;

    try {
      const tf = (tLand_s != null && Number.isFinite(tLand_s))
        ? preLandingTime()
        : t_s;

      const dFinal = pointAtTime(tf);
      if (!dFinal) return;

      // Optional: show “impact moment” at tLand while keeping pre-impact velocities
      if (tLand_s != null && Number.isFinite(tLand_s)) dFinal.time_s = tLand_s;

      updateCharts(dFinal, true);
    } catch (e) {
      console.warn("final fetch failed", e);
    }
  }


  function pointAtTime(tTarget) {
    const s = trajCache?.series;
    const rest = trajCache?.rest;
    if (!s || s.length === 0) return null;

    if (tTarget >= (tLand_s ?? Infinity)) return rest;

    for (const p of s) {
      if (p.time_s >= tTarget) return p;
    }

    // ✅ if we’re beyond last pre-impact sample, return the last flight point
    return s[s.length - 1];
  }
  function stateAtTime(tTarget) {
    const s = trajCache?.series;
    const rest = trajCache?.rest;
    if (!s || s.length === 0) return null;

    // After landing -> rest
    if (tLand_s != null && Number.isFinite(tLand_s) && tTarget >= tLand_s) return rest;

    // Before first sample
    if (tTarget <= s[0].time_s) return s[0];

    // Binary search for bracketing points
    let lo = 0, hi = s.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid].time_s < tTarget) lo = mid;
      else hi = mid;
    }

    const p0 = s[lo], p1 = s[hi];
    const t0 = p0.time_s, t1 = p1.time_s;
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 === t0) return p1;

    const a = (tTarget - t0) / (t1 - t0);
    const lerp = (u, v) => u + (v - u) * a;

    return {
      ...p0,
      time_s: tTarget,
      x: lerp(p0.x, p1.x),
      y: lerp(p0.y, p1.y),
      vx: lerp(p0.vx, p1.vx),
      vy: lerp(p0.vy, p1.vy),
      ax: lerp(p0.ax, p1.ax),
      ay: lerp(p0.ay, p1.ay),
      // Fg is constant anyway, but safe:
      Fg: lerp(p0.Fg, p1.Fg),
      Fn: lerp(p0.Fn, p1.Fn),
      v: lerp(p0.v, p1.v),
      onGround: (tLand_s != null && Number.isFinite(tLand_s))
        ? (tTarget >= (tLand_s - edgeTol()))
        : (lerp(p0.y, p1.y) <= 0),
    };
  }

  // ✅ This is REQUIRED (your code calls it many times)
  function setStateAtTime(tTarget, snapToLand = true) {
    const t = snapToLand ? clamp01Time(tTarget) : Math.max(0, Number(tTarget) || 0);
    t_s = t;

    const st = stateAtTime(t) || pointAtTime(t);
    if (!st) return;
    currentSt = st;
    x_m = st.x;
    y_m = st.y;

    Body.setPosition(ball, {
      x: 100 + x_m * pxPerMeterX,
      y: worldToCanvasY(y_m),
    });

    // We drive motion from backend; keep Matter from "doing its own thing"
    Body.setVelocity(ball, { x: 0, y: 0 });
    Body.setAngularVelocity(ball, 0);

    const landed = (tLand_s != null && Number.isFinite(tLand_s) && t >= (tLand_s - edgeTol()));
    const startOnGround = (dropHeight_m === 0 && t <= edgeTol());
    ballOnGround = landed || startOnGround || !!st.onGround;

    hasLanded = landed;

    if (scrubber && !scrubInFlight) setScrubberValue(t);
  }


  async function fetchAtTime(t) {
    const res = await fetch(
      `http://127.0.0.1:8000/projectile` +
      `?t=${encodeURIComponent(t)}` +
      `&mass=${encodeURIComponent(ballMass)}` +
      `&height=${encodeURIComponent(dropHeight_m)}` +
      `&speed=${encodeURIComponent(launchSpeed_mps)}` +
      `&angle=${encodeURIComponent(launchAngle_deg)}` +
      `&eps=${encodeURIComponent(preImpactEps())}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }


  const SERIES_DT = 0.02;

  async function fetchTrajectorySeries() {
    const res = await fetch(
      `http://127.0.0.1:8000/projectile_series` +
      `?mass=${encodeURIComponent(ballMass)}` +
      `&height=${encodeURIComponent(dropHeight_m)}` +
      `&speed=${encodeURIComponent(launchSpeed_mps)}` +
      `&angle=${encodeURIComponent(launchAngle_deg)}` +
      `&dt=${encodeURIComponent(SERIES_DT)}` +
      `&eps=${encodeURIComponent(preImpactEps())}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    trajCache = await res.json();
    // --- ensure t=0 and t=tLand samples exist (frontend normalization) ---
    async function ensureBoundarySamples() {
      if (!trajCache?.series?.length) return;

      // sort once
      trajCache.series.sort((a, b) => a.time_s - b.time_s);

      // 1) Ensure t=0 exists
      const first = trajCache.series[0];
      if (!first || first.time_s > 1e-9) {
        const p0 = await fetchAtTime(0);
        // force exact time 0 for chart axis cleanliness
        p0.time_s = 0;
        trajCache.series.unshift(p0);
      } else if (Math.abs(first.time_s) < 1e-6) {
        first.time_s = 0;
      }

      // 2) Ensure landing/rest sample exists at exactly tLand_s
      if (tLand_s != null && Number.isFinite(tLand_s)) {
        // normalize rest payload to be a "ground" point
        if (trajCache.rest) {
          trajCache.rest.time_s = tLand_s;
          trajCache.rest.y = 0;
          trajCache.rest.onGround = true;
          trajCache.rest.Fn = trajCache.rest.Fg; // IMPORTANT: Fn=Fg at rest
          trajCache.rest.vx = 0;
          trajCache.rest.vy = 0;
          trajCache.rest.v = 0;
          trajCache.rest.ax = 0;
          trajCache.rest.ay = 0;
        }

        const last = trajCache.series[trajCache.series.length - 1];
        const needLand =
          !last ||
          Math.abs(last.time_s - tLand_s) > 1e-6;


        if (needLand) {
          // Use the last in-flight point as "pre-impact physics"
          const pre = trajCache.series[trajCache.series.length - 1];

          const impact = {
            ...pre,
            time_s: tLand_s,
            y: 0,
            onGround: true,
            Fn: pre.Fg,   // show Fn=Fg at contact frame on graphs
            // vx/vy remain pre-impact ✅ (so V graphs don’t drop to 0)
          };

          trajCache.series.push(impact);
          trajCache.series.sort((a, b) => a.time_s - b.time_s);
        }
      }
    }


    // authoritative times from backend
    tApex_s = trajCache.meta.t_apex;   // can be null
    tLand_s = trajCache.meta.t_land;
    await ensureBoundarySamples();

    syncScrubberBounds();
    trajCache.series.sort((a, b) => a.time_s - b.time_s);
  }




  // ✅ STEP 3: update ONLY line dataset (dataset[0])
  function updateCharts(data, force = false) {
    const t = chartTime(data.time_s);

    charts.x_t.data.datasets[0].data.push({ x: t, y: data.x });
    charts.y_t.data.datasets[0].data.push({ x: t, y: data.y });
    charts.vx_t.data.datasets[0].data.push({ x: t, y: data.vx });
    charts.vy_t.data.datasets[0].data.push({ x: t, y: data.vy });
    charts.Fg_t.data.datasets[0].data.push({ x: t, y: roundTo(data.Fg, 2) });

    const tRaw = Number(data.time_s);

    // ✅ special case: start on ground at t=0 → show Fn = mg for the first point
    const startGroundKick =
      dropHeight_m === 0 && Math.abs(tRaw) <= 1e-9;

    const FnPlot =
      startGroundKick ? data.Fg :
        isAtLandingTime(tRaw) ? data.Fg :
          data.Fn;

    charts.Fn_t.data.datasets[0].data.push({ x: t, y: FnPlot });


    charts.ax_t.data.datasets[0].data.push({ x: t, y: data.ax });
    charts.ay_t.data.datasets[0].data.push({ x: t, y: data.ay });

    chartTick++;
    if (!force && chartTick % CHART_UPDATE_EVERY !== 0) return;

    for (const k of ["x_t", "y_t", "vx_t", "vy_t", "Fg_t", "Fn_t", "ax_t", "ay_t"]) {
      charts[k].update("none");
    }
  }


  let rebuildToken = 0;




  function rebuildChartsToTime(tTarget) {
    if (!trajCache?.series?.length) return;

    const t = clamp01Time(tTarget);

    // clear only line datasets
    for (const k of LINE_KEYS) {
      const c = charts[k];
      if (!c) continue;
      c.data.datasets[0].data.length = 0;
    }
    chartTick = 0;

    for (const p of trajCache.series) {
      if (p.time_s > t) break;

      const tt = chartTime(p.time_s);


      charts.x_t.data.datasets[0].data.push({ x: tt, y: p.x });
      charts.y_t.data.datasets[0].data.push({ x: tt, y: p.y });
      charts.vx_t.data.datasets[0].data.push({ x: tt, y: p.vx });
      charts.vy_t.data.datasets[0].data.push({ x: tt, y: p.vy });
      charts.Fg_t.data.datasets[0].data.push({ x: tt, y: roundTo(p.Fg, 2) });

      const tRaw = Number(p.time_s);

      const startGroundKick =
        dropHeight_m === 0 && Math.abs(tRaw) <= 1e-9;

      const FnPlot =
        startGroundKick ? p.Fg :
          isAtLandingTime(tRaw) ? p.Fg :
            p.Fn;

      charts.Fn_t.data.datasets[0].data.push({ x: tt, y: FnPlot });



      charts.ax_t.data.datasets[0].data.push({ x: tt, y: p.ax });
      charts.ay_t.data.datasets[0].data.push({ x: tt, y: p.ay });
    }





    // ✅ update AFTER all pushes
    for (const k of LINE_KEYS) charts[k]?.update("none");
  }




  function setPausedInternal(pause) {
    engine.timing.timeScale = pause ? 0 : playbackSpeed;
    isPaused = pause;
  }

  // UI pause (changes button label)
  function pauseSim(pause) {
    setPausedInternal(pause);
    $("pauseBtn").innerText = pause ? "Resume" : "Pause";
  }



  function resetProjectileFromInputs() {
    const h = Number($("heightInput").value);
    const v = Number($("velocityInput").value);
    const a = Number($("angleInput").value);
    const m = Number($("massInput").value);

    dropHeight_m = Number.isFinite(h) ? Math.max(0, h) : 0;
    launchSpeed_mps = Number.isFinite(v) ? Math.max(0, v) : 50;

    // Clamp angle to what your UI/labels expect; prevents FastAPI 422
    launchAngle_deg = Number.isFinite(a) ? Math.max(0, Math.min(90, a)) : 45;

    // Never allow 0 or negative mass (FastAPI requires >0, Matter hates <=0)
    ballMass = Number.isFinite(m) ? Math.max(0.001, m) : 10;

    Body.setMass(ball, ballMass);
    const theta = launchAngle_deg * Math.PI / 180;
    vx_mps = launchSpeed_mps * Math.cos(theta);
    vy_mps = launchSpeed_mps * Math.sin(theta);
    t_s = 0; hasLanded = false; ballOnGround = false;
    finalFetchDone = false;
    computeScaling();
    Body.setPosition(ball, { x: 100, y: worldToCanvasY(dropHeight_m) });
    Body.setVelocity(ball, { x: 0, y: 0 });
    Body.setStatic(ball, true);
    tApex_s = null;
    tLand_s = null;



    if (scrubber) {
      syncScrubberBounds();
      scrubber.value = "0";
    }

    setFreezeButtonsEnabled(!motionInProgress);
    resetTrail();
    const vyImpact = Math.sqrt(vy_mps * vy_mps + 2 * g * dropHeight_m);
    V_RUN_MAX_MS = Math.hypot(vx_mps, vyImpact);   // max speed you’ll reach this run
    if (!Number.isFinite(V_RUN_MAX_MS) || V_RUN_MAX_MS < 1e-6) V_RUN_MAX_MS = 1;

  }

  function setLineMode(chart) {
    const ds = chart.data.datasets[0];
    ds.showLine = true;
    ds.borderWidth = 3;
    ds.borderColor = ds._lineColor || ds.borderColor;
    ds.pointRadius = 0;
    ds.pointHoverRadius = 0;
    ds.pointBackgroundColor = undefined;
    ds.pointBorderColor = undefined;
  }

  function setAllChartsLineMode() {
    for (const key in charts) if (charts[key]) setLineMode(charts[key]);
  }
  // -------------------- RENDER --------------------
  const render = Render.create({
    element: $("scene"),
    engine,
    options: {
      width: canvasWidth,
      height: canvasHeight,
      wireframes: false,
      background: `
      linear-gradient(#87ceeb, #ffffff),

      /* minor grid */
      linear-gradient(to right, rgba(0,0,0,0.07) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0,0,0,0.07) 1px, transparent 1px),

      /* major grid */
      linear-gradient(to right, rgba(0,0,0,0.16) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0,0,0,0.16) 1px, transparent 1px)
    `,
      backgroundSize: `
      cover,

      25px 25px,
      25px 25px,

      125px 125px,
      125px 125px
    `,
      backgroundPosition: `
      center,

      0 0,
      0 0,

      0 0,
      0 0
    `
    }
  });

  Render.run(render);
  Runner.run(Runner.create(), engine);
  // -------------------- MOTION LOOP --------------------
  Events.on(engine, "beforeUpdate", (event) => {
    if (isPaused) return;
    if (!trajCache || !trajCache.series || trajCache.series.length === 0) return;

    const dt = event.delta / 1000;
    t_s = clamp01Time(t_s + dt);

    const st = stateAtTime(t_s) || pointAtTime(t_s);
    currentSt = st;
    if (!st) return;

    // authoritative physics from backend
    x_m = st.x;
    y_m = st.y;

    Body.setPosition(ball, { x: 100 + x_m * pxPerMeterX, y: worldToCanvasY(y_m) });

    if (motionInProgress) {
      trailFrame++;
      if ((trailFrame & 1) === 0) sampleTrailPoint(); // ✅ half rate
    }


    const landedNow = (tLand_s != null && t_s >= (tLand_s - edgeTol()));
    const onStartGround = (dropHeight_m === 0 && t_s <= edgeTol());
    const onLandGround = (tLand_s != null && Number.isFinite(tLand_s) && t_s >= (tLand_s - edgeTol()));
    ballOnGround = onStartGround || onLandGround || hasLanded || freezeMode === "end" || atRightEdgeNow();


    if (landedNow) {
      t_s = tLand_s;
      if (scrubber) setScrubberValue(tLand_s);
      hasLanded = true;
      ballOnGround = true;
      freezeMode = "end";
      stopFetchLoop();
      finalFetchOnce();
      pauseSim(true);
      setScrubberEnabled(true);
      motionInProgress = false;
      setMotionLock(false);
      const st = stateAtTime(preLandingTime()) || pointAtTime(preLandingTime()) || currentSt;
      if (st) setMovingDotAtState(st);
      updateUIInteractivity();
    }

  });


  function drawLabeledDot(ctx, x, y, label, dx = 8, dy = 0) {
    const r = 5;
    ctx.save();
    // --- Dot ---
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    // --- Text ---
    const tx = x + dx;
    const ty = y + dy;
    ctx.font = "12px Arial";
    ctx.textBaseline = "middle";
    // Center text if it's above/below
    if (Math.abs(dy) > 0) {
      ctx.textAlign = "center";
    } else {
      ctx.textAlign = (dx < 0) ? "right" : "left";
    }
    // White halo (prevents ball/lines covering text)
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(label, tx, ty);
    // Black text on top
    ctx.fillStyle = "#000";
    ctx.fillText(label, tx, ty);
    ctx.restore();
  }
  function setPlaybackSpeed(newSpeed) {
    playbackSpeed = newSpeed;

    // If not paused, apply immediately
    if (!isPaused) engine.timing.timeScale = playbackSpeed;

    // Restart fetch loop so chart updates match speed
    if (fetchTimer && !isPaused) {
      stopFetchLoop();
      startFetchLoop();
    }

    // UI highlight
    document.querySelectorAll(".speed-btn").forEach((b) => {
      b.classList.toggle("active", parseFloat(b.dataset.speed) === playbackSpeed);
    });
  }

  async function initRun() {
    resetProjectileFromInputs();

    await fetchTrajectorySeries();     // ✅ load trajCache once
    resetAllCharts();
    // ✅ seed graphs at t=0 so lines start at 0
    currentSt = stateAtTime(0) || pointAtTime(0);
    if (currentSt) {
      currentSt.time_s = 0;          // force exact 0 for axis cleanliness
      updateCharts(currentSt, true); // force push + update
      setMovingDotAtState(currentSt);
    }




    // start motion
    motionInProgress = true;
    setMotionLock(true);
    updateUIInteractivity();

    pauseSim(false);
    Body.setStatic(ball, false);
    startFetchLoop();
  }



  function startFetchLoop() {
    stopFetchLoop();

    fetchTimer = setInterval(() => {
      if (isPaused || !trajCache) return;

      const d = currentSt || stateAtTime(t_s) || pointAtTime(t_s);
      if (!d) return;

      // 1) BUILD LINE HISTORY WHILE PLAYING (no preload)
      // updateCharts() already throttles via CHART_UPDATE_EVERY
      if (motionInProgress && !scrubInFlight && charts.x_t) {
        updateCharts(d); // pushes into dataset[0]
        if (needsChartRedraw) {
          needsChartRedraw = false;
          for (const k of LINE_KEYS) charts[k]?.update("none");
        }

      }

      // 2) MOVE THE DOT (cheap) — during play or pause
      if (!scrubInFlight) {
        const now = performance.now();
        if (now - lastDotUpdate > 1000 / PERF.dotHz) {
          lastDotUpdate = now;
          setMovingDotAtState(d); // sets dataset[1]
        }
      } else {
        // while dragging scrubber: preview point only
        previewDotsAtTime(t_s).catch(() => { });
      }

      // 3) keep scrubber knob synced during play
      if (scrubber && tLand_s != null && !scrubInFlight) setScrubberValue(t_s);
    }, Math.max(10, FETCH_INTERVAL / playbackSpeed));
  }





  function stopFetchLoop() {
    if (fetchTimer) clearInterval(fetchTimer);
    fetchTimer = null;
  }

  // -------------------- FETCH LOOP --------------------
  // -------------------- AFTER RENDER --------------------
  Events.on(render, "afterRender", () => {
    const ctx = render.context;

    // ====== helpers ======
    const startX_px = 100;
    const startY_px = worldToCanvasY(dropHeight_m);

    const isHorizontal = Math.abs(launchAngle_deg - 0) < 1e-9;
    const isVertical = Math.abs(launchAngle_deg - 90) < 1e-9;
    const startOnGround = (dropHeight_m === 0);

    const hasApex = (tApex_s != null && Number.isFinite(tApex_s));
    const hasEnd = (tLand_s != null && Number.isFinite(tLand_s));

    // Use the vector state that preserves pre-impact physics at right edge/end
    const stVec = getVectorState();
    const vx_now = stVec?.vx ?? vx_mps;
    const vy_now = stVec?.vy ?? (vy_mps - g * t_s);

    // end state (landing position) in pixels
    let endX_px = null, endY_px = null;
    if (hasEnd) {
      const endSt = trajCache?.rest || stateAtTime(tLand_s) || pointAtTime(tLand_s);
      if (endSt) {
        endX_px = 100 + endSt.x * pxPerMeterX;
        endY_px = worldToCanvasY(0);
      }
    }

    // apex state (top of arc) in pixels
    let apexX_px = null, apexY_px = null;
    if (hasApex) {
      const apexSt = stateAtTime(tApex_s);
      if (apexSt) {
        apexX_px = 100 + apexSt.x * pxPerMeterX;
        apexY_px = worldToCanvasY(apexSt.y);
      }
    }

    // ====== 1) Dots + labels (correct for 0°/90° AND height>0) ======
    if (isHorizontal) {
      // Angle 0°: vy0 = 0 so Start and Apex are the same point (at y = starting height).
      drawLabeledDot(ctx, startX_px, startY_px, "Start/Apex", 0, -18);

      // End is on ground (y=0) and generally different unless range=0.
      if (endX_px != null) {
        drawLabeledDot(ctx, endX_px, endY_px, "End", 42, 0);
      }
    } else if (isVertical) {
      // Angle 90°: x is (approximately) constant, but Start and End are only the SAME POINT if height=0.
      if (startOnGround) {
        drawLabeledDot(ctx, startX_px, startY_px, "Start/End", 42, 0);
      } else {
        drawLabeledDot(ctx, startX_px, startY_px, "Start", 42, 0);
        if (endX_px != null) drawLabeledDot(ctx, endX_px, endY_px, "End", 42, 0);
      }

      if (apexX_px != null) {
        drawLabeledDot(ctx, apexX_px, apexY_px, "Apex", 0, -18);
      }
    } else {
      // Normal: show Start + Apex + End
      drawLabeledDot(ctx, startX_px, startY_px, "Start", -42, 0);

      if (apexX_px != null) {
        drawLabeledDot(ctx, apexX_px, apexY_px, "Apex", 0, -18);
      }

      if (endX_px != null) {
        drawLabeledDot(ctx, endX_px, endY_px, "End", 42, 0);
      }
    }

    // ====== 2) Forces ======
    if (forceEnabled) {
      // Gravity (Fg)
      drawArrow(
        ctx,
        ball.position.x,
        ball.position.y,
        ball.position.x,
        ball.position.y + 40,
        "#dc2626",
        "Fg",
        false
      );

      // Normal force (Fn) only when on ground / end frame / right-edge scrub
      if (shouldShowGroundNow()) {
        drawArrow(
          ctx,
          ball.position.x,
          ball.position.y,
          ball.position.x,
          ball.position.y - 40,
          "#16a34a",
          "Fn",
          false
        );
      }

      // Air resistance (Fd) triangle decomposition
      if (airEnabled) {
        const x0 = ball.position.x;
        const y0 = ball.position.y;

        const vx_current = vx_now;
        const vy_current = vy_now;

        // pixel-space velocity components (note: canvas y is down, so flip vy)
        const vx_px = vx_current * pxPerMeterX;
        const vy_px = -vy_current * pxPerMeterY;

        const speed_px = Math.hypot(vx_px, vy_px);

        if (speed_px >= 1e-6) {
          const BASE_LEN = 20;
          let dragLen = BASE_LEN + (speed_px / 10);
          dragLen = Math.max(dragLen, 60);

          const ux = vx_px / speed_px;
          const uy = vy_px / speed_px;

          // resultant drag opposite velocity
          const rx = -ux * dragLen;
          const ry = -uy * dragLen;

          // components as right triangle legs
          const x1 = x0 + rx;
          const y1 = y0;
          const x2 = x1;
          const y2 = y0 + ry;

          drawArrow(ctx, x0, y0, x1, y1, "#2563eb", "Fdₓ", true);
          drawArrow(ctx, x1, y1, x2, y2, "#2563eb", "Fdᵧ", true);
          drawArrow(ctx, x0, y0, x2, y2, "#2563eb", "Fd", false);
        }
      }
    }

    // ====== 3) Velocity vectors ======
    if (velocityEnabled) {
      const pos = ball.position;

      // Separate scaling (your tuning knobs)
      const VX_SCALE = 1.2;
      const VY_SCALE = 1.0;
      const VY_MAX_PX = 140;

      const dx = vx_now * VX_SCALE;

      let dy = -vy_now * VY_SCALE;
      if (dy > VY_MAX_PX) dy = VY_MAX_PX;
      if (dy < -VY_MAX_PX) dy = -VY_MAX_PX;

      drawArrow(ctx, pos.x, pos.y, pos.x + dx, pos.y, "#f59e0b", "Vx", true);
      drawArrow(ctx, pos.x + dx, pos.y, pos.x + dx, pos.y + dy, "#10b981", "Vy", true);
      drawArrow(ctx, pos.x, pos.y, pos.x + dx, pos.y + dy, "#ef4444", "V", false);
    }

    // ====== 4) Motion (trail + coordinate arrows) ======
    if (motionEnabled) {
      const pos = ball.position;

      drawTrail(ctx);

      const groundLineY = GROUND_CENTER_Y;
      drawArrow(
        ctx,
        startX_px, groundLineY,
        pos.x, groundLineY,
        "#2563eb", "x", true,
        { x: 0, y: -10 }
      );

      const leftX = 50;
      drawArrow(
        ctx,
        leftX, startY_px,
        leftX, pos.y,
        "#10b981", "y", true,
        { x: -20, y: 0 }
      );
    }

    // ====== 5) Acceleration vectors ======
    if (accelerationEnabled) {
      const pos = ball.position;
      const st = getVectorState() || currentSt;

      if (st) {
        // Acceleration scale factor
        const ACCEL_SCALE = 5.0;

        // ax arrow (horizontal)
        const axPx = st.ax * ACCEL_SCALE;
        drawArrow(ctx, pos.x, pos.y, pos.x + axPx, pos.y, "#7c3aed", "ax", false, { x: 0, y: -15 });



        // ay arrow (vertical, negative because canvas y is down)
        const ayPx = -st.ay * ACCEL_SCALE;

        drawArrow(ctx, pos.x, pos.y, pos.x, pos.y + ayPx, "#0ea5e9", "ay", false, { x: 15, y: 0 });
      }
    }
  });


  // -------------------- CONTROLS --------------------
  $("pauseBtn").addEventListener("click", () => {
    if (!trajCache?.series?.length) return;
    needsChartRedraw = true;

    const ended =
      (tLand_s != null && Number.isFinite(tLand_s) && t_s >= (tLand_s - edgeTol()));

    // Toggle (can't unpause if ended)
    const nextPaused = ended ? true : !isPaused;

    if (!nextPaused) {
      // resuming
      freezeMode = null;

      if (tLand_s != null && Number.isFinite(tLand_s) && t_s < (tLand_s - edgeTol())) {
        hasLanded = false;
        ballOnGround = (dropHeight_m === 0 && t_s <= edgeTol());

        // ✅ allow landing point to be appended again
        finalFetchDone = false;
      }

      const canPlay = !ended;
      motionInProgress = canPlay;
      setMotionLock(canPlay);
    }


    pauseSim(nextPaused);

    if (nextPaused) stopFetchLoop();
    else startFetchLoop();

    updateUIInteractivity();
  });






  // ✅ STEP 5: Restart force-hides dot dataset, then runs motion normally
  $("restartBtn").addEventListener("click", async () => {
    // hard reset pause UI/state
    stopFetchLoop();
    isPaused = false;
    engine.timing.timeScale = playbackSpeed;
    $("pauseBtn").innerText = "Pause";

    // ✅ lock immediately (before awaits)
    hasLanded = false;
    ballOnGround = false;
    setMotionLock(true);
    updateUIInteractivity();

    freezeMode = null;

    // hide dot dataset
    for (const key in charts) {
      const c = charts[key];
      if (!c) continue;
      if (c.data.datasets[1]) {
        c.data.datasets[1].hidden = true;
        c.data.datasets[1].data.length = 0;
      }
      c.update("none");
    }




    // reset physics + charts
    resetProjectileFromInputs();
    await fetchTrajectorySeries();   // <-- one request
    setScrubberEnabled(true);
    updateUIInteractivity();
    resetAllChartsFast();
    // ✅ Seed charts at t=0 so every restart starts at 0
    t_s = 0;
    currentSt = stateAtTime(0) || pointAtTime(0);
    if (currentSt) {
      currentSt.time_s = 0;
      updateCharts(currentSt, true);   // pushes dataset[0] and updates
      setMovingDotAtState(currentSt);  // optional: keep dot synced
    }
    setStateAtTime(0);
    setTrailToTime(0);


    pauseSim(false);
    Body.setStatic(ball, false);
    startFetchLoop(); // ✅ start chart fetching while in flight

    // ✅ awaits are now safe; controls are already locked









  });



  // ✅ STEP 4: Start button ONLY shows the dot dataset (dataset[1])
  $("frameStartBtn")?.addEventListener("click", () =>
    runFreezeAction(async () => {
      if (isPlaying()) return; // ✅ instead of motionInProgress
      await applyStartSnapshot();
      updateUIInteractivity();
    })
  );




  // ✅ Apex: hide dot dataset, build normal lines only
  $("frameApexBtn")?.addEventListener("click", () => runFreezeAction(async () => {
    if (isPlaying() || tApex_s == null) return; // ✅

    freezeMode = "apex";
    stopFetchLoop();

    hideDotsNoUpdate();


    rebuildChartsToTime(tApex_s);
    pauseSim(true);
    setStateAtTime(tApex_s);
    setTrailToTime(tApex_s);
    setScrubberValue(tApex_s);


    updateUIInteractivity();
  }));



  // ✅ End: hide dot dataset, build normal lines only

  $("frameEndBtn")?.addEventListener("click", () => runFreezeAction(async () => {
    if (isPlaying()) return;
    if (tLand_s == null || !Number.isFinite(tLand_s)) return;

    const tPre = preLandingTime();    // visual (impact-ish)
    const tGraph = tLand_s;           // graph includes landing so Fn=Fg appears

    freezeMode = "end";
    stopFetchLoop();
    hideDotsNoUpdate();

    pauseSim(true);

    // ✅ ball looks like impact moment
    setStateAtTime(tPre, false);
    setTrailToTime(tPre);

    // ✅ but graphs include the landing point (Fn=Fg)
    rebuildChartsToTime(tGraph);

    // ✅ slider snaps to the true right edge now
    setScrubberValue(tLand_s);

    // ✅ ensure UI shows as end-state

    hasLanded = true;
    ballOnGround = true;

    updateUIInteractivity();
  }));

  // Exclusive checkboxes unchanged (short version)
  const checkboxIds = ["vectorCheckbox", "forceCheckbox", "motionCheckbox", "accelerationCheckbox"];
  const setExclusive = (activeId) => {
    checkboxIds.forEach(id => { const cb = $(id); if (cb) cb.checked = (id === activeId); });
    velocityEnabled = (activeId === "vectorCheckbox");
    forceEnabled = (activeId === "forceCheckbox");
    motionEnabled = (activeId === "motionCheckbox");
    accelerationEnabled = (activeId === "accelerationCheckbox");

    updateKeyVisibility(); // ✅ update the legend
    updateGraphVisibility();
    if (motionEnabled) {
      const tNow = scrubber ? parseFloat(scrubber.value) : t_s;
      setTrailToTime(Number.isFinite(tNow) ? tNow : t_s);
    }
    const stNow = getVectorState() || currentSt;
    if (stNow) setMovingDotAtState(stNow);
  };
  checkboxIds.forEach(id => $(id)?.addEventListener("change", () => setExclusive(id)));
  // -------------------- CHARTS --------------------
  Chart.defaults.color = "#0f172a";
  Chart.defaults.font.family = "system-ui, Arial";
  Chart.defaults.font.size = 14;

  // ✅ STEP 1: chart now has TWO datasets (line + start dot)
  let previewToken = 0;


  function nearestPoint(tTarget) {
    const s = trajCache?.series;
    if (!s?.length) return null;

    let lo = 0, hi = s.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid].time_s < tTarget) lo = mid;
      else hi = mid;
    }
    // pick closer of lo/hi
    return (Math.abs(s[lo].time_s - tTarget) <= Math.abs(s[hi].time_s - tTarget)) ? s[lo] : s[hi];
  }

  function onScrubInput() {
    if (!scrubber) return;
    if (!trajCache?.series?.length) return;

    if (!scrubInFlight) beginScrub();

    const v = parseFloat(scrubber.value);
    if (!Number.isFinite(v)) return;

    const atRight = isAtRightEdgeValue(v);

    // ✅ Use pre-impact time for visuals/dots at the right edge
    const tPreview = atRight
      ? preLandingTime()
      : Math.max(0, Math.min(v, (tLand_s ?? v)));

    setStateAtTime(tPreview, false);
    setTrailToTime(tPreview);

    const st = stateAtTime(tPreview) || pointAtTime(tPreview);
    if (st) setMovingDotAtState(st);
  }


  function atRightEdgeNow() {
    if (!scrubber) return false;
    const v = parseFloat(scrubber.value);
    return Number.isFinite(v) && v >= (scrubMax() - edgeTol());
  }


  function getVectorState() {
    if (!trajCache?.series?.length) return currentSt;

    // If we're ended OR user is scrubbing at the right edge, show pre-impact physics for vectors.
    if (hasLanded || atRightEdgeNow()) {
      const tPre = preLandingTime();
      return stateAtTime(tPre) || pointAtTime(tPre) || currentSt;
    }

    return currentSt || (stateAtTime(t_s) || pointAtTime(t_s));
  }


  async function previewDotsAtTime(tTarget) {
    if (!trajCache) return;
    const useRest = (tLand_s != null && Number.isFinite(tLand_s) && Math.abs(tTarget - tLand_s) <= edgeTol());
    const data = useRest ? (trajCache.rest || nearestPoint(tTarget)) : nearestPoint(tTarget);
    if (!data) return;
    if (dropHeight_m === 0 && Math.abs(Number(data.time_s)) <= 1e-9) {
      data.Fn = data.Fg;
    }

    if (useRest) data.Fn = data.Fg;


    const setDot = (chart, yVal) => {
      const dot = chart.data.datasets[1];
      dot.hidden = false;
      dot.data.length = 0;
      dot.data.push({ x: chartTime(data.time_s), y: yVal });
      chart.update("none");
    };

    setDot(charts.x_t, data.x);
    setDot(charts.y_t, data.y);
    setDot(charts.vx_t, data.vx);
    setDot(charts.vy_t, data.vy);
    setDot(charts.Fg_t, data.Fg);
    setDot(charts.Fn_t, data.Fn);
    setDot(charts.ax_t, data.ax);
    setDot(charts.ay_t, data.ay);
  }

  const roundTo = (v, decimals = 2) => {
    const p = 10 ** decimals;
    return Math.round(Number(v) * p) / p;
  };

  function createLineChart(ctx, label, yLabel, color, xTitle = "Time (s)") {
    return new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          // dataset[0] = line
          {
            label,
            data: [],               // <-- array of {x, y}
            borderColor: color,
            borderWidth: 3,
            fill: false,
            tension: 0.1,
            parsing: false,
            pointRadius: (ctx) => (ctx.dataset.data.length < 2 ? 4 : 0),
            pointHoverRadius: (ctx) => (ctx.dataset.data.length < 2 ? 6 : 0),
          },
          // dataset[1] = start dot
          {
            label: "Start Dot",
            data: [],               // <-- array of {x, y}
            showLine: false,
            borderWidth: 0,
            pointRadius: 8,
            pointHoverRadius: 10,
            pointBackgroundColor: "#000",
            pointBorderColor: "#fff",
            pointBorderWidth: 3,
            hidden: true,
            parsing: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            labels: {
              font: { size: 20 },
              filter: (legendItem) => legendItem.datasetIndex !== 1
            }
          }
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            title: { display: true, text: xTitle, font: { size: 18 } },
            ticks: {
              maxTicksLimit: 6,
              callback: (v) => Number(v).toFixed(2)
            }
          },
          y: {
            title: { display: true, text: yLabel, font: { size: 18 } },
            ticks: {
              callback: (v) => Number(v).toFixed(2)
            }

          }
        }
      }
    });
  }

  charts.x_t = createLineChart($("graph-x-t"), "X vs t", "X (m)", "#2563eb");
  charts.y_t = createLineChart($("graph-y-t"), "Y vs t", "Y (m)", "#10b981");
  charts.vx_t = createLineChart($("graph-vx-t"), "Vx vs t", "Vx (m/s)", "#f59e0b");
  charts.vy_t = createLineChart($("graph-vy-t"), "Vy vs t", "Vy (m/s)", "#f43f5e");
  charts.Fg_t = createLineChart($("graph-Fg-t"), "Fg vs t", "Fg (N)", "#dc2626");
  charts.Fn_t = createLineChart($("graph-Fn-t"), "Fn vs t", "Fn (N)", "#16a34a");
  charts.ax_t = createLineChart($("graph-ax-t"), "Ax vs t", "ax (m/s²)", "#64748b");
  charts.ay_t = createLineChart($("graph-ay-t"), "Ay vs t", "ay (m/s²)", "#0ea5e9");

  // Mass chart: x axis is mass
  charts.Fg_m = createLineChart($("graph-Fg-m"), "Fg vs m", "Fg (N)", "#7c3aed", "Mass (kg)");

  setExclusive(forceEnabled ? "forceCheckbox" : (velocityEnabled ? "vectorCheckbox" : (motionEnabled ? "motionCheckbox" : "accelerationCheckbox")));
  updateKeyVisibility();
  updateGraphVisibility();
  updateUIInteractivity();



  for (const key in charts) {
    const ds = charts[key].data.datasets[0];
    ds._lineColor = ds.borderColor; // stash original color
  }
  buildFgVsMassChart();
  updateGraphVisibility();



  // Initial state: not moving -> freeze buttons usable
  computeScaling();



  // 🔒 HARD SYNC: HTML inputs ← AI-injected JS values
  $("heightInput").value = dropHeight_m;
  $("velocityInput").value = launchSpeed_mps;
  $("angleInput").value = launchAngle_deg;
  $("massInput").value = ballMass;
  $("forceCheckbox").checked = forceEnabled;
  $("vectorCheckbox").checked = velocityEnabled;
  $("motionCheckbox").checked = motionEnabled;
  $("accelerationCheckbox").checked = accelerationEnabled;



  // =========================
  // ONE-TIME UI SETUP
  // =========================
  scrubber = document.getElementById("timeScrubber");
  if (scrubber) {
    scrubber.step = "0.01";
    scrubber.min = "0";
    syncScrubberBounds();
    scrubber.value = "0";
  }
  setScrubberEnabled(true); // ✅ locked until landing



  function hideDotsNoUpdate() {
    for (const k in charts) {
      const c = charts[k];
      if (!c || k === "Fg_m") continue;
      const dot = c.data.datasets[1];
      if (!dot) continue;
      dot.hidden = true;
      dot.data.length = 0;
    }
  }

  function beginScrub() {
    if (!scrubber) return;
    if (!trajCache?.series?.length) return; // allow enabled, but ignore until ready
    freezeMode = null; // scrubbing overrides freeze snapshots
    scrubInFlight = true;
    scrubWasPaused = isPaused;
    scrubWasPlaying = (!isPaused && motionInProgress && !hasLanded);

    // Freeze motion/time while dragging, but DO NOT touch the pause button label
    setPausedInternal(true);
    stopFetchLoop();

    updateUIInteractivity();
  }
  function applyScrubStartLikeRestart() {
    freezeMode = null;
    stopFetchLoop();

    // reset time + flags like restart does
    t_s = 0;
    hasLanded = false;
    ballOnGround = (dropHeight_m === 0);
    finalFetchDone = false;

    // move visuals to start
    setStateAtTime(0);
    setTrailToTime(0);

    // clear ALL datasets (line + dot) and rebuild mass chart
    resetAllChartsFast();

    // keep charts in line mode (same as your default)
    setAllChartsLineMode();

    // seed line datasets at t=0 (restart does this)
    currentSt = stateAtTime(0) || pointAtTime(0);
    if (currentSt) {
      currentSt.time_s = 0;
      updateCharts(currentSt, true);     // line seed
      setMovingDotAtState(currentSt);    // show dot at start (optional but matches your restart feel)
    }

    if (scrubber) scrubber.value = "0";
  }


  async function endScrub() {
    if (!scrubber) return;
    if (!trajCache?.series?.length) return;

    scrubInFlight = false;

    const v = parseFloat(scrubber.value);
    const atLeft = Number.isFinite(v) && v <= (scrubMin() + edgeTol());
    const atRight = Number.isFinite(v) && isAtRightEdgeValue(v);

    // Graph time: true end (includes landing sample where Fn=Fg)
    const tGraph =
      atLeft ? 0 :
        atRight ? (tLand_s ?? scrubMax()) :
          clamp01Time(v);

    // Visual/dot time: pre-impact at right edge so vectors/ball don't "jump to 0"
    const tVisual =
      atLeft ? 0 :
        atRight ? preLandingTime() :
          tGraph;

    // Scrubbing overrides any freeze snapshot
    freezeMode = null;

    // ✅ If we’re at the right edge, FORCE the knob to the true end FIRST
    // (prevents our own setStateAtTime logic or rounding from pulling it left)
    if (atRight && tLand_s != null && Number.isFinite(tLand_s)) {
      setScrubberValue(tLand_s); // sets to scrubber.max (reachable end)
    }

    if (atLeft) {
      applyScrubStartLikeRestart();

      // Decide resume behavior (same logic you already have)
    } else {
      // Normal behavior for middle/right
      setStateAtTime(tVisual, false);
      setTrailToTime(tVisual);

      clearAllDotDatasets();
      rebuildChartsToTime(tGraph);

      const st = stateAtTime(tVisual) || pointAtTime(tVisual);
      if (st) setMovingDotAtState(st);
    }


    // ✅ Set landed/ground flags consistently with what we’re showing
    if (atRight && tLand_s != null && Number.isFinite(tLand_s)) {
      hasLanded = true;
      ballOnGround = true;
    } else {
      hasLanded = (tLand_s != null && Number.isFinite(tLand_s) && tGraph >= (tLand_s - edgeTol()));
      ballOnGround = hasLanded || (dropHeight_m === 0 && tGraph <= edgeTol());
    }

    // ✅ Decide whether we can resume motion from this point
    const canPlayFromHere =
      (tLand_s == null || !Number.isFinite(tLand_s) || tGraph < (tLand_s - edgeTol()));

    if (!scrubWasPaused && scrubWasPlaying && canPlayFromHere) {
      // Resume playing
      hasLanded = false;
      finalFetchDone = false;
      motionInProgress = true;
      setMotionLock(true);
      pauseSim(false);
      startFetchLoop();
    } else {
      // Stay paused at scrubbed time
      motionInProgress = canPlayFromHere;
      setMotionLock(canPlayFromHere);
      pauseSim(true);
      stopFetchLoop();
    }

    updateUIInteractivity();
  }



  function chartTime(t) {
    return Number(t); // no rounding for data
  }



  function clearAllDotDatasets() {
    for (const k in charts) {
      const c = charts[k];
      if (!c) continue;
      if (k === "Fg_m") continue;
      const dot = c.data.datasets[1];
      if (!dot) continue;
      dot.hidden = true;
      dot.data.length = 0;
      c.update("none");
    }
  }

  // Uses the SAME dot-only structure as your Start button.
  async function applyStartSnapshot() {
    freezeMode = "start";
    stopFetchLoop();
    pauseSim(true);

    // Move sim to t=0 visually
    setStateAtTime(0);
    setTrailToTime(0);


    // Clear line + dot datasets
    resetAllCharts();

    const data = trajCache?.series?.[0] ?? await fetchAtTime(0);
    // ✅ If height=0 and we're showing "Start" as resting, force Fn=Fg BEFORE plotting
    if (dropHeight_m === 0) {
      data.time_s = 0;      // keep axis clean
      data.Fn = data.Fg;
      data.onGround = true;
    }


    if (scrubber) scrubber.value = "0";

    const putStartDot = (chart, yVal) => {
      const dotDs = chart.data.datasets[1];
      dotDs.hidden = false;
      dotDs.data.length = 0;           // ✅ don’t accumulate old dots
      dotDs.data.push({ x: chartTime(data.time_s), y: yVal });
      chart.update("none");
    };

    putStartDot(charts.x_t, data.x);
    putStartDot(charts.y_t, data.y);
    putStartDot(charts.vx_t, data.vx);
    putStartDot(charts.vy_t, data.vy);
    putStartDot(charts.Fg_t, data.Fg);
    putStartDot(charts.Fn_t, data.Fn);
    putStartDot(charts.ax_t, data.ax);
    putStartDot(charts.ay_t, data.ay);


  }






  // Mouse / touch / pointer support
  scrubber?.addEventListener("pointerdown", beginScrub);
  window.addEventListener("pointerup", () => scrubInFlight && endScrub());
  scrubber?.addEventListener("input", onScrubInput);

  // Fallbacks for browsers that don’t fully do pointer events
  scrubber?.addEventListener("mousedown", beginScrub);
  window.addEventListener("mouseup", () => scrubInFlight && endScrub());
  scrubber?.addEventListener("touchstart", beginScrub, { passive: true });
  window.addEventListener("touchend", () => scrubInFlight && endScrub(), { passive: true });


  // speed buttons (one-time listeners)
  document.querySelectorAll(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = parseFloat(btn.dataset.speed);
      if (!isFinite(s)) return;
      setPlaybackSpeed(s);
    });
  });

  // default speed highlight
  setPlaybackSpeed(1.0);







  // 🔥 Fix: initial load should NOT show a dot (line mode default)
  setAllChartsLineMode();




  const airCb = $("airCheckbox");
  if (airCb) {
    airCb.checked = airEnabled;

    airCb.addEventListener("change", () => {
      // lock during motion
      if (motionInProgress) {
        airCb.checked = airEnabled; // snap back
        return;
      }
      airEnabled = airCb.checked;
      updateKeyVisibility()
    });
  }
  initRun().catch(console.error);

});
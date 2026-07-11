/**
 * projectile.js — Full projectile simulation front-end.
 * Wraps everything in DOMContentLoaded.
 * No frameworks. Uses Matter.js for rendering and Chart.js for graphs.
 * Reads window.__SIM_CFG__ BEFORE creating any Matter bodies.
 */
window.addEventListener("DOMContentLoaded", () => {

    // ── 1) Matter destructure ──────────────────────────────────────────────────
    const { Engine, Render, Runner, World, Bodies, Body, Events } = Matter;
  
    // ── 2) Constants (ALL before any lets) ─────────────────────────────────────
    const canvasWidth  = 800;
    const canvasHeight = 700;
    const g            = 9.81;
  
    const groundHeight_px  = 40;
    const ballRadius       = 10;
  
    const maxRange_m  = 1200;
    const maxHeight_m = 650;
  
    const FETCH_INTERVAL = 200;
  
    const TRAIL_MAX_POINTS = 600;
    const TRAIL_MIN_DIST_PX = 3;
  
    const GROUND_CENTER_Y = canvasHeight - groundHeight_px / 2;
    const GROUND_TOP_Y    = canvasHeight - groundHeight_px;
  
    const CHART_UPDATE_EVERY = 2;
  
    const PERF = {
      dotOnlyWhilePlaying: true,
      dotHz: 30,
      maxLinePoints: 800,
    };
  
    const LINE_KEYS = ["x_t","y_t","vx_t","vy_t","Fg_t","Fn_t","ax_t","ay_t"];
  
    const GRAPH_CANVAS = {
      x_t:  "graph-x-t",
      y_t:  "graph-y-t",
      vx_t: "graph-vx-t",
      vy_t: "graph-vy-t",
      Fg_t: "graph-Fg-t",
      Fn_t: "graph-Fn-t",
      Fg_m: "graph-Fg-m",
      ax_t: "graph-ax-t",
      ay_t: "graph-ay-t",
    };
  
    const GRAPH_LABELS = {
      x_t:  { title: "x vs t", xLabel: "t (s)", yLabel: "x (m)", color: "#e74c3c" },
      y_t:  { title: "y vs t", xLabel: "t (s)", yLabel: "y (m)", color: "#3498db" },
      vx_t: { title: "vx vs t", xLabel: "t (s)", yLabel: "vx (m/s)", color: "#2ecc71" },
      vy_t: { title: "vy vs t", xLabel: "t (s)", yLabel: "vy (m/s)", color: "#9b59b6" },
      Fg_t: { title: "Fg vs t", xLabel: "t (s)", yLabel: "Fg (N)", color: "#e74c3c" },
      Fn_t: { title: "Fn vs t", xLabel: "t (s)", yLabel: "Fn (N)", color: "#2ecc71" },
      Fg_m: { title: "Fg vs m", xLabel: "m (kg)", yLabel: "Fg (N)", color: "#f39c12" },
      ax_t: { title: "ax vs t", xLabel: "t (s)", yLabel: "ax (m/s²)", color: "#e67e22" },
      ay_t: { title: "ay vs t", xLabel: "t (s)", yLabel: "ay (m/s²)", color: "#c0392b" },
    };
  
    const BASE_URL = "http://127.0.0.1:8000";
  
    // Arrow drawing constants
    const ARROW_HEAD_SIZE = 8;
    const FORCE_SCALE     = 3;   // px per N
    const VEL_SCALE       = 2;   // px per m/s
    const ACCEL_SCALE     = 6;   // px per m/s²
  
    // ── 3) State variables (lets) ──────────────────────────────────────────────
    let engine, render, runner;
    let ball, ground;
    let charts = {};
    let visibleKeys = new Set();
  
    // Simulation config (from injection or defaults)
    let cfg = {
      dropHeight_m: 10,
      launchSpeed_mps: 30,
      launchAngle_deg: 45,
      ballMass: 1,
      airEnabled: false,
      forceEnabled: true,
      velocityEnabled: false,
      motionEnabled: false,
    };
    let accelerationEnabled = false;
  
    // Runtime state
    let trajCache     = null;   // fetched series data
    let tLand         = 0;
    let tApex         = 0;
    let t_s           = 0;      // current simulation time
    let paused        = false;
    let landed        = false;
    let scrubbing     = false;
    let playbackSpeed = 1.0;
    let lastFetchTime = 0;
    let trailPoints   = [];
    let chartCounter  = 0;
    let lastDotTime   = 0;
  
    // ── 4) Apply injected config ───────────────────────────────────────────────
    function applyInjectedSimCfg() {
      const inj = window.__SIM_CFG__ || {};
      if (inj.dropHeight_m   !== undefined) cfg.dropHeight_m   = Number(inj.dropHeight_m);
      if (inj.launchSpeed_mps!== undefined) cfg.launchSpeed_mps= Number(inj.launchSpeed_mps);
      if (inj.launchAngle_deg!== undefined) cfg.launchAngle_deg= Number(inj.launchAngle_deg);
      if (inj.ballMass       !== undefined) cfg.ballMass       = Number(inj.ballMass);
      if (inj.airEnabled     !== undefined) cfg.airEnabled     = !!inj.airEnabled;
  
      // Mode exclusivity: exactly ONE of force/velocity/motion must be true
      const fE = inj.forceEnabled, vE = inj.velocityEnabled, mE = inj.motionEnabled;
      const injected = [fE, vE, mE].filter(v => v === true);
      if (injected.length === 1) {
        cfg.forceEnabled    = !!fE;
        cfg.velocityEnabled = !!vE;
        cfg.motionEnabled   = !!mE;
      } else {
        // default
        cfg.forceEnabled    = true;
        cfg.velocityEnabled = false;
        cfg.motionEnabled   = false;
      }
    }
  
    function normalizeCfg() {
      applyInjectedSimCfg();
      // Sync DOM inputs with cfg
      document.getElementById("massInput").value     = cfg.ballMass;
      document.getElementById("heightInput").value    = cfg.dropHeight_m;
      document.getElementById("velocityInput").value  = cfg.launchSpeed_mps;
      document.getElementById("angleInput").value     = cfg.launchAngle_deg;
      document.getElementById("forceCheckbox").checked        = cfg.forceEnabled;
      document.getElementById("vectorCheckbox").checked       = cfg.velocityEnabled;
      document.getElementById("motionCheckbox").checked       = cfg.motionEnabled;
      document.getElementById("accelerationCheckbox").checked = false;
      document.getElementById("airCheckbox").checked          = cfg.airEnabled;
    }
  
    // Call normalization immediately (before any Matter/Chart creation)
    normalizeCfg();
  
    // ── 5) Helper functions ────────────────────────────────────────────────────
  
    // ─── Math / conversion helpers ───
    function mToCanvasX(xm) {
      return (xm / maxRange_m) * canvasWidth;
    }
  
    function mToCanvasY(ym) {
      return GROUND_TOP_Y - (ym / maxHeight_m) * (GROUND_TOP_Y);
    }
  
    function preImpactEps() {
      return 0.001;
    }
  
    function preLandingTime() {
      return Math.max(tLand - preImpactEps(), 0);
    }
  
    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }
  
    // ─── State interpolation from series ───
    function getStateAtTime(t) {
      if (!trajCache || !trajCache.series || trajCache.series.length === 0) return null;
      const series = trajCache.series;
      if (t <= 0) return series[0];
      if (t >= tLand) return trajCache.impact || series[series.length - 1];
      // Binary search
      let lo = 0, hi = series.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (series[mid].time_s <= t) lo = mid; else hi = mid;
      }
      const s0 = series[lo], s1 = series[hi];
      if (s1.time_s === s0.time_s) return s0;
      const frac = (t - s0.time_s) / (s1.time_s - s0.time_s);
      const lerp = (a, b) => a + (b - a) * frac;
      return {
        time_s: t,
        x: lerp(s0.x, s1.x),
        y: lerp(s0.y, s1.y),
        vx: lerp(s0.vx, s1.vx),
        vy: lerp(s0.vy, s1.vy),
        ax: lerp(s0.ax, s1.ax),
        ay: lerp(s0.ay, s1.ay),
        Fg: lerp(s0.Fg, s1.Fg),
        Fn: lerp(s0.Fn, s1.Fn),
        v: lerp(s0.v, s1.v),
        onGround: s1.onGround,
        phase: s0.phase,
        y_raw: lerp(s0.y_raw, s1.y_raw),
      };
    }
  
    // ─── Fetching ───
    async function fetchTrajectorySeries() {
      const mass   = cfg.ballMass;
      const height = cfg.dropHeight_m;
      const speed  = cfg.launchSpeed_mps;
      const angle  = cfg.launchAngle_deg;
      const eps    = preImpactEps();
      const url = `${BASE_URL}/projectile_series?mass=${mass}&height=${height}&speed=${speed}&angle=${angle}&dt=0.02&eps=${eps}&g=${g}`;
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        trajCache = data;
        tLand = data.meta.t_land || 0;
        tApex = data.meta.t_apex || 0;
        ensureBoundarySamples();
        updateScrubberMax();
      } catch (e) {
        console.error("Failed to fetch trajectory series:", e);
      }
    }
  
    async function fetchSingleState(t) {
      const mass   = cfg.ballMass;
      const height = cfg.dropHeight_m;
      const speed  = cfg.launchSpeed_mps;
      const angle  = cfg.launchAngle_deg;
      const eps    = preImpactEps();
      const url = `${BASE_URL}/projectile?t=${t}&mass=${mass}&height=${height}&speed=${speed}&angle=${angle}&eps=${eps}&g=${g}`;
      try {
        const resp = await fetch(url);
        return await resp.json();
      } catch (e) {
        console.error("Failed to fetch single state:", e);
        return null;
      }
    }
  
    function ensureBoundarySamples() {
      if (!trajCache || !trajCache.series) return;
      const series = trajCache.series;
      const Fg = cfg.ballMass * g;
  
      // Guarantee t=0 exists exactly
      if (series.length === 0 || series[0].time_s > 1e-9) {
        const s0 = {
          time_s: 0, x: 0, y: cfg.dropHeight_m,
          vx: trajCache.meta.vx0, vy: trajCache.meta.vy0,
          ax: 0, ay: -g, Fg: Fg, Fn: 0, v: Math.sqrt(trajCache.meta.vx0**2 + trajCache.meta.vy0**2),
          onGround: false, phase: "flight", y_raw: cfg.dropHeight_m,
        };
        series.unshift(s0);
      }
  
      // Guarantee landing point at tLand where Fn=Fg
      // Keep pre-impact velocities so V graphs do NOT drop to 0 at tLand
      if (tLand > 0) {
        const last = series[series.length - 1];
        if (Math.abs(last.time_s - tLand) > 1e-6 || last.Fn < Fg * 0.5) {
          // Get pre-impact state to preserve velocities
          const preState = getStateAtTime(preLandingTime());
          const impactPt = {
            time_s: tLand,
            x: trajCache.meta.x_land,
            y: 0,
            vx: preState ? preState.vx : 0,
            vy: preState ? preState.vy : 0,
            ax: 0,
            ay: -g,
            Fg: Fg,
            Fn: Fg,
            v: preState ? preState.v : 0,
            onGround: true,
            phase: "impact",
            y_raw: 0,
          };
          series.push(impactPt);
        }
      }
  
      // Normalize rest snapshot: vx=vy=v=0, ax=ay=0
      if (trajCache.rest) {
        trajCache.rest.time_s = tLand;
        trajCache.rest.Fn = Fg;
        trajCache.rest.Fg = Fg;
        trajCache.rest.vx = 0;
        trajCache.rest.vy = 0;
        trajCache.rest.v  = 0;
        trajCache.rest.ax = 0;
        trajCache.rest.ay = 0;
      }
  
      // Sort series by time
      series.sort((a, b) => a.time_s - b.time_s);
    }
  
    // ─── Scrubber ───
    function updateScrubberMax() {
      const scrubber = document.getElementById("timeScrubber");
      const maxVal = Math.ceil(tLand / 0.01) * 0.01;
      scrubber.max = maxVal > 0 ? maxVal : 1;
    }
  
    function updateScrubberValue() {
      const scrubber = document.getElementById("timeScrubber");
      scrubber.value = t_s;
      document.getElementById("scrubberValue").textContent = t_s.toFixed(2) + " s";
    }
  
    let wasPausedBeforeScrub = false;
  
    function beginScrub() {
      scrubbing = true;
      wasPausedBeforeScrub = paused;
      paused = true; // internal pause, don't change button label
    }
  
    function endScrub() {
      scrubbing = false;
      const scrubber = document.getElementById("timeScrubber");
      const val = parseFloat(scrubber.value);
  
      if (val <= 0.001) {
        // Left edge: behave like restart-at-start
        t_s = 0;
        landed = false;
        trailPoints = [];
        clearAllChartData();
        const st = getStateAtTime(0);
        if (st) seedChartsAtState(st);
        paused = wasPausedBeforeScrub;
      } else if (val >= tLand - 0.01) {
        // Right edge: snap to true end
        t_s = tLand;
        landed = true;
        rebuildChartsToTime(tLand);
        paused = true;
        document.getElementById("pauseBtn").textContent = "Play";
      } else {
        t_s = val;
        landed = false;
        rebuildChartsToTime(val);
        paused = wasPausedBeforeScrub;
      }
    }
  
    function onScrubInput() {
      const scrubber = document.getElementById("timeScrubber");
      const val = parseFloat(scrubber.value);
      t_s = val;
      document.getElementById("scrubberValue").textContent = val.toFixed(2) + " s";
      // Update position immediately
      const st = getStateAtTime(val >= tLand ? preLandingTime() : val);
      if (st && ball) {
        Body.setPosition(ball, {
          x: mToCanvasX(st.x),
          y: mToCanvasY(st.y),
        });
      }
    }
  
    // ─── Charts ───
    function createLineChart(canvasId, label, xLabel, yLabel, color) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      const chart = new Chart(ctx, {
        type: "scatter",
        data: {
          datasets: [
            {
              label: label + " (line)",
              data: [],
              showLine: true,
              borderColor: color,
              backgroundColor: color + "33",
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.1,
              fill: false,
              order: 2,
            },
            {
              label: label + " (dot)",
              data: [],
              showLine: false,
              borderColor: "#fff",
              backgroundColor: color,
              pointRadius: 6,
              pointBorderWidth: 2,
              hidden: true,
              order: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: label,
              color: "#aaa",
              font: { size: 12 },
            },
          },
          scales: {
            x: {
              title: { display: true, text: xLabel, color: "#888" },
              ticks: { color: "#888", maxTicksLimit: 6 },
              grid: { color: "#333" },
            },
            y: {
              title: { display: true, text: yLabel, color: "#888" },
              ticks: { color: "#888", maxTicksLimit: 5 },
              grid: { color: "#333" },
            },
          },
        },
      });
      return chart;
    }
  
    function createAllCharts() {
      for (const [key, canvasId] of Object.entries(GRAPH_CANVAS)) {
        const info = GRAPH_LABELS[key];
        if (info) {
          charts[key] = createLineChart(canvasId, info.title, info.xLabel, info.yLabel, info.color);
        }
      }
    }
  
    function clearAllChartData() {
      for (const key of Object.keys(charts)) {
        if (!charts[key]) continue;
        charts[key].data.datasets[0].data = [];
        charts[key].data.datasets[1].data = [];
        charts[key].data.datasets[1].hidden = true;
        charts[key].update("none");
      }
    }
  
    function seedChartsAtState(st) {
      // Add a single t=0 point to each visible chart line
      pushStateToCharts(st);
      updateChartsDisplay();
    }
  
    function pushStateToCharts(st) {
      if (!st) return;
      const t = st.time_s;
      const Fg = st.Fg;
      const mass = cfg.ballMass;
  
      const vals = {
        x_t:  { x: t, y: st.x },
        y_t:  { x: t, y: st.y },
        vx_t: { x: t, y: st.vx },
        vy_t: { x: t, y: st.vy },
        Fg_t: { x: t, y: Fg },
        Fn_t: { x: t, y: st.Fn },
        Fg_m: { x: mass, y: Fg },
        ax_t: { x: t, y: st.ax },
        ay_t: { x: t, y: st.ay },
      };
  
      for (const key of Object.keys(vals)) {
        if (charts[key] && visibleKeys.has(key)) {
          const ds = charts[key].data.datasets[0].data;
          // Enforce max line points
          if (ds.length >= PERF.maxLinePoints) {
            // Thin by removing every other point
            charts[key].data.datasets[0].data = ds.filter((_, i) => i % 2 === 0);
          }
          charts[key].data.datasets[0].data.push(vals[key]);
        }
      }
    }
  
    function setMovingDotAtState(st) {
      if (!st) return;
      const t = st.time_s;
      const Fg = st.Fg;
      const mass = cfg.ballMass;
  
      // At tLand, Fn should snap to Fg
      let Fn = st.Fn;
      if (landed || t >= tLand) {
        Fn = Fg;
      }
  
      const vals = {
        x_t:  { x: t, y: st.x },
        y_t:  { x: t, y: st.y },
        vx_t: { x: t, y: st.vx },
        vy_t: { x: t, y: st.vy },
        Fg_t: { x: t, y: Fg },
        Fn_t: { x: t, y: Fn },
        Fg_m: { x: mass, y: Fg },
        ax_t: { x: t, y: st.ax },
        ay_t: { x: t, y: st.ay },
      };
  
      for (const key of Object.keys(vals)) {
        if (charts[key] && visibleKeys.has(key)) {
          charts[key].data.datasets[1].data = [vals[key]];
          charts[key].data.datasets[1].hidden = false;
        }
      }
    }
  
    function updateChartsDisplay() {
      for (const key of Object.keys(charts)) {
        if (charts[key] && visibleKeys.has(key)) {
          charts[key].update("none");
        }
      }
    }
  
    function rebuildChartsToTime(targetT) {
      if (!trajCache || !trajCache.series) return;
      clearAllChartData();
      const series = trajCache.series;
      for (const st of series) {
        if (st.time_s > targetT + 1e-9) break;
        pushStateToCharts(st);
      }
      // Also push exact target if between samples
      const exact = getStateAtTime(targetT);
      if (exact) {
        pushStateToCharts(exact);
        setMovingDotAtState(exact);
      }
      updateChartsDisplay();
    }
  
    // ─── Graph visibility ───
    function updateGraphVisibility() {
      let showSet = new Set();
  
      if (cfg.forceEnabled) {
        showSet = new Set(["Fg_t", "Fn_t", "Fg_m"]);
      } else if (cfg.velocityEnabled) {
        showSet = new Set(["vx_t", "vy_t"]);
      } else if (cfg.motionEnabled) {
        showSet = new Set(["x_t", "y_t", "vx_t", "vy_t", "ax_t", "ay_t"]);
      } else if (accelerationEnabled) {
        showSet = new Set(["ax_t", "ay_t"]);
      }
  
      visibleKeys = showSet;
  
      // Toggle wrap visibility
      for (const [key, canvasId] of Object.entries(GRAPH_CANVAS)) {
        const wrap = document.getElementById("wrap-" + canvasId.replace("graph-", ""));
        if (wrap) {
          wrap.classList.toggle("visible", showSet.has(key));
        }
      }
  
      // Toggle legend sections
      document.getElementById("keyForces").style.display   = cfg.forceEnabled ? "" : "none";
      document.getElementById("keyVelocity").style.display  = cfg.velocityEnabled ? "" : "none";
      document.getElementById("keyMotion").style.display    = cfg.motionEnabled ? "" : "none";
  
      // Air row only visible in force mode with air enabled
      document.getElementById("keyRowFd").style.display = (cfg.forceEnabled && cfg.airEnabled) ? "" : "none";
    }
  
    // ─── Canvas overlay drawing helpers ───
    function drawArrow(ctx, fromX, fromY, toX, toY, color, lineWidth, dashed) {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) return;
  
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lineWidth || 2;
      if (dashed) ctx.setLineDash(dashed);
  
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
  
      // Arrowhead
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - ARROW_HEAD_SIZE * Math.cos(angle - Math.PI / 6), toY - ARROW_HEAD_SIZE * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - ARROW_HEAD_SIZE * Math.cos(angle + Math.PI / 6), toY - ARROW_HEAD_SIZE * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
  
      ctx.restore();
    }
  
    function drawLabel(ctx, text, x, y, color, fontSize) {
      ctx.save();
      ctx.fillStyle = color || "#fff";
      ctx.font = (fontSize || 11) + "px sans-serif";
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  
    function drawDot(ctx, x, y, radius, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  
    // ─── Special-case label helpers ───
    function getStartLabel() {
      const angle = cfg.launchAngle_deg;
      const height = cfg.dropHeight_m;
      if (height > 0 && angle === 0) return "Drop";
      if (angle === 90) return "Vertical Launch";
      return "Start";
    }
  
    function getEndLabel() {
      return "Land";
    }
  
    // ─── Trail management ───
    function addTrailPoint(px, py) {
      if (trailPoints.length > 0) {
        const last = trailPoints[trailPoints.length - 1];
        const dx = px - last.x;
        const dy = py - last.y;
        if (dx * dx + dy * dy < TRAIL_MIN_DIST_PX * TRAIL_MIN_DIST_PX) return;
      }
      trailPoints.push({ x: px, y: py });
      if (trailPoints.length > TRAIL_MAX_POINTS) trailPoints.shift();
    }
  
    function drawTrail(ctx) {
      if (trailPoints.length < 2) return;
      ctx.save();
      ctx.strokeStyle = "#e67e22";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(trailPoints[0].x, trailPoints[0].y);
      for (let i = 1; i < trailPoints.length; i++) {
        ctx.lineTo(trailPoints[i].x, trailPoints[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  
    // ─── Background grid ───
    function drawGrid(ctx) {
      ctx.save();
      ctx.strokeStyle = "#1a2a3a";
      ctx.lineWidth = 0.5;
      const step = 50;
      for (let x = 0; x <= canvasWidth; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GROUND_TOP_Y);
        ctx.stroke();
      }
      for (let y = 0; y <= GROUND_TOP_Y; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  
    // ─── Overlay dots for start/apex/end ───
    function drawLandmarkDots(ctx, st) {
      if (!trajCache) return;
      const events = trajCache.events;
      if (!events) return;
  
      // Start dot
      if (events.start) {
        const sx = mToCanvasX(events.start.x);
        const sy = mToCanvasY(events.start.y);
        drawDot(ctx, sx, sy, 5, "#2ecc71");
        drawLabel(ctx, getStartLabel(), sx + 8, sy - 8, "#2ecc71", 11);
      }
  
      // Apex dot (only if there's a real apex)
      if (tApex > 0 && events.apex) {
        const ax = mToCanvasX(events.apex.x);
        const ay = mToCanvasY(events.apex.y);
        drawDot(ctx, ax, ay, 5, "#f1c40f");
        drawLabel(ctx, "Apex", ax + 8, ay - 8, "#f1c40f", 11);
      }
  
      // End dot
      if (tLand > 0 && events.impact) {
        const ex = mToCanvasX(events.impact.x);
        const ey = mToCanvasY(0);
        drawDot(ctx, ex, ey, 5, "#e74c3c");
        drawLabel(ctx, getEndLabel(), ex + 8, ey - 8, "#e74c3c", 11);
      }
    }
  
    // ─── Force arrows ───
    function drawForceArrows(ctx, st, ballX, ballY) {
      if (!st) return;
      const Fg = st.Fg;
      const Fn = st.Fn;
  
      // Fg always (downward)
      drawArrow(ctx, ballX, ballY, ballX, ballY + Fg * FORCE_SCALE, "#e74c3c", 2.5);
      drawLabel(ctx, `Fg=${Fg.toFixed(1)}N`, ballX + 10, ballY + Fg * FORCE_SCALE + 4, "#e74c3c");
  
      // Fn only when on ground / at end / right-edge scrub
      const shouldShowFn = st.onGround || landed || (t_s >= tLand - 0.02);
      if (shouldShowFn && Fn > 0) {
        drawArrow(ctx, ballX, ballY, ballX, ballY - Fn * FORCE_SCALE, "#2ecc71", 2.5);
        drawLabel(ctx, `Fn=${Fn.toFixed(1)}N`, ballX + 10, ballY - Fn * FORCE_SCALE - 4, "#2ecc71");
      }
  
      // Air drag triangle (visual only)
      if (cfg.airEnabled && !st.onGround) {
        const v = st.v || 0;
        if (v > 0.1) {
          const dragMag = 0.5 * 0.47 * 1.225 * Math.PI * 0.05 * 0.05 * v * v; // rough visual
          const vx = st.vx || 0;
          const vy = st.vy || 0;
          const Fdx = -(vx / v) * dragMag * FORCE_SCALE;
          const Fdy = -(vy / v) * dragMag * FORCE_SCALE;
          // Fd vector
          drawArrow(ctx, ballX, ballY, ballX + Fdx, ballY - Fdy, "#f39c12", 2, [3, 3]);
          drawLabel(ctx, "Fd", ballX + Fdx + 4, ballY - Fdy, "#f39c12");
          // Fdx component
          drawArrow(ctx, ballX, ballY, ballX + Fdx, ballY, "#f39c12", 1, [2, 2]);
          // Fdy component
          drawArrow(ctx, ballX + Fdx, ballY, ballX + Fdx, ballY - Fdy, "#f39c12", 1, [2, 2]);
        }
      }
    }
  
    // ─── Velocity arrows ───
    function drawVelocityArrows(ctx, st, ballX, ballY) {
      if (!st) return;
      const vx = st.vx || 0;
      const vy = st.vy || 0;
      const v  = st.v  || 0;
  
      // Vx (horizontal)
      if (Math.abs(vx) > 0.01) {
        drawArrow(ctx, ballX, ballY, ballX + vx * VEL_SCALE, ballY, "#3498db", 2);
        drawLabel(ctx, `Vx=${vx.toFixed(1)}`, ballX + vx * VEL_SCALE + 4, ballY - 4, "#3498db");
      }
  
      // Vy (upward positive in physics, but canvas Y inverted)
      if (Math.abs(vy) > 0.01) {
        drawArrow(ctx, ballX, ballY, ballX, ballY - vy * VEL_SCALE, "#9b59b6", 2);
        drawLabel(ctx, `Vy=${vy.toFixed(1)}`, ballX + 4, ballY - vy * VEL_SCALE - 4, "#9b59b6");
      }
  
      // Resultant V
      if (v > 0.1) {
        drawArrow(ctx, ballX, ballY, ballX + vx * VEL_SCALE, ballY - vy * VEL_SCALE, "#1abc9c", 2.5);
        drawLabel(ctx, `V=${v.toFixed(1)}`, ballX + vx * VEL_SCALE + 4, ballY - vy * VEL_SCALE - 4, "#1abc9c");
      }
    }
  
    // ─── Motion mode: coordinate arrows ───
    function drawMotionArrows(ctx, st, ballX, ballY) {
      if (!st) return;
      // Dashed x-coordinate line from Y axis to ball
      if (st.x > 0.01) {
        ctx.save();
        ctx.strokeStyle = "#3498db";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, ballY);
        ctx.lineTo(ballX, ballY);
        ctx.stroke();
        ctx.restore();
      }
      // Dashed y-coordinate line from ground to ball
      if (st.y > 0.01) {
        ctx.save();
        ctx.strokeStyle = "#3498db";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(ballX, GROUND_TOP_Y);
        ctx.lineTo(ballX, ballY);
        ctx.stroke();
        ctx.restore();
      }
    }
  
    // ─── Acceleration arrows ───
    function drawAccelerationArrows(ctx, st, ballX, ballY) {
      if (!st) return;
      const ay = st.ay || 0;
      // ay arrow down (negative ay means downward on canvas means +y in canvas)
      if (Math.abs(ay) > 0.01) {
        drawArrow(ctx, ballX, ballY, ballX, ballY - ay * ACCEL_SCALE, "#c0392b", 2.5);
        drawLabel(ctx, `ay=${ay.toFixed(1)}`, ballX + 10, ballY - ay * ACCEL_SCALE, "#c0392b");
      }
    }
  
    // ─── Speed button helpers ───
    function setPlaybackSpeed(speed) {
      playbackSpeed = speed;
      if (engine) {
        engine.timing.timeScale = speed;
      }
      document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.classList.toggle("active", parseFloat(btn.dataset.speed) === speed);
      });
    }
  
    // ─── Playback control helpers ───
    function doPause() {
      paused = true;
      document.getElementById("pauseBtn").textContent = "Play";
    }
  
    function doPlay() {
      if (landed) return; // can't play if already landed
      paused = false;
      document.getElementById("pauseBtn").textContent = "Pause";
    }
  
    function togglePause() {
      if (paused) doPlay();
      else doPause();
    }
  
    // ─── Freeze Frame Buttons ───
    function frameStart() {
      t_s = 0;
      landed = false;
      trailPoints = [];
      clearAllChartData();
      const st = getStateAtTime(0);
      if (st) {
        seedChartsAtState(st);
        setMovingDotAtState(st);
      }
      doPause();
      updateScrubberValue();
      updateChartsDisplay();
    }
  
    function frameApex() {
      if (tApex <= 0) return;
      landed = false;
      trailPoints = [];
      rebuildChartsToTime(tApex);
      t_s = tApex;
      doPause();
      updateScrubberValue();
    }
  
    function frameEnd() {
      t_s = tLand;
      landed = true;
      trailPoints = [];
      rebuildChartsToTime(tLand);
      doPause();
      updateScrubberValue();
  
      // Mark landed: Fn shown
      if (trajCache && trajCache.impact) {
        setMovingDotAtState(trajCache.impact);
        updateChartsDisplay();
      }
    }
  
    // ─── Restart ───
    async function doRestart() {
      // Hard reset
      document.getElementById("pauseBtn").textContent = "Pause";
      paused = false;
      landed = false;
      t_s = 0;
      trailPoints = [];
      chartCounter = 0;
  
      // Read current param values from DOM
      cfg.ballMass        = parseFloat(document.getElementById("massInput").value) || 1;
      cfg.dropHeight_m    = parseFloat(document.getElementById("heightInput").value) || 0;
      cfg.launchSpeed_mps = parseFloat(document.getElementById("velocityInput").value) || 0;
      cfg.launchAngle_deg = parseFloat(document.getElementById("angleInput").value) || 45;
  
      // Re-fetch series
      await fetchTrajectorySeries();
  
      // Reset charts, then seed t=0
      clearAllChartData();
      const st = getStateAtTime(0);
      if (st) seedChartsAtState(st);
      updateScrubberValue();
      updateChartsDisplay();
    }
  
    // ─── Mode toggle logic ───
    function setExclusiveMode(mode) {
      cfg.forceEnabled    = mode === "force";
      cfg.velocityEnabled = mode === "velocity";
      cfg.motionEnabled   = mode === "motion";
      accelerationEnabled = mode === "acceleration";
  
      document.getElementById("forceCheckbox").checked        = cfg.forceEnabled;
      document.getElementById("vectorCheckbox").checked       = cfg.velocityEnabled;
      document.getElementById("motionCheckbox").checked       = cfg.motionEnabled;
      document.getElementById("accelerationCheckbox").checked = accelerationEnabled;
  
      // Air checkbox only meaningful in force mode
      const airCb = document.getElementById("airCheckbox");
      airCb.disabled = !cfg.forceEnabled;
  
      updateGraphVisibility();
    }
  
    // ─── 6) beforeUpdate handler ───────────────────────────────────────────────
    function beforeUpdateHandler() {
      if (paused || landed || !trajCache) return;
  
      // Advance time
      const dtMs = engine.timing.lastDelta || 16.67;
      const dtSec = (dtMs / 1000) * playbackSpeed;
      t_s += dtSec;
  
      if (t_s >= tLand) {
        t_s = tLand;
        landed = true;
        doPause();
      }
  
      // Get state and position ball
      const displayT = landed ? preLandingTime() : t_s;
      const st = getStateAtTime(displayT);
      if (st && ball) {
        const px = mToCanvasX(st.x);
        const py = mToCanvasY(st.y);
        Body.setPosition(ball, { x: px, y: py });
  
        // Trail
        if (cfg.motionEnabled) {
          addTrailPoint(px, py);
        }
  
        // Chart data (throttled)
        chartCounter++;
        if (chartCounter % CHART_UPDATE_EVERY === 0) {
          pushStateToCharts(st);
  
          // If landed, push the impact point for Fn snap
          if (landed && trajCache.impact) {
            pushStateToCharts(trajCache.impact);
          }
  
          setMovingDotAtState(st);
          updateChartsDisplay();
        }
      }
  
      updateScrubberValue();
    }
  
    // ─── 7) afterRender handler ────────────────────────────────────────────────
    function afterRenderHandler() {
      const canvas = render.canvas;
      const ctx = canvas.getContext("2d");
  
      // Grid
      drawGrid(ctx);
  
      // Landmark dots
      drawLandmarkDots(ctx);
  
      // Current state
      const displayT = (landed && t_s >= tLand) ? preLandingTime() : t_s;
      const st = getStateAtTime(displayT);
      if (!st || !ball) return;
  
      const ballX = ball.position.x;
      const ballY = ball.position.y;
  
      // Mode-specific overlays
      if (cfg.forceEnabled) {
        // At end/landed, use impact state for Fn
        if (landed || t_s >= tLand) {
          const impSt = Object.assign({}, st, { Fn: st.Fg, onGround: true });
          drawForceArrows(ctx, impSt, ballX, ballY);
        } else {
          drawForceArrows(ctx, st, ballX, ballY);
        }
      }
  
      if (cfg.velocityEnabled) {
        drawVelocityArrows(ctx, st, ballX, ballY);
      }
  
      if (cfg.motionEnabled) {
        drawTrail(ctx);
        drawMotionArrows(ctx, st, ballX, ballY);
      }
  
      if (accelerationEnabled) {
        drawAccelerationArrows(ctx, st, ballX, ballY);
      }
  
      // Time label
      drawLabel(ctx, `t = ${t_s.toFixed(2)} s`, 10, 20, "#aaa", 13);
    }
  
    // ─── 8) initRun() — THE ONLY place that creates engine/render/runner ──────
    async function initRun() {
      // Create engine (gravity.y = 0 since backend controls motion)
      engine = Engine.create();
      engine.gravity.y = 0;
  
      // Create render
      render = Render.create({
        element: document.getElementById("scene"),
        engine: engine,
        options: {
          width: canvasWidth,
          height: canvasHeight,
          wireframes: false,
          background: "#0f0f23",
        },
      });
  
      // Create runner
      runner = Runner.create();
  
      // Create bodies
      const startX = mToCanvasX(0);
      const startY = mToCanvasY(cfg.dropHeight_m);
  
      ball = Bodies.circle(startX, startY, ballRadius, {
        isStatic: true,
        render: {
          fillStyle: "#3498db",
          strokeStyle: "#2980b9",
          lineWidth: 2,
        },
      });
  
      ground = Bodies.rectangle(canvasWidth / 2, GROUND_CENTER_Y, canvasWidth, groundHeight_px, {
        isStatic: true,
        render: {
          fillStyle: "#2c3e50",
          strokeStyle: "#34495e",
          lineWidth: 1,
        },
      });
  
      World.add(engine.world, [ball, ground]);
  
      // Create charts
      createAllCharts();
      updateGraphVisibility();
  
      // Bind Matter events
      Events.on(engine, "beforeUpdate", beforeUpdateHandler);
      Events.on(render, "afterRender", afterRenderHandler);
  
      // Start render and runner
      Render.run(render);
      Runner.run(runner, engine);
  
      // Fetch initial trajectory
      await fetchTrajectorySeries();
  
      // Seed charts at t=0
      const st = getStateAtTime(0);
      if (st) seedChartsAtState(st);
      updateChartsDisplay();
      updateScrubberValue();
  
      // ─── DOM event bindings ───
  
      // Pause/Play
      document.getElementById("pauseBtn").addEventListener("click", togglePause);
  
      // Restart
      document.getElementById("restartBtn").addEventListener("click", doRestart);
  
      // Freeze frame buttons
      document.getElementById("frameStartBtn").addEventListener("click", frameStart);
      document.getElementById("frameApexBtn").addEventListener("click", frameApex);
      document.getElementById("frameEndBtn").addEventListener("click", frameEnd);
  
      // Mode checkboxes (exclusive)
      document.getElementById("forceCheckbox").addEventListener("change", () => setExclusiveMode("force"));
      document.getElementById("vectorCheckbox").addEventListener("change", () => setExclusiveMode("velocity"));
      document.getElementById("motionCheckbox").addEventListener("change", () => setExclusiveMode("motion"));
      document.getElementById("accelerationCheckbox").addEventListener("change", () => setExclusiveMode("acceleration"));
  
      // Air checkbox
      document.getElementById("airCheckbox").addEventListener("change", (e) => {
        cfg.airEnabled = e.target.checked;
        document.getElementById("keyRowFd").style.display = (cfg.forceEnabled && cfg.airEnabled) ? "" : "none";
      });
  
      // Speed buttons
      document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          setPlaybackSpeed(parseFloat(btn.dataset.speed));
        });
      });
  
      // Scrubber events
      const scrubber = document.getElementById("timeScrubber");
  
      scrubber.addEventListener("pointerdown", beginScrub);
      scrubber.addEventListener("mousedown", beginScrub);
      scrubber.addEventListener("touchstart", beginScrub, { passive: true });
  
      scrubber.addEventListener("input", onScrubInput);
  
      scrubber.addEventListener("pointerup", endScrub);
      scrubber.addEventListener("mouseup", endScrub);
      scrubber.addEventListener("touchend", endScrub);
  
      // Parameter inputs: restart on change
      ["massInput", "heightInput", "velocityInput", "angleInput"].forEach(id => {
        document.getElementById(id).addEventListener("change", doRestart);
      });
    }
  
    // ── LAUNCH ─────────────────────────────────────────────────────────────────
    initRun();
  
  });
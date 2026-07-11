/**
 * projectile.js — Full projectile simulation with Matter.js rendering,
 * Chart.js graphs, backend-driven physics, and interactive controls.
 */
window.addEventListener("DOMContentLoaded", () => {
    "use strict";
  
    // ══════════════════════════════════════════════════════════════════════
    // 1) Matter destructure
    // ══════════════════════════════════════════════════════════════════════
    const { Engine, Render, Runner, World, Bodies, Body, Events } = Matter;
  
    // ══════════════════════════════════════════════════════════════════════
    // 2) Constants (before any lets)
    // ══════════════════════════════════════════════════════════════════════
    const canvasWidth = 800;
    const canvasHeight = 700;
    const g = 9.81;
    const groundHeight_px = 40;
    const ballRadius = 10;
    const maxRange_m = 1200;
    const maxHeight_m = 650;
    const FETCH_INTERVAL = 200;
    const TRAIL_MAX_POINTS = 600;
    const TRAIL_MIN_DIST_PX = 3;
    const GROUND_CENTER_Y = canvasHeight - groundHeight_px / 2;
    const GROUND_TOP_Y = canvasHeight - groundHeight_px;
    const CHART_UPDATE_EVERY = 2;
    const BASE_URL = "http://127.0.0.1:8000";
  
    const PERF = {
      dotOnlyWhilePlaying: true,
      dotHz: 30,
      maxLinePoints: 800,
    };
  
    const LINE_KEYS = [
      "x_t", "y_t", "vx_t", "vy_t", "Fg_t", "Fn_t", "ax_t", "ay_t"
    ];
  
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
  
    // Arrow / vector colors
    const COLORS = {
      Fg: "#ef4444",
      Fn: "#22c55e",
      Fd: "#f97316",
      Fdx: "#fb923c",
      Fdy: "#fbbf24",
      Vx: "#3b82f6",
      Vy: "#a855f7",
      V:  "#eab308",
      trail: "#f472b6",
      coord: "#38bdf8",
      accel: "#f59e0b",
      startDot: "#4ade80",
      apexDot: "#facc15",
      endDot: "#ef4444",
    };
  
    // ══════════════════════════════════════════════════════════════════════
    // 3) Lets — state variables
    // ══════════════════════════════════════════════════════════════════════
    let engine, render, runner;
    let ball, ground;
  
    // Sim config (set from __SIM_CFG__)
    let cfg = {
      dropHeight_m: 50,
      launchSpeed_mps: 30,
      launchAngle_deg: 45,
      ballMass: 1,
      airEnabled: false,
      forceEnabled: true,
      velocityEnabled: false,
      motionEnabled: false,
    };
    let accelerationEnabled = false; // UI-only
  
    // Runtime state
    let paused = false;
    let scrubbing = false;
    let scrubPausedBefore = false;
    let landed = false;
    let t_s = 0;
    let playbackSpeed = 1.0;
    let frameCounter = 0;
    let chartCounter = 0;
    let lastFetchTime = -Infinity;
  
    // Trajectory cache
    let trajCache = null; // { meta, series, impact, rest, events }
    let tLand = 5;
    let tApex = 0;
  
    // Trail
    let trailPoints = [];
  
    // Charts
    let charts = {};    // key => Chart instance
    let visibleKeys = new Set();
  
    // Current state snapshot (for overlays)
    let currentState = null;
  
    // ══════════════════════════════════════════════════════════════════════
    // 4) Apply injected config — BEFORE Matter/Chart creation
    // ══════════════════════════════════════════════════════════════════════
    function applyInjectedSimCfg() {
      const raw = window.__SIM_CFG__ || {};
      if (raw.dropHeight_m !== undefined) cfg.dropHeight_m = Number(raw.dropHeight_m);
      if (raw.launchSpeed_mps !== undefined) cfg.launchSpeed_mps = Number(raw.launchSpeed_mps);
      if (raw.launchAngle_deg !== undefined) cfg.launchAngle_deg = Number(raw.launchAngle_deg);
      if (raw.ballMass !== undefined) cfg.ballMass = Number(raw.ballMass);
      if (raw.airEnabled !== undefined) cfg.airEnabled = !!raw.airEnabled;
  
      // Enforce mode exclusivity: exactly ONE of force/velocity/motion
      const f = raw.forceEnabled, v = raw.velocityEnabled, m = raw.motionEnabled;
      const count = [f, v, m].filter(x => x === true).length;
      if (count === 1) {
        cfg.forceEnabled = !!f;
        cfg.velocityEnabled = !!v;
        cfg.motionEnabled = !!m;
      } else {
        // default
        cfg.forceEnabled = true;
        cfg.velocityEnabled = false;
        cfg.motionEnabled = false;
      }
    }
  
    function syncDOMFromCfg() {
      document.getElementById("massInput").value = cfg.ballMass;
      document.getElementById("heightInput").value = cfg.dropHeight_m;
      document.getElementById("velocityInput").value = cfg.launchSpeed_mps;
      document.getElementById("angleInput").value = cfg.launchAngle_deg;
      document.getElementById("forceCheckbox").checked = cfg.forceEnabled;
      document.getElementById("vectorCheckbox").checked = cfg.velocityEnabled;
      document.getElementById("motionCheckbox").checked = cfg.motionEnabled;
      document.getElementById("accelerationCheckbox").checked = false;
      document.getElementById("airCheckbox").checked = cfg.airEnabled;
    }
  
    applyInjectedSimCfg();
  
    // ══════════════════════════════════════════════════════════════════════
    // 5) Helper functions — all above initRun()
    // ══════════════════════════════════════════════════════════════════════
  
    // ── Coordinate helpers ────────────────────────────────────────────────
    function mToPixelX(x_m) {
      return (x_m / maxRange_m) * canvasWidth;
    }
    function mToPixelY(y_m) {
      return GROUND_TOP_Y - (y_m / maxHeight_m) * (GROUND_TOP_Y);
    }
    function ballPixelPos(st) {
      return {
        px: mToPixelX(st.x),
        py: mToPixelY(st.y),
      };
    }
  
    // ── Pre-impact helpers ────────────────────────────────────────────────
    function preImpactEps() {
      return 0.001;
    }
    function preLandingTime() {
      return Math.max(tLand - preImpactEps(), 0);
    }
  
    // ── Interpolate from series ───────────────────────────────────────────
    function interpStateAtTime(t) {
      if (!trajCache || !trajCache.series || trajCache.series.length === 0) return null;
      const s = trajCache.series;
      if (t <= s[0].time_s) return { ...s[0] };
      if (t >= s[s.length - 1].time_s) return { ...s[s.length - 1] };
      // Binary search
      let lo = 0, hi = s.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (s[mid].time_s <= t) lo = mid; else hi = mid;
      }
      const a = s[lo], b = s[hi];
      const dt = b.time_s - a.time_s;
      if (dt < 1e-12) return { ...a };
      const f = (t - a.time_s) / dt;
      const lerp = (va, vb) => va + (vb - va) * f;
      return {
        time_s: t,
        x: lerp(a.x, b.x),
        y: lerp(a.y, b.y),
        y_raw: lerp(a.y_raw, b.y_raw),
        vx: lerp(a.vx, b.vx),
        vy: lerp(a.vy, b.vy),
        ax: lerp(a.ax, b.ax),
        ay: lerp(a.ay, b.ay),
        Fg: lerp(a.Fg, b.Fg),
        Fn: lerp(a.Fn, b.Fn),
        v: lerp(a.v, b.v),
        onGround: t >= tLand ? true : a.onGround,
        phase: t >= tLand ? "impact" : a.phase,
      };
    }
  
    // ── Backend fetch ─────────────────────────────────────────────────────
    async function fetchTrajectorySeries() {
      const mass = cfg.ballMass;
      const height = cfg.dropHeight_m;
      const speed = cfg.launchSpeed_mps;
      const angle = cfg.launchAngle_deg;
      const url = `${BASE_URL}/projectile_series?mass=${mass}&height=${height}&speed=${speed}&angle=${angle}&dt=0.02&eps=${preImpactEps()}&g=${g}`;
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        trajCache = data;
        tLand = data.meta.t_land;
        tApex = data.meta.t_apex;
        ensureBoundarySamples();
        updateScrubberBounds();
      } catch (e) {
        console.error("fetchTrajectorySeries error:", e);
      }
    }
  
    async function fetchPointState(t) {
      const mass = cfg.ballMass;
      const height = cfg.dropHeight_m;
      const speed = cfg.launchSpeed_mps;
      const angle = cfg.launchAngle_deg;
      const url = `${BASE_URL}/projectile?t=${t}&mass=${mass}&height=${height}&speed=${speed}&angle=${angle}&eps=${preImpactEps()}&g=${g}`;
      try {
        const resp = await fetch(url);
        return await resp.json();
      } catch (e) {
        console.error("fetchPointState error:", e);
        return null;
      }
    }
  
    function ensureBoundarySamples() {
      if (!trajCache || !trajCache.series) return;
      const s = trajCache.series;
  
      // Guarantee t=0 exists
      if (s.length === 0 || s[0].time_s > 0.0001) {
        const start = trajCache.events ? trajCache.events.start : null;
        if (start) s.unshift({ ...start, time_s: 0 });
      }
  
      // Guarantee landing point at tLand with Fn=Fg and pre-impact velocities
      const last = s[s.length - 1];
      if (Math.abs(last.time_s - tLand) > 0.0001 || last.Fn < last.Fg * 0.5) {
        // Find the pre-impact state to get velocities
        let preImpact = interpStateAtTime(preLandingTime());
        if (!preImpact) preImpact = last;
        s.push({
          time_s: tLand,
          x: preImpact.x,
          y: 0,
          y_raw: 0,
          vx: preImpact.vx,
          vy: preImpact.vy,
          ax: 0,
          ay: -g,
          Fg: preImpact.Fg,
          Fn: preImpact.Fg,
          v: preImpact.v,
          onGround: true,
          phase: "impact",
        });
      }
  
      // Sort by time
      s.sort((a, b) => a.time_s - b.time_s);
  
      // Normalize rest snapshot
      if (trajCache.rest) {
        trajCache.rest.time_s = tLand;
        trajCache.rest.Fn = trajCache.rest.Fg;
        trajCache.rest.vx = 0;
        trajCache.rest.vy = 0;
        trajCache.rest.v = 0;
        trajCache.rest.ax = 0;
        trajCache.rest.ay = 0;
      }
    }
  
    // ── Scrubber ──────────────────────────────────────────────────────────
    function updateScrubberBounds() {
      const scrubber = document.getElementById("timeScrubber");
      const maxVal = Math.ceil(tLand / 0.01) * 0.01;
      scrubber.max = maxVal.toFixed(2);
      scrubber.min = "0";
    }
  
    function beginScrub() {
      scrubbing = true;
      scrubPausedBefore = paused;
      paused = true; // pause internally without changing label
    }
  
    function endScrub() {
      scrubbing = false;
      const scrubber = document.getElementById("timeScrubber");
      const val = parseFloat(scrubber.value);
  
      if (val <= 0.005) {
        // Left edge: restart-at-start
        paused = scrubPausedBefore;
        doRestart();
        return;
      }
  
      const maxVal = parseFloat(scrubber.max);
      if (val >= maxVal - 0.005) {
        // Right edge: snap to end
        scrubber.value = scrubber.max;
        t_s = tLand;
        const endVisual = interpStateAtTime(preLandingTime());
        currentState = endVisual;
        landed = true;
        rebuildChartsUpTo(tLand);
        showLandedState();
        paused = true;
        return;
      }
  
      // Normal scrub release: stay paused or resume
      paused = scrubPausedBefore;
    }
  
    function onScrubInput() {
      const val = parseFloat(document.getElementById("timeScrubber").value);
      t_s = val;
      const st = interpStateAtTime(val);
      if (st) {
        currentState = st;
        updateBallPosition(st);
        setMovingDotAtState(st);
        updateInfoPanel(st);
      }
    }
  
    // ── Charts ────────────────────────────────────────────────────────────
    function stateToChartPoint(key, st) {
      const t = st.time_s;
      switch (key) {
        case "x_t":  return { x: t, y: st.x };
        case "y_t":  return { x: t, y: st.y };
        case "vx_t": return { x: t, y: st.vx };
        case "vy_t": return { x: t, y: st.vy };
        case "Fg_t": return { x: t, y: st.Fg };
        case "Fn_t": return { x: t, y: st.Fn };
        case "ax_t": return { x: t, y: st.ax };
        case "ay_t": return { x: t, y: st.ay };
        case "Fg_m": return { x: cfg.ballMass, y: st.Fg };
        default: return { x: t, y: 0 };
      }
    }
  
    const CHART_COLORS = {
      x_t: "#3b82f6", y_t: "#22c55e", vx_t: "#3b82f6", vy_t: "#a855f7",
      Fg_t: "#ef4444", Fn_t: "#22c55e", Fg_m: "#ef4444",
      ax_t: "#f59e0b", ay_t: "#ef4444",
    };
  
    const CHART_LABELS = {
      x_t: "x(t)", y_t: "y(t)", vx_t: "vx(t)", vy_t: "vy(t)",
      Fg_t: "Fg(t)", Fn_t: "Fn(t)", Fg_m: "Fg(m)",
      ax_t: "ax(t)", ay_t: "ay(t)",
    };
  
    function createLineChart(canvasId, key) {
      const ctx = document.getElementById(canvasId);
      if (!ctx) return null;
      const color = CHART_COLORS[key] || "#fff";
      const label = CHART_LABELS[key] || key;
      const isVsM = key === "Fg_m";
      return new Chart(ctx, {
        type: "scatter",
        data: {
          datasets: [
            {
              label: label,
              data: [],
              showLine: true,
              borderColor: color,
              backgroundColor: color + "33",
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0,
              order: 2,
            },
            {
              label: label + " dot",
              data: [],
              showLine: false,
              borderColor: "#fff",
              backgroundColor: color,
              pointRadius: 5,
              pointBorderWidth: 1.5,
              order: 1,
              hidden: true,
            },
          ],
        },
        options: {
          responsive: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              type: "linear",
              title: { display: true, text: isVsM ? "mass (kg)" : "t (s)", color: "#8892a4", font: { size: 10 } },
              ticks: { color: "#8892a4", font: { size: 9 } },
              grid: { color: "#2a3a5e44" },
            },
            y: {
              type: "linear",
              title: { display: true, text: label, color: "#8892a4", font: { size: 10 } },
              ticks: { color: "#8892a4", font: { size: 9 } },
              grid: { color: "#2a3a5e44" },
            },
          },
        },
      });
    }
  
    function createAllCharts() {
      charts = {};
      for (const [key, canvasId] of Object.entries(GRAPH_CANVAS)) {
        charts[key] = createLineChart(canvasId, key);
      }
    }
  
    function clearAllCharts() {
      for (const key of Object.keys(charts)) {
        if (!charts[key]) continue;
        charts[key].data.datasets[0].data = [];
        charts[key].data.datasets[1].data = [];
        charts[key].data.datasets[1].hidden = true;
        charts[key].update("none");
      }
    }
  
    function seedChartsAtT0(st) {
      for (const key of Object.keys(charts)) {
        if (!charts[key]) continue;
        const pt = stateToChartPoint(key, st);
        charts[key].data.datasets[0].data = [pt];
        charts[key].update("none");
      }
    }
  
    function appendChartPoint(st) {
      for (const key of visibleKeys) {
        if (!charts[key]) continue;
        const ds = charts[key].data.datasets[0];
        if (ds.data.length >= PERF.maxLinePoints) continue;
        ds.data.push(stateToChartPoint(key, st));
      }
      chartCounter++;
      if (chartCounter % CHART_UPDATE_EVERY === 0) {
        for (const key of visibleKeys) {
          if (charts[key]) charts[key].update("none");
        }
      }
    }
  
    function setMovingDotAtState(st) {
      for (const key of visibleKeys) {
        if (!charts[key]) continue;
        const dot = charts[key].data.datasets[1];
        dot.hidden = false;
        dot.data = [stateToChartPoint(key, st)];
        charts[key].update("none");
      }
    }
  
    function rebuildChartsUpTo(tTarget) {
      if (!trajCache) return;
      clearAllCharts();
      const s = trajCache.series;
      for (let i = 0; i < s.length; i++) {
        if (s[i].time_s > tTarget + 0.001) break;
        for (const key of Object.keys(charts)) {
          if (!charts[key]) continue;
          charts[key].data.datasets[0].data.push(stateToChartPoint(key, s[i]));
        }
      }
      for (const key of Object.keys(charts)) {
        if (charts[key]) charts[key].update("none");
      }
    }
  
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
  
      // Toggle graph wrapper visibility
      for (const [key, canvasId] of Object.entries(GRAPH_CANVAS)) {
        const wrap = document.getElementById("wrap-" + canvasId.replace("graph-", ""));
        if (wrap) {
          wrap.classList.toggle("hidden", !showSet.has(key));
        }
      }
    }
  
    // ── Info panel ────────────────────────────────────────────────────────
    function updateInfoPanel(st) {
      if (!st) return;
      document.getElementById("infoTime").textContent = `t = ${st.time_s.toFixed(2)} s`;
      document.getElementById("infoPos").textContent = `x = ${st.x.toFixed(2)} m, y = ${st.y.toFixed(2)} m`;
      document.getElementById("infoVel").textContent = `v = ${st.v.toFixed(2)} m/s`;
      document.getElementById("infoPhase").textContent = `Phase: ${st.phase}`;
    }
  
    // ── Ball position ─────────────────────────────────────────────────────
    function updateBallPosition(st) {
      if (!ball) return;
      const { px, py } = ballPixelPos(st);
      Body.setPosition(ball, { x: px, y: py });
    }
  
    // ── Key/legend visibility ─────────────────────────────────────────────
    function updateKeyVisibility() {
      const kf = document.getElementById("keyForces");
      const kv = document.getElementById("keyVelocity");
      const km = document.getElementById("keyMotion");
      const fdRow = document.getElementById("keyRowFd");
  
      kf.classList.toggle("hidden", !cfg.forceEnabled);
      kv.classList.toggle("hidden", !cfg.velocityEnabled && !cfg.motionEnabled);
      km.classList.toggle("hidden", !cfg.motionEnabled);
      fdRow.classList.toggle("hidden", !(cfg.forceEnabled && cfg.airEnabled));
    }
  
    // ── Landed state helper ───────────────────────────────────────────────
    function showLandedState() {
      landed = true;
      paused = true;
      document.getElementById("pauseBtn").textContent = "Play";
    }
  
    // ── Restart ───────────────────────────────────────────────────────────
    async function doRestart() {
      t_s = 0;
      landed = false;
      paused = false;
      frameCounter = 0;
      chartCounter = 0;
      trailPoints = [];
      currentState = null;
      document.getElementById("pauseBtn").textContent = "Pause";
      document.getElementById("timeScrubber").value = 0;
  
      // Reload cfg from DOM
      cfg.ballMass = parseFloat(document.getElementById("massInput").value) || 1;
      cfg.dropHeight_m = parseFloat(document.getElementById("heightInput").value) || 0;
      cfg.launchSpeed_mps = parseFloat(document.getElementById("velocityInput").value) || 10;
      cfg.launchAngle_deg = parseFloat(document.getElementById("angleInput").value) || 45;
  
      await fetchTrajectorySeries();
  
      clearAllCharts();
      const st0 = interpStateAtTime(0);
      if (st0) {
        seedChartsAtT0(st0);
        currentState = st0;
        updateBallPosition(st0);
        updateInfoPanel(st0);
      }
    }
  
    // ══════════════════════════════════════════════════════════════════════
    // 6) Render overlay functions
    // ══════════════════════════════════════════════════════════════════════
  
    function drawArrow(ctx, x1, y1, x2, y2, color, lineWidth, dashed) {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) return;
      const headLen = Math.min(10, len * 0.3);
      const angle = Math.atan2(dy, dx);
  
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lineWidth || 2;
      if (dashed) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
  
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  
    function drawLabel(ctx, text, x, y, color, fontSize) {
      ctx.save();
      ctx.font = `bold ${fontSize || 11}px sans-serif`;
      ctx.fillStyle = color || "#fff";
      ctx.fillText(text, x + 4, y - 4);
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
  
    // Arrow scale factor for forces/velocities on canvas
    const ARROW_SCALE_FORCE = 3.5;
    const ARROW_SCALE_VEL = 1.5;
    const ARROW_SCALE_ACCEL = 4;
  
    function drawForceArrows(ctx, st) {
      if (!st) return;
      const { px, py } = ballPixelPos(st);
  
      // Fg — always draw downward
      const fgLen = st.Fg * ARROW_SCALE_FORCE;
      drawArrow(ctx, px, py, px, py + fgLen, COLORS.Fg, 2.5);
      drawLabel(ctx, `Fg=${st.Fg.toFixed(1)}N`, px + 6, py + fgLen, COLORS.Fg);
  
      // Fn — only when on ground / landed / end
      const shouldShowFn = st.onGround || landed || st.Fn > 0.01;
      if (shouldShowFn) {
        const fnLen = st.Fn * ARROW_SCALE_FORCE;
        drawArrow(ctx, px, py, px, py - fnLen, COLORS.Fn, 2.5);
        drawLabel(ctx, `Fn=${st.Fn.toFixed(1)}N`, px + 6, py - fnLen, COLORS.Fn);
      }
  
      // Air drag triangle (visual only)
      if (cfg.airEnabled && cfg.forceEnabled) {
        drawAirDragTriangle(ctx, st, px, py);
      }
    }
  
    function drawAirDragTriangle(ctx, st, px, py) {
      // Visual-only drag decomposition
      const speed = st.v;
      if (speed < 0.5) return;
      const dragMag = 0.5 * 0.47 * 1.225 * 0.01 * speed * speed; // rough visual
      const angle = Math.atan2(-st.vy, -st.vx);
      const fdx = dragMag * Math.cos(angle);
      const fdy = dragMag * Math.sin(angle);
      const scale = ARROW_SCALE_FORCE * 2;
  
      // Fd resultant
      drawArrow(ctx, px, py, px + fdx * scale, py + fdy * scale, COLORS.Fd, 2, true);
      drawLabel(ctx, "Fd", px + fdx * scale, py + fdy * scale, COLORS.Fd, 10);
  
      // Fdx component
      drawArrow(ctx, px, py, px + fdx * scale, py, COLORS.Fdx, 1.5, true);
      // Fdy component
      drawArrow(ctx, px, py, px, py + fdy * scale, COLORS.Fdy, 1.5, true);
    }
  
    function drawVelocityArrows(ctx, st) {
      if (!st) return;
      const { px, py } = ballPixelPos(st);
  
      const vxLen = st.vx * ARROW_SCALE_VEL;
      const vyLen = -st.vy * ARROW_SCALE_VEL; // screen y is flipped
  
      // Vx
      drawArrow(ctx, px, py, px + vxLen, py, COLORS.Vx, 2);
      drawLabel(ctx, `Vx=${st.vx.toFixed(1)}`, px + vxLen, py, COLORS.Vx, 10);
  
      // Vy
      drawArrow(ctx, px, py, px, py + vyLen, COLORS.Vy, 2);
      drawLabel(ctx, `Vy=${st.vy.toFixed(1)}`, px, py + vyLen, COLORS.Vy, 10);
  
      // V resultant
      drawArrow(ctx, px, py, px + vxLen, py + vyLen, COLORS.V, 2.5);
      drawLabel(ctx, `V=${st.v.toFixed(1)}`, px + vxLen, py + vyLen, COLORS.V, 10);
    }
  
    function drawMotionTrailAndCoords(ctx, st) {
      if (!st) return;
      const { px, py } = ballPixelPos(st);
  
      // Trail
      if (trailPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = COLORS.trail;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(trailPoints[0].x, trailPoints[0].y);
        for (let i = 1; i < trailPoints.length; i++) {
          ctx.lineTo(trailPoints[i].x, trailPoints[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
  
      // Coordinate arrows (dashed x and y from origin to ball)
      const originX = mToPixelX(0);
      const originY = GROUND_TOP_Y;
  
      // x arrow along ground
      drawArrow(ctx, originX, originY + 10, px, originY + 10, COLORS.coord, 1.5, true);
      drawLabel(ctx, `x=${st.x.toFixed(1)}m`, (originX + px) / 2, originY + 24, COLORS.coord, 10);
  
      // y arrow vertical
      drawArrow(ctx, px + 15, originY, px + 15, py, COLORS.coord, 1.5, true);
      drawLabel(ctx, `y=${st.y.toFixed(1)}m`, px + 20, (originY + py) / 2, COLORS.coord, 10);
    }
  
    function drawAccelerationArrow(ctx, st) {
      if (!st) return;
      const { px, py } = ballPixelPos(st);
      // ay is always -g during flight (downward on screen = positive py)
      const ayLen = Math.abs(st.ay) * ARROW_SCALE_ACCEL;
      const dir = st.ay < 0 ? 1 : -1; // negative ay = downward = positive screen y
      drawArrow(ctx, px, py, px, py + ayLen * dir, COLORS.accel, 2.5);
      drawLabel(ctx, `ay=${st.ay.toFixed(1)}`, px + 6, py + ayLen * dir, COLORS.accel);
    }
  
    function drawLandmarkDots(ctx) {
      if (!trajCache) return;
      const evts = trajCache.events;
  
      // Start dot
      if (evts.start) {
        const { px, py } = ballPixelPos(evts.start);
        drawDot(ctx, px, py, 5, COLORS.startDot);
        const h = cfg.dropHeight_m;
        const a = cfg.launchAngle_deg;
        let lbl = "Start";
        if (h > 0 && a === 0) lbl = `Start (h=${h}m)`;
        else if (a === 90) lbl = `Start (90°)`;
        else if (h > 0) lbl = `Start (h=${h}m, ${a}°)`;
        drawLabel(ctx, lbl, px + 6, py - 6, COLORS.startDot, 10);
      }
  
      // Apex dot
      if (evts.apex && tApex > 0 && tApex < tLand) {
        const { px, py } = ballPixelPos(evts.apex);
        drawDot(ctx, px, py, 5, COLORS.apexDot);
        drawLabel(ctx, `Apex (${evts.apex.y.toFixed(1)}m)`, px + 6, py - 6, COLORS.apexDot, 10);
      }
  
      // End dot
      if (evts.impact) {
        const { px, py } = ballPixelPos(evts.impact);
        drawDot(ctx, px, py, 5, COLORS.endDot);
        drawLabel(ctx, `Land (${evts.impact.x.toFixed(1)}m)`, px + 6, py + 14, COLORS.endDot, 10);
      }
    }
  
    function drawBackgroundGrid(ctx) {
      ctx.save();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 0.5;
      const step = 50;
      for (let x = 0; x < canvasWidth; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasHeight); ctx.stroke();
      }
      for (let y = 0; y < canvasHeight; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y); ctx.stroke();
      }
      ctx.restore();
    }
  
    // ══════════════════════════════════════════════════════════════════════
    // 7) beforeUpdate handler
    // ══════════════════════════════════════════════════════════════════════
    function onBeforeUpdate(event) {
      if (paused || landed || !trajCache) return;
  
      const delta = event.delta || 16.67;
      const dtSec = (delta / 1000) * playbackSpeed;
      t_s += dtSec;
  
      if (t_s >= tLand) {
        t_s = tLand;
        landed = true;
        const impactVisual = interpStateAtTime(preLandingTime());
        currentState = impactVisual;
        updateBallPosition(impactVisual);
        // Append landing point to charts
        const landPoint = interpStateAtTime(tLand);
        if (landPoint) {
          landPoint.Fn = landPoint.Fg; // ensure Fn=Fg at landing
          appendChartPoint(landPoint);
        }
        setMovingDotAtState(impactVisual);
        updateInfoPanel(impactVisual);
        showLandedState();
        return;
      }
  
      const st = interpStateAtTime(t_s);
      if (!st) return;
      currentState = st;
      updateBallPosition(st);
  
      // Trail
      if (cfg.motionEnabled) {
        const { px, py } = ballPixelPos(st);
        const last = trailPoints[trailPoints.length - 1];
        if (!last || Math.hypot(px - last.x, py - last.y) >= TRAIL_MIN_DIST_PX) {
          trailPoints.push({ x: px, y: py });
          if (trailPoints.length > TRAIL_MAX_POINTS) trailPoints.shift();
        }
      }
  
      // Charts
      frameCounter++;
      if (frameCounter % CHART_UPDATE_EVERY === 0) {
        appendChartPoint(st);
        setMovingDotAtState(st);
      }
  
      // Scrubber
      document.getElementById("timeScrubber").value = t_s.toFixed(2);
  
      // Info panel
      updateInfoPanel(st);
    }
  
    // ══════════════════════════════════════════════════════════════════════
    // 8) afterRender handler
    // ══════════════════════════════════════════════════════════════════════
    function onAfterRender() {
      if (!render || !render.canvas) return;
      const ctx = render.canvas.getContext("2d");
      if (!ctx) return;
  
      drawBackgroundGrid(ctx);
      drawLandmarkDots(ctx);
  
      const st = currentState;
      if (!st) return;
  
      if (cfg.forceEnabled) drawForceArrows(ctx, st);
      if (cfg.velocityEnabled) drawVelocityArrows(ctx, st);
      if (cfg.motionEnabled) drawMotionTrailAndCoords(ctx, st);
      if (accelerationEnabled) drawAccelerationArrow(ctx, st);
    }
  
    // ══════════════════════════════════════════════════════════════════════
    // 9) Controls & mode toggles
    // ══════════════════════════════════════════════════════════════════════
  
    function setExclusiveMode(mode) {
      cfg.forceEnabled = mode === "force";
      cfg.velocityEnabled = mode === "velocity";
      cfg.motionEnabled = mode === "motion";
      accelerationEnabled = mode === "acceleration";
  
      document.getElementById("forceCheckbox").checked = cfg.forceEnabled;
      document.getElementById("vectorCheckbox").checked = cfg.velocityEnabled;
      document.getElementById("motionCheckbox").checked = cfg.motionEnabled;
      document.getElementById("accelerationCheckbox").checked = accelerationEnabled;
  
      updateGraphVisibility();
      updateKeyVisibility();
    }
  
    function setPlaybackSpeed(spd) {
      playbackSpeed = spd;
      if (engine) engine.timing.timeScale = spd;
      document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.classList.toggle("active", parseFloat(btn.dataset.speed) === spd);
      });
    }
  
    // ══════════════════════════════════════════════════════════════════════
    // 10) Freeze frame functions
    // ══════════════════════════════════════════════════════════════════════
  
    function freezeStart() {
      paused = true;
      t_s = 0;
      document.getElementById("pauseBtn").textContent = "Play";
      document.getElementById("timeScrubber").value = 0;
      clearAllCharts();
      const st = interpStateAtTime(0);
      if (st) {
        currentState = st;
        updateBallPosition(st);
        // Dot-only snapshot at t=0 (no line history)
        setMovingDotAtState(st);
        updateInfoPanel(st);
      }
      trailPoints = [];
      landed = false;
    }
  
    function freezeApex() {
      if (tApex <= 0 || tApex >= tLand) return;
      paused = true;
      t_s = tApex;
      document.getElementById("pauseBtn").textContent = "Play";
      document.getElementById("timeScrubber").value = tApex.toFixed(2);
      rebuildChartsUpTo(tApex);
      const st = interpStateAtTime(tApex);
      if (st) {
        currentState = st;
        updateBallPosition(st);
        setMovingDotAtState(st);
        updateInfoPanel(st);
      }
      landed = false;
    }
  
    function freezeEnd() {
      paused = true;
      t_s = tLand;
      landed = true;
      document.getElementById("pauseBtn").textContent = "Play";
      document.getElementById("timeScrubber").value = parseFloat(document.getElementById("timeScrubber").max);
  
      // Visuals at preLandingTime
      const endVisual = interpStateAtTime(preLandingTime());
      if (endVisual) {
        currentState = endVisual;
        updateBallPosition(endVisual);
        updateInfoPanel(endVisual);
      }
  
      // Graphs rebuilt to tLand (include Fn=Fg)
      rebuildChartsUpTo(tLand);
  
      // Show landing Fn
      const landState = interpStateAtTime(tLand);
      if (landState) {
        landState.Fn = landState.Fg;
        setMovingDotAtState(landState);
      }
    }
  
    // ══════════════════════════════════════════════════════════════════════
    // 11) initRun() — THE ONLY place creating engine/render/runner/bodies/
    //     charts, binding listeners, starting loops
    // ══════════════════════════════════════════════════════════════════════
    async function initRun() {
      // Sync DOM from config
      syncDOMFromCfg();
  
      // Create Matter engine
      engine = Engine.create();
      engine.gravity.y = 0; // backend controls motion
  
      // Create render
      render = Render.create({
        element: document.getElementById("scene"),
        engine: engine,
        options: {
          width: canvasWidth,
          height: canvasHeight,
          wireframes: false,
          background: "#0a0e1a",
          pixelRatio: 1,
        },
      });
  
      // Create bodies
      const startState = { x: 0, y: cfg.dropHeight_m };
      const startPos = ballPixelPos(startState);
  
      ball = Bodies.circle(startPos.px, startPos.py, ballRadius, {
        mass: cfg.ballMass,
        render: {
          fillStyle: "#e94560",
          strokeStyle: "#fff",
          lineWidth: 1,
        },
        isStatic: true,
      });
  
      ground = Bodies.rectangle(canvasWidth / 2, GROUND_CENTER_Y, canvasWidth, groundHeight_px, {
        isStatic: true,
        render: {
          fillStyle: "#1e3a5f",
          strokeStyle: "#3b82f6",
          lineWidth: 1,
        },
      });
  
      World.add(engine.world, [ball, ground]);
  
      // Create runner
      runner = Runner.create();
  
      // Bind Matter events
      Events.on(engine, "beforeUpdate", onBeforeUpdate);
      Events.on(render, "afterRender", onAfterRender);
  
      // Start render + runner
      Render.run(render);
      Runner.run(runner, engine);
  
      // Create charts
      createAllCharts();
      updateGraphVisibility();
      updateKeyVisibility();
  
      // Fetch initial trajectory
      await fetchTrajectorySeries();
      const st0 = interpStateAtTime(0);
      if (st0) {
        currentState = st0;
        updateBallPosition(st0);
        seedChartsAtT0(st0);
        updateInfoPanel(st0);
      }
  
      // ── DOM Listeners ────────────────────────────────────────────────
  
      // Pause/Play
      document.getElementById("pauseBtn").addEventListener("click", () => {
        if (landed) {
          // If landed, restart on play
          doRestart();
          return;
        }
        paused = !paused;
        document.getElementById("pauseBtn").textContent = paused ? "Play" : "Pause";
      });
  
      // Restart
      document.getElementById("restartBtn").addEventListener("click", () => {
        doRestart();
      });
  
      // Freeze frames
      document.getElementById("frameStartBtn").addEventListener("click", freezeStart);
      document.getElementById("frameApexBtn").addEventListener("click", freezeApex);
      document.getElementById("frameEndBtn").addEventListener("click", freezeEnd);
  
      // Mode checkboxes (exclusive)
      document.getElementById("forceCheckbox").addEventListener("change", () => setExclusiveMode("force"));
      document.getElementById("vectorCheckbox").addEventListener("change", () => setExclusiveMode("velocity"));
      document.getElementById("motionCheckbox").addEventListener("change", () => setExclusiveMode("motion"));
      document.getElementById("accelerationCheckbox").addEventListener("change", () => setExclusiveMode("acceleration"));
  
      // Air checkbox
      document.getElementById("airCheckbox").addEventListener("change", (e) => {
        cfg.airEnabled = e.target.checked;
        updateKeyVisibility();
      });
  
      // Speed buttons
      document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          setPlaybackSpeed(parseFloat(btn.dataset.speed));
        });
      });
  
      // Scrubber events (pointer + mouse + touch)
      const scrubber = document.getElementById("timeScrubber");
      scrubber.addEventListener("pointerdown", beginScrub);
      scrubber.addEventListener("mousedown", beginScrub);
      scrubber.addEventListener("touchstart", beginScrub);
      scrubber.addEventListener("input", onScrubInput);
      scrubber.addEventListener("pointerup", endScrub);
      scrubber.addEventListener("mouseup", endScrub);
      scrubber.addEventListener("touchend", endScrub);
  
      // Parameter inputs — restart on change
      ["massInput", "heightInput", "velocityInput", "angleInput"].forEach(id => {
        document.getElementById(id).addEventListener("change", () => {
          doRestart();
        });
      });
    }
  
    // ══════════════════════════════════════════════════════════════════════
    // BOOT
    // ══════════════════════════════════════════════════════════════════════
    initRun();
  });
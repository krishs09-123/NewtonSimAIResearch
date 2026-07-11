/**
 * projectile.js — Full projectile simulation front-end
 * Reads window.__SIM_CFG__ before creating Matter bodies.
 * Talks to FastAPI backend at http://127.0.0.1:8000
 */
window.addEventListener("DOMContentLoaded", () => {
    "use strict";
  
    // ─── Matter.js destructure ───────────────────────────────────────────────────
    const { Engine, Render, Runner, World, Bodies, Body, Events } = Matter;
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 1) CONSTANTS (before any lets)
    // ═══════════════════════════════════════════════════════════════════════════════
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
    const PERF = { dotOnlyWhilePlaying: true, dotHz: 30, maxLinePoints: 800 };
    const LINE_KEYS = ["x_t", "y_t", "vx_t", "vy_t", "Fg_t", "Fn_t", "ax_t", "ay_t"];
    const API_BASE = "http://127.0.0.1:8000";
  
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
      x_t: "x (m) vs t",
      y_t: "y (m) vs t",
      vx_t: "vx (m/s) vs t",
      vy_t: "vy (m/s) vs t",
      Fg_t: "Fg (N) vs t",
      Fn_t: "Fn (N) vs t",
      Fg_m: "Fg (N) vs m",
      ax_t: "ax (m/s²) vs t",
      ay_t: "ay (m/s²) vs t",
    };
  
    const GRAPH_COLORS = {
      x_t: "#5b9cf5",
      y_t: "#a78bfa",
      vx_t: "#5b9cf5",
      vy_t: "#a78bfa",
      Fg_t: "#f56565",
      Fn_t: "#5be0a0",
      Fg_m: "#f56565",
      ax_t: "#f5a05b",
      ay_t: "#f56565",
    };
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 2) STATE VARIABLES (lets)
    // ═══════════════════════════════════════════════════════════════════════════════
    let engine, render, runner;
    let ball, ground;
  
    // Simulation parameters
    let simMass = 1;
    let simHeight = 20;
    let simSpeed = 30;
    let simAngle = 45;
  
    // Mode flags
    let forceEnabled = true;
    let velocityEnabled = false;
    let motionEnabled = false;
    let accelerationEnabled = false;
    let airEnabled = false;
  
    // Playback state
    let paused = false;
    let scrubbing = false;
    let landed = false;
    let playbackSpeed = 1.0;
    let t_s = 0;
    let chartFrame = 0;
  
    // Trajectory cache
    let trajCache = null;       // full /projectile_series response
    let tLand = 5;
    let tApex = 1;
  
    // Charts
    let charts = {};            // key -> Chart instance
    let visibleKeys = new Set();
  
    // Trail
    let trail = [];
  
    // DOM refs (assigned in initRun)
    let $scene, $mass, $height, $velocity, $angle;
    let $forceChk, $vectorChk, $motionChk, $accelChk, $airChk;
    let $pauseBtn, $restartBtn, $frameStart, $frameApex, $frameEnd;
    let $scrubber, $scrubLabel;
    let $keyBox, $keyForces, $keyVelocity, $keyMotion, $keyRowFd;
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 3) CONFIG NORMALIZATION (before Matter/Chart creation)
    // ═══════════════════════════════════════════════════════════════════════════════
    function applyInjectedSimCfg() {
      const cfg = window.__SIM_CFG__ || {};
  
      if (cfg.ballMass !== undefined)      simMass   = Number(cfg.ballMass);
      if (cfg.dropHeight_m !== undefined)  simHeight = Number(cfg.dropHeight_m);
      if (cfg.launchSpeed_mps !== undefined) simSpeed = Number(cfg.launchSpeed_mps);
      if (cfg.launchAngle_deg !== undefined) simAngle = Number(cfg.launchAngle_deg);
      if (cfg.airEnabled !== undefined)    airEnabled = !!cfg.airEnabled;
  
      // Mode exclusivity: exactly ONE of (force, velocity, motion) must be true
      const f = cfg.forceEnabled, v = cfg.velocityEnabled, m = cfg.motionEnabled;
      const count = [f, v, m].filter(x => x === true).length;
      if (count === 1) {
        forceEnabled    = !!f;
        velocityEnabled = !!v;
        motionEnabled   = !!m;
      } else {
        // default
        forceEnabled    = true;
        velocityEnabled = false;
        motionEnabled   = false;
      }
      accelerationEnabled = false; // UI-only, never injected
    }
  
    applyInjectedSimCfg();
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 4) HELPER FUNCTIONS (all declared before initRun)
    // ═══════════════════════════════════════════════════════════════════════════════
  
    // ── Coordinate transforms ──
    function mToPixelX(x_m) {
      return (x_m / maxRange_m) * canvasWidth;
    }
    function mToPixelY(y_m) {
      return GROUND_TOP_Y - (y_m / maxHeight_m) * (GROUND_TOP_Y);
    }
    function pixelScale() {
      return canvasWidth / maxRange_m;
    }
  
    // ── Pre-impact epsilon ──
    function preImpactEps() {
      return 0.001;
    }
    function preLandingTime() {
      return Math.max(tLand - preImpactEps(), 0);
    }
  
    // ── Interpolate state from trajectory cache ──
    function interpStateAtTime(t) {
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
  
      const a = series[lo], b = series[hi];
      if (Math.abs(b.time_s - a.time_s) < 1e-12) return a;
      const frac = (t - a.time_s) / (b.time_s - a.time_s);
  
      const lerp = (va, vb) => va + (vb - va) * frac;
      return {
        time_s: t,
        x: lerp(a.x, b.x),
        y: lerp(a.y, b.y),
        vx: lerp(a.vx, b.vx),
        vy: lerp(a.vy, b.vy),
        ax: lerp(a.ax, b.ax),
        ay: lerp(a.ay, b.ay),
        Fg: lerp(a.Fg, b.Fg),
        Fn: lerp(a.Fn, b.Fn),
        v: lerp(a.v, b.v),
        onGround: t >= tLand,
        phase: t >= tLand ? "impact" : "flight",
        y_raw: lerp(a.y_raw, b.y_raw),
      };
    }
  
    // ── Fetch trajectory series ──
    async function fetchTrajectorySeries() {
      const url = `${API_BASE}/projectile_series?mass=${simMass}&height=${simHeight}&speed=${simSpeed}&angle=${simAngle}&dt=0.02&eps=${preImpactEps()}&g=${g}`;
      try {
        const res = await fetch(url);
        trajCache = await res.json();
        const meta = trajCache.meta;
        tLand = meta.t_land || 0;
        tApex = meta.t_apex || 0;
        ensureBoundarySamples();
        updateScrubberRange();
      } catch (e) {
        console.error("Failed to fetch trajectory series:", e);
      }
    }
  
    // ── Ensure boundary samples ──
    function ensureBoundarySamples() {
      if (!trajCache || !trajCache.series) return;
      const series = trajCache.series;
  
      // Ensure t=0 exists exactly
      if (series.length === 0 || series[0].time_s > 1e-9) {
        const s0 = trajCache.events ? trajCache.events.start : null;
        if (s0) series.unshift({ ...s0, time_s: 0 });
      }
  
      // Ensure landing point at tLand where Fn=Fg
      if (tLand > 0) {
        const last = series[series.length - 1];
        if (last.time_s < tLand - 1e-9) {
          // compute pre-impact velocities at just before landing
          const preT = preLandingTime();
          const preSt = interpFromSeries(series, preT);
          const impactPt = {
            time_s: tLand,
            x: preSt ? preSt.x + preSt.vx * (tLand - preT) : (trajCache.impact ? trajCache.impact.x : last.x),
            y: 0,
            vx: preSt ? preSt.vx : (trajCache.impact ? trajCache.impact.vx : 0),
            vy: preSt ? preSt.vy : (trajCache.impact ? trajCache.impact.vy : 0),
            ax: 0,
            ay: -g,
            Fg: simMass * g,
            Fn: simMass * g,
            v: preSt ? preSt.v : (trajCache.impact ? trajCache.impact.v : 0),
            onGround: true,
            phase: "impact",
            y_raw: 0,
          };
          series.push(impactPt);
        } else if (last.time_s >= tLand - 1e-9) {
          // patch: ensure Fn = Fg at landing and keep pre-impact velocities
          last.Fn = simMass * g;
          last.y = 0;
          last.onGround = true;
        }
      }
  
      // Normalize rest snapshot
      if (trajCache.rest) {
        trajCache.rest.time_s = tLand;
        trajCache.rest.Fn = simMass * g;
        trajCache.rest.Fg = simMass * g;
        trajCache.rest.vx = 0;
        trajCache.rest.vy = 0;
        trajCache.rest.v = 0;
        trajCache.rest.ax = 0;
        trajCache.rest.ay = 0;
      }
    }
  
    // Simple linear interpolation within a sorted series array
    function interpFromSeries(series, t) {
      if (series.length === 0) return null;
      if (t <= series[0].time_s) return series[0];
      if (t >= series[series.length - 1].time_s) return series[series.length - 1];
      for (let i = 0; i < series.length - 1; i++) {
        if (series[i].time_s <= t && series[i + 1].time_s >= t) {
          const a = series[i], b = series[i + 1];
          const dt = b.time_s - a.time_s;
          if (dt < 1e-12) return a;
          const f = (t - a.time_s) / dt;
          const lerp = (va, vb) => va + (vb - va) * f;
          return {
            time_s: t, x: lerp(a.x, b.x), y: lerp(a.y, b.y),
            vx: lerp(a.vx, b.vx), vy: lerp(a.vy, b.vy),
            ax: lerp(a.ax, b.ax), ay: lerp(a.ay, b.ay),
            Fg: lerp(a.Fg, b.Fg), Fn: lerp(a.Fn, b.Fn),
            v: lerp(a.v, b.v), onGround: false, phase: "flight", y_raw: lerp(a.y_raw, b.y_raw),
          };
        }
      }
      return series[series.length - 1];
    }
  
    // ── Fetch single point ──
    async function fetchSingleState(t) {
      const url = `${API_BASE}/projectile?t=${t}&mass=${simMass}&height=${simHeight}&speed=${simSpeed}&angle=${simAngle}&eps=${preImpactEps()}&g=${g}&vectors=`;
      try {
        const res = await fetch(url);
        return await res.json();
      } catch (e) {
        console.error("fetchSingleState error:", e);
        return null;
      }
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 5) CHART HELPERS
    // ═══════════════════════════════════════════════════════════════════════════════
    function createLineChart(canvasId, label, color) {
      const ctx = document.getElementById(canvasId);
      if (!ctx) return null;
      return new Chart(ctx, {
        type: "scatter",
        data: {
          datasets: [
            {
              label: label,
              data: [],
              borderColor: color,
              backgroundColor: color,
              showLine: true,
              pointRadius: 0,
              borderWidth: 1.5,
              tension: 0.1,
              order: 2,
            },
            {
              label: "Dot",
              data: [],
              borderColor: "#fff",
              backgroundColor: color,
              showLine: false,
              pointRadius: 5,
              pointStyle: "circle",
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
            title: { display: true, text: label, color: "#8b8f9e", font: { size: 10 } },
          },
          scales: {
            x: {
              type: "linear",
              ticks: { color: "#555", font: { size: 9 } },
              grid: { color: "rgba(255,255,255,0.05)" },
            },
            y: {
              ticks: { color: "#555", font: { size: 9 } },
              grid: { color: "rgba(255,255,255,0.05)" },
            },
          },
        },
      });
    }
  
    function createAllCharts() {
      for (const [key, canvasId] of Object.entries(GRAPH_CANVAS)) {
        charts[key] = createLineChart(canvasId, GRAPH_LABELS[key], GRAPH_COLORS[key]);
      }
    }
  
    function updateGraphVisibility(showSet) {
      visibleKeys = new Set(showSet);
      for (const [key, canvasId] of Object.entries(GRAPH_CANVAS)) {
        const wrap = document.getElementById("wrap-" + canvasId);
        if (wrap) {
          if (visibleKeys.has(key)) {
            wrap.classList.remove("hidden-graph");
          } else {
            wrap.classList.add("hidden-graph");
          }
        }
      }
    }
  
    function getVisibleSet() {
      if (forceEnabled)        return ["Fg_t", "Fn_t", "Fg_m"];
      if (velocityEnabled)     return ["vx_t", "vy_t"];
      if (motionEnabled)       return ["x_t", "y_t", "vx_t", "vy_t", "ax_t", "ay_t"];
      if (accelerationEnabled) return ["ax_t", "ay_t"];
      return ["Fg_t", "Fn_t", "Fg_m"];
    }
  
    function chartValueFromState(key, st) {
      if (!st) return { x: 0, y: 0 };
      switch (key) {
        case "x_t":  return { x: st.time_s, y: st.x };
        case "y_t":  return { x: st.time_s, y: st.y };
        case "vx_t": return { x: st.time_s, y: st.vx };
        case "vy_t": return { x: st.time_s, y: st.vy };
        case "Fg_t": return { x: st.time_s, y: st.Fg };
        case "Fn_t": return { x: st.time_s, y: st.Fn };
        case "Fg_m": return { x: simMass,   y: st.Fg };
        case "ax_t": return { x: st.time_s, y: st.ax };
        case "ay_t": return { x: st.time_s, y: st.ay };
        default:     return { x: st.time_s, y: 0 };
      }
    }
  
    function pushLinePoint(key, st) {
      const ch = charts[key];
      if (!ch) return;
      const pt = chartValueFromState(key, st);
      const ds = ch.data.datasets[0];
      if (ds.data.length >= PERF.maxLinePoints) return;
      ds.data.push(pt);
    }
  
    function setMovingDotAtState(st) {
      for (const key of visibleKeys) {
        const ch = charts[key];
        if (!ch) continue;
        const pt = chartValueFromState(key, st);
        ch.data.datasets[1].data = [pt];
        ch.data.datasets[1].hidden = false;
        ch.update("none");
      }
    }
  
    function updateChartLines(st) {
      for (const key of visibleKeys) {
        pushLinePoint(key, st);
      }
      chartFrame++;
      if (chartFrame % CHART_UPDATE_EVERY === 0) {
        for (const key of visibleKeys) {
          if (charts[key]) charts[key].update("none");
        }
      }
    }
  
    function resetCharts() {
      for (const [key, ch] of Object.entries(charts)) {
        if (!ch) continue;
        ch.data.datasets[0].data = [];
        ch.data.datasets[1].data = [];
        ch.data.datasets[1].hidden = true;
        ch.update("none");
      }
      chartFrame = 0;
    }
  
    function seedChartsAtT0(st) {
      for (const key of visibleKeys) {
        pushLinePoint(key, st);
        if (charts[key]) charts[key].update("none");
      }
    }
  
    function rebuildChartsToTime(targetTime) {
      if (!trajCache || !trajCache.series) return;
      resetCharts();
      const step = 0.02;
      for (let t = 0; t <= targetTime + 1e-9; t += step) {
        const st = interpStateAtTime(Math.min(t, targetTime));
        if (st) {
          for (const key of visibleKeys) pushLinePoint(key, st);
        }
      }
      // Ensure final point
      const finalSt = interpStateAtTime(targetTime);
      if (finalSt) {
        for (const key of visibleKeys) pushLinePoint(key, finalSt);
      }
      for (const key of visibleKeys) {
        if (charts[key]) charts[key].update("none");
      }
    }
  
    function rebuildChartsToLandingWithFn() {
      rebuildChartsToTime(tLand);
      // Ensure Fn = Fg at landing in Fn_t chart
      const ch = charts["Fn_t"];
      if (ch) {
        const Fg = simMass * g;
        ch.data.datasets[0].data.push({ x: tLand, y: Fg });
        ch.update("none");
      }
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 6) RENDER OVERLAY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════
    function drawArrow(ctx, x, y, dx, dy, color, label, dashed) {
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      if (dashed) ctx.setLineDash([4, 4]);
  
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
  
      // Arrowhead
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 5) {
        const angle = Math.atan2(dy, dx);
        const hs = 8;
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx - hs * Math.cos(angle - 0.4), y + dy - hs * Math.sin(angle - 0.4));
        ctx.lineTo(x + dx - hs * Math.cos(angle + 0.4), y + dy - hs * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      }
  
      if (label) {
        ctx.font = "10px sans-serif";
        ctx.fillText(label, x + dx + 4, y + dy - 4);
      }
  
      ctx.restore();
    }
  
    function drawDot(ctx, x, y, r, color, label) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (label) {
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x + r + 4, y - 4);
      }
      ctx.restore();
    }
  
    function drawGrid(ctx) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      const step = 50;
      for (let x = 0; x <= canvasWidth; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasHeight); ctx.stroke();
      }
      for (let y = 0; y <= canvasHeight; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y); ctx.stroke();
      }
      ctx.restore();
    }
  
    // ── Get ball pixel position from state ──
    function ballPixelPos(st) {
      if (!st) return { px: 50, py: GROUND_TOP_Y - ballRadius };
      const px = mToPixelX(st.x);
      const py = mToPixelY(st.y);
      return { px, py };
    }
  
    // ── Draw landmark dots ──
    function drawLandmarkDots(ctx) {
      if (!trajCache || !trajCache.events) return;
      const ev = trajCache.events;
  
      // Start dot
      if (ev.start) {
        const { px, py } = ballPixelPos(ev.start);
        let lbl = "Start";
        if (simAngle === 0 && simHeight > 0) lbl = "Drop";
        if (simAngle === 90) lbl = "Launch ↑";
        drawDot(ctx, px, py, 4, "#5be0a0", lbl);
      }
  
      // Apex dot
      if (ev.apex && tApex > 0 && tApex < tLand) {
        const { px, py } = ballPixelPos(ev.apex);
        drawDot(ctx, px, py, 4, "#f5a05b", "Apex");
      }
  
      // End dot
      if (ev.impact) {
        const { px, py } = ballPixelPos(ev.impact);
        drawDot(ctx, px, py, 4, "#f56565", "End");
      }
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 7) beforeUpdate HANDLER
    // ═══════════════════════════════════════════════════════════════════════════════
    function onBeforeUpdate(event) {
      if (paused || scrubbing || !trajCache) return;
  
      const delta = event.delta || 16.67;
      t_s += (delta / 1000) * playbackSpeed;
  
      if (t_s >= tLand) {
        t_s = tLand;
        landed = true;
        paused = true;
        $pauseBtn.textContent = "Play";
      }
  
      const st = interpStateAtTime(t_s);
      if (!st) return;
  
      // Move ball body
      const { px, py } = ballPixelPos(st);
      Body.setPosition(ball, { x: px, y: py });
  
      // Trail in motion mode
      if (motionEnabled) {
        const lastPt = trail.length > 0 ? trail[trail.length - 1] : null;
        if (!lastPt || Math.hypot(px - lastPt.x, py - lastPt.y) >= TRAIL_MIN_DIST_PX) {
          trail.push({ x: px, y: py });
          if (trail.length > TRAIL_MAX_POINTS) trail.shift();
        }
      }
  
      // Update charts
      updateChartLines(st);
      setMovingDotAtState(st);
  
      // Update scrubber position
      $scrubber.value = t_s;
      $scrubLabel.textContent = t_s.toFixed(2) + " s";
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 8) afterRender HANDLER
    // ═══════════════════════════════════════════════════════════════════════════════
    function onAfterRender() {
      const ctx = render.context;
      drawGrid(ctx);
      drawLandmarkDots(ctx);
  
      const st = interpStateAtTime(t_s);
      if (!st) return;
      const { px, py } = ballPixelPos(st);
      const arrowScale = 3;
      const usePreLanding = (t_s >= preLandingTime() && t_s <= tLand);
      const displaySt = usePreLanding ? interpStateAtTime(preLandingTime()) || st : st;
  
      const showGroundForces = landed || st.onGround || t_s >= tLand;
  
      // ── Force mode ──
      if (forceEnabled) {
        const Fg = displaySt.Fg || 0;
        // Fg always drawn (down)
        drawArrow(ctx, px, py, 0, Fg * arrowScale, "#f56565", `Fg=${Fg.toFixed(1)}N`, false);
        // Fn only when on ground / end
        if (showGroundForces) {
          const Fn = simMass * g;
          drawArrow(ctx, px, py, 0, -Fn * arrowScale, "#5be0a0", `Fn=${Fn.toFixed(1)}N`, false);
        }
        // Air drag triangle (visual only)
        if (airEnabled && !showGroundForces) {
          const dragMag = 0.5 * displaySt.v * displaySt.v * 0.01; // fake visual
          const angle = Math.atan2(-displaySt.vy, -displaySt.vx);
          const fdx = dragMag * Math.cos(angle) * arrowScale;
          const fdy = dragMag * Math.sin(angle) * arrowScale;
          drawArrow(ctx, px, py, fdx, fdy, "#f5a05b", "Fd", true);
          drawArrow(ctx, px, py, fdx, 0, "#f5a05b", "Fdx", true);
          drawArrow(ctx, py, py, 0, fdy, "#f5a05b", "Fdy", true);
        }
      }
  
      // ── Velocity mode ──
      if (velocityEnabled) {
        const vScale = 2;
        const vx = displaySt.vx || 0;
        const vy = displaySt.vy || 0;
        drawArrow(ctx, px, py, vx * vScale, 0, "#5b9cf5", `Vx=${vx.toFixed(1)}`, false);
        drawArrow(ctx, px, py, 0, -vy * vScale, "#a78bfa", `Vy=${vy.toFixed(1)}`, false);
        // Resultant
        drawArrow(ctx, px, py, vx * vScale, -vy * vScale, "#e0e2ea", `V=${displaySt.v.toFixed(1)}`, true);
      }
  
      // ── Motion mode (trail + coordinate arrows) ──
      if (motionEnabled) {
        // Dotted trail
        if (trail.length > 1) {
          ctx.save();
          ctx.strokeStyle = "rgba(91,156,245,0.45)";
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          ctx.moveTo(trail[0].x, trail[0].y);
          for (let i = 1; i < trail.length; i++) {
            ctx.lineTo(trail[i].x, trail[i].y);
          }
          ctx.stroke();
          ctx.restore();
        }
        // Dashed coordinate arrows from origin
        const originX = mToPixelX(0);
        const originY = mToPixelY(0);
        drawArrow(ctx, originX, originY, px - originX, 0, "#5b9cf5", `x=${displaySt.x.toFixed(1)}m`, true);
        drawArrow(ctx, originX, originY, 0, py - originY, "#a78bfa", `y=${displaySt.y.toFixed(1)}m`, true);
      }
  
      // ── Acceleration mode ──
      if (accelerationEnabled) {
        const aScale = 5;
        const ay = displaySt.ay || -g;
        drawArrow(ctx, px, py, 0, -ay * aScale, "#f56565", `ay=${ay.toFixed(1)}`, false);
      }
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 9) CONTROLS + MODE TOGGLES + SPEED
    // ═══════════════════════════════════════════════════════════════════════════════
    function syncUIFromState() {
      $mass.value = simMass;
      $height.value = simHeight;
      $velocity.value = simSpeed;
      $angle.value = simAngle;
      $forceChk.checked = forceEnabled;
      $vectorChk.checked = velocityEnabled;
      $motionChk.checked = motionEnabled;
      $accelChk.checked = accelerationEnabled;
      $airChk.checked = airEnabled;
    }
  
    function setExclusiveMode(mode) {
      forceEnabled = mode === "force";
      velocityEnabled = mode === "velocity";
      motionEnabled = mode === "motion";
      accelerationEnabled = mode === "acceleration";
      $forceChk.checked = forceEnabled;
      $vectorChk.checked = velocityEnabled;
      $motionChk.checked = motionEnabled;
      $accelChk.checked = accelerationEnabled;
      updateKeyBoxVisibility();
      updateGraphVisibility(getVisibleSet());
      if (!motionEnabled) trail = [];
    }
  
    function updateKeyBoxVisibility() {
      $keyForces.classList.toggle("hidden", !forceEnabled);
      $keyVelocity.classList.toggle("hidden", !velocityEnabled);
      $keyMotion.classList.toggle("hidden", !motionEnabled);
      $keyRowFd.classList.toggle("hidden", !(airEnabled && forceEnabled));
    }
  
    function setPlaybackSpeed(speed) {
      playbackSpeed = speed;
      if (engine) engine.timing.timeScale = speed;
      document.querySelectorAll(".speed-btn").forEach(b => {
        b.classList.toggle("active", parseFloat(b.dataset.speed) === speed);
      });
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 10) SCRUBBER
    // ═══════════════════════════════════════════════════════════════════════════════
    function updateScrubberRange() {
      const maxVal = Math.ceil(tLand / 0.01) * 0.01;
      $scrubber.max = maxVal;
      $scrubber.value = t_s;
    }
  
    function beginScrub() {
      scrubbing = true;
      // Internal pause without changing button label
    }
  
    function endScrub() {
      scrubbing = false;
      const val = parseFloat($scrubber.value);
  
      // Left edge: restart-at-start
      if (val <= 0.005) {
        t_s = 0;
        trail = [];
        resetCharts();
        const st0 = interpStateAtTime(0);
        if (st0) {
          seedChartsAtT0(st0);
          const { px, py } = ballPixelPos(st0);
          Body.setPosition(ball, { x: px, y: py });
          setMovingDotAtState(st0);
        }
        landed = false;
        $scrubber.value = 0;
        $scrubLabel.textContent = "0.00 s";
        return;
      }
  
      // Right edge: snap to true end
      if (val >= tLand - 0.02) {
        t_s = tLand;
        landed = true;
        paused = true;
        $pauseBtn.textContent = "Play";
        const visSt = interpStateAtTime(preLandingTime());
        if (visSt) {
          const { px, py } = ballPixelPos(visSt);
          Body.setPosition(ball, { x: px, y: py });
        }
        rebuildChartsToLandingWithFn();
        const impactSt = trajCache ? trajCache.impact : interpStateAtTime(tLand);
        if (impactSt) setMovingDotAtState(impactSt);
        $scrubber.value = tLand;
        $scrubLabel.textContent = tLand.toFixed(2) + " s";
        return;
      }
    }
  
    function onScrubInput() {
      const val = parseFloat($scrubber.value);
      t_s = val;
      $scrubLabel.textContent = val.toFixed(2) + " s";
      const st = interpStateAtTime(val);
      if (st) {
        const { px, py } = ballPixelPos(st);
        Body.setPosition(ball, { x: px, y: py });
        setMovingDotAtState(st);
      }
      // rebuild chart history up to current
      rebuildChartsToTime(val);
      landed = val >= tLand;
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 11) FREEZE FRAME BUTTONS
    // ═══════════════════════════════════════════════════════════════════════════════
    function freezeStart() {
      paused = true;
      $pauseBtn.textContent = "Play";
      t_s = 0;
      landed = false;
      trail = [];
      resetCharts();
      const st = interpStateAtTime(0);
      if (st) {
        const { px, py } = ballPixelPos(st);
        Body.setPosition(ball, { x: px, y: py });
        // Dot-only snapshot (no line history)
        setMovingDotAtState(st);
      }
      $scrubber.value = 0;
      $scrubLabel.textContent = "0.00 s";
    }
  
    function freezeApex() {
      if (!tApex || tApex <= 0) return;
      paused = true;
      $pauseBtn.textContent = "Play";
      t_s = tApex;
      landed = false;
      trail = [];
      rebuildChartsToTime(tApex);
      const st = interpStateAtTime(tApex);
      if (st) {
        const { px, py } = ballPixelPos(st);
        Body.setPosition(ball, { x: px, y: py });
        setMovingDotAtState(st);
      }
      $scrubber.value = tApex;
      $scrubLabel.textContent = tApex.toFixed(2) + " s";
    }
  
    function freezeEnd() {
      paused = true;
      $pauseBtn.textContent = "Play";
      t_s = tLand;
      landed = true;
      trail = [];
  
      // Visuals at preLandingTime
      const visSt = interpStateAtTime(preLandingTime());
      if (visSt) {
        const { px, py } = ballPixelPos(visSt);
        Body.setPosition(ball, { x: px, y: py });
      }
  
      // Graphs rebuilt to tLand with Fn
      rebuildChartsToLandingWithFn();
  
      // Show impact dot
      const impactSt = trajCache ? trajCache.impact : interpStateAtTime(tLand);
      if (impactSt) setMovingDotAtState(impactSt);
  
      $scrubber.value = tLand;
      $scrubLabel.textContent = tLand.toFixed(2) + " s";
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 12) RESTART
    // ═══════════════════════════════════════════════════════════════════════════════
    async function doRestart() {
      paused = false;
      landed = false;
      t_s = 0;
      trail = [];
      $pauseBtn.textContent = "Pause";
  
      // Re-read params from inputs
      simMass   = parseFloat($mass.value)     || 1;
      simHeight = parseFloat($height.value)   || 0;
      simSpeed  = parseFloat($velocity.value) || 0;
      simAngle  = parseFloat($angle.value)    || 45;
  
      resetCharts();
  
      // Re-fetch series
      await fetchTrajectorySeries();
  
      // Seed t=0
      const st0 = interpStateAtTime(0);
      if (st0) {
        const { px, py } = ballPixelPos(st0);
        Body.setPosition(ball, { x: px, y: py });
        seedChartsAtT0(st0);
      }
  
      $scrubber.value = 0;
      $scrubLabel.textContent = "0.00 s";
    }
  
    // ═══════════════════════════════════════════════════════════════════════════════
    // 13) initRun() — THE ONLY PLACE WITH SIDE EFFECTS
    // ═══════════════════════════════════════════════════════════════════════════════
    async function initRun() {
      // ── Grab DOM refs ──
      $scene      = document.getElementById("scene");
      $mass       = document.getElementById("massInput");
      $height     = document.getElementById("heightInput");
      $velocity   = document.getElementById("velocityInput");
      $angle      = document.getElementById("angleInput");
      $forceChk   = document.getElementById("forceCheckbox");
      $vectorChk  = document.getElementById("vectorCheckbox");
      $motionChk  = document.getElementById("motionCheckbox");
      $accelChk   = document.getElementById("accelerationCheckbox");
      $airChk     = document.getElementById("airCheckbox");
      $pauseBtn   = document.getElementById("pauseBtn");
      $restartBtn = document.getElementById("restartBtn");
      $frameStart = document.getElementById("frameStartBtn");
      $frameApex  = document.getElementById("frameApexBtn");
      $frameEnd   = document.getElementById("frameEndBtn");
      $scrubber   = document.getElementById("timeScrubber");
      $scrubLabel = document.getElementById("scrubberTimeLabel");
      $keyBox     = document.getElementById("keyBox");
      $keyForces  = document.getElementById("keyForces");
      $keyVelocity= document.getElementById("keyVelocity");
      $keyMotion  = document.getElementById("keyMotion");
      $keyRowFd   = document.getElementById("keyRowFd");
  
      // Sync UI inputs from state (which came from SIM_CFG)
      syncUIFromState();
  
      // ── Create Matter engine (gravity=0, backend controls) ──
      engine = Engine.create();
      engine.gravity.y = 0;
  
      render = Render.create({
        element: $scene,
        engine: engine,
        options: {
          width: canvasWidth,
          height: canvasHeight,
          wireframes: false,
          background: "#0d0f15",
          pixelRatio: 1,
        },
      });
  
      runner = Runner.create();
  
      // ── Create bodies ──
      ground = Bodies.rectangle(canvasWidth / 2, GROUND_CENTER_Y, canvasWidth, groundHeight_px, {
        isStatic: true,
        render: { fillStyle: "#1a3a2a" },
      });
  
      ball = Bodies.circle(50, GROUND_TOP_Y - ballRadius, ballRadius, {
        mass: simMass,
        restitution: 0,
        render: { fillStyle: "#5b9cf5" },
      });
  
      World.add(engine.world, [ground, ball]);
  
      // ── Create charts ──
      createAllCharts();
      updateGraphVisibility(getVisibleSet());
      updateKeyBoxVisibility();
  
      // ── Bind events ──
      Events.on(engine, "beforeUpdate", onBeforeUpdate);
      Events.on(render, "afterRender", onAfterRender);
  
      // ── Mode checkboxes ──
      $forceChk.addEventListener("change", () => setExclusiveMode("force"));
      $vectorChk.addEventListener("change", () => setExclusiveMode("velocity"));
      $motionChk.addEventListener("change", () => setExclusiveMode("motion"));
      $accelChk.addEventListener("change", () => setExclusiveMode("acceleration"));
      $airChk.addEventListener("change", () => {
        airEnabled = $airChk.checked;
        updateKeyBoxVisibility();
      });
  
      // ── Buttons ──
      $pauseBtn.addEventListener("click", () => {
        if (landed && paused) {
          // If ended, restart
          doRestart();
          return;
        }
        paused = !paused;
        $pauseBtn.textContent = paused ? "Play" : "Pause";
      });
  
      $restartBtn.addEventListener("click", () => doRestart());
      $frameStart.addEventListener("click", freezeStart);
      $frameApex.addEventListener("click", freezeApex);
      $frameEnd.addEventListener("click", freezeEnd);
  
      // ── Speed buttons ──
      document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          setPlaybackSpeed(parseFloat(btn.dataset.speed));
        });
      });
  
      // ── Scrubber ──
      $scrubber.addEventListener("pointerdown", beginScrub);
      $scrubber.addEventListener("mousedown", beginScrub);
      $scrubber.addEventListener("touchstart", beginScrub, { passive: true });
      $scrubber.addEventListener("input", onScrubInput);
      $scrubber.addEventListener("pointerup", endScrub);
      $scrubber.addEventListener("mouseup", endScrub);
      $scrubber.addEventListener("touchend", endScrub);
  
      // ── Fetch initial trajectory and seed ──
      await fetchTrajectorySeries();
      const st0 = interpStateAtTime(0);
      if (st0) {
        const { px, py } = ballPixelPos(st0);
        Body.setPosition(ball, { x: px, y: py });
        seedChartsAtT0(st0);
      }
  
      // ── Start engine + render ──
      Render.run(render);
      Runner.run(runner, engine);
    }
  
    // ── Launch ──
    initRun();
  });
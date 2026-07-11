/**
 * projectile.js — Full-stack projectile simulation front-end.
 *
 * Structure (mandatory ordering):
 *   1. DOMContentLoaded wrapper
 *   2. Matter destructure
 *   3. Constants (all const before any let)
 *   4. State variables (let)
 *   5. Config normalization (from window.__SIM_CFG__)
 *   6. Helper functions (math / fetch / charts / overlay / UI / scrubber)
 *   7. Chart creation helpers
 *   8. Render overlay functions
 *   9. beforeUpdate handler
 *  10. afterRender handler
 *  11. Controls + mode toggles + speed buttons
 *  12. Scrubber (beginScrub / endScrub)
 *  13. initRun() — sole side-effect origin
 */

window.addEventListener("DOMContentLoaded", () => {

    // ────────────────────────────────────────────────────────────────────────
    // 2. Matter destructure
    // ────────────────────────────────────────────────────────────────────────
    const { Engine, Render, Runner, World, Bodies, Body, Events } = Matter;
  
    // ────────────────────────────────────────────────────────────────────────
    // 3. Constants (ALL const before any let)
    // ────────────────────────────────────────────────────────────────────────
    const canvasWidth  = 800;
    const canvasHeight = 700;
    const g            = 9.81;
    const groundHeight_px = 40;
    const ballRadius   = 10;
    const maxRange_m   = 1200;
    const maxHeight_m  = 650;
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
  
    const BASE_URL = "http://127.0.0.1:8000";
  
    const COLORS = {
      Fg:    "#e74c3c",
      Fn:    "#2ecc71",
      Fd:    "#f39c12",
      Vx:    "#3498db",
      Vy:    "#9b59b6",
      V:     "#e91e63",
      trail: "#1abc9c",
      coordX:"#e67e22",
      coordY:"#e67e22",
      ax:    "#00bcd4",
      ay:    "#ff5722",
    };
  
    // ────────────────────────────────────────────────────────────────────────
    // 4. State variables (let)
    // ────────────────────────────────────────────────────────────────────────
    let engine, render, runner;
    let ball, ground;
  
    let massVal, heightVal, speedVal, angleVal;
    let forceEnabled, velocityEnabled, motionEnabled, accelerationEnabled, airEnabled;
  
    let trajCache    = null;   // { meta, series, impact, rest, events }
    let tLand        = 0;
    let tApex        = 0;
    let t_s          = 0;      // current simulation time
    let paused       = false;
    let landed       = false;
    let playbackSpeed = 1.0;
    let scrubbing    = false;
    let prePausedState = false;
    let trail        = [];     // [{x,y}, ...]
  
    let charts       = {};     // key -> Chart instance
    let visibleKeys  = new Set();
    let chartCounter = 0;
  
    let lastFetchTime = 0;
  
    // ────────────────────────────────────────────────────────────────────────
    // 5. Config normalization from window.__SIM_CFG__
    // ────────────────────────────────────────────────────────────────────────
    function applyInjectedSimCfg() {
      const cfg = window.__SIM_CFG__ || {};
  
      // numeric inputs
      massVal   = cfg.ballMass       != null ? cfg.ballMass       : parseFloat(document.getElementById("massInput").value)     || 1;
      heightVal = cfg.dropHeight_m   != null ? cfg.dropHeight_m   : parseFloat(document.getElementById("heightInput").value)   || 100;
      speedVal  = cfg.launchSpeed_mps!= null ? cfg.launchSpeed_mps: parseFloat(document.getElementById("velocityInput").value) || 30;
      angleVal  = cfg.launchAngle_deg!= null ? cfg.launchAngle_deg: parseFloat(document.getElementById("angleInput").value)    || 45;
  
      // sync DOM
      document.getElementById("massInput").value     = massVal;
      document.getElementById("heightInput").value    = heightVal;
      document.getElementById("velocityInput").value  = speedVal;
      document.getElementById("angleInput").value     = angleVal;
  
      // air
      airEnabled = cfg.airEnabled === true;
      document.getElementById("airCheckbox").checked = airEnabled;
  
      // mode exclusivity: exactly ONE of (force, velocity, motion) must be true
      let f = cfg.forceEnabled, v = cfg.velocityEnabled, m = cfg.motionEnabled;
      const count = [f, v, m].filter(x => x === true).length;
      if (count !== 1) {
        f = true; v = false; m = false;
      }
      forceEnabled    = !!f;
      velocityEnabled = !!v;
      motionEnabled   = !!m;
      accelerationEnabled = false; // only UI
  
      document.getElementById("forceCheckbox").checked        = forceEnabled;
      document.getElementById("vectorCheckbox").checked        = velocityEnabled;
      document.getElementById("motionCheckbox").checked        = motionEnabled;
      document.getElementById("accelerationCheckbox").checked  = accelerationEnabled;
    }
  
    applyInjectedSimCfg(); // runs BEFORE any Matter/Chart creation
  
    // ────────────────────────────────────────────────────────────────────────
    // 6. Helper functions
    // ────────────────────────────────────────────────────────────────────────
  
    // -- Math helpers --
    function degToRad(d) { return d * Math.PI / 180; }
  
    function metersToPixelsX(mx) {
      return (mx / maxRange_m) * canvasWidth;
    }
    function metersToPixelsY(my) {
      return GROUND_TOP_Y - (my / maxHeight_m) * (GROUND_TOP_Y);
    }
  
    function preImpactEps() {
      return tLand > 0.1 ? 0.005 : 0.001;
    }
    function preLandingTime() {
      return Math.max(tLand - preImpactEps(), 0);
    }
  
    // -- Interpolation from series --
    function getStateAtTime(t) {
      if (!trajCache || !trajCache.series || trajCache.series.length === 0) return null;
      const s = trajCache.series;
      if (t <= s[0].time_s) return { ...s[0] };
      if (t >= s[s.length - 1].time_s) return { ...s[s.length - 1] };
  
      // binary search
      let lo = 0, hi = s.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (s[mid].time_s <= t) lo = mid; else hi = mid;
      }
      const a = s[lo], b = s[hi];
      const dt = b.time_s - a.time_s;
      if (dt < 1e-12) return { ...a };
      const frac = (t - a.time_s) / dt;
  
      const interp = {};
      for (const k of Object.keys(a)) {
        if (typeof a[k] === "number" && typeof b[k] === "number") {
          interp[k] = a[k] + (b[k] - a[k]) * frac;
        } else {
          interp[k] = frac < 0.5 ? a[k] : b[k];
        }
      }
      return interp;
    }
  
    // -- Backend fetch --
    async function fetchTrajectorySeries() {
      const eps = preImpactEps();
      const url = `${BASE_URL}/projectile_series?mass=${massVal}&height=${heightVal}&speed=${speedVal}&angle=${angleVal}&dt=0.02&eps=${eps}&g=${g}`;
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        trajCache = data;
        tLand = data.meta.t_land || 0;
        tApex = data.meta.t_apex || 0;
        ensureBoundarySamples();
        updateScrubberMax();
      } catch (e) {
        console.error("fetchTrajectorySeries error:", e);
      }
    }
  
    async function fetchSinglePoint(t) {
      const url = `${BASE_URL}/projectile?t=${t}&mass=${massVal}&height=${heightVal}&speed=${speedVal}&angle=${angleVal}&eps=${preImpactEps()}&g=${g}&vectors=`;
      try {
        const resp = await fetch(url);
        return await resp.json();
      } catch (e) {
        console.error("fetchSinglePoint error:", e);
        return null;
      }
    }
  
    function ensureBoundarySamples() {
      if (!trajCache || !trajCache.series) return;
      const s = trajCache.series;
  
      // ensure t=0 exists
      if (s.length === 0 || s[0].time_s > 1e-9) {
        const st0 = trajCache.events ? trajCache.events.start : null;
        if (st0) s.unshift({ ...st0, time_s: 0 });
      }
  
      // ensure landing point at tLand with Fn=Fg
      if (tLand > 0) {
        const Fg = massVal * g;
        const last = s[s.length - 1];
        if (Math.abs(last.time_s - tLand) > 1e-6) {
          // insert impact from cache
          if (trajCache.impact) {
            const imp = { ...trajCache.impact };
            imp.Fn = Fg;
            imp.onGround = true;
            s.push(imp);
          }
        } else {
          // fix existing last point
          last.Fn = Fg;
          last.onGround = true;
        }
  
        // keep pre-impact velocities at landing so graphs don't drop
        const landPt = s.find(pt => Math.abs(pt.time_s - tLand) < 1e-6);
        if (landPt && trajCache.impact) {
          landPt.vx = trajCache.impact.vx;
          landPt.vy = trajCache.impact.vy;
          landPt.v  = trajCache.impact.v;
        }
  
        // normalize rest
        if (trajCache.rest) {
          trajCache.rest.time_s = tLand;
          trajCache.rest.Fn = Fg;
          trajCache.rest.vx = 0;
          trajCache.rest.vy = 0;
          trajCache.rest.v  = 0;
          trajCache.rest.ax = 0;
          trajCache.rest.ay = 0;
        }
      }
  
      // sort
      s.sort((a, b) => a.time_s - b.time_s);
    }
  
    // -- Scrubber --
    function updateScrubberMax() {
      const scrubber = document.getElementById("timeScrubber");
      const mx = Math.ceil(tLand / 0.01) * 0.01;
      scrubber.max = mx > 0 ? mx : 10;
    }
  
    // -- Charts --
    const chartLabels = {
      x_t:  { title: "x vs t",  xLabel: "t (s)", yLabel: "x (m)" },
      y_t:  { title: "y vs t",  xLabel: "t (s)", yLabel: "y (m)" },
      vx_t: { title: "vx vs t", xLabel: "t (s)", yLabel: "vx (m/s)" },
      vy_t: { title: "vy vs t", xLabel: "t (s)", yLabel: "vy (m/s)" },
      Fg_t: { title: "Fg vs t", xLabel: "t (s)", yLabel: "Fg (N)" },
      Fn_t: { title: "Fn vs t", xLabel: "t (s)", yLabel: "Fn (N)" },
      Fg_m: { title: "Fg vs m", xLabel: "m (kg)", yLabel: "Fg (N)" },
      ax_t: { title: "ax vs t", xLabel: "t (s)", yLabel: "ax (m/s²)" },
      ay_t: { title: "ay vs t", xLabel: "t (s)", yLabel: "ay (m/s²)" },
    };
  
    function createLineChart(canvasId, label) {
      const ctx = document.getElementById(canvasId);
      if (!ctx) return null;
      const info = chartLabels[label] || { title: label, xLabel: "", yLabel: "" };
      return new Chart(ctx, {
        type: "scatter",
        data: {
          datasets: [
            {
              label: info.title,
              data: [],
              showLine: true,
              pointRadius: 0,
              borderColor: "#3498db",
              borderWidth: 1.5,
              fill: false,
              tension: 0,
            },
            {
              label: "Dot",
              data: [],
              showLine: false,
              pointRadius: 5,
              pointBackgroundColor: "#e74c3c",
              borderColor: "#e74c3c",
              hidden: true,
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
              text: info.title,
              color: "#ccc",
              font: { size: 11 },
            },
          },
          scales: {
            x: {
              type: "linear",
              title: { display: true, text: info.xLabel, color: "#888", font: { size: 10 } },
              ticks: { color: "#666", font: { size: 9 } },
              grid: { color: "rgba(255,255,255,0.05)" },
            },
            y: {
              title: { display: true, text: info.yLabel, color: "#888", font: { size: 10 } },
              ticks: { color: "#666", font: { size: 9 } },
              grid: { color: "rgba(255,255,255,0.05)" },
            },
          },
        },
      });
    }
  
    function getChartDataForState(key, st) {
      switch (key) {
        case "x_t":  return { x: st.time_s, y: st.x };
        case "y_t":  return { x: st.time_s, y: st.y };
        case "vx_t": return { x: st.time_s, y: st.vx };
        case "vy_t": return { x: st.time_s, y: st.vy };
        case "Fg_t": return { x: st.time_s, y: st.Fg };
        case "Fn_t": return { x: st.time_s, y: st.Fn };
        case "Fg_m": return { x: massVal,   y: st.Fg };
        case "ax_t": return { x: st.time_s, y: st.ax };
        case "ay_t": return { x: st.time_s, y: st.ay };
        default:     return { x: 0, y: 0 };
      }
    }
  
    function pushChartHistory(st) {
      for (const key of Object.keys(charts)) {
        if (!visibleKeys.has(key)) continue;
        const ch = charts[key];
        if (!ch) continue;
        const pt = getChartDataForState(key, st);
        const ds = ch.data.datasets[0];
        if (ds.data.length < PERF.maxLinePoints) {
          ds.data.push(pt);
        }
      }
    }
  
    function setMovingDotAtState(st) {
      for (const key of Object.keys(charts)) {
        if (!visibleKeys.has(key)) continue;
        const ch = charts[key];
        if (!ch) continue;
        const pt = getChartDataForState(key, st);
        ch.data.datasets[1].data = [pt];
        ch.data.datasets[1].hidden = false;
      }
    }
  
    function updateVisibleCharts() {
      for (const key of Object.keys(charts)) {
        if (!visibleKeys.has(key)) continue;
        const ch = charts[key];
        if (ch) ch.update("none");
      }
    }
  
    function clearAllCharts() {
      for (const key of Object.keys(charts)) {
        const ch = charts[key];
        if (!ch) continue;
        ch.data.datasets[0].data = [];
        ch.data.datasets[1].data = [];
        ch.data.datasets[1].hidden = true;
      }
    }
  
    function rebuildChartsToTime(targetT) {
      clearAllCharts();
      if (!trajCache || !trajCache.series) return;
      for (const sample of trajCache.series) {
        if (sample.time_s > targetT + 1e-9) break;
        pushChartHistory(sample);
      }
      const st = getStateAtTime(targetT);
      if (st) setMovingDotAtState(st);
      updateVisibleCharts();
    }
  
    function seedChartAtT0() {
      if (!trajCache || !trajCache.events) return;
      const st0 = trajCache.events.start;
      pushChartHistory(st0);
      setMovingDotAtState(st0);
      updateVisibleCharts();
    }
  
    // -- Graph visibility --
    function updateGraphVisibility() {
      let showSet = new Set();
      if (forceEnabled)        showSet = new Set(["Fg_t","Fn_t","Fg_m"]);
      if (velocityEnabled)     showSet = new Set(["vx_t","vy_t"]);
      if (motionEnabled)       showSet = new Set(["x_t","y_t","vx_t","vy_t","ax_t","ay_t"]);
      if (accelerationEnabled) showSet = new Set(["ax_t","ay_t"]);
  
      visibleKeys = showSet;
  
      for (const [key, canvasId] of Object.entries(GRAPH_CANVAS)) {
        const wrap = document.getElementById(canvasId)?.parentElement;
        if (wrap) {
          wrap.classList.toggle("visible", showSet.has(key));
        }
      }
    }
  
    // -- Key box visibility --
    function updateKeyBox() {
      document.getElementById("keyForces").style.display    = forceEnabled ? "" : "none";
      document.getElementById("keyVelocity").style.display  = velocityEnabled ? "" : "none";
      document.getElementById("keyMotion").style.display    = motionEnabled ? "" : "none";
      document.getElementById("keyRowTrail").style.display  = motionEnabled ? "" : "none";
      document.getElementById("keyRowFd").style.display     = (forceEnabled && airEnabled) ? "" : "none";
    }
  
    // ────────────────────────────────────────────────────────────────────────
    // 7. Chart creation helpers (creation itself only in initRun)
    // ────────────────────────────────────────────────────────────────────────
    function createAllCharts() {
      for (const [key, canvasId] of Object.entries(GRAPH_CANVAS)) {
        charts[key] = createLineChart(canvasId, key);
      }
    }
  
    // ────────────────────────────────────────────────────────────────────────
    // 8. Render overlay functions
    // ────────────────────────────────────────────────────────────────────────
  
    function drawArrow(ctx, fromX, fromY, toX, toY, color, lineWidth, label, dashed) {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) return;
  
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle   = color;
      ctx.lineWidth   = lineWidth || 2;
      if (dashed) ctx.setLineDash([5, 4]);
  
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
  
      // arrowhead
      const headLen = Math.min(10, len * 0.3);
      const angle   = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headLen * Math.cos(angle - 0.4), toY - headLen * Math.sin(angle - 0.4));
      ctx.lineTo(toX - headLen * Math.cos(angle + 0.4), toY - headLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
  
      if (label) {
        ctx.font = "11px sans-serif";
        ctx.fillText(label, toX + 5, toY - 5);
      }
      ctx.restore();
    }
  
    function drawDot(ctx, x, y, radius, color, label) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (label) {
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x + radius + 4, y - radius);
      }
      ctx.restore();
    }
  
    function drawTrail(ctx) {
      if (trail.length < 2) return;
      ctx.save();
      ctx.strokeStyle = COLORS.trail;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  
    function drawGrid(ctx) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvasWidth; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND_TOP_Y); ctx.stroke();
      }
      for (let y = 0; y <= GROUND_TOP_Y; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y); ctx.stroke();
      }
      ctx.restore();
    }
  
    function getBallScreenPos(st) {
      if (!st) return { sx: 50, sy: GROUND_TOP_Y - ballRadius };
      const sx = metersToPixelsX(st.x);
      const sy = metersToPixelsY(st.y);
      return { sx, sy };
    }
  
    // landmark label helpers
    function getStartLabel() {
      if (heightVal <= 0) return "Start (ground)";
      return "Start";
    }
    function getApexLabel() {
      if (angleVal <= 0) return "Apex (flat)";
      if (angleVal >= 90) return "Apex (vertical)";
      return "Apex";
    }
    function getEndLabel() {
      return "End (landing)";
    }
  
    // ────────────────────────────────────────────────────────────────────────
    // 9. beforeUpdate handler
    // ────────────────────────────────────────────────────────────────────────
    function handleBeforeUpdate(event) {
      if (paused || scrubbing || !trajCache) return;
  
      const delta = event.delta || 16.67;
      t_s += (delta / 1000) * playbackSpeed;
  
      if (t_s >= tLand && tLand > 0) {
        t_s = tLand;
        landed = true;
        paused = true;
        document.getElementById("pauseBtn").textContent = "Play";
      }
  
      const st = getStateAtTime(t_s);
      if (!st || !ball) return;
  
      const { sx, sy } = getBallScreenPos(st);
      Body.setPosition(ball, { x: sx, y: sy });
  
      // trail
      if (motionEnabled && !landed) {
        const last = trail.length > 0 ? trail[trail.length - 1] : null;
        if (!last || Math.hypot(sx - last.x, sy - last.y) >= TRAIL_MIN_DIST_PX) {
          trail.push({ x: sx, y: sy });
          if (trail.length > TRAIL_MAX_POINTS) trail.shift();
        }
      }
  
      // update scrubber position
      document.getElementById("timeScrubber").value = t_s;
      document.getElementById("scrubberTimeLabel").textContent = t_s.toFixed(2) + " s";
  
      // charts
      chartCounter++;
      if (chartCounter % CHART_UPDATE_EVERY === 0) {
        pushChartHistory(st);
        setMovingDotAtState(st);
        updateVisibleCharts();
      }
    }
  
    // ────────────────────────────────────────────────────────────────────────
    // 10. afterRender handler
    // ────────────────────────────────────────────────────────────────────────
    function handleAfterRender() {
      if (!render || !render.canvas) return;
      const ctx = render.canvas.getContext("2d");
      if (!ctx) return;
  
      drawGrid(ctx);
  
      const st = getStateAtTime(t_s);
      if (!st || !ball) return;
  
      const bx = ball.position.x;
      const by = ball.position.y;
      const arrowScale = 3;
      const velScale   = 2;
  
      // Is at ground/end/right edge?
      const atGround = st.onGround || landed || (tLand > 0 && t_s >= tLand - 1e-6);
  
      // ── Force mode ──
      if (forceEnabled) {
        // Fg always (downward)
        const fgLen = st.Fg * arrowScale;
        drawArrow(ctx, bx, by, bx, by + fgLen, COLORS.Fg, 2.5, `Fg=${st.Fg.toFixed(1)}N`);
  
        // Fn only on ground
        if (atGround) {
          const fnVal = st.Fg; // on ground Fn = Fg
          const fnLen = fnVal * arrowScale;
          drawArrow(ctx, bx, by, bx, by - fnLen, COLORS.Fn, 2.5, `Fn=${fnVal.toFixed(1)}N`);
        }
  
        // Air drag visual
        if (airEnabled) {
          const v = st.v || 0;
          if (v > 0.5) {
            // visual only drag triangle
            const fdMag = 0.5 * 1.225 * 0.47 * Math.PI * (ballRadius/100) * (ballRadius/100) * v * v;
            const angle = Math.atan2(-st.vy, -st.vx);
            const fdx = fdMag * Math.cos(angle) * arrowScale * 0.5;
            const fdy = fdMag * Math.sin(angle) * arrowScale * 0.5;
            drawArrow(ctx, bx, by, bx + fdx, by + fdy, COLORS.Fd, 2, "Fd", true);
          }
        }
      }
  
      // ── Velocity mode ──
      if (velocityEnabled) {
        const vxLen = st.vx * velScale;
        const vyLen = -st.vy * velScale; // screen Y is inverted
        drawArrow(ctx, bx, by, bx + vxLen, by, COLORS.Vx, 2, `Vx=${st.vx.toFixed(1)}`);
        drawArrow(ctx, bx, by, bx, by + vyLen, COLORS.Vy, 2, `Vy=${st.vy.toFixed(1)}`);
        // resultant
        drawArrow(ctx, bx, by, bx + vxLen, by + vyLen, COLORS.V, 1.5, `V=${st.v.toFixed(1)}`, true);
      }
  
      // ── Motion mode ──
      if (motionEnabled) {
        drawTrail(ctx);
        // coordinate arrows (dashed)
        drawArrow(ctx, 0, by, bx, by, COLORS.coordX, 1.5, null, true);
        drawArrow(ctx, bx, GROUND_TOP_Y, bx, by, COLORS.coordY, 1.5, null, true);
      }
  
      // ── Acceleration mode ──
      if (accelerationEnabled) {
        const ayLen = Math.abs(st.ay) * arrowScale;
        if (ayLen > 1) {
          const dir = st.ay < 0 ? 1 : -1; // down on screen
          drawArrow(ctx, bx, by, bx, by + dir * ayLen, COLORS.ay, 2.5, `ay=${st.ay.toFixed(1)} m/s²`);
        }
        if (Math.abs(st.ax) > 0.01) {
          const axLen = Math.abs(st.ax) * arrowScale;
          const dir = st.ax > 0 ? 1 : -1;
          drawArrow(ctx, bx, by, bx + dir * axLen, by, COLORS.ax, 2.5, `ax=${st.ax.toFixed(1)} m/s²`);
        }
      }
  
      // ── Landmark dots ──
      if (trajCache && trajCache.events) {
        // Start dot
        const s0 = trajCache.events.start;
        const sp0 = getBallScreenPos(s0);
        drawDot(ctx, sp0.sx, sp0.sy, 4, "#fff", getStartLabel());
  
        // Apex dot (only if meaningful)
        if (tApex > 0 && tApex < tLand) {
          const sA = trajCache.events.apex;
          const spA = getBallScreenPos(sA);
          drawDot(ctx, spA.sx, spA.sy, 4, "#ffd700", getApexLabel());
        }
  
        // End dot
        if (tLand > 0) {
          const sE = trajCache.events.impact;
          const spE = getBallScreenPos(sE);
          drawDot(ctx, spE.sx, spE.sy, 4, "#ff4444", getEndLabel());
        }
      }
    }
  
    // ────────────────────────────────────────────────────────────────────────
    // 11. Controls + mode toggles + speed buttons
    // ────────────────────────────────────────────────────────────────────────
  
    function setExclusiveMode(mode) {
      forceEnabled        = mode === "force";
      velocityEnabled     = mode === "velocity";
      motionEnabled       = mode === "motion";
      accelerationEnabled = mode === "acceleration";
  
      document.getElementById("forceCheckbox").checked        = forceEnabled;
      document.getElementById("vectorCheckbox").checked        = velocityEnabled;
      document.getElementById("motionCheckbox").checked        = motionEnabled;
      document.getElementById("accelerationCheckbox").checked  = accelerationEnabled;
  
      updateGraphVisibility();
      updateKeyBox();
      updateVisibleCharts();
    }
  
    function bindModeCheckboxes() {
      document.getElementById("forceCheckbox").addEventListener("change", () => setExclusiveMode("force"));
      document.getElementById("vectorCheckbox").addEventListener("change", () => setExclusiveMode("velocity"));
      document.getElementById("motionCheckbox").addEventListener("change", () => setExclusiveMode("motion"));
      document.getElementById("accelerationCheckbox").addEventListener("change", () => setExclusiveMode("acceleration"));
      document.getElementById("airCheckbox").addEventListener("change", (e) => {
        airEnabled = e.target.checked;
        updateKeyBox();
      });
    }
  
    function bindInputs() {
      const ids = ["massInput", "heightInput", "velocityInput", "angleInput"];
      for (const id of ids) {
        document.getElementById(id).addEventListener("change", () => {
          massVal   = parseFloat(document.getElementById("massInput").value) || 1;
          heightVal = parseFloat(document.getElementById("heightInput").value) || 0;
          speedVal  = parseFloat(document.getElementById("velocityInput").value) || 0;
          angleVal  = parseFloat(document.getElementById("angleInput").value) || 45;
          doRestart();
        });
      }
    }
  
    function setPlaybackSpeed(sp) {
      playbackSpeed = sp;
      if (engine) engine.timing.timeScale = sp;
      document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.classList.toggle("active", parseFloat(btn.dataset.speed) === sp);
      });
    }
  
    function bindSpeedButtons() {
      document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          setPlaybackSpeed(parseFloat(btn.dataset.speed));
        });
      });
    }
  
    function doPause() {
      paused = !paused;
      document.getElementById("pauseBtn").textContent = paused ? "Play" : "Pause";
    }
  
    async function doRestart() {
      paused  = false;
      landed  = false;
      t_s     = 0;
      trail   = [];
      chartCounter = 0;
      document.getElementById("pauseBtn").textContent = "Pause";
      document.getElementById("timeScrubber").value = 0;
      document.getElementById("scrubberTimeLabel").textContent = "0.00 s";
  
      clearAllCharts();
      await fetchTrajectorySeries();
      seedChartAtT0();
  
      // reset ball position
      if (trajCache && trajCache.events && ball) {
        const st0 = trajCache.events.start;
        const { sx, sy } = getBallScreenPos(st0);
        Body.setPosition(ball, { x: sx, y: sy });
      }
    }
  
    function doFrameStart() {
      paused = true;
      landed = false;
      t_s    = 0;
      trail  = [];
      document.getElementById("pauseBtn").textContent = "Play";
      document.getElementById("timeScrubber").value = 0;
      document.getElementById("scrubberTimeLabel").textContent = "0.00 s";
  
      // dot-only at t=0
      clearAllCharts();
      if (trajCache && trajCache.events) {
        const st0 = trajCache.events.start;
        setMovingDotAtState(st0);
        updateVisibleCharts();
        const { sx, sy } = getBallScreenPos(st0);
        if (ball) Body.setPosition(ball, { x: sx, y: sy });
      }
    }
  
    function doFrameApex() {
      if (!trajCache || tApex <= 0) return;
      paused = true;
      landed = false;
      t_s    = tApex;
      document.getElementById("pauseBtn").textContent = "Play";
      document.getElementById("timeScrubber").value = tApex;
      document.getElementById("scrubberTimeLabel").textContent = tApex.toFixed(2) + " s";
  
      rebuildChartsToTime(tApex);
  
      const stA = getStateAtTime(tApex);
      if (stA && ball) {
        const { sx, sy } = getBallScreenPos(stA);
        Body.setPosition(ball, { x: sx, y: sy });
      }
    }
  
    function doFrameEnd() {
      if (!trajCache || tLand <= 0) return;
      paused = true;
      landed = true;
      t_s    = tLand;
      document.getElementById("pauseBtn").textContent = "Play";
  
      const scrubMax = Math.ceil(tLand / 0.01) * 0.01;
      document.getElementById("timeScrubber").value = scrubMax;
      document.getElementById("scrubberTimeLabel").textContent = tLand.toFixed(2) + " s";
  
      // visuals at preLandingTime
      const plt = preLandingTime();
      const stVis = getStateAtTime(plt);
      if (stVis && ball) {
        const { sx, sy } = getBallScreenPos(stVis);
        Body.setPosition(ball, { x: sx, y: sy });
      }
  
      // graphs rebuilt to tLand (includes Fn=Fg)
      rebuildChartsToTime(tLand);
    }
  
    function bindButtons() {
      document.getElementById("pauseBtn").addEventListener("click", doPause);
      document.getElementById("restartBtn").addEventListener("click", doRestart);
      document.getElementById("frameStartBtn").addEventListener("click", doFrameStart);
      document.getElementById("frameApexBtn").addEventListener("click", doFrameApex);
      document.getElementById("frameEndBtn").addEventListener("click", doFrameEnd);
    }
  
    // ────────────────────────────────────────────────────────────────────────
    // 12. Scrubber (beginScrub / endScrub + pointer/mouse/touch)
    // ────────────────────────────────────────────────────────────────────────
  
    function beginScrub() {
      if (!scrubbing) {
        prePausedState = paused;
        scrubbing = true;
        // pause internally WITHOUT changing button label
      }
    }
  
    function endScrub() {
      if (!scrubbing) return;
      scrubbing = false;
  
      const scrubber = document.getElementById("timeScrubber");
      const val = parseFloat(scrubber.value);
  
      const scrubMax = parseFloat(scrubber.max);
  
      // left edge: like restart-at-start
      if (val <= 0.005) {
        doFrameStart();
        return;
      }
  
      // right edge: snap to true end
      if (val >= scrubMax - 0.005) {
        doFrameEnd();
        return;
      }
  
      // middle: stay paused at current scrub position
      paused = true;
      document.getElementById("pauseBtn").textContent = "Play";
    }
  
    function onScrubInput() {
      const val = parseFloat(document.getElementById("timeScrubber").value);
      t_s = val;
      document.getElementById("scrubberTimeLabel").textContent = val.toFixed(2) + " s";
  
      const st = getStateAtTime(val);
      if (st && ball) {
        const { sx, sy } = getBallScreenPos(st);
        Body.setPosition(ball, { x: sx, y: sy });
      }
  
      rebuildChartsToTime(val);
    }
  
    function bindScrubber() {
      const scrubber = document.getElementById("timeScrubber");
  
      scrubber.addEventListener("pointerdown", beginScrub);
      scrubber.addEventListener("mousedown",   beginScrub);
      scrubber.addEventListener("touchstart",  beginScrub, { passive: true });
  
      scrubber.addEventListener("pointerup",  endScrub);
      scrubber.addEventListener("mouseup",    endScrub);
      scrubber.addEventListener("touchend",   endScrub);
  
      scrubber.addEventListener("input", onScrubInput);
    }
  
    // ────────────────────────────────────────────────────────────────────────
    // 13. initRun() — SOLE side-effect origin
    // ────────────────────────────────────────────────────────────────────────
    async function initRun() {
      // Create engine with gravity disabled (backend controls motion)
      engine = Engine.create();
      engine.gravity.y = 0;
      engine.gravity.x = 0;
  
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
      ground = Bodies.rectangle(canvasWidth / 2, GROUND_CENTER_Y, canvasWidth, groundHeight_px, {
        isStatic: true,
        render: { fillStyle: "#2d5016" },
      });
  
      ball = Bodies.circle(50, GROUND_TOP_Y - ballRadius, ballRadius, {
        render: { fillStyle: "#e74c3c" },
      });
  
      World.add(engine.world, [ground, ball]);
  
      // Bind events on engine / render
      Events.on(engine, "beforeUpdate", handleBeforeUpdate);
      Events.on(render, "afterRender",  handleAfterRender);
  
      // Create charts
      createAllCharts();
  
      // Bind DOM
      bindModeCheckboxes();
      bindInputs();
      bindSpeedButtons();
      bindButtons();
      bindScrubber();
  
      // Initial mode
      updateGraphVisibility();
      updateKeyBox();
  
      // Fetch initial trajectory
      await fetchTrajectorySeries();
      seedChartAtT0();
  
      // Position ball at start
      if (trajCache && trajCache.events) {
        const st0 = trajCache.events.start;
        const { sx, sy } = getBallScreenPos(st0);
        Body.setPosition(ball, { x: sx, y: sy });
      }
  
      // Start render + runner
      Render.run(render);
      Runner.run(runner, engine);
    }
  
    // Kick off
    initRun();
  
  });
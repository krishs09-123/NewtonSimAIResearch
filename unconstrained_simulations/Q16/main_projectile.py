"""
main_projectile.py — FastAPI backend for ideal projectile simulation.
No air resistance. Two endpoints: /projectile and /projectile_series.
"""

import math
from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Projectile Simulation Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rounding ──────────────────────────────────────────────────────────────────

TIME_KEYS = {"time_s", "t_land", "t_apex", "t_pre", "dt"}


def round_floats(obj, _key=None):
    """Recursively round floats: TIME_KEYS to 6 decimals, others to 2."""
    if isinstance(obj, dict):
        return {k: round_floats(v, _key=k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [round_floats(v) for v in obj]
    if isinstance(obj, float):
        if _key in TIME_KEYS:
            return round(obj, 6)
        return round(obj, 2)
    return obj


# ── Physics helpers ───────────────────────────────────────────────────────────


def _compute_meta(mass: float, height: float, speed: float, angle_deg: float,
                  g: float, eps: float):
    """Compute trajectory metadata: initial velocities, landing time, apex, etc."""
    angle_rad = math.radians(angle_deg)
    vx0 = speed * math.cos(angle_rad)
    vy0 = speed * math.sin(angle_rad)

    # Landing time: solve  height + vy0*t - 0.5*g*t^2 = 0
    # => -0.5g t^2 + vy0 t + height = 0
    # => 0.5g t^2 - vy0 t - height = 0
    a_coeff = 0.5 * g
    b_coeff = -vy0
    c_coeff = -height

    disc = b_coeff ** 2 - 4 * a_coeff * c_coeff

    if disc < 0:
        # Should not happen for valid inputs; fallback
        t_land = 0.0
    else:
        sqrt_disc = math.sqrt(disc)
        t1 = (-b_coeff + sqrt_disc) / (2 * a_coeff)
        t2 = (-b_coeff - sqrt_disc) / (2 * a_coeff)
        # Take the positive root
        candidates = [t for t in [t1, t2] if t > 1e-9]
        t_land = min(candidates) if candidates else 0.0

    # On-ground-at-start: height≈0 and vy0≈0 and speed≈0
    if height < 1e-6 and abs(vy0) < 1e-6 and speed < 1e-6:
        t_land = 0.0

    # Apex time: vy0 - g*t_apex = 0  =>  t_apex = vy0/g
    t_apex = vy0 / g if g > 0 and vy0 > 0 else 0.0
    if t_apex > t_land:
        t_apex = 0.0  # No real apex if it would be after landing

    y_apex = height + vy0 * t_apex - 0.5 * g * t_apex ** 2 if t_apex > 0 else height
    x_land = vx0 * t_land
    t_pre = max(t_land - eps, 0.0)

    return {
        "vx0": vx0,
        "vy0": vy0,
        "t_land": t_land,
        "t_apex": t_apex,
        "y_apex": y_apex,
        "x_land": x_land,
        "t_pre": t_pre,
        "dt": 0.02,
    }


def _flight_state(t: float, mass: float, height: float,
                  vx0: float, vy0: float, g: float):
    """State during free flight at time t."""
    x = vx0 * t
    y = height + vy0 * t - 0.5 * g * t * t
    vx = vx0
    vy = vy0 - g * t
    v = math.sqrt(vx * vx + vy * vy)
    Fg = mass * g
    return {
        "time_s": t,
        "x": x,
        "y": max(y, 0.0),
        "vx": vx,
        "vy": vy,
        "ax": 0.0,
        "ay": -g,
        "Fg": Fg,
        "Fn": 0.0,
        "v": v,
        "onGround": False,
        "phase": "flight",
        "y_raw": y,
    }


def _rest_state(mass: float, x_land: float, g: float, t_land: float):
    """State at rest on ground after landing."""
    Fg = mass * g
    return {
        "time_s": t_land,
        "x": x_land,
        "y": 0.0,
        "vx": 0.0,
        "vy": 0.0,
        "ax": 0.0,
        "ay": 0.0,
        "Fg": Fg,
        "Fn": Fg,
        "v": 0.0,
        "onGround": True,
        "phase": "rest",
        "y_raw": 0.0,
    }


def _impact_snapshot(mass: float, x_land: float, vx0: float,
                     vy0: float, g: float, t_land: float, t_pre: float):
    """Impact moment: y=0, Fn=Fg, but keep pre-impact velocities."""
    Fg = mass * g
    # Use pre-impact velocities
    vy_pre = vy0 - g * t_pre
    v_pre = math.sqrt(vx0 * vx0 + vy_pre * vy_pre)
    return {
        "time_s": t_land,
        "x": x_land,
        "y": 0.0,
        "vx": vx0,
        "vy": vy_pre,
        "ax": 0.0,
        "ay": -g,
        "Fg": Fg,
        "Fn": Fg,
        "v": v_pre,
        "onGround": True,
        "phase": "impact",
        "y_raw": 0.0,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.get("/projectile")
def get_projectile(
    t: float = Query(0.0),
    mass: float = Query(1.0),
    height: float = Query(10.0),
    speed: float = Query(30.0),
    angle: float = Query(45.0),
    eps: float = Query(0.0),
    g: float = Query(9.81),
    vectors: Optional[str] = Query(None),
):
    meta = _compute_meta(mass, height, speed, angle, g, eps)
    vx0 = meta["vx0"]
    vy0 = meta["vy0"]
    t_land = meta["t_land"]
    x_land = meta["x_land"]
    t_pre = meta["t_pre"]

    # On-ground-at-start
    if t_land <= 1e-9 and height < 1e-6 and abs(vy0) < 1e-6:
        return round_floats(_rest_state(mass, 0.0, g, 0.0))

    # Past landing
    if t >= t_land:
        return round_floats(
            _impact_snapshot(mass, x_land, vx0, vy0, g, t_land, t_pre)
        )

    # Flight
    return round_floats(_flight_state(t, mass, height, vx0, vy0, g))


@app.get("/projectile_series")
def get_projectile_series(
    mass: float = Query(1.0),
    height: float = Query(10.0),
    speed: float = Query(30.0),
    angle: float = Query(45.0),
    dt: float = Query(0.02),
    eps: float = Query(0.0),
    g: float = Query(9.81),
):
    meta = _compute_meta(mass, height, speed, angle, g, eps)
    meta["dt"] = dt
    vx0 = meta["vx0"]
    vy0 = meta["vy0"]
    t_land = meta["t_land"]
    t_apex = meta["t_apex"]
    x_land = meta["x_land"]
    t_pre = meta["t_pre"]

    Fg = mass * g

    # On-ground-at-start
    if t_land <= 1e-9 and height < 1e-6 and abs(vy0) < 1e-6:
        rest = _rest_state(mass, 0.0, g, 0.0)
        start_evt = {"x": 0.0, "y": 0.0}
        return round_floats({
            "meta": meta,
            "series": [rest],
            "impact": rest,
            "rest": rest,
            "events": {
                "start": start_evt,
                "apex": None,
                "impact": start_evt,
                "rest": start_evt,
            },
        })

    # Build series
    series = []
    t_cur = 0.0
    apex_inserted = False

    while t_cur <= t_land + 1e-9:
        if t_cur > t_land:
            break

        # Insert apex sample if we're about to pass it
        if t_apex > 0 and not apex_inserted and t_cur + dt > t_apex and t_cur < t_apex:
            series.append(_flight_state(t_apex, mass, height, vx0, vy0, g))
            apex_inserted = True

        series.append(_flight_state(t_cur, mass, height, vx0, vy0, g))
        t_cur += dt

    # Ensure t_apex is in series if not yet
    if t_apex > 0 and not apex_inserted and t_apex <= t_land:
        series.append(_flight_state(t_apex, mass, height, vx0, vy0, g))

    # Add pre-impact sample
    if t_pre > 0 and t_pre < t_land:
        series.append(_flight_state(t_pre, mass, height, vx0, vy0, g))

    # Sort by time
    series.sort(key=lambda s: s["time_s"])

    # Impact and rest snapshots
    impact = _impact_snapshot(mass, x_land, vx0, vy0, g, t_land, t_pre)
    rest = _rest_state(mass, x_land, g, t_land)

    # Events
    start_pt = series[0] if series else _flight_state(0, mass, height, vx0, vy0, g)
    apex_pt = _flight_state(t_apex, mass, height, vx0, vy0, g) if t_apex > 0 else None

    events = {
        "start": {"x": start_pt["x"], "y": start_pt["y"]},
        "apex": {"x": apex_pt["x"], "y": apex_pt["y"]} if apex_pt else None,
        "impact": {"x": x_land, "y": 0.0},
        "rest": {"x": x_land, "y": 0.0},
    }

    return round_floats({
        "meta": meta,
        "series": series,
        "impact": impact,
        "rest": rest,
        "events": events,
    })
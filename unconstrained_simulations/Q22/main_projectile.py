"""
main_projectile.py — FastAPI backend for ideal projectile simulation.
NO air resistance. Pure kinematic equations.
"""

import math
from typing import Optional, List, Dict, Any
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

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
G_DEFAULT = 9.81
TIME_KEYS = {"time_s", "t_land", "t_apex", "t_pre"}


# ---------------------------------------------------------------------------
# Rounding utility
# ---------------------------------------------------------------------------
def round_floats(obj: Any) -> Any:
    """
    Recursively round floats:
      - TIME_KEYS -> 6 decimal places
      - all other floats -> 2 decimal places
    """
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if isinstance(v, float):
                out[k] = round(v, 6) if k in TIME_KEYS else round(v, 2)
            elif isinstance(v, (dict, list)):
                out[k] = round_floats(v)
            else:
                out[k] = v
        return out
    elif isinstance(obj, list):
        return [round_floats(item) for item in obj]
    else:
        return obj


# ---------------------------------------------------------------------------
# Physics helpers
# ---------------------------------------------------------------------------

def _initial_velocities(speed: float, angle_deg: float):
    angle_rad = math.radians(angle_deg)
    vx0 = speed * math.cos(angle_rad)
    vy0 = speed * math.sin(angle_rad)
    return vx0, vy0


def _compute_landing_time(height: float, vy0: float, g: float) -> float:
    """Time when projectile returns to y=0 (launched from height h with vy0 upward)."""
    # y(t) = height + vy0*t - 0.5*g*t^2 = 0
    # 0.5*g*t^2 - vy0*t - height = 0
    a = 0.5 * g
    b = -vy0
    c = -height
    disc = b * b - 4 * a * c
    if disc < 0:
        return 0.0
    sqrt_disc = math.sqrt(disc)
    t1 = (-b + sqrt_disc) / (2 * a)
    t2 = (-b - sqrt_disc) / (2 * a)
    # pick positive root
    candidates = [t for t in (t1, t2) if t > 1e-9]
    if not candidates:
        return 0.0
    return max(candidates)


def _compute_apex_time(vy0: float, g: float) -> float:
    if vy0 <= 0:
        return 0.0
    return vy0 / g


def _flight_state(t: float, height: float, vx0: float, vy0: float,
                  g: float, mass: float) -> Dict[str, Any]:
    """State at time t during flight (no air resistance)."""
    x = vx0 * t
    y_raw = height + vy0 * t - 0.5 * g * t * t
    y = max(y_raw, 0.0)
    vx = vx0
    vy = vy0 - g * t
    v = math.sqrt(vx * vx + vy * vy)
    ax = 0.0
    ay = -g
    Fg = mass * g
    on_ground = y <= 0.0
    Fn = Fg if on_ground else 0.0
    phase = "rest" if on_ground else "flight"
    return {
        "time_s": t,
        "x": x,
        "y": y,
        "vx": vx,
        "vy": vy,
        "ax": ax,
        "ay": ay,
        "Fg": Fg,
        "Fn": Fn,
        "v": v,
        "onGround": on_ground,
        "phase": phase,
        "y_raw": y_raw,
    }


def _rest_state(t: float, x: float, mass: float, g: float) -> Dict[str, Any]:
    """Ball at rest on ground."""
    Fg = mass * g
    return {
        "time_s": t,
        "x": x,
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


def _impact_snapshot(t_land: float, height: float, vx0: float, vy0: float,
                     g: float, mass: float, eps: float = 0.0) -> Dict[str, Any]:
    """
    Impact moment: ball reaches y=0.
    Velocities are from pre-impact (just before landing).
    Fn = Fg at landing.
    """
    t_pre = t_land - eps if eps > 0 else t_land
    if t_pre < 0:
        t_pre = 0.0
    vx = vx0
    vy = vy0 - g * t_pre
    v = math.sqrt(vx * vx + vy * vy)
    x = vx0 * t_land
    Fg = mass * g
    return {
        "time_s": t_land,
        "x": x,
        "y": 0.0,
        "vx": vx,
        "vy": vy,
        "ax": 0.0,
        "ay": -g,
        "Fg": Fg,
        "Fn": Fg,
        "v": v,
        "onGround": True,
        "phase": "impact",
        "y_raw": 0.0,
    }


def _meta(vx0, vy0, t_land, t_apex, y_apex, x_land, t_pre, dt):
    return {
        "vx0": vx0,
        "vy0": vy0,
        "t_land": t_land,
        "t_apex": t_apex,
        "y_apex": y_apex,
        "x_land": x_land,
        "t_pre": t_pre,
        "dt": dt,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/projectile")
def get_projectile_state(
    t: float = Query(0.0),
    mass: float = Query(1.0),
    height: float = Query(0.0),
    speed: float = Query(20.0),
    angle: float = Query(45.0),
    eps: float = Query(0.0),
    g: float = Query(G_DEFAULT),
    vectors: Optional[str] = Query(None),
):
    vx0, vy0 = _initial_velocities(speed, angle)
    t_land = _compute_landing_time(height, vy0, g)

    # On-ground-at-start handling
    if height <= 0.0 and abs(vy0) < 1e-6 and t <= 0.0:
        state = _rest_state(0.0, 0.0, mass, g)
        return round_floats(state)

    # Past landing
    if t_land > 0 and t >= t_land:
        state = _impact_snapshot(t_land, height, vx0, vy0, g, mass, eps)
        return round_floats(state)

    state = _flight_state(t, height, vx0, vy0, g, mass)
    return round_floats(state)


@app.get("/projectile_series")
def get_projectile_series(
    mass: float = Query(1.0),
    height: float = Query(0.0),
    speed: float = Query(20.0),
    angle: float = Query(45.0),
    dt: float = Query(0.02),
    eps: float = Query(0.0),
    g: float = Query(G_DEFAULT),
):
    vx0, vy0 = _initial_velocities(speed, angle)
    t_land = _compute_landing_time(height, vy0, g)
    t_apex = _compute_apex_time(vy0, g)
    y_apex = height + vy0 * t_apex - 0.5 * g * t_apex * t_apex if t_apex > 0 else height
    x_land = vx0 * t_land

    t_pre = max(t_land - eps, 0.0)

    # On-ground-at-start handling
    if height <= 0.0 and abs(vy0) < 1e-6:
        rest = _rest_state(0.0, 0.0, mass, g)
        rest_rounded = round_floats(rest)
        meta = _meta(vx0, vy0, 0.0, 0.0, 0.0, 0.0, 0.0, dt)
        payload = {
            "meta": meta,
            "series": [rest_rounded],
            "impact": rest_rounded,
            "rest": rest_rounded,
            "events": {
                "start": rest_rounded,
                "apex": rest_rounded,
                "impact": rest_rounded,
                "rest": rest_rounded,
            },
        }
        return round_floats(payload)

    # Build series
    series: List[Dict] = []
    t = 0.0
    apex_inserted = False

    while t <= t_land + 1e-9:
        # Insert apex sample if we cross it
        if not apex_inserted and t_apex > 0 and t >= t_apex:
            if abs(t - t_apex) > 1e-9:
                apex_st = _flight_state(t_apex, height, vx0, vy0, g, mass)
                series.append(apex_st)
            apex_inserted = True

        if t >= t_land - 1e-9:
            break

        st = _flight_state(t, height, vx0, vy0, g, mass)
        series.append(st)
        t += dt

    # Insert apex if not yet inserted (small flights)
    if not apex_inserted and t_apex > 0 and t_apex < t_land:
        apex_st = _flight_state(t_apex, height, vx0, vy0, g, mass)
        series.append(apex_st)

    # Pre-impact sample
    if eps > 0 and t_pre > 0 and t_pre < t_land:
        pre_st = _flight_state(t_pre, height, vx0, vy0, g, mass)
        series.append(pre_st)

    # Sort by time
    series.sort(key=lambda s: s["time_s"])

    # Impact snapshot
    impact = _impact_snapshot(t_land, height, vx0, vy0, g, mass, eps)

    # Rest snapshot
    rest = _rest_state(t_land, x_land, mass, g)

    # Start event
    start_st = _flight_state(0.0, height, vx0, vy0, g, mass)

    # Apex event
    if t_apex > 0 and t_apex < t_land:
        apex_ev = _flight_state(t_apex, height, vx0, vy0, g, mass)
    else:
        apex_ev = start_st.copy()

    meta = _meta(vx0, vy0, t_land, t_apex, y_apex, x_land, t_pre, dt)

    payload = {
        "meta": meta,
        "series": series,
        "impact": impact,
        "rest": rest,
        "events": {
            "start": start_st,
            "apex": apex_ev,
            "impact": impact,
            "rest": rest,
        },
    }
    return round_floats(payload)
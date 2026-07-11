"""
main_projectile.py — FastAPI backend for projectile simulation.
No air resistance. Ideal projectile / free-fall after release.
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

# ── Constants ────────────────────────────────────────────────────────────────
G_DEFAULT = 9.81

TIME_KEYS = {"time_s", "t_land", "t_apex", "t_pre"}


# ── Rounding helper ─────────────────────────────────────────────────────────
def round_floats(obj, time_keys=TIME_KEYS):
    """Round TIME_KEYS to 6 decimals, all other floats to 2 decimals."""
    if isinstance(obj, dict):
        return {
            k: round_floats(v, time_keys) if not isinstance(v, float)
            else round(v, 6) if k in time_keys
            else round(v, 2)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [round_floats(item, time_keys) for item in obj]
    if isinstance(obj, float):
        return round(obj, 2)
    return obj


# ── Physics helpers ──────────────────────────────────────────────────────────

def _initial_velocity(speed: float, angle_deg: float):
    rad = math.radians(angle_deg)
    vx0 = speed * math.cos(rad)
    vy0 = speed * math.sin(rad)
    return vx0, vy0


def _t_apex(vy0: float, g: float):
    """Time to reach apex (vy=0). Returns 0 if vy0 <= 0."""
    if vy0 <= 0:
        return 0.0
    return vy0 / g


def _t_land(height: float, vy0: float, g: float):
    """Time to land (y=0) from height with initial vy0 upward."""
    # y(t) = height + vy0*t - 0.5*g*t^2 = 0
    # 0.5*g*t^2 - vy0*t - height = 0
    a = 0.5 * g
    b = -vy0
    c = -height
    disc = b * b - 4 * a * c
    if disc < 0:
        disc = 0.0
    return (-b + math.sqrt(disc)) / (2 * a)


def _flight_state(t: float, height: float, vx0: float, vy0: float, g: float, mass: float):
    """Compute state at time t during flight (no air resistance)."""
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
        "y_raw": y,
        "vx": vx,
        "vy": vy,
        "ax": 0.0,
        "ay": -g,
        "Fg": Fg,
        "Fn": 0.0,
        "v": v,
        "onGround": False,
        "phase": "flight",
    }


def _rest_state(t: float, x: float, mass: float, g: float):
    """Ball at rest on ground."""
    Fg = mass * g
    return {
        "time_s": t,
        "x": x,
        "y": 0.0,
        "y_raw": 0.0,
        "vx": 0.0,
        "vy": 0.0,
        "ax": 0.0,
        "ay": 0.0,
        "Fg": Fg,
        "Fn": Fg,
        "v": 0.0,
        "onGround": True,
        "phase": "rest",
    }


def _impact_snapshot(t_land_val: float, vx0: float, vy0: float, g: float, mass: float, height: float):
    """Impact moment: on ground, Fn=Fg, but keep pre-impact velocities."""
    x_land = vx0 * t_land_val
    vy_impact = vy0 - g * t_land_val
    v_impact = math.sqrt(vx0 * vx0 + vy_impact * vy_impact)
    Fg = mass * g
    return {
        "time_s": t_land_val,
        "x": x_land,
        "y": 0.0,
        "y_raw": 0.0,
        "vx": vx0,
        "vy": vy_impact,
        "ax": 0.0,
        "ay": -g,
        "Fg": Fg,
        "Fn": Fg,
        "v": v_impact,
        "onGround": True,
        "phase": "impact",
    }


def _meta(vx0, vy0, t_land_val, t_apex_val, height, g, t_pre, dt):
    y_apex = height + vy0 * t_apex_val - 0.5 * g * t_apex_val * t_apex_val if t_apex_val > 0 else height
    x_land = vx0 * t_land_val
    return {
        "vx0": vx0,
        "vy0": vy0,
        "t_land": t_land_val,
        "t_apex": t_apex_val,
        "y_apex": y_apex,
        "x_land": x_land,
        "t_pre": t_pre,
        "dt": dt,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/projectile")
def projectile_point(
    t: float = Query(0.0),
    mass: float = Query(1.0),
    height: float = Query(0.0),
    speed: float = Query(10.0),
    angle: float = Query(45.0),
    eps: float = Query(0.0),
    g: float = Query(G_DEFAULT),
    vectors: Optional[str] = Query(None),
):
    vx0, vy0 = _initial_velocity(speed, angle)
    tl = _t_land(height, vy0, g)

    # On-ground-at-start handling
    if height <= 0.0 and abs(vy0) < 1e-6 and t <= 0.0:
        state = _rest_state(0.0, 0.0, mass, g)
        return round_floats(state)

    if t >= tl:
        state = _impact_snapshot(tl, vx0, vy0, g, mass, height)
        return round_floats(state)

    state = _flight_state(t, height, vx0, vy0, g, mass)
    return round_floats(state)


@app.get("/projectile_series")
def projectile_series(
    mass: float = Query(1.0),
    height: float = Query(0.0),
    speed: float = Query(10.0),
    angle: float = Query(45.0),
    dt: float = Query(0.02),
    eps: float = Query(0.0),
    g: float = Query(G_DEFAULT),
):
    vx0, vy0 = _initial_velocity(speed, angle)
    tl = _t_land(height, vy0, g)
    ta = _t_apex(vy0, g)
    t_pre = max(tl - eps, 0.0)

    # On-ground-at-start: height=0 and vy0≈0
    if height <= 0.0 and abs(vy0) < 1e-6:
        rest = _rest_state(0.0, 0.0, mass, g)
        meta = _meta(vx0, vy0, 0.0, 0.0, height, g, 0.0, dt)
        return round_floats({
            "meta": meta,
            "series": [rest],
            "impact": rest,
            "rest": rest,
            "events": {
                "start": rest,
                "apex": rest,
                "impact": rest,
                "rest": rest,
            }
        })

    series = []
    t = 0.0
    apex_added = False
    while t < tl:
        series.append(_flight_state(t, height, vx0, vy0, g, mass))
        # Insert apex sample if we'd skip past it
        next_t = t + dt
        if not apex_added and ta > 0 and t < ta <= next_t:
            series.append(_flight_state(ta, height, vx0, vy0, g, mass))
            apex_added = True
        t += dt

    # Pre-impact sample
    if eps > 0 and t_pre > 0 and (not series or series[-1]["time_s"] < t_pre):
        series.append(_flight_state(t_pre, height, vx0, vy0, g, mass))

    # Impact snapshot at tl
    impact = _impact_snapshot(tl, vx0, vy0, g, mass, height)
    series.append(impact)

    # Rest state
    x_land = vx0 * tl
    rest = _rest_state(tl, x_land, mass, g)

    # Start state
    start_state = _flight_state(0.0, height, vx0, vy0, g, mass)

    # Apex state
    if ta > 0 and ta < tl:
        apex_state = _flight_state(ta, height, vx0, vy0, g, mass)
    else:
        apex_state = start_state

    meta = _meta(vx0, vy0, tl, ta, height, g, t_pre, dt)

    return round_floats({
        "meta": meta,
        "series": series,
        "impact": impact,
        "rest": rest,
        "events": {
            "start": start_state,
            "apex": apex_state,
            "impact": impact,
            "rest": rest,
        }
    })
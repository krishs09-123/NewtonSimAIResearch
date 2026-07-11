"""
main_projectile.py — FastAPI backend for projectile simulation.

Physics: ideal projectile / free-fall (NO air resistance).
Endpoints:
  GET /projectile          — single-point query
  GET /projectile_series   — full trajectory series

Run:
  uvicorn main_projectile:app --reload --port 8000
"""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import math
from typing import Optional

app = FastAPI(title="Projectile Simulation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── constants ────────────────────────────────────────────────────────────────
G_DEFAULT = 9.81

TIME_KEYS = {"time_s", "t_land", "t_apex", "t_pre"}


def round_floats(obj, time_decimals=6, other_decimals=2):
    """Recursively round floats: TIME_KEYS → 6 dp, everything else → 2 dp."""
    if isinstance(obj, dict):
        return {
            k: round_floats(
                v,
                time_decimals if k in TIME_KEYS else other_decimals,
                other_decimals,
            )
            if k in TIME_KEYS
            else round_floats(v, other_decimals, other_decimals)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [round_floats(v, time_decimals, other_decimals) for v in obj]
    if isinstance(obj, float):
        return round(obj, time_decimals)
    return obj


def _round_dict(d: dict) -> dict:
    """Round a single state dict correctly."""
    out = {}
    for k, v in d.items():
        if isinstance(v, float):
            out[k] = round(v, 6) if k in TIME_KEYS else round(v, 2)
        else:
            out[k] = v
    return out


# ── physics helpers ──────────────────────────────────────────────────────────

def _compute_initial(mass, height, speed, angle_deg, g):
    angle_rad = math.radians(angle_deg)
    vx0 = speed * math.cos(angle_rad)
    vy0 = speed * math.sin(angle_rad)
    return vx0, vy0


def _compute_landing_time(height, vy0, g):
    """Time when y(t) = 0 again after launch from height."""
    # y(t) = height + vy0*t - 0.5*g*t^2 = 0
    a = -0.5 * g
    b = vy0
    c = height
    if abs(a) < 1e-12:
        if abs(b) < 1e-12:
            return 0.0
        t = -c / b
        return max(t, 0.0)
    disc = b * b - 4 * a * c
    if disc < 0:
        return 0.0
    sqrt_disc = math.sqrt(disc)
    t1 = (-b + sqrt_disc) / (2 * a)
    t2 = (-b - sqrt_disc) / (2 * a)
    candidates = [t for t in (t1, t2) if t > 1e-9]
    if not candidates:
        return 0.0
    return max(candidates)


def _compute_apex_time(vy0, g):
    if vy0 <= 0:
        return 0.0
    return vy0 / g


def _flight_state(t, vx0, vy0, height, mass, g):
    x = vx0 * t
    y_raw = height + vy0 * t - 0.5 * g * t * t
    y = max(y_raw, 0.0)
    vx = vx0
    vy = vy0 - g * t
    v = math.sqrt(vx * vx + vy * vy)
    ax = 0.0
    ay = -g
    Fg = mass * g
    Fn = 0.0
    on_ground = False
    phase = "flight"
    return {
        "time_s": float(t),
        "x": float(x),
        "y": float(y),
        "vx": float(vx),
        "vy": float(vy),
        "ax": float(ax),
        "ay": float(ay),
        "Fg": float(Fg),
        "Fn": float(Fn),
        "v": float(v),
        "onGround": on_ground,
        "phase": phase,
        "y_raw": float(y_raw),
    }


def _rest_state(t, x, mass, g):
    Fg = mass * g
    return {
        "time_s": float(t),
        "x": float(x),
        "y": 0.0,
        "vx": 0.0,
        "vy": 0.0,
        "ax": 0.0,
        "ay": 0.0,
        "Fg": float(Fg),
        "Fn": float(Fg),
        "v": 0.0,
        "onGround": True,
        "phase": "rest",
        "y_raw": 0.0,
    }


def _impact_snapshot(t_land, vx0, vy0, height, mass, g):
    """Impact moment: position at y=0, velocities from just before landing."""
    x_land = vx0 * t_land
    vx = vx0
    vy = vy0 - g * t_land
    v = math.sqrt(vx * vx + vy * vy)
    Fg = mass * g
    return {
        "time_s": float(t_land),
        "x": float(x_land),
        "y": 0.0,
        "vx": float(vx),
        "vy": float(vy),
        "ax": 0.0,
        "ay": float(-g),
        "Fg": float(Fg),
        "Fn": float(Fg),
        "v": float(v),
        "onGround": True,
        "phase": "impact",
        "y_raw": 0.0,
    }


def _meta(vx0, vy0, t_land, t_apex, y_apex, x_land, t_pre, dt):
    return {
        "vx0": float(vx0),
        "vy0": float(vy0),
        "t_land": float(t_land),
        "t_apex": float(t_apex),
        "y_apex": float(y_apex),
        "x_land": float(x_land),
        "t_pre": float(t_pre),
        "dt": float(dt),
    }


# ── endpoints ────────────────────────────────────────────────────────────────

@app.get("/projectile")
def get_projectile(
    t: float = Query(0.0),
    mass: float = Query(1.0),
    height: float = Query(0.0),
    speed: float = Query(10.0),
    angle: float = Query(45.0),
    eps: float = Query(0.0),
    g: float = Query(G_DEFAULT),
    vectors: str = Query(""),
):
    vx0, vy0 = _compute_initial(mass, height, speed, angle, g)

    # on-ground-at-start handling
    if height <= 1e-9 and abs(vy0) < 1e-9 and t <= 1e-9:
        return _round_dict(_rest_state(0.0, 0.0, mass, g))

    t_land = _compute_landing_time(height, vy0, g)

    if t >= t_land and t_land > 0:
        snap = _impact_snapshot(t_land, vx0, vy0, height, mass, g)
        return _round_dict(snap)

    state = _flight_state(t, vx0, vy0, height, mass, g)
    return _round_dict(state)


@app.get("/projectile_series")
def get_projectile_series(
    mass: float = Query(1.0),
    height: float = Query(0.0),
    speed: float = Query(10.0),
    angle: float = Query(45.0),
    dt: float = Query(0.02),
    eps: float = Query(0.0),
    g: float = Query(G_DEFAULT),
):
    vx0, vy0 = _compute_initial(mass, height, speed, angle, g)
    t_land = _compute_landing_time(height, vy0, g)
    t_apex = _compute_apex_time(vy0, g)

    # on-ground-at-start
    if height <= 1e-9 and abs(vy0) < 1e-9:
        rest = _rest_state(0.0, 0.0, mass, g)
        meta = _meta(vx0, vy0, 0.0, 0.0, 0.0, 0.0, 0.0, dt)
        payload = {
            "meta": round_floats(meta),
            "series": [_round_dict(rest)],
            "impact": _round_dict(rest),
            "rest": _round_dict(rest),
            "events": {
                "start": _round_dict(rest),
                "apex": _round_dict(rest),
                "impact": _round_dict(rest),
                "rest": _round_dict(rest),
            },
        }
        return payload

    # apex y
    y_apex = height + vy0 * t_apex - 0.5 * g * t_apex * t_apex if t_apex > 0 else height
    x_land = vx0 * t_land

    t_pre = max(t_land - eps, 0.0)

    # build series
    series = []
    t = 0.0
    apex_inserted = False
    while t < t_land - 1e-9:
        # insert apex sample if we pass it
        if not apex_inserted and t_apex > 0 and t >= t_apex:
            apex_state = _flight_state(t_apex, vx0, vy0, height, mass, g)
            series.append(_round_dict(apex_state))
            apex_inserted = True

        state = _flight_state(t, vx0, vy0, height, mass, g)
        series.append(_round_dict(state))
        t += dt

    # insert apex if not yet (it might be between last step and landing)
    if not apex_inserted and t_apex > 0 and t_apex < t_land:
        apex_state = _flight_state(t_apex, vx0, vy0, height, mass, g)
        series.append(_round_dict(apex_state))

    # pre-impact sample
    if eps > 0 and t_pre > 0 and t_pre < t_land:
        pre_state = _flight_state(t_pre, vx0, vy0, height, mass, g)
        series.append(_round_dict(pre_state))

    # impact sample
    impact = _impact_snapshot(t_land, vx0, vy0, height, mass, g)
    series.append(_round_dict(impact))

    # rest
    rest = _rest_state(t_land, x_land, mass, g)

    # sort series by time
    series.sort(key=lambda s: s["time_s"])

    # deduplicate very close times
    deduped = []
    for s in series:
        if not deduped or abs(s["time_s"] - deduped[-1]["time_s"]) > 1e-9:
            deduped.append(s)
        else:
            deduped[-1] = s  # prefer later (more complete) entry
    series = deduped

    # events
    start_state = _flight_state(0.0, vx0, vy0, height, mass, g)
    apex_state = _flight_state(t_apex, vx0, vy0, height, mass, g) if t_apex > 0 else start_state

    meta = _meta(vx0, vy0, t_land, t_apex, y_apex, x_land, t_pre, dt)

    payload = {
        "meta": round_floats(meta),
        "series": series,
        "impact": _round_dict(impact),
        "rest": _round_dict(rest),
        "events": {
            "start": _round_dict(start_state),
            "apex": _round_dict(apex_state),
            "impact": _round_dict(impact),
            "rest": _round_dict(rest),
        },
    }
    return payload
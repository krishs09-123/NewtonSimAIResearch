"""
main_projectile.py — FastAPI backend for projectile simulation.
No air resistance. Pure ideal projectile / free-fall physics.
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

# Keys whose floats are rounded to 6 decimals (time-related)
TIME_KEYS = {"time_s", "t_land", "t_apex", "t_pre", "dt"}


# ── Rounding helper ─────────────────────────────────────────────────────────
def round_floats(obj, time_keys=TIME_KEYS):
    """
    Recursively round floats in dicts/lists.
    TIME_KEYS → 6 decimal places, everything else → 2.
    """
    if isinstance(obj, dict):
        return {
            k: round_floats(v, time_keys) if k not in time_keys
            else (round(v, 6) if isinstance(v, float) else round_floats(v, time_keys))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [round_floats(v, time_keys) for v in obj]
    if isinstance(obj, float):
        return round(obj, 2)
    return obj


# ── Physics helpers ──────────────────────────────────────────────────────────
def _initial_velocities(speed: float, angle_deg: float):
    rad = math.radians(angle_deg)
    vx0 = speed * math.cos(rad)
    vy0 = speed * math.sin(rad)
    return vx0, vy0


def _landing_time(height: float, vy0: float, g: float):
    """
    Solve  y(t) = height + vy0*t - 0.5*g*t^2 = 0  for t > 0.
    Returns landing time or 0.0 if projectile starts on ground with no upward velocity.
    """
    # Quadratic: -0.5*g*t^2 + vy0*t + height = 0
    # => 0.5*g*t^2 - vy0*t - height = 0
    a = 0.5 * g
    b = -vy0
    c = -height
    disc = b * b - 4 * a * c
    if disc < 0:
        return 0.0
    sqrt_disc = math.sqrt(disc)
    t1 = (-b + sqrt_disc) / (2 * a)
    t2 = (-b - sqrt_disc) / (2 * a)
    # pick the positive root
    candidates = [t for t in (t1, t2) if t > 1e-9]
    if not candidates:
        return 0.0
    return min(candidates)


def _apex_time(vy0: float, g: float):
    if vy0 <= 0:
        return 0.0
    return vy0 / g


def _flight_state(t: float, height: float, vx0: float, vy0: float, mass: float, g: float):
    """Return state dict at time t during flight (no ground contact)."""
    x = vx0 * t
    y_raw = height + vy0 * t - 0.5 * g * t * t
    y = max(y_raw, 0.0)
    vx = vx0
    vy = vy0 - g * t
    v = math.sqrt(vx * vx + vy * vy)
    Fg = mass * g
    return {
        "time_s": t,
        "x": x,
        "y": y,
        "vx": vx,
        "vy": vy,
        "ax": 0.0,
        "ay": -g,
        "Fg": Fg,
        "Fn": 0.0,
        "v": v,
        "onGround": False,
        "phase": "flight",
        "y_raw": y_raw,
    }


def _rest_state(t: float, x: float, mass: float, g: float):
    """Return state at rest on ground."""
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


def _impact_snapshot(t_land: float, height: float, vx0: float, vy0: float, mass: float, g: float, eps: float = 0.0):
    """
    Snapshot at the moment of impact. Uses pre-impact velocities
    but sets y=0, onGround=True, and Fn=Fg.
    """
    t_pre = t_land - eps if eps > 0 else t_land
    if t_pre < 0:
        t_pre = 0.0
    vx = vx0
    vy = vy0 - g * t_pre
    v = math.sqrt(vx * vx + vy * vy)
    Fg = mass * g
    x_land = vx0 * t_land
    return {
        "time_s": t_land,
        "x": x_land,
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


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/projectile")
def get_projectile(
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
    t_land = _landing_time(height, vy0, g)

    # On-ground-at-start: height=0 and vy0≈0 at t=0
    if height < 1e-6 and abs(vy0) < 1e-6 and t < 1e-9:
        state = _rest_state(0.0, 0.0, mass, g)
        return round_floats(state)

    # Past or at landing
    if t_land > 0 and t >= t_land:
        state = _impact_snapshot(t_land, height, vx0, vy0, mass, g, eps)
        return round_floats(state)

    # In flight
    state = _flight_state(t, height, vx0, vy0, mass, g)
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
    t_land = _landing_time(height, vy0, g)
    t_apex = _apex_time(vy0, g)
    y_apex = height + vy0 * t_apex - 0.5 * g * t_apex * t_apex if t_apex > 0 else height
    x_land = vx0 * t_land

    t_pre = max(t_land - eps, 0.0)

    # On-ground-at-start edge case
    if height < 1e-6 and abs(vy0) < 1e-6:
        rest = _rest_state(0.0, 0.0, mass, g)
        meta = _meta(vx0, vy0, 0.0, 0.0, 0.0, 0.0, 0.0, dt)
        payload = {
            "meta": meta,
            "series": [rest],
            "impact": rest,
            "rest": rest,
            "events": {
                "start": rest,
                "apex": rest,
                "impact": rest,
                "rest": rest,
            },
        }
        return round_floats(payload)

    # Build series
    series = []
    t = 0.0
    apex_added = False
    while t <= t_land + 1e-9:
        # Insert apex sample if we pass it
        if not apex_added and t_apex > 0 and t > t_apex:
            series.append(_flight_state(t_apex, height, vx0, vy0, mass, g))
            apex_added = True

        if t >= t_land - 1e-9:
            # At or past landing: add impact and stop
            break

        series.append(_flight_state(t, height, vx0, vy0, mass, g))
        t += dt

    # Add apex if not yet added and it falls exactly at end
    if not apex_added and t_apex > 0 and t_apex <= t_land:
        series.append(_flight_state(t_apex, height, vx0, vy0, mass, g))

    # Add pre-impact sample if eps > 0
    if eps > 0 and t_pre > 0 and t_pre < t_land:
        pre_state = _flight_state(t_pre, height, vx0, vy0, mass, g)
        pre_state["phase"] = "pre_impact"
        series.append(pre_state)

    # Sort by time
    series.sort(key=lambda s: s["time_s"])

    # Impact snapshot
    impact = _impact_snapshot(t_land, height, vx0, vy0, mass, g, eps)

    # Rest state at landing
    rest = _rest_state(t_land, x_land, mass, g)

    # Add impact to series
    series.append(impact)

    # Event snapshots
    start_state = _flight_state(0.0, height, vx0, vy0, mass, g)
    apex_state = _flight_state(t_apex, height, vx0, vy0, mass, g) if t_apex > 0 else start_state

    meta = _meta(vx0, vy0, t_land, t_apex, y_apex, x_land, t_pre, dt)

    payload = {
        "meta": meta,
        "series": series,
        "impact": impact,
        "rest": rest,
        "events": {
            "start": start_state,
            "apex": apex_state,
            "impact": impact,
            "rest": rest,
        },
    }

    return round_floats(payload)
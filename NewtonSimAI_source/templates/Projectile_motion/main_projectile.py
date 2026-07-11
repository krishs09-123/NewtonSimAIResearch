from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import math
from typing import Any, Optional, Dict

G_DEFAULT = 9.81

app = FastAPI()

# -------------------- CORS --------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ok for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------
# Rounding helper (round ALL floats in the JSON)
# Keep time-ish fields high precision so JS doesn't "land early".
# --------------------
TIME_KEYS = {"time_s", "t_land", "t_apex", "t_pre", "dt"}

GROUND_EPS = 1e-9  # tolerant "ground" threshold
TIME_EPS = 1e-9


def on_ground_at_start(height: float, t: float) -> bool:
    return height <= GROUND_EPS and t <= TIME_EPS


def round_floats(obj: Any, ndigits: int = 2, key: Optional[str] = None) -> Any:
    if isinstance(obj, float):
        if key in TIME_KEYS:
            return round(obj, 6)
        return round(obj, ndigits)

    if isinstance(obj, (int, str, bool)) or obj is None:
        return obj

    if isinstance(obj, dict):
        return {k: round_floats(v, ndigits, key=k) for k, v in obj.items()}

    if isinstance(obj, list):
        return [round_floats(x, ndigits, key=key) for x in obj]

    return obj


# =========================
# Physics (NO AIR)
# =========================

def _meta(height: float, speed: float, angle_deg: float, g: float) -> Dict[str, Any]:
    th = math.radians(angle_deg)
    vx0 = speed * math.cos(th)
    vy0 = speed * math.sin(th)

    disc = vy0 * vy0 + 2.0 * g * height

    # If you are on the ground and not moving vertically, landing is immediate
    if height <= GROUND_EPS and abs(vy0) < 1e-12:
        t_land = 0.0
    else:
        t_land = (vy0 + math.sqrt(max(disc, 0.0))) / g

    t_apex: Optional[float] = (vy0 / g) if (vy0 > 0.0) else None
    y_apex = (
        height + vy0 * t_apex - 0.5 * g * t_apex * t_apex
        if t_apex is not None
        else height
    )

    return {
        "vx0": float(vx0),
        "vy0": float(vy0),
        "t_land": float(t_land),
        "t_apex": float(t_apex) if t_apex is not None else None,
        "y_apex": float(y_apex),
        "x_land": float(vx0 * t_land),
    }


def _flight_state(
    t: float, mass: float, height: float, speed: float, angle_deg: float, g: float
) -> Dict[str, Any]:
    m = _meta(height, speed, angle_deg, g)
    vx0 = m["vx0"]
    vy0 = m["vy0"]

    x = vx0 * t
    y_raw = height + vy0 * t - 0.5 * g * t * t
    y = max(0.0, y_raw)

    vy = vy0 - g * t
    v = math.hypot(vx0, vy)

    return {
        "time_s": float(t),
        "x": float(x),
        "y": float(y),
        "vx": float(vx0),
        "vy": float(vy),
        "ax": 0.0,
        "ay": float(-g),
        "Fg": float(mass * g),
        "Fn": 0.0,  # only nonzero on ground snapshots
        "v": float(v),
        "onGround": bool(y <= GROUND_EPS),
        "phase": "flight",
        "y_raw": float(y_raw),
    }


def _rest_state(meta: Dict[str, Any], mass: float, g: float) -> Dict[str, Any]:
    Fg = mass * g
    return {
        "time_s": float(meta["t_land"]),
        "x": float(meta["x_land"]),
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


def _impact_snapshot(
    meta: Dict[str, Any],
    mass: float,
    height: float,
    speed: float,
    angle_deg: float,
    g: float,
    eps: float,
) -> Dict[str, Any]:
    """
    Impact snapshot:
    - time_s == t_land
    - y == 0, x == x_land
    - Fn == Fg
    - velocities are pre-impact (t_land - eps), so not zeroed
    """
    t_land = float(meta["t_land"])

    if t_land <= TIME_EPS:
        # immediate rest
        r = _rest_state({**meta, "t_land": 0.0, "x_land": 0.0}, mass, g)
        r["phase"] = "impact"
        return r

    t_pre = max(0.0, t_land - max(eps, 1e-12))
    st = _flight_state(t_pre, mass, height, speed, angle_deg, g)

    # overwrite to be the "impact moment" but with pre-impact velocities
    st["time_s"] = float(t_land)
    st["x"] = float(meta["x_land"])
    st["y"] = 0.0
    st["Fn"] = st["Fg"]
    st["onGround"] = True
    st["phase"] = "impact"
    return st


# =========================
# Endpoints (NO AIR)
# =========================

@app.get("/projectile")
def projectile(
    t: float,
    mass: float = 10.0,
    height: float = 0.0,
    speed: float = 50.0,
    angle: float = 45.0,
    eps: float = 1e-3,
    g: float = G_DEFAULT,
):
    t = max(0.0, float(t))
    meta = _meta(height, speed, angle, g)
    t_land = float(meta["t_land"])
    vy0 = float(meta["vy0"])

    # If we start on the ground AND there's no upward launch, show Fn immediately at t=0
    if on_ground_at_start(height, t) and abs(vy0) < 1e-12:
        st = {
            "time_s": 0.0,
            "x": 0.0,
            "y": 0.0,
            "vx": 0.0,
            "vy": 0.0,
            "ax": 0.0,
            "ay": 0.0,
            "Fg": float(mass * g),
            "Fn": float(mass * g),
            "v": 0.0,
            "onGround": True,
            "phase": "rest",
            "y_raw": 0.0,
        }
        return round_floats(st, 2)

    # After landing -> impact snapshot (Fn=Fg, but keep pre-impact velocities)
    if t_land > TIME_EPS and t >= t_land:
        st = _impact_snapshot(meta, mass, height, speed, angle, g, eps)
        return round_floats(st, 2)

    # Otherwise flight
    st = _flight_state(t, mass, height, speed, angle, g)
    return round_floats(st, 2)


@app.get("/projectile_series")
def projectile_series(
    mass: float = Query(..., gt=0),
    height: float = Query(..., ge=0),
    speed: float = Query(..., ge=0),
    angle: float = Query(..., ge=-180, le=180),
    dt: float = Query(0.02, ge=0.01),
    eps: float = Query(0.0, ge=0.0),
    g: float = Query(G_DEFAULT, gt=0),
):
    meta = _meta(height, speed, angle, g)
    t_land = float(meta["t_land"])
    vy0 = float(meta["vy0"])

    # Start already on ground and NOT launching upward -> pure rest series
    if height <= GROUND_EPS and abs(vy0) < 1e-12:
        rest0 = {
            "time_s": 0.0,
            "x": 0.0,
            "y": 0.0,
            "vx": 0.0,
            "vy": 0.0,
            "ax": 0.0,
            "ay": 0.0,
            "Fg": float(mass * g),
            "Fn": float(mass * g),
            "v": 0.0,
            "onGround": True,
            "phase": "rest",
            "y_raw": 0.0,
        }
        payload = {
            "meta": {**meta, "t_pre": 0.0, "dt": float(dt)},
            "series": [rest0],
            "impact": rest0,
            "rest": rest0,
            "events": {"start": rest0, "apex": rest0, "impact": rest0, "rest": rest0},
        }
        return round_floats(payload, 2)

    # If for some reason landing time is immediate/degenerate -> rest series
    if t_land <= TIME_EPS:
        rest = _rest_state(meta, mass, g)
        payload = {
            "meta": {**meta, "t_pre": 0.0, "dt": float(dt)},
            "series": [rest],
            "impact": rest,
            "rest": rest,
            "events": {"start": rest, "apex": rest, "impact": rest, "rest": rest},
        }
        return round_floats(payload, 2)

    # Pre-impact time (for showing “impact moment” without zeroing velocities)
    t_pre = max(0.0, t_land - eps)

    # Build times 0..t_pre and force include apex + pre-impact
    n = int(t_pre / dt)
    base = [i * dt for i in range(n + 1)]
    special = [0.0, meta["t_apex"], t_pre]
    times = sorted(
        {round(t, 10) for t in (base + special) if t is not None and 0.0 <= t <= t_pre}
    )

    series = [_flight_state(t, mass, height, speed, angle, g) for t in times]
    impact = _impact_snapshot(meta, mass, height, speed, angle, g, eps)
    rest = _rest_state(meta, mass, g)

    apex = (
        _flight_state(float(meta["t_apex"]), mass, height, speed, angle, g)
        if meta["t_apex"] is not None
        else series[0]
    )

    payload = {
        "meta": {**meta, "t_pre": float(t_pre), "dt": float(dt)},
        "series": series,
        "impact": impact,
        "rest": rest,
        "events": {"start": series[0], "apex": apex, "impact": impact, "rest": rest},
    }
    return round_floats(payload, 2)

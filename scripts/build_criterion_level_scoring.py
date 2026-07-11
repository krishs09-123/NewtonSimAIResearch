#!/usr/bin/env python3
"""Deterministically build data/criterion_level_scoring.csv.

This file is a DERIVED artifact. It is reconstructed from the reported summary
scores (scoring_data.csv) and the published 17-criterion rubric (manuscript
Table II) plus the reported per-item failed-criterion lists (manuscript Table
III). It is NOT a contemporaneous raw scoring sheet captured during the study.

Every row is one (FCI question x condition x rubric criterion) combination:
5 questions x 2 conditions x 17 criteria = 170 rows.

Run from anywhere:  python scripts/build_criterion_level_scoring.py
"""

import csv
import os

# --- The 17 rubric criteria, in order (manuscript Table II wording) ----------
CRITERIA = [
    "Correct setup (projectile-motion or free-fall)",                                   # 1
    "Modifiable mass",                                                                   # 2
    "Modifiable initial height",                                                         # 3
    "Modifiable initial velocity",                                                       # 4
    "Modifiable launch angle — projectile-motion only",                             # 5
    "Enable/disable view of force_gravity vector and components",                        # 6
    "Enable/disable view of force_air_drag vector and components — air-resistance setups only",  # 7
    "Enable/disable view of velocity and components",                                    # 8
    "Enable/disable view of acceleration vector",                                        # 9
    "Enable/disable view of motion tracking",                                            # 10
    "Speed options",                                                                     # 11
    "Time scrubbing",                                                                    # 12
    "View of key frames in time",                                                        # 13
    "Four or more key motion graphs",                                                    # 14
    "Net acceleration is always -g",                                                     # 15
    "Horizontal velocity constant — projectile-motion only",                        # 16
    "Graphs consistent with expected qualitative physics relationships",                 # 17
]

# Conditional criteria (1-indexed criterion numbers)
PROJECTILE_ONLY = {5, 16}   # apply only to projectile-motion setups
AIR_ONLY = {7}              # applies only to setups that include air resistance

# Per-question setup flags, derived from the FCI questions / manuscript.
#   projectile: True for projectile-motion items, False for free-fall items
#   air:        True if the item's setup includes air resistance
SETUP = {
    5:  {"projectile": False, "air": False},   # steel ball thrown straight up (no air)
    16: {"projectile": True,  "air": True},    # cannonball off a ledge
    17: {"projectile": False, "air": True},    # stone dropped from a roof
    22: {"projectile": True,  "air": True},    # golf ball down a fairway
    23: {"projectile": True,  "air": True},    # bowling ball from an airliner
}

# Reported unconstrained failures, as criterion NUMBERS (manuscript Table III).
# Constrained passed every applicable criterion for every item.
UNCONSTRAINED_FAILS = {
    5:  {2, 3, 4, 11, 12, 14, 17},
    16: {7},
    17: {1},
    22: set(),
    23: {6, 7},
}

PROVENANCE = "Reconstructed from scoring_data.csv and the published rubric"


def is_applicable(qnum, cnum):
    setup = SETUP[qnum]
    if cnum in PROJECTILE_ONLY and not setup["projectile"]:
        return False
    if cnum in AIR_ONLY and not setup["air"]:
        return False
    return True


def na_note(cnum):
    if cnum in PROJECTILE_ONLY:
        return "Not applicable: criterion applies only to projectile-motion setups; this is a free-fall item."
    if cnum in AIR_ONLY:
        return "Not applicable: criterion applies only to setups that include air resistance."
    return "Not applicable."


def build_rows():
    rows = []
    for qnum in (5, 16, 17, 22, 23):
        for cond in ("Constrained", "Unconstrained"):
            for idx, name in enumerate(CRITERIA):
                cnum = idx + 1
                applicable = is_applicable(qnum, cnum)
                if not applicable:
                    result = "Not applicable"
                    note = na_note(cnum)
                elif cond == "Constrained":
                    result = "Pass"
                    note = "Constrained generation passed every applicable criterion (scoring_data.csv / Table III)."
                elif cnum in UNCONSTRAINED_FAILS[qnum]:
                    result = "Fail"
                    note = "Reported among this item's failed criteria in scoring_data.csv (Table III)."
                else:
                    result = "Pass"
                    note = "Not among this item's reported failed criteria in scoring_data.csv (Table III)."
                rows.append({
                    "fci_question": qnum,
                    "condition": cond,
                    "criterion_number": cnum,
                    "criterion": name,
                    "applicable": "true" if applicable else "false",
                    "result": result,
                    "provenance": PROVENANCE,
                    "notes": note,
                })
    return rows


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(repo_root, "data", "criterion_level_scoring.csv")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    rows = build_rows()
    fields = ["fci_question", "condition", "criterion_number", "criterion",
              "applicable", "result", "provenance", "notes"]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows -> {os.path.relpath(out_path, repo_root)}")


if __name__ == "__main__":
    main()

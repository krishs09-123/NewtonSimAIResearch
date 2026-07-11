#!/usr/bin/env python3
"""Validate the derived criterion-level scoring against the reported summary.

Recomputes, per (FCI question x condition), from data/criterion_level_scoring.csv:
  - criteria met, applicable criteria, accuracy %, failed-criterion count,
    failed-criterion name set
and confirms EXACT agreement with:
  1. scoring_data.csv (the reported summary), and
  2. an independent hard-coded expected table (manuscript Table III).

Also checks the internal consistency of the criterion-level file
(result == "Not applicable" iff applicable == false; valid enum values;
170 rows; 17 criteria per question x condition).

Exits nonzero if anything differs. Standard library only.

Run:  python scripts/validate_research_data.py
"""

import csv
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))
from build_criterion_level_scoring import CRITERIA  # canonical criterion names

CRIT_LEVEL = os.path.join(REPO_ROOT, "data", "criterion_level_scoring.csv")
SUMMARY = os.path.join(REPO_ROOT, "scoring_data.csv")

NAME_TO_NUM = {name: i + 1 for i, name in enumerate(CRITERIA)}

# Independent expected table (manuscript Table III): (met, applicable, "accuracy")
EXPECTED = {
    (5, "Constrained"): (14, 14, "100.00"),
    (5, "Unconstrained"): (7, 14, "50.00"),
    (16, "Constrained"): (17, 17, "100.00"),
    (16, "Unconstrained"): (16, 17, "94.12"),
    (17, "Constrained"): (15, 15, "100.00"),
    (17, "Unconstrained"): (14, 15, "93.33"),
    (22, "Constrained"): (17, 17, "100.00"),
    (22, "Unconstrained"): (17, 17, "100.00"),
    (23, "Constrained"): (17, 17, "100.00"),
    (23, "Unconstrained"): (15, 17, "88.24"),
}

errors = []


def err(msg):
    errors.append(msg)


def load_criterion_level():
    with open(CRIT_LEVEL, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if len(rows) != 170:
        err(f"criterion_level_scoring.csv has {len(rows)} rows, expected 170")
    agg = {}
    per_qc_count = {}
    for r in rows:
        q = int(r["fci_question"])
        cond = r["condition"]
        key = (q, cond)
        per_qc_count[key] = per_qc_count.get(key, 0) + 1
        applicable = r["applicable"]
        result = r["result"]
        # enum checks
        if applicable not in ("true", "false"):
            err(f"{key} crit {r['criterion_number']}: bad applicable={applicable!r}")
        if result not in ("Pass", "Fail", "Not applicable"):
            err(f"{key} crit {r['criterion_number']}: bad result={result!r}")
        # consistency: Not applicable iff applicable false
        if applicable == "false" and result != "Not applicable":
            err(f"{key} crit {r['criterion_number']}: applicable=false but result={result!r}")
        if applicable == "true" and result == "Not applicable":
            err(f"{key} crit {r['criterion_number']}: applicable=true but result='Not applicable'")
        # criterion name/number must match canonical list
        cnum = int(r["criterion_number"])
        if not (1 <= cnum <= 17) or CRITERIA[cnum - 1] != r["criterion"]:
            err(f"{key} crit {cnum}: criterion name mismatch: {r['criterion']!r}")
        a = agg.setdefault(key, {"met": 0, "applicable": 0, "failed_nums": set()})
        if applicable == "true":
            a["applicable"] += 1
            if result == "Pass":
                a["met"] += 1
            elif result == "Fail":
                a["failed_nums"].add(cnum)
    for key, n in per_qc_count.items():
        if n != 17:
            err(f"{key}: {n} criteria rows, expected 17")
    return agg


def load_summary():
    out = {}
    with open(SUMMARY, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            q = int(r["fci_question"])
            cond = r["condition"]
            failed_names = [s.strip() for s in r["failed_criteria"].split(";") if s.strip()]
            failed_nums = set()
            for nm in failed_names:
                if nm not in NAME_TO_NUM:
                    err(f"({q},{cond}): failed_criteria name not in rubric: {nm!r}")
                else:
                    failed_nums.add(NAME_TO_NUM[nm])
            out[(q, cond)] = {
                "met": int(r["criteria_met"]),
                "applicable": int(r["applicable_criteria"]),
                "accuracy": r["accuracy_percent"].strip(),
                "failed_count": int(r["failed_criteria_count"]),
                "failed_nums": failed_nums,
            }
    return out


def main():
    if not os.path.exists(CRIT_LEVEL):
        print(f"ERROR: {CRIT_LEVEL} not found. Run build_criterion_level_scoring.py first.")
        return 2
    agg = load_criterion_level()
    summ = load_summary()

    print(f"{'item':>18} | {'derived':^18} | {'reported':^18} | {'expected':^18} | ok")
    print("-" * 92)
    for key in sorted(EXPECTED, key=lambda k: (k[0], k[1])):
        q, cond = key
        d = agg.get(key)
        s = summ.get(key)
        exp = EXPECTED[key]
        row_ok = True
        if d is None:
            err(f"{key}: missing from criterion-level file"); row_ok = False
            d = {"met": -1, "applicable": -1, "failed_nums": set()}
        if s is None:
            err(f"{key}: missing from scoring_data.csv"); row_ok = False
            s = {"met": -1, "applicable": -1, "accuracy": "?", "failed_count": -1, "failed_nums": set()}
        d_acc = "%.2f" % (100.0 * d["met"] / d["applicable"]) if d["applicable"] else "NaN"
        # derived vs reported
        if (d["met"], d["applicable"]) != (s["met"], s["applicable"]):
            err(f"{key}: derived {d['met']}/{d['applicable']} != reported {s['met']}/{s['applicable']}"); row_ok = False
        if d_acc != s["accuracy"]:
            err(f"{key}: derived accuracy {d_acc} != reported {s['accuracy']}"); row_ok = False
        if len(d["failed_nums"]) != s["failed_count"]:
            err(f"{key}: derived failed count {len(d['failed_nums'])} != reported {s['failed_count']}"); row_ok = False
        if d["failed_nums"] != s["failed_nums"]:
            err(f"{key}: derived failed set {sorted(d['failed_nums'])} != reported {sorted(s['failed_nums'])}"); row_ok = False
        # derived vs independent expected
        if (d["met"], d["applicable"], d_acc) != exp:
            err(f"{key}: derived ({d['met']},{d['applicable']},{d_acc}) != expected {exp}"); row_ok = False
        print(f"{q:>4} {cond:<13} | {d['met']:>3}/{d['applicable']:<3} {d_acc:>7} "
              f"| {s['met']:>3}/{s['applicable']:<3} {s['accuracy']:>7} "
              f"| {exp[0]:>3}/{exp[1]:<3} {exp[2]:>7} | {'OK' if row_ok else 'FAIL'}")

    print("-" * 92)
    if errors:
        print(f"\nVALIDATION FAILED with {len(errors)} error(s):")
        for e in errors:
            print("  - " + e)
        return 1
    print("\nVALIDATION PASSED: criterion-level file, reported summary, and "
          "expected Table III values agree exactly (all 10 item/condition rows).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

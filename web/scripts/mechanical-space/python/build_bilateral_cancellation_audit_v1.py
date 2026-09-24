#!/usr/bin/env python3
"""
Bilateral Cancellation & Directionality Audit v1.

Frozen Pressure v4 only. R is a continuous diagnostic, not a new threshold.
No Pressure/ε/estimator/deck changes. No RPS claim.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_aggregation_sensitivity_audit_v1 import disagree_kind, pair_cohort, sign_of
from build_hodge_diagnostic_v0 import ESTIMATORS, MATERIAL, ablation_family
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
ASA = MS / "aggregation-sensitivity-audit-v1"
T2 = MS / "topology-diagnostic-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "bilateral-cancellation-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

LOOP_UNDIR = [("D21", "D49"), ("D37", "D49"), ("D21", "D37")]


def summarize(xs: list[float]) -> dict:
    if not xs:
        return {"n": 0}
    a = np.array(xs, dtype=float)
    return {
        "n": int(a.size),
        "mean": round(float(a.mean()), 4),
        "median": round(float(np.median(a)), 4),
        "p10": round(float(np.percentile(a, 10)), 4),
        "p25": round(float(np.percentile(a, 25)), 4),
        "p75": round(float(np.percentile(a, 75)), 4),
        "p90": round(float(np.percentile(a, 90)), 4),
        "min": round(float(a.min()), 4),
        "max": round(float(a.max()), 4),
    }


def quartile_labels(values: list[float]):
    qs = np.percentile(values, [25, 50, 75])
    out = []
    for v in values:
        if v <= qs[0]:
            out.append("Q1_lowest_R")
        elif v <= qs[1]:
            out.append("Q2")
        elif v <= qs[2]:
            out.append("Q3")
        else:
            out.append("Q4_highest_R")
    return out, {"q25": round(float(qs[0]), 4), "q50": round(float(qs[1]), 4), "q75": round(float(qs[2]), 4)}


def decide(r_medians: dict, quart_rates: dict, family_within: dict) -> dict:
    q1 = quart_rates.get("Q1_lowest_R", {}).get("ORIENTATION_DISAGREE")
    q4 = quart_rates.get("Q4_highest_R", {}).get("ORIENTATION_DISAGREE")
    med_o = (r_medians.get("ORIENTATION_DISAGREE") or {}).get("conservative")
    med_a = (r_medians.get("AGREE") or {}).get("conservative")
    notes = []
    primary = "MIXED"
    if q1 is not None and q4 is not None and med_o is not None and med_a is not None:
        if q1 >= 2.0 * max(q4, 1e-9) and med_o <= 0.7 * med_a:
            primary = "BC1"
            notes.append("Orientation reversals concentrate at low conservative R / high cancellation.")
        if q4 is not None and q4 >= 0.20 and not (q1 >= 2.0 * max(q4, 1e-9)):
            primary = "BC2"
            notes.append("Orientation reversals remain common at high conservative R.")
        if q1 >= 2.0 * max(q4, 1e-9) and q4 >= 0.20:
            notes.append("Strong low-R concentration, but high-R reversals are not rare.")
    # family residual in Q4
    fam_q4 = family_within.get("Q4_highest_R") or {}
    rich = []
    for fam, rec in fam_q4.items():
        if rec.get("n", 0) >= 20 and (rec.get("orientRate") or 0) >= 0.20:
            rich.append((fam, rec["orientRate"], rec["n"]))
    if rich:
        notes.append("Some families remain orientation-sensitive even in the highest-R quartile.")
        if primary == "BC1" and any(r >= 0.30 for _f, r, _n in rich):
            notes.append("Primary is still cancellation; family residual is secondary (BC3-minor).")
        elif primary != "BC1":
            primary = "BC3"
    if primary == "MIXED" and q1 is not None and q4 is not None and q1 >= 2.0 * max(q4, 1e-9):
        primary = "BC1"
    return {
        "code": primary,
        "label": {
            "BC1": "CANCELLATION_DOMINATED",
            "BC2": "SEMANTICALLY_DIVERGENT",
            "BC3": "MECHANISM_SPECIFIC",
            "MIXED": "MIXED",
        }[primary],
        "notes": notes,
        "observed": {"orientRateQ1": q1, "orientRateQ4": q4, "medianR_orient_cons": med_o, "medianR_agree_cons": med_a, "q4FamilyResidual": rich},
        "notAClaim": "R is a diagnostic. This is not a new Pressure rule. Not Commander RPS.",
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P4 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v4 must be frozen")
    if load_json(ASA / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Aggregation Sensitivity Audit v1 must be frozen")
    if load_json(T2 / "IMMUTABLE.json").get("outcome") != "T2-C":
        raise SystemExit("Topology v2 must remain T2-C")
    if load_json(OUT / "protocol.json").get("status") != "FROZEN":
        raise SystemExit("protocol must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    slim = {(r["from"], r["to"]): r for r in load_json(P4 / "pairs-summary.json")}
    asa_kinds = {(r["a"], r["b"]): r["disagreeKind"] for r in load_json(ASA / "global-edges.json")["edges"]}

    rows = []
    kind_counts = defaultdict(int)
    for (a, b), rec in slim.items():
        if a >= b:
            continue
        fwd, rev = slim[(a, b)], slim[(b, a)]
        per = {}
        Ms = {}
        for est in ESTIMATORS:
            p_ab = float(fwd["estimators"][est]["hostile_pressure"])
            p_ba = float(rev["estimators"][est]["hostile_pressure"])
            t = p_ab + p_ba
            m = p_ab - p_ba
            r = abs(m) / t if t > 1e-12 else None
            per[est] = {
                "P_ab": round(p_ab, 4),
                "P_ba": round(p_ba, 4),
                "T": round(t, 4),
                "M": round(m, 4),
                "R": None if r is None else round(r, 4),
                "material": abs(m) >= MATERIAL,
                "orientation": f"{a}→{b}" if sign_of(m) > 0 else (f"{b}→{a}" if sign_of(m) < 0 else "TIE"),
            }
            Ms[est] = m
        kind = disagree_kind(Ms)
        kind_counts[kind] += 1
        top = ((fwd.get("top_hostile_mechanisms") or [{}])[0]).get("edge") or ""
        cap = top.split(" → ")[0] if top else None
        rows.append(
            {
                "a": a,
                "b": b,
                "cohort": pair_cohort(a, b),
                "disagreeKind": kind,
                "topFamily": ablation_family(cap) if cap else None,
                "estimators": per,
            }
        )
        stored = asa_kinds.get((a, b)) or asa_kinds.get((b, a))
        if stored != kind:
            raise SystemExit(f"disagreement-kind drift vs ASA on {a}↔{b}: {kind} vs {stored}")

    if dict(kind_counts) != {"AGREE": 1037, "MAGNITUDE_DISAGREE": 89, "ORIENTATION_DISAGREE": 644}:
        raise SystemExit(f"kind counts drifted: {dict(kind_counts)}")

    groups = {k: [r for r in rows if r["disagreeKind"] == k] for k in ("AGREE", "MAGNITUDE_DISAGREE", "ORIENTATION_DISAGREE")}
    r_dist = {k: {est: summarize([r["estimators"][est]["R"] for r in xs if r["estimators"][est]["R"] is not None]) for est in ESTIMATORS} for k, xs in groups.items()}
    t_dist = {k: {est: summarize([r["estimators"][est]["T"] for r in xs]) for est in ESTIMATORS} for k, xs in groups.items()}
    r_medians = {k: {est: r_dist[k][est].get("median") for est in ESTIMATORS} for k in groups}

    cons_r = [r["estimators"]["conservative"]["R"] or 0.0 for r in rows]
    labels, cuts = quartile_labels(cons_r)
    quart = defaultdict(lambda: defaultdict(int))
    quart_fam = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for rec, lab in zip(rows, labels):
        quart[lab][rec["disagreeKind"]] += 1
        quart[lab]["n"] += 1
        fam = rec["topFamily"] or "unknown"
        quart_fam[lab][fam][rec["disagreeKind"]] += 1
        quart_fam[lab][fam]["n"] += 1

    quart_rates = {}
    for lab, c in quart.items():
        n = c["n"]
        quart_rates[lab] = {k: round(c[k] / n, 4) for k in ("AGREE", "MAGNITUDE_DISAGREE", "ORIENTATION_DISAGREE")}
        quart_rates[lab]["n"] = n

    family_within = {}
    for lab, fams in quart_fam.items():
        family_within[lab] = {}
        for fam, c in fams.items():
            n = c["n"]
            family_within[lab][fam] = {
                "n": n,
                "orientRate": round(c.get("ORIENTATION_DISAGREE", 0) / n, 4) if n else None,
                "agreeRate": round(c.get("AGREE", 0) / n, 4) if n else None,
            }

    # descriptive median-split quadrants on conservative T, R
    t_med = float(np.median([r["estimators"]["conservative"]["T"] for r in rows]))
    r_med = float(np.median(cons_r))
    quads = defaultdict(lambda: defaultdict(int))
    for rec in rows:
        t = rec["estimators"]["conservative"]["T"]
        rr = rec["estimators"]["conservative"]["R"] or 0.0
        conflict = "HIGH_CONFLICT" if t >= t_med else "LOW_CONFLICT"
        dom = "CLEAR_DIRECTION" if rr >= r_med else "BALANCED"
        key = f"{conflict} / {dom}"
        quads[key][rec["disagreeKind"]] += 1
        quads[key]["n"] += 1
    quad_rates = {
        k: {
            "n": v["n"],
            **{kind: round(v[kind] / v["n"], 4) for kind in ("AGREE", "MAGNITUDE_DISAGREE", "ORIENTATION_DISAGREE")},
        }
        for k, v in quads.items()
    }

    def loop_leg(x: str, y: str) -> dict:
        rec = next(r for r in rows if {r["a"], r["b"]} == {x, y})
        return {
            "pair": f"{x}↔{y}",
            "disagreeKind": rec["disagreeKind"],
            "topFamily": rec["topFamily"],
            "estimators": rec["estimators"],
        }

    loop = {
        "D21→D49": loop_leg("D21", "D49"),
        "D49→D37": loop_leg("D49", "D37"),
        "D37↔D21": loop_leg("D37", "D21"),
    }

    reading = decide(r_medians, quart_rates, family_within)

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "BILATERAL_CANCELLATION_AUDIT_V1",
        "parent": ["deck-pressure-v4", "aggregation-sensitivity-audit-v1", "topology-diagnostic-v2"],
        "R_is_diagnostic_only": True,
        "asaKindReplay": dict(kind_counts),
        "R_byDisagreeKind": r_dist,
        "T_byDisagreeKind": t_dist,
        "conservativeRQuartiles": {"cuts": cuts, "kindRates": quart_rates},
        "familyWithinConservativeRQuartile": family_within,
        "descriptiveQuadrants": {
            "split": {"T_median_conservative": round(t_med, 4), "R_median_conservative": round(r_med, 4)},
            "note": "Sample-median splits only. Not a new instrument threshold.",
            "rates": quad_rates,
        },
        "loop": loop,
        "reading": reading,
        "not": ["new Pressure formula", "R cutoff", "ε change", "estimator selection", "Commander RPS", "deck ranking"],
        "safety": {"pressureEdited": False, "rThresholdInvented": False, "newDecks": False, "rpsAuthorized": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs.json").write_text(json.dumps({"n": len(rows), "pairs": rows}, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "BilateralCancellationAudit",
                "version": "bilateral-cancellation-audit-v1",
                "status": "REPORT_AND_WAIT",
                "parent": "deck-pressure-v4",
                "outcome": reading["code"],
                "R_is_diagnostic_only": True,
                "note": "Not a new Pressure rule. Not Commander RPS.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"kinds": dict(kind_counts), "R": r_dist, "quart": quart_rates, "quads": quad_rates, "loop": loop, "reading": reading}, indent=2))


if __name__ == "__main__":
    main()

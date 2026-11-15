#!/usr/bin/env python3
"""
K v2.7 — causal maturity.

Not a diversity batch. Screen frozen. No Pressure v2.
Adds maturity-conditioned geometry as an H_credible validation.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_k_v13_active_coverage import M
from build_k_v14_active_coverage import spearman_rho
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs, coverage_stats, cycles_of, load_decks, story_rows, write_k
from build_k_v22 import leftover_cells
from build_k_v23 import classify_reversals, compare_geometry
from build_k_v25 import outcome_bucket, pair_h_both, tail_summary
from build_k_v26 import net_index
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v11 import derive_pressure
from mechanical_k_v2 import CAP_MECH, DEP_MECH, RES_MECH, V27_REVIEWS, axis_reliability, k_pressure_eligible
from mechanical_pressure_channels_v1 import attach_channels, concentration_report
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K15 = MS / "mechanical-pressure-k-v1.5"
K26 = MS / "mechanical-pressure-k-v2.6"
AUDIT = MS / "interaction-diversity-audit-v1"
SCREEN = MS / "compatibility-screen-v1"
PROF = MS / "deck-mechanical-profiles-v2"
OUT = MS / "mechanical-pressure-k-v2.7"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

ACTIVE = {"ATTACKS", "DISRUPTS"}
ENABLE = {"ENABLES", "BENEFITS"}


def review_record(c: str, d: str, decision: dict, by_axis: dict) -> dict:
    p = derive_pressure(decision)
    q = 0.72 if decision["relation"] == "CONDITIONAL" else 0.82
    if decision["status"] == "SUPPORTED_NEUTRAL":
        q = 0.8
    rec = {
        "capability": c,
        "target": d,
        "targetKind": (by_axis.get(d) or {}).get("kind", "dependency"),
        "reviewBucket": decision.get("lane", "v2.7"),
        "relation": decision["relation"],
        "status": decision["status"],
        "conditionality": decision.get("conditionality"),
        "reason": decision.get("reason"),
        "mechanism": {"capability": CAP_MECH.get(c), "dependency": DEP_MECH.get(d) or RES_MECH.get(d)},
        "q_relationConfidence": q,
        "p_mechanicalPressure": p,
        "a_capabilityReliability": round(axis_reliability(by_axis[c]) if c in by_axis else 0.2, 4),
        "a_targetReliability": round(axis_reliability(by_axis[d]) if d in by_axis else 0.2, 4),
        "kClass": "NEW_ENDPOINT",
        "kVersionAdded": "mechanical-pressure-k-v2.7",
        "carryForward": False,
        "compatibilityAtReview": compatibility(c, d),
    }
    rec["pressureGate"] = k_pressure_eligible(rec, by_axis)
    rec["pressureEligible"] = rec["pressureGate"]["eligible"]
    return rec


def maturity_class(h: float) -> str:
    if h < 0.5:
        return "MATURE"
    if h < 1.0:
        return "PARTIALLY_MATURE"
    return "IMMATURE"


def compare_on(keys: set[tuple[str, str]], idx_prev: dict, idx_new: dict) -> dict:
    if not keys:
        return {"nDirected": 0, "nUndirected": 0, "rhoAbsM": None, "meanAbsDeltaM": None, "headlineRetention": None, "materialSignReversals": 0, "signFlips": []}
    undirected = sorted({tuple(sorted(k)) for k in keys})
    abs_prev, abs_new, dabs = [], [], []
    for a, b in undirected:
        if (a, b) not in idx_prev or (a, b) not in idx_new:
            continue
        abs_prev.append(abs(M(idx_prev, a, b)))
        abs_new.append(abs(M(idx_new, a, b)))
        dabs.append(abs(M(idx_new, a, b) - M(idx_prev, a, b)))
    flips, material, same, n_dir = [], 0, 0, 0
    for a, b in keys:
        if (a, b) not in idx_prev or (a, b) not in idx_new:
            continue
        n_dir += 1
        m0, m1 = M(idx_prev, a, b), M(idx_new, a, b)
        s0 = 1 if m0 > 1e-9 else (-1 if m0 < -1e-9 else 0)
        s1 = 1 if m1 > 1e-9 else (-1 if m1 < -1e-9 else 0)
        if s0 and s1 and s0 != s1:
            flips.append({"pair": f"{a}→{b}", "M0": round(m0, 4), "M1": round(m1, 4)})
            if abs(m0) >= 0.08 and abs(m1) >= 0.08:
                material += 1
        t0 = idx_prev[(a, b)].get("topEligible") or idx_prev[(a, b)]["top"]
        t1 = idx_new[(a, b)].get("topEligible") or idx_new[(a, b)]["top"]
        if t0 == t1:
            same += 1
    rho = spearman_rho(abs_prev, abs_new) if len(abs_prev) >= 3 else None
    return {
        "nDirected": n_dir,
        "nUndirected": len(abs_prev),
        "rhoAbsM": rho,
        "meanAbsDeltaM": float(np.mean(dabs)) if dabs else None,
        "headlineRetention": {"same": same, "n": n_dir},
        "materialSignReversals": material,
        "signFlips": flips,
    }


def conditioned_geometry(h_ref: dict, idx_prev, idx_new, idx_net_prev, idx_net_new) -> dict:
    out = {}
    for label, pred in (
        ("ALL", lambda h: True),
        ("Hcred_lt_1", lambda h: h < 1.0),
        ("Hcred_lt_075", lambda h: h < 0.75),
        ("Hcred_lt_05", lambda h: h < 0.5),
    ):
        keys = {(r["from"], r["to"]) for r in h_ref.values() if pred(r["H_credible"])}
        out[label] = {
            "n": len(keys),
            "attack": compare_on(keys, idx_prev, idx_new),
            "net": compare_on(keys, idx_net_prev, idx_net_new),
        }
    return out


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    if load_json(K15 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.5 must stay frozen")
    if load_json(K26 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v2.6 must be frozen")
    if load_json(AUDIT / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Interaction Diversity Audit v1 must be frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited; aborting v2.7")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    trained = set(concept_ids)
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    decks, polarity = load_decks(
        concept_ids, by_axis, scores, np.percentile(scores, 90, axis=0), np.percentile(scores, 99, axis=0), row_of, name_of, type_of
    )

    v26_edges = load_json(K26 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in v26_edges}
    leftover26 = leftover_cells(concept_ids, by_axis, v26_edges)
    priority = [cd for cd in V27_REVIEWS if cd[0] in trained and cd[1] in trained and cd not in reviewed]
    new_edges = [review_record(c, d, V27_REVIEWS[(c, d)], by_axis) for c, d in priority]
    v27_edges = v26_edges + new_edges
    leftover27 = leftover_cells(concept_ids, by_axis, v27_edges)
    pairs27, v27_edges = compute_pairs(decks, v27_edges, leftover27, by_axis, polarity)
    attach_channels(pairs27)
    pairs26 = attach_channels(load_json(K26 / "pairs.json"))
    stats27 = coverage_stats(decks, v27_edges, leftover27, pairs27, by_axis, trained)
    idx27 = pair_index_eligible(pairs27, by_axis)
    idx26 = pair_index_eligible(pairs26, by_axis)
    idx_net26, idx_net27 = net_index(pairs26), net_index(pairs27)
    ids = [d["id"] for d in decks]
    geom = compare_geometry(ids, idx26, idx27)
    geom_net = compare_geometry(ids, idx_net26, idx_net27)
    reversals = classify_reversals(geom["signFlips"], pairs27, new_edges)

    h26 = pair_h_both(decks, leftover26, idx26, by_axis)
    h27 = pair_h_both(decks, leftover27, idx27, by_axis)
    by26 = {(r["from"], r["to"]): r for r in h26}
    by27 = {(r["from"], r["to"]): r for r in h27}
    cond_after = conditioned_geometry(by27, idx26, idx27, idx_net26, idx_net27)
    cond_before = conditioned_geometry(by26, idx26, idx27, idx_net26, idx_net27)

    cal = defaultdict(lambda: defaultdict(int))
    misses = []
    for e in new_edges:
        lvl = e["compatibilityAtReview"]["level"]
        cal[lvl][outcome_bucket(e["relation"])] += 1
        if lvl == "LOW" and e["relation"] in ACTIVE | ENABLE | {"CONDITIONAL"}:
            misses.append(
                {
                    "edge": f"{e['capability']} → {e['target']}",
                    "relation": e["relation"],
                    "compatibility": e["compatibilityAtReview"],
                    "reason": e["reason"],
                    "note": "PROSPECTIVE_MISS — do not repair the screen in this run",
                }
            )

    n_active = sum(1 for e in new_edges if e["relation"] in ACTIVE)
    n_active_hm = sum(1 for e in new_edges if e["relation"] in ACTIVE and e["compatibilityAtReview"]["level"] in {"HIGH", "MEDIUM"})
    n_low = sum(1 for e in new_edges if e["compatibilityAtReview"]["level"] == "LOW")
    n_low_neu = sum(1 for e in new_edges if e["compatibilityAtReview"]["level"] == "LOW" and e["relation"] == "NEUTRAL")

    raw26, cred26 = tail_summary(h26, "H_raw"), tail_summary(h26, "H_credible")
    raw27, cred27 = tail_summary(h27, "H_raw"), tail_summary(h27, "H_credible")
    newly = {
        "lt1": [f"{r['from']}→{r['to']}" for r in h27 if r["H_credible"] < 1 and by26[(r["from"], r["to"])]["H_credible"] >= 1],
        "lt075": [f"{r['from']}→{r['to']}" for r in h27 if r["H_credible"] < 0.75 and by26[(r["from"], r["to"])]["H_credible"] >= 0.75],
        "lt05": [f"{r['from']}→{r['to']}" for r in h27 if r["H_credible"] < 0.5 and by26[(r["from"], r["to"])]["H_credible"] >= 0.5],
    }

    classes = defaultdict(int)
    for r in h27:
        classes[maturity_class(r["H_credible"])] += 1

    story27 = story_rows(pairs27, idx27)
    story26 = story_rows(pairs26, idx26)
    for s in story27:
        fr, to = s["pair"].split("→")
        s["v26"] = next((r for r in story26 if r["pair"] == s["pair"]), None)
        rec = by27.get((fr, to))
        block = next(p for p in pairs27 if p["from"] == fr and p["to"] == to)["families"]["conservative"]
        s["channels"] = {
            "hostile_pressure": block["hostile_pressure"],
            "supportive_pressure": block["supportive_pressure"],
            "conditional_pressure": block["conditional_pressure"],
            "resilience_mitigation": block["resilience_mitigation"],
            "net_interaction": block["net_interaction"],
        }
        if rec:
            s["H_raw"] = rec["H_raw"]
            s["H_credible"] = rec["H_credible"]
            s["maturityClass"] = maturity_class(rec["H_credible"])

    lane_counts = defaultdict(int)
    rel_counts = defaultdict(int)
    for e in new_edges:
        lane_counts[e["reviewBucket"]] += 1
        rel_counts[e["relation"]] += 1
    conc = concentration_report(pairs27)

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "K_V2_7_CAUSAL_MATURITY",
        "parent": "mechanical-pressure-k-v2.6",
        "diversityGate": "PASS_CHARACTERIZED",
        "compatibilityScreen": {"version": "compatibility-screen-v1", "sha256": frozen_hash, "editedDuringRun": False},
        "H_metrics": {"H_raw": "ignorance ledger", "H_credible": "experimental causal-maturity diagnostic"},
        "prospectiveCalibration": {
            "table": {lvl: dict(cal[lvl]) for lvl in ("HIGH", "MEDIUM", "LOW")},
            "activeRecallHighMed": {"n": n_active_hm, "of": n_active, "rate": round(n_active_hm / n_active, 4) if n_active else None},
            "lowNeutralRate": {"n": n_low_neu, "of": n_low, "rate": round(n_low_neu / n_low, 4) if n_low else None},
            "lowMisses": misses,
        },
        "newReviews": [
            {
                "capability": e["capability"],
                "target": e["target"],
                "relation": e["relation"],
                "lane": e["reviewBucket"],
                "compatibility": e["compatibilityAtReview"]["level"],
                "p": e["p_mechanicalPressure"],
                "reason": e["reason"],
            }
            for e in new_edges
        ],
        "batchMix": {"lanes": dict(lane_counts), "relations": dict(rel_counts), "n": len(new_edges)},
        "coverage": stats27,
        "H_raw": {"before": raw26, "after": raw27},
        "H_credible": {"before": cred26, "after": cred27},
        "maturityClasses": dict(classes),
        "newlyCrossed": newly,
        "completionYield": {
            "reviews": len(new_edges),
            "pairsNewlyHcredLt1": cred27["n_lt_1"] - cred26["n_lt_1"],
            "pairsNewlyHcredLt075": cred27["n_lt_0_75"] - cred26["n_lt_0_75"],
            "pairsNewlyHcredLt05": cred27["n_lt_0_5"] - cred26["n_lt_0_5"],
            "hcredLt1PerReview": round((cred27["n_lt_1"] - cred26["n_lt_1"]) / max(len(new_edges), 1), 4),
        },
        "maturityConditionedGeometry": {
            "note": "Subset defined on H_credible. 'after' uses v2.7 H; 'alreadyMature' uses v2.6 H (did already-mature pairs stay still?).",
            "after": cond_after,
            "alreadyMature": cond_before,
        },
        "geometryContinuity": geom,
        "geometryNet": {"rhoAbsM": geom_net["rhoAbsM"], "meanAbsDeltaM": geom_net["meanAbsDeltaM"], "materialSignReversals": geom_net["materialSignReversals"]},
        "signReversalClasses": reversals,
        "cycles": cycles_of(pairs27, ids),
        "storyPairs": story27,
        "concentration": conc,
        "polarityFlags": {k: sorted(v) for k, v in polarity.items() if v},
        "profileQABlocked": ["DAMAGE_PLAYER"],
        "safety": {
            "hodge": False,
            "rpsAuthorized": False,
            "extraDecks": False,
            "pressureV2Canon": False,
            "compatibilityEdited": False,
            "diversityHunt": False,
            "openai": False,
            "reembed": False,
        },
        **geom,
    }
    write_k(OUT, "mechanical-pressure-k-v2.7", v27_edges, pairs27, extra)
    (OUT / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUT / "batch.json").write_text(json.dumps(extra["newReviews"], indent=2) + "\n", encoding="utf-8")
    (OUT / "prospective-calibration.json").write_text(json.dumps(extra["prospectiveCalibration"], indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs-h-both.json").write_text(json.dumps(h27, indent=2) + "\n", encoding="utf-8")
    (OUT / "maturity-conditioned-geometry.json").write_text(json.dumps(extra["maturityConditionedGeometry"], indent=2) + "\n", encoding="utf-8")

    report_path = MS / "mechanical-pressure-k-v2-report.json"
    report = load_json(report_path) if report_path.exists() else {"version": "mechanical-pressure-k-v2", "lineage": "v2"}
    report["k27"] = extra
    report["note"] = "H_raw is the ignorance ledger. H_credible is causal maturity. Pressure v2 is not canonized."
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "nNew": len(new_edges),
                "mix": extra["batchMix"],
                "calibration": extra["prospectiveCalibration"],
                "H_raw": extra["H_raw"],
                "H_credible": extra["H_credible"],
                "maturityClasses": extra["maturityClasses"],
                "yield": extra["completionYield"],
                "newlyCrossedCounts": {k: len(v) for k, v in newly.items()},
                "rhoAttack": extra["rhoAbsM"],
                "rhoNet": extra["geometryNet"]["rhoAbsM"],
                "topStable": f"{extra['eligibleHeadlineStability']['same']}/{extra['eligibleHeadlineStability']['n']}",
                "materialFlips": extra["materialSignReversals"],
                "cycles": len(extra["cycles"]),
                "conditionedAfter": {k: {"n": v["n"], "rhoA": v["attack"]["rhoAbsM"], "rhoN": v["net"]["rhoAbsM"], "dM": v["attack"]["meanAbsDeltaM"], "heads": v["attack"]["headlineRetention"], "mat": v["attack"]["materialSignReversals"]} for k, v in cond_after.items()},
                "conditionedAlready": {k: {"n": v["n"], "rhoA": v["attack"]["rhoAbsM"], "dM": v["attack"]["meanAbsDeltaM"], "heads": v["attack"]["headlineRetention"], "mat": v["attack"]["materialSignReversals"]} for k, v in cond_before.items()},
                "skipped": [f"{c}->{d}" for c, d in V27_REVIEWS if (c, d) in reviewed],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

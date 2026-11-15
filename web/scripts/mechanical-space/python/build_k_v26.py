#!/usr/bin/env python3
"""
K v2.6 — credible mid-band tails + hostile-domain diversity.

compatibility-screen-v1 stays frozen. Misses are recorded, not repaired.
Adds multi-channel pressure diagnostics. Does not write deck-pressure-v2.
No Hodge. No extra decks. Pressure v2 is not canonized.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_k_v13_active_coverage import M
from build_k_v14_active_coverage import axis_mass, parse_top
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs, coverage_stats, cycles_of, load_decks, story_rows, write_k
from build_k_v22 import leftover_cells
from build_k_v23 import classify_reversals, compare_geometry
from build_k_v25 import outcome_bucket, pair_h_both, tail_summary
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v11 import derive_pressure
from mechanical_k_v2 import CAP_MECH, DEP_MECH, RES_MECH, V26_REVIEWS, axis_reliability, k_pressure_eligible
from mechanical_pressure_channels_v1 import attach_channels, concentration_report
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K15 = MS / "mechanical-pressure-k-v1.5"
K25 = MS / "mechanical-pressure-k-v2.5"
SCREEN = MS / "compatibility-screen-v1"
PROF = MS / "deck-mechanical-profiles-v2"
OUT = MS / "mechanical-pressure-k-v2.6"
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
        "reviewBucket": decision.get("lane", "v2.6"),
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
        "kVersionAdded": "mechanical-pressure-k-v2.6",
        "carryForward": False,
        "compatibilityAtReview": compatibility(c, d),
    }
    rec["pressureGate"] = k_pressure_eligible(rec, by_axis)
    rec["pressureEligible"] = rec["pressureGate"]["eligible"]
    return rec


def net_index(pairs):
    out = {}
    for p in pairs:
        cons = p["families"]["conservative"]
        out[(p["from"], p["to"])] = {
            "P": cons.get("net_interaction", 0.0),
            "P_eligible": cons.get("net_interaction", 0.0),
            "coverage": cons["coverage"],
            "top": (cons.get("eligibleTop") or ""),
            "topEligible": cons.get("eligibleTop"),
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
    if load_json(K25 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v2.5 must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    live_hash = hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest()
    if live_hash != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited; aborting v2.6")

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

    v25_edges = load_json(K25 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in v25_edges}
    leftover25 = leftover_cells(concept_ids, by_axis, v25_edges)
    priority = [cd for cd in V26_REVIEWS if cd[0] in trained and cd[1] in trained and cd not in reviewed]
    new_edges = [review_record(c, d, V26_REVIEWS[(c, d)], by_axis) for c, d in priority]
    v26_edges = v25_edges + new_edges
    leftover26 = leftover_cells(concept_ids, by_axis, v26_edges)
    pairs26, v26_edges = compute_pairs(decks, v26_edges, leftover26, by_axis, polarity)
    attach_channels(pairs26)
    pairs25 = attach_channels(load_json(K25 / "pairs.json"))
    stats26 = coverage_stats(decks, v26_edges, leftover26, pairs26, by_axis, trained)
    idx26 = pair_index_eligible(pairs26, by_axis)
    idx25 = pair_index_eligible(pairs25, by_axis)
    ids = [d["id"] for d in decks]
    geom = compare_geometry(ids, idx25, idx26)
    geom_net = compare_geometry(ids, net_index(pairs25), net_index(pairs26))
    reversals = classify_reversals(geom["signFlips"], pairs26, new_edges)

    h25 = pair_h_both(decks, leftover25, idx25, by_axis)
    h26 = pair_h_both(decks, leftover26, idx26, by_axis)
    by25 = {(r["from"], r["to"]): r for r in h25}

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
    n_high = sum(1 for e in new_edges if e["compatibilityAtReview"]["level"] == "HIGH")
    n_high_plausible = sum(
        1 for e in new_edges if e["compatibilityAtReview"]["level"] == "HIGH" and e["relation"] in ACTIVE | ENABLE | {"CONDITIONAL"}
    )

    raw25, cred25 = tail_summary(h25, "H_raw"), tail_summary(h25, "H_credible")
    raw26, cred26 = tail_summary(h26, "H_raw"), tail_summary(h26, "H_credible")
    newly_cred = [
        {
            "pair": f"{r['from']}→{r['to']}",
            "H_raw": r["H_raw"],
            "H_credible": r["H_credible"],
            "nCred1": r["nCredibleAboveH1"],
            "nRaw1": r["nRawAboveH1"],
        }
        for r in h26
        if r["H_credible"] < 1 and by25[(r["from"], r["to"])]["H_credible"] >= 1
    ]
    newly_075 = [
        {"pair": f"{r['from']}→{r['to']}", "H_credible": r["H_credible"]}
        for r in h26
        if r["H_credible"] < 0.75 and by25[(r["from"], r["to"])]["H_credible"] >= 0.75
    ]
    newly_05 = [r for r in h26 if r["H_credible"] < 0.5]

    conc25 = concentration_report(pairs25)
    conc26 = concentration_report(pairs26)

    story26 = story_rows(pairs26, idx26)
    story25 = story_rows(pairs25, idx25)
    for s in story26:
        fr, to = s["pair"].split("→")
        s["v25"] = next((r for r in story25 if r["pair"] == s["pair"]), None)
        rec = next((r for r in h26 if r["from"] == fr and r["to"] == to), None)
        block = next(p for p in pairs26 if p["from"] == fr and p["to"] == to)["families"]["conservative"]
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
            s["nRawAboveH1"] = rec["nRawAboveH1"]
            s["nCredibleAboveH1"] = rec["nCredibleAboveH1"]

    lane_counts = defaultdict(int)
    rel_counts = defaultdict(int)
    for e in new_edges:
        lane_counts[e["reviewBucket"]] += 1
        rel_counts[e["relation"]] += 1

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "K_V2_6_CREDIBLE_TAIL_AND_HOSTILE_DIVERSITY",
        "parent": "mechanical-pressure-k-v2.5",
        "compatibilityScreen": {"version": "compatibility-screen-v1", "sha256": frozen_hash, "editedDuringRun": False},
        "H_metrics": {
            "H_raw": "ignorance ledger",
            "H_credible": "experimental causal-maturity diagnostic",
        },
        "prospectiveCalibration": {
            "table": {lvl: dict(cal[lvl]) for lvl in ("HIGH", "MEDIUM", "LOW")},
            "activeRecallHighMed": {"n": n_active_hm, "of": n_active, "rate": round(n_active_hm / n_active, 4) if n_active else None},
            "lowNeutralRate": {"n": n_low_neu, "of": n_low, "rate": round(n_low_neu / n_low, 4) if n_low else None},
            "highPlausibleRate": {"n": n_high_plausible, "of": n_high, "rate": round(n_high_plausible / n_high, 4) if n_high else None},
            "lowMisses": misses,
        },
        "newReviews": [
            {
                "capability": e["capability"],
                "target": e["target"],
                "relation": e["relation"],
                "lane": e["reviewBucket"],
                "compatibility": e["compatibilityAtReview"]["level"],
                "compatReason": e["compatibilityAtReview"]["reason"],
                "p": e["p_mechanicalPressure"],
                "pressureEligible": e["pressureEligible"],
                "reason": e["reason"],
            }
            for e in new_edges
        ],
        "batchMix": {"lanes": dict(lane_counts), "relations": dict(rel_counts), "n": len(new_edges)},
        "coverage": stats26,
        "channels": {
            "note": "Components survive. net_interaction is experimental. eligibleAttackPressure remains the continuity scalar.",
            "meanHostile": conc26["hostileActiveMassMean"],
            "meanSupportive": conc26["supportiveActiveMassMean"],
            "meanConditional": round(float(np.mean([p["families"]["conservative"]["conditional_pressure"] for p in pairs26])), 4),
            "meanResilience": round(float(np.mean([p["families"]["conservative"]["resilience_mitigation"] for p in pairs26])), 4),
            "meanNet": round(float(np.mean([p["families"]["conservative"]["net_interaction"] for p in pairs26])), 4),
        },
        "concentration": {"before": conc25, "after": conc26},
        "H_raw": {"before": raw25, "after": raw26},
        "H_credible": {"before": cred25, "after": cred26},
        "newlyHcredLt1": newly_cred,
        "newlyHcredLt075": newly_075,
        "nHcredLt05": len(newly_05),
        "completionYield": {
            "reviews": len(new_edges),
            "pairsNewlyHcredLt1": cred26["n_lt_1"] - cred25["n_lt_1"],
            "pairsNewlyHcredLt075": cred26["n_lt_0_75"] - cred25["n_lt_0_75"],
            "pairsNewlyHcredLt05": cred26["n_lt_0_5"] - cred25["n_lt_0_5"],
            "hcredLt1PerReview": round((cred26["n_lt_1"] - cred25["n_lt_1"]) / max(len(new_edges), 1), 4),
        },
        "geometryContinuity": geom,
        "geometryNet": {
            "note": "Antisymmetric diagnostic from net_interaction. Not Pressure v2.",
            "rhoAbsM": geom_net["rhoAbsM"],
            "meanAbsDeltaM": geom_net["meanAbsDeltaM"],
            "materialSignReversals": geom_net["materialSignReversals"],
        },
        "signReversalClasses": reversals,
        "cycles": cycles_of(pairs26, ids),
        "storyPairs": story26,
        "polarityFlags": {k: sorted(v) for k, v in polarity.items() if v},
        "profileQABlocked": ["DAMAGE_PLAYER"],
        "safety": {
            "hodge": False,
            "rpsAuthorized": False,
            "extraDecks": False,
            "pressureV2Canon": False,
            "compatibilityEdited": False,
            "openai": False,
            "reembed": False,
        },
        **geom,
    }
    write_k(OUT, "mechanical-pressure-k-v2.6", v26_edges, pairs26, extra)
    (OUT / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUT / "batch.json").write_text(json.dumps(extra["newReviews"], indent=2) + "\n", encoding="utf-8")
    (OUT / "prospective-calibration.json").write_text(json.dumps(extra["prospectiveCalibration"], indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs-h-both.json").write_text(json.dumps(h26, indent=2) + "\n", encoding="utf-8")
    (OUT / "concentration.json").write_text(json.dumps({"before": conc25, "after": conc26}, indent=2) + "\n", encoding="utf-8")
    (OUT / "channels-summary.json").write_text(json.dumps(extra["channels"], indent=2) + "\n", encoding="utf-8")

    report_path = MS / "mechanical-pressure-k-v2-report.json"
    report = load_json(report_path) if report_path.exists() else {"version": "mechanical-pressure-k-v2", "lineage": "v2"}
    report["k26"] = extra
    report["note"] = "H_raw is the ignorance ledger. H_credible is the experimental causal-maturity diagnostic. Pressure v2 is not canonized."
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    decomp = stats26["decomp"]["meanPairFractions"]
    print(
        json.dumps(
            {
                "nNew": len(new_edges),
                "mix": extra["batchMix"],
                "calibration": extra["prospectiveCalibration"],
                "active": decomp.get("active"),
                "conditional": decomp.get("conditional"),
                "rhoAttack": extra["rhoAbsM"],
                "rhoNet": extra["geometryNet"]["rhoAbsM"],
                "meanAbsDeltaM": extra["meanAbsDeltaM"],
                "topStable": f"{extra['eligibleHeadlineStability']['same']}/{extra['eligibleHeadlineStability']['n']}",
                "materialFlips": extra["materialSignReversals"],
                "cycles": len(extra["cycles"]),
                "H_raw": extra["H_raw"],
                "H_credible": extra["H_credible"],
                "yield": extra["completionYield"],
                "nHcredLt05": extra["nHcredLt05"],
                "channels": extra["channels"],
                "hostileCR": {k: conc26["hostile"][k] for k in ("CR_1", "CR_5", "CR_10", "CR_20")},
                "hostileDomains": conc26["hostile"]["domains"][:8],
                "skipped": [f"{c}->{d}" for c, d in V26_REVIEWS if (c, d) in reviewed],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

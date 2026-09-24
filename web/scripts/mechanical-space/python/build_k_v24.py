#!/usr/bin/env python3
"""
K v2.4 — mature-tail set-cover on frozen K v2.3.

Does not write deck-pressure-v2. No Hodge. No extra decks.
DAMAGE_PLAYER stays blocked. Pressure v2 is not canonized.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_k_v13_active_coverage import M
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs, coverage_stats, cycles_of, load_decks, story_rows, write_k
from build_k_v22 import leftover_cells
from build_k_v23 import (
    _eligible_leftover,
    classify_reversals,
    compare_geometry,
    h_eligible,
    h_tail,
    sequential_h_collapse,
)
from mechanical_k_v11 import derive_pressure
from mechanical_k_v2 import (
    CAP_MECH,
    DEP_MECH,
    RES_MECH,
    V24_REVIEWS,
    axis_reliability,
    k_pressure_eligible,
    parent_of,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K15 = MS / "mechanical-pressure-k-v1.5"
K23 = MS / "mechanical-pressure-k-v2.3"
PROF = MS / "deck-mechanical-profiles-v2"
OUT = MS / "mechanical-pressure-k-v2.4"

ACTIVE = {"ATTACKS", "DISRUPTS"}


def review_record(c: str, d: str, decision: dict, by_axis: dict) -> dict:
    p = derive_pressure(decision)
    q = 0.72 if decision["relation"] == "CONDITIONAL" else 0.82
    if decision["status"] == "SUPPORTED_NEUTRAL":
        q = 0.8
    rec = {
        "capability": c,
        "target": d,
        "targetKind": (by_axis.get(d) or {}).get("kind", "dependency"),
        "reviewBucket": decision.get("lane", "setcover_v2.4"),
        "relation": decision["relation"],
        "status": decision["status"],
        "conditionality": decision.get("conditionality"),
        "reason": decision.get("reason"),
        "mechanism": {
            "capability": CAP_MECH.get(c),
            "dependency": DEP_MECH.get(d) or RES_MECH.get(d),
        },
        "q_relationConfidence": q,
        "p_mechanicalPressure": p,
        "a_capabilityReliability": round(axis_reliability(by_axis[c]) if c in by_axis else 0.2, 4),
        "a_targetReliability": round(axis_reliability(by_axis[d]) if d in by_axis else 0.2, 4),
        "kClass": "NEW_ENDPOINT",
        "kVersionAdded": "mechanical-pressure-k-v2.4",
        "carryForward": False,
    }
    rec["pressureGate"] = k_pressure_eligible(rec, by_axis)
    rec["pressureEligible"] = rec["pressureGate"]["eligible"]
    return rec


def classify_top_change(old: str | None, new: str | None, new_edges: list[dict]) -> str:
    if not old or not new or old == new:
        return "UNCHANGED"
    new_map = {(e["capability"], e["target"]): e for e in new_edges}
    try:
        oc, od = [x.strip() for x in old.replace("→", "->").split("->")]
        nc, nd = [x.strip() for x in new.replace("→", "->").split("->")]
    except ValueError:
        return "SUSPECT"
    rec = new_map.get((nc, nd))
    if rec and rec["relation"] in ACTIVE:
        return "NEWLY_DISCOVERED_ACTIVE"
    if oc == nc and (parent_of(nd) == od or parent_of(od) == nd):
        return "MORE_SPECIFIC"
    if od == nd and (parent_of(nc) == oc or parent_of(oc) == nc):
        return "MORE_SPECIFIC"
    if rec and rec["relation"] == "NEUTRAL":
        return "REMOVED_FALSE_CHALLENGER"
    if rec:
        return "NEAR_TIE"
    return "NEAR_TIE"


def freeze_parent():
    im = load_json(K23 / "IMMUTABLE.json")
    if im.get("status") == "FROZEN":
        return
    im["status"] = "FROZEN"
    im["frozenAs"] = "parent of mechanical-pressure-k-v2.4"
    (K23 / "IMMUTABLE.json").write_text(json.dumps(im, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    if load_json(K15 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.5 must stay frozen")
    if not (K23 / "edges.json").exists():
        raise SystemExit("K v2.3 edges missing")
    freeze_parent()

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

    v23_edges = load_json(K23 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in v23_edges}
    leftover23 = leftover_cells(concept_ids, by_axis, v23_edges)
    priority = [cd for cd in V24_REVIEWS if cd[0] in trained and cd[1] in trained and cd not in reviewed]
    new_edges = [review_record(c, d, V24_REVIEWS[(c, d)], by_axis) for c, d in priority]
    v24_edges = v23_edges + new_edges
    leftover24 = leftover_cells(concept_ids, by_axis, v24_edges)
    pairs24, v24_edges = compute_pairs(decks, v24_edges, leftover24, by_axis, polarity)
    stats24 = coverage_stats(decks, v24_edges, leftover24, pairs24, by_axis, trained)
    idx24 = pair_index_eligible(pairs24, by_axis)

    pairs23 = load_json(K23 / "pairs.json")
    idx23 = pair_index_eligible(pairs23, by_axis)
    ids = [d["id"] for d in decks]
    geom = compare_geometry(ids, idx23, idx24)
    challenges, hdist24 = h_eligible(decks, leftover24, idx24, by_axis)
    challenges23, hdist23 = h_eligible(decks, leftover23, idx23, by_axis)
    tail24 = h_tail(challenges)
    tail23 = h_tail(challenges23)
    collapse = sequential_h_collapse(decks, leftover23, idx23, by_axis, new_edges)
    collapse["note"] = "Uses frozen v2.3 tops so leftover resolution is isolated from new-top movement."
    reversals = classify_reversals(geom["signFlips"], pairs24, new_edges)
    for flip in geom["signFlips"]:
        flip["M23prev"] = flip.get("M22")
        flip["M24"] = flip.get("M23")
    for flip in reversals["flips"]:
        flip["M23prev"] = flip.get("M22")
        flip["M24"] = flip.get("M23")

    n_rev = max(len(new_edges), 1)
    yield_block = {
        "reviews": len(new_edges),
        "pairsNewlyLt1": tail24["n_lt_1"] - tail23["n_lt_1"],
        "pairsNewlyLt05": tail24["n_lt_0_5"] - tail23["n_lt_0_5"],
        "pairsNewlyLt02": tail24["n_lt_0_2"] - tail23["n_lt_0_2"],
        "hLt1PerReview": round((tail24["n_lt_1"] - tail23["n_lt_1"]) / n_rev, 4),
        "hLt05PerReview": round((tail24["n_lt_0_5"] - tail23["n_lt_0_5"]) / n_rev, 4),
        "perReview": [
            {
                "edge": row["edge"],
                "relation": row["relation"],
                "Y_lt1": row["pairsCrossedLt1"],
                "Y_lt05": row["pairsCrossedLt05"],
            }
            for row in collapse["perReview"]
        ],
    }

    top_changes = []
    top_counts = defaultdict(int)
    for a in ids:
        for b in ids:
            if a == b:
                continue
            old = idx23[(a, b)].get("topEligible") or idx23[(a, b)]["top"]
            new = idx24[(a, b)].get("topEligible") or idx24[(a, b)]["top"]
            klass = classify_top_change(old, new, new_edges)
            top_counts[klass] += 1
            if klass != "UNCHANGED":
                top_changes.append({"pair": f"{a}→{b}", "from": old, "to": new, "class": klass})

    story24 = story_rows(pairs24, idx24)
    story23 = story_rows(pairs23, idx23)
    for s in story24:
        fr, to = s["pair"].split("→")
        match = next((r for r in challenges if r["from"] == fr and r["to"] == to), None)
        s0 = next((r for r in story23 if r["pair"] == s["pair"]), None)
        s["v23"] = s0
        if match:
            s["H_eligible"] = match["H_eligible"]
            s["largestUnresolvedEligible"] = match["largestUnresolvedEligible"]

    resistant = [r for r in challenges if r["H_eligible"] < 1]
    newly = [
        r
        for r in resistant
        if not any(x["from"] == r["from"] and x["to"] == r["to"] and x["H_eligible"] < 1 for x in challenges23)
    ]
    lane_counts = defaultdict(int)
    rel_counts = defaultdict(int)
    for e in new_edges:
        lane_counts[e["reviewBucket"]] += 1
        rel_counts[e["relation"]] += 1

    cycles = cycles_of(pairs24, ids)
    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "K_V2_4_MATURE_TAIL_SETCOVER",
        "parent": "mechanical-pressure-k-v2.3",
        "queuePolicy": {
            "optimize": "short_blocking_tails_then_shared_TAIL_6_10",
            "targetedBuckets": ["TAIL-3-5", "TAIL-6-10"],
            "depthNote": "No existing H<1 pair has a short H<0.5 tail (min 142 leftovers). Depth deferred.",
        },
        "newReviews": [
            {
                "capability": e["capability"],
                "target": e["target"],
                "relation": e["relation"],
                "lane": e["reviewBucket"],
                "p": e["p_mechanicalPressure"],
                "pressureEligible": e["pressureEligible"],
                "reason": e["reason"],
            }
            for e in new_edges
        ],
        "batchMix": {"lanes": dict(lane_counts), "relations": dict(rel_counts), "n": len(new_edges)},
        "coverage": stats24,
        "H_eligible": {**hdist24, **tail24, "top": challenges[:8]},
        "H_eligibleV23": tail23,
        "completionYield": yield_block,
        "H_collapse": collapse,
        "challengeResistantPairs": [{"pair": f"{r['from']}→{r['to']}", "H": r["H_eligible"], "top": r["topEligible"]} for r in resistant],
        "newlyResistant": [{"pair": f"{r['from']}→{r['to']}", "H": r["H_eligible"], "top": r["topEligible"]} for r in newly],
        "headlineChanges": {"counts": dict(top_counts), "changed": top_changes},
        "signReversalClasses": reversals,
        "cycles": cycles,
        "credibleCycles": sum(1 for c in cycles if (c.get("credibleGate") or {}).get("credible")),
        "storyPairs": story24,
        "polarityFlags": {k: sorted(v) for k, v in polarity.items() if v},
        "profileQABlocked": ["DAMAGE_PLAYER"],
        "safety": {
            "hodge": False,
            "rpsAuthorized": False,
            "extraDecks": False,
            "pressureV2Canon": False,
            "openai": False,
            "reembed": False,
        },
        **geom,
    }
    write_k(OUT, "mechanical-pressure-k-v2.4", v24_edges, pairs24, extra)
    (OUT / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUT / "batch.json").write_text(json.dumps(extra["newReviews"], indent=2) + "\n", encoding="utf-8")
    (OUT / "completion-yield.json").write_text(json.dumps(yield_block, indent=2) + "\n", encoding="utf-8")
    (OUT / "sign-reversals.json").write_text(json.dumps(reversals, indent=2) + "\n", encoding="utf-8")

    report_path = MS / "mechanical-pressure-k-v2-report.json"
    report = load_json(report_path) if report_path.exists() else {"version": "mechanical-pressure-k-v2", "lineage": "v2"}
    report["k24"] = extra
    report["note"] = (
        "Do not compare raw % coverage to v1.5. Denominator is Ontology v2.2 eligible C×D. "
        "Pressure v2 is not canonized."
    )
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    decomp = stats24["decomp"]["meanPairFractions"]
    print(
        json.dumps(
            {
                "nNew": len(new_edges),
                "mix": extra["batchMix"],
                "active": decomp.get("active"),
                "conditional": decomp.get("conditional"),
                "rho": extra["rhoAbsM"],
                "meanAbsDeltaM": extra["meanAbsDeltaM"],
                "topStable": f"{extra['eligibleHeadlineStability']['same']}/{extra['eligibleHeadlineStability']['n']}",
                "headlineClasses": dict(top_counts),
                "materialFlips": extra["materialSignReversals"],
                "reversalClasses": reversals["counts"],
                "unexplainedMaterial": reversals["unexplainedMaterial"],
                "cycles": len(cycles),
                "credibleCycles": extra["credibleCycles"],
                "H23": tail23,
                "H24": tail24,
                "yield": {k: yield_block[k] for k in yield_block if k != "perReview"},
                "newlyResistant": extra["newlyResistant"],
                "resistant": extra["challengeResistantPairs"],
                "story": story24,
                "skipped": [f"{c}→{d}" for c, d in V24_REVIEWS if (c, d) in reviewed],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

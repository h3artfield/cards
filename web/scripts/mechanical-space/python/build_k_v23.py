#!/usr/bin/env python3
"""
K v2.3 — challenge-resolution batch on frozen K v2.2.

Does not rebuild earlier K. Does not write deck-pressure-v2.
No Hodge. No extra decks. No Pressure-v2 canonization. DAMAGE_PLAYER stays blocked.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_k_v13_active_coverage import M
from build_k_v14_active_coverage import axis_mass, parse_top, spearman_rho
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs, coverage_stats, cycles_of, load_decks, story_rows, write_k
from build_k_v22 import h_eligible, leftover_cells
from mechanical_k_v11 import derive_pressure
from mechanical_k_v2 import (
    CAP_MECH,
    DEP_MECH,
    RES_MECH,
    SPLIT_PARENTS,
    V23_REVIEWS,
    axis_reliability,
    k_pressure_eligible,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K15 = MS / "mechanical-pressure-k-v1.5"
K22 = MS / "mechanical-pressure-k-v2.2"
PROF = MS / "deck-mechanical-profiles-v2"
OUT = MS / "mechanical-pressure-k-v2.3"

ACTIVE = {"ATTACKS", "DISRUPTS"}
SUSPECT_CAPS = {"DAMAGE_PLAYER"}


def review_record(c: str, d: str, decision: dict, by_axis: dict) -> dict:
    p = derive_pressure(decision)
    q = 0.72 if decision["relation"] == "CONDITIONAL" else 0.82
    if decision["status"] == "SUPPORTED_NEUTRAL":
        q = 0.8
    rec = {
        "capability": c,
        "target": d,
        "targetKind": (by_axis.get(d) or {}).get("kind", "dependency"),
        "reviewBucket": decision.get("lane", "challenge_v2.3"),
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
        "kVersionAdded": "mechanical-pressure-k-v2.3",
        "carryForward": False,
    }
    rec["pressureGate"] = k_pressure_eligible(rec, by_axis)
    rec["pressureEligible"] = rec["pressureGate"]["eligible"]
    return rec


def h_tail(hdist_challenges):
    hs = [r["H_eligible"] for r in hdist_challenges]
    return {
        "mean": float(np.mean(hs)) if hs else 0.0,
        "median": float(np.median(hs)) if hs else 0.0,
        "n_lt_1": sum(1 for h in hs if h < 1),
        "n_lt_0_5": sum(1 for h in hs if h < 0.5),
        "n_lt_0_2": sum(1 for h in hs if h < 0.2),
        "n_ge1": sum(1 for h in hs if h >= 1),
        "n": len(hs),
    }


def _eligible_leftover(leftover, by_axis):
    return [
        cd
        for cd in leftover
        if cd[0] in CAP_MECH
        and cd[1] in DEP_MECH
        and cd[0] not in SPLIT_PARENTS
        and cd[1] not in SPLIT_PARENTS
        and k_pressure_eligible({"capability": cd[0], "relation": "ATTACKS", "kClass": "NEW_ENDPOINT"}, by_axis)["eligible"]
    ]


def sequential_h_collapse(decks, leftover0, idx, by_axis, new_edges):
    cells = _eligible_leftover(leftover0, by_axis)
    ranked = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top = idx[(a["id"], b["id"])].get("topEligible") or idx[(a["id"], b["id"])]["top"]
            tc, td = parse_top(top)
            top_m = axis_mass(a, b, tc, td)
            rows = [(axis_mass(a, b, c, d), c, d) for c, d in cells if axis_mass(a, b, c, d) >= 0.10]
            rows.sort(reverse=True)
            ranked.append((top_m, rows))

    def dist_of(resolved: set):
        hs = []
        for top_m, rows in ranked:
            u = next((m for m, c, d in rows if (c, d) not in resolved), 0.0)
            hs.append(u / (top_m + 0.02))
        return {
            "mean": float(np.mean(hs)) if hs else 0.0,
            "median": float(np.median(hs)) if hs else 0.0,
            "n_lt_1": sum(1 for h in hs if h < 1),
            "n_lt_0_5": sum(1 for h in hs if h < 0.5),
            "n_ge1": sum(1 for h in hs if h >= 1),
        }

    resolved = set()
    h0 = dist_of(resolved)
    curve = []
    prev_mean, prev_lt1, prev_lt05 = h0["mean"], h0["n_lt_1"], h0["n_lt_0_5"]
    for e in new_edges:
        resolved.add((e["capability"], e["target"]))
        dist = dist_of(resolved)
        curve.append(
            {
                "edge": f"{e['capability']} → {e['target']}",
                "relation": e["relation"],
                "meanH": dist["mean"],
                "deltaMeanH": round(dist["mean"] - prev_mean, 4),
                "n_lt_1": dist["n_lt_1"],
                "n_lt_0_5": dist["n_lt_0_5"],
                "pairsCrossedLt1": dist["n_lt_1"] - prev_lt1,
                "pairsCrossedLt05": dist["n_lt_0_5"] - prev_lt05,
            }
        )
        prev_mean, prev_lt1, prev_lt05 = dist["mean"], dist["n_lt_1"], dist["n_lt_0_5"]
    return {
        "before": h0,
        "perReview": curve,
        "meanReduction": round(h0["mean"] - (curve[-1]["meanH"] if curve else h0["mean"]), 4),
        "pairsMovedLt1": (curve[-1]["n_lt_1"] if curve else h0["n_lt_1"]) - h0["n_lt_1"],
        "pairsMovedLt05": (curve[-1]["n_lt_0_5"] if curve else h0["n_lt_0_5"]) - h0["n_lt_0_5"],
        "note": "Uses frozen v2.2 tops so leftover resolution is isolated from new-top movement.",
    }


def compare_geometry(ids, idx_prev, idx_new):
    prev_e = {k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx_prev.items()}
    new_e = {k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx_new.items()}
    abs_prev, abs_new, directed_abs = [], [], []
    flips, material = [], 0
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            abs_prev.append(abs(M(prev_e, a, b)))
            abs_new.append(abs(M(new_e, a, b)))
            directed_abs.append(abs(M(new_e, a, b) - M(prev_e, a, b)))
    for a in ids:
        for b in ids:
            if a == b:
                continue
            m0, m1 = M(prev_e, a, b), M(new_e, a, b)
            s0 = 1 if m0 > 1e-9 else (-1 if m0 < -1e-9 else 0)
            s1 = 1 if m1 > 1e-9 else (-1 if m1 < -1e-9 else 0)
            if s0 and s1 and s0 != s1:
                flips.append({"pair": f"{a}→{b}", "M22": round(m0, 4), "M23": round(m1, 4)})
                if abs(m0) >= 0.08 and abs(m1) >= 0.08:
                    material += 1
    tops_same = sum(
        1
        for a in ids
        for b in ids
        if a != b
        and (prev_e[(a, b)].get("topEligible") or prev_e[(a, b)]["top"]) == (new_e[(a, b)].get("topEligible") or new_e[(a, b)]["top"])
    )
    return {
        "rhoAbsM": spearman_rho(abs_prev, abs_new),
        "meanAbsDeltaM": float(np.mean(directed_abs)) if directed_abs else 0.0,
        "signFlips": flips,
        "materialSignReversals": material,
        "eligibleHeadlineStability": {"same": tops_same, "n": 15 * 14},
    }


def classify_reversals(flips, pairs_new, new_edges):
    by = {(p["from"], p["to"]): p for p in pairs_new}
    new_dir = {(e["capability"], e["target"]) for e in new_edges if e["relation"] in ACTIVE}
    new_any = {(e["capability"], e["target"]) for e in new_edges}
    out = []
    counts = defaultdict(int)
    for flip in flips:
        a, b = flip["pair"].split("→")
        m0, m1 = flip["M22"], flip["M23"]
        if abs(m0) < 0.04 or abs(m1) < 0.04:
            klass = "NEAR_ZERO"
        else:
            terms = (by[(a, b)]["families"]["conservative"].get("attackTerms") or [])[:6]
            hits = [t for t in terms if (t["capability"], t["dependency"]) in new_dir]
            suspect = [t for t in terms if t["capability"] in SUSPECT_CAPS]
            if hits:
                klass = "PRECISION_EXPLAINED"
            elif suspect:
                klass = "ONTOLOGY_SUSPECT"
            elif any((t["capability"], t["dependency"]) in new_any for t in terms):
                klass = "PRECISION_EXPLAINED"
            else:
                klass = "UNEXPLAINED"
        rec = {**flip, "class": klass, "newActiveInTop": [f"{t['capability']} → {t['dependency']}" for t in (by[(a, b)]["families"]["conservative"].get("attackTerms") or [])[:6] if (t["capability"], t["dependency"]) in new_dir]}
        out.append(rec)
        counts[klass] += 1
    return {"counts": dict(counts), "flips": out, "unexplainedMaterial": sum(1 for r in out if r["class"] == "UNEXPLAINED" and abs(r["M22"]) >= 0.08 and abs(r["M23"]) >= 0.08)}


def freeze_parent():
    im = load_json(K22 / "IMMUTABLE.json")
    if im.get("status") == "FROZEN":
        return
    im["status"] = "FROZEN"
    im["frozenAs"] = "parent of mechanical-pressure-k-v2.3"
    (K22 / "IMMUTABLE.json").write_text(json.dumps(im, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    if load_json(K15 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.5 must stay frozen")
    if not (K22 / "edges.json").exists():
        raise SystemExit("K v2.2 edges missing")

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

    v22_edges = load_json(K22 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in v22_edges}
    leftover22 = leftover_cells(concept_ids, by_axis, v22_edges)
    priority = [cd for cd in V23_REVIEWS if cd[0] in trained and cd[1] in trained and cd not in reviewed]
    new_edges = [review_record(c, d, V23_REVIEWS[(c, d)], by_axis) for c, d in priority]
    v23_edges = v22_edges + new_edges
    leftover23 = leftover_cells(concept_ids, by_axis, v23_edges)
    pairs23, v23_edges = compute_pairs(decks, v23_edges, leftover23, by_axis, polarity)
    stats23 = coverage_stats(decks, v23_edges, leftover23, pairs23, by_axis, trained)
    idx23 = pair_index_eligible(pairs23, by_axis)

    pairs22 = load_json(K22 / "pairs.json")
    idx22 = pair_index_eligible(pairs22, by_axis)
    ids = [d["id"] for d in decks]
    geom = compare_geometry(ids, idx22, idx23)
    challenges, hdist23 = h_eligible(decks, leftover23, idx23, by_axis)
    challenges22, hdist22 = h_eligible(decks, leftover22, idx22, by_axis)
    tail23 = h_tail(challenges)
    tail22 = h_tail(challenges22)
    collapse = sequential_h_collapse(decks, leftover22, idx22, by_axis, new_edges)
    reversals = classify_reversals(geom["signFlips"], pairs23, new_edges)

    story23 = story_rows(pairs23, idx23)
    story22 = story_rows(pairs22, idx22)
    for s in story23:
        fr, to = s["pair"].split("→")
        match = next((r for r in challenges if r["from"] == fr and r["to"] == to), None)
        s0 = next((r for r in story22 if r["pair"] == s["pair"]), None)
        s["v22"] = s0
        if match:
            s["H_eligible"] = match["H_eligible"]
            s["largestUnresolvedEligible"] = match["largestUnresolvedEligible"]

    resistant = [r for r in challenges if r["H_eligible"] < 1]
    lane_counts = defaultdict(int)
    rel_counts = defaultdict(int)
    for e in new_edges:
        lane_counts[e["reviewBucket"]] += 1
        rel_counts[e["relation"]] += 1

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "K_V2_3_CHALLENGE_RESOLUTION_BATCH",
        "parent": "mechanical-pressure-k-v2.2",
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
        "coverage": stats23,
        "H_eligible": {**hdist23, **tail23, "top": challenges[:8]},
        "H_eligibleV22": tail22,
        "H_collapse": collapse,
        "challengeResistantPairs": [{"pair": f"{r['from']}→{r['to']}", "H": r["H_eligible"], "top": r["topEligible"]} for r in resistant],
        "signReversalClasses": reversals,
        "cycles": cycles_of(pairs23, ids),
        "storyPairs": story23,
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
    write_k(OUT, "mechanical-pressure-k-v2.3", v23_edges, pairs23, extra)
    (OUT / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUT / "batch.json").write_text(json.dumps(extra["newReviews"], indent=2) + "\n", encoding="utf-8")
    (OUT / "h-collapse.json").write_text(json.dumps(collapse, indent=2) + "\n", encoding="utf-8")
    (OUT / "sign-reversals.json").write_text(json.dumps(reversals, indent=2) + "\n", encoding="utf-8")

    report_path = MS / "mechanical-pressure-k-v2-report.json"
    report = load_json(report_path) if report_path.exists() else {"version": "mechanical-pressure-k-v2", "lineage": "v2"}
    report["k23"] = extra
    report["note"] = (
        "Do not compare raw % coverage to v1.5. Denominator is Ontology v2.2 eligible C×D. "
        "Pressure v2 is not canonized."
    )
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    decomp = stats23["decomp"]["meanPairFractions"]
    print(
        json.dumps(
            {
                "nNew": len(new_edges),
                "mix": extra["batchMix"],
                "coverage": {k: stats23[k] for k in stats23 if k != "decomp"},
                "active": decomp.get("active"),
                "conditional": decomp.get("conditional"),
                "rho": extra["rhoAbsM"],
                "meanAbsDeltaM": extra["meanAbsDeltaM"],
                "topStable": f"{extra['eligibleHeadlineStability']['same']}/{extra['eligibleHeadlineStability']['n']}",
                "materialFlips": extra["materialSignReversals"],
                "reversalClasses": reversals["counts"],
                "unexplainedMaterial": reversals["unexplainedMaterial"],
                "cycles": len(extra["cycles"]),
                "H22": tail22,
                "H23": tail23,
                "collapse": {
                    "meanReduction": collapse["meanReduction"],
                    "pairsMovedLt1": collapse["pairsMovedLt1"],
                    "pairsMovedLt05": collapse["pairsMovedLt05"],
                },
                "resistant": extra["challengeResistantPairs"],
                "story": story23,
                "skipped": [f"{c}→{d}" for c, d in V23_REVIEWS if (c, d) in reviewed],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

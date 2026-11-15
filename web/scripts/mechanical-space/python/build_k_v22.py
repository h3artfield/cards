#!/usr/bin/env python3
"""
K v2.2 — child-level active-pressure batch on frozen K v2.1.

Does not rebuild v2.0/v2.1. Does not write deck-pressure-v2.
No Hodge. No extra decks. No Pressure-v2 canonization.
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
from build_k_v2 import (
    compute_pairs,
    coverage_stats,
    cycles_of,
    exposure_rank,
    load_decks,
    story_rows,
    write_k,
)
from mechanical_k_v11 import derive_pressure
from mechanical_k_v2 import (
    CAP_MECH,
    CAUSAL_RESOLUTION_FAMILIES,
    DEP_MECH,
    RES_MECH,
    SPLIT_PARENTS,
    UNSUPPORTED_AXES,
    V22_REVIEWS,
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
K21 = MS / "mechanical-pressure-k-v2.1"
PROF = MS / "deck-mechanical-profiles-v2"
OUT = MS / "mechanical-pressure-k-v2.2"

ACTIVE = {"ATTACKS", "DISRUPTS"}
ENABLE = {"ENABLES", "BENEFITS"}


def review_record(c: str, d: str, decision: dict, by_axis: dict) -> dict:
    p = derive_pressure(decision)
    q = 0.72 if decision["relation"] == "CONDITIONAL" else 0.82
    if decision["status"] == "SUPPORTED_NEUTRAL":
        q = 0.8
    a_c = axis_reliability(by_axis[c]) if c in by_axis else 0.2
    a_d = axis_reliability(by_axis[d]) if d in by_axis else 0.2
    rec = {
        "capability": c,
        "target": d,
        "targetKind": (by_axis.get(d) or {}).get("kind", "dependency"),
        "reviewBucket": decision.get("lane", "precision_v2.2"),
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
        "a_capabilityReliability": round(a_c, 4),
        "a_targetReliability": round(a_d, 4),
        "kClass": "NEW_ENDPOINT",
        "kVersionAdded": "mechanical-pressure-k-v2.2",
        "carryForward": False,
    }
    rec["pressureGate"] = k_pressure_eligible(rec, by_axis)
    rec["pressureEligible"] = rec["pressureGate"]["eligible"]
    return rec


def leftover_cells(concept_ids, by_axis, edges):
    have = {(e["capability"], e["target"]) for e in edges}
    return [
        (c, d)
        for c in concept_ids
        for d in concept_ids
        if (by_axis.get(c) or {}).get("kind") == "capability"
        and (by_axis.get(d) or {}).get("kind") == "dependency"
        and (c, d) not in have
        and c not in UNSUPPORTED_AXES
        and d not in UNSUPPORTED_AXES
    ]


def h_eligible(decks, leftover, idx, by_axis):
    challenges = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top = idx[(a["id"], b["id"])].get("topEligible") or idx[(a["id"], b["id"])]["top"]
            tc, td = parse_top(top)
            top_m = axis_mass(a, b, tc, td)
            elig = []
            for c, d in leftover:
                if c not in CAP_MECH or d not in DEP_MECH:
                    continue
                if c in SPLIT_PARENTS or d in SPLIT_PARENTS:
                    continue
                if not k_pressure_eligible({"capability": c, "relation": "ATTACKS", "kClass": "NEW_ENDPOINT"}, by_axis)["eligible"]:
                    continue
                m = axis_mass(a, b, c, d)
                if m >= 0.10:
                    elig.append((m, c, d))
            elig.sort(reverse=True)
            u = elig[0] if elig else (0.0, None, None)
            challenges.append(
                {
                    "from": a["id"],
                    "to": b["id"],
                    "topEligible": top,
                    "H_eligible": round(u[0] / (top_m + 0.02), 4),
                    "largestUnresolvedEligible": {"capability": u[1], "dependency": u[2], "mass": round(u[0], 4)} if u[1] else None,
                }
            )
    challenges.sort(key=lambda r: -r["H_eligible"])
    hs = [r["H_eligible"] for r in challenges]
    return challenges, {
        "mean": float(np.mean(hs)) if hs else 0.0,
        "median": float(np.median(hs)) if hs else 0.0,
        "n_lt_1": sum(1 for h in hs if h < 1),
        "n_lt_0_5": sum(1 for h in hs if h < 0.5),
        "n_ge1": sum(1 for h in hs if h >= 1),
        "n": len(hs),
        "top": challenges[:8],
    }


def classify_family(child_relations: list[str | None]) -> str:
    known = [r for r in child_relations if r]
    if len(known) < 2:
        return "insufficient_children"
    n_att = sum(1 for r in known if r in ACTIVE)
    n_en = sum(1 for r in known if r in ENABLE)
    n_neu = sum(1 for r in known if r == "NEUTRAL")
    if n_att == 1 and n_neu >= 1 and n_en == 0:
        return "one_precise_attack_plus_neutrals"
    if n_en == 1 and n_neu >= 1 and n_att == 0:
        return "one_precise_enable_plus_neutrals"
    if n_att >= 1 and n_neu >= 1 and n_en == 0:
        return "one_precise_attack_plus_neutrals" if n_att == 1 else "multiple_genuinely_different"
    if n_att >= 2 and n_neu == 0 and n_en == 0:
        return "uniform_active"
    if (n_att + n_en) >= 2 or (n_att >= 1 and n_en >= 1):
        return "multiple_genuinely_different"
    return "still_ambiguous"


def causal_resolution(v15_edges, live_edges):
    v15 = {(e["capability"], e["target"]): e.get("relation") for e in v15_edges}
    live = {(e["capability"], e["target"]): e.get("relation") for e in live_edges if not e.get("historicalOnly")}
    families = []
    counts = defaultdict(int)
    for fam in CAUSAL_RESOLUTION_FAMILIES:
        coarse_rel = v15.get(fam["coarse"])
        children = [{"edge": f"{c} → {d}", "relation": live.get((c, d))} for c, d in fam["children"]]
        pattern = classify_family([row["relation"] for row in children])
        counts[pattern] += 1
        families.append(
            {
                "id": fam["id"],
                "coarse": f"{fam['coarse'][0]} → {fam['coarse'][1]}",
                "coarseRelation": coarse_rel,
                "children": children,
                "pattern": pattern,
            }
        )
    per_new = []
    for e in live_edges:
        if e.get("kVersionAdded") != "mechanical-pressure-k-v2.2":
            continue
        c, d = e["capability"], e["target"]
        parent_d = parent_of(d)
        coarse = None
        coarse_rel = None
        if parent_d and (c, parent_d) in v15:
            coarse = f"{c} → {parent_d}"
            coarse_rel = v15[(c, parent_d)]
        per_new.append(
            {
                "edge": f"{c} → {d}",
                "relation": e["relation"],
                "v1Coarse": coarse,
                "v1CoarseRelation": coarse_rel,
            }
        )
    return {
        "families": families,
        "patternCounts": dict(counts),
        "newChildVsV1": per_new,
    }


def compare_geometry(ids, idx_prev, idx_new):
    prev_e = {k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx_prev.items()}
    new_e = {k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx_new.items()}
    abs_prev, abs_new, flips, material = [], [], [], 0
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            abs_prev.append(abs(M(prev_e, a, b)))
            abs_new.append(abs(M(new_e, a, b)))
    for a in ids:
        for b in ids:
            if a == b:
                continue
            s0 = 1 if M(prev_e, a, b) > 1e-9 else (-1 if M(prev_e, a, b) < -1e-9 else 0)
            s1 = 1 if M(new_e, a, b) > 1e-9 else (-1 if M(new_e, a, b) < -1e-9 else 0)
            if s0 and s1 and s0 != s1:
                flips.append({"pair": f"{a}→{b}", "M21": round(M(prev_e, a, b), 4), "M22": round(M(new_e, a, b), 4)})
                if abs(M(prev_e, a, b)) >= 0.08 and abs(M(new_e, a, b)) >= 0.08:
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
        "signFlips": flips,
        "materialSignReversals": material,
        "eligibleHeadlineStability": {"same": tops_same, "n": 15 * 14},
    }


def freeze_parent():
    im = load_json(K21 / "IMMUTABLE.json")
    if im.get("status") == "FROZEN":
        return
    im["status"] = "FROZEN"
    im["frozenAs"] = "parent of mechanical-pressure-k-v2.2"
    (K21 / "IMMUTABLE.json").write_text(json.dumps(im, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    if load_json(K15 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.5 must stay frozen")
    if not (K21 / "edges.json").exists():
        raise SystemExit("K v2.1 edges missing")

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
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    decks, polarity = load_decks(concept_ids, by_axis, scores, p90, p99, row_of, name_of, type_of)

    v21_edges = load_json(K21 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in v21_edges}
    leftover21 = leftover_cells(concept_ids, by_axis, v21_edges)
    E = exposure_rank(decks, leftover21)
    priority = [cd for cd in V22_REVIEWS if cd[0] in trained and cd[1] in trained and cd not in reviewed]
    priority.sort(key=lambda cd: -E.get(cd, 0.0))

    new_edges = [review_record(c, d, V22_REVIEWS[(c, d)], by_axis) for c, d in priority]
    v22_edges = v21_edges + new_edges
    leftover22 = leftover_cells(concept_ids, by_axis, v22_edges)
    pairs22, v22_edges = compute_pairs(decks, v22_edges, leftover22, by_axis, polarity)
    stats22 = coverage_stats(decks, v22_edges, leftover22, pairs22, by_axis, trained)
    idx22 = pair_index_eligible(pairs22, by_axis)

    pairs21 = load_json(K21 / "pairs.json")
    idx21 = pair_index_eligible(pairs21, by_axis)
    ids = [d["id"] for d in decks]
    geom = compare_geometry(ids, idx21, idx22)
    challenges, hdist = h_eligible(decks, leftover22, idx22, by_axis)
    _, hdist21 = h_eligible(decks, leftover21, idx21, by_axis)

    story22 = story_rows(pairs22, idx22)
    story21 = story_rows(pairs21, idx21)
    for s in story22:
        fr, to = s["pair"].split("→")
        match = next((r for r in challenges if r["from"] == fr and r["to"] == to), None)
        s0 = next((r for r in story21 if r["pair"] == s["pair"]), None)
        s["v21"] = s0
        if match:
            s["H_eligible"] = match["H_eligible"]
            s["largestUnresolvedEligible"] = match["largestUnresolvedEligible"]

    resolution = causal_resolution(load_json(K15 / "edges.json"), v22_edges)
    lane_counts = defaultdict(int)
    rel_counts = defaultdict(int)
    for e in new_edges:
        lane_counts[e["reviewBucket"]] += 1
        rel_counts[e["relation"]] += 1

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "K_V2_2_CHILD_ACTIVE_BATCH",
        "parent": "mechanical-pressure-k-v2.1",
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
        "coverage": stats22,
        "H_eligible": hdist,
        "H_eligibleV21": {k: hdist21[k] for k in ("mean", "median", "n_lt_1", "n_lt_0_5", "n_ge1")},
        "causalResolutionGain": resolution,
        "cycles": cycles_of(pairs22, ids),
        "storyPairs": story22,
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
    write_k(OUT, "mechanical-pressure-k-v2.2", v22_edges, pairs22, extra)
    (OUT / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUT / "batch.json").write_text(json.dumps(extra["newReviews"], indent=2) + "\n", encoding="utf-8")
    (OUT / "causal-resolution.json").write_text(json.dumps(resolution, indent=2) + "\n", encoding="utf-8")

    report_path = MS / "mechanical-pressure-k-v2-report.json"
    report = load_json(report_path) if report_path.exists() else {"version": "mechanical-pressure-k-v2", "lineage": "v2"}
    report["k22"] = extra
    report["note"] = (
        "Do not compare raw % coverage to v1.5. Denominator is Ontology v2.2 eligible C×D. "
        "Pressure v2 is not canonized."
    )
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    decomp = stats22["decomp"]["meanPairFractions"]
    print(
        json.dumps(
            {
                "nNew": len(new_edges),
                "mix": extra["batchMix"],
                "coverage": {k: stats22[k] for k in stats22 if k != "decomp"},
                "active": decomp.get("active"),
                "conditional": decomp.get("conditional"),
                "reviewed": decomp.get("reviewed"),
                "rho": extra["rhoAbsM"],
                "topStable": f"{extra['eligibleHeadlineStability']['same']}/{extra['eligibleHeadlineStability']['n']}",
                "materialFlips": extra["materialSignReversals"],
                "cycles": len(extra["cycles"]),
                "H": extra["H_eligible"],
                "H21": extra["H_eligibleV21"],
                "resolution": resolution["patternCounts"],
                "story": story22,
                "skippedAlreadyReviewed": [f"{c}→{d}" for c, d in V22_REVIEWS if (c, d) in reviewed],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

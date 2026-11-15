#!/usr/bin/env python3
"""
K v3.0 — Expansion Prospective Closure.

Reviews exactly the 53 HIGH/MED cells frozen in Phase 3 before adjudication.
352 K v2.7 relations carry forward unchanged.
Does not write Expanded Pressure. No Hodge. No new decks.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_frozen_k_applicability_audit_v1 import (
    ANCHOR,
    CAUSAL,
    CLASSES,
    CRED,
    EXPANSION,
    HOSTILE_REL,
    LIVE,
    MATERIAL,
    SUPPORT_REL,
    load_corpus,
    mass_block,
    no_causal_anchor,
    pair_class,
    summarize_h,
)
from build_k_v13_active_coverage import M
from build_k_v14_active_coverage import axis_mass, spearman_rho
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs, coverage_stats, load_decks, write_k
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover, compare_geometry
from build_k_v25 import outcome_bucket, pair_h_both
from build_k_v26 import net_index
from build_k_v27 import compare_on, maturity_class
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v11 import derive_pressure
from mechanical_k_v2 import CAP_MECH, DEP_MECH, RES_MECH, V3_REVIEWS, axis_reliability, k_pressure_eligible
from mechanical_pressure_channels_v1 import attach_channels
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K27 = MS / "mechanical-pressure-k-v2.7"
P3 = MS / "frozen-k-applicability-audit-v1"
PROF2 = MS / "deck-mechanical-profiles-v2"
CEX = MS / "corpus-expansion-v1"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "mechanical-pressure-k-v3.0"
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
        "reviewBucket": decision.get("lane", "expansion-prospective-closure"),
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
        "kVersionAdded": "mechanical-pressure-k-v3.0",
        "carryForward": False,
        "compatibilityAtReview": compatibility(c, d),
        "preReviewStratum": decision.get("preReviewStratum"),
        "selection": "corpus-expansion-v1-phase-3",
        "selectionTime": "before_relation_adjudication",
    }
    rec["pressureGate"] = k_pressure_eligible(rec, by_axis)
    rec["pressureEligible"] = rec["pressureGate"]["eligible"]
    return rec


def freeze_queue(novelty_cells: list[dict]) -> list[dict]:
    queue = [
        {
            "capability": c["capability"],
            "dependency": c["dependency"],
            "compatibility": c["compatibility"],
            "novelty": c["novelty"],
            "expansionExposure": c["expansionExposure"],
            "nDirectedPairsAffected": c["nDirectedPairsAffected"],
            "rank": i + 1,
        }
        for i, c in enumerate(novelty_cells)
    ]
    keys = [(r["capability"], r["dependency"]) for r in queue]
    if len(keys) != 53:
        raise SystemExit(f"frozen queue must have 53 cells, got {len(keys)}")
    if set(keys) != set(V3_REVIEWS):
        missing = set(keys) - set(V3_REVIEWS)
        extra = set(V3_REVIEWS) - set(keys)
        raise SystemExit(f"V3_REVIEWS does not match frozen queue. missing={missing} extra={extra}")
    if any(k in V3_REVIEWS for k in keys) and [V3_REVIEWS[k] for k in keys] and len(V3_REVIEWS) != 53:
        raise SystemExit("V3_REVIEWS count != 53")
    return queue


def class_tables(all_h, decks_by_id, pair_keys, leftover_set, reviewed, compat):
    mass, hsum, nca = {}, {}, {}
    for name, pred in CLASSES.items():
        rows = [r for r in all_h if r["pairClass"] == name]
        mass[name] = mass_block(decks_by_id, pair_keys, leftover_set, reviewed, compat, pred)
        hsum[name] = summarize_h(rows)
        n = 0
        for r in rows:
            flag, *_ = no_causal_anchor(decks_by_id[r["from"]], decks_by_id[r["to"]], reviewed, leftover_set, compat)
            n += int(flag)
        nca[name] = n
    return mass, hsum, nca


def next_gaps(decks_by_id, leftover_set, compat, pair_keys):
    rows = []
    for c, d in leftover_set:
        if compat[(c, d)] not in CRED:
            continue
        exp_n = exp_m = anc_n = anc_m = 0
        classes = set()
        for src, dst in pair_keys:
            m = axis_mass(decks_by_id[src], decks_by_id[dst], c, d)
            if m < MATERIAL:
                continue
            klass = pair_class(src, dst)
            if klass == "anchor_to_anchor":
                anc_n += 1
                anc_m += m
            else:
                exp_n += 1
                exp_m += m
                classes.add(klass)
        if exp_n == 0:
            continue
        rows.append(
            {
                "capability": c,
                "dependency": d,
                "compatibility": compat[(c, d)],
                "expansionExposure": round(exp_m, 4),
                "nDirectedPairsAffected": exp_n,
                "pairClassesAffected": sorted(classes),
                "anchorHistoricalExposure": round(anc_m, 4),
            }
        )
    rows.sort(key=lambda r: (-r["expansionExposure"], -r["nDirectedPairsAffected"]))
    return rows


def channel_index(pairs, field):
    out = {}
    for p in pairs:
        cons = p["families"]["conservative"]
        val = float(cons.get(field) or 0.0)
        out[(p["from"], p["to"])] = {"P": val, "P_eligible": val, "coverage": cons["coverage"], "top": cons.get("eligibleTop"), "topEligible": cons.get("eligibleTop")}
    return out


def classify_anchor_change(p27, p30, new_keys, d_h, d_m):
    if abs(d_h) < 0.02 and abs(d_m) < 0.05:
        return "NEAR_ZERO"
    cons = p30["families"]["conservative"]
    terms = (cons.get("attackTerms") or []) + (cons.get("enableTerms") or [])
    hit = any((t.get("capability"), t.get("dependency")) in new_keys and t.get("effectiveTerm", 0) >= 0.005 for t in terms)
    if hit:
        return "NEWLY_RESOLVED_OLD_DEBT"
    if d_h < -0.02:
        # HIGH/MED leftover was closed, including NEUTRAL reviews that never become terms.
        return "NEWLY_RESOLVED_OLD_DEBT"
    top0 = (p27["families"]["conservative"].get("eligibleTop") or "")
    top1 = (cons.get("eligibleTop") or "")
    if top0 != top1 and abs(d_m) >= 0.05:
        return "PRECISION_EXPLAINED"
    if d_h > 0.05 or abs(d_m) >= 0.08:
        return "UNEXPLAINED"
    return "NEAR_ZERO"


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (K27, "K v2.7"), (P3, "Phase 3"), (CEX, "Phase 1")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    novelty = load_json(P3 / "relation-novelty.json")["cells"]
    queue = freeze_queue(novelty)
    (P3 / "frozen-prospective-queue.json").write_text(
        json.dumps(
            {
                "status": "FROZEN",
                "reviewed": False,
                "n": 53,
                "selectionTime": "before_relation_adjudication",
                "parent": "frozen-k-applicability-audit-v1",
                "cells": queue,
                "note": "Ordering is Phase 3 expansion-exposure rank. Do not reorder.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    rc8 = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]

    v27_edges = load_json(K27 / "edges.json")
    have = {(e["capability"], e["target"]) for e in v27_edges}
    new_edges = []
    for c, d in ((r["capability"], r["dependency"]) for r in queue):
        if (c, d) in have:
            raise SystemExit(f"queue cell already in K v2.7: {c}→{d}")
        new_edges.append(review_record(c, d, V3_REVIEWS[(c, d)], by_axis))
    v3_edges = v27_edges + new_edges
    new_keys = {(e["capability"], e["target"]) for e in new_edges}

    print("profiling Anchor-15 for K artifact…", flush=True)
    decks15, polarity15 = load_decks(concept_ids, by_axis, scores, p90, p99, row_of, name_of, type_of)
    leftover27 = leftover_cells(concept_ids, by_axis, v27_edges)
    leftover3 = leftover_cells(concept_ids, by_axis, v3_edges)
    pairs15, v3_edges = compute_pairs(decks15, [dict(e) for e in v3_edges], leftover3, by_axis, polarity15)
    attach_channels(pairs15)
    stats = coverage_stats(decks15, v3_edges, leftover3, pairs15, by_axis, set(concept_ids))
    write_k(OUT, "mechanical-pressure-k-v3.0", v3_edges, pairs15, {"status": "K_V3_EXPANSION_PROSPECTIVE_CLOSURE", "nNewReviews": 53, "parent": "mechanical-pressure-k-v2.7"})

    print("profiling sealed 30 for applicability…", flush=True)
    decks30, polarity30 = load_corpus(concept_ids, by_axis, scores, p90, p99, row_of, name_of, type_of)
    decks_by_id = {d["id"]: d for d in decks30}

    leftover_el27 = set(_eligible_leftover(leftover27, by_axis))
    leftover_el3 = set(_eligible_leftover(leftover3, by_axis))
    reviewed27 = {}
    for e in v27_edges:
        if e.get("kClass") in LIVE:
            e = dict(e)
            e["pressureGate"] = k_pressure_eligible(e, by_axis)
            e["pressureEligible"] = e["pressureGate"]["eligible"]
            reviewed27[(e["capability"], e["target"])] = e
    reviewed3 = {}
    for e in v3_edges:
        if e.get("kClass") in LIVE:
            e = dict(e)
            e["pressureGate"] = k_pressure_eligible(e, by_axis)
            e["pressureEligible"] = e["pressureGate"]["eligible"]
            reviewed3[(e["capability"], e["target"])] = e
    cells27 = sorted(set(reviewed27) | leftover_el27)
    cells3 = sorted(set(reviewed3) | leftover_el3)
    compat27 = {cd: compatibility(cd[0], cd[1])["level"] for cd in cells27}
    compat3 = {cd: compatibility(cd[0], cd[1])["level"] for cd in cells3}

    pairs27, _ = compute_pairs(decks30, [dict(e) for e in v27_edges], leftover27, by_axis, polarity30)
    pairs30, _ = compute_pairs(decks30, [dict(e) for e in v3_edges], leftover3, by_axis, polarity30)
    attach_channels(pairs27)
    attach_channels(pairs30)
    idx27 = pair_index_eligible(pairs27, by_axis)
    idx30 = pair_index_eligible(pairs30, by_axis)
    h27 = pair_h_both(decks30, leftover27, idx27, by_axis)
    h30 = pair_h_both(decks30, leftover3, idx30, by_axis)
    for r in h27:
        r["maturity"] = maturity_class(r["H_credible"])
        r["pairClass"] = pair_class(r["from"], r["to"])
    for r in h30:
        r["maturity"] = maturity_class(r["H_credible"])
        r["pairClass"] = pair_class(r["from"], r["to"])
    pair_keys = [(r["from"], r["to"]) for r in h30]

    mass27, hsum27, nca27 = class_tables(h27, decks_by_id, pair_keys, leftover_el27, reviewed27, compat27)
    mass30, hsum30, nca30 = class_tables(h30, decks_by_id, pair_keys, leftover_el3, reviewed3, compat3)

    compare = {}
    for name in CLASSES:
        compare[name] = {
            "v27": {**mass27[name], **hsum27[name], "NO_CAUSAL_ANCHOR": nca27[name]},
            "v30": {**mass30[name], **hsum30[name], "NO_CAUSAL_ANCHOR": nca30[name]},
            "delta": {
                "applicability": round((mass30[name]["applicability"] or 0) - (mass27[name]["applicability"] or 0), 4),
                "mean_H_credible": round(hsum30[name]["mean_H_credible"] - hsum27[name]["mean_H_credible"], 4),
                "MATURE": hsum30[name]["MATURE"] - hsum27[name]["MATURE"],
                "PARTIALLY_MATURE": hsum30[name]["PARTIALLY_MATURE"] - hsum27[name]["PARTIALLY_MATURE"],
                "IMMATURE": hsum30[name]["IMMATURE"] - hsum27[name]["IMMATURE"],
                "credibleUnknownMass": round(mass30[name]["credibleUnknownMass"] - mass27[name]["credibleUnknownMass"], 4),
            },
        }

    debt53 = [(r["capability"], r["dependency"]) for r in queue]
    def debt_mass(pair_list, leftover_set):
        tot = 0.0
        for src, dst in pair_list:
            a, b = decks_by_id[src], decks_by_id[dst]
            for c, d in debt53:
                if (c, d) not in leftover_set:
                    continue
                if compat27.get((c, d), compat3.get((c, d))) not in CRED:
                    continue
                tot += axis_mass(a, b, c, d)
        return tot

    all_pairs = pair_keys
    closure = {}
    for name, pred in list(CLASSES.items()) + [("combined", lambda a, b: True)]:
        keys = [(a, b) for a, b in all_pairs if pred(a, b)]
        before53 = debt_mass(keys, leftover_el27)
        after53 = debt_mass(keys, leftover_el3)
        unk0 = mass27[name]["credibleUnknownMass"] if name != "combined" else sum(mass27[k]["credibleUnknownMass"] for k in CLASSES)
        unk1 = mass30[name]["credibleUnknownMass"] if name != "combined" else sum(mass30[k]["credibleUnknownMass"] for k in CLASSES)
        closure[name] = {
            "debt53UnknownBefore": round(before53, 4),
            "debt53UnknownAfter": round(after53, 4),
            "debt53Closure": round(1.0 - (after53 / before53), 4) if before53 else 1.0,
            "overallUnknownBefore": round(unk0, 4),
            "overallUnknownAfter": round(unk1, 4),
            "overallClosure": round(1.0 - (unk1 / unk0), 4) if unk0 else None,
        }

    aa_ids = sorted(ANCHOR)
    idx_h27 = channel_index([p for p in pairs27 if p["from"] in ANCHOR and p["to"] in ANCHOR], "hostile_pressure")
    idx_h30 = channel_index([p for p in pairs30 if p["from"] in ANCHOR and p["to"] in ANCHOR], "hostile_pressure")
    idx_n27 = net_index([p for p in pairs27 if p["from"] in ANCHOR and p["to"] in ANCHOR])
    idx_n30 = net_index([p for p in pairs30 if p["from"] in ANCHOR and p["to"] in ANCHOR])
    geom_h = compare_geometry(aa_ids, idx_h27, idx_h30)
    geom_n = compare_geometry(aa_ids, idx_n27, idx_n30)
    aa_keys = {(a, b) for a in aa_ids for b in aa_ids if a != b}
    stab_h = compare_on(aa_keys, idx27, idx30)

    by27p = {(p["from"], p["to"]): p for p in pairs27}
    by30p = {(p["from"], p["to"]): p for p in pairs30}
    by27h = {(r["from"], r["to"]): r for r in h27}
    by30h = {(r["from"], r["to"]): r for r in h30}
    change_counts = defaultdict(int)
    change_rows = []
    for a, b in sorted(aa_keys):
        d_h = by30h[(a, b)]["H_credible"] - by27h[(a, b)]["H_credible"]
        d_m = M(idx30, a, b) - M(idx27, a, b)
        klass = classify_anchor_change(by27p[(a, b)], by30p[(a, b)], new_keys, d_h, d_m)
        change_counts[klass] += 1
        if klass != "NEAR_ZERO":
            cons = by30p[(a, b)]["families"]["conservative"]
            change_rows.append({"from": a, "to": b, "class": klass, "dHcred": round(d_h, 4), "dM": round(d_m, 4), "top27": idx27[(a, b)].get("topEligible"), "top30": cons.get("eligibleTop")})

    gaps = next_gaps(decks_by_id, leftover_el3, compat3, pair_keys)

    stratum = defaultdict(lambda: defaultdict(int))
    for e in new_edges:
        bucket = "attack_disrupt" if e["relation"] in ACTIVE else ("enable" if e["relation"] in ENABLE else ("conditional" if e["relation"] == "CONDITIONAL" else "neutral"))
        stratum[e.get("preReviewStratum") or "?"][bucket] += 1
        stratum[e.get("preReviewStratum") or "?"]["n"] += 1
    rel_counts = defaultdict(int)
    for e in new_edges:
        rel_counts[e["relation"]] += 1

    amp = [e for e in new_edges if e.get("preReviewStratum") == "AMPLIFIED_RELATION"]

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "K_V3_EXPANSION_PROSPECTIVE_CLOSURE",
        "parent": "mechanical-pressure-k-v2.7",
        "selection": "corpus-expansion-v1-phase-3",
        "selectionTime": "before_relation_adjudication",
        "nCarryForward": len(v27_edges),
        "nNewReviews": len(new_edges),
        "relationCounts": dict(rel_counts),
        "stratumOutcomes": {k: dict(v) for k, v in stratum.items()},
        "amplifiedCombatCohort": [
            {"capability": e["capability"], "target": e["target"], "relation": e["relation"], "conditionality": e["conditionality"], "reason": e["reason"]}
            for e in amp
        ],
        "coverage": stats,
        "compatibilityScreen": {"version": "compatibility-screen-v1", "sha256": frozen_hash, "editedDuringRun": False},
        "pairClassComparison": compare,
        "expansionDebtClosure": closure,
        "anchorStability": {
            "headlineRetention": stab_h.get("headlineRetention"),
            "rhoM_eligible": stab_h.get("rhoAbsM"),
            "rhoM_hostile": geom_h.get("rhoAbsM") if isinstance(geom_h, dict) else None,
            "rhoM_net": geom_n.get("rhoAbsM") if isinstance(geom_n, dict) else None,
            "materialSignChanges": stab_h.get("materialSignReversals"),
            "changeClasses": dict(change_counts),
            "unexplained": change_counts["UNEXPLAINED"],
            "materialChanges": change_rows[:40],
        },
        "nextProspectiveGapSet": {"n": len(gaps), "top15": gaps[:15], "note": "HIGH/MED leftover cells still material on expansion pairs after the 53 were reviewed."},
        "safety": {"newCellsBeyondFrozen53": False, "expandedPressure": False, "hodge": False, "ontologyRetrain": False, "compatibilityEdited": False, "rps": False},
    }
    (OUT / "manifest.json").write_text(json.dumps({k: extra[k] for k in extra if k != "amplifiedCombatCohort"}, indent=2) + "\n", encoding="utf-8")
    (OUT / "new-reviews.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUT / "applicability-comparison.json").write_text(json.dumps(compare, indent=2) + "\n", encoding="utf-8")
    (OUT / "closure.json").write_text(json.dumps(closure, indent=2) + "\n", encoding="utf-8")
    (OUT / "anchor-stability.json").write_text(json.dumps(extra["anchorStability"], indent=2) + "\n", encoding="utf-8")
    (OUT / "next-gap-set.json").write_text(json.dumps(extra["nextProspectiveGapSet"], indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(extra, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "MechanicalPressureK",
                "version": "mechanical-pressure-k-v3.0",
                "status": "REVIEWED_BATCH",
                "lineage": "v3",
                "parent": "mechanical-pressure-k-v2.7",
                "nNewReviews": 53,
                "selection": "corpus-expansion-v1-phase-3",
                "expandedPressure": False,
                "note": "Expansion Prospective Closure. Report and wait. Do not freeze Expanded Pressure yet.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "nNew": 53,
                "relations": dict(rel_counts),
                "stratum": {k: dict(v) for k, v in stratum.items()},
                "maturity": {k: {"v27": {kk: hsum27[k][kk] for kk in ("MATURE", "PARTIALLY_MATURE", "IMMATURE", "mean_H_credible")}, "v30": {kk: hsum30[k][kk] for kk in ("MATURE", "PARTIALLY_MATURE", "IMMATURE", "mean_H_credible")}} for k in CLASSES},
                "applicability": {k: {"v27": mass27[k]["applicability"], "v30": mass30[k]["applicability"]} for k in CLASSES},
                "closure": {k: {kk: closure[k][kk] for kk in ("debt53Closure", "overallClosure")} for k in closure},
                "nca": {"v27": nca27, "v30": nca30},
                "nextGaps": len(gaps),
                "anchorChangeClasses": dict(change_counts),
                "unexplained": change_counts["UNEXPLAINED"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Phase 3 — Frozen-K Applicability Audit.

No new K reviews. No expanded Pressure object. No Hodge.
Measures whether frozen K v2.7 applies to sealed Expansion-15 combinations.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_deck_mechanical_profiles_v2 import profile_deck
from build_k_v27 import maturity_class
from build_interaction_diversity_audit_v1 import (
    accumulate_rows,
    bucket_of,
    cap_domain,
    cap_family,
    dep_family,
)
from build_k_v13_active_coverage import resolve_cards
from build_k_v14_active_coverage import axis_mass, parse_top
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from build_k_v25 import pair_h_both
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v2 import CAP_MECH, DEP_MECH, k_pressure_eligible, polarity_blocked_caps
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K27 = MS / "mechanical-pressure-k-v2.7"
P2 = MS / "deck-pressure-v2"
PROF2 = MS / "deck-mechanical-profiles-v2"
CEX = MS / "corpus-expansion-v1"
P2PROF = MS / "expansion-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "frozen-k-applicability-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

LIVE = {"UNCHANGED_ENDPOINTS", "NEW_ENDPOINT", "CARRY_FORWARD_VERIFIED", "RETIRED_BROAD"}
CRED = {"HIGH", "MEDIUM"}
CAUSAL = {"ATTACKS", "DISRUPTS", "ENABLES", "BENEFITS", "CONDITIONAL"}
HOSTILE_REL = {"ATTACKS", "DISRUPTS"}
SUPPORT_REL = {"ENABLES", "BENEFITS"}
MATERIAL = 0.10
CAUSAL_FLOOR = 0.05
ANCHOR = {f"D{i:02d}" for i in range(1, 16)}
EXPANSION = {f"D{i:02d}" for i in range(16, 31)}

CLASSES = {
    "anchor_to_anchor": lambda a, b: a in ANCHOR and b in ANCHOR,
    "expansion_to_expansion": lambda a, b: a in EXPANSION and b in EXPANSION,
    "anchor_to_expansion": lambda a, b: a in ANCHOR and b in EXPANSION,
    "expansion_to_anchor": lambda a, b: a in EXPANSION and b in ANCHOR,
}


def pair_class(src: str, dst: str) -> str:
    for name, pred in CLASSES.items():
        if pred(src, dst):
            return name
    raise ValueError(f"unclassified pair {src}→{dst}")


def load_corpus(concept_ids, by_axis, scores, p90, p99, row_of, name_of, type_of):
    sources = load_json(CEX / "source-decks.json")
    if len(sources) != 30:
        raise SystemExit(f"expected 30 sealed lists, got {len(sources)}")
    decks, polarity = [], {}
    for i, raw in enumerate(sources):
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, *_ = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        bid = f"D{i+1:02d}"
        polarity[bid] = polarity_blocked_caps(axes)
        decks.append({"id": bid, "cohort": "anchor" if i < 15 else "expansion", "axes": axes})
    return decks, polarity


def reconstruct_anchor(aa_h, aa_pairs, by_axis):
    frozen_h = {(r["from"], r["to"]): r for r in load_json(K27 / "pairs-h-both.json")}
    frozen_p = {(r["from"], r["to"]): r for r in load_json(P2 / "pairs.json")}
    idx = pair_index_eligible(aa_pairs, by_axis)
    h_mis, p_mis, top_mis = 0, 0, 0
    rows = []
    for r in aa_h:
        key = (r["from"], r["to"])
        fh, fp = frozen_h[key], frozen_p[key]
        dh = abs(r["H_credible"] - fh["H_credible"])
        dpr = abs(r["H_raw"] - fh["H_raw"])
        dph = abs(r["H_credible"] - fp["H_credible"])
        if dh > 1e-4 or dpr > 1e-4:
            h_mis += 1
        if dph > 1e-4:
            p_mis += 1
        top = idx[key].get("topEligible") or idx[key]["top"]
        if top and top != fh.get("top"):
            # unicode vs ascii arrow is still a match
            if (top or "").replace("→", "→") != (fh.get("top") or "").replace("→", "→"):
                if parse_top(top) != parse_top(fh.get("top")):
                    top_mis += 1
        rows.append(
            {
                "from": r["from"],
                "to": r["to"],
                "H_raw": r["H_raw"],
                "H_credible": r["H_credible"],
                "frozenH_credible": fh["H_credible"],
                "pressureH_credible": fp["H_credible"],
                "maturity": maturity_class(r["H_credible"]),
                "frozenMaturity": fp.get("maturity"),
                "top": top,
            }
        )
    mat = defaultdict(int)
    for r in aa_h:
        mat[maturity_class(r["H_credible"])] += 1
    return {
        "n": 210,
        "nHMismatchVsK27": h_mis,
        "nHMismatchVsPressureV2": p_mis,
        "nTopMismatchVsK27": top_mis,
        "observedMaturity": dict(mat),
        "expectedMaturity": {"MATURE": 27, "PARTIALLY_MATURE": 110, "IMMATURE": 73},
        "pass": h_mis == 0 and p_mis == 0 and mat["MATURE"] == 27 and mat["PARTIALLY_MATURE"] == 110 and mat["IMMATURE"] == 73,
    }


def mass_block(decks_by_id, pairs, leftover_set, reviewed, compat, pred):
    reviewed_cred = unknown_cred = 0.0
    by_rel = defaultdict(float)
    for src, dst in pairs:
        if not pred(src, dst):
            continue
        a, b = decks_by_id[src], decks_by_id[dst]
        cm = {c: rec.get("packageInformedProminence", rec["prominence"]) for c, rec in a["axes"]["capability"].items()}
        dm = {t: rec["prominence"] for t, rec in b["axes"]["dependency"].items()}
        for (c, d), e in reviewed.items():
            lvl = compat[(c, d)]
            if lvl not in CRED:
                continue
            m = cm.get(c, 0.0) * dm.get(d, 0.0)
            if m <= 0:
                continue
            reviewed_cred += m
            rel = e["relation"]
            if rel in HOSTILE_REL:
                by_rel["hostile"] += m
            elif rel in SUPPORT_REL:
                by_rel["supportive"] += m
            elif rel == "CONDITIONAL":
                by_rel["conditional"] += m
            elif rel == "NEUTRAL":
                by_rel["neutral"] += m
        for c, d in leftover_set:
            if compat[(c, d)] not in CRED:
                continue
            m = cm.get(c, 0.0) * dm.get(d, 0.0)
            if m > 0:
                unknown_cred += m
    total = reviewed_cred + unknown_cred
    return {
        "nPairs": sum(1 for a, b in pairs if pred(a, b)),
        "credibleOpportunityMass": round(total, 4),
        "reviewedCredibleMass": round(reviewed_cred, 4),
        "credibleUnknownMass": round(unknown_cred, 4),
        "applicability": round(reviewed_cred / total, 4) if total else None,
        "reviewedHostileMass": round(by_rel["hostile"], 4),
        "reviewedSupportiveMass": round(by_rel["supportive"], 4),
        "reviewedConditionalMass": round(by_rel["conditional"], 4),
        "reviewedNeutralMass": round(by_rel["neutral"], 4),
    }


def summarize_h(rows):
    hs = [r["H_credible"] for r in rows]
    raws = [r["H_raw"] for r in rows]
    mat = defaultdict(int)
    for r in rows:
        mat[r["maturity"]] += 1
    return {
        "n": len(rows),
        "MATURE": mat["MATURE"],
        "PARTIALLY_MATURE": mat["PARTIALLY_MATURE"],
        "IMMATURE": mat["IMMATURE"],
        "mean_H_credible": round(float(np.mean(hs)), 4) if hs else None,
        "median_H_credible": round(float(np.median(hs)), 4) if hs else None,
        "mean_H_raw": round(float(np.mean(raws)), 4) if raws else None,
    }


def no_causal_anchor(a, b, reviewed, leftover_set, compat):
    max_causal = 0.0
    for (c, d), e in reviewed.items():
        if e["relation"] not in CAUSAL:
            continue
        if not e.get("pressureEligible"):
            continue
        max_causal = max(max_causal, axis_mass(a, b, c, d))
    max_unk = 0.0
    n_high = 0
    for c, d in leftover_set:
        if compat[(c, d)] not in CRED:
            continue
        m = axis_mass(a, b, c, d)
        if m >= MATERIAL:
            max_unk = max(max_unk, m)
            if compat[(c, d)] == "HIGH":
                n_high += 1
    flag = max_causal < CAUSAL_FLOOR and max_unk >= MATERIAL
    return flag, round(max_causal, 4), round(max_unk, 4), n_high


def novelty_class(anchor_n, anchor_mean, exp_n, exp_mean):
    if exp_n == 0:
        return None
    if anchor_n == 0:
        return "NEWLY_EXPOSED_RELATION"
    if exp_mean >= 2.0 * max(anchor_mean, 1e-9):
        return "AMPLIFIED_RELATION"
    return "ANCHOR_ACTIVE_UNKNOWN"


def domain_block(decks_by_id, pair_keys, reviewed, leftover_set, compat):
    rows = []
    cells = list(reviewed) + list(leftover_set)
    for src, dst in pair_keys:
        a, b = decks_by_id[src], decks_by_id[dst]
        cm = {c: rec.get("packageInformedProminence", rec["prominence"]) for c, rec in a["axes"]["capability"].items()}
        dm = {t: rec["prominence"] for t, rec in b["axes"]["dependency"].items()}
        for c, d in cells:
            m = cm.get(c, 0.0) * dm.get(d, 0.0)
            if m <= 0:
                continue
            lvl = compat[(c, d)]
            rel = (reviewed.get((c, d)) or {}).get("relation")
            bkt = bucket_of(rel)
            if bkt is None:
                if lvl not in CRED:
                    continue
                bkt = "unknown_credible"
            elif lvl not in CRED:
                continue
            for kind, key in (("capDomain", cap_domain(c)), ("capFamily", cap_family(c)), ("depFamily", dep_family(d))):
                rows.append({"key": key, "bucket": bkt, "mass": m, "kind": kind})
    by_kind = defaultdict(list)
    for r in rows:
        by_kind[r["kind"]].append(r)
    return {kind: accumulate_rows(rs) for kind, rs in by_kind.items()}


def decide(class_stats, novelty_mass, nca_rate, n_new_cells):
    ee = class_stats["expansion_to_expansion"]
    aa = class_stats["anchor_to_anchor"]
    unk = novelty_mass["NEWLY_EXPOSED_RELATION"] + novelty_mass["AMPLIFIED_RELATION"] + novelty_mass["ANCHOR_ACTIVE_UNKNOWN"]
    new_share = (novelty_mass["NEWLY_EXPOSED_RELATION"] / unk) if unk else 0.0
    if ee["mean_H_credible"] <= aa["mean_H_credible"] + 0.15 and new_share < 0.20 and nca_rate < 0.05:
        return "A", "K generalizes strongly. Expanded Pressure baseline with frozen K would be the next experiment."
    if n_new_cells <= 40 and (new_share >= 0.20 or ee["IMMATURE"] > aa["IMMATURE"]) and nca_rate < 0.25:
        return "B", "K has concentrated, tractable new debt. Freeze the prospective queue; K v3 reviews would be next if authorized."
    if nca_rate >= 0.25 or n_new_cells > 80:
        return "C", "K generalization is poor and diffuse. Do not rush into expanded Pressure or Hodge."
    return "B", "K applicability drops on unseen combinations, but unknown mass is concentrated enough to treat as reviewable debt."


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (P2PROF, "Phase 2"), (CEX, "Phase 1"), (K27, "K v2.7"), (P2, "Pressure v2")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

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

    print("profiling sealed 30…", flush=True)
    decks, polarity = load_corpus(concept_ids, by_axis, scores, p90, p99, row_of, name_of, type_of)
    decks_by_id = {d["id"]: d for d in decks}

    edges = load_json(K27 / "edges.json")
    leftover = leftover_cells(concept_ids, by_axis, edges)
    leftover_el = _eligible_leftover(leftover, by_axis)
    leftover_set = set(leftover_el)
    reviewed = {}
    for e in edges:
        if e.get("kClass") not in LIVE:
            continue
        e["pressureGate"] = k_pressure_eligible(e, by_axis)
        e["pressureEligible"] = e["pressureGate"]["eligible"]
        reviewed[(e["capability"], e["target"])] = e
    cells = sorted(set(reviewed) | leftover_set)
    compat = {cd: compatibility(cd[0], cd[1])["level"] for cd in cells}

    print("frozen pair formulas on 870 directed pairs…", flush=True)
    pairs, _ = compute_pairs(decks, [dict(e) for e in edges], leftover, by_axis, polarity)
    idx = pair_index_eligible(pairs, by_axis)
    all_h = pair_h_both(decks, leftover, idx, by_axis)
    for r in all_h:
        r["maturity"] = maturity_class(r["H_credible"])
        r["pairClass"] = pair_class(r["from"], r["to"])

    aa_pairs = [p for p in pairs if p["from"] in ANCHOR and p["to"] in ANCHOR]
    aa_h = [r for r in all_h if r["pairClass"] == "anchor_to_anchor"]
    recon = reconstruct_anchor(aa_h, aa_pairs, by_axis)
    if not recon["pass"]:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "IMMUTABLE.json").write_text(json.dumps({"status": "QA_FAILED", "reason": "Anchor-15 K reconstruction failed", "reconstruction": recon}, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"stop": True, "reconstruction": recon}, indent=2))
        raise SystemExit("Anchor-15 K reconstruction failed — not interpreting expansion")

    pair_keys = [(r["from"], r["to"]) for r in all_h]
    class_mass = {}
    class_h = {}
    nca = defaultdict(list)
    pair_diag = []
    for name, pred in CLASSES.items():
        keys = [(a, b) for a, b in pair_keys if pred(a, b)]
        class_mass[name] = mass_block(decks_by_id, pair_keys, leftover_set, reviewed, compat, pred)
        rows = [r for r in all_h if r["pairClass"] == name]
        class_h[name] = summarize_h(rows)
        for r in rows:
            flag, mc, mu, n_high = no_causal_anchor(decks_by_id[r["from"]], decks_by_id[r["to"]], reviewed, leftover_set, compat)
            rec = {
                **{k: r[k] for k in ("from", "to", "H_raw", "H_credible", "maturity", "top", "largestCredible")},
                "pairClass": name,
                "NO_CAUSAL_ANCHOR": flag,
                "maxReviewedCausalMass": mc,
                "maxCredibleUnknownMass": mu,
                "nHighUnknownMaterial": n_high,
            }
            pair_diag.append(rec)
            if flag:
                nca[name].append(f"{r['from']}→{r['to']}")

    # Relation novelty: HIGH/MED leftover cells
    cell_hist = {}
    for c, d in leftover_set:
        if compat[(c, d)] not in CRED:
            continue
        cell_hist[(c, d)] = {
            "capability": c,
            "dependency": d,
            "compatibility": compat[(c, d)],
            "anchor_n": 0,
            "anchor_mass": 0.0,
            "exp_n": 0,
            "exp_mass": 0.0,
            "classes": set(),
        }
    for src, dst in pair_keys:
        klass = pair_class(src, dst)
        a, b = decks_by_id[src], decks_by_id[dst]
        for cd, row in cell_hist.items():
            m = axis_mass(a, b, cd[0], cd[1])
            if m < MATERIAL:
                continue
            if klass == "anchor_to_anchor":
                row["anchor_n"] += 1
                row["anchor_mass"] += m
            else:
                row["exp_n"] += 1
                row["exp_mass"] += m
                row["classes"].add(klass)

    novelty_rows = []
    novelty_mass = defaultdict(float)
    novelty_n = defaultdict(int)
    for row in cell_hist.values():
        if row["exp_n"] == 0:
            continue
        klass = novelty_class(row["anchor_n"], row["anchor_mass"] / 210.0, row["exp_n"], row["exp_mass"] / 660.0)
        rec = {
            "capability": row["capability"],
            "dependency": row["dependency"],
            "compatibility": row["compatibility"],
            "expansionExposure": round(row["exp_mass"], 4),
            "nDirectedPairsAffected": row["exp_n"],
            "pairClassesAffected": sorted(row["classes"]),
            "anchorHistoricalExposure": round(row["anchor_mass"], 4),
            "nAnchorPairs": row["anchor_n"],
            "novelty": klass,
        }
        novelty_rows.append(rec)
        novelty_mass[klass] += row["exp_mass"]
        novelty_n[klass] += 1
    novelty_rows.sort(key=lambda r: (-r["expansionExposure"], -r["nDirectedPairsAffected"]))

    queue = [r for r in novelty_rows if r["compatibility"] in CRED]
    top25 = queue[:25]

    domain = {}
    for name, pred in list(CLASSES.items()) + [("combined", lambda a, b: True)]:
        keys = [(a, b) for a, b in pair_keys if pred(a, b)]
        domain[name] = domain_block(decks_by_id, keys, reviewed, leftover_set, compat)

    nca_n = {name: len(v) for name, v in nca.items()}
    nca_n["combined"] = sum(nca_n.values())
    nca_rate = nca_n["combined"] / 870.0
    n_new = novelty_n["NEWLY_EXPOSED_RELATION"] + novelty_n["AMPLIFIED_RELATION"]
    class_stats = {name: {**class_mass[name], **class_h[name]} for name in CLASSES}
    outcome, reading = decide(class_stats, novelty_mass, nca_rate, n_new)

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "FROZEN_K_APPLICABILITY_AUDIT_V1",
        "parent": "expansion-profiles-v2",
        "k": "mechanical-pressure-k-v2.7",
        "newKReviews": False,
        "expandedPressure": False,
        "A_anchorReconstruction": recon,
        "pairClasses": class_stats,
        "NO_CAUSAL_ANCHOR": {
            "counts": nca_n,
            "rate": round(nca_rate, 4),
            "pairs": {k: v for k, v in nca.items()},
            "definition": "max reviewed causal mass < 0.05 and at least one HIGH/MED UNKNOWN cell with mass >= 0.10",
        },
        "relationNovelty": {
            "nCellsExposedByExpansion": len(novelty_rows),
            "nCells": {k: novelty_n[k] for k in ("ANCHOR_ACTIVE_UNKNOWN", "NEWLY_EXPOSED_RELATION", "AMPLIFIED_RELATION")},
            "credibleUnknownMass": {k: round(novelty_mass[k], 4) for k in ("ANCHOR_ACTIVE_UNKNOWN", "NEWLY_EXPOSED_RELATION", "AMPLIFIED_RELATION")},
        },
        "outcome": {"code": outcome, "reading": reading},
        "safety": {
            "newKReviews": False,
            "expandedPressure": False,
            "hodge": False,
            "ontologyRetrain": False,
            "compatibilityEdited": False,
            "rps": False,
            "ranking": False,
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "reconstruction.json").write_text(json.dumps(recon, indent=2) + "\n", encoding="utf-8")
    (OUT / "pair-classes.json").write_text(json.dumps(class_stats, indent=2) + "\n", encoding="utf-8")
    (OUT / "pair-diagnostics.json").write_text(json.dumps(pair_diag, indent=2) + "\n", encoding="utf-8")
    (OUT / "relation-novelty.json").write_text(json.dumps({"summary": report["relationNovelty"], "cells": novelty_rows}, indent=2) + "\n", encoding="utf-8")
    (OUT / "prospective-k-queue.json").write_text(
        json.dumps(
            {
                "status": "FROZEN_PROSPECTIVE_QUEUE",
                "reviewed": False,
                "n": len(queue),
                "top25": top25,
                "note": "Ranked by expansion exposure. Do not classify ATTACK/ENABLE/NEUTRAL yet.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT / "domains.json").write_text(json.dumps({k: {kk: domain[k][kk] for kk in ("capDomain", "capFamily", "depFamily") if kk in domain[k]} for k in domain}, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "FrozenKApplicabilityAudit",
                "version": "frozen-k-applicability-audit-v1",
                "status": "PHASE_3_COMPLETE",
                "parent": "expansion-profiles-v2",
                "k": "mechanical-pressure-k-v2.7",
                "newKReviews": False,
                "expandedPressure": False,
                "anchorReconstruction": "PASS",
                "outcome": outcome,
                "note": "Report and wait. Prospective queue is frozen unread.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "reconPass": True,
                "maturity": {k: {kk: class_h[k][kk] for kk in ("MATURE", "PARTIALLY_MATURE", "IMMATURE", "mean_H_credible")} for k in CLASSES},
                "applicability": {k: class_mass[k]["applicability"] for k in CLASSES},
                "nca": nca_n,
                "noveltyCells": report["relationNovelty"]["nCells"],
                "noveltyMass": report["relationNovelty"]["credibleUnknownMass"],
                "top5": [{"edge": f"{r['capability']} → {r['dependency']}", "novelty": r["novelty"], "exp": r["expansionExposure"], "n": r["nDirectedPairsAffected"]} for r in top25[:5]],
                "outcome": outcome,
                "reading": reading,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

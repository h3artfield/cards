#!/usr/bin/env python3
"""
Frozen K v3.0 Applicability Audit on sealed 60.

Diagnostic only. No new K reviews. No Pressure v4. No Hodge.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_deck_mechanical_profiles_v2 import profile_deck
from build_frozen_k_applicability_audit_v1 import domain_block, no_causal_anchor, summarize_h
from build_k_v13_active_coverage import resolve_cards
from build_k_v14_active_coverage import axis_mass
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from build_k_v25 import pair_h_both
from build_k_v27 import maturity_class
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v2 import k_pressure_eligible, polarity_blocked_caps
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K30 = MS / "mechanical-pressure-k-v3.0"
P3 = MS / "deck-pressure-v3"
PROF2 = MS / "deck-mechanical-profiles-v2"
P2PROF = MS / "expansion-v2-profiles-v2"
CEX1 = MS / "corpus-expansion-v1"
CEX2 = MS / "corpus-expansion-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "frozen-k-applicability-audit-v2"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

LIVE = {"UNCHANGED_ENDPOINTS", "NEW_ENDPOINT", "CARRY_FORWARD_VERIFIED", "RETIRED_BROAD"}
CRED = {"HIGH", "MEDIUM"}
CAUSAL = {"ATTACKS", "DISRUPTS", "ENABLES", "BENEFITS", "CONDITIONAL"}
HOSTILE_REL = {"ATTACKS", "DISRUPTS"}
SUPPORT_REL = {"ENABLES", "BENEFITS"}
MATERIAL = 0.10

A = {f"D{i:02d}" for i in range(1, 16)}
E1 = {f"D{i:02d}" for i in range(16, 31)}
E2 = {f"D{i:02d}" for i in range(31, 61)}
SEALED30 = A | E1

CLASSES = {
    "A_to_A": lambda a, b: a in A and b in A,
    "E1_to_E1": lambda a, b: a in E1 and b in E1,
    "E2_to_E2": lambda a, b: a in E2 and b in E2,
    "A_to_E1": lambda a, b: a in A and b in E1,
    "E1_to_A": lambda a, b: a in E1 and b in A,
    "A_to_E2": lambda a, b: a in A and b in E2,
    "E2_to_A": lambda a, b: a in E2 and b in A,
    "E1_to_E2": lambda a, b: a in E1 and b in E2,
    "E2_to_E1": lambda a, b: a in E2 and b in E1,
}

N_PAIRS = {name: sum(1 for a in range(1, 61) for b in range(1, 61) if a != b and pred(f"D{a:02d}", f"D{b:02d}")) for name, pred in CLASSES.items()}


def pair_class(src: str, dst: str) -> str:
    for name, pred in CLASSES.items():
        if pred(src, dst):
            return name
    raise ValueError(f"unclassified pair {src}→{dst}")


def involves_e2(klass: str) -> bool:
    return "E2" in klass


def sealed30_pair(src: str, dst: str) -> bool:
    return src in SEALED30 and dst in SEALED30


def mass_block(decks_by_id, pair_keys, leftover_set, reviewed, compat, pred):
    reviewed_cred = unknown_cred = unknown_low = 0.0
    by_rel = defaultdict(float)
    n_hm_pairs = n_low_pairs = 0
    for src, dst in pair_keys:
        if not pred(src, dst):
            continue
        a, b = decks_by_id[src], decks_by_id[dst]
        cm = {c: rec.get("packageInformedProminence", rec["prominence"]) for c, rec in a["axes"]["capability"].items()}
        dm = {t: rec["prominence"] for t, rec in b["axes"]["dependency"].items()}
        pair_hm = pair_low = 0.0
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
            m = cm.get(c, 0.0) * dm.get(d, 0.0)
            if m <= 0:
                continue
            lvl = compat[(c, d)]
            if lvl in CRED:
                unknown_cred += m
                pair_hm += m
            elif lvl == "LOW":
                unknown_low += m
                pair_low += m
        if pair_hm > 0:
            n_hm_pairs += 1
        if pair_low > 0:
            n_low_pairs += 1
    total = reviewed_cred + unknown_cred
    return {
        "nPairs": sum(1 for a, b in pair_keys if pred(a, b)),
        "credibleOpportunityMass": round(total, 4),
        "reviewedCredibleMass": round(reviewed_cred, 4),
        "credibleUnknownMass": round(unknown_cred, 4),
        "lowUnknownMass": round(unknown_low, 4),
        "applicability": round(reviewed_cred / total, 4) if total else None,
        "nPairsWithHighMedUnknown": n_hm_pairs,
        "nPairsWithLowUnknown": n_low_pairs,
        "reviewedHostileMass": round(by_rel["hostile"], 4),
        "reviewedSupportiveMass": round(by_rel["supportive"], 4),
        "reviewedConditionalMass": round(by_rel["conditional"], 4),
        "reviewedNeutralMass": round(by_rel["neutral"], 4),
    }


def classify_cell(row: dict) -> str | None:
    if row["e2_n"] == 0 and row["sealed30_n"] == 0:
        return None
    if row["sealed30_n"] > 0:
        e2_mean = row["e2_mass"] / max(row["e2_n"], 1)
        s30_mean = row["sealed30_mass"] / max(row["sealed30_n"], 1)
        if row["e2_n"] > 0 and e2_mean >= 2.0 * max(s30_mean, 1e-9):
            return "AMPLIFIED_RELATION"
        return "SEALED30_ACTIVE_UNKNOWN"
    if row["sealed30_any_n"] > 0:
        return "AMPLIFIED_RELATION"
    if row["cross_n"] > 0:
        return "OLD_RELATION_NEW_EXPOSURE"
    return "E2_ONLY_EXPOSURE"


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (P2PROF, "Phase 2"), (CEX2, "Expansion v2"), (K30, "K v3.0"), (P3, "Pressure v3")):
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

    sources = load_json(CEX1 / "source-decks.json") + load_json(CEX2 / "source-decks.json")
    if len(sources) != 60:
        raise SystemExit(f"expected 60 sealed lists, got {len(sources)}")
    print("profiling sealed 60…", flush=True)
    decks, polarity = [], {}
    for i, raw in enumerate(sources):
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, *_ = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        bid = f"D{i + 1:02d}"
        polarity[bid] = polarity_blocked_caps(axes)
        cohort = "anchor" if i < 15 else ("expansion_v1" if i < 30 else "expansion_v2")
        decks.append({"id": bid, "cohort": cohort, "axes": axes})
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/60", flush=True)
    decks_by_id = {d["id"]: d for d in decks}

    edges = load_json(K30 / "edges.json")
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

    print("frozen pair formulas on 3540 directed pairs…", flush=True)
    pairs, _ = compute_pairs(decks, [dict(e) for e in edges], leftover, by_axis, polarity)
    idx = pair_index_eligible(pairs, by_axis)
    all_h = pair_h_both(decks, leftover, idx, by_axis)
    for r in all_h:
        r["maturity"] = maturity_class(r["H_credible"])
        r["pairClass"] = pair_class(r["from"], r["to"])

    sealed30_h = [r for r in all_h if sealed30_pair(r["from"], r["to"])]
    n_h_mis = sum(1 for r in sealed30_h if abs(r["H_credible"]) > 1e-4)
    recon = {
        "n": len(sealed30_h),
        "expected": 870,
        "nHCredibleNonzero": n_h_mis,
        "maxH_credible": round(max((r["H_credible"] for r in sealed30_h), default=0.0), 4),
        "allMature": all(r["maturity"] == "MATURE" for r in sealed30_h),
        "pass": len(sealed30_h) == 870 and n_h_mis == 0,
        "note": "K v3.0 closed HIGH/MED leftover on sealed 30. Reconstruction requires H_credible = 0 on all 870 sealed-30 pairs.",
    }
    if not recon["pass"]:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "IMMUTABLE.json").write_text(json.dumps({"status": "QA_FAILED", "reason": "sealed-30 K v3.0 reconstruction failed", "reconstruction": recon}, indent=2) + "\n", encoding="utf-8")
        raise SystemExit("sealed-30 K reconstruction failed — not interpreting Expansion-v2")

    pair_keys = [(r["from"], r["to"]) for r in all_h]
    class_mass, class_h = {}, {}
    nca = defaultdict(list)
    pair_diag = []
    for name, pred in CLASSES.items():
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

    cell_hist = {}
    for c, d in leftover_set:
        cell_hist[(c, d)] = {
            "capability": c,
            "dependency": d,
            "compatibility": compat[(c, d)],
            "sealed30_n": 0,
            "sealed30_mass": 0.0,
            "sealed30_any_n": 0,
            "sealed30_any_mass": 0.0,
            "e2_n": 0,
            "e2_mass": 0.0,
            "e2e2_n": 0,
            "cross_n": 0,
            "classes": set(),
        }
    for src, dst in pair_keys:
        klass = pair_class(src, dst)
        a, b = decks_by_id[src], decks_by_id[dst]
        for cd, row in cell_hist.items():
            m = axis_mass(a, b, cd[0], cd[1])
            if m <= 0:
                continue
            if sealed30_pair(src, dst):
                row["sealed30_any_n"] += 1
                row["sealed30_any_mass"] += m
            if m < MATERIAL:
                continue
            if sealed30_pair(src, dst):
                row["sealed30_n"] += 1
                row["sealed30_mass"] += m
            if involves_e2(klass):
                row["e2_n"] += 1
                row["e2_mass"] += m
                row["classes"].add(klass)
                if klass == "E2_to_E2":
                    row["e2e2_n"] += 1
                else:
                    row["cross_n"] += 1

    novelty_rows = []
    novelty_n = defaultdict(int)
    novelty_mass = defaultdict(float)
    for row in cell_hist.values():
        klass = classify_cell(row)
        if klass is None:
            continue
        rec = {
            "capability": row["capability"],
            "dependency": row["dependency"],
            "compatibility": row["compatibility"],
            "novelty": klass,
            "e2Exposure": round(row["e2_mass"], 4),
            "nE2PairsAffected": row["e2_n"],
            "pairClassesAffected": sorted(row["classes"]),
            "sealed30HistoricalExposure": round(row["sealed30_mass"], 4),
            "sealed30AnyExposure": round(row["sealed30_any_mass"], 4),
            "nSealed30Pairs": row["sealed30_n"],
            "nSealed30AnyPairs": row["sealed30_any_n"],
            "nE2OnlyPairs": row["e2e2_n"],
            "nCrossCohortPairs": row["cross_n"],
        }
        novelty_rows.append(rec)
        novelty_n[klass] += 1
        novelty_mass[klass] += rec["e2Exposure"] if klass != "SEALED30_ACTIVE_UNKNOWN" else rec["sealed30HistoricalExposure"]
    novelty_rows.sort(key=lambda r: (-r["e2Exposure"], -r["nE2PairsAffected"], r["capability"], r["dependency"]))

    hm_new = [r for r in novelty_rows if r["compatibility"] in CRED and r["novelty"] != "SEALED30_ACTIVE_UNKNOWN"]
    low_mat = [r for r in novelty_rows if r["compatibility"] == "LOW"]
    queue = sorted(hm_new, key=lambda r: (-r["e2Exposure"], -r["nE2PairsAffected"]))

    nca_n = {name: len(v) for name, v in nca.items()}
    nca_n["combined"] = sum(nca_n.values())
    class_stats = {name: {**class_mass[name], **class_h[name]} for name in CLASSES}

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "FROZEN_K_APPLICABILITY_AUDIT_V2",
        "parent": "expansion-v2-profiles-v2",
        "k": "mechanical-pressure-k-v3.0",
        "newKReviews": False,
        "expandedPressure": False,
        "nDirectedPairs": 3540,
        "A_sealed30Reconstruction": recon,
        "pairClasses": class_stats,
        "HIGH_MED_UNKNOWN": {k: {"mass": class_mass[k]["credibleUnknownMass"], "nPairs": class_mass[k]["nPairsWithHighMedUnknown"]} for k in CLASSES},
        "LOW_UNKNOWN": {k: {"mass": class_mass[k]["lowUnknownMass"], "nPairs": class_mass[k]["nPairsWithLowUnknown"]} for k in CLASSES},
        "NO_CAUSAL_ANCHOR": {
            "counts": nca_n,
            "rate": round(nca_n["combined"] / 3540.0, 4),
            "pairs": {k: v for k, v in nca.items()},
            "definition": "max reviewed causal mass < 0.05 and at least one HIGH/MED UNKNOWN cell with mass >= 0.10",
        },
        "relationNovelty": {
            "nHighMedNewDebtCells": len(hm_new),
            "nCells": {k: novelty_n[k] for k in ("OLD_RELATION_NEW_EXPOSURE", "AMPLIFIED_RELATION", "E2_ONLY_EXPOSURE", "SEALED30_ACTIVE_UNKNOWN")},
            "exposureMass": {k: round(novelty_mass[k], 4) for k in ("OLD_RELATION_NEW_EXPOSURE", "AMPLIFIED_RELATION", "E2_ONLY_EXPOSURE", "SEALED30_ACTIVE_UNKNOWN")},
            "nLowMaterialCells": sum(1 for r in low_mat if r["compatibility"] == "LOW" and r["nE2PairsAffected"] > 0),
        },
        "safety": {
            "newKReviews": False,
            "adjudication": False,
            "expandedPressure": False,
            "hodge": False,
            "ontologyRetrain": False,
            "compatibilityEdited": False,
            "rps": False,
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "reconstruction.json").write_text(json.dumps(recon, indent=2) + "\n", encoding="utf-8")
    (OUT / "pair-classes.json").write_text(json.dumps(class_stats, indent=2) + "\n", encoding="utf-8")
    (OUT / "pair-diagnostics.json").write_text(json.dumps(pair_diag, indent=2) + "\n", encoding="utf-8")
    (OUT / "relation-novelty.json").write_text(json.dumps({"summary": report["relationNovelty"], "cells": novelty_rows}, indent=2) + "\n", encoding="utf-8")
    (OUT / "frozen-prospective-queue.json").write_text(
        json.dumps(
            {
                "status": "FROZEN_PROSPECTIVE_QUEUE",
                "reviewed": False,
                "adjudicated": False,
                "n": len(queue),
                "byClass": {
                    "OLD_RELATION_NEW_EXPOSURE": sum(1 for r in queue if r["novelty"] == "OLD_RELATION_NEW_EXPOSURE"),
                    "AMPLIFIED_RELATION": sum(1 for r in queue if r["novelty"] == "AMPLIFIED_RELATION"),
                    "E2_ONLY_EXPOSURE": sum(1 for r in queue if r["novelty"] == "E2_ONLY_EXPOSURE"),
                },
                "cells": queue,
                "note": "HIGH/MED leftover cells newly or more strongly material because of Expansion-v2. Do not classify ATTACK/ENABLE/NEUTRAL yet.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    domain = {}
    for name, pred in list(CLASSES.items()) + [("combined", lambda a, b: True)]:
        keys = [(a, b) for a, b in pair_keys if pred(a, b)]
        domain[name] = domain_block(decks_by_id, keys, reviewed, leftover_set, compat)
    (OUT / "domains.json").write_text(json.dumps({k: {kk: domain[k][kk] for kk in ("capDomain", "capFamily", "depFamily") if kk in domain[k]} for k in domain}, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "FrozenKApplicabilityAudit",
                "version": "frozen-k-applicability-audit-v2",
                "status": "REPORT_AND_WAIT",
                "parent": "expansion-v2-profiles-v2",
                "k": "mechanical-pressure-k-v3.0",
                "newKReviews": False,
                "adjudicated": False,
                "expandedPressure": False,
                "sealed30Reconstruction": "PASS" if recon["pass"] else "FAIL",
                "nProspectiveQueue": len(queue),
                "note": "Diagnostic only. Prospective HIGH/MED queue is frozen unread. Do not adjudicate in this milestone.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "reconPass": recon["pass"],
                "nPairs": 3540,
                "applicability": {k: class_mass[k]["applicability"] for k in CLASSES},
                "highMedUnknownMass": {k: class_mass[k]["credibleUnknownMass"] for k in CLASSES},
                "lowUnknownMass": {k: class_mass[k]["lowUnknownMass"] for k in CLASSES},
                "H_credible": {k: {kk: class_h[k][kk] for kk in ("MATURE", "PARTIALLY_MATURE", "IMMATURE", "mean_H_credible", "mean_H_raw")} for k in CLASSES},
                "nca": nca_n,
                "noveltyCells": report["relationNovelty"]["nCells"],
                "noveltyMass": report["relationNovelty"]["exposureMass"],
                "queueN": len(queue),
                "top8": [{"edge": f"{r['capability']} → {r['dependency']}", "novelty": r["novelty"], "compat": r["compatibility"], "e2": r["e2Exposure"], "n": r["nE2PairsAffected"]} for r in queue[:8]],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

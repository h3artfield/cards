#!/usr/bin/env python3
"""
K v2.5 — credible-tail batch + prospective compatibility-screen-v1 validation.

The screen is frozen. Misses are recorded, not repaired.
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
from build_k_v23 import _eligible_leftover, classify_reversals, compare_geometry, h_eligible, h_tail
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v11 import derive_pressure
from mechanical_k_v2 import CAP_MECH, DEP_MECH, RES_MECH, V25_REVIEWS, axis_reliability, k_pressure_eligible
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K15 = MS / "mechanical-pressure-k-v1.5"
K24 = MS / "mechanical-pressure-k-v2.4"
AUDIT = MS / "h-calibration-audit-v1"
SCREEN = MS / "compatibility-screen-v1"
PROF = MS / "deck-mechanical-profiles-v2"
OUT = MS / "mechanical-pressure-k-v2.5"
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
        "reviewBucket": decision.get("lane", "v2.5"),
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
        "kVersionAdded": "mechanical-pressure-k-v2.5",
        "carryForward": False,
        "compatibilityAtReview": compatibility(c, d),
    }
    rec["pressureGate"] = k_pressure_eligible(rec, by_axis)
    rec["pressureEligible"] = rec["pressureGate"]["eligible"]
    return rec


def outcome_bucket(rel: str) -> str:
    if rel in ACTIVE:
        return "active"
    if rel == "CONDITIONAL":
        return "conditional"
    if rel in ENABLE:
        return "enable"
    if rel == "NEUTRAL":
        return "neutral"
    return "other"


def pair_h_both(decks, leftover, idx, by_axis):
    cells = _eligible_leftover(leftover, by_axis)
    rows = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top = idx[(a["id"], b["id"])].get("topEligible") or idx[(a["id"], b["id"])]["top"]
            tc, td = parse_top(top)
            top_m = axis_mass(a, b, tc, td)
            thresh = top_m + 0.02
            raw, cred = [], []
            for c, d in cells:
                m = axis_mass(a, b, c, d)
                if m < 0.10:
                    continue
                h = m / thresh
                lvl = compatibility(c, d)["level"]
                raw.append((m, h, c, d, lvl))
                if lvl in {"HIGH", "MEDIUM"}:
                    cred.append((m, h, c, d, lvl))
            raw.sort(reverse=True)
            cred.sort(reverse=True)
            n_raw1 = sum(1 for row in raw if row[1] >= 1)
            n_cred1 = sum(1 for row in cred if row[1] >= 1)
            n_raw05 = sum(1 for row in raw if row[1] >= 0.5)
            n_cred05 = sum(1 for row in cred if row[1] >= 0.5)
            rows.append(
                {
                    "from": a["id"],
                    "to": b["id"],
                    "top": top,
                    "H_raw": round(raw[0][1] if raw else 0.0, 4),
                    "H_credible": round(cred[0][1] if cred else 0.0, 4),
                    "nRawAboveH1": n_raw1,
                    "nCredibleAboveH1": n_cred1,
                    "nRawAboveH05": n_raw05,
                    "nCredibleAboveH05": n_cred05,
                    "tailRatioH1": round(n_cred1 / n_raw1, 4) if n_raw1 else 0.0,
                    "tailRatioH05": round(n_cred05 / n_raw05, 4) if n_raw05 else 0.0,
                    "largestRaw": f"{raw[0][2]} → {raw[0][3]}" if raw else None,
                    "largestCredible": f"{cred[0][2]} → {cred[0][3]}" if cred else None,
                }
            )
    return rows


def tail_summary(rows, key):
    hs = [r[key] for r in rows]
    return {
        "mean": float(np.mean(hs)),
        "median": float(np.median(hs)),
        "n_lt_1": sum(1 for h in hs if h < 1),
        "n_lt_0_75": sum(1 for h in hs if h < 0.75),
        "n_lt_0_5": sum(1 for h in hs if h < 0.5),
        "n_lt_0_2": sum(1 for h in hs if h < 0.2),
        "n_ge1": sum(1 for h in hs if h >= 1),
        "n": len(hs),
    }


def freeze_parents():
    k24 = load_json(K24 / "IMMUTABLE.json")
    if k24.get("status") != "FROZEN":
        k24["status"] = "FROZEN"
        k24["frozenAs"] = "parent of mechanical-pressure-k-v2.5"
        (K24 / "IMMUTABLE.json").write_text(json.dumps(k24, indent=2) + "\n", encoding="utf-8")
    aud = load_json(AUDIT / "IMMUTABLE.json")
    aud["status"] = "FROZEN"
    aud["frozenAs"] = "parent of mechanical-pressure-k-v2.5; compatibility-screen-v1 locked"
    (AUDIT / "IMMUTABLE.json").write_text(json.dumps(aud, indent=2) + "\n", encoding="utf-8")
    digest = hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest()
    SCREEN.mkdir(parents=True, exist_ok=True)
    (SCREEN / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "CompatibilityScreen",
                "version": "compatibility-screen-v1",
                "status": "FROZEN",
                "sha256": digest,
                "source": "mechanical_compatibility_v1.py",
                "levels": ["HIGH", "MEDIUM", "LOW"],
                "note": "LOW is not K NEUTRAL. Do not edit during K v2.5.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (SCREEN / "source.py").write_bytes(COMPAT_PY.read_bytes())


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    if load_json(K15 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.5 must stay frozen")
    freeze_parents()
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited; aborting v2.5")

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

    v24_edges = load_json(K24 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in v24_edges}
    leftover24 = leftover_cells(concept_ids, by_axis, v24_edges)
    priority = [cd for cd in V25_REVIEWS if cd[0] in trained and cd[1] in trained and cd not in reviewed]
    new_edges = [review_record(c, d, V25_REVIEWS[(c, d)], by_axis) for c, d in priority]
    v25_edges = v24_edges + new_edges
    leftover25 = leftover_cells(concept_ids, by_axis, v25_edges)
    pairs25, v25_edges = compute_pairs(decks, v25_edges, leftover25, by_axis, polarity)
    stats25 = coverage_stats(decks, v25_edges, leftover25, pairs25, by_axis, trained)
    idx25 = pair_index_eligible(pairs25, by_axis)
    pairs24 = load_json(K24 / "pairs.json")
    idx24 = pair_index_eligible(pairs24, by_axis)
    ids = [d["id"] for d in decks]
    geom = compare_geometry(ids, idx24, idx25)
    reversals = classify_reversals(geom["signFlips"], pairs25, new_edges)

    h24 = pair_h_both(decks, leftover24, idx24, by_axis)
    h25 = pair_h_both(decks, leftover25, idx25, by_axis)
    by24 = {(r["from"], r["to"]): r for r in h24}
    by25 = {(r["from"], r["to"]): r for r in h25}

    cal = defaultdict(lambda: defaultdict(int))
    misses = []
    for e in new_edges:
        lvl = e["compatibilityAtReview"]["level"]
        bucket = outcome_bucket(e["relation"])
        cal[lvl][bucket] += 1
        if lvl == "LOW" and e["relation"] in ACTIVE:
            misses.append(
                {
                    "edge": f"{e['capability']} → {e['target']}",
                    "relation": e["relation"],
                    "compatibility": e["compatibilityAtReview"],
                    "reason": e["reason"],
                    "note": "PROSPECTIVE_MISS — do not repair the screen in this run",
                }
            )
        if lvl == "LOW" and e["relation"] in ENABLE | {"CONDITIONAL"}:
            misses.append(
                {
                    "edge": f"{e['capability']} → {e['target']}",
                    "relation": e["relation"],
                    "compatibility": e["compatibilityAtReview"],
                    "reason": e["reason"],
                    "note": "LOW predicted no mechanism; review found a relation other than NEUTRAL",
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

    raw24, cred24 = tail_summary(h24, "H_raw"), tail_summary(h24, "H_credible")
    raw25, cred25 = tail_summary(h25, "H_raw"), tail_summary(h25, "H_credible")
    ratios = [r["tailRatioH1"] for r in h25]
    newly_cred = [
        {"pair": f"{r['from']}→{r['to']}", "H_raw": r["H_raw"], "H_credible": r["H_credible"], "nCred1": r["nCredibleAboveH1"], "nRaw1": r["nRawAboveH1"]}
        for r in h25
        if r["H_credible"] < 1 and by24[(r["from"], r["to"])]["H_credible"] >= 1
    ]

    challenges, _ = h_eligible(decks, leftover25, idx25, by_axis)
    story25 = story_rows(pairs25, idx25)
    story24 = story_rows(pairs24, idx24)
    for s in story25:
        fr, to = s["pair"].split("→")
        s["v24"] = next((r for r in story24 if r["pair"] == s["pair"]), None)
        rec = by25.get((fr, to))
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
        "status": "K_V2_5_CREDIBLE_TAIL_PROSPECTIVE",
        "parent": "mechanical-pressure-k-v2.4",
        "compatibilityScreen": {"version": "compatibility-screen-v1", "sha256": frozen_hash, "editedDuringRun": False},
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
        "coverage": stats25,
        "H_raw": {"before": raw24, "after": raw25},
        "H_credible": {"before": cred24, "after": cred25},
        "newlyHcredLt1": newly_cred,
        "completionYield": {
            "reviews": len(new_edges),
            "pairsNewlyHcredLt1": cred25["n_lt_1"] - cred24["n_lt_1"],
            "pairsNewlyHcredLt075": cred25["n_lt_0_75"] - cred24["n_lt_0_75"],
            "pairsNewlyHcredLt05": cred25["n_lt_0_5"] - cred24["n_lt_0_5"],
            "hcredLt1PerReview": round((cred25["n_lt_1"] - cred24["n_lt_1"]) / max(len(new_edges), 1), 4),
        },
        "credibleTailSize": {
            "meanRatioH1": float(np.mean(ratios)),
            "medianRatioH1": float(np.median(ratios)),
            "meanRawAboveH1": float(np.mean([r["nRawAboveH1"] for r in h25])),
            "meanCredAboveH1": float(np.mean([r["nCredibleAboveH1"] for r in h25])),
            "meanRawAboveH05": float(np.mean([r["nRawAboveH05"] for r in h25])),
            "meanCredAboveH05": float(np.mean([r["nCredibleAboveH05"] for r in h25])),
        },
        "signReversalClasses": reversals,
        "cycles": cycles_of(pairs25, ids),
        "storyPairs": story25,
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
    write_k(OUT, "mechanical-pressure-k-v2.5", v25_edges, pairs25, extra)
    (OUT / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUT / "batch.json").write_text(json.dumps(extra["newReviews"], indent=2) + "\n", encoding="utf-8")
    (OUT / "prospective-calibration.json").write_text(json.dumps(extra["prospectiveCalibration"], indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs-h-both.json").write_text(json.dumps(h25, indent=2) + "\n", encoding="utf-8")

    report_path = MS / "mechanical-pressure-k-v2-report.json"
    report = load_json(report_path) if report_path.exists() else {"version": "mechanical-pressure-k-v2", "lineage": "v2"}
    report["k25"] = extra
    report["note"] = "H_raw and H_credible are both reported. Pressure v2 is not canonized."
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    decomp = stats25["decomp"]["meanPairFractions"]
    print(
        json.dumps(
            {
                "nNew": len(new_edges),
                "mix": extra["batchMix"],
                "calibration": extra["prospectiveCalibration"],
                "active": decomp.get("active"),
                "conditional": decomp.get("conditional"),
                "rho": extra["rhoAbsM"],
                "meanAbsDeltaM": extra["meanAbsDeltaM"],
                "topStable": f"{extra['eligibleHeadlineStability']['same']}/{extra['eligibleHeadlineStability']['n']}",
                "materialFlips": extra["materialSignReversals"],
                "cycles": len(extra["cycles"]),
                "H_raw": extra["H_raw"],
                "H_credible": extra["H_credible"],
                "yield": extra["completionYield"],
                "tailSize": extra["credibleTailSize"],
                "newlyHcredLt1": newly_cred,
                "skipped": [f"{c}->{d}" for c, d in V25_REVIEWS if (c, d) in reviewed],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

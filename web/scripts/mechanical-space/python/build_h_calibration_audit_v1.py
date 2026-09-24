#!/usr/bin/env python3
"""
H Calibration Audit v1.

No new K cells. No ontology retrain. No extra decks. No Hodge.
Replay v2.1–v2.4 reviews against pre-review exposure and a
deterministic domain/operation compatibility screen.

K is unchanged. LOW compatibility is not NEUTRAL.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_k_v13_active_coverage import M
from build_k_v14_active_coverage import axis_mass, parse_top
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import load_decks
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover, h_eligible, h_tail
from mechanical_compatibility_v1 import WEIGHT, compatibility
from mechanical_k_v2 import axis_reliability
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
PROF = MS / "deck-mechanical-profiles-v2"
OUT = MS / "h-calibration-audit-v1"

BATCHES = (
    ("mechanical-pressure-k-v2.1", "mechanical-pressure-k-v2.0"),
    ("mechanical-pressure-k-v2.2", "mechanical-pressure-k-v2.1"),
    ("mechanical-pressure-k-v2.3", "mechanical-pressure-k-v2.2"),
    ("mechanical-pressure-k-v2.4", "mechanical-pressure-k-v2.3"),
)

ACTIVE = {"ATTACKS", "DISRUPTS"}
ENABLE = {"ENABLES", "BENEFITS"}
H_BINS = (
    ("H>=2", 2.0, None),
    ("1-2", 1.0, 2.0),
    ("0.5-1", 0.5, 1.0),
    ("0.2-0.5", 0.2, 0.5),
    ("<0.2", None, 0.2),
)


def h_bin(h: float) -> str:
    if h >= 2:
        return "H>=2"
    if h >= 1:
        return "1-2"
    if h >= 0.5:
        return "0.5-1"
    if h >= 0.2:
        return "0.2-0.5"
    return "<0.2"


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


def pair_effects(idx_prev, idx_new, ids):
    prev = {k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx_prev.items()}
    new = {k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx_new.items()}
    top_changed = material_m = material_sign = 0
    for a in ids:
        for b in ids:
            if a == b:
                continue
            old_t = prev[(a, b)].get("topEligible") or prev[(a, b)]["top"]
            new_t = new[(a, b)].get("topEligible") or new[(a, b)]["top"]
            if old_t != new_t:
                top_changed += 1
            m0, m1 = M(prev, a, b), M(new, a, b)
            if abs(m1 - m0) >= 0.08:
                material_m += 1
            s0 = 1 if m0 > 1e-9 else (-1 if m0 < -1e-9 else 0)
            s1 = 1 if m1 > 1e-9 else (-1 if m1 < -1e-9 else 0)
            if s0 and s1 and s0 != s1 and abs(m0) >= 0.08 and abs(m1) >= 0.08:
                material_sign += 1
    return {
        "pairsTopChanged": top_changed,
        "pairsMaterialDeltaM": material_m,
        "pairsMaterialSignFlip": material_sign,
    }


def precompute_pair_state(decks, leftover, idx, by_axis):
    cells = _eligible_leftover(leftover, by_axis)
    out = []
    by_cell = defaultdict(list)
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top = idx[(a["id"], b["id"])].get("topEligible") or idx[(a["id"], b["id"])]["top"]
            tc, td = parse_top(top)
            top_m = axis_mass(a, b, tc, td)
            ranked = []
            for c, d in cells:
                m = axis_mass(a, b, c, d)
                if m >= 0.10:
                    ranked.append((m, c, d))
            ranked.sort(reverse=True)
            rec = {"from": a["id"], "to": b["id"], "top": top, "top_m": top_m, "ranked": ranked}
            out.append(rec)
            if ranked:
                by_cell[(ranked[0][1], ranked[0][2])].append(f"{a['id']}→{b['id']}")
    return out, by_cell, cells


def cell_pre_review(pair_state, cap, dep):
    hs, masses, affected = [], [], 0
    n1 = 0
    for row in pair_state:
        hit = next(((m, i) for i, (m, c, d) in enumerate(row["ranked"]) if c == cap and d == dep), None)
        if not hit:
            continue
        m, rank = hit
        affected += 1
        masses.append(m)
        hs.append(m / (row["top_m"] + 0.02))
        if rank == 0:
            n1 += 1
    return {
        "pairsAffected": affected,
        "n1Challenger": n1,
        "maxMass": round(max(masses), 4) if masses else 0.0,
        "meanMass": round(float(np.mean(masses)), 4) if masses else 0.0,
        "maxH": round(max(hs), 4) if hs else 0.0,
        "meanH": round(float(np.mean(hs)), 4) if hs else 0.0,
        "medianH": round(float(np.median(hs)), 4) if hs else 0.0,
    }


def freeze_k24():
    path = MS / "mechanical-pressure-k-v2.4" / "IMMUTABLE.json"
    im = load_json(path)
    im["status"] = "FROZEN"
    im["frozenAs"] = "diagnostic geometry baseline; parent of H-calibration-audit-v1"
    path.write_text(json.dumps(im, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    freeze_k24()

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    decks, _ = load_decks(
        concept_ids, by_axis, scores, np.percentile(scores, 90, axis=0), np.percentile(scores, 99, axis=0), row_of, name_of, type_of
    )
    ids = [d["id"] for d in decks]

    replay = []
    bin_counts = {b[0]: {"active": 0, "conditional": 0, "enable": 0, "neutral": 0, "n": 0} for b in H_BINS}
    compat_vs_out = defaultdict(lambda: defaultdict(int))
    batch_effects = {}

    for child_name, parent_name in BATCHES:
        parent = MS / parent_name
        child = MS / child_name
        parent_edges = load_json(parent / "edges.json")
        idx_prev = pair_index_eligible(load_json(parent / "pairs.json"), by_axis)
        idx_new = pair_index_eligible(load_json(child / "pairs.json"), by_axis)
        leftover = leftover_cells(concept_ids, by_axis, parent_edges)
        pair_state, n1_map, _ = precompute_pair_state(decks, leftover, idx_prev, by_axis)
        effects = pair_effects(idx_prev, idx_new, ids)
        batch_effects[child_name] = effects

        for e in load_json(child / "new-edges.json"):
            cap, dep = e["capability"], e["target"]
            pre = cell_pre_review(pair_state, cap, dep)
            comp = compatibility(cap, dep)
            rel = e["relation"]
            bucket = outcome_bucket(rel)
            hb = h_bin(pre["maxH"])
            bin_counts[hb]["n"] += 1
            bin_counts[hb][bucket] += 1
            compat_vs_out[comp["level"]][bucket] += 1
            replay.append(
                {
                    "batch": child_name,
                    "capability": cap,
                    "target": dep,
                    "relation": rel,
                    "outcome": bucket,
                    "preReview": pre,
                    "hBin": hb,
                    "compatibility": comp,
                    "a_capability": round(axis_reliability(by_axis[cap]) if cap in by_axis else 0.2, 4),
                    "a_target": round(axis_reliability(by_axis[dep]) if dep in by_axis else 0.2, 4),
                    "capClass": (by_axis.get(cap) or {}).get("directionClass"),
                    "depClass": (by_axis.get(dep) or {}).get("directionClass"),
                    "capRole": (by_axis.get(cap) or {}).get("role"),
                    "n1Pairs": n1_map.get((cap, dep), [])[:8],
                }
            )

    # Validation: active should be HIGH/MEDIUM; neutral enriched in LOW
    n_active = sum(1 for r in replay if r["outcome"] == "active")
    n_neutral = sum(1 for r in replay if r["outcome"] == "neutral")
    n_cond = sum(1 for r in replay if r["outcome"] == "conditional")
    n_enable = sum(1 for r in replay if r["outcome"] == "enable")
    active_hm = sum(1 for r in replay if r["outcome"] == "active" and r["compatibility"]["level"] in {"HIGH", "MEDIUM"})
    neutral_low = sum(1 for r in replay if r["outcome"] == "neutral" and r["compatibility"]["level"] == "LOW")
    cond_med = sum(1 for r in replay if r["outcome"] == "conditional" and r["compatibility"]["level"] == "MEDIUM")
    validation = {
        "nReplay": len(replay),
        "active": n_active,
        "conditional": n_cond,
        "enable": n_enable,
        "neutral": n_neutral,
        "activeInHighOrMedium": {"n": active_hm, "of": n_active, "rate": round(active_hm / n_active, 4) if n_active else None},
        "neutralInLow": {"n": neutral_low, "of": n_neutral, "rate": round(neutral_low / n_neutral, 4) if n_neutral else None},
        "conditionalInMedium": {"n": cond_med, "of": n_cond, "rate": round(cond_med / n_cond, 4) if n_cond else None},
        "compatByOutcome": {k: dict(v) for k, v in compat_vs_out.items()},
        "gate": {
            "activeMostlyHighMedium": (active_hm / n_active >= 0.75) if n_active else False,
            "neutralEnrichedInLow": (neutral_low / n_neutral >= 0.50) if n_neutral else False,
            "usable": False,
        },
    }
    validation["gate"]["usable"] = validation["gate"]["activeMostlyHighMedium"] and validation["gate"]["neutralEnrichedInLow"]

    # Re-score current 210 pairs: H_raw vs H_credible
    k24_edges = load_json(MS / "mechanical-pressure-k-v2.4" / "edges.json")
    idx24 = pair_index_eligible(load_json(MS / "mechanical-pressure-k-v2.4" / "pairs.json"), by_axis)
    leftover24 = leftover_cells(concept_ids, by_axis, k24_edges)
    cells = _eligible_leftover(leftover24, by_axis)
    challenges_raw, hdist_raw = h_eligible(decks, leftover24, idx24, by_axis)
    tail_raw = h_tail(challenges_raw)

    pair_cred = []
    short_cred = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top = idx24[(a["id"], b["id"])].get("topEligible") or idx24[(a["id"], b["id"])]["top"]
            tc, td = parse_top(top)
            top_m = axis_mass(a, b, tc, td)
            thresh = top_m + 0.02
            raw_block, cred_block, w_block = [], [], []
            for c, d in cells:
                m = axis_mass(a, b, c, d)
                if m < 0.10:
                    continue
                comp = compatibility(c, d)
                h = m / thresh
                raw_block.append((m, h, c, d, comp["level"]))
                if comp["level"] in {"HIGH", "MEDIUM"}:
                    cred_block.append((m, h, c, d, comp["level"]))
                if comp["weight"] > 0 and m * comp["weight"] >= 0.10:
                    w_block.append((m * comp["weight"], c, d, comp["level"]))
            raw_block.sort(reverse=True)
            cred_block.sort(reverse=True)
            w_block.sort(reverse=True)
            h_raw = raw_block[0][1] if raw_block else 0.0
            h_cred = cred_block[0][1] if cred_block else 0.0
            h_w = (w_block[0][0] / thresh) if w_block else 0.0
            rec = {
                "pair": f"{a['id']}→{b['id']}",
                "top": top,
                "H_raw": round(h_raw, 4),
                "H_credible": round(h_cred, 4),
                "H_weighted": round(h_w, 4),
                "nRawAboveH1": sum(1 for m, h, *_ in raw_block if h >= 1),
                "nCredibleAboveH1": sum(1 for m, h, *_ in cred_block if h >= 1),
                "nRawAboveH05": sum(1 for m, h, *_ in raw_block if h >= 0.5),
                "nCredibleAboveH05": sum(1 for m, h, *_ in cred_block if h >= 0.5),
                "largestRaw": {"edge": f"{raw_block[0][2]} → {raw_block[0][3]}", "level": raw_block[0][4], "mass": round(raw_block[0][0], 4)} if raw_block else None,
                "largestCredible": {"edge": f"{cred_block[0][2]} → {cred_block[0][3]}", "level": cred_block[0][4], "mass": round(cred_block[0][0], 4)} if cred_block else None,
            }
            pair_cred.append(rec)
            if rec["nCredibleAboveH1"] <= 5:
                short_cred.append(rec)

    pair_cred.sort(key=lambda r: -r["H_raw"])
    short_cred.sort(key=lambda r: (r["nCredibleAboveH1"], -r["H_credible"]))
    hs_c = [r["H_credible"] for r in pair_cred]
    hs_w = [r["H_weighted"] for r in pair_cred]
    cred_tail = {
        "mean": float(np.mean(hs_c)),
        "median": float(np.median(hs_c)),
        "n_lt_1": sum(1 for h in hs_c if h < 1),
        "n_lt_0_5": sum(1 for h in hs_c if h < 0.5),
        "n_lt_0_2": sum(1 for h in hs_c if h < 0.2),
        "n_ge1": sum(1 for h in hs_c if h >= 1),
        "n": 210,
    }
    w_tail = {
        "mean": float(np.mean(hs_w)),
        "median": float(np.median(hs_w)),
        "n_lt_1": sum(1 for h in hs_w if h < 1),
        "n_lt_0_5": sum(1 for h in hs_w if h < 0.5),
        "n_lt_0_2": sum(1 for h in hs_w if h < 0.2),
        "n_ge1": sum(1 for h in hs_w if h >= 1),
    }

    # Preserve v2.4 diagnostic geometry baseline (not Pressure v2)
    geom = []
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            geom.append(
                {
                    "pair": f"{a}↔{b}",
                    "M": round(M({k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx24.items()}, a, b), 4),
                    "topAB": idx24[(a, b)].get("topEligible") or idx24[(a, b)]["top"],
                    "topBA": idx24[(b, a)].get("topEligible") or idx24[(b, a)]["top"],
                }
            )

    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "version": "h-calibration-audit-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parent": "mechanical-pressure-k-v2.4",
        "status": "EXPERIMENTAL_DIAGNOSTIC",
        "safety": {
            "newKRelations": False,
            "ontologyRetrain": False,
            "extraDecks": False,
            "hodge": False,
            "bgeUsedToPredictK": False,
            "pressureV2Canon": False,
            "compatibilityCanonized": False,
            "lowCompatibilityIsNotNeutral": True,
        },
        "question": "Does raw unresolved prominence correspond to the probability that an UNKNOWN cell can rewrite a causal explanation?",
        "hBins": bin_counts,
        "validation": validation,
        "batchGeometryEffects": batch_effects,
        "H_raw": tail_raw,
        "H_credible_filter": cred_tail,
        "H_credible_weighted": w_tail,
        "note": (
            "H_raw is unchanged historical definition. "
            "H_credible_filter ignores LOW-compatibility leftovers. "
            "H_credible_weighted uses HIGH=1 MEDIUM=0.5 LOW=0. Weights are not canonized. "
            "LOW is not a K NEUTRAL declaration."
        ),
        "shortCredibleTails": [
            r
            for r in short_cred
            if r["nCredibleAboveH1"] <= 5
        ][:24],
        "nShortCredibleTail": sum(1 for r in pair_cred if r["nCredibleAboveH1"] <= 5),
        "nCredibleResistant": cred_tail["n_lt_1"],
        "rawResistantKept": sum(1 for r in pair_cred if r["H_raw"] < 1),
    }
    (OUT / "replay.json").write_text(json.dumps(replay, indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs-h-credible.json").write_text(json.dumps(pair_cred, indent=2) + "\n", encoding="utf-8")
    (OUT / "k-v2.4-diagnostic-baseline.json").write_text(
        json.dumps(
            {
                "artifactType": "Kv24AntisymmetricDiagnosticBaseline",
                "status": "FROZEN_DIAGNOSTIC",
                "notPressureV2": True,
                "rhoNote": "v2.3→v2.4 ρ=0.999, 210/210 tops, 0 material reversals, 0 cycles",
                "pairs": geom,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "HCalibrationAudit",
                "version": "h-calibration-audit-v1",
                "status": "REVIEWED_DIAGNOSTIC",
                "lineage": "v2",
                "parent": "mechanical-pressure-k-v2.4",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "nReplay": len(replay),
                "hBins": bin_counts,
                "validation": validation,
                "batchEffects": batch_effects,
                "H_raw": {k: tail_raw[k] for k in ("mean", "median", "n_lt_1", "n_lt_0_5", "n_ge1")},
                "H_credible": cred_tail,
                "H_weighted": w_tail,
                "nShortCredible": report["nShortCredibleTail"],
                "usable": validation["gate"]["usable"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Attempt-2 exhaustion audit. Replay only. No reselection."""

from __future__ import annotations

import hashlib
import json
import time
from collections import Counter
from pathlib import Path

import numpy as np

from build_corpus_expansion_v1 import (
    commander_key,
    coverage_gain,
    eligible_axis_ids,
    jaccard,
    kmeans,
    lite_axes,
    l2norm,
    percentile_ranks,
    vector_of,
)
from build_corpus_expansion_v2 import collect_remaining, oids_of_source
from build_k_v13_active_coverage import resolve_cards
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge


def reject_reason(i, selected_idx, cand, sealed_oids, C, min_cos, max_jac) -> str:
    if any(jaccard(cand[i]["oids"], o) > max_jac for o in sealed_oids):
        return "JACCARD_VS_SEALED_30"
    if any(jaccard(cand[i]["oids"], cand[j]["oids"]) > max_jac for j in selected_idx):
        return "JACCARD_VS_EXPANSION_V2"
    if selected_idx:
        sims = C[selected_idx] @ l2norm(cand[i]["vec"])
        if float(sims.max()) > (1.0 - min_cos):
            return "COSINE_VS_EXPANSION_V2"
    return "ELIGIBLE"

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
CEX1 = MS / "corpus-expansion-v1"
CEX2 = MS / "corpus-expansion-v2"
PROF2 = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"
OUT = CEX2 / "exhaustion-audit-attempt-2"


def main() -> None:
    proto = load_json(CEX2 / "selection-protocol.json")
    addendum = load_json(CEX2 / "representation-parity-addendum.json")
    if proto.get("status") != "FROZEN" or addendum.get("status") != "FROZEN":
        raise SystemExit("protocol/addendum must stay frozen")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF2 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must stay frozen")
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != load_json(SCREEN / "IMMUTABLE.json")["sha256"]:
        raise SystemExit("compatibility-screen-v1 was edited")

    n_exp = int(proto["selection"]["nExpansion"])
    k = int(proto["stratification"]["k"])
    seed = int(proto["stratification"]["seed"])
    min_cos = float(proto["selection"]["minCosineDistanceAmongExpansionV2"])
    max_jac = float(proto["selection"]["cardJaccardMaxVsSelected"])
    held = load_json(CEX2 / "selected-expansion.json")
    parity = load_json(CEX2 / "representation-parity.json")
    if not parity.get("pass") or parity.get("dim") != 76:
        raise SystemExit("attempt 2 parity artifact missing")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    ranks = percentile_ranks(scores)
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    axis_ids = eligible_axis_ids(concept_ids, by_axis)
    if len(axis_ids) != 76:
        raise SystemExit("dim != 76")

    sealed_key = load_json(CEX1 / "sealed-key.json")["key"]
    sealed_sources = load_json(CEX1 / "source-decks.json")
    exclude_keys = {commander_key(row["commanders"]) for row in sealed_key}
    exclude_names = {n for key in exclude_keys for n in key}
    pool, frame = collect_remaining(exclude_keys, exclude_names)
    sealed_oids = [oids_of_source(raw) for raw in sealed_sources]
    sealed_vecs = []
    for raw in sealed_sources:
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, _ = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        sealed_vecs.append(vector_of(axes, axis_ids))
    cand = []
    for raw in pool:
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        if len(cards) < 70:
            continue
        axes, _ = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        cand.append({"raw": raw, "vec": vector_of(axes, axis_ids), "oids": {c["oracleId"] for c in cards}})

    C = np.stack([l2norm(c["vec"]) for c in cand])
    S = np.stack([l2norm(v) for v in sealed_vecs])
    labels = kmeans(np.vstack([S, C]), k, seed)
    cand_lab = labels[len(S) :]
    represented = set(int(x) for x in labels[: len(S)])
    corpus_max = np.max(np.stack(sealed_vecs), axis=0)
    selected: list[int] = []

    def can_take(i: int) -> bool:
        return reject_reason(i, selected, cand, sealed_oids, C, min_cos, max_jac) == "ELIGIBLE"

    def pick_from(indices):
        best_i, best_g = None, -1.0
        for i in indices:
            if i in selected or not can_take(i):
                continue
            g = coverage_gain(cand[i]["vec"], corpus_max)
            if g > best_g:
                best_i, best_g = i, g
        return best_i, best_g

    gains = []
    for region in range(k):
        if region in represented:
            continue
        i, g = pick_from([j for j, lab in enumerate(cand_lab) if int(lab) == region])
        if i is None:
            continue
        selected.append(i)
        represented.add(region)
        gains.append(round(g, 4))
        corpus_max = np.maximum(corpus_max, cand[i]["vec"])
    while len(selected) < n_exp:
        i, g = pick_from(list(range(len(cand))))
        if i is None:
            break
        selected.append(i)
        gains.append(round(g, 4))
        corpus_max = np.maximum(corpus_max, cand[i]["vec"])

    replay_ids = [cand[i]["raw"]["deckInstanceId"] for i in selected]
    held_ids = [r["deckInstanceId"] for r in held]
    rem = [j for j in range(len(cand)) if j not in selected]
    reasons = Counter(reject_reason(j, selected, cand, sealed_oids, C, min_cos, max_jac) for j in rem)
    grems = np.array([coverage_gain(cand[j]["vec"], corpus_max) for j in rem])
    qa = {
        "replayMatchesAttempt2": replay_ids == held_ids,
        "parityWas76": True,
        "noHiddenCapAt15": n_exp == 30,
        "doNotEarlyStopOnSmallGainHonored": any(g == 0.0 for g in gains),
        "nSelected": len(selected),
    }
    qa["pass"] = all(qa.values()) and qa["replayMatchesAttempt2"]
    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "attempt": 2,
        "reselection": False,
        "predeclaredStoppingRule": {
            "nExpansion": 30,
            "doNotEarlyStopOnSmallGain": True,
            "can_take": "Jaccard <= 0.7 and cosine distance >= 0.12 among Expansion-v2",
            "notAGainThreshold": True,
        },
        "stop": {
            "rule": "no remaining candidate satisfies can_take",
            "nSelected": len(selected),
            "nRemaining": len(rem),
            "rejectCounts": dict(reasons),
            "bestRemainingGain": round(float(grems.max()), 6) if len(grems) else None,
            "nRemainingWithPositiveGain": int(np.sum(grems > 1e-12)),
            "note": "Stop is diversity packing under the frozen cosine/Jaccard rule. Residual coverage still exists among cosine-blocked identities.",
        },
        "perPickGain": gains,
        "coverageZeroAfter": next((i + 1 for i, g in enumerate(gains) if g == 0.0), None),
        "qa": qa,
        "frame": frame,
        "safety": {"reselection": False, "forcedQuota": False, "k": False, "pressure": False, "hodge": False},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps({"artifactType": "SelectionExhaustionAudit", "attempt": 2, "status": "PASS" if qa["pass"] else "FAIL", "reselection": False, "nSelected": len(selected)}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"qa": qa, "stop": report["stop"], "perPickGain": gains}, indent=2))


if __name__ == "__main__":
    main()

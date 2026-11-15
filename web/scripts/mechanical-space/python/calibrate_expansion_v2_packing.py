#!/usr/bin/env python3
"""
Calibrate Expansion-v2 Protocol v2 cosine packing from sealed-30 geometry only.

Does not read the remaining candidate pool, Attempt-2 identities, K, Pressure, or Hodge.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import numpy as np

from build_corpus_expansion_v1 import eligible_axis_ids, lite_axes, l2norm, percentile_ranks, vector_of
from build_k_v13_active_coverage import resolve_cards
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

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


def main() -> None:
    proto = load_json(CEX2 / "selection-protocol-v2.json")
    if proto.get("status") != "FROZEN" or not proto.get("frozenBeforeSelection"):
        raise SystemExit("protocol v2 must be frozen before calibration")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF2 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must stay frozen")
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != load_json(SCREEN / "IMMUTABLE.json")["sha256"]:
        raise SystemExit("compatibility-screen-v1 was edited")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    ranks = percentile_ranks(scores)
    rc8 = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    axis_ids = eligible_axis_ids(concept_ids, by_axis)
    if len(axis_ids) != 76:
        raise SystemExit(f"expected 76-d, got {len(axis_ids)}")

    sources = load_json(CEX1 / "source-decks.json")
    if len(sources) != 30:
        raise SystemExit("expected sealed 30")
    vecs = []
    for raw in sources:
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, _ = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        vecs.append(vector_of(axes, axis_ids))
    S = np.stack([l2norm(v) for v in vecs])
    sim = S @ S.T
    np.fill_diagonal(sim, -np.inf)
    nn_cos_dist = 1.0 - sim.max(axis=1)
    p25 = float(np.quantile(nn_cos_dist, 0.25))
    old = 0.12
    realized = min(old, p25)
    cal = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "FROZEN",
        "protocol": "corpus-expansion-v2-protocol-v2",
        "nSealed": 30,
        "dim": 76,
        "nearestNeighborCosineDistance": {
            "min": round(float(nn_cos_dist.min()), 6),
            "p10": round(float(np.quantile(nn_cos_dist, 0.10)), 6),
            "p25": round(p25, 6),
            "p50": round(float(np.median(nn_cos_dist)), 6),
            "p75": round(float(np.quantile(nn_cos_dist, 0.75)), 6),
            "max": round(float(nn_cos_dist.max()), 6),
            "mean": round(float(nn_cos_dist.mean()), 6),
        },
        "attempt2HardThreshold": old,
        "realizedMinCosineAmongExpansionV2": round(realized, 6),
        "formula": "min(0.12, p25 of sealed-30 NN cosine distance)",
        "candidatesInspected": False,
        "quotaUsed": False,
        "k": False,
        "pressure": False,
        "hodge": False,
        "g1": False,
    }
    (CEX2 / "packing-calibration.json").write_text(json.dumps(cal, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: cal[k] for k in cal if k != "createdAt"}, indent=2))


if __name__ == "__main__":
    main()

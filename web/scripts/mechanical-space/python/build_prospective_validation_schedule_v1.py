#!/usr/bin/env python3
"""
Prospective Strategic Validation schedule v1.

Uses only frozen pair class, comparable direction, deckInstanceId,
and encounter counts. No outcomes, Pressure, R, mechanics, or names.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

from build_stable_hostile_order_audit_v1 import ALL60
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
EV = MS / "external-strategic-validity-audit-v1"
CEX2 = MS / "corpus-expansion-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "prospective-strategic-validation-protocol-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

WEIGHT = {
    "DIRECT_COVER": 16.0,
    "TRANSITIVE_COMPARABLE": 8.0,
    "RECIPROCAL_BOUNDARY": 4.0,
    "CANCELLED_INCOMPARABLE": 5.0,
}
TARGETS = {
    "DIRECT_COVER": 60,
    "TRANSITIVE_COMPARABLE": 150,
    "RECIPROCAL_BOUNDARY": 150,
    "CANCELLED_INCOMPARABLE": 25,
}
OBS_TARGET = 500
PLAYERS = [f"P{i:02d}" for i in range(8)]


def pair_key(a: str, b: str) -> frozenset[str]:
    return frozenset((a, b))


def coverage(counts: dict[frozenset, int], cls_of: dict) -> dict[str, int]:
    touched = defaultdict(int)
    for key, n in counts.items():
        if n > 0:
            touched[cls_of[key]] += 1
    return dict(touched)


def targets_met(counts: dict[frozenset, int], cls_of: dict, n_obs: int) -> bool:
    cov = coverage(counts, cls_of)
    if n_obs < OBS_TARGET:
        return False
    return all(cov.get(k, 0) >= t for k, t in TARGETS.items())


def pair_value(cls: str, n: int, cov: dict[str, int]) -> float:
    w = WEIGHT[cls]
    behind = cov.get(cls, 0) < TARGETS[cls]
    if n == 0:
        return w * (2.0 if behind else 0.35)
    if n == 1:
        return w * (0.40 if not behind else 0.12)
    return w * 0.03


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(EV / "IMMUTABLE.json").get("outcome") != "EV4":
        raise SystemExit("EV4 must be frozen")
    if load_json(OUT / "protocol.json").get("status") != "FROZEN":
        raise SystemExit("protocol must be frozen first")
    if load_json(OUT / "analysis-spec.json").get("status") != "FROZEN":
        raise SystemExit("analysis spec must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    labels = load_json(EV / "frozen-pair-labels.json")
    if labels.get("outcomesOpened") is not False:
        raise SystemExit("pair labels were opened")
    label_bytes = (EV / "frozen-pair-labels.json").read_bytes()
    label_sha = hashlib.sha256(label_bytes).hexdigest()

    cls_of = {}
    direction_of = {}
    by_class = defaultdict(list)
    for r in labels["pairs"]:
        key = pair_key(r["a"], r["b"])
        cls_of[key] = r["class"]
        direction_of[key] = r.get("direction")
        by_class[r["class"]].append(key)

    src = load_json(CEX2 / "source-decks-60.json")
    if len(src) != 60:
        raise SystemExit("need 60 sealed instances")
    inst = {bid: rec["deckInstanceId"] for bid, rec in zip(ALL60, src)}
    decks = list(ALL60)

    counts: dict[frozenset, int] = defaultdict(int)
    load = defaultdict(int)
    used_quartets: set[tuple[str, ...]] = set()
    pods_a: list[list[str]] = []

    def score_quartet(qs: list[str]) -> float:
        cov = coverage(counts, cls_of)
        s = 0.0
        for a, b in combinations(qs, 2):
            key = pair_key(a, b)
            s += pair_value(cls_of[key], counts[key], cov)
        s -= 0.08 * sum(load[d] for d in qs)
        return s

    def pick_seed() -> frozenset[str] | None:
        cov = coverage(counts, cls_of)
        order = ["DIRECT_COVER", "CANCELLED_INCOMPARABLE", "TRANSITIVE_COMPARABLE", "RECIPROCAL_BOUNDARY"]
        best = None
        best_v = -1.0
        for cls in order:
            for key in by_class[cls]:
                a, b = tuple(key)
                v = pair_value(cls, counts[key], cov) - 0.04 * (load[a] + load[b])
                if v > best_v:
                    best_v = v
                    best = key
        return best

    def complete(seed: frozenset[str]) -> list[str] | None:
        a, b = tuple(seed)
        rest = [d for d in decks if d not in seed]
        best_q = None
        best_s = -1e18
        for c, d in combinations(rest, 2):
            q = sorted([a, b, c, d])
            sig = tuple(q)
            if sig in used_quartets:
                continue
            s = score_quartet(q)
            if s > best_s:
                best_s = s
                best_q = q
        return best_q

    print("  generating tranche A", flush=True)
    safety = 0
    while not targets_met(counts, cls_of, sum(counts.values())):
        seed = pick_seed()
        if seed is None:
            break
        q = complete(seed)
        if q is None:
            break
        used_quartets.add(tuple(q))
        pods_a.append(q)
        for x, y in combinations(q, 2):
            counts[pair_key(x, y)] += 1
        for d in q:
            load[d] += 1
        safety += 1
        if safety > 400:
            raise SystemExit("scheduler exceeded 400 pods without meeting targets")

    n_b = max(1, round(len(pods_a) * 3 / 7))
    print(f"  generating tranche B n={n_b}", flush=True)
    pods_b: list[list[str]] = []
    for _ in range(n_b):
        seed = pick_seed()
        if seed is None:
            break
        q = complete(seed)
        if q is None:
            break
        used_quartets.add(tuple(q))
        pods_b.append(q)
        for x, y in combinations(q, 2):
            counts[pair_key(x, y)] += 1
        for d in q:
            load[d] += 1

    def pack_pod(i: int, q: list[str], tranche: str) -> dict:
        # rotate players and seats; never bind a fixed pilot
        offset = i % 8
        players = [PLAYERS[(offset + j) % 8] for j in range(4)]
        seats = [((i + j) % 4) + 1 for j in range(4)]
        members = []
        for j, bid in enumerate(q):
            members.append(
                {
                    "blindId": bid,
                    "deckInstanceId": inst[bid],
                    "playerId": players[j],
                    "seat": seats[j],
                }
            )
        return {
            "podId": f"PSV1-{tranche}-{i + 1:03d}",
            "tranche": tranche,
            "decks": members,
            "pairs": [
                {
                    "a": a,
                    "b": b,
                    "class": cls_of[pair_key(a, b)],
                    "direction": direction_of[pair_key(a, b)],
                }
                for a, b in combinations(q, 2)
            ],
            "result": None,
            "note": "Fill result after the game. Do not change decks or predictions.",
        }

    schedule = [pack_pod(i, q, "A") for i, q in enumerate(pods_a)]
    schedule += [pack_pod(len(pods_a) + i, q, "B") for i, q in enumerate(pods_b)]

    def tranche_stats(pods: list[list[str]]) -> dict:
        local: dict[frozenset, int] = defaultdict(int)
        for q in pods:
            for a, b in combinations(q, 2):
                local[pair_key(a, b)] += 1
        cov = coverage(local, cls_of)
        repeats = sum(1 for n in local.values() if n >= 2)
        return {
            "nPods": len(pods),
            "nPairObservations": sum(local.values()),
            "distinctByClass": {k: cov.get(k, 0) for k in TARGETS},
            "nPairsWithRepeat": repeats,
            "targetsMet": targets_met(local, cls_of, sum(local.values())),
        }

    stats_a = tranche_stats(pods_a)
    stats_b = tranche_stats(pods_b)
    stats_all = tranche_stats(pods_a + pods_b)

    collection = {
        "podId": "",
        "timestamp": "",
        "termination": "",
        "turns": None,
        "placements": [
            {"deckInstanceId": "", "playerId": "", "seat": None, "placement": None, "eliminatedOrder": None}
            for _ in range(4)
        ],
        "winnerDeckInstanceId": "",
        "notes": "",
    }

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PROSPECTIVE_STRATEGIC_VALIDATION_PROTOCOL_V1",
        "predictionsSha256": label_sha,
        "predictionsFile": "external-strategic-validity-audit-v1/frozen-pair-labels.json",
        "schedulerInputs": ["deckInstanceId", "frozen pair class", "frozen direction", "encounter count"],
        "schedulerExcluded": ["outcomes", "Pressure", "R", "mechanics", "commander identity", "strength"],
        "trancheA": stats_a,
        "trancheB": stats_b,
        "fullSchedule": stats_all,
        "nPlayersNotional": 8,
        "modelUntouched": True,
        "outcomesOpened": False,
        "next": "Collect tranche A with full 1–4 placements, then External Strategic Validity Audit v2. Do not open tranche B.",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "schedule.json").write_text(json.dumps({"pods": schedule, "summary": report}, indent=2) + "\n", encoding="utf-8")
    (OUT / "result-template.json").write_text(json.dumps({"schema": collection, "results": []}, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "ProspectiveStrategicValidationProtocol",
                "version": "prospective-strategic-validation-protocol-v1",
                "status": "FROZEN",
                "predictionsSha256": label_sha,
                "outcomesOpened": False,
                "trancheAPods": stats_a["nPods"],
                "trancheBPods": stats_b["nPods"],
                "trancheATargetsMet": stats_a["targetsMet"],
                "note": "Predictions untouchable. Model untouched. Collect games. Do not open outcomes into the instrument.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"A": stats_a, "B": stats_b, "all": stats_all, "sha": label_sha[:16]}, indent=2))


if __name__ == "__main__":
    main()

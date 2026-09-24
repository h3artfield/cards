#!/usr/bin/env python3
"""
Outcome Audit v3 scoring. Loads predictions only after outcomes are frozen.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from outcome_firewall_v1 import TRANSCRIPT_MECHANISM_UNLOCKED, TRANSCRIPT_UNLOCKED
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
EGV = MS / "external-gameplay-validation-v1"
V2 = MS / "external-gameplay-outcome-audit-v2"
OUT = MS / "external-gameplay-outcome-audit-v3"
PRED_SHA = "2f02c78a421c4c5da53831af5e1c860c92d228019e9e25471391f604c562ad4a"
MAJOR = ("MTG Muddstah", "The Spike Feeders")
STRATA = ("MTG Muddstah", "The Spike Feeders", "Elder Dragon Hijinks", "Combat Step")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bootstrap_ci(pod_ys: list[list[int]], draws: int = 10000, seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    n = len(pod_ys)
    if n == 0:
        return {"nPods": 0, "nObs": 0, "point": None, "ciLow": None, "ciHigh": None, "draws": draws, "seed": seed}
    all_y = [y for pod in pod_ys for y in pod]
    point = float(np.mean(all_y)) if all_y else None
    accs = []
    for _ in range(draws):
        idx = rng.integers(0, n, size=n)
        ys = [y for i in idx for y in pod_ys[i]]
        if ys:
            accs.append(float(np.mean(ys)))
    if not accs:
        return {"nPods": n, "nObs": len(all_y), "point": point, "ciLow": None, "ciHigh": None, "draws": draws, "seed": seed}
    lo, hi = np.percentile(accs, [2.5, 97.5])
    return {
        "nPods": n,
        "nObs": len(all_y),
        "point": round(point, 6) if point is not None else None,
        "ciLow": round(float(lo), 6),
        "ciHigh": round(float(hi), 6),
        "draws": draws,
        "seed": seed,
    }


def decide(ci: dict, n_usable: int, n_resolved: int) -> str:
    if n_usable < 40 or n_resolved < 100:
        return "XO4"
    if ci.get("ciLow") is None:
        return "XO4"
    if ci["ciLow"] > 0.50:
        return "XO1"
    if ci["ciHigh"] < 0.50:
        return "XO3"
    return "XO2"


def score_pair(above: set[tuple[str, str]], a: str, b: str):
    if (a, b) in above:
        return 1
    if (b, a) in above:
        return 0
    return "NA"


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if TRANSCRIPT_UNLOCKED or TRANSCRIPT_MECHANISM_UNLOCKED:
        raise SystemExit("mechanism transcripts must stay locked")
    if load_json(V2 / "XO4_PERMANENT.json").get("doNotRevise") is not True:
        raise SystemExit("v2 XO4 permanent freeze missing")
    frozen = load_json(OUT / "OUTCOMES_FROZEN.json")
    if frozen.get("predictionsSeen") is not False:
        raise SystemExit("outcomes were not extracted prediction-blind")
    raw = OUT / "video-outcomes-v3.json"
    if hashlib.sha256(raw.read_bytes()).hexdigest() != frozen["outcomesSha256"]:
        raise SystemExit("outcome artifact changed after freeze")
    outcomes = load_json(raw)
    if outcomes.get("predictionsSeen") is not False:
        raise SystemExit("outcome artifact saw predictions")

    pred_freeze = load_json(EGV / "prediction-freeze-v1.json")
    if pred_freeze.get("predictionFreezeSha256") != PRED_SHA:
        raise SystemExit("prediction SHA mismatch")
    if sha256_file(EGV / "external-game-pair-predictions-v1.json") != pred_freeze["checksums"]["externalGamePairPredictions"]:
        raise SystemExit("predictions changed")

    by_game = {g["externalGameId"]: g for g in outcomes["games"]}
    pred = load_json(EGV / "external-game-pair-predictions-v1.json")
    scored = []
    for p in pred["pairs"]:
        oc = by_game[p["externalGameId"]]
        above = {(r["above"], r["below"]) for r in oc.get("above") or []}
        direction = p.get("direction")
        if p["relation"] == "STABLE_DIRECTION" and direction:
            y = score_pair(above, direction["from"], direction["to"])
        else:
            y = "RESOLVED_NO_DIRECTION" if score_pair(above, p["a"], p["b"]) in (0, 1) else "NA"
        scored.append(
            {
                "externalGameId": p["externalGameId"],
                "a": p["a"],
                "b": p["b"],
                "relation": p["relation"],
                "direction": direction,
                "score": y,
                "outcomeKind": oc.get("kind"),
            }
        )

    usable_games = [gid for gid, g in by_game.items() if g.get("usable")]
    stable_res = [r for r in scored if r["relation"] == "STABLE_DIRECTION" and r["score"] in (0, 1)]
    by_pod = defaultdict(list)
    channel_of = {g["externalGameId"]: g["channel"] for g in outcomes["games"]}
    for r in stable_res:
        by_pod[r["externalGameId"]].append(int(r["score"]))
    pod_ys = [by_pod[gid] for gid in usable_games if by_pod[gid]]
    ci = bootstrap_ci(pod_ys)
    call = decide(ci, len(usable_games), len(stable_res))

    strata = {}
    for ch in STRATA:
        ys = [y for gid in usable_games if channel_of[gid] == ch for y in by_pod.get(gid, [])]
        strata[ch] = {
            "nUsableGames": sum(1 for gid in usable_games if channel_of[gid] == ch),
            "nResolvedStable": len(ys),
            "point": round(float(np.mean(ys)), 6) if ys else None,
        }
    loo = {}
    source_flag = None
    if call == "XO1":
        source_flag = "SOURCE_ROBUST"
        for ch in MAJOR:
            ys = [y for gid in usable_games if channel_of[gid] != ch for y in by_pod.get(gid, [])]
            pt = float(np.mean(ys)) if ys else None
            loo[ch] = {"removed": ch, "nObs": len(ys), "point": round(pt, 6) if pt is not None else None}
            if pt is None or pt <= 0.50:
                source_flag = "SOURCE_SENSITIVE"

    fracs = [sum(ys) / len(ys) for ys in by_pod.values() if ys]
    incomp = [r for r in scored if r["relation"] != "STABLE_DIRECTION"]
    kinds = Counter(g.get("kind") for g in outcomes["games"])
    n_ident = sum(1 for g in load_json(OUT / "identity-mapping-v3.json")["games"] if g.get("mappingStatus") == "MAPPED")

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT_AND_WAIT",
        "label": "VIDEO_ASSISTED_ENDGAME",
        "notARescueOfPriorXO4": True,
        "parentV1XO4": "PERMANENTLY_FROZEN",
        "parentV2XO4": "PERMANENTLY_FROZEN",
        "predictionFreezeSha256": PRED_SHA,
        "outcomesSha256": frozen["outcomesSha256"],
        "nIdentityMapped": n_ident,
        "nUsableOutcomeGames": len(usable_games),
        "outcomeKinds": dict(kinds),
        "nResolvedStableDirection": len(stable_res),
        "nCorrect": sum(1 for r in stable_res if r["score"] == 1),
        "nIncorrect": sum(1 for r in stable_res if r["score"] == 0),
        "directionalAccuracy": ci,
        "call": call,
        "sourceFlag": source_flag,
        "channelStrata": strata,
        "leaveOneMajorChannelOut": loo,
        "perGameDiagnostic": {
            "nGamesWithResolvedStable": len(fracs),
            "gamesAbove50": sum(1 for f in fracs if f > 0.5),
            "gamesExactly50": sum(1 for f in fracs if abs(f - 0.5) < 1e-12),
            "gamesBelow50": sum(1 for f in fracs if f < 0.5),
            "median": float(np.median(fracs)) if fracs else None,
            "acceptanceRule": False,
        },
        "incomparable": {
            "nPairs": len(incomp),
            "nResolvedNoDirection": sum(1 for r in incomp if r["score"] == "RESOLVED_NO_DIRECTION"),
            "nUnresolved": sum(1 for r in incomp if r["score"] == "NA"),
            "inventedDirection": False,
        },
        "minimumEvidence": {
            "usableGames": 40,
            "resolvedStable": 100,
            "met": len(usable_games) >= 40 and len(stable_res) >= 100,
        },
        "mechanismsOpened": False,
        "gameplaySummaryUsed": False,
        "lastAttemptOnThis51GameCorpus": True,
    }
    write = lambda p, o: p.write_text(json.dumps(o, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write(OUT / "pair-scores-v3.json", {"n": len(scored), "pairs": scored})
    write(OUT / "report.json", report)
    write(
        OUT / "IMMUTABLE.json",
        {
            "artifactType": "ExternalGameplayOutcomeAudit",
            "version": "external-gameplay-outcome-audit-v3",
            "label": "VIDEO_ASSISTED_ENDGAME",
            "status": "FROZEN",
            "call": call,
            "sourceFlag": source_flag,
            "nIdentityMapped": n_ident,
            "nUsableOutcomeGames": len(usable_games),
            "nResolvedStableDirection": len(stable_res),
            "directionalAccuracy": ci.get("point"),
            "ciLow": ci.get("ciLow"),
            "ciHigh": ci.get("ciHigh"),
            "predictionFreezeSha256": PRED_SHA,
            "parentV2XO4": "PERMANENTLY_FROZEN",
            "barsLowered": False,
            "lastAttemptOnThis51GameCorpus": True,
        },
    )
    print(
        json.dumps(
            {
                "call": call,
                "identityMapped": n_ident,
                "usable": len(usable_games),
                "kinds": dict(kinds),
                "resolvedStable": len(stable_res),
                "correct": report["nCorrect"],
                "incorrect": report["nIncorrect"],
                "ci": ci,
                "sourceFlag": source_flag,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

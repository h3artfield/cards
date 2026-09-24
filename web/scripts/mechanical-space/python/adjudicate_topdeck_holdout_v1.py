#!/usr/bin/env python3
"""
Track A reveal — join frozen predictions to winner_id for the 5000 holdout pods only.

No recomputation. No Track B merge.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from outcome_firewall_v1 import require_topdeck_holdout_winners_unlocked
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "topdeck-holdout-outcome-validation-v1"
N_BOOT = 10000
SEED = 0


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def winner_of(pod: dict) -> str | None:
    if pod.get("draw"):
        return None
    hid = pod.get("winnerPlayerIdHash")
    for p in pod.get("participants") or []:
        if hid and p.get("playerIdHash") == hid:
            return p.get("deckInstanceId")
        if p.get("winner"):
            return p.get("deckInstanceId")
    return None


def bootstrap_rate(groups: list[list[int]], n: int = N_BOOT, seed: int = SEED) -> dict:
    rng = np.random.default_rng(seed)
    if not groups:
        return {"nGroups": 0, "nObs": 0, "rate": None, "ci95": [None, None]}
    stats = []
    g = np.array(range(len(groups)))
    for _ in range(n):
        pick = rng.choice(g, size=len(g), replace=True)
        vals = [v for i in pick for v in groups[i]]
        stats.append(float(np.mean(vals)) if vals else float("nan"))
    arr = np.asarray(stats, dtype=float)
    arr = arr[~np.isnan(arr)]
    all_vals = [v for grp in groups for v in grp]
    return {
        "nGroups": len(groups),
        "nObs": len(all_vals),
        "rate": round(float(np.mean(all_vals)), 4) if all_vals else None,
        "ci95": [round(float(np.percentile(arr, 2.5)), 4), round(float(np.percentile(arr, 97.5)), 4)] if len(arr) else [None, None],
    }


def main() -> None:
    require_topdeck_holdout_winners_unlocked("holdout winner reveal")
    freeze = load_json(OUT / "PREDICTION_FROZEN.json")
    if freeze.get("TOPDECK_HOLDOUT_PREDICTIONS_FROZEN") is not True:
        raise SystemExit("predictions are not frozen")
    if freeze.get("winnersRevealed") is not False and load_json(OUT / "IMMUTABLE.json").get("winnersRevealed"):
        raise SystemExit("winners already revealed; do not rerun")
    pred = load_json(OUT / "holdout-predictions-v1.json")
    if pred.get("winnersRevealed") is not False:
        raise SystemExit("prediction artifact already has winners")
    if sha256_file(OUT / "holdout-predictions-v1.json") != freeze["checksums"]["predictionArtifact"]:
        raise SystemExit("prediction artifact checksum mismatch")

    wanted = {p["podId"]: p for p in pred["pods"]}
    winners = {}
    corrupt = []
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for pod in load_json(path):
            pid = pod.get("podId")
            if pid not in wanted or pid in winners:
                continue
            w = winner_of(pod)
            if not w or w not in set(wanted[pid]["deckInstanceIds"]):
                corrupt.append({"podId": pid, "reason": "winner_missing_or_not_seated"})
                continue
            winners[pid] = w
    missing = [pid for pid in pred["podIds"] if pid not in winners and pid not in {c["podId"] for c in corrupt}]
    for pid in missing:
        corrupt.append({"podId": pid, "reason": "pod_not_found_at_reveal"})

    profiles = {r["deckInstanceId"]: r for r in load_json(OUT / "holdout-profiles-v2.json")["profiles"]}
    sealed_cmd = set(load_json(OUT / "discovery-exclusions.json")["sealed60CommanderOracleIds_sensitivityOnly"])

    pair_groups = []
    pref_groups = []
    tertile_vals = []
    n_stable = 0
    n_nonstable = 0
    n_pref_unique = 0
    n_pref_hit = 0
    n_pref_abstain = 0
    n_coverage = 0
    join_rows = []
    for pid in pred["podIds"]:
        rec = wanted[pid]
        w = winners.get(pid)
        if not w:
            continue
        n_coverage += 1
        ids = rec["deckInstanceIds"]
        pair_hits = []
        mags = []
        for pr in rec["pairs"]:
            a, b = pr["a"], pr["b"]
            if w not in (a, b):
                continue
            if pr["relation"] != "STABLE_DIRECTION" or not pr.get("direction"):
                n_nonstable += 1
                continue
            n_stable += 1
            hit = 1 if pr["direction"]["from"] == w else 0
            pair_hits.append(hit)
            mags.append(abs(pr["M"]["conservative"]["M_hostile"]))
        if pair_hits:
            pair_groups.append(pair_hits)
            tertile_vals.extend(zip(mags, pair_hits))
        if rec["preferenceStatus"] == "UNIQUE":
            n_pref_unique += 1
            hit = 1 if rec["predictedWinnerPreference"] == w else 0
            n_pref_hit += hit
            pref_groups.append([hit])
        else:
            n_pref_abstain += 1
        join_rows.append({"podId": pid, "winnerDeckInstanceId": w, "nStableVsPresent": len(pair_hits)})

    primary = bootstrap_rate(pair_groups)
    pod_acc = bootstrap_rate(pref_groups)
    tertiles = {"low": [], "mid": [], "high": []}
    if tertile_vals:
        cuts = np.quantile([m for m, _ in tertile_vals], [1 / 3, 2 / 3])
        for mag, hit in tertile_vals:
            bucket = "low" if mag <= cuts[0] else "high" if mag > cuts[1] else "mid"
            tertiles[bucket].append(hit)
    cal = {k: {"n": len(v), "rate": None if not v else round(float(np.mean(v)), 4)} for k, v in tertiles.items()}

    # Post-hoc commander-overlap sensitivity
    sens_groups = []
    n_sens_pods = 0
    for pid in pred["podIds"]:
        rec = wanted[pid]
        w = winners.get(pid)
        if not w:
            continue
        oids = []
        for did in rec["deckInstanceIds"]:
            oids.extend(profiles.get(did, {}).get("commanderOracleIds") or [])
        if sealed_cmd & set(oids):
            continue
        n_sens_pods += 1
        hits = []
        for pr in rec["pairs"]:
            if w not in (pr["a"], pr["b"]):
                continue
            if pr["relation"] != "STABLE_DIRECTION" or not pr.get("direction"):
                continue
            hits.append(1 if pr["direction"]["from"] == w else 0)
        if hits:
            sens_groups.append(hits)
    sensitivity = bootstrap_rate(sens_groups)

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lineage": "HELD_OUT_OUTCOME_BLIND_TOPDECK_VALIDATION",
        "not": "FULL_EXTERNAL_STRATEGIC_VALIDATION",
        "status": "REPORT_AND_WAIT",
        "mergedWithTrackB": False,
        "predictionFreezeSha256": freeze["predictionFreezeSha256"],
        "nHoldoutPods": 5000,
        "nPodsWithJoinedWinner": n_coverage,
        "nCorruptionExclusions": len(corrupt),
        "corruption": corrupt,
        "PRIMARY_PREDECLARED_RESULT": {
            "id": "winner_vs_present_stable_concordance",
            "baseline": 0.5,
            **primary,
            "nStableWinnerVsPresentPairs": n_stable,
            "nWinnerVsPresentPairsNotStable": n_nonstable,
        },
        "PREDECLARED_SECONDARY": {
            "pod_unique_preference_accuracy": {
                "baseline": 0.25,
                "nUniquePreference": n_pref_unique,
                "nAbstain": n_pref_abstain,
                **pod_acc,
            },
            "stable_concordance_by_abs_M_tertile": cal,
        },
        "POST_HOC_SENSITIVITY_ANALYSIS": {
            "exclude_sealed60_commander_identities": {
                "nPodsRemaining": n_sens_pods,
                **sensitivity,
                "doesNotReplacePrimary": True,
            }
        },
        "note": "Predictions were frozen before reveal. No recomputation. Not RPS.",
    }
    write_json(OUT / "winner-join-v1.json", {"n": len(join_rows), "nCorruption": len(corrupt), "rows": join_rows, "corruption": corrupt})
    write_json(OUT / "track-a-report.json", report)
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "status": "TRACK_A_REPORTED",
            "TOPDECK_HOLDOUT_PREDICTIONS_FROZEN": True,
            "winnersRevealed": True,
            "predictionFreezeSha256": freeze["predictionFreezeSha256"],
            "mergedWithTrackB": False,
        },
    )
    print(json.dumps({
        "coverage": n_coverage,
        "primary": report["PRIMARY_PREDECLARED_RESULT"],
        "podPref": report["PREDECLARED_SECONDARY"]["pod_unique_preference_accuracy"],
        "sensitivity": report["POST_HOC_SENSITIVITY_ANALYSIS"],
        "corrupt": len(corrupt),
    }, indent=2))


if __name__ == "__main__":
    main()

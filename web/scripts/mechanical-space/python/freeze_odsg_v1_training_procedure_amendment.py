#!/usr/bin/env python3
"""
TRAINING_PROCEDURE_AMENDMENT_V1

Pre-outcome procedural correction only.
Does not overwrite the representation/architecture freeze.
Does not unlock winners. Does not train.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
PARENT = MS / "outcome-derived-strategic-geometry-v1"
OUT = PARENT / "training-procedure-amendment-v1"
PROTOCOL_SHA = "74b651a70a0860d9d4ffa3db2bb82310fdad4d14dc1995c60530e3654350a195"
ELIGIBLE_SHA = "c358398b47a6e49bf45936c9a89668926e220084e8d541b5fb87b821d91721e1"
FORCED_FIT = "cardart-monthly-underground-sea"
HASH_PREFIX = "ODSG_V1_DEV_INTERNAL:"
EARLY_FRAC = 0.15


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def sha256_obj(obj) -> str:
    return sha256_bytes(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8"))


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def event_key(tid: str) -> tuple[str, str]:
    return sha256_bytes(f"{HASH_PREFIX}{tid}".encode("utf-8")), tid


def assign_dev_internal(dev_events: list[str]) -> dict:
    ranked = sorted(dev_events, key=event_key)
    n = len(ranked)
    n_early = max(1, int(round(EARLY_FRAC * n)))
    n_fit = n - n_early
    fit = ranked[:n_fit]
    early = ranked[n_fit:]
    swapped = None
    if FORCED_FIT not in set(dev_events):
        raise SystemExit(f"forced FIT event missing from DEVELOPMENT: {FORCED_FIT}")
    if FORCED_FIT in early:
        boundary = fit[-1]
        fit = fit[:-1] + [FORCED_FIT]
        early = [boundary] + [t for t in early if t != FORCED_FIT]
        swapped = {"forcedToFit": FORCED_FIT, "swappedToEarlyStop": boundary}
    if FORCED_FIT in early:
        raise SystemExit("forced event remained in DEVELOPMENT_EARLY_STOP")
    if len(fit) != n_fit or len(early) != n_early:
        raise SystemExit("internal split sizes drifted after forced assignment")
    if set(fit) & set(early):
        raise SystemExit("event appears in both internal partitions")
    if set(fit) | set(early) != set(dev_events):
        raise SystemExit("internal split does not cover DEVELOPMENT")
    return {
        "nDevelopmentEvents": n,
        "nFitEventsTarget": n_fit,
        "nEarlyStopEventsTarget": n_early,
        "fitEvents": sorted(fit),
        "earlyStopEvents": sorted(early),
        "hashRankedOrder": ranked,
        "forcedFitEvent": FORCED_FIT,
        "swap": swapped,
    }


def main() -> dict:
    if sha256_file(PARENT / "PROTOCOL.json") != PROTOCOL_SHA:
        raise SystemExit("PROTOCOL.json sha changed")
    if sha256_file(PARENT / "eligible-pods.json") != ELIGIBLE_SHA:
        raise SystemExit("eligible-pods.json sha changed")
    pods = load_json(PARENT / "eligible-pods.json")["pods"]
    split = load_json(PARENT / "split-manifest.json")
    dev_events = list(split["events"]["DEVELOPMENT"])
    assigned = assign_dev_internal(dev_events)
    fit_set = set(assigned["fitEvents"])
    early_set = set(assigned["earlyStopEvents"])
    fit_pods = [p["podId"] for p in pods if p["partition"] == "DEVELOPMENT" and p["tid"] in fit_set]
    early_pods = [p["podId"] for p in pods if p["partition"] == "DEVELOPMENT" and p["tid"] in early_set]
    if len(fit_pods) + len(early_pods) != 28122:
        raise SystemExit("internal split does not cover all DEVELOPMENT pods")

    amendment = {
        "artifactType": "TRAINING_PROCEDURE_AMENDMENT_V1",
        "status": "FROZEN",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "doesNotOverwriteArchitectureFreeze": True,
        "PRE_OUTCOME_PROCEDURAL_CORRECTION": (
            "validation outcomes cannot be used for Stage-A early stopping before validation unlock"
        ),
        "supersedes": {
            "artifact": "representation-architecture-freeze-v1/search-space.json earlyStopping.monitor",
            "was": "VALIDATION pod log loss",
            "now": "DEVELOPMENT_EARLY_STOP pod log loss during candidate training",
        },
        "protocolSha256": PROTOCOL_SHA,
        "winnersOpened": False,
        "trainingExecuted": False,
    }
    objective = {
        "loss": "mean four-player pod multiclass negative log likelihood / cross entropy",
        "target": "observed winner as the single target class",
        "equalPodWeight": True,
        "forbiddenWeighting": [
            "class weighting",
            "event weighting",
            "commander weighting",
            "list-frequency weighting",
            "player weighting",
        ],
        "model2InteractionRegularizer": "lambda_I * (||A||_F^2 + ||B||_F^2)",
        "lambda_I": [1e-5, 1e-4, 1e-3, 1e-2],
        "optimizerWeightDecay": "already-frozen AdamW common weight decay on all parameters",
        "optimizer": {"name": "AdamW", "betas": [0.9, 0.999], "eps": 1e-8},
    }
    ties = {
        "writtenBeforeValidationMetrics": True,
        "model1": {
            "primary": "minimum VALIDATION pod log loss",
            "tieBreakers": [
                "lower weight_decay index in frozen search ordering [1e-5, 1e-4, 1e-3]",
                "lower learning_rate index in frozen search ordering [1e-4, 3e-4, 1e-3]",
            ],
        },
        "model2": {
            "primary": "minimum VALIDATION pod log loss",
            "tieBreakers": [
                "lower interaction_rank index in frozen search ordering [2, 4, 8, 16, 32]",
                "lower lambda_I index in frozen search ordering [1e-5, 1e-4, 1e-3, 1e-2]",
            ],
        },
        "finalRefit": {
            "data": "DEVELOPMENT + VALIDATION",
            "earlyStop": False,
            "epochs": "exactly the selected configuration best_epoch from DEVELOPMENT_FIT → DEVELOPMENT_EARLY_STOP",
            "initialization": "fresh frozen seed",
        },
    }
    internal = {
        "doesNotAlterOuterSplit": True,
        "unit": "tid",
        "hash": f"sha256({HASH_PREFIX}<tid>)",
        "targetFractions": {"DEVELOPMENT_FIT": 0.85, "DEVELOPMENT_EARLY_STOP": 0.15},
        "nFitEvents": len(assigned["fitEvents"]),
        "nEarlyStopEvents": len(assigned["earlyStopEvents"]),
        "nFitPods": len(fit_pods),
        "nEarlyStopPods": len(early_pods),
        "forcedFitEvent": FORCED_FIT,
        "forcedFitIsInFit": FORCED_FIT in fit_set,
        "swap": assigned["swap"],
        "fitEvents": assigned["fitEvents"],
        "earlyStopEvents": assigned["earlyStopEvents"],
        "fitPodIds": fit_pods,
        "earlyStopPodIds": early_pods,
    }
    write_json(OUT / "TRAINING_PROCEDURE_AMENDMENT_V1.json", amendment)
    write_json(OUT / "training-objective.json", objective)
    write_json(OUT / "selection-tie-rules.json", ties)
    write_json(OUT / "development-internal-split.json", internal)
    checks = {
        "protocolProvenance": PROTOCOL_SHA,
        "eligiblePodsProvenance": ELIGIBLE_SHA,
        "amendment": sha256_file(OUT / "TRAINING_PROCEDURE_AMENDMENT_V1.json"),
        "objective": sha256_file(OUT / "training-objective.json"),
        "tieRules": sha256_file(OUT / "selection-tie-rules.json"),
        "internalSplit": sha256_file(OUT / "development-internal-split.json"),
        "internalSplitContent": sha256_obj(
            {
                "fitEvents": assigned["fitEvents"],
                "earlyStopEvents": assigned["earlyStopEvents"],
                "fitPodIds": fit_pods,
                "earlyStopPodIds": early_pods,
            }
        ),
    }
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "status": "TRAINING_PROCEDURE_AMENDMENT_V1_FROZEN",
            "winnersOpened": False,
            "trainingExecuted": False,
            "amendmentSha256": checks["amendment"],
            "internalSplitSha256": checks["internalSplit"],
        },
    )
    print(
        json.dumps(
            {
                "nFitEvents": internal["nFitEvents"],
                "nEarlyStopEvents": internal["nEarlyStopEvents"],
                "nFitPods": internal["nFitPods"],
                "nEarlyStopPods": internal["nEarlyStopPods"],
                "forcedFitIsInFit": True,
                "amendmentSha256": checks["amendment"],
            },
            indent=2,
        )
    )
    return {
        "fitPodIds": fit_pods,
        "earlyStopPodIds": early_pods,
        "checksums": checks,
        "nFitEvents": internal["nFitEvents"],
        "nEarlyStopEvents": internal["nEarlyStopEvents"],
        "nFitPods": internal["nFitPods"],
        "nEarlyStopPods": internal["nEarlyStopPods"],
        "amendmentSha256": checks["amendment"],
    }


if __name__ == "__main__":
    main()

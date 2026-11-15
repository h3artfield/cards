#!/usr/bin/env python3
"""
Select a winner-masked TopDeck holdout.

Does not retain who won. Does not run Profiles / K / Pressure.
Does not reopen External Strategic Validity Audit v1.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from outcome_firewall_v1 import assert_topdeck_holdout_winners_locked
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
CEX2 = MS / "corpus-expansion-v2"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "topdeck-holdout-outcome-validation-v1"
ARCH = MS / "two-track-validation-architecture-v1"
TARGET = 5000


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def usable(deck: dict) -> bool:
    if (deck.get("commanderResolutionStatus") or "") != "resolved":
        return False
    main = deck.get("mainboard") or []
    if len(main) < 80:
        return False
    resolved = sum(1 for c in main if c.get("oracleId"))
    return resolved >= 70


def winner_field_present(pod: dict) -> bool:
    if pod.get("draw"):
        return False
    if pod.get("winnerPlayerIdHash"):
        return True
    return sum(1 for p in pod.get("participants") or [] if p.get("winner")) == 1


def main() -> None:
    assert_topdeck_holdout_winners_locked()
    if load_json(ARCH / "architecture.json").get("status") != "FROZEN":
        raise SystemExit("two-track architecture must be frozen first")
    if load_json(OUT / "analysis-spec.json").get("status") != "FROZEN_BEFORE_WINNER_REVEAL":
        raise SystemExit("holdout spec must be frozen first")

    sealed = load_json(CEX2 / "source-decks-60.json")
    sealed_ids = {str(d.get("deckInstanceId") or "") for d in sealed if d.get("deckInstanceId")}
    sealed_tids = {did.rsplit(":", 1)[0] for did in sealed_ids if ":" in did}
    sealed_cmd = set()
    for d in sealed:
        for oid in d.get("commanderOracleIds") or []:
            sealed_cmd.add(oid)

    usable_of: dict[str, bool] = {}
    n_decks = 0
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        print(f"  decks {path.parent.name}", flush=True)
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if not did:
                continue
            n_decks += 1
            usable_of[did] = usable(deck)

    funnel = {
        "nPodsScanned": 0,
        "nCompletedFourPlayer": 0,
        "nWinnerFieldPresent": 0,
        "nExcludedDiscoveryList": 0,
        "nExcludedDiscoveryEvent": 0,
        "nMissingUsableLists": 0,
        "nEligible": 0,
    }
    eligible = []
    seen = set()
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        print(f"  pods {path.parent.name}", flush=True)
        for pod in load_json(path):
            funnel["nPodsScanned"] += 1
            pid = str(pod.get("podId") or "")
            if not pid or pid in seen:
                continue
            if int(pod.get("podSize") or 0) != 4:
                continue
            if (pod.get("status") or "") != "Completed":
                continue
            parts = pod.get("participants") or []
            ids = [str(p.get("deckInstanceId") or "") for p in parts]
            if len(ids) != 4 or any(not x for x in ids) or len(set(ids)) != 4:
                continue
            funnel["nCompletedFourPlayer"] += 1
            if not winner_field_present(pod):
                continue
            funnel["nWinnerFieldPresent"] += 1
            if any(x in sealed_ids for x in ids):
                funnel["nExcludedDiscoveryList"] += 1
                continue
            tid = str(pod.get("tid") or "")
            if tid in sealed_tids:
                funnel["nExcludedDiscoveryEvent"] += 1
                continue
            if not all(usable_of.get(x) for x in ids):
                funnel["nMissingUsableLists"] += 1
                continue
            seen.add(pid)
            funnel["nEligible"] += 1
            eligible.append(
                {
                    "podId": pid,
                    "tid": tid,
                    "round": pod.get("round"),
                    "table": pod.get("table"),
                    "deckInstanceIds": ids,
                    "winner_field_present": True,
                    "draw": False,
                    "winnerIdentityRetained": False,
                }
            )

    eligible.sort(key=lambda r: (str(r["tid"]), str(r["round"]), str(r["table"]), r["podId"]))
    holdout = eligible[:TARGET]
    write_json(
        OUT / "discovery-exclusions.json",
        {
            "nSealed60ExactLists": len(sealed_ids),
            "nSealed60Events": len(sealed_tids),
            "sealed60DeckInstanceIds": sorted(sealed_ids),
            "sealed60EventTids": sorted(sealed_tids),
            "sealed60CommanderOracleIds_sensitivityOnly": sorted(sealed_cmd),
            "commanderIdentityUsedForPrimaryExclusion": False,
        },
    )
    write_json(
        OUT / "holdout-pods.json",
        {
            "n": len(holdout),
            "target": TARGET,
            "winnerIdentityRetained": False,
            "selectionOrder": "(tid, round, table, podId)",
            "pods": holdout,
        },
    )
    n_unique = len({d for p in holdout for d in p["deckInstanceIds"]})
    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "HOLDOUT_FROZEN_WINNERS_MASKED",
        "call": "HOLD_THEN_PREDICT",
        "scientificLabel": "held-out outcome-blind TopDeck validation",
        "nDecksIndexed": n_decks,
        "funnel": funnel,
        "nHoldoutPods": len(holdout),
        "nUniqueHoldoutLists": n_unique,
        "nPotentialWinnerVsPresent": len(holdout) * 3,
        "winnerIdentityRetained": False,
        "predictionsRun": False,
        "winnersRevealed": False,
        "notes": [
            "External Strategic Validity Audit v1 remains EV4 and is not reopened.",
            "Commander identity exclusion was not applied to the primary holdout.",
            "Do not reveal winner_id until same-pod predictions are frozen.",
        ],
    }
    write_json(OUT / "holdout-report.json", report)
    checks = {
        "architecture": sha256_bytes((ARCH / "architecture.json").read_bytes()),
        "analysisSpec": sha256_bytes((OUT / "analysis-spec.json").read_bytes()),
        "exclusions": sha256_bytes((OUT / "discovery-exclusions.json").read_bytes()),
        "holdout": sha256_bytes((OUT / "holdout-pods.json").read_bytes()),
        "report": sha256_bytes((OUT / "holdout-report.json").read_bytes()),
    }
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "status": "HOLDOUT_FROZEN_WINNERS_MASKED",
            "nHoldoutPods": len(holdout),
            "winnerIdentityRetained": False,
            "predictionsRun": False,
        },
    )
    print(json.dumps({k: report[k] for k in ("call", "nHoldoutPods", "nUniqueHoldoutLists", "funnel")}, indent=2))


if __name__ == "__main__":
    main()

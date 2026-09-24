#!/usr/bin/env python3
"""
OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1 — dataset/protocol freeze.

Does not train. Does not retain winner identity.
Does not use Pressure / K / Profiles.
Excludes the spent 5,000-pod TopDeck holdout and sealed-60 lists/events.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

from outcome_firewall_v1 import assert_odsg_v1_training_locked
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
CEX2 = MS / "corpus-expansion-v2"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
OUT = MS / "outcome-derived-strategic-geometry-v1"

DEV_FRAC = 0.70
VAL_FRAC = 0.15
FINAL_FRAC = 0.15


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


def assign_clean_dated(n: int) -> tuple[int, int, int]:
    n_final = max(1, int(round(FINAL_FRAC * n)))
    n_val = max(1, int(round(VAL_FRAC * n)))
    n_dev = n - n_val - n_final
    if n_dev < 1:
        n_dev = max(1, n - 2)
        n_val = 1 if n >= 2 else 0
        n_final = n - n_dev - n_val
    return n_dev, n_val, n_final


def main() -> None:
    assert_odsg_v1_training_locked()
    protocol = load_json(OUT / "PROTOCOL.json")
    if protocol.get("status") != "FROZEN":
        raise SystemExit("PROTOCOL.json must be FROZEN before selection")
    if protocol.get("trainingAuthorized") is not False:
        raise SystemExit("trainingAuthorized must be false")

    sealed = load_json(CEX2 / "source-decks-60.json")
    sealed_ids = {str(d.get("deckInstanceId") or "") for d in sealed if d.get("deckInstanceId")}
    sealed_tids = {did.rsplit(":", 1)[0] for did in sealed_ids if ":" in did}

    holdout = load_json(HOLDOUT / "holdout-pods.json")
    spent_pod_ids = {str(p["podId"]) for p in holdout.get("pods") or []}
    spent_tids = {str(p.get("tid") or "") for p in holdout.get("pods") or []}
    spent_tids.discard("")

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
        "nEligibleSameFramework": 0,
        "nExcludedSpentHoldoutPod": 0,
        "nRemainingEligible": 0,
    }
    remaining = []
    seen = set()
    event_dates: dict[str, set[str]] = defaultdict(set)

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
            funnel["nEligibleSameFramework"] += 1
            if pid in spent_pod_ids:
                funnel["nExcludedSpentHoldoutPod"] += 1
                continue
            date = pod.get("tournamentDate")
            if isinstance(date, str) and date.strip():
                event_dates[tid].add(date.strip())
            remaining.append(
                {
                    "podId": pid,
                    "tid": tid,
                    "round": pod.get("round"),
                    "table": pod.get("table"),
                    "deckInstanceIds": ids,
                    "tournamentDate": date if isinstance(date, str) else None,
                    "winnerIdentityRetained": False,
                }
            )

    funnel["nRemainingEligible"] = len(remaining)

    event_info: dict[str, dict] = {}
    for row in remaining:
        tid = row["tid"]
        info = event_info.setdefault(
            tid,
            {
                "tid": tid,
                "dates": sorted(event_dates.get(tid, [])),
                "eventDate": min(event_dates[tid]) if event_dates.get(tid) else None,
                "nPods": 0,
                "contributedSpentHoldoutPod": tid in spent_tids,
            },
        )
        info["nPods"] += 1

    dated_clean = []
    forced_dev = []
    date_conflicts = []
    for info in event_info.values():
        if len(info["dates"]) > 1:
            date_conflicts.append({"tid": info["tid"], "dates": info["dates"]})
        if info["contributedSpentHoldoutPod"] or info["eventDate"] is None:
            forced_dev.append(info)
        else:
            dated_clean.append(info)

    dated_clean.sort(key=lambda e: (e["eventDate"], e["tid"]))
    n_clean = len(dated_clean)
    if n_clean < 3:
        raise SystemExit(f"not enough clean dated events for a 3-way split: {n_clean}")
    n_dev, n_val, n_final = assign_clean_dated(n_clean)
    partition_of: dict[str, str] = {}
    for ev in forced_dev:
        partition_of[ev["tid"]] = "DEVELOPMENT"
    for ev in dated_clean[:n_dev]:
        partition_of[ev["tid"]] = "DEVELOPMENT"
    for ev in dated_clean[n_dev : n_dev + n_val]:
        partition_of[ev["tid"]] = "VALIDATION"
    for ev in dated_clean[n_dev + n_val :]:
        partition_of[ev["tid"]] = "FINAL_TEST"

    for row in remaining:
        row["partition"] = partition_of[row["tid"]]

    remaining.sort(key=lambda r: (r["partition"], str(r.get("tournamentDate") or ""), r["tid"], str(r["round"]), str(r["table"]), r["podId"]))

    counts = {"DEVELOPMENT": 0, "VALIDATION": 0, "FINAL_TEST": 0}
    events_by = {"DEVELOPMENT": set(), "VALIDATION": set(), "FINAL_TEST": set()}
    lists_by = {"DEVELOPMENT": set(), "VALIDATION": set(), "FINAL_TEST": set()}
    all_lists = set()
    for row in remaining:
        p = row["partition"]
        counts[p] += 1
        events_by[p].add(row["tid"])
        for did in row["deckInstanceIds"]:
            lists_by[p].add(did)
            all_lists.add(did)

    leak = {
        "spentPodsInRemaining": sorted(spent_pod_ids & {r["podId"] for r in remaining}),
        "sealedEventInRemaining": sorted(sealed_tids & {r["tid"] for r in remaining}),
        "eventsInMultiplePartitions": [],
        "finalTestEventsWithSpentHoldoutOverlap": sorted(
            tid for tid in events_by["FINAL_TEST"] if tid in spent_tids
        ),
        "validationEventsWithSpentHoldoutOverlap": sorted(
            tid for tid in events_by["VALIDATION"] if tid in spent_tids
        ),
        "winnerFieldsPresentInManifest": False,
    }
    seen_part: dict[str, str] = {}
    for tid, part in partition_of.items():
        if tid in seen_part and seen_part[tid] != part:
            leak["eventsInMultiplePartitions"].append(tid)
        seen_part[tid] = part

    write_json(
        OUT / "spent-exclusions.json",
        {
            "nSpentHoldoutPods": len(spent_pod_ids),
            "nSpentHoldoutEvents": len(spent_tids),
            "nSealed60Lists": len(sealed_ids),
            "nSealed60Events": len(sealed_tids),
            "spentHoldoutPodIds": sorted(spent_pod_ids),
            "sealed60EventTids": sorted(sealed_tids),
        },
    )
    write_json(
        OUT / "event-date-audit.json",
        {
            "nEventsRemaining": len(event_info),
            "nEventsWithDate": sum(1 for e in event_info.values() if e["eventDate"]),
            "nEventsUnknownDate": sum(1 for e in event_info.values() if not e["eventDate"]),
            "nEventsWithDateConflict": len(date_conflicts),
            "dateConflicts": date_conflicts[:50],
            "nForcedDevelopmentOverlapOrUndated": len(forced_dev),
            "nCleanDatedEvents": n_clean,
            "cleanDatedSplit": {"DEVELOPMENT": n_dev, "VALIDATION": n_val, "FINAL_TEST": n_final},
            "minCleanDate": dated_clean[0]["eventDate"] if dated_clean else None,
            "maxCleanDate": dated_clean[-1]["eventDate"] if dated_clean else None,
            "validationDateRange": [dated_clean[n_dev]["eventDate"], dated_clean[n_dev + n_val - 1]["eventDate"]]
            if n_val
            else None,
            "finalTestDateRange": [dated_clean[n_dev + n_val]["eventDate"], dated_clean[-1]["eventDate"]]
            if n_final
            else None,
        },
    )
    write_json(
        OUT / "split-manifest.json",
        {
            "unit": "tid",
            "nEvents": {k: len(v) for k, v in events_by.items()},
            "nPods": counts,
            "events": {k: sorted(v) for k, v in events_by.items()},
        },
    )
    write_json(
        OUT / "eligible-pods.json",
        {
            "n": len(remaining),
            "winnerIdentityRetained": False,
            "pods": remaining,
        },
    )
    write_json(OUT / "eligibility-funnel.json", {"nDecksIndexed": n_decks, "funnel": funnel})
    write_json(OUT / "leakage-audit.json", leak)

    leak_pass = (
        len(leak["spentPodsInRemaining"]) == 0
        and len(leak["sealedEventInRemaining"]) == 0
        and len(leak["eventsInMultiplePartitions"]) == 0
        and len(leak["finalTestEventsWithSpentHoldoutOverlap"]) == 0
        and len(leak["validationEventsWithSpentHoldoutOverlap"]) == 0
    )

    report = {
        "artifactType": "OutcomeDerivedStrategicGeometryDatasetProtocolFreeze",
        "version": "outcome-derived-strategic-geometry-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "DATASET_PROTOCOL_FROZEN_WINNERS_MASKED",
        "trainingAuthorized": False,
        "nRemainingEligiblePods": len(remaining),
        "nUniqueEvents": len(event_info),
        "nUniqueExactLists": len(all_lists),
        "partitionPods": counts,
        "partitionEvents": {k: len(v) for k, v in events_by.items()},
        "partitionUniqueLists": {k: len(v) for k, v in lists_by.items()},
        "funnel": funnel,
        "leakagePass": leak_pass,
        "winnerIdentityRetained": False,
        "doNotTrainYet": True,
        "notes": [
            "Profiles/K/Pressure lineage remains permanently frozen and is not used.",
            "Spent 5,000 holdout pods excluded.",
            "FINAL_TEST winners stay masked until a later model freeze + prediction freeze.",
            "Cycle geometry audit is not authorized until SG1.",
        ],
    }
    write_json(OUT / "REPORT.json", report)

    protocol_sha = sha256_bytes((OUT / "PROTOCOL.json").read_bytes())
    write_json(
        OUT / "PROTOCOL_FROZEN.json",
        {
            "status": "FROZEN",
            "protocolSha256": protocol_sha,
            "representationSpecSha256": sha256_bytes((OUT / "representation-spec.json").read_bytes()),
            "modelSpecSha256": sha256_bytes((OUT / "model-spec.json").read_bytes()),
            "trainingAuthorized": False,
        },
    )

    checks = {
        "protocol": protocol_sha,
        "representation": sha256_bytes((OUT / "representation-spec.json").read_bytes()),
        "model": sha256_bytes((OUT / "model-spec.json").read_bytes()),
        "spentExclusions": sha256_bytes((OUT / "spent-exclusions.json").read_bytes()),
        "eventDateAudit": sha256_bytes((OUT / "event-date-audit.json").read_bytes()),
        "splitManifest": sha256_bytes((OUT / "split-manifest.json").read_bytes()),
        "eligiblePods": sha256_bytes((OUT / "eligible-pods.json").read_bytes()),
        "funnel": sha256_bytes((OUT / "eligibility-funnel.json").read_bytes()),
        "leakage": sha256_bytes((OUT / "leakage-audit.json").read_bytes()),
        "report": sha256_bytes((OUT / "REPORT.json").read_bytes()),
    }
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "status": "DATASET_PROTOCOL_FROZEN_WINNERS_MASKED",
            "trainingAuthorized": False,
            "winnerIdentityRetained": False,
            "nRemainingEligiblePods": len(remaining),
            "leakagePass": leak_pass,
            "doNotReopenPressureLineage": True,
        },
    )
    print(json.dumps({k: report[k] for k in (
        "status",
        "nRemainingEligiblePods",
        "nUniqueEvents",
        "nUniqueExactLists",
        "partitionPods",
        "partitionEvents",
        "leakagePass",
        "trainingAuthorized",
    )}, indent=2))


if __name__ == "__main__":
    main()

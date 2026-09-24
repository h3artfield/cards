#!/usr/bin/env python3
"""
Append newly ingested TopDeck events to the CMMG prospective test accumulator.

Outcome-blind. Uses the frozen spent-development ≥20 commander set.
Future appearances cannot promote a commander into primary eligibility.
Does not score C1/C2. Does not inspect I(c,d). Does not open winners.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from freeze_cmmg_v1_dataset_protocol import commander_identity, winner_field_present
from outcome_firewall_v1 import (
    CMMG_V1_C1_SHA256,
    CMMG_V1_C2_SHA256,
    assert_cmmg_v1_accumulation_authorized,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "commander-meta-matchup-geometry-v1"
ACC = OUT / "prospective-test-accumulator-v1"
FROZEN_SET = OUT / "PRIMARY_ELIGIBLE_COMMANDER_SET_FROZEN.json"
LEGACY = OUT / "LEGACY_BLINDED_RESERVE_V1.json"
MIN_PRIMARY = 2000
MIN_EVENTS = 100
FORBIDDEN_WINNER_KEYS = (
    "winner",
    "winner_id",
    "winnerId",
    "winnerPlayerIdHash",
    "winnerDeckInstanceId",
    "winnerSeat",
    "placement",
    "standings",
    "finalStanding",
)


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_no_winner_payload(row: dict, where: str) -> None:
    for k in FORBIDDEN_WINNER_KEYS:
        if k in row and k != "winnerFieldPresent":
            raise SystemExit(f"winner identity leaked into {where}: {k}")


def main() -> None:
    assert_cmmg_v1_accumulation_authorized()
    if not FROZEN_SET.exists():
        raise SystemExit("PRIMARY_ELIGIBLE_COMMANDER_SET_FROZEN.json is required")
    frozen = load_json(FROZEN_SET)
    if frozen.get("futureAppearancesCannotPromote") is not True:
        raise SystemExit("frozen commander set must forbid future promotion")
    if frozen.get("C1_SHA256") != CMMG_V1_C1_SHA256 or frozen.get("C2_SHA256") != CMMG_V1_C2_SHA256:
        raise SystemExit("frozen commander set checksums do not match locked models")
    eligible = set(frozen["commanderIdentities"])
    if len(eligible) != 368:
        raise SystemExit(f"frozen ≥20 set is {len(eligible)}, expected 368")

    acc = load_json(ACC / "ACCUMULATOR.json")
    excluded = set(acc["excludedCurrentSnapshotEventTids"])
    existing = {r["podId"] for r in acc.get("pods") or []}
    legacy = load_json(LEGACY)
    if int(legacy["nPods"]) != 354 or int(legacy["nEvents"]) != 85:
        raise SystemExit("legacy reserve counts must stay 354 / 85")
    if legacy.get("winnerIdentityRetained") is not False:
        raise SystemExit("legacy reserve winners must stay unopened")
    if int(legacy.get("nPrimaryEligibleExposure20") or 0) != 113:
        raise SystemExit("legacy primary-eligible count must stay 113")

    cmd_of: dict[str, str | None] = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did and (deck.get("commanderResolutionStatus") or "") == "resolved":
                cmd_of[did] = commander_identity(list(deck.get("commanderOracleIds") or []))

    added = []
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        provenance = path.parent.name
        for pod in load_json(path):
            tid = str(pod.get("tid") or "")
            if not tid or tid in excluded:
                continue
            pid = str(pod.get("podId") or "")
            if not pid or pid in existing:
                continue
            if int(pod.get("podSize") or 0) != 4 or (pod.get("status") or "") != "Completed":
                continue
            parts = pod.get("participants") or []
            ids = [str(p.get("deckInstanceId") or "") for p in parts]
            if len(ids) != 4 or any(not x for x in ids) or len(set(ids)) != 4:
                continue
            present = bool(winner_field_present(pod))
            if not present:
                continue
            idents = [cmd_of.get(d) for d in ids]
            if any(not x for x in idents):
                continue
            date = pod.get("tournamentDate") if isinstance(pod.get("tournamentDate"), str) else None
            row = {
                "podId": pid,
                "tid": tid,
                "tournamentDate": date.strip() if isinstance(date, str) and date.strip() else None,
                "commanderIdentities": idents,
                "primaryEligibleExposure20": all(c in eligible for c in idents),
                "winnerFieldPresent": True,
                "winnerIdentityRetained": False,
                "provenanceImportRun": provenance,
            }
            assert_no_winner_payload(row, "accumulator row")
            added.append(row)

    added.sort(key=lambda r: (r["tid"], r["podId"]))
    pods = list(acc.get("pods") or []) + added
    events = sorted({r["tid"] for r in pods})
    primary_n = sum(1 for r in pods if r.get("primaryEligibleExposure20"))
    dates = [r["tournamentDate"] for r in pods if r.get("tournamentDate")]
    sealed_primary = 113 + primary_n
    sealed_events = 85 + len(events)
    gate = sealed_primary >= MIN_PRIMARY and sealed_events >= MIN_EVENTS
    acc.update(
        {
            "artifactType": "COMMANDER_META_PROSPECTIVE_TEST_ACCUMULATOR_V1",
            "status": "GATE_REACHED_STOP" if gate else ("ACCUMULATING" if pods else "AWAITING_FUTURE_INGEST"),
            "COMMANDER_META_MODELS_FROZEN": True,
            "C1_SHA256": CMMG_V1_C1_SHA256,
            "C2_SHA256": CMMG_V1_C2_SHA256,
            "primaryEligibleSetSha256": frozen["setSha256"],
            "futureAppearancesCannotPromote": True,
            "nAccumulatedFutureEvents": len(events),
            "nAccumulatedFuturePods": len(pods),
            "nPrimaryEligibleAccumulated": primary_n,
            "legacyReservePrimaryEligiblePods": 113,
            "legacyReserveEvents": 85,
            "legacyReservePods": 354,
            "combinedSealedPrimaryEligiblePods": sealed_primary,
            "combinedSealedEvents": sealed_events,
            "firstProspectiveEventDate": min(dates) if dates else None,
            "lastProspectiveEventDate": max(dates) if dates else None,
            "gateReached": gate,
            "confirmatoryRevealGate": {
                "minPrimaryEligiblePods": MIN_PRIMARY,
                "minUntouchedEvents": MIN_EVENTS,
                "doNotLowerLater": True,
            },
            "winnersOpened": False,
            "modelsScored": False,
            "interactionGeometryInspected": False,
            "pods": pods,
            "lastAddedPodIds": [r["podId"] for r in added],
            "lastAddedEventTids": sorted({r["tid"] for r in added}),
        }
    )
    write_json(ACC / "ACCUMULATOR.json", acc)
    checksum = sha256_file(ACC / "ACCUMULATOR.json")
    report = {
        "addedFuturePods": len(added),
        "addedFutureEvents": len({r["tid"] for r in added}),
        "nAccumulatedFuturePods": len(pods),
        "nAccumulatedFutureEvents": len(events),
        "legacyReservePods": 354,
        "legacyReserveEvents": 85,
        "legacyPrimaryEligiblePods": 113,
        "combinedSealedPrimaryEligiblePods": sealed_primary,
        "combinedSealedEvents": sealed_events,
        "gate": f"{sealed_primary} / {MIN_PRIMARY} primary-eligible pods; {sealed_events} / {MIN_EVENTS} events",
        "gateReached": gate,
        "firstProspectiveEventDate": acc["firstProspectiveEventDate"],
        "lastProspectiveEventDate": acc["lastProspectiveEventDate"],
        "accumulatorSha256": checksum,
        "primaryEligibleSetSha256": frozen["setSha256"],
        "LEGACY_RESERVE_WINNERS_OPENED": "NO",
        "FUTURE_WINNERS_OPENED": "NO",
        "C1_C2_SCORED": "NO",
        "C2_GEOMETRY_INSPECTED": "NO",
        "COMMANDER_META_MODELS_FROZEN": True,
    }
    write_json(ACC / "LAST_RUN.json", report)
    if gate:
        write_json(ACC / "GATE_REACHED.json", {**report, "stop": True, "doNotReveal": True, "await": "separate prediction-freeze authorization"})
        print("GATE REACHED — STOP. Do not reveal. Await prediction-freeze authorization.")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

"""Partition-gated ODSG v1 winner loading. FINAL_TEST stays sealed."""

from __future__ import annotations

from pathlib import Path

import outcome_firewall_v1 as fw
from outcome_firewall_v1 import (
    OutcomeFirewallError,
    refuse_final_test_winner_load,
    require_odsg_v1_dev_winners_unlocked,
    require_odsg_v1_val_winners_unlocked,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"


def winner_deck_instance_id(pod: dict) -> str | None:
    if pod.get("draw"):
        return None
    hid = pod.get("winnerPlayerIdHash")
    for p in pod.get("participants") or []:
        if hid and p.get("playerIdHash") == hid:
            return p.get("deckInstanceId")
        if p.get("winner"):
            return p.get("deckInstanceId")
    return None


def assert_partition_unlocked(partition: str) -> None:
    if partition == "FINAL_TEST":
        refuse_final_test_winner_load(partition)
        if not fw.ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
            raise OutcomeFirewallError("FINAL_TEST winner unlock is not authorized")
        if not fw.ODSG_V1_FINAL_PREDICTIONS_FROZEN:
            raise OutcomeFirewallError("FINAL_TEST winners require frozen predictions")
    elif partition == "DEVELOPMENT":
        require_odsg_v1_dev_winners_unlocked("DEVELOPMENT winner load")
    elif partition == "VALIDATION":
        require_odsg_v1_val_winners_unlocked("VALIDATION winner load")
    else:
        raise OutcomeFirewallError(f"unknown partition {partition}")


def load_winner_seats(eligible_pods: list[dict], partitions: set[str]) -> dict[str, int]:
    for part in partitions:
        assert_partition_unlocked(part)
    wanted = {p["podId"]: p for p in eligible_pods if p["partition"] in partitions}
    if "FINAL_TEST" not in partitions and any(p["partition"] == "FINAL_TEST" for p in wanted.values()):
        raise OutcomeFirewallError("FINAL_TEST pods leaked into winner load")
    seats: dict[str, int] = {}
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        print(f"  winners {path.parent.name}", flush=True)
        for raw in load_json(path):
            pid = str(raw.get("podId") or "")
            row = wanted.get(pid)
            if row is None:
                continue
            did = winner_deck_instance_id(raw)
            ids = row["deckInstanceIds"]
            if did not in ids:
                raise SystemExit(f"winner deck not in eligible seats: {pid}")
            seats[pid] = ids.index(did)
    missing = sorted(set(wanted) - set(seats))
    if missing:
        raise SystemExit(f"missing winners for {len(missing)} authorized pods")
    return seats

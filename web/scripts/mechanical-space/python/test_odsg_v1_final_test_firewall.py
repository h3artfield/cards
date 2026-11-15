#!/usr/bin/env python3
"""FINAL_TEST outcome firewall. Must fail if winners reach loader/features/train/predict."""

from __future__ import annotations

import outcome_firewall_v1 as fw
from odsg_v1_winners import load_winner_seats
from outcome_firewall_v1 import OutcomeFirewallError, assert_odsg_v1_final_test_outcomes_absent


def main() -> None:
    if fw.ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise SystemExit("FINAL_TEST winners must stay locked during this test")
    try:
        load_winner_seats(
            [{"podId": "x", "tid": "t", "partition": "FINAL_TEST", "deckInstanceIds": ["a", "b", "c", "d"]}],
            {"FINAL_TEST"},
        )
        raise SystemExit("FINAL_TEST winner load must fail")
    except OutcomeFirewallError:
        pass
    try:
        assert_odsg_v1_final_test_outcomes_absent({"podId": "p", "winner_id": "leak"}, "dataset_loader")
        raise SystemExit("dataset loader must reject winner_id")
    except OutcomeFirewallError:
        pass
    try:
        assert_odsg_v1_final_test_outcomes_absent({"x_D": [0], "winner": True}, "feature_builder")
        raise SystemExit("feature builder must reject winner")
    except OutcomeFirewallError:
        pass
    try:
        assert_odsg_v1_final_test_outcomes_absent({"batch": [{"winnerSeat": 1}]}, "training_loop")
        raise SystemExit("training loop must reject winnerSeat on FINAL_TEST objects")
    except OutcomeFirewallError:
        pass
    try:
        assert_odsg_v1_final_test_outcomes_absent(
            {"podId": "p", "pModel1": [0.25] * 4, "winnerPlayerIdHash": "x"},
            "prediction_writer",
        )
        raise SystemExit("prediction writer must reject winnerPlayerIdHash")
    except OutcomeFirewallError:
        pass
    assert_odsg_v1_final_test_outcomes_absent(
        {"podId": "p", "pModel1": [0.25] * 4, "pModel2": [0.25] * 4, "exactListHashes": ["a", "b", "c", "d"]}
    )
    print("ALL PASS — test_odsg_v1_final_test_firewall")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Patch Pressure v2 with net_sign_status and freeze. Does not recompute pressure."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from build_deck_pressure_v2 import net_sign_status

MS = Path(__file__).resolve().parents[3] / "data" / "milestones" / "mechanical-space"
OUT = MS / "deck-pressure-v2"


def main() -> None:
    slim = json.loads((OUT / "pairs-summary.json").read_text(encoding="utf-8"))
    counts = defaultdict(int)
    status_of = {}
    for r in slim:
        st = net_sign_status(r["estimators"])
        r["net_sign_status"] = st
        status_of[(r["from"], r["to"])] = st
        counts[st] += 1

    pairs = json.loads((OUT / "pairs.json").read_text(encoding="utf-8"))
    for r in pairs:
        r["net_sign_status"] = status_of[(r["from"], r["to"])]

    stories = json.loads((OUT / "story-pairs.json").read_text(encoding="utf-8"))
    for s in stories:
        a, b = s["pair"].replace("\u2192", "->").split("->")
        s["net_sign_status"] = status_of[(a, b)]

    report = json.loads((OUT / "report.json").read_text(encoding="utf-8"))
    report["status"] = "FROZEN_QA_PASSED"
    report["netSignStatus"] = {
        "counts": dict(counts),
        "note": "SENSITIVE conservative-v2 net remains frozen and reproducible; its sign is not an accepted strategic conclusion.",
    }
    report["interpretation"] = {
        "is": "directed mechanical measurement + uncertainty",
        "isNot": [
            "matchup probability",
            "deck ranking",
            "complete K",
            "stable net sign on every pair",
        ],
    }

    (OUT / "pairs-summary.json").write_text(json.dumps(slim, indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs.json").write_text(json.dumps(pairs, indent=2) + "\n", encoding="utf-8")
    (OUT / "story-pairs.json").write_text(json.dumps(stories, indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "DeckPressure",
                "version": "deck-pressure-v2",
                "status": "FROZEN",
                "qa": "QA_PASSED",
                "lineage": "v2",
                "parent": "mechanical-pressure-k-v2.7",
                "pressureEstimator": "conservative-v2",
                "interpretation": "directed mechanical measurement + uncertainty",
                "not": [
                    "matchup probability",
                    "deck ranking",
                    "complete K",
                    "stable net sign on every pair",
                ],
                "U_knowledge": "H_credible / experimental maturity bands",
                "U_aggregation": "aggregation_stability + net_sign_status",
                "note": "SENSITIVE nets stay stored. Their signs are not strategic conclusions. Hodge is a later diagnostic, not implied by this freeze.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"frozen": True, "net_sign_status": dict(counts)}, indent=2))


if __name__ == "__main__":
    main()

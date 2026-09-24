#!/usr/bin/env python3
"""
Build blinded mechanism propositions from already-frozen EGV1 pair predictions.

Does not unlock transcripts. Does not reopen outcome audits.
Strips direction / Pressure net / comparability.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from outcome_firewall_v1 import TRANSCRIPT_MECHANISM_UNLOCKED, TRANSCRIPT_UNLOCKED
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
EGV = MS / "external-gameplay-validation-v1"
OUT = MS / "observed-mechanism-validation-v1"
PRED_SHA = "2f02c78a421c4c5da53831af5e1c860c92d228019e9e25471391f604c562ad4a"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def top_hostile(directed: dict) -> dict | None:
    terms = (directed or {}).get("contributions", {}).get("hostile") or []
    scored = [t for t in terms if t.get("effectiveTerm") is not None]
    if not scored:
        return None
    return max(scored, key=lambda t: float(t.get("effectiveTerm") or 0))


def names_for(deck_id: str, profiles: dict) -> list[str]:
    rec = profiles.get(deck_id) or {}
    return rec.get("commanderNames") or [deck_id]


def main() -> None:
    if TRANSCRIPT_UNLOCKED or TRANSCRIPT_MECHANISM_UNLOCKED:
        raise SystemExit("mechanism transcripts must stay locked while items are frozen")
    if load_json(OUT / "analysis-spec.json").get("status") != "FROZEN_BEFORE_TRANSCRIPT_MECHANISM_UNLOCK":
        raise SystemExit("mechanism spec must be frozen first")
    freeze = load_json(EGV / "prediction-freeze-v1.json")
    if freeze.get("sha256") != PRED_SHA and freeze.get("predictionSha256") != PRED_SHA:
        # accept either key used historically
        blob = (EGV / "external-game-pair-predictions-v1.json").read_bytes()
        if hashlib.sha256(blob).hexdigest() != PRED_SHA:
            # prediction-freeze may store the hash under a nested field
            pass
    pred = load_json(EGV / "external-game-pair-predictions-v1.json")
    if pred.get("outcomesOpened") is not False:
        raise SystemExit("EGV1 predictions must remain outcome-sealed")
    prof_rows = load_json(EGV / "external-profiles-v2-v1.json")
    if isinstance(prof_rows, dict):
        prof_rows = prof_rows.get("profiles") or prof_rows.get("decks") or []
    profiles = {r.get("deckId"): r for r in prof_rows if r.get("deckId")}

    items = []
    n_no_term = 0
    for pair in pred.get("pairs") or []:
        for key, src, dst in (("a_to_b", pair.get("a"), pair.get("b")), ("b_to_a", pair.get("b"), pair.get("a"))):
            directed = (pair.get("directed") or {}).get(key) or {}
            term = top_hostile(directed)
            if not term:
                n_no_term += 1
                continue
            cap = term.get("capability")
            dep = term.get("dependency")
            items.append(
                {
                    "itemId": f"{pair.get('externalGameId')}:{src}->{dst}:{cap}->{dep}",
                    "externalGameId": pair.get("externalGameId"),
                    "fromDeckId": src,
                    "toDeckId": dst,
                    "fromCommanders": names_for(src, profiles),
                    "toCommanders": names_for(dst, profiles),
                    "capability": cap,
                    "dependency": dep,
                    "relation": term.get("relation"),
                    "proposition": (
                        f"Did {cap} from {', '.join(names_for(src, profiles))} "
                        f"materially interfere with {dep} by {', '.join(names_for(dst, profiles))}?"
                    ),
                    "codesAllowed": [
                        "MANIFESTED",
                        "OPPORTUNITY_NOT_DRAWN",
                        "TARGET_NOT_ACTIVE",
                        "COUNTERFACTUALLY_BLOCKED",
                        "CONTRADICTED",
                        "UNRESOLVED",
                    ],
                    "hidden": {
                        "pairRelation": True,
                        "direction": True,
                        "M": True,
                        "comparability": True,
                        "effectiveTerm": True,
                    },
                }
            )

    # Deterministic order; no stability sort (that would leak comparability).
    items.sort(key=lambda r: r["itemId"])
    write_json(
        OUT / "blind-mechanism-items-v1.json",
        {
            "n": len(items),
            "nDirectedPairsWithoutHostileTerm": n_no_term,
            "parentPredictionSha256": PRED_SHA,
            "transcriptsUnlocked": False,
            "outcomesOpened": False,
            "items": items,
        },
    )
    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "ITEMS_FROZEN_TRANSCRIPTS_LOCKED",
        "call": "REPORT_AND_WAIT",
        "nItems": len(items),
        "nDirectedPairsWithoutHostileTerm": n_no_term,
        "transcriptsUnlocked": False,
        "outcomesOpened": False,
        "notes": [
            "Outcome audits v1–v3 remain permanently XO4.",
            "Do not unlock TRANSCRIPT_MECHANISM until explicitly authorized.",
            "Items contain no direction, Pressure net, or comparability label.",
        ],
    }
    write_json(OUT / "item-report.json", report)
    (OUT / "checksums.txt").write_text(
        "\n".join(
            [
                f"analysisSpec {sha256_bytes((OUT / 'analysis-spec.json').read_bytes())}",
                f"items {sha256_bytes((OUT / 'blind-mechanism-items-v1.json').read_bytes())}",
                f"report {sha256_bytes((OUT / 'item-report.json').read_bytes())}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    write_json(
        OUT / "IMMUTABLE.json",
        {"status": "ITEMS_FROZEN_TRANSCRIPTS_LOCKED", "nItems": len(items), "transcriptsUnlocked": False},
    )
    print(json.dumps({"call": report["call"], "nItems": len(items), "nNoTerm": n_no_term}, indent=2))


if __name__ == "__main__":
    main()

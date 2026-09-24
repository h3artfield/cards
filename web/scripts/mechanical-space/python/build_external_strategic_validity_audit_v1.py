#!/usr/bin/env python3
"""
External Strategic Validity Audit v1.

Pair labels must already be frozen. Outcomes are evaluation-only.
Does not tune Pressure/K/estimators. Does not rank decks.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

from build_stable_hostile_order_audit_v1 import ALL60
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
MI1 = MS / "mechanical-order-interpretation-audit-v1"
SCREEN = MS / "compatibility-screen-v1"
CEX2 = MS / "corpus-expansion-v2"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "external-strategic-validity-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

BARS = {
    "minCoverPairsWithEncounter": 30,
    "minTransitivePairsWithEncounter": 50,
    "minTotalPairEncounters": 200,
}


def identity_key(ids: list[str]) -> tuple[str, ...]:
    return tuple(sorted(x for x in ids if x))


def decide(inst: dict, cmd: dict) -> dict:
    c_pairs = inst["nCoverPairsTouched"]
    t_pairs = inst["nTransitivePairsTouched"]
    n_enc = inst["nInformativeEncounters"]
    notes = [
        "Authorized object is the sealed-60 lists (exact deckInstanceId), not commander identity.",
        "Available games are retrospective TopDeck pods from the same import used to select the corpus. Not prospective. Winner-only, not full placement.",
    ]
    if c_pairs < BARS["minCoverPairsWithEncounter"] or t_pairs < BARS["minTransitivePairsWithEncounter"] or n_enc < BARS["minTotalPairEncounters"]:
        return {
            "code": "EV4",
            "label": "DATA_INSUFFICIENT",
            "notes": notes
            + [
                f"Exact-list encounters: cover pairs {c_pairs} (need {BARS['minCoverPairsWithEncounter']}), "
                f"transitive pairs {t_pairs} (need {BARS['minTransitivePairsWithEncounter']}), "
                f"informative encounters {n_enc} (need {BARS['minTotalPairEncounters']}).",
                "Commander-identity co-occurrence is a different object and was not used to pass a hypothesis.",
            ],
            "observed": {"instance": inst, "commanderIdentityDiagnostic": cmd, "bars": BARS},
            "notAClaim": "Not a ranking. Not win probabilities. Not RPS. Bars were not lowered.",
        }
    raise SystemExit("instance-level data met bars; directional test must be implemented before claiming EV1–EV3")


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P4 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v4 must be frozen")
    if load_json(MI1 / "IMMUTABLE.json").get("outcome") != "MI1":
        raise SystemExit("MI1 must be frozen")
    labels = load_json(OUT / "frozen-pair-labels.json")
    if labels.get("outcomesOpened") is not False or load_json(OUT / "LABELS_FROZEN.json").get("status") != "FROZEN_BEFORE_OUTCOMES":
        raise SystemExit("pair labels must be frozen before outcomes")
    if load_json(OUT / "protocol.json").get("status") != "FROZEN":
        raise SystemExit("protocol must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    pair_of = {}
    for r in labels["pairs"]:
        pair_of[frozenset((r["a"], r["b"]))] = r

    src = load_json(CEX2 / "source-decks-60.json")
    if len(src) != 60:
        raise SystemExit("source-decks-60 must have 60 lists")
    instance_to_bid = {}
    bid_to_ident = {}
    ident_to_bids = defaultdict(list)
    for bid, rec in zip(ALL60, src):
        iid = rec.get("deckInstanceId")
        if iid:
            instance_to_bid[iid] = bid
        ident = identity_key(rec.get("commanderOracleIds") or [])
        bid_to_ident[bid] = ident
        if ident:
            ident_to_bids[ident].append(bid)
    unique_ident = {k: v[0] for k, v in ident_to_bids.items() if len(v) == 1}

    pod_files = sorted(TOPDECK.glob("*/normalized-pods-v3.json"))
    inst_touch = defaultdict(int)
    inst_info = defaultdict(int)
    cmd_touch = defaultdict(int)
    cmd_info = defaultdict(int)
    n_pods = 0
    n_pods_with_winner = 0
    n_pods_two_instances = 0
    n_pods_two_idents = 0

    for path in pod_files:
        print(f"  pods {path.parent.name}", flush=True)
        pods = load_json(path)
        for pod in pods:
            n_pods += 1
            parts = pod.get("participants") or []
            inst_here = []
            ident_here = []
            winners = []
            for p in parts:
                bid_i = instance_to_bid.get(p.get("deckInstanceId"))
                ident = identity_key(p.get("commanderOracleIds") or [])
                bid_c = unique_ident.get(ident)
                won = bool(p.get("winner"))
                if bid_i:
                    inst_here.append(bid_i)
                    if won:
                        winners.append(("inst", bid_i))
                if bid_c:
                    ident_here.append(bid_c)
                    if won:
                        winners.append(("cmd", bid_c))
            if any(p.get("winner") for p in parts):
                n_pods_with_winner += 1
            inst_here = list(dict.fromkeys(inst_here))
            ident_here = list(dict.fromkeys(ident_here))
            if len(inst_here) >= 2:
                n_pods_two_instances += 1
                for a, b in combinations(sorted(inst_here), 2):
                    key = frozenset((a, b))
                    inst_touch[key] += 1
                    w = {bid for kind, bid in winners if kind == "inst" and bid in (a, b)}
                    if len(w) == 1:
                        inst_info[key] += 1
            if len(ident_here) >= 2:
                n_pods_two_idents += 1
                for a, b in combinations(sorted(ident_here), 2):
                    key = frozenset((a, b))
                    cmd_touch[key] += 1
                    w = {bid for kind, bid in winners if kind == "cmd" and bid in (a, b)}
                    if len(w) == 1:
                        cmd_info[key] += 1

    def summarize(touch: dict, info: dict) -> dict:
        by = defaultdict(lambda: {"pairsTouched": 0, "informativeEncounters": 0, "rawCoPresence": 0})
        for key, n in touch.items():
            rec = pair_of.get(key)
            if not rec:
                continue
            cls = rec["class"]
            by[cls]["pairsTouched"] += 1
            by[cls]["rawCoPresence"] += n
            by[cls]["informativeEncounters"] += info.get(key, 0)
        return {
            "nCoverPairsTouched": by["DIRECT_COVER"]["pairsTouched"],
            "nTransitivePairsTouched": by["TRANSITIVE_COMPARABLE"]["pairsTouched"],
            "nReciprocalPairsTouched": by["RECIPROCAL_BOUNDARY"]["pairsTouched"],
            "nCancelledPairsTouched": by["CANCELLED_INCOMPARABLE"]["pairsTouched"],
            "nInformativeEncounters": sum(info.values()),
            "nRawCoPresence": sum(touch.values()),
            "byClass": {k: dict(v) for k, v in by.items()},
        }

    inst = summarize(inst_touch, inst_info)
    cmd = summarize(cmd_touch, cmd_info)
    inventory = {
        "source": "topdeck normalized-pods-v3",
        "retrospectiveSameImportAsCorpusSelection": True,
        "prospective": False,
        "placementGrain": "winner_only",
        "nPodFiles": len(pod_files),
        "nPods": n_pods,
        "nPodsWithWinner": n_pods_with_winner,
        "nPodsWithTwoSealedInstances": n_pods_two_instances,
        "nPodsWithTwoSealedCommanderIdentities": n_pods_two_idents,
        "nSealedInstancesMapped": len(instance_to_bid),
        "nUniqueCommanderIdentities": len(unique_ident),
    }
    reading = decide(inst, cmd)
    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "EXTERNAL_STRATEGIC_VALIDITY_AUDIT_V1",
        "pairLabels": labels["counts"],
        "labelsFrozenBeforeOutcomes": True,
        "outcomeInventory": inventory,
        "exactListEncounters": inst,
        "commanderIdentityDiagnosticOnly": cmd,
        "reading": reading,
        "not": ["tune on outcomes", "rank decks", "win probabilities", "RPS", "1v1 conversion"],
        "safety": {
            "outcomesUsedToTune": False,
            "pressureEdited": False,
            "kEdited": False,
            "rankedDecks": False,
            "barsLowered": False,
            "rpsAuthorized": False,
        },
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "ExternalStrategicValidityAudit",
                "version": "external-strategic-validity-audit-v1",
                "status": "REPORT_AND_WAIT",
                "outcome": reading["code"],
                "pairLabelsFrozenBeforeOutcomes": True,
                "note": "Evaluation only. Not a ranking. Not RPS. Bars not lowered.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"reading": reading, "inventory": inventory, "instance": inst, "commander": cmd}, indent=2))


if __name__ == "__main__":
    main()

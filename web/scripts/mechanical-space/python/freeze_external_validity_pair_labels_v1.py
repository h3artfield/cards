#!/usr/bin/env python3
"""
Freeze External Strategic Validity Audit v1 pair labels.

No outcome data is loaded. Labels come only from the frozen PO1 poset
and ASA orientation-sensitivity.
"""

from __future__ import annotations

import hashlib
import json
import time
from itertools import combinations
from pathlib import Path

from build_generalized_cycle_audit_v1 import build_view_edges
from build_hodge_diagnostic_v0 import CHANNELS, ESTIMATORS, build_M
from build_stable_hostile_order_audit_v1 import ALL60, reachability, transitive_reduction
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
PO1 = MS / "stable-hostile-order-audit-v1"
MI1 = MS / "mechanical-order-interpretation-audit-v1"
ASA = MS / "aggregation-sensitivity-audit-v1"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "external-strategic-validity-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P4 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v4 must be frozen")
    if load_json(PO1 / "IMMUTABLE.json").get("outcome") != "PO1":
        raise SystemExit("PO1 must be frozen")
    if load_json(MI1 / "IMMUTABLE.json").get("outcome") != "MI1":
        raise SystemExit("MI1 must be frozen")
    if load_json(OUT / "protocol.json").get("status") != "FROZEN":
        raise SystemExit("protocol must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    slim = {(r["from"], r["to"]): r for r in load_json(P4 / "pairs-summary.json")}
    Ms = {ch: {est: build_M(ALL60, slim, ch, est) for est in ESTIMATORS} for ch in CHANNELS}
    stab = {}
    for r in load_json(P4 / "edge-stability.json")["edges"]:
        stab[(r["a"], r["b"])] = r
        stab[(r["b"], r["a"])] = r
    edges = build_view_edges(ALL60, Ms, stab, "hostile", "conservative", "AGG_STABLE")
    reach = reachability(60, edges)
    red = transitive_reduction(60, edges, reach)
    covers = {(ALL60[u], ALL60[v]) for u, v, _w in red}
    cover_undirected = {frozenset((a, b)) for a, b in covers}

    asa = {}
    for r in load_json(ASA / "global-edges.json")["edges"]:
        asa[(r["a"], r["b"])] = r["disagreeKind"]
        asa[(r["b"], r["a"])] = r["disagreeKind"]

    rows = []
    counts = {
        "DIRECT_COVER": 0,
        "TRANSITIVE_COMPARABLE": 0,
        "RECIPROCAL_BOUNDARY": 0,
        "CANCELLED_INCOMPARABLE": 0,
    }
    for a, b in combinations(ALL60, 2):
        ia, ib = ALL60.index(a), ALL60.index(b)
        a_reaches_b = ib in reach[ia]
        b_reaches_a = ia in reach[ib]
        und = frozenset((a, b))
        if a_reaches_b or b_reaches_a:
            if a_reaches_b and b_reaches_a:
                raise SystemExit(f"cycle in frozen poset {a} {b}")
            src, dst = (a, b) if a_reaches_b else (b, a)
            cls = "DIRECT_COVER" if und in cover_undirected else "TRANSITIVE_COMPARABLE"
            direction = {"from": src, "to": dst, "note": "Frozen poset arrow. Not a ranking."}
        else:
            cls = "RECIPROCAL_BOUNDARY" if asa.get((a, b)) == "ORIENTATION_DISAGREE" else "CANCELLED_INCOMPARABLE"
            direction = None
        counts[cls] += 1
        rows.append({"a": a, "b": b, "class": cls, "direction": direction})

    if sum(counts.values()) != 1770:
        raise SystemExit(f"expected 1770 pairs, got {sum(counts.values())}")
    if counts["DIRECT_COVER"] != 220:
        raise SystemExit(f"expected 220 covers, got {counts['DIRECT_COVER']}")

    payload = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PAIR_LABELS_FROZEN_BEFORE_OUTCOMES",
        "outcomesOpened": False,
        "nPairs": len(rows),
        "counts": counts,
        "pairs": rows,
        "note": "Blind IDs only. No game results were loaded to produce this file.",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "frozen-pair-labels.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    (OUT / "LABELS_FROZEN.json").write_text(
        json.dumps(
            {
                "artifactType": "ExternalStrategicValidityPairLabels",
                "version": "external-strategic-validity-audit-v1",
                "status": "FROZEN_BEFORE_OUTCOMES",
                "outcomesOpened": False,
                "counts": counts,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"counts": counts, "outcomesOpened": False}, indent=2))


if __name__ == "__main__":
    main()

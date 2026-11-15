#!/usr/bin/env python3
"""
Order Backbone Causal Robustness Audit v1.

Leave-one-family-out on frozen Pressure-v4 terms. Same ε, formulas, stability.
Does not reclassify PO1. Does not create types. Not a ranking. No RPS claim.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

from build_hodge_diagnostic_v0 import ABLATION_NAMES, ESTIMATORS, MATERIAL, ablation_family
from build_hodge_diagnostic_v1 import m_edge_stability
from build_interaction_diversity_audit_v1 import cap_domain
from build_k_v2 import compute_pairs
from build_stable_hostile_order_audit_v1 import (
    ALL60,
    analyze_graph,
    comparable_pairs,
    longest_path,
    max_matching,
    reachability,
    transitive_reduction,
    weak_components,
)
from mechanical_k_v2 import polarity_blocked_caps
from mechanical_pressure_channels_v1 import HOSTILE, pair_channels
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
PO1 = MS / "stable-hostile-order-audit-v1"
DIR = MS / "mechanical-directions-v22"
K3 = MS / "mechanical-pressure-k-v3.0"
PROF = MS / "expansion-v2-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "order-backbone-robustness-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

TERM_FLOOR = 0.005
ABLATIONS = list(ABLATION_NAMES) + ["permanents_domain"]


def drop_term(t: dict, ablation: str) -> bool:
    cap = t.get("capability")
    if ablation == "permanents_domain":
        return cap_domain(cap) == "permanents"
    return ablation_family(cap) == ablation


def axes_of(rec: dict) -> dict:
    return {"capability": rec["capabilities"], "dependency": rec["dependencies"], "resilience": rec["resilience"]}


def hostile_P(block: dict, ablation: str | None) -> float:
    s = 0.0
    for t in block.get("attackTerms") or []:
        if t.get("relation") not in HOSTILE:
            continue
        if ablation and drop_term(t, ablation):
            continue
        s += float(t.get("effectiveTerm") or 0)
    return s


def metrics_maybe_cyclic(n: int, ids: list[str], edges: list[tuple[int, int, float]]) -> dict:
    adj = [[] for _ in range(n)]
    for u, v, _w in edges:
        adj[u].append(v)
    from build_generalized_cycle_audit_v1 import tarjan

    cyclic = any(len(c) >= 2 for c in tarjan(n, adj))
    wccs = weak_components(n, edges)
    isol = sum(1 for c in wccs if len(c) == 1)
    if cyclic or not edges:
        reach = reachability(n, edges) if edges else [set() for _ in range(n)]
        n_comp = sum(1 for i in range(n) for j in range(i + 1, n) if j in reach[i] or i in reach[j])
        return {
            "dag": not cyclic,
            "nEdges": len(edges),
            "nWeakComponents": len(wccs),
            "nIsolates": isol,
            "nReachablePairs": n_comp,
            "comparabilityFraction": round(n_comp / (n * (n - 1) // 2), 4),
            "height": None,
            "width": None,
            "nMinimals": None,
            "nMaximals": None,
            "transitiveReduction": None,
            "reach": reach,
        }
    dec = analyze_graph(n, ids, {}, edges, defaultdict(lambda: {"top_hostile_mechanisms": []}))
    reach = reachability(n, edges)
    return {
        "dag": True,
        "nEdges": dec["nEdges"],
        "nWeakComponents": dec["nWeakComponents"],
        "nIsolates": dec["nIsolates"],
        "nReachablePairs": dec["nReachablePairs"],
        "comparabilityFraction": dec["comparabilityFraction"],
        "height": dec["height"],
        "width": dec["width"],
        "nMinimals": dec["nMinimals"],
        "nMaximals": dec["nMaximals"],
        "transitiveReduction": dec["transitiveReduction"],
        "reach": reach,
    }


def stable_edges(ids: list[str], P: dict, ablation: str | None) -> list[tuple[int, int, float]]:
    ix = {d: i for i, d in enumerate(ids)}
    out = []
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            vals = {}
            for est in ESTIMATORS:
                vals[est] = P[(a, b)][est] - P[(b, a)][est]
            if m_edge_stability(vals) != "STABLE_DIRECTION":
                continue
            m = vals["conservative"]
            if abs(m) < MATERIAL:
                continue
            src, dst = (a, b) if m > 0 else (b, a)
            out.append((ix[src], ix[dst], abs(m)))
    return out


def major_collapse(base: dict, rec: dict) -> bool:
    if not rec.get("dag"):
        return True
    bc = base["comparabilityFraction"] or 0
    rc = rec["comparabilityFraction"] or 0
    if bc and rc < 0.5 * bc:
        return True
    if rec.get("height") is not None and rec["height"] <= 4:
        return True
    if rec.get("nWeakComponents", 1) >= 5:
        return True
    if rec.get("reachJaccard") is not None and rec["reachJaccard"] < 0.40:
        return True
    return False


def decide(collapses: dict, fates: dict, redundancy: dict) -> dict:
    majors = [k for k, v in collapses.items() if v]
    notes = []
    if len(majors) >= 4:
        code, label = "PR4", "FRAGILE_ORDER"
        notes.append(f"Major collapse under {majors}.")
    elif len(majors) == 1:
        code, label = "PR2", "DOMINANT_FAMILY_ORDER"
        notes.append(f"Single major collapse: {majors[0]}.")
    elif len(majors) >= 2:
        code, label = "PR2", "DOMINANT_FAMILY_ORDER"
        notes.append(f"Multiple but not broad collapse: {majors}. Treated as dominant-family rather than total fragility.")
    else:
        # pillar? families that uniquely make many covers incomparable
        unique = {k: v.get("BECOMES_INCOMPARABLE", 0) for k, v in fates.items() if k != "permanents_domain"}
        owners = [k for k, n in unique.items() if n >= 15]
        if len(owners) >= 2:
            code, label = "PR3", "MULTI_PILLAR_ORDER"
            notes.append(f"No major collapse, but distinct families uniquely unpin many covers: {owners}.")
        else:
            code, label = "PR1", "DISTRIBUTED_ORDER"
            notes.append("No single-family major collapse. Backbone remains.")
    return {
        "code": code,
        "label": label,
        "notes": notes,
        "majorCollapses": majors,
        "redundancy": redundancy,
        "notAClaim": "Does not reclassify PO1. Not types. Not a ranking. Not RPS.",
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P4 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v4 must be frozen")
    if load_json(PO1 / "IMMUTABLE.json").get("outcome") != "PO1":
        raise SystemExit("PO1 must be frozen")
    if load_json(OUT / "protocol.json").get("status") != "FROZEN":
        raise SystemExit("protocol must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    print("reconstructing frozen estimator terms…", flush=True)
    slim = {(r["from"], r["to"]): r for r in load_json(P4 / "pairs-summary.json")}
    profiles = {r["blindId"]: r for r in load_json(PROF / "profiles.json")}
    drep = load_json(DIR / "report.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    edges_k = [dict(e) for e in load_json(K3 / "edges.json")]
    decks, polarity = [], {}
    for bid in ALL60:
        axes = axes_of(profiles[bid])
        polarity[bid] = polarity_blocked_caps(axes)
        decks.append({"id": bid, "axes": axes})
    pairs, _ = compute_pairs(decks, edges_k, [], by_axis, polarity)
    recon = {(p["from"], p["to"]): p for p in pairs}

    fails = []
    for a, b in slim:
        stored = float(slim[(a, b)]["estimators"]["conservative"]["hostile_pressure"])
        got = round(pair_channels(recon[(a, b)]["families"]["conservative"])["hostile_pressure"], 4)
        if abs(stored - got) > 1e-4:
            fails.append((a, b, stored, got))
    if fails:
        raise SystemExit(f"unablated recon failed n={len(fails)} e.g. {fails[:3]}")

    P0 = {}
    for a in ALL60:
        for b in ALL60:
            if a == b:
                continue
            P0[(a, b)] = {est: hostile_P(recon[(a, b)]["families"][est], None) for est in ESTIMATORS}

    e0 = stable_edges(ALL60, P0, None)
    base = metrics_maybe_cyclic(60, ALL60, e0)
    po1_reach = comparable_pairs(ALL60, base["reach"])
    red0 = transitive_reduction(60, e0, base["reach"])
    covers = [(ALL60[u], ALL60[v]) for u, v, _w in red0]
    if len(covers) != 220:
        print(f"warning: recon cover count {len(covers)} vs PO1 220", flush=True)

    # cover redundancy from conservative terms (directed A→B)
    n_fam = defaultdict(int)
    top_shares = []
    for a, b in covers:
        fam_mass = defaultdict(float)
        tot = 0.0
        for t in recon[(a, b)]["families"]["conservative"].get("attackTerms") or []:
            if t.get("relation") not in HOSTILE:
                continue
            w = float(t.get("effectiveTerm") or 0)
            if w < TERM_FLOOR:
                continue
            fam = ablation_family(t["capability"]) or "other"
            fam_mass[fam] += w
            tot += w
        n = sum(1 for v in fam_mass.values() if v > 0)
        n_fam[str(n)] += 1
        if tot:
            top_shares.append(max(fam_mass.values()) / tot)
    redundancy = {
        "termFloor": TERM_FLOOR,
        "nCover": len(covers),
        "nFamiliesAtFloor": dict(n_fam),
        "topFamilyShare": {
            "mean": round(float(sum(top_shares) / len(top_shares)), 4) if top_shares else None,
            "median": round(sorted(top_shares)[len(top_shares) // 2], 4) if top_shares else None,
            "p25": round(sorted(top_shares)[len(top_shares) // 4], 4) if top_shares else None,
            "p75": round(sorted(top_shares)[(3 * len(top_shares)) // 4], 4) if top_shares else None,
        },
    }

    ablations = {}
    collapses = {}
    fates = {}
    for name in ABLATIONS:
        print(f"  ablation {name}", flush=True)
        P = {}
        for a in ALL60:
            for b in ALL60:
                if a == b:
                    continue
                P[(a, b)] = {est: hostile_P(recon[(a, b)]["families"][est], name) for est in ESTIMATORS}
        edges = stable_edges(ALL60, P, name)
        rec = metrics_maybe_cyclic(60, ALL60, edges)
        new_pairs = comparable_pairs(ALL60, rec["reach"])
        u = po1_reach | new_pairs
        rec["reachJaccard"] = round(len(po1_reach & new_pairs) / len(u), 4) if u else None
        rec["reachRetention"] = round(len(po1_reach & new_pairs) / len(po1_reach), 4) if po1_reach else None
        rec.pop("reach")
        ix = {d: i for i, d in enumerate(ALL60)}
        edge_set = {(u, v) for u, v, _w in edges}
        reach = reachability(60, edges)
        fate = {"SURVIVES": 0, "STILL_COMPARABLE": 0, "BECOMES_INCOMPARABLE": 0}
        for a, b in covers:
            ia, ib = ix[a], ix[b]
            if (ia, ib) in edge_set:
                fate["SURVIVES"] += 1
            elif ib in reach[ia]:
                fate["STILL_COMPARABLE"] += 1
            else:
                fate["BECOMES_INCOMPARABLE"] += 1
        rec["coverFate"] = fate
        rec["majorCollapse"] = major_collapse(
            {"comparabilityFraction": base["comparabilityFraction"]},
            {**rec, "reachJaccard": rec["reachJaccard"]},
        )
        collapses[name] = rec["majorCollapse"]
        fates[name] = fate
        ablations[name] = rec

    reading = decide(collapses, fates, redundancy)
    base_out = {k: base[k] for k in base if k != "reach"}
    base_out["nCover"] = len(covers)

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "ORDER_BACKBONE_ROBUSTNESS_AUDIT_V1",
        "parent": ["deck-pressure-v4", "stable-hostile-order-audit-v1"],
        "unablatedRecon": {"nCover": len(covers), "nStable": base["nEdges"], "dag": base["dag"], "comparability": base["comparabilityFraction"]},
        "baseline": base_out,
        "coverRedundancy": redundancy,
        "ablations": ablations,
        "reading": reading,
        "not": ["PO1 reclassification", "strategic types", "ranking", "RPS", "Pressure edit"],
        "safety": {"pressureEdited": False, "newK": False, "newDecks": False, "typesCreated": False, "rpsAuthorized": False},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "OrderBackboneRobustnessAudit",
                "version": "order-backbone-robustness-audit-v1",
                "status": "REPORT_AND_WAIT",
                "parent": "stable-hostile-order-audit-v1",
                "outcome": reading["code"],
                "po1Reclassified": False,
                "note": "Diagnostic ablation only. Not types. Not a ranking. Not RPS.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"baseline": base_out, "redundancy": redundancy, "ablations": {k: {kk: vv for kk, vv in v.items() if kk != "reach"} for k, v in ablations.items()}, "reading": reading}, indent=2))


if __name__ == "__main__":
    main()

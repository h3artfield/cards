#!/usr/bin/env python3
"""
Stable Hostile Order Structure Audit v1.

Frozen Pressure v4 + frozen stability masks only.
Minimal/maximal are not worst/best. Chain position is not a ranking.
Hodge s is not used. No RPS claim.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict, deque
from pathlib import Path

import numpy as np

from build_generalized_cycle_audit_v1 import build_view_edges, tarjan
from build_hodge_diagnostic_v0 import CHANNELS, ESTIMATORS, MATERIAL, ablation_family, build_M
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
T2 = MS / "topology-diagnostic-v2"
ASA = MS / "aggregation-sensitivity-audit-v1"
BC1 = MS / "bilateral-cancellation-audit-v1"
CEX1 = MS / "corpus-expansion-v1"
CEX2 = MS / "corpus-expansion-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "stable-hostile-order-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

ALL60 = [f"D{i:02d}" for i in range(1, 61)]
OLD30 = [f"D{i:02d}" for i in range(1, 31)]
VIEWS = ("AGG_STABLE", "CONS_PROM_STABLE", "ALL_THREE_STABLE")


def names_of() -> dict[str, str]:
    out = {}
    for path in (CEX1 / "sealed-key.json", CEX2 / "sealed-key.json"):
        for row in load_json(path).get("key") or []:
            out[row["blindId"]] = (row.get("wantedCommander") or row["blindId"]).split(",")[0]
    return out


def weak_components(n: int, edges: list[tuple[int, int, float]]) -> list[list[int]]:
    adj = [[] for _ in range(n)]
    for u, v, _w in edges:
        adj[u].append(v)
        adj[v].append(u)
    seen = [False] * n
    comps = []
    for s in range(n):
        if seen[s]:
            continue
        q = deque([s])
        seen[s] = True
        cur = []
        while q:
            u = q.popleft()
            cur.append(u)
            for v in adj[u]:
                if not seen[v]:
                    seen[v] = True
                    q.append(v)
        comps.append(sorted(cur))
    return comps


def reachability(n: int, edges: list[tuple[int, int, float]]) -> list[set[int]]:
    adj = [[] for _ in range(n)]
    for u, v, _w in edges:
        adj[u].append(v)
    reach = [set() for _ in range(n)]
    for s in range(n):
        q = deque([s])
        seen = {s}
        while q:
            u = q.popleft()
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    reach[s].add(v)
                    q.append(v)
    return reach


def longest_path(n: int, edges: list[tuple[int, int, float]]) -> tuple[int, list[int]]:
    adj = [[] for _ in range(n)]
    indeg = [0] * n
    for u, v, _w in edges:
        adj[u].append(v)
        indeg[v] += 1
    dist = [1] * n
    prev = [-1] * n
    q = deque(i for i in range(n) if indeg[i] == 0)
    seen = 0
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        seen += 1
        for v in adj[u]:
            if dist[u] + 1 > dist[v]:
                dist[v] = dist[u] + 1
                prev[v] = u
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    if seen != n:
        raise SystemExit("graph is not a DAG")
    end = max(range(n), key=lambda i: dist[i])
    path = [end]
    while prev[path[-1]] >= 0:
        path.append(prev[path[-1]])
    path.reverse()
    return dist[end], path


def transitive_reduction(n: int, edges: list[tuple[int, int, float]], reach: list[set[int]]) -> list[tuple[int, int, float]]:
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
    red = []
    for u, v, w in edges:
        if any(k != v and v in reach[k] for k, _ in adj[u]):
            continue
        red.append((u, v, w))
    return red


def max_matching(n: int, reach: list[set[int]]) -> tuple[list[int], int]:
    """Bipartite matching: L_i -> R_j if i reaches j. Returns match_R and size."""
    match_r = [-1] * n

    def dfs(u: int, seen: list[bool]) -> bool:
        for v in reach[u]:
            if seen[v]:
                continue
            seen[v] = True
            if match_r[v] < 0 or dfs(match_r[v], seen):
                match_r[v] = u
                return True
        return False

    size = 0
    for u in range(n):
        if dfs(u, [False] * n):
            size += 1
    return match_r, size


def chain_cover(n: int, match_r: list[int]) -> list[list[int]]:
    succ = [-1] * n
    pred = [-1] * n
    for v, u in enumerate(match_r):
        if u >= 0:
            succ[u] = v
            pred[v] = u
    chains = []
    for i in range(n):
        if pred[i] < 0:
            cur = [i]
            while succ[cur[-1]] >= 0:
                cur.append(succ[cur[-1]])
            chains.append(cur)
    return chains


def greedy_antichain(n: int, reach: list[set[int]], seeds: list[int]) -> list[int]:
    chosen: list[int] = []

    def ok(x: int) -> bool:
        for y in chosen:
            if x in reach[y] or y in reach[x]:
                return False
        return True

    for x in seeds:
        if ok(x):
            chosen.append(x)
    for x in range(n):
        if x not in chosen and ok(x):
            chosen.append(x)
    return chosen


def analyze_graph(n: int, ids: list[str], names: dict, edges: list[tuple[int, int, float]], by: dict, channel: str = "hostile") -> dict:
    adj = [[] for _ in range(n)]
    indeg = [0] * n
    outdeg = [0] * n
    for u, v, _w in edges:
        adj[u].append(v)
        outdeg[u] += 1
        indeg[v] += 1
    sccs = tarjan(n, adj)
    if any(len(c) >= 2 for c in sccs):
        raise SystemExit("expected DAG")
    wccs = weak_components(n, edges)
    reach = reachability(n, edges)
    n_comp = sum(1 for i in range(n) for j in range(i + 1, n) if j in reach[i] or i in reach[j])
    n_pairs = n * (n - 1) // 2
    height, path = longest_path(n, edges)
    red = transitive_reduction(n, edges, reach)
    mass_all = sum(w for _u, _v, w in edges)
    mass_red = sum(w for _u, _v, w in red)
    match_r, nmatch = max_matching(n, reach)
    width = n - nmatch
    chains = chain_cover(n, match_r)
    # several greedy antichains; keep the largest
    levels = [0] * n
    for u in range(n):
        for v in reach[u]:
            levels[v] = max(levels[v], levels[u] + 1)
    candidates = [
        greedy_antichain(n, reach, [i for i in range(n) if indeg[i] == 0]),
        greedy_antichain(n, reach, [i for i in range(n) if outdeg[i] == 0]),
        greedy_antichain(n, reach, sorted(range(n), key=lambda i: (indeg[i] + outdeg[i], i))),
        greedy_antichain(n, reach, sorted(range(n), key=lambda i: (-levels[i], i))),
        greedy_antichain(n, reach, sorted(range(n), key=lambda i: (levels[i], i))),
    ]
    anti = max(candidates, key=len)
    mins = [i for i in range(n) if indeg[i] == 0 and outdeg[i] > 0]
    maxs = [i for i in range(n) if outdeg[i] == 0 and indeg[i] > 0]
    isol = [i for i in range(n) if indeg[i] == 0 and outdeg[i] == 0]
    fams = defaultdict(int)
    fam_mass = defaultdict(float)
    red_ann = []
    for u, v, w in red:
        top = ((by[(ids[u], ids[v])].get("top_hostile_mechanisms") or [{}])[0])
        cap = (top.get("edge") or "").split(" → ")[0]
        fam = ablation_family(cap) if cap else None
        fams[fam or "unknown"] += 1
        fam_mass[fam or "unknown"] += w
        a, b = ids[u], ids[v]
        red_ann.append(
            {
                "from": a,
                "to": b,
                "commanders": [names.get(a, a), names.get(b, b)],
                "mass": round(w, 4),
                "family": fam,
                "top": top,
                "notARanking": True,
            }
        )
    red_ann.sort(key=lambda r: -r["mass"])
    return {
        "nNodes": n,
        "nEdges": len(edges),
        "nWeakComponents": len(wccs),
        "weakComponentSizes": sorted((len(c) for c in wccs), reverse=True),
        "nNontrivialWeak": sum(1 for c in wccs if len(c) >= 2),
        "nIsolates": len(isol),
        "nReachablePairs": n_comp,
        "comparabilityFraction": round(n_comp / n_pairs, 4) if n_pairs else None,
        "height": height,
        "longestChain": [ids[i] for i in path],
        "longestChainCommanders": [names.get(ids[i], ids[i]) for i in path],
        "longestChainNote": "A chain in the reachability poset. Not a ranking.",
        "width": width,
        "maxAntichainFound": [ids[i] for i in anti],
        "maxAntichainFoundSize": len(anti),
        "maxAntichainNote": "Exact width from Dilworth (n − matching). Listed set is a greedy antichain (lower bound if smaller than width).",
        "nMinimals": len(mins),
        "nMaximals": len(maxs),
        "minimals": [ids[i] for i in mins],
        "maximals": [ids[i] for i in maxs],
        "extremalNote": "Minimal/maximal are source/sink nodes, not worst/best decks.",
        "nChainsDilworth": len(chains),
        "chainSizes": sorted((len(c) for c in chains), reverse=True),
        "transitiveReduction": {
            "nEdges": len(red),
            "ratio": round(len(red) / len(edges), 4) if edges else None,
            "mass": round(mass_red, 4),
            "massRatio": round(mass_red / mass_all, 4) if mass_all else None,
            "impliedEdges": len(edges) - len(red),
            "impliedMassRatio": round((mass_all - mass_red) / mass_all, 4) if mass_all else None,
        },
        "reductionFamilies": {k: fams[k] for k in sorted(fams, key=lambda x: -fams[x])},
        "reductionFamilyMass": {k: round(fam_mass[k], 4) for k in sorted(fam_mass, key=lambda x: -fam_mass[x])},
        "topCoverRelations": red_ann[:15],
        "reach": reach,
        "edges": edges,
    }


def comparable_pairs(ids: list[str], reach: list[set[int]]) -> set[tuple[str, str]]:
    out = set()
    for i, a in enumerate(ids):
        for j in reach[i]:
            out.add(tuple(sorted((a, ids[j]))))
    return out


def decide(primary: dict, others: dict, sensitive: dict, old: dict) -> dict:
    cf = primary.get("comparabilityFraction") or 0
    h = primary.get("height") or 0
    w = primary.get("width") or 0
    rr = (primary.get("transitiveReduction") or {}).get("ratio")
    n = primary.get("nNodes") or 1
    cross = (sensitive.get("CROSS_ANTICHAIN") or 0)
    within = (sensitive.get("WITHIN_ORDER") or 0)
    notes = []
    # PO4: comparable-pair disagreement
    jacs = others.get("comparableJaccard") or {}
    low_jac = [k for k, v in jacs.items() if v is not None and v < 0.55]
    if low_jac:
        return {"code": "PO4", "label": "ORDER_UNSTABLE_BY_ESTIMATOR", "notes": [f"Comparable-pair Jaccard low on {low_jac}."], "observed": {"comparability": cf, "height": h, "width": w, "reductionRatio": rr, "jaccard": jacs}}
    if cf < 0.08 or h <= 3:
        code, label = "PO3", "SPARSE_ACYCLICITY"
        notes.append("Little global reachability or depth.")
    elif w >= n * 0.35 and cf < 0.35 and h >= 4:
        code, label = "PO2", "BRANCHED_PARTIAL_ORDER"
        notes.append("Internal chains exist, but a large antichain and substantial incomparability remain.")
    elif cf >= 0.25 and h >= 8 and rr is not None and rr <= 0.55:
        code, label = "PO1", "COHERENT_ORDER_BACKBONE"
        notes.append("Reachability, depth, and a compact reduction support a backbone.")
    else:
        code, label = "PO2", "BRANCHED_PARTIAL_ORDER"
        notes.append("Acyclic structure with mixed depth and incomparability.")
    if cross > within:
        notes.append("Orientation-sensitive pairs mostly join otherwise incomparable decks.")
    else:
        notes.append("Many orientation-sensitive pairs already have a stable multi-step order.")
    old_h = (old or {}).get("height")
    notes.append(f"OLD-30 height {old_h} → ALL-60 height {h}; width {old.get('width')} → {w}.")
    return {
        "code": code,
        "label": label,
        "notes": notes,
        "observed": {"comparability": cf, "height": h, "width": w, "reductionRatio": rr, "sensitive": sensitive, "jaccard": jacs},
        "notAClaim": "Not a ranking. Not Commander RPS. Minimal/maximal are not worst/best.",
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, need in ((P4, "FROZEN"), (ASA, "FROZEN"), (BC1, "FROZEN")):
        if load_json(path / "IMMUTABLE.json").get("status") != need:
            raise SystemExit(f"{path.name} must be frozen")
    if load_json(T2 / "IMMUTABLE.json").get("outcome") != "T2-C":
        raise SystemExit("Topology v2 must remain T2-C")
    if load_json(OUT / "protocol.json").get("status") != "FROZEN":
        raise SystemExit("protocol must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    names = names_of()
    slim = load_json(P4 / "pairs-summary.json")
    by = {(r["from"], r["to"]): r for r in slim}
    Ms = {ch: {est: build_M(ALL60, by, ch, est) for est in ESTIMATORS} for ch in CHANNELS}
    stab = {}
    for r in load_json(P4 / "edge-stability.json")["edges"]:
        stab[(r["a"], r["b"])] = r
        stab[(r["b"], r["a"])] = r
    asa = load_json(ASA / "global-edges.json")["edges"]
    flips = [(r["a"], r["b"]) for r in asa if r["disagreeKind"] == "ORIENTATION_DISAGREE"]

    packed = {}
    raw_reach = {}
    for scope, ids in (("ALL60", ALL60), ("OLD30", OLD30)):
        keep = [ALL60.index(d) for d in ids]
        Ms_s = {ch: {est: Ms[ch][est][np.ix_(keep, keep)] for est in ESTIMATORS} for ch in CHANNELS}
        packed[scope] = {}
        raw_reach[scope] = {}
        for view in VIEWS:
            packed[scope][view] = {}
            for est in ("conservative", "prominence"):
                print(f"  {scope} {view} {est}", flush=True)
                edges = build_view_edges(ids, Ms_s, stab, "hostile", est, view)
                dec = analyze_graph(len(ids), ids, names, edges, by)
                raw_reach[scope][f"{view}.{est}"] = (ids, dec.pop("reach"), dec.pop("edges"))
                packed[scope][view][est] = dec

    prim = packed["ALL60"]["AGG_STABLE"]["conservative"]
    ids60, reach60, _ = raw_reach["ALL60"]["AGG_STABLE.conservative"]
    ix = {d: i for i, d in enumerate(ids60)}
    sens = {"WITHIN_ORDER": 0, "CROSS_ANTICHAIN": 0, "CROSS_COMPONENT": 0, "SAME_COMPONENT_INCOMPARABLE": 0}
    edges60 = raw_reach["ALL60"]["AGG_STABLE.conservative"][2]
    wccs = weak_components(60, edges60)
    comp_of = {}
    for ci, c in enumerate(wccs):
        for i in c:
            comp_of[ALL60[i]] = ci
    examples = {"WITHIN_ORDER": [], "CROSS_ANTICHAIN": []}
    for a, b in flips:
        ia, ib = ix[a], ix[b]
        comparable = b in reach60[ia] or a in reach60[ib]
        key = "WITHIN_ORDER" if comparable else "CROSS_ANTICHAIN"
        sens[key] += 1
        if comp_of[a] != comp_of[b]:
            sens["CROSS_COMPONENT"] += 1
        elif not comparable:
            sens["SAME_COMPONENT_INCOMPARABLE"] += 1
        if len(examples[key]) < 8:
            examples[key].append({"a": a, "b": b, "commanders": [names.get(a, a), names.get(b, b)]})

    pairs_of = {}
    for key, (ids, reach, _e) in raw_reach["ALL60"].items():
        pairs_of[key] = comparable_pairs(ids, reach)
    prim_pairs = pairs_of["AGG_STABLE.conservative"]
    jacs = {}
    for key, s in pairs_of.items():
        if key == "AGG_STABLE.conservative":
            continue
        u = prim_pairs | s
        jacs[key] = round(len(prim_pairs & s) / len(u), 4) if u else None

    reading = decide(prim, {"comparableJaccard": jacs}, sens, packed["OLD30"]["AGG_STABLE"]["conservative"])

    def slim_graph(g: dict) -> dict:
        keep = {k: g[k] for k in g if k not in {"reach", "edges"}}
        return keep

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "STABLE_HOSTILE_ORDER_AUDIT_V1",
        "parent": ["deck-pressure-v4", "topology-diagnostic-v2", "aggregation-sensitivity-audit-v1", "bilateral-cancellation-audit-v1"],
        "primaryObject": "ALL60 M_hostile AGG_STABLE conservative",
        "graphs": {scope: {view: {est: slim_graph(packed[scope][view][est]) for est in packed[scope][view]} for view in packed[scope]} for scope in packed},
        "sensitiveVsOrder": {**sens, "n": len(flips), "examples": examples},
        "comparableJaccardVsPrimary": jacs,
        "reading": reading,
        "not": ["deck ranking", "Hodge s as ranking", "worst/best", "Commander RPS", "R cutoff"],
        "safety": {"pressureEdited": False, "rThreshold": False, "newDecks": False, "rpsAuthorized": False, "hodgeSUsed": False},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "StableHostileOrderAudit",
                "version": "stable-hostile-order-audit-v1",
                "status": "REPORT_AND_WAIT",
                "parent": "deck-pressure-v4",
                "outcome": reading["code"],
                "note": "Not a ranking. Not Commander RPS. Minimal/maximal are not worst/best.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ALL60_AGG_cons": {k: prim[k] for k in prim if k not in {"topCoverRelations", "minimals", "maximals", "longestChainCommanders", "maxAntichainFound"}},
                "OLD30_AGG_cons": {k: packed["OLD30"]["AGG_STABLE"]["conservative"][k] for k in ("nEdges", "comparabilityFraction", "height", "width", "nWeakComponents", "transitiveReduction", "reductionFamilies")},
                "jaccard": jacs,
                "sensitive": sens,
                "reading": reading,
                "longest60": prim["longestChain"],
                "covers": prim["topCoverRelations"][:8],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

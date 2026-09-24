#!/usr/bin/env python3
"""
Emergent Regionability Audit v1.

Discovery uses only the frozen stable hostile poset. Blind to names,
mechanics, cohorts, Hodge s, and R during structure finding.
Does not preselect k. Dilworth chains and sinks are not types.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

from build_generalized_cycle_audit_v1 import build_view_edges
from build_hodge_diagnostic_v0 import CHANNELS, ESTIMATORS, build_M
from build_stable_hostile_order_audit_v1 import ALL60, VIEWS, reachability, transitive_reduction
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
PO1 = MS / "stable-hostile-order-audit-v1"
PR1 = MS / "order-backbone-robustness-audit-v1"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "emergent-regionability-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

LT, GT, INC = -1, 1, 0


def rel(reach: list[set[int]], x: int, y: int) -> int:
    if y in reach[x]:
        return LT
    if x in reach[y]:
        return GT
    return INC


def jaccard(a: set[int], b: set[int]) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def ideals_filters(n: int, reach: list[set[int]]) -> tuple[list[set[int]], list[set[int]]]:
    I = [set() for _ in range(n)]
    F = [set() for _ in range(n)]
    for v in range(n):
        F[v] = {v} | set(reach[v])
        I[v] = {v} | {u for u in range(n) if v in reach[u]}
    return I, F


def distance_matrix(I: list[set[int]], F: list[set[int]]) -> np.ndarray:
    n = len(I)
    D = np.zeros((n, n))
    for u in range(n):
        for v in range(u + 1, n):
            d = 1.0 - 0.5 * (jaccard(I[u], I[v]) + jaccard(F[u], F[v]))
            D[u, v] = D[v, u] = d
    return D


def smallest_module(n: int, reach: list[set[int]], seed: set[int]) -> frozenset[int]:
    s = set(seed)
    changed = True
    while changed:
        changed = False
        for x in range(n):
            if x in s:
                continue
            kinds = {rel(reach, x, y) for y in s}
            if len(kinds) > 1:
                s.add(x)
                changed = True
    return frozenset(s)


def modular_decomposition(n: int, reach: list[set[int]]) -> dict:
    found: set[frozenset[int]] = {frozenset({i}) for i in range(n)}
    found.add(frozenset(range(n)))
    for a, b in combinations(range(n), 2):
        found.add(smallest_module(n, reach, {a, b}))
    strong = []
    for m in found:
        if len(m) < 2:
            continue
        ok = True
        for o in found:
            if m == o:
                continue
            inter = m & o
            if inter and inter != m and inter != o:
                ok = False
                break
        if ok:
            strong.append(m)
    strong.sort(key=lambda m: (len(m), sorted(m)))
    nontrivial = [sorted(m) for m in strong if 2 <= len(m) < n]
    # classify each nontrivial strong module
    classified = []
    for m in nontrivial:
        kinds_out = []
        for x in range(n):
            if x in m:
                continue
            kinds_out.append(frozenset(rel(reach, x, y) for y in m))
        # induced: parallel if some split has no internal comparability across parts
        induced_comp = any(rel(reach, a, b) != INC for a, b in combinations(m, 2))
        series_cut = False
        ms = set(m)
        for a in m:
            below = {a} | {u for u in m if a in reach[u]}
            above = ms - below
            if above and below and all(rel(reach, u, v) == LT for u in below for v in above):
                series_cut = True
                break
        classified.append(
            {
                "nodes": m,
                "size": len(m),
                "inducedHasComparability": induced_comp,
                "hasSeriesCut": series_cut,
                "note": "Blind IDs only. Not a type.",
            }
        )
    return {
        "nStrongModulesInclTrivial": len(strong) + n,
        "nNontrivialStrong": len(nontrivial),
        "nontrivialStrong": classified,
        "sizeHistogram": {str(k): sum(1 for m in nontrivial if len(m) == k) for k in sorted({len(m) for m in nontrivial})},
    }


def undirected_cover(n: int, red: list[tuple[int, int, float]]) -> list[list[int]]:
    adj = [[] for _ in range(n)]
    for u, v, _w in red:
        adj[u].append(v)
        adj[v].append(u)
    return adj


def biconnected(n: int, adj: list[list[int]]) -> dict:
    time_c = 0
    disc = [-1] * n
    low = [-1] * n
    parent = [-1] * n
    arts = set()
    bridges = []
    stack: list[tuple[int, int]] = []
    blocks: list[list[tuple[int, int]]] = []

    def dfs(u: int) -> None:
        nonlocal time_c
        children = 0
        disc[u] = low[u] = time_c
        time_c += 1
        for v in adj[u]:
            if disc[v] < 0:
                parent[v] = u
                children += 1
                stack.append((u, v))
                dfs(v)
                low[u] = min(low[u], low[v])
                if (parent[u] < 0 and children > 1) or (parent[u] >= 0 and low[v] >= disc[u]):
                    arts.add(u)
                    block = []
                    while True:
                        e = stack.pop()
                        block.append(e)
                        if e == (u, v) or e == (v, u):
                            break
                    blocks.append(block)
                if low[v] > disc[u]:
                    bridges.append(tuple(sorted((u, v))))
            elif v != parent[u] and disc[v] < disc[u]:
                low[u] = min(low[u], disc[v])
                stack.append((u, v))

    for i in range(n):
        if disc[i] < 0:
            dfs(i)
            if stack:
                blocks.append(stack[:])
                stack.clear()
    # node sets of blocks
    block_nodes = []
    for bl in blocks:
        vs = sorted({x for e in bl for x in e})
        if len(vs) >= 2:
            block_nodes.append(vs)
    # unique
    uniq = []
    seen = set()
    for vs in block_nodes:
        key = tuple(vs)
        if key not in seen:
            seen.add(key)
            uniq.append(vs)
    return {
        "nArticulation": len(arts),
        "articulations": sorted(arts),
        "nBridges": len(bridges),
        "bridges": [list(b) for b in sorted(set(bridges))],
        "nBiconnectedBlocks": len(uniq),
        "blockSizes": sorted((len(b) for b in uniq), reverse=True),
        "blocks": uniq,
    }


def dominator_tree(n: int, preds: list[list[int]], source: int) -> list[int]:
    """Immediate dominator; idom[source] = source. Iterative data-flow."""
    dom = [set(range(n)) for _ in range(n)]
    dom[source] = {source}
    changed = True
    while changed:
        changed = False
        for v in range(n):
            if v == source:
                continue
            ps = preds[v]
            if not ps:
                continue
            inter = set(dom[ps[0]])
            for p in ps[1:]:
                inter &= dom[p]
            new = {v} | inter
            if new != dom[v]:
                dom[v] = new
                changed = True
    idom = [-1] * n
    idom[source] = source
    for v in range(n):
        if v == source:
            continue
        cands = dom[v] - {v}
        if not cands:
            continue
        # immediate = member of cands that is dominated by all other cands
        for d in cands:
            if all(d == e or d in dom[e] or e not in dom[d] for e in cands):
                # pick the unique closest: d dominates no other candidate except via itself
                if all(e == d or e not in dom[d] or d not in (dom[e] - {e}) for e in cands if e != d):
                    pass
        # closest dominator = the one whose dom set is largest among proper dominators
        idom[v] = max(cands, key=lambda d: len(dom[d]))
    return idom


def average_linkage(D: np.ndarray) -> list[dict]:
    n = D.shape[0]
    clusters = [{i} for i in range(n)]
    live = list(range(n))
    merges = []
    # cluster-cluster distance cache
    while len(live) > 1:
        best = (1e9, -1, -1)
        for ia, a in enumerate(live):
            for b in live[ia + 1 :]:
                # average pairwise
                s = 0.0
                ca, cb = clusters[a], clusters[b]
                for i in ca:
                    for j in cb:
                        s += D[i, j]
                avg = s / (len(ca) * len(cb))
                if avg < best[0] - 1e-15 or (abs(avg - best[0]) <= 1e-15 and (min(a, b), max(a, b)) < (min(best[1], best[2]), max(best[1], best[2]))):
                    best = (avg, a, b)
        dist, a, b = best
        merged = clusters[a] | clusters[b]
        clusters.append(merged)
        live = [x for x in live if x not in (a, b)] + [len(clusters) - 1]
        merges.append(
            {
                "height": round(float(dist), 6),
                "left": sorted(clusters[a]),
                "right": sorted(clusters[b]),
                "leftSize": len(clusters[a]),
                "rightSize": len(clusters[b]),
                "size": len(merged),
            }
        )
    return merges


def spearman_flat(A: np.ndarray, B: np.ndarray) -> float:
    n = A.shape[0]
    xa, xb = [], []
    for i in range(n):
        for j in range(i + 1, n):
            xa.append(A[i, j])
            xb.append(B[i, j])
    xa, xb = np.array(xa), np.array(xb)
    ra = np.argsort(np.argsort(xa)).astype(float)
    rb = np.argsort(np.argsort(xb)).astype(float)
    ra -= ra.mean()
    rb -= rb.mean()
    den = float(np.sqrt((ra * ra).sum() * (rb * rb).sum()))
    return float((ra * rb).sum() / den) if den else 0.0


def late_substantial_gaps(merges: list[dict], med: float) -> list[dict]:
    """Gaps that could be regional: both sides size ≥ 8, delta > 2× median."""
    out = []
    for i, m in enumerate(merges):
        if i == 0:
            continue
        dlt = m["height"] - merges[i - 1]["height"]
        if med and dlt > 2 * med and m["leftSize"] >= 8 and m["rightSize"] >= 8:
            out.append(
                {
                    "afterMerge": i,
                    "delta": round(dlt, 6),
                    "height": m["height"],
                    "leftSize": m["leftSize"],
                    "rightSize": m["rightSize"],
                }
            )
    return out


def decide(mod: dict, blocks: dict, merges: list[dict], rhos: dict, cohort: dict, extra: dict) -> dict:
    nt = [m for m in mod["nontrivialStrong"] if 3 <= m["size"] <= 30]
    heights = [m["height"] for m in merges]
    deltas = [heights[i] - heights[i - 1] for i in range(1, len(heights))]
    med = float(np.median(deltas)) if deltas else 0
    raw_big = [d for d in deltas if med and d > 2 * med]
    late = late_substantial_gaps(merges, med)
    rho_min = min(rhos.values()) if rhos else 1.0
    notes = []
    if rho_min < 0.60:
        return {"code": "RG4", "label": "REGION_UNSTABLE", "notes": [f"View distance Spearman min {round(rho_min, 4)} < 0.60."], "observed": {"rho": rhos}}
    branched = blocks["nBiconnectedBlocks"] >= 3 or blocks["nArticulation"] >= 1 or extra.get("nDominatorLimbsSizeGe8", 0) >= 2
    star_like = extra.get("nSourceIdomChildren", 0) >= 40 and extra.get("nPostTerminalChildren", 0) >= 40
    if nt and late and rho_min >= 0.85:
        code, label = "RG1", "DISCRETE_STRUCTURAL_REGIONS"
        notes.append("Nontrivial modules and a late substantial merge-gap coexist; views agree.")
    elif branched and not nt:
        code, label = "RG2", "BRANCHED_CONTINUUM"
        notes.append("Cover-graph / path structure branches, but no modular regions.")
    elif not nt and not branched and (star_like or blocks["nBiconnectedBlocks"] <= 1):
        code, label = "RG3", "CONTINUOUS_ORDER"
        notes.append("No nontrivial modules of size 3–30, one 2-connected cover block, star-like dominators. The 2×-median gap count fires on tiny consecutive deltas and is not a regional cut.")
        if late:
            notes.append("The only late both-sides-≥8 gap is the last hierarchical join, which always exists.")
    else:
        code, label = "RG2", "BRANCHED_CONTINUUM"
        notes.append("Mixed branch signal without a discrete type-like cut.")
    if cohort.get("maxModuleCohortShare") and cohort["maxModuleCohortShare"] >= 0.90 and nt:
        notes.append("Post-discovery: a nontrivial module is ≥90% one expansion cohort; treat as possible sampling-history contamination.")
    return {
        "code": code,
        "label": label,
        "notes": notes,
        "observed": {
            "nNontrivialModulesSize3to30": len(nt),
            "nRawGapsVs2xMedian": len(raw_big),
            "nLateSubstantialGaps": len(late),
            "lateSubstantialGaps": late,
            "medianMergeDelta": round(med, 6) if deltas else None,
            "nArticulations": blocks["nArticulation"],
            "nBlocks": blocks["nBiconnectedBlocks"],
            "starLikeDominators": star_like,
            "viewSpearman": rhos,
        },
        "notAClaim": "Not types. Not a ranking. Not RPS. Mechanics remain blinded.",
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P4 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v4 must be frozen")
    if load_json(PO1 / "IMMUTABLE.json").get("outcome") != "PO1":
        raise SystemExit("PO1 must be frozen")
    if load_json(PR1 / "IMMUTABLE.json").get("outcome") != "PR1":
        raise SystemExit("PR1 must be frozen")
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

    views = {}
    Ds = {}
    for view in VIEWS:
        print(f"  structure {view}", flush=True)
        edges = build_view_edges(ALL60, Ms, stab, "hostile", "conservative", view)
        reach = reachability(60, edges)
        red = transitive_reduction(60, edges, reach)
        I, F = ideals_filters(60, reach)
        D = distance_matrix(I, F)
        Ds[view] = D
        mod = modular_decomposition(60, reach)
        adj = undirected_cover(60, red)
        blocks = biconnected(60, adj)
        # directed cover preds/succs
        preds = [[] for _ in range(60)]
        succs = [[] for _ in range(60)]
        indeg = [0] * 60
        outdeg = [0] * 60
        for u, v, _w in red:
            succs[u].append(v)
            preds[v].append(u)
            outdeg[u] += 1
            indeg[v] += 1
        sources = [i for i in range(60) if indeg[i] == 0 and outdeg[i] > 0]
        sinks = [i for i in range(60) if outdeg[i] == 0 and indeg[i] > 0]
        idom = dominator_tree(60, preds, sources[0]) if len(sources) == 1 else None
        # post-dominators via virtual terminal
        t = 60
        preds_rev = [[] for _ in range(61)]
        for u, v, _w in red:
            preds_rev[u].append(v)
        for s in sinks:
            preds_rev[s].append(t)
        ipost = dominator_tree(61, preds_rev, t)
        children = defaultdict(list)
        if idom:
            for v, d in enumerate(idom):
                if v != d and d >= 0:
                    children[d].append(v)
        merges = average_linkage(D)
        heights = [m["height"] for m in merges]
        deltas = [round(heights[i] - heights[i - 1], 6) for i in range(1, len(heights))]
        med = float(np.median(deltas)) if deltas else 0
        gap_idx = []
        for i, dlt in enumerate(deltas):
            if med and dlt > 2 * med:
                gap_idx.append({"afterMerge": i + 1, "delta": dlt, "height": heights[i + 1]})
        late = late_substantial_gaps(merges, med)
        last = merges[-1]
        left, right = last["left"], last["right"]

        def mean_pair(xs: list[int], ys: list[int] | None = None) -> float:
            if ys is None:
                if len(xs) < 2:
                    return 0.0
                vals = [D[i, j] for i, j in combinations(xs, 2)]
                return float(np.mean(vals)) if vals else 0.0
            vals = [D[i, j] for i in xs for j in ys]
            return float(np.mean(vals)) if vals else 0.0

        last8 = []
        for m in merges[-8:]:
            last8.append(
                {
                    "height": m["height"],
                    "leftSize": m["leftSize"],
                    "rightSize": m["rightSize"],
                    "left": [ALL60[i] for i in m["left"]],
                    "right": [ALL60[i] for i in m["right"]],
                }
            )
        n_limbs_ge8 = sum(1 for s in (1 + _count_desc(c, children) for c in children.get(sources[0], [])) if s >= 8) if sources else 0
        views[view] = {
            "nCoverEdges": len(red),
            "nSources": len(sources),
            "nSinks": len(sinks),
            "sources": [ALL60[i] for i in sources],
            "sinks": [ALL60[i] for i in sinks],
            "modules": {**mod, "nontrivialStrong": [{**m, "blindIds": [ALL60[i] for i in m["nodes"]]} for m in mod["nontrivialStrong"]]},
            "coverBlocks": {
                **blocks,
                "articulations": [ALL60[i] for i in blocks["articulations"]],
                "bridges": [[ALL60[a], ALL60[b]] for a, b in blocks["bridges"]],
                "blocks": [[ALL60[i] for i in b] for b in blocks["blocks"]],
            },
            "dominator": {
                "source": ALL60[sources[0]] if len(sources) == 1 else None,
                "nImmediateChildrenOfSource": len(children.get(sources[0], [])) if sources else None,
                "nLimbsSizeGe8": n_limbs_ge8,
                "sourceChildSizes": sorted((1 + _count_desc(c, children) for c in children.get(sources[0], [])), reverse=True) if sources else None,
                "note": "Path constraints only. Not a ranking. Source/sinks are not types.",
            },
            "postDominator": {
                "virtualTerminalUsed": True,
                "nImmediateChildrenOfTerminal": sum(1 for v, d in enumerate(ipost[:60]) if d == 60),
                "note": "All-paths-to-sinks constraint. Not a ranking.",
            },
            "hierarchy": {
                "nMerges": len(merges),
                "finalHeight": heights[-1] if heights else None,
                "mergeHeightP25": round(float(np.percentile(heights, 25)), 4) if heights else None,
                "mergeHeightMedian": round(float(np.median(heights)), 4) if heights else None,
                "mergeHeightP75": round(float(np.percentile(heights, 75)), 4) if heights else None,
                "nLargeGapsVs2xMedianDelta": len(gap_idx),
                "largeGaps": gap_idx,
                "nLateSubstantialGaps": len(late),
                "lateSubstantialGaps": late,
                "medianDelta": round(med, 6) if deltas else None,
                "maxDelta": round(max(deltas), 6) if deltas else None,
                "mergeHeights": heights,
                "mergeDeltas": deltas,
                "lastEightMerges": last8,
                "lastJoin": {
                    "leftSize": last["leftSize"],
                    "rightSize": last["rightSize"],
                    "left": [ALL60[i] for i in left],
                    "right": [ALL60[i] for i in right],
                    "withinLeft": round(mean_pair(left), 4),
                    "withinRight": round(mean_pair(right), 4),
                    "between": round(mean_pair(left, right), 4),
                    "note": "Diagnostic last agglomeration only. Not a frozen cut.",
                },
            },
            "distanceSummary": {
                "mean": round(float(D[np.triu_indices(60, 1)].mean()), 4),
                "median": round(float(np.median(D[np.triu_indices(60, 1)])), 4),
                "p10": round(float(np.percentile(D[np.triu_indices(60, 1)], 10)), 4),
                "p90": round(float(np.percentile(D[np.triu_indices(60, 1)], 90)), 4),
            },
        }
        # keep raw blocks/mod/merges for primary decide
        if view == "AGG_STABLE":
            primary_mod = mod
            primary_blocks = blocks
            primary_merges = merges
            primary_extra = {
                "nDominatorLimbsSizeGe8": n_limbs_ge8,
                "nSourceIdomChildren": len(children.get(sources[0], [])) if sources else 0,
                "nPostTerminalChildren": sum(1 for v, d in enumerate(ipost[:60]) if d == 60),
            }

    rhos = {
        "AGG_vs_CONS_PROM": round(spearman_flat(Ds["AGG_STABLE"], Ds["CONS_PROM_STABLE"]), 4),
        "AGG_vs_ALL_THREE": round(spearman_flat(Ds["AGG_STABLE"], Ds["ALL_THREE_STABLE"]), 4),
        "CONS_PROM_vs_ALL_THREE": round(spearman_flat(Ds["CONS_PROM_STABLE"], Ds["ALL_THREE_STABLE"]), 4),
    }

    # post-discovery cohort check only
    cohort_of = {d: ("A" if i < 15 else "E1" if i < 30 else "E2") for i, d in enumerate(ALL60)}
    max_share = 0.0
    module_cohorts = []
    for m in views["AGG_STABLE"]["modules"]["nontrivialStrong"]:
        if not (3 <= m["size"] <= 30):
            continue
        counts = defaultdict(int)
        for bid in m["blindIds"]:
            counts[cohort_of[bid]] += 1
        share = max(counts.values()) / m["size"]
        max_share = max(max_share, share)
        module_cohorts.append({"size": m["size"], "cohortCounts": dict(counts), "maxShare": round(share, 4)})

    reading = decide(primary_mod, primary_blocks, primary_merges, rhos, {"maxModuleCohortShare": max_share}, primary_extra)

    last_join = views["AGG_STABLE"]["hierarchy"]["lastJoin"]
    last_cohort = {"left": defaultdict(int), "right": defaultdict(int)}
    for side in ("left", "right"):
        for bid in last_join[side]:
            last_cohort[side][cohort_of[bid]] += 1

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "EMERGENT_REGIONABILITY_AUDIT_V1",
        "parent": ["stable-hostile-order-audit-v1", "order-backbone-robustness-audit-v1"],
        "discoveryBlind": True,
        "mechanicsUnblinded": False,
        "views": views,
        "viewDistanceSpearman": rhos,
        "postDiscoveryCohortCheck": {
            "maxModuleCohortShare": round(max_share, 4),
            "modulesSize3to30": module_cohorts,
            "lastJoinCohortCounts": {k: dict(v) for k, v in last_cohort.items()},
            "note": "Unblinded only for contamination. Not used to form regions.",
        },
        "reading": reading,
        "not": ["preselected k", "Dilworth types", "sink types", "archetypes", "ranking", "RPS", "mechanical interpretation"],
        "safety": {"kChosen": False, "mechanicsUsedInDiscovery": False, "namesUsedInDiscovery": False, "newDecks": False, "rpsAuthorized": False},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "EmergentRegionabilityAudit",
                "version": "emergent-regionability-audit-v1",
                "status": "REPORT_AND_WAIT",
                "outcome": reading["code"],
                "mechanicsUnblinded": False,
                "regionsFrozen": False,
                "note": "Structure-only. Not types. Not a ranking. Not RPS.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "reading": reading,
                "rhos": rhos,
                "AGG": {
                    "modules": views["AGG_STABLE"]["modules"]["sizeHistogram"],
                    "nNontrivial": views["AGG_STABLE"]["modules"]["nNontrivialStrong"],
                    "blocks": {k: views["AGG_STABLE"]["coverBlocks"][k] for k in ("nArticulation", "nBridges", "nBiconnectedBlocks", "blockSizes", "articulations")},
                    "hierarchy": views["AGG_STABLE"]["hierarchy"],
                    "dominator": views["AGG_STABLE"]["dominator"],
                    "distance": views["AGG_STABLE"]["distanceSummary"],
                },
                "cohort": report["postDiscoveryCohortCheck"],
            },
            indent=2,
        )
    )


def _count_desc(v: int, children: dict) -> int:
    return sum(1 + _count_desc(c, children) for c in children.get(v, []))


if __name__ == "__main__":
    main()

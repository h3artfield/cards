#!/usr/bin/env python3
"""
Generalized Cycle Structure Audit v1 — frozen sealed 30.

Pressure v3 + Hodge v1 only. No cycle enumeration of all simple cycles.
s is not a ranking. No RPS claim.
"""

from __future__ import annotations

import hashlib
import heapq
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import LinearConstraint, Bounds, milp
from scipy.sparse import csr_matrix

from build_hodge_diagnostic_v0 import (
    CH_KEY,
    CHANNELS,
    ESTIMATORS,
    MATERIAL,
    ablation_family,
    build_M,
)
from mechanical_hodge_v0 import decompose
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P3 = MS / "deck-pressure-v3"
H1 = MS / "hodge-diagnostic-v1"
CEX = MS / "corpus-expansion-v1"
PROF2 = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "generalized-cycle-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

VIEWS = ("ALL_MATERIAL", "AGG_STABLE", "CONS_PROM_STABLE", "ALL_THREE_STABLE")


def names_of() -> dict[str, str]:
    return {row["blindId"]: (row.get("wantedCommander") or row["blindId"]).split(",")[0] for row in load_json(CEX / "sealed-key.json")["key"]}


def sign(x: float) -> int:
    if x > 1e-9:
        return 1
    if x < -1e-9:
        return -1
    return 0


def tarjan(n: int, adj: list[list[int]]) -> list[list[int]]:
    index = 0
    stack: list[int] = []
    on = [False] * n
    idx = [-1] * n
    low = [0] * n
    comps: list[list[int]] = []

    def strong(v: int) -> None:
        nonlocal index
        idx[v] = low[v] = index
        index += 1
        stack.append(v)
        on[v] = True
        for w in adj[v]:
            if idx[w] < 0:
                strong(w)
                low[v] = min(low[v], low[w])
            elif on[w]:
                low[v] = min(low[v], idx[w])
        if low[v] == idx[v]:
            comp = []
            while True:
                w = stack.pop()
                on[w] = False
                comp.append(w)
                if w == v:
                    break
            comps.append(sorted(comp))

    for v in range(n):
        if idx[v] < 0:
            strong(v)
    return comps


def widest_return(n: int, edges: list[tuple[int, int, float]], src: int, dst: int) -> tuple[float, list[int] | None]:
    """Max-min path src → dst. Returns (bottleneck, node path) or (-inf, None)."""
    adj: list[list[tuple[int, float]]] = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
    best = [-1.0] * n
    parent = [-1] * n
    best[src] = float("inf")
    heap = [(-best[src], src)]
    while heap:
        negb, u = heapq.heappop(heap)
        b = -negb
        if b < best[u] - 1e-15:
            continue
        if u == dst and src != dst:
            break
        for v, w in adj[u]:
            cand = w if b == float("inf") else min(b, w)
            if cand > best[v] + 1e-15:
                best[v] = cand
                parent[v] = u
                heapq.heappush(heap, (-cand, v))
    if src == dst:
        return 0.0, None
    if best[dst] < 0:
        return -1.0, None
    path = [dst]
    while path[-1] != src:
        p = parent[path[-1]]
        if p < 0:
            return -1.0, None
        path.append(p)
        if len(path) > n + 1:
            return -1.0, None
    path.reverse()
    return best[dst], path


def bottleneck_cycles(n: int, edges: list[tuple[int, int, float]]) -> list[dict]:
    found: dict[tuple[int, ...], dict] = {}
    for u, v, w in edges:
        ret, path = widest_return(n, edges, v, u)
        if path is None or ret < 0:
            continue
        nodes = [u] + path  # u, v, ..., u
        if nodes[-1] != u:
            continue
        cyc = nodes[:-1]
        if len(cyc) < 3 or len(cyc) > 10:
            continue
        if len(set(cyc)) != len(cyc):
            continue
        b = min(w, ret)
        key = canon_cycle(cyc)
        rec = found.get(key)
        if rec is None or b > rec["bottleneck"]:
            found[key] = {"nodes": list(key), "length": len(key), "bottleneck": round(float(b), 4), "mean": None}
    return sorted(found.values(), key=lambda r: (-r["bottleneck"], r["length"]))


def canon_cycle(nodes: list[int]) -> tuple[int, ...]:
    i = min(range(len(nodes)), key=lambda k: nodes[k])
    return tuple(nodes[i:] + nodes[:i])


def karp_max_mean(n: int, edges: list[tuple[int, int, float]]) -> dict | None:
    if not edges:
        return None
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
    best = None
    for start in range(n):
        if not adj[start]:
            continue
        neg = float("-inf")
        dp = [[neg] * n for _ in range(n + 1)]
        prev = [[-1] * n for _ in range(n + 1)]
        dp[0][start] = 0.0
        for k in range(1, n + 1):
            for u in range(n):
                if dp[k - 1][u] == neg:
                    continue
                for v, w in adj[u]:
                    val = dp[k - 1][u] + w
                    if val > dp[k][v]:
                        dp[k][v] = val
                        prev[k][v] = u
        for v in range(n):
            if dp[n][v] == neg:
                continue
            mean = float("inf")
            crit_k = None
            for k in range(n):
                if dp[k][v] == neg:
                    continue
                m = (dp[n][v] - dp[k][v]) / float(n - k)
                if m < mean:
                    mean = m
                    crit_k = k
            if crit_k is None:
                continue
            if best is None or mean > best["mean"]:
                # reconstruct walk of length n ending at v
                walk = [v]
                cur, k = v, n
                while k > 0:
                    p = prev[k][cur]
                    if p < 0:
                        walk = []
                        break
                    walk.append(p)
                    cur = p
                    k -= 1
                walk.reverse()
                cyc = extract_cycle(walk)
                if cyc and 3 <= len(cyc) <= n:
                    best = {"nodes": list(canon_cycle(cyc)), "length": len(cyc), "mean": round(float(mean), 4), "startTried": start}
    return best


def extract_cycle(walk: list[int]) -> list[int] | None:
    last = {}
    for i, x in enumerate(walk):
        if x in last and i - last[x] >= 3:
            return walk[last[x] : i]
        last[x] = i
    return None


def min_feedback_arc(n: int, edges: list[tuple[int, int, float]]) -> dict:
    """Exact min-weight FAS via pairwise-order ILP. Empty/acyclic → 0."""
    if not edges:
        return {"status": "EXACT", "nRemoved": 0, "massRemoved": 0.0, "totalMass": 0.0, "fraction": 0.0}
    comps = tarjan(n, [[] for _ in range(n)])
    adj = [[] for _ in range(n)]
    for u, v, _w in edges:
        adj[u].append(v)
    comps = [c for c in tarjan(n, adj) if len(c) >= 2]
    total = float(sum(w for _u, _v, w in edges))
    if not comps:
        return {"status": "EXACT", "nRemoved": 0, "massRemoved": 0.0, "totalMass": round(total, 6), "fraction": 0.0, "method": "no_nontrivial_scc"}
    removed_mass = 0.0
    n_removed = 0
    for comp in comps:
        idx = {v: i for i, v in enumerate(comp)}
        k = len(comp)
        sub = [(idx[u], idx[v], w) for u, v, w in edges if u in idx and v in idx]
        if not sub:
            continue
        if k == 2:
            # at most a 2-cycle; remove the lighter edge (or both if needed — 2-cycle needs 1)
            both = [e for e in sub]
            if len(both) >= 2:
                both.sort(key=lambda e: e[2])
                removed_mass += both[0][2]
                n_removed += 1
            continue
        mass, cnt, st = _fas_ilp(k, sub)
        if st != "EXACT":
            return {"status": st, "nRemoved": None, "massRemoved": None, "totalMass": round(total, 6), "fraction": None}
        removed_mass += mass
        n_removed += cnt
    return {
        "status": "EXACT",
        "nRemoved": n_removed,
        "massRemoved": round(removed_mass, 6),
        "totalMass": round(total, 6),
        "fraction": round(removed_mass / total, 6) if total else 0.0,
        "method": "pairwise-order ILP on each SCC (HiGHS)",
    }


def _fas_ilp(k: int, edges: list[tuple[int, int, float]]) -> tuple[float, int, str]:
    # y[i,j] i<j : 1 if i before j in a linear order
    pair = {}
    t = 0
    for i in range(k):
        for j in range(i + 1, k):
            pair[(i, j)] = t
            t += 1
    nvar = t
    c = np.zeros(nvar)
    for u, v, w in edges:
        if u == v:
            continue
        if u < v:
            # backward if v before u = not (u before v) = 1 - y[u,v]
            c[pair[(u, v)]] -= w
        else:
            # backward if v before u; v < u so y[v,u] means v before u
            c[pair[(v, u)]] += w
    # constant from u<v edges: we subtracted w*y, but cost is w*(1-y) = w - w*y
    const = sum(w for u, v, w in edges if u < v)
    rows, cols, data, lb, ub = [], [], [], [], []
    r = 0
    for i in range(k):
        for j in range(i + 1, k):
            for m in range(j + 1, k):
                rows += [r, r, r]
                cols += [pair[(i, j)], pair[(j, m)], pair[(i, m)]]
                data += [1.0, 1.0, -1.0]
                lb.append(-np.inf)
                ub.append(1.0)
                r += 1
                rows += [r, r, r]
                cols += [pair[(i, j)], pair[(j, m)], pair[(i, m)]]
                data += [-1.0, -1.0, 1.0]
                lb.append(-np.inf)
                ub.append(0.0)
                r += 1
    A = csr_matrix((data, (rows, cols)), shape=(r, nvar))
    cons = LinearConstraint(A, np.array(lb), np.array(ub))
    bounds = Bounds(np.zeros(nvar), np.ones(nvar))
    integrality = np.ones(nvar, dtype=int)
    res = milp(c=c, constraints=cons, bounds=bounds, integrality=integrality, options={"time_limit": 30.0})
    if res.status != 0 or res.x is None:
        return 0.0, 0, f"ILP_{res.status}_{res.message}"
    obj = float(res.fun) + const
    # count removed
    x = res.x
    nrem = 0
    for u, v, w in edges:
        if u == v:
            continue
        before = x[pair[(u, v)]] >= 0.5 if u < v else x[pair[(v, u)]] < 0.5
        # u before v?
        if u < v:
            u_before_v = x[pair[(u, v)]] >= 0.5
        else:
            u_before_v = x[pair[(v, u)]] < 0.5
        if not u_before_v:
            nrem += 1
    return max(0.0, obj), nrem, "EXACT"


def cycle_weight_stats(nodes: list[int], wdir: dict[tuple[int, int], float]) -> dict:
    ws = []
    for a, b in zip(nodes, nodes[1:] + nodes[:1]):
        ws.append(wdir.get((a, b), 0.0))
    return {"bottleneck": round(min(ws), 4) if ws else None, "mean": round(float(np.mean(ws)), 4) if ws else None, "weights": [round(x, 4) for x in ws]}


def proof_leg(by: dict, a: str, b: str, channel: str) -> dict:
    rec = by[(a, b)]
    tops = rec.get("top_hostile_mechanisms") if channel != "supportive" else rec.get("top_supportive_mechanisms")
    top = (tops or [{}])[0]
    edge = top.get("edge") or ""
    cap = edge.split(" → ")[0] if edge else None
    return {"dir": f"{a}→{b}", "top": top, "family": ablation_family(cap) if cap else None, "H_credible": rec.get("H_credible")}


def family_class(fams: list[str | None]) -> str:
    known = [f for f in fams if f]
    uniq = set(known)
    if not known:
        return "UNKNOWN"
    if len(uniq) == 1 and list(uniq)[0] == "removal":
        return "same-mechanism dominated"
    if len(uniq) == 1:
        return "same-mechanism dominated"
    if len(uniq) == 2:
        return "two-family"
    return "multi-family"


def build_view_edges(ids: list[str], Ms: dict, stab: dict, channel: str, estimator: str, view: str) -> list[tuple[int, int, float]]:
    ix = {d: i for i, d in enumerate(ids)}
    out = []
    for a, b in ((x, y) for i, x in enumerate(ids) for y in ids[i + 1 :]):
        vals = {e: float(Ms[channel][e][ix[a], ix[b]]) for e in ESTIMATORS}
        m = vals[estimator]
        if abs(m) < MATERIAL:
            continue
        src, dst = (a, b) if m > 0 else (b, a)
        w = abs(m)
        key = (a, b)
        st = stab[key][channel]
        signs = {sign(vals[e]) for e in ESTIMATORS}
        cons_prom = sign(vals["conservative"]) == sign(vals["prominence"]) and abs(vals["conservative"]) >= MATERIAL and abs(vals["prominence"]) >= MATERIAL
        all3 = len(signs) == 1 and 0 not in signs and all(abs(vals[e]) >= MATERIAL for e in ESTIMATORS)
        if view == "ALL_MATERIAL":
            ok = True
        elif view == "AGG_STABLE":
            ok = st == "STABLE_DIRECTION"
        elif view == "CONS_PROM_STABLE":
            ok = cons_prom
        else:
            ok = all3
        if ok:
            out.append((ix[src], ix[dst], w))
    return out


def pack_cycle(rec: dict, ids: list[str], names: dict, by: dict, channel: str, wdir: dict) -> dict:
    nodes = rec["nodes"]
    bids = [ids[i] for i in nodes]
    stats = cycle_weight_stats(nodes, wdir)
    proofs = [proof_leg(by, bids[i], bids[(i + 1) % len(bids)], channel) for i in range(len(bids))]
    fams = [p["family"] for p in proofs]
    return {
        **rec,
        **stats,
        "blindIds": bids,
        "commanders": [names.get(x, x) for x in bids],
        "families": fams,
        "mechanismClass": family_class(fams),
        "proofs": proofs,
        "materialLegs": all((w or 0) >= MATERIAL for w in stats["weights"]),
    }


def robustness_of(cycle_nodes: list[int], ids: list[str], Ms: dict, channel: str) -> str:
    def ok(est: str) -> bool:
        M = Ms[channel][est]
        for a, b in zip(cycle_nodes, cycle_nodes[1:] + cycle_nodes[:1]):
            if M[a, b] < MATERIAL:
                return False
        return True

    c, p, s = ok("conservative"), ok("prominence"), ok("presence")
    if not c:
        return "REJECTED"
    if c and p and s:
        return "CORE_ROBUST"
    if c and p:
        return "PRIMARY_ROBUST"
    return "ESTIMATOR_SENSITIVE"


def scc_report(n: int, edges: list[tuple[int, int, float]], ids: list[str], names: dict, M: np.ndarray) -> dict:
    adj = [[] for _ in range(n)]
    for u, v, _w in edges:
        adj[u].append(v)
    comps = tarjan(n, adj)
    nontrivial = [c for c in comps if len(c) >= 2]
    sizes = sorted((len(c) for c in comps), reverse=True)
    node_in = set(i for c in nontrivial for i in c)
    mass_all = sum(w for _u, _v, w in edges)
    mass_in = sum(w for u, v, w in edges if u in node_in and v in node_in)
    local = []
    for comp in nontrivial:
        if len(comp) < 3:
            continue
        sub_e = [(u, v, w) for u, v, w in edges if u in comp and v in comp]
        remap = {v: i for i, v in enumerate(comp)}
        sub_n = len(comp)
        sub_edges = [(remap[u], remap[v], w) for u, v, w in sub_e]
        mask = np.zeros((sub_n, sub_n), dtype=bool)
        for u, v, _w in sub_edges:
            mask[u, v] = mask[v, u] = True
        subM = M[np.ix_(comp, comp)]
        dec = decompose(subM, mask)
        bn = bottleneck_cycles(sub_n, sub_edges)[:3]
        mmc = karp_max_mean(sub_n, sub_edges)
        fas = min_feedback_arc(sub_n, sub_edges)

        def lift(rec):
            if not rec:
                return None
            lifted = [comp[i] for i in rec["nodes"]]
            return {**rec, "blindIds": [ids[i] for i in lifted], "commanders": [names.get(ids[i], ids[i]) for i in lifted]}

        local.append(
            {
                "nodes": [ids[i] for i in comp],
                "commanders": [names.get(ids[i], ids[i]) for i in comp],
                "n": len(comp),
                "nEdges": len(sub_e),
                "internalMass": round(sum(w for _u, _v, w in sub_e), 4),
                "hodge": dec["energy"],
                "feedback": fas,
                "strongestBottleneck": lift(bn[0]) if bn else None,
                "maxMeanCycle": lift(mmc),
            }
        )
    return {
        "nSCC": len(comps),
        "nNontrivial": len(nontrivial),
        "sizeDistribution": sizes,
        "largest": sizes[0] if sizes else 0,
        "fractionNodesInNontrivial": round(len(node_in) / n, 4),
        "fractionMassInsideSCC": round(mass_in / mass_all, 4) if mass_all else None,
        "localRegions": local,
    }


def outcome_of(summary: dict) -> dict:
    h = summary["hostile"]["conservative"]["AGG_STABLE"]
    fas = h["feedback"]
    frac = fas.get("fraction")
    locals_ = h["scc"].get("localRegions") or []
    robust = summary["leadingRobust"]
    n_core = sum(1 for r in robust if r["robustnessClass"] == "CORE_ROBUST" and r["mechanismClass"] in {"two-family", "multi-family"})
    n_pri = sum(1 for r in robust if r["robustnessClass"] == "PRIMARY_ROBUST" and r["mechanismClass"] in {"two-family", "multi-family"})
    local_high = any((r.get("feedback") or {}).get("fraction") is not None and r["feedback"]["fraction"] >= 0.15 and r["n"] >= 4 for r in locals_)
    local_curl = any((r.get("hodge") or {}).get("cyclicFraction") is not None and r["hodge"]["cyclicFraction"] >= 0.12 for r in locals_)
    label = "G1_GLOBALLY_AND_LOCALLY_MOSTLY_TRANSITIVE"
    notes = []
    if frac is not None and frac < 0.08 and not local_high and n_core == 0:
        label = "G1_GLOBALLY_AND_LOCALLY_MOSTLY_TRANSITIVE"
        notes.append("Stable hostile directional mass is nearly acyclic; no robust multi-family local engine.")
    if (local_high or local_curl) and frac is not None and frac < 0.12 and (n_core + n_pri) >= 1:
        label = "G2_GLOBALLY_TRANSITIVE_LOCALLY_ROBUSTLY_CYCLIC"
        notes.append("Global feedback is small, but a local region carries a robust cycle.")
    if (n_pri + n_core) == 0 and any(r["robustnessClass"] == "ESTIMATOR_SENSITIVE" for r in robust):
        label = "G3_APPARENT_LOCAL_CYCLES_ESTIMATOR_SENSITIVE"
        notes.append("Longer loops do not survive conservative+prominence together.")
    if frac is not None and frac >= 0.15 and n_core >= 1:
        label = "G4_BROAD_ROBUST_NONTRANSITIVITY"
        notes.append("A material share of stable directional mass is cyclic and CORE_ROBUST.")
    return {"reading": label, "notes": notes, "notAClaim": "Not a Commander RPS result.", "observed": {"stableHostileFeedbackFraction": frac, "nCoreMultiFamily": n_core, "nPrimaryMultiFamily": n_pri, "nLocalRegions": len(locals_)}}


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P3 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v3 must be frozen")
    if load_json(H1 / "IMMUTABLE.json").get("qa") != "DIAGNOSTIC_COMPLETE":
        raise SystemExit("Hodge v1 must be DIAGNOSTIC_COMPLETE")
    if load_json(PROF2 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must stay frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    names = names_of()
    slim = load_json(P3 / "pairs-summary.json")
    by = {(r["from"], r["to"]): r for r in slim}
    ids = [f"D{i:02d}" for i in range(1, 31)]
    print("building M…", flush=True)
    Ms = {ch: {est: build_M(ids, by, ch, est) for est in ESTIMATORS} for ch in CHANNELS}
    stab_raw = load_json(H1 / "edge-stability.json")["edges"]
    stab = {(r["a"], r["b"]): r for r in stab_raw}

    packed = {}
    leading = []
    for ch in CHANNELS:
        packed[ch] = {}
        for est in ESTIMATORS:
            packed[ch][est] = {}
            for view in VIEWS:
                print(f"  {ch} {est} {view}", flush=True)
                edges = build_view_edges(ids, Ms, stab, ch, est, view)
                wdir = {(u, v): w for u, v, w in edges}
                scc = scc_report(30, edges, ids, names, Ms[ch][est])
                bn = bottleneck_cycles(30, edges)
                mmc = karp_max_mean(30, edges)
                fas = min_feedback_arc(30, edges) if est == "conservative" or view in {"AGG_STABLE", "ALL_THREE_STABLE"} else None
                buckets = {"3": [], "4": [], "5": [], "6-10": []}
                for raw in bn:
                    packed_c = pack_cycle(raw, ids, names, by, ch, wdir)
                    packed_c["robustnessClass"] = robustness_of(raw["nodes"], ids, Ms, ch)
                    if packed_c["length"] == 3:
                        buckets["3"].append(packed_c)
                    elif packed_c["length"] == 4:
                        buckets["4"].append(packed_c)
                    elif packed_c["length"] == 5:
                        buckets["5"].append(packed_c)
                    else:
                        buckets["6-10"].append(packed_c)
                    if ch == "hostile" and est == "conservative" and view == "AGG_STABLE":
                        leading.append(packed_c)
                packed[ch][est][view] = {
                    "nDirected": len(edges),
                    "mass": round(sum(w for _u, _v, w in edges), 4),
                    "scc": {
                        "nSCC": scc["nSCC"],
                        "nNontrivial": scc["nNontrivial"],
                        "sizeDistribution": scc["sizeDistribution"],
                        "largest": scc["largest"],
                        "fractionNodesInNontrivial": scc["fractionNodesInNontrivial"],
                        "fractionMassInsideSCC": scc["fractionMassInsideSCC"],
                        "localRegions": scc["localRegions"] if est == "conservative" else [],
                    },
                    "feedback": fas,
                    "maxMeanCycle": pack_cycle(mmc, ids, names, by, ch, wdir) if mmc else None,
                    "strongestBottleneckByLength": {k: v[:5] for k, v in buckets.items()},
                    "nBottleneckCyclesFound": len(bn),
                }

    leading.sort(key=lambda r: (-(r.get("bottleneck") or 0), r["length"]))
    for r in leading:
        if r["mechanismClass"] == "same-mechanism dominated" or not r["materialLegs"]:
            r["robustnessClass"] = "REJECTED"
    reading = outcome_of({"hostile": packed["hostile"], "leadingRobust": leading[:40]})

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "GENERALIZED_CYCLE_AUDIT_V1",
        "parent": ["deck-pressure-v3", "hodge-diagnostic-v1"],
        "scope": "sealed 30",
        "enumeration": "No brute-force simple-cycle listing. SCC + widest-path bottleneck + Karp MMC + exact FAS ILP.",
        "materialEpsilon": MATERIAL,
        "reading": reading,
        "not": ["Commander RPS claim", "deck ranking", "win probability"],
        "expansionV2": "INVALID / unused",
        "safety": {"rpsAuthorized": False, "newK": False, "newDecks": False, "expansionV2Used": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "graphs.json").write_text(json.dumps(packed, indent=2) + "\n", encoding="utf-8")
    (OUT / "leading-cycles.json").write_text(json.dumps(leading[:25], indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "GeneralizedCycleAudit",
                "version": "generalized-cycle-audit-v1",
                "status": "DIAGNOSTIC_COMPLETE",
                "outcome": reading["reading"],
                "parent": "deck-pressure-v3",
                "note": "Not a Commander RPS claim. Expansion-v2 attempt 1 was not used.",
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
                "hostileConsALL": {k: packed["hostile"]["conservative"]["ALL_MATERIAL"][k] for k in ("nDirected", "mass", "feedback") if k in packed["hostile"]["conservative"]["ALL_MATERIAL"]},
                "hostileConsSTABLE": {
                    "nDirected": packed["hostile"]["conservative"]["AGG_STABLE"]["nDirected"],
                    "scc": {k: packed["hostile"]["conservative"]["AGG_STABLE"]["scc"][k] for k in packed["hostile"]["conservative"]["AGG_STABLE"]["scc"] if k != "localRegions"},
                    "feedback": packed["hostile"]["conservative"]["AGG_STABLE"]["feedback"],
                    "mmc": packed["hostile"]["conservative"]["AGG_STABLE"]["maxMeanCycle"],
                    "nBN": packed["hostile"]["conservative"]["AGG_STABLE"]["nBottleneckCyclesFound"],
                    "local": packed["hostile"]["conservative"]["AGG_STABLE"]["scc"]["localRegions"],
                },
                "hostileConsPROM": packed["hostile"]["conservative"]["CONS_PROM_STABLE"]["feedback"],
                "hostileAll3": packed["hostile"]["conservative"]["ALL_THREE_STABLE"]["feedback"],
                "netConsSTABLE": packed["net"]["conservative"]["AGG_STABLE"]["feedback"],
                "topStableHostile": [
                    {
                        "robustnessClass": r["robustnessClass"],
                        "mechanismClass": r["mechanismClass"],
                        "length": r["length"],
                        "bottleneck": r["bottleneck"],
                        "commanders": r["commanders"],
                        "families": r["families"],
                    }
                    for r in leading[:12]
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

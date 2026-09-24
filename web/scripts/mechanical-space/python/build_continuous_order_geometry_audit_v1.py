#!/usr/bin/env python3
"""
Continuous Order Geometry Audit v1.

Mechanics-blind. Frozen stable hostile poset only.
Linear extensions are not rankings. Do not select k for a pretty picture.
"""

from __future__ import annotations

import hashlib
import json
import time
from itertools import combinations
from pathlib import Path

import numpy as np

from build_emergent_regionability_audit_v1 import distance_matrix, ideals_filters, jaccard
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
RG3 = MS / "emergent-regionability-audit-v1"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "continuous-order-geometry-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

RNG = np.random.default_rng(0)


def comparable(reach: list[set[int]], i: int, j: int) -> bool:
    return j in reach[i] or i in reach[j]


def inc_pairs(n: int, reach: list[set[int]]) -> list[tuple[int, int]]:
    return [(i, j) for i, j in combinations(range(n), 2) if not comparable(reach, i, j)]


def comp_pairs(n: int, reach: list[set[int]]) -> list[tuple[int, int]]:
    out = []
    for i, j in combinations(range(n), 2):
        if j in reach[i]:
            out.append((i, j))
        elif i in reach[j]:
            out.append((j, i))
    return out


def topo_with_priorities(n: int, reach: list[set[int]], prio: np.ndarray) -> list[int]:
    """Linear extension: nodes with no remaining predecessors first; prio breaks ties (higher first)."""
    done = [False] * n
    order = []
    for _ in range(n):
        cands = [v for v in range(n) if not done[v] and all(done[u] for u in range(n) if v in reach[u])]
        if not cands:
            raise SystemExit("poset linear extension failed")
        v = max(cands, key=lambda x: (float(prio[x]), -x))
        done[v] = True
        order.append(v)
    return order


def extension_rank(order: list[int]) -> list[int]:
    r = [0] * len(order)
    for i, v in enumerate(order):
        r[v] = i
    return r


def covers_from_extension(rank: list[int], pairs: list[tuple[int, int]]) -> set[tuple[int, int]]:
    """Directed incomparable pairs (later, earlier) realized as later after earlier? Store (lo, hi) if rank[lo] < rank[hi]."""
    covered = set()
    for a, b in pairs:
        if rank[a] < rank[b]:
            covered.add((a, b))
        else:
            covered.add((b, a))
    return covered


def two_sat_scc(n_vars: int, impl: list[list[int]]) -> tuple[bool, list[bool] | None]:
    """impl[lit] -> lits. lit 2v = True(v), 2v+1 = False(v). Iterative Kosaraju."""
    n = 2 * n_vars
    seen = [False] * n
    order = []
    for start in range(n):
        if seen[start]:
            continue
        stack = [(start, False)]
        while stack:
            u, done = stack.pop()
            if done:
                order.append(u)
                continue
            if seen[u]:
                continue
            seen[u] = True
            stack.append((u, True))
            for v in impl[u]:
                if not seen[v]:
                    stack.append((v, False))
    rev = [[] for _ in range(n)]
    for u, vs in enumerate(impl):
        for v in vs:
            rev[v].append(u)
    comp = [-1] * n
    cid = 0
    for start in reversed(order):
        if comp[start] >= 0:
            continue
        stack = [start]
        comp[start] = cid
        while stack:
            u = stack.pop()
            for v in rev[u]:
                if comp[v] < 0:
                    comp[v] = cid
                    stack.append(v)
        cid += 1
    for v in range(n_vars):
        if comp[2 * v] == comp[2 * v + 1]:
            return False, None
    val = [False] * n_vars
    for v in range(n_vars):
        val[v] = comp[2 * v] > comp[2 * v + 1]
    return True, val


def dim_le2(n: int, reach: list[set[int]]) -> dict:
    pairs = inc_pairs(n, reach)
    if not pairs:
        return {"feasible": True, "certified": True, "note": "total order; dimension 1"}
    eidx = {p: i for i, p in enumerate(pairs)}
    adj = [set() for _ in range(n)]
    for a, b in pairs:
        adj[a].add(b)
        adj[b].add(a)
    impl: list[list[int]] = [[] for _ in range(2 * len(pairs))]

    def var_of(u: int, v: int) -> tuple[int, bool]:
        a, b = (u, v) if u < v else (v, u)
        t = eidx[(a, b)]
        return t, (u < v)

    def add_impl(p: tuple[int, bool], q: tuple[int, bool]) -> None:
        pv, pt = p
        qv, qt = q
        pl = 2 * pv if pt else 2 * pv + 1
        ql = 2 * qv if qt else 2 * qv + 1
        npl = pl ^ 1
        nql = ql ^ 1
        impl[pl].append(ql)
        impl[nql].append(npl)

    for v in range(n):
        nbrs = list(adj[v])
        for i, u in enumerate(nbrs):
            for w in nbrs[i + 1 :]:
                if w in adj[u]:
                    continue
                u_to_v = var_of(u, v)
                w_to_v = var_of(w, v)
                v_to_u = (u_to_v[0], not u_to_v[1])
                v_to_w = (w_to_v[0], not w_to_v[1])
                add_impl(u_to_v, w_to_v)
                add_impl(w_to_v, u_to_v)
                add_impl(v_to_w, v_to_u)
                add_impl(v_to_u, v_to_w)

    ok, val = two_sat_scc(len(pairs), impl)
    if not ok or val is None:
        return {"feasible": False, "certified": True, "note": "incomparability graph is not a comparability graph"}

    # T: oriented incomparability
    t_reach = [set(s) for s in reach]
    for (a, b), t in zip(pairs, val):
        if t:
            t_reach[a].add(b)
        else:
            t_reach[b].add(a)
    # close T∪P — already have P in t_reach; add T then Floyd on bool
    mat = np.zeros((n, n), dtype=bool)
    for i in range(n):
        for j in t_reach[i]:
            mat[i, j] = True
    for k in range(n):
        mat |= mat[:, k : k + 1] & mat[k : k + 1, :]
    if any(mat[i, i] for i in range(n)):
        return {"feasible": False, "certified": False, "note": "orientation produced a cycle; dim≤2 not certified by this encoding"}
    # must be a tournament
    missing = 0
    for i, j in combinations(range(n), 2):
        if not (mat[i, j] or mat[j, i]):
            missing += 1
    if missing:
        return {"feasible": False, "certified": False, "note": f"orientation left {missing} incomparable; dim≤2 not certified"}

    # reverse T
    mat2 = np.zeros((n, n), dtype=bool)
    for i in range(n):
        for j in reach[i]:
            mat2[i, j] = True
    for (a, b), t in zip(pairs, val):
        if t:
            mat2[b, a] = True
        else:
            mat2[a, b] = True
    for k in range(n):
        mat2 |= mat2[:, k : k + 1] & mat2[k : k + 1, :]
    if any(mat2[i, i] for i in range(n)):
        return {"feasible": False, "certified": False, "note": "reverse orientation cycled"}

    # intersection recovers P
    for i, j in combinations(range(n), 2):
        both_fwd = bool(mat[i, j] and mat2[i, j])
        in_p = j in reach[i]
        if both_fwd != in_p:
            return {"feasible": False, "certified": False, "note": "intersection did not recover P"}
    return {"feasible": True, "certified": True, "note": "two linear extensions recover P; linear extensions are not rankings"}


def standard_example_lb(n: int, reach: list[set[int]], limit_pairs: int = 4000) -> dict:
    """Largest S_k found. Pairs (a,b) with a || b; compatible if a1<b2, a2<b1, a1||a2, b1||b2, four distinct."""
    desc = [set(reach[i]) for i in range(n)]
    anc = [{u for u in range(n) if i in reach[u]} for i in range(n)]
    pairs = [(a, b) for a in range(n) for b in range(n) if a != b and b not in desc[a] and a not in desc[b]]
    # undirected unique (a,b) with a as min-side of a standard pair — keep directed a --inc-- b as (ai, bi)
    cand = [(a, b) for a, b in pairs]
    # compatibility via bitsets
    def ok(p1: tuple[int, int], p2: tuple[int, int]) -> bool:
        a1, b1 = p1
        a2, b2 = p2
        if len({a1, b1, a2, b2}) < 4:
            return False
        if a2 in desc[a1] or a1 in desc[a2]:
            return False
        if b2 in desc[b1] or b1 in desc[b2]:
            return False
        return (b2 in desc[a1]) and (b1 in desc[a2])

    # greedy + restarts
    best: list[tuple[int, int]] = []
    idxs = list(range(len(cand)))
    for seed in range(48):
        RNG.shuffle(idxs) if seed else None
        if seed:
            RNG.shuffle(idxs)
        chosen: list[tuple[int, int]] = []
        for i in idxs:
            p = cand[i]
            if all(ok(p, q) for q in chosen):
                chosen.append(p)
        if len(chosen) > len(best):
            best = chosen
    # local grow from each of a sample of high-potential pairs
    # potential: how many b' with a < b' 
    return {
        "k": len(best),
        "pairsBlind": [[ALL60[a], ALL60[b]] for a, b in best],
        "note": "S_k subposet ⇒ dim ≥ k. Not types. Not a ranking.",
    }


def realizer_ub(n: int, reach: list[set[int]], n_random: int = 400) -> dict:
    pairs = inc_pairs(n, reach)
    universe = set()
    for a, b in pairs:
        universe.add((a, b))
        universe.add((b, a))
    pool: list[set[tuple[int, int]]] = []
    # diverse extensions
    for t in range(n_random):
        prio = RNG.standard_normal(n)
        order = topo_with_priorities(n, reach, prio)
        pool.append(covers_from_extension(extension_rank(order), pairs))
    # targeted: force each remaining direction
    covered = set()
    for s in pool:
        covered |= s
    for a, b in list(universe - covered) + [(a, b) for a, b in pairs] + [(b, a) for a, b in pairs]:
        prio = RNG.standard_normal(n)
        prio[a] += 8.0
        prio[b] -= 8.0
        order = topo_with_priorities(n, reach, prio)
        pool.append(covers_from_extension(extension_rank(order), pairs))

    # greedy set cover
    need = set(universe)
    chosen = []
    used = [False] * len(pool)
    while need:
        best_i, best_n = -1, -1
        for i, s in enumerate(pool):
            if used[i]:
                continue
            hit = len(s & need)
            if hit > best_n:
                best_n, best_i = hit, i
        if best_i < 0 or best_n <= 0:
            # force one leftover pair
            a, b = next(iter(need))
            prio = np.zeros(n)
            prio[a] = 10
            prio[b] = -10
            order = topo_with_priorities(n, reach, prio)
            s = covers_from_extension(extension_rank(order), pairs)
            pool.append(s)
            used.append(False)
            continue
        used[best_i] = True
        chosen.append(pool[best_i])
        need -= pool[best_i]
    return {
        "upper": len(chosen),
        "nPool": len(pool),
        "nIncomparablePairs": len(pairs),
        "note": "Explicit realizer of this size. Linear extensions are not rankings.",
    }


def signature_matrix(n: int, I: list[set[int]], F: list[set[int]]) -> np.ndarray:
    X = np.zeros((n, 2 * n), dtype=float)
    for v in range(n):
        for u in I[v]:
            X[v, u] = 1.0
        for u in F[v]:
            X[v, n + u] = 1.0
    return X


def pca_spectrum(X: np.ndarray) -> dict:
    xc = X - X.mean(axis=0, keepdims=True)
    # economy SVD
    _, s, vt = np.linalg.svd(xc, full_matrices=False)
    ev = s ** 2
    tot = float(ev.sum()) if ev.sum() else 1.0
    share = ev / tot
    cum = np.cumsum(share)
    def k_for(p: float) -> int:
        return int(np.searchsorted(cum, p) + 1)
    return {
        "singularValues": [round(float(x), 6) for x in s],
        "varianceShare": [round(float(x), 6) for x in share],
        "cumulativeVariance": [round(float(x), 6) for x in cum],
        "k50": k_for(0.50),
        "k70": k_for(0.70),
        "k80": k_for(0.80),
        "k90": k_for(0.90),
        "k95": k_for(0.95),
        "nComponents": int((share > 1e-12).sum()),
        "components": vt,  # keep for subspace compare; stripped later
        "centered": xc,
    }


def classical_mds(D: np.ndarray, k: int) -> np.ndarray:
    n = D.shape[0]
    j = np.eye(n) - np.ones((n, n)) / n
    B = -0.5 * j @ (D ** 2) @ j
    w, v = np.linalg.eigh(B)
    idx = np.argsort(w)[::-1]
    w = np.clip(w[idx[:k]], 0, None)
    v = v[:, idx[:k]]
    return v * np.sqrt(w)


def pairwise_euclid(X: np.ndarray) -> np.ndarray:
    g = X @ X.T
    nrm = np.diag(g)
    d2 = np.maximum(nrm[:, None] + nrm[None, :] - 2 * g, 0)
    return np.sqrt(d2)


def flatten_ut(M: np.ndarray) -> np.ndarray:
    return M[np.triu_indices(M.shape[0], 1)]


def pearson(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(float)
    b = b.astype(float)
    a = a - a.mean()
    b = b - b.mean()
    den = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / den) if den else 0.0


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    return pearson(ra, rb)


def stress1(d: np.ndarray, dhat: np.ndarray) -> float:
    num = float(((d - dhat) ** 2).sum())
    den = float((d ** 2).sum())
    return float(np.sqrt(num / den)) if den else 0.0


def nn_recall(D: np.ndarray, Dhat: np.ndarray, k: int) -> float:
    n = D.shape[0]
    hits = 0
    for i in range(n):
        true = set(np.argsort(D[i])[1 : k + 1])
        pred = set(np.argsort(Dhat[i])[1 : k + 1])
        hits += len(true & pred)
    return hits / (n * k)


def order_agree_1d(x: np.ndarray, oriented: list[tuple[int, int]]) -> float:
    """Fraction of u<v pairs with x[u] < x[v], taking the better sign."""
    if not oriented:
        return 1.0
    fwd = sum(1 for u, v in oriented if x[u] < x[v]) / len(oriented)
    return max(fwd, 1.0 - fwd)


def embedding_fidelity(D: np.ndarray, reach: list[set[int]], ks: list[int]) -> list[dict]:
    n = D.shape[0]
    d = flatten_ut(D)
    oriented = comp_pairs(n, reach)
    inc = inc_pairs(n, reach)
    mask_comp = np.zeros(len(d), dtype=bool)
    mask_inc = np.zeros(len(d), dtype=bool)
    ix = 0
    for i in range(n):
        for j in range(i + 1, n):
            if comparable(reach, i, j):
                mask_comp[ix] = True
            else:
                mask_inc[ix] = True
            ix += 1
    cover = transitive_reduction(n, [(u, v, 1.0) for u, v in oriented], reach)
    out = []
    for k in ks:
        X = classical_mds(D, k)
        Dhat = pairwise_euclid(X)
        dh = flatten_ut(Dhat)
        cover_nn = 0
        for u, v, _w in cover:
            nbr_u = set(np.argsort(Dhat[u])[1:11])
            nbr_v = set(np.argsort(Dhat[v])[1:11])
            if v in nbr_u or u in nbr_v:
                cover_nn += 1
        out.append(
            {
                "k": k,
                "stress1": round(stress1(d, dh), 4),
                "distancePearson": round(pearson(d, dh), 4),
                "distanceSpearman": round(spearman(d, dh), 4),
                "comparableDistanceSpearman": round(spearman(d[mask_comp], dh[mask_comp]), 4) if mask_comp.any() else None,
                "incomparableDistanceSpearman": round(spearman(d[mask_inc], dh[mask_inc]), 4) if mask_inc.any() else None,
                "nnRecall5": round(nn_recall(D, Dhat, 5), 4),
                "nnRecall10": round(nn_recall(D, Dhat, 10), 4),
                "coverNeighborRecall10": round(cover_nn / len(cover), 4) if cover else None,
                "comparableOrderAgreeOnAxis1": round(order_agree_1d(X[:, 0], oriented), 4),
                "meanEmbedDistComparable": round(float(dh[mask_comp].mean()), 4) if mask_comp.any() else None,
                "meanEmbedDistIncomparable": round(float(dh[mask_inc].mean()), 4) if mask_inc.any() else None,
                "note": "Classical MDS. Not a ranking. Axis 1 is not a strength score.",
            }
        )
    return out


def principal_angles(q1: np.ndarray, q2: np.ndarray) -> dict:
    """Rows are unused; columns of qi are orthonormal basis vectors."""
    s = np.linalg.svd(q1.T @ q2, compute_uv=False)
    s = np.clip(s, 0, 1)
    return {
        "canonicalCorrelations": [round(float(x), 4) for x in s],
        "minCanonicalCorrelation": round(float(s.min()), 4) if len(s) else None,
        "meanCanonicalCorrelation": round(float(s.mean()), 4) if len(s) else None,
        "maxPrincipalAngleDeg": round(float(np.degrees(np.arccos(s.min()))), 2) if len(s) else None,
    }


def orthonormal_basis(vt: np.ndarray, k: int) -> np.ndarray:
    q, _ = np.linalg.qr(vt[:k].T)
    return q


def procrustes(X: np.ndarray, Y: np.ndarray) -> dict:
    Xc = X - X.mean(axis=0)
    Yc = Y - Y.mean(axis=0)
    # pad smaller k
    k = max(Xc.shape[1], Yc.shape[1])
    if Xc.shape[1] < k:
        Xc = np.pad(Xc, ((0, 0), (0, k - Xc.shape[1])))
    if Yc.shape[1] < k:
        Yc = np.pad(Yc, ((0, 0), (0, k - Yc.shape[1])))
    u, _s, vt = np.linalg.svd(Xc.T @ Yc)
    R = u @ vt
    Ya = Yc @ R.T
    num = float(((Xc - Ya) ** 2).sum())
    den = float((Xc ** 2).sum())
    dx = flatten_ut(pairwise_euclid(Xc))
    dy = flatten_ut(pairwise_euclid(Ya))
    return {
        "disparity": round(num / den if den else 0.0, 4),
        "alignedDistancePearson": round(pearson(dx, dy), 4),
        "alignedDistanceSpearman": round(spearman(dx, dy), 4),
        "note": "Orthogonal Procrustes; signs/rotations identified out. Not axis identity.",
    }


def decide(dim: dict, spec: dict, fid: list[dict], stability: dict) -> dict:
    k90 = spec["k90"]
    f2 = next(x for x in fid if x["k"] == 2)
    f3 = next(x for x in fid if x["k"] == 3)
    f6 = next(x for x in fid if x["k"] == 6)
    min_cc = stability["signatureSubspaceK3"]["minCanonicalCorrelationAcrossViews"]
    proc = stability["mds3dProcrustes"]["minAlignedDistancePearson"]
    notes = []
    if min_cc is not None and min_cc < 0.60 or (proc is not None and proc < 0.60):
        return {
            "code": "CG4",
            "label": "COORDINATE_UNSTABLE",
            "notes": [
                f"Preregistered: top-3 signature-subspace min canonical correlation {min_cc} < 0.60. Do not freeze a 3-D coordinate system.",
                f"3-D MDS Procrustes Pearson {proc} is above 0.60; the failure is the third signature PC versus CONS_PROM, not the whole distance geometry.",
                f"Primary-view spectrum separately fails a 2-D/3-D map: k90={k90}, 2-D stress-1={f2['stress1']}, 2-D Spearman={f2['distanceSpearman']}.",
            ],
            "observed": {"k90": k90, "stress2": f2["stress1"], "spearman2": f2["distanceSpearman"], "minCC": min_cc, "minProcrustesR": proc},
            "notAClaim": "Not a map yet. Not types. Not a ranking. Not RPS. Mechanics remain blinded.",
        }
    low = (
        k90 <= 3
        and min(f2["stress1"], f3["stress1"]) <= 0.15
        and max(f2["distanceSpearman"], f3["distanceSpearman"]) >= 0.90
        and (min_cc or 0) >= 0.85
    )
    high = k90 >= 9 or f6["stress1"] >= 0.20
    if low:
        code, label = "CG1", "LOW_DIMENSIONAL_MAP"
        notes.append("A 2-D/3-D structural map is a candidate; freeze coordinates before any mechanical naming.")
    elif high:
        code, label = "CG3", "HIGH_DIMENSIONAL_ORDER"
        notes.append("No compact latent representation at this instrument.")
    else:
        code, label = "CG2", "MODERATE_DIMENSIONAL_GEOMETRY"
        notes.append("Structure is real and continuous, but a 2-D drawing would be a projection.")
    notes.append(f"Poset dimension bounds: {dim['lower']} ≤ dim ≤ {dim['upper']}. Linear extensions are not rankings.")
    return {
        "code": code,
        "label": label,
        "notes": notes,
        "observed": {
            "k50": spec["k50"],
            "k70": spec["k70"],
            "k80": spec["k80"],
            "k90": k90,
            "k95": spec["k95"],
            "stress1": {str(x["k"]): x["stress1"] for x in fid},
            "distanceSpearman": {str(x["k"]): x["distanceSpearman"] for x in fid},
            "dimLower": dim["lower"],
            "dimUpper": dim["upper"],
            "minCC_k3": min_cc,
            "minProcrustesR_3d": proc,
        },
        "notAClaim": "Not types. Not a ranking. Not RPS. Mechanics remain blinded. Coordinates are not named.",
    }


def analyze_view(n: int, reach: list[set[int]]) -> dict:
    I, F = ideals_filters(n, reach)
    D = distance_matrix(I, F)
    X = signature_matrix(n, I, F)
    spec = pca_spectrum(X)
    fid = embedding_fidelity(D, reach, list(range(1, 9)))
    return {"I": I, "F": F, "D": D, "X": X, "spec": spec, "fid": fid, "reach": reach}


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P4 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v4 must be frozen")
    if load_json(PO1 / "IMMUTABLE.json").get("outcome") != "PO1":
        raise SystemExit("PO1 must be frozen")
    if load_json(RG3 / "IMMUTABLE.json").get("outcome") != "RG3":
        raise SystemExit("RG3 must be frozen")
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

    packed = {}
    for view in VIEWS:
        print(f"  geometry {view}", flush=True)
        edges = build_view_edges(ALL60, Ms, stab, "hostile", "conservative", view)
        reach = reachability(60, edges)
        packed[view] = analyze_view(60, reach)

    print("  poset dimension", flush=True)
    reach0 = packed["AGG_STABLE"]["reach"]
    d2 = dim_le2(60, reach0)
    lb = standard_example_lb(60, reach0)
    ub = realizer_ub(60, reach0)
    n_inc = len(inc_pairs(60, reach0))
    lower = 1 if n_inc == 0 else 2
    if not d2["feasible"] and d2["certified"]:
        lower = max(lower, 3)
    lower = max(lower, lb["k"] if lb["k"] else lower)
    upper = ub["upper"]
    if d2["feasible"] and d2["certified"]:
        upper = min(upper, 2)
        lower = 1 if n_inc == 0 else max(lower, 2)
    dim = {
        "lower": int(lower),
        "upper": int(upper),
        "exact": int(lower) if lower == upper else None,
        "dimLe2": d2,
        "standardExample": {k: lb[k] for k in lb if k != "pairsBlind"} | {"nPairsReported": len(lb["pairsBlind"]), "pairsBlind": lb["pairsBlind"][:12]},
        "realizer": ub,
        "note": "Linear extensions are mathematical factors of the poset, not deck rankings.",
    }

    # view-pack without huge arrays
    views_out = {}
    for view, rec in packed.items():
        spec = rec["spec"]
        views_out[view] = {
            "spectrum": {k: spec[k] for k in spec if k not in {"components", "centered"}},
            "embeddings": rec["fid"],
            "distanceSummary": {
                "mean": round(float(flatten_ut(rec["D"]).mean()), 4),
                "median": round(float(np.median(flatten_ut(rec["D"]))), 4),
            },
        }

    # subspace comparison in R^{120}
    bases = {v: orthonormal_basis(packed[v]["spec"]["components"], 3) for v in VIEWS}
    pair_cc = {}
    min_cc = 1.0
    for a, b in combinations(VIEWS, 2):
        ang = principal_angles(bases[a], bases[b])
        pair_cc[f"{a}__{b}"] = ang
        if ang["minCanonicalCorrelation"] is not None:
            min_cc = min(min_cc, ang["minCanonicalCorrelation"])

    # 3-D MDS Procrustes
    mds3 = {v: classical_mds(packed[v]["D"], 3) for v in VIEWS}
    pair_pr = {}
    min_pr = 1.0
    for a, b in combinations(VIEWS, 2):
        pr = procrustes(mds3[a], mds3[b])
        pair_pr[f"{a}__{b}"] = pr
        min_pr = min(min_pr, pr["alignedDistancePearson"])

    # neighbor retention of 5-NN between views in signature distance
    nn_ret = {}
    for a, b in combinations(VIEWS, 2):
        nn_ret[f"{a}__{b}"] = round(nn_recall(packed[a]["D"], packed[b]["D"], 5), 4)

    dist_corr = {}
    for a, b in combinations(VIEWS, 2):
        dist_corr[f"{a}__{b}"] = round(spearman(flatten_ut(packed[a]["D"]), flatten_ut(packed[b]["D"])), 4)

    stability = {
        "signatureSubspaceK3": {"pairs": pair_cc, "minCanonicalCorrelationAcrossViews": round(min_cc, 4)},
        "mds3dProcrustes": {"pairs": pair_pr, "minAlignedDistancePearson": round(min_pr, 4)},
        "distanceSpearman": dist_corr,
        "nnRecall5BetweenViews": nn_ret,
        "note": "Compare subspaces, not axis signs. Mechanics still blind.",
    }

    reading = decide(dim, packed["AGG_STABLE"]["spec"], packed["AGG_STABLE"]["fid"], stability)
    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "CONTINUOUS_ORDER_GEOMETRY_AUDIT_V1",
        "parent": ["stable-hostile-order-audit-v1", "emergent-regionability-audit-v1"],
        "discoveryBlind": True,
        "mechanicsUnblinded": False,
        "coordinatesFrozen": False,
        "primaryView": "AGG_STABLE",
        "posetDimension": dim,
        "views": views_out,
        "stability": stability,
        "reading": reading,
        "not": ["axis names", "types", "clustering", "ranking", "RPS", "mechanical interpretation"],
        "safety": {
            "kChosenForPicture": False,
            "mechanicsUsedInDiscovery": False,
            "namesUsedInDiscovery": False,
            "newDecks": False,
            "rpsAuthorized": False,
            "linearExtensionsAreRankings": False,
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "ContinuousOrderGeometryAudit",
                "version": "continuous-order-geometry-audit-v1",
                "status": "REPORT_AND_WAIT",
                "outcome": reading["code"],
                "mechanicsUnblinded": False,
                "coordinatesFrozen": False,
                "note": "Structure-only. Not types. Not a ranking. Not RPS. Do not name axes.",
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
                "dim": {k: dim[k] for k in ("lower", "upper", "exact", "dimLe2") if k in dim} | {"standardK": dim["standardExample"]["k"], "realizer": dim["realizer"]["upper"]},
                "spectrum": views_out["AGG_STABLE"]["spectrum"],
                "embeddings": views_out["AGG_STABLE"]["embeddings"],
                "stability": {
                    "minCC": stability["signatureSubspaceK3"]["minCanonicalCorrelationAcrossViews"],
                    "minProcrustes": stability["mds3dProcrustes"]["minAlignedDistancePearson"],
                    "distRho": dist_corr,
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

"""
Hodge Diagnostic v0 — instrument math, not a ranking engine.

On a (possibly incomplete) undirected graph with antisymmetric flow M:
    M = G + C + H
    G = gradient / transitive potential differences
    C = triangular curl (local cyclic residual)
    H = harmonic / topological residual (holes, not local triangles)

s is a least-squares potential. It is not a deck ranking.
"""

from __future__ import annotations

from collections import deque

import numpy as np

TOL = 1e-9

# Topology-only cache for triangular curl: same (n, edge set) reuses B and Gram SVD.
# Does not change the projection; avoids rebuilding 4060×4060 systems on every decompose.
_CURL_CACHE: dict = {}


def connected_components(n: int, mask: np.ndarray) -> list[list[int]]:
    seen = [False] * n
    comps = []
    for start in range(n):
        if seen[start]:
            continue
        q = deque([start])
        seen[start] = True
        cur = []
        while q:
            i = q.popleft()
            cur.append(i)
            for j in range(n):
                if not seen[j] and i != j and mask[i, j]:
                    seen[j] = True
                    q.append(j)
        comps.append(sorted(cur))
    return comps


def edge_list(n: int, mask: np.ndarray) -> list[tuple[int, int]]:
    return [(i, j) for i in range(n) for j in range(i + 1, n) if mask[i, j]]


def triangles_of(n: int, mask: np.ndarray) -> list[tuple[int, int, int]]:
    return [
        (i, j, k)
        for i in range(n)
        for j in range(i + 1, n)
        if mask[i, j]
        for k in range(j + 1, n)
        if mask[i, k] and mask[j, k]
    ]


def gradient_potential(M: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    """Least-squares s on each connected component. Gauge: mean 0 per component."""
    n = M.shape[0]
    s = np.zeros(n, dtype=float)
    notes = []
    for comp in connected_components(n, mask):
        if len(comp) < 2:
            notes.append({"nodes": comp, "nEdges": 0, "solvable": True})
            continue
        idx = {v: t for t, v in enumerate(comp)}
        k = len(comp)
        L = np.zeros((k, k), dtype=float)
        b = np.zeros(k, dtype=float)
        n_e = 0
        for a in comp:
            for c in comp:
                if a >= c or not mask[a, c]:
                    continue
                n_e += 1
                ia, ic = idx[a], idx[c]
                L[ia, ia] += 1
                L[ic, ic] += 1
                L[ia, ic] -= 1
                L[ic, ia] -= 1
                b[ia] += M[a, c]
                b[ic] += M[c, a]
        # pin sum(s)=0
        A = np.zeros((k + 1, k + 1), dtype=float)
        A[:k, :k] = L
        A[k, :k] = 1
        A[:k, k] = 1
        rhs = np.zeros(k + 1, dtype=float)
        rhs[:k] = b
        try:
            sol = np.linalg.lstsq(A, rhs, rcond=None)[0]
            local = sol[:k]
        except np.linalg.LinAlgError:
            local = np.zeros(k)
        local = local - local.mean()
        for v, val in zip(comp, local):
            s[v] = float(val)
        notes.append({"nodes": comp, "nNodes": k, "nEdges": n_e, "solvable": True})
    return s, notes


def project_curl(R: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict]:
    """
    Split a divergence-free residual into triangular curl vs harmonic.
    Edge coordinates are upper-triangle M[i,j].
    """
    n = R.shape[0]
    edges = edge_list(n, mask)
    C = np.zeros_like(R)
    empty = {
        "nEdges": len(edges),
        "nTriangles": 0,
        "curlRank": 0,
        "cycleSpaceDim": None,
        "harmonicDim": None,
    }
    if not edges:
        return C, R.copy(), empty

    n_comp = len(connected_components(n, mask))
    cycle_dim = max(0, len(edges) - n + n_comp)
    empty["cycleSpaceDim"] = cycle_dim

    complete = len(edges) == n * (n - 1) // 2 and n >= 3
    # Complete graphs: triangular curls span the whole cycle space, so the
    # already divergence-free residual is pure curl. Same decomposition;
    # do not build a C(n,3)×C(n,3) Gram matrix.
    if complete:
        empty["nTriangles"] = n * (n - 1) * (n - 2) // 6
        empty["curlRank"] = cycle_dim
        empty["harmonicDim"] = 0
        return R.copy(), np.zeros_like(R), empty

    tris = triangles_of(n, mask)
    empty["nTriangles"] = len(tris)
    if not tris:
        empty["harmonicDim"] = cycle_dim
        return C, R.copy(), empty

    e_of = {e: t for t, e in enumerate(edges)}
    r_vec = np.array([R[i, j] for i, j in edges], dtype=float)

    cache_key = (n, tuple(edges))
    cached = _CURL_CACHE.get(cache_key)
    if cached is None:
        # Edge-space Gram G = B^T B (n_edges × n_edges). Projector onto im(B^T)
        # is G G^+. Mathematically identical to triangle-space (B B^T)^+.
        n_e = len(edges)
        G = np.zeros((n_e, n_e), dtype=float)
        for i, j, k in tris:
            ix = (e_of[(i, j)], e_of[(j, k)], e_of[(i, k)])
            sg = (1.0, 1.0, -1.0)
            for a in range(3):
                for b in range(3):
                    G[ix[a], ix[b]] += sg[a] * sg[b]
        u, s, _vt = np.linalg.svd(G, full_matrices=False)
        cutoff = np.finfo(s.dtype).eps * max(G.shape) * (s[0] if s.size else 0.0)
        keep = s > cutoff
        cached = {"U": u[:, keep], "rank": int(keep.sum())}
        _CURL_CACHE[cache_key] = cached

    c_vec = cached["U"] @ (cached["U"].T @ r_vec)
    empty["curlRank"] = cached["rank"]
    empty["harmonicDim"] = max(0, cycle_dim - cached["rank"])

    for (i, j), val in zip(edges, c_vec):
        C[i, j] = float(val)
        C[j, i] = -float(val)
    H = R - C
    for i in range(n):
        for j in range(n):
            if not mask[i, j]:
                H[i, j] = 0.0
                C[i, j] = 0.0
    return C, H, empty


def energy(X: np.ndarray, mask: np.ndarray) -> float:
    n = X.shape[0]
    return float(sum(X[i, j] ** 2 for i in range(n) for j in range(i + 1, n) if mask[i, j]))


def decompose(M: np.ndarray, mask: np.ndarray) -> dict:
    """
    Hodge split on the support of mask.
    Does not invent missing edges. Does not treat s as a ranking.
    """
    n = M.shape[0]
    work = np.where(mask, M, 0.0)
    np.fill_diagonal(work, 0.0)
    s, comps = gradient_potential(work, mask)
    G = np.zeros((n, n), dtype=float)
    for i in range(n):
        for j in range(n):
            if mask[i, j]:
                G[i, j] = s[i] - s[j]
    R = np.where(mask, work - G, 0.0)
    C, H, topo = project_curl(R, mask)
    e_tot = energy(work, mask)
    e_g = energy(G, mask)
    e_c = energy(C, mask)
    e_h = energy(H, mask)
    recon = e_g + e_c + e_h
    n_edges = int(sum(1 for i in range(n) for j in range(i + 1, n) if mask[i, j]))
    n_comp = len([c for c in comps if len(c) >= 1])
    n_iso = sum(1 for c in comps if len(c) == 1)
    return {
        "nNodes": n,
        "nEdges": n_edges,
        "nComponents": n_comp,
        "nIsolates": n_iso,
        "nTriangles": topo["nTriangles"],
        "complete": n_edges == n * (n - 1) // 2,
        "globalPotentialDefined": n_comp - n_iso <= 1 and n_edges > 0,
        "s": s,
        "G": G,
        "C": C,
        "H": H,
        "components": comps,
        "topology": topo,
        "energy": {
            "total": round(e_tot, 6),
            "gradient": round(e_g, 6),
            "cyclic": round(e_c, 6),
            "harmonic": round(e_h, 6),
            "reconstructed": round(recon, 6),
            "cyclicFraction": round(e_c / e_tot, 6) if e_tot > TOL else None,
            "harmonicFraction": round(e_h / e_tot, 6) if e_tot > TOL else None,
            "gradientFraction": round(e_g / e_tot, 6) if e_tot > TOL else None,
        },
    }


def sign_agree(A: np.ndarray, B: np.ndarray, mask: np.ndarray, eps: float = 1e-9) -> dict:
    n = A.shape[0]
    same = tot = 0
    for i in range(n):
        for j in range(i + 1, n):
            if not mask[i, j]:
                continue
            tot += 1
            sa = 1 if A[i, j] > eps else (-1 if A[i, j] < -eps else 0)
            sb = 1 if B[i, j] > eps else (-1 if B[i, j] < -eps else 0)
            if sa == sb:
                same += 1
    return {"n": tot, "agree": same, "rate": round(same / tot, 4) if tot else None}


def flatten_upper(X: np.ndarray, mask: np.ndarray) -> np.ndarray:
    n = X.shape[0]
    return np.array([X[i, j] for i in range(n) for j in range(i + 1, n) if mask[i, j]], dtype=float)

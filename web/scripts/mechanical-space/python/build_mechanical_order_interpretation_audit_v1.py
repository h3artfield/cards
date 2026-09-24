#!/usr/bin/env python3
"""
Mechanical Order Interpretation Audit v1.

Phase A freezes intrinsic PO1 descriptors while still blind to Profiles/K.
Phase B unblinds existing frozen mechanics as explanatory variables only.
No new coordinates, types, strength scores, or rankings.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

from build_aggregation_sensitivity_audit_v1 import deck_features
from build_emergent_regionability_audit_v1 import ideals_filters
from build_generalized_cycle_audit_v1 import build_view_edges
from build_hodge_diagnostic_v0 import ABLATION_NAMES, CHANNELS, ESTIMATORS, ablation_family, build_M
from build_k_v2 import compute_pairs
from build_order_backbone_robustness_audit_v1 import TERM_FLOOR, axes_of
from build_stable_hostile_order_audit_v1 import ALL60, reachability, transitive_reduction
from mechanical_k_v2 import PROFILE_QA_BLOCKED, SPLIT_PARENTS, polarity_blocked_caps
from mechanical_pressure_channels_v1 import HOSTILE, pair_channels
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
PO1 = MS / "stable-hostile-order-audit-v1"
PR1 = MS / "order-backbone-robustness-audit-v1"
CG4 = MS / "continuous-order-geometry-audit-v1"
ASA = MS / "aggregation-sensitivity-audit-v1"
PROF = MS / "expansion-v2-profiles-v2"
DIR = MS / "mechanical-directions-v22"
K3 = MS / "mechanical-pressure-k-v3.0"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "mechanical-order-interpretation-audit-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

HOT = 0.40
STRUCT_KEYS = (
    "ancestorCount",
    "descendantCount",
    "coverIndegree",
    "coverOutdegree",
    "depthFromSource",
    "coheightToSinks",
    "incomparabilityCount",
    "idealSize",
    "filterSize",
)


def rankdata(a: np.ndarray) -> np.ndarray:
    a = np.asarray(a, dtype=float)
    n = len(a)
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(n, dtype=float)
    i = 0
    while i < n:
        j = i
        while j + 1 < n and a[order[j + 1]] == a[order[i]]:
            j += 1
        ranks[order[i : j + 1]] = 0.5 * (i + j)
        i = j + 1
    return ranks


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) < 3:
        return 0.0
    if np.unique(a).size < 2 or np.unique(b).size < 2:
        return 0.0
    ra = rankdata(np.asarray(a, dtype=float))
    rb = rankdata(np.asarray(b, dtype=float))
    ra -= ra.mean()
    rb -= rb.mean()
    den = float(np.sqrt((ra * ra).sum() * (rb * rb).sum()))
    return float((ra * rb).sum() / den) if den else 0.0


def summarize(xs: list[float]) -> dict:
    if not xs:
        return {"n": 0, "mean": None, "median": None}
    a = np.array(xs, dtype=float)
    return {"n": len(xs), "mean": round(float(a.mean()), 4), "median": round(float(np.median(a)), 4)}


def eligible_axis(aid: str, rec: dict) -> bool:
    if aid in SPLIT_PARENTS or aid in PROFILE_QA_BLOCKED:
        return False
    return rec.get("role") != "broad"


def hot_ids(axis_map: dict) -> set[str]:
    return {
        k
        for k, rec in axis_map.items()
        if eligible_axis(k, rec) and float(rec.get("prominence") or 0) >= HOT
    }


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def cosine(u: np.ndarray, v: np.ndarray) -> float:
    den = float(np.linalg.norm(u) * np.linalg.norm(v))
    return float(np.dot(u, v) / den) if den else 0.0


def longest_from(n: int, start_set: list[int], succs: list[list[int]]) -> list[int]:
    dist = [0] * n
    indeg = [0] * n
    for u in range(n):
        for v in succs[u]:
            indeg[v] += 1
    # longest path from any start, only counting nodes reachable from starts
    reach = [False] * n
    q = list(start_set)
    for s in start_set:
        reach[s] = True
        dist[s] = 1
    seen = set(start_set)
    while q:
        u = q.pop()
        for v in succs[u]:
            if v not in seen:
                seen.add(v)
                reach[v] = True
                q.append(v)
    # relax in topo order of cover
    remaining = [indeg[i] for i in range(n)]
    q2 = [i for i in range(n) if remaining[i] == 0]
    order = []
    while q2:
        u = q2.pop()
        order.append(u)
        for v in succs[u]:
            remaining[v] -= 1
            if remaining[v] == 0:
                q2.append(v)
    for u in order:
        if not reach[u]:
            continue
        for v in succs[u]:
            if dist[u] + 1 > dist[v]:
                dist[v] = dist[u] + 1
    return dist


def decide(pos_best: float, n_pos_notable: int, comp_best: float, recip_best: float, cover_clear: bool) -> dict:
    notes = []
    if pos_best < 0.30 and recip_best < 0.25 and comp_best < 0.25:
        code, label = "MI4", "MECHANICAL_INTERPRETATION_WEAK"
        notes.append("Frozen Profiles-v2 / K terms do not explain structural roles or pair classes at the preregistered bars.")
    elif recip_best >= 0.40 and recip_best >= pos_best - 0.05:
        code, label = "MI3", "INCOMPARABILITY_HAS_STRUCTURE"
        notes.append("The strongest mechanical signal is why pairs are incomparable, not a global up-vs-down semantics.")
        if n_pos_notable >= 3:
            notes.append("Position also has notable correlates; they are secondary to the incomparability split.")
    elif n_pos_notable >= 3 and comp_best >= 0.30:
        code, label = "MI1", "INTERPRETABLE_CONTINUOUS_ORDER"
        notes.append("Existing mechanical factors associate with order position and comparability without types.")
    elif cover_clear and n_pos_notable == 0:
        code, label = "MI2", "LOCAL_MECHANISMS / NO_GLOBAL_SEMANTICS"
        notes.append("Cover terms are locally readable; global position is not mechanically coherent.")
    else:
        code, label = "MI2", "LOCAL_MECHANISMS / NO_GLOBAL_SEMANTICS"
        notes.append("Local cover composition is clearer than a global mechanical reading of position.")
    return {
        "code": code,
        "label": label,
        "notes": notes,
        "observed": {
            "bestPositionAbsRho": round(pos_best, 4),
            "nPositionNotable": n_pos_notable,
            "bestComparableSeparation": round(comp_best, 4),
            "bestReciprocalSeparation": round(recip_best, 4),
            "coverMotifsClear": cover_clear,
        },
        "notAClaim": "Not types. Not a ranking. Not a strength score. Not RPS. No new coordinates.",
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, key, val in (
        (P4 / "IMMUTABLE.json", "status", "FROZEN"),
        (PO1 / "IMMUTABLE.json", "outcome", "PO1"),
        (PR1 / "IMMUTABLE.json", "outcome", "PR1"),
        (CG4 / "IMMUTABLE.json", "outcome", "CG4"),
        (OUT / "protocol.json", "status", "FROZEN"),
    ):
        if load_json(path).get(key) != val:
            raise SystemExit(f"{path} must have {key}={val}")
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
    I, F = ideals_filters(60, reach)
    succs = [[] for _ in range(60)]
    preds = [[] for _ in range(60)]
    indeg = [0] * 60
    outdeg = [0] * 60
    for u, v, _w in red:
        succs[u].append(v)
        preds[v].append(u)
        outdeg[u] += 1
        indeg[v] += 1
    sources = [i for i in range(60) if indeg[i] == 0]
    sinks = [i for i in range(60) if outdeg[i] == 0]
    revs = [[] for _ in range(60)]
    for u, v, _w in red:
        revs[v].append(u)
    depth = longest_from(60, sources, succs)
    coh = longest_from(60, sinks, revs)

    asa = {(r["a"], r["b"]): r["disagreeKind"] for r in load_json(ASA / "global-edges.json")["edges"]}
    for a, b in list(asa):
        asa[(b, a)] = asa[(a, b)]

    descriptors = {}
    for i, bid in enumerate(ALL60):
        inc = sum(1 for j in range(60) if j != i and j not in reach[i] and i not in reach[j])
        descriptors[bid] = {
            "blindId": bid,
            "ancestorCount": len(I[i]) - 1,
            "descendantCount": len(F[i]) - 1,
            "coverIndegree": indeg[i],
            "coverOutdegree": outdeg[i],
            "depthFromSource": depth[i],
            "coheightToSinks": coh[i],
            "incomparabilityCount": inc,
            "idealSize": len(I[i]),
            "filterSize": len(F[i]),
            "note": "Intrinsic PO1 descriptors. Not a ranking. Not a strength score.",
        }

    pair_class = {}
    counts = defaultdict(int)
    for a, b in combinations(ALL60, 2):
        ia, ib = ALL60.index(a), ALL60.index(b)
        comparable = ib in reach[ia] or ia in reach[ib]
        if comparable:
            cls = "COMPARABLE"
        elif asa.get((a, b)) == "ORIENTATION_DISAGREE":
            cls = "RECIPROCAL_BOUNDARY"
        else:
            cls = "STRUCTURALLY_UNRELATED"
        pair_class[(a, b)] = cls
        counts[cls] += 1
        if comparable and asa.get((a, b)) == "ORIENTATION_DISAGREE":
            counts["ORIENTATION_SENSITIVE_BUT_COMPARABLE"] += 1
    cover_pairs = {(ALL60[u], ALL60[v]) for u, v, _w in red}
    phase_a = {
        "status": "PHASE_A_FROZEN",
        "discoveryBlind": True,
        "nDecks": 60,
        "nCover": len(red),
        "pairClassCounts": dict(counts),
        "nComparable": counts["COMPARABLE"],
        "nIncomparable": counts["RECIPROCAL_BOUNDARY"] + counts["STRUCTURALLY_UNRELATED"],
        "descriptors": descriptors,
        "not": ["profiles", "K", "names", "ranking"],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "phase-a-descriptors.json").write_text(json.dumps(phase_a, indent=2) + "\n", encoding="utf-8")
    print("  phase A frozen", dict(counts), flush=True)

    # ----- Phase B: unblind existing mechanics -----
    print("  phase B unblind", flush=True)
    profiles = {r["blindId"]: r for r in load_json(PROF / "profiles.json")}
    feats = {d: deck_features(profiles[d]) for d in ALL60}

    # extra aggregates from eligible axes
    extra = {}
    axis_prom = defaultdict(dict)  # axis -> bid -> prominence
    for bid in ALL60:
        rec = profiles[bid]
        caps = rec["capabilities"]
        deps = rec["dependencies"]
        res = rec.get("resilience") or rec.get("resiliencies") or {}
        elig_c = [c for k, c in caps.items() if eligible_axis(k, c)]
        elig_d = [c for k, c in deps.items() if eligible_axis(k, c)]
        hot_c = [c for c in elig_c if float(c.get("prominence") or 0) >= HOT]
        hot_d = [c for c in elig_d if float(c.get("prominence") or 0) >= HOT]
        extra[bid] = {
            "nEligibleHotCaps": len(hot_c),
            "nEligibleHotDeps": len(hot_d),
            "meanCapProminenceHot": float(np.mean([c["prominence"] for c in hot_c])) if hot_c else 0.0,
            "meanDepCriticalityHot": float(np.mean([float(c.get("criticality") or 0) for c in hot_d])) if hot_d else 0.0,
            "meanDepProminenceHot": float(np.mean([c["prominence"] for c in hot_d])) if hot_d else 0.0,
            "meanResilienceProminence": float(np.mean([float(c.get("prominence") or 0) for c in res.values()])) if res else 0.0,
            "nActivePackages": sum(1 for p in (rec.get("packages") or []) if p.get("active")),
            "maxCommanderLink": feats[bid]["maxCommanderLink"],
            "meanDensityHot": feats[bid]["meanDensityHot"],
            "meanRedundancyHot": feats[bid]["meanRedundancyHot"],
            "nHotCaps": feats[bid]["nHotCaps"],
            "nPackages": feats[bid]["nPackages"],
            "commanderLinkShareHot": feats[bid]["commanderLinkShareHot"],
            "singletonShareHot": feats[bid]["singletonShareHot"],
        }
        for k, c in list(caps.items()) + list(deps.items()):
            if eligible_axis(k, c):
                axis_prom[k][bid] = float(c.get("prominence") or 0)

    mech_keys = list(extra[ALL60[0]].keys())
    pos_corrs = []
    for sk in STRUCT_KEYS:
        y = np.array([descriptors[d][sk] for d in ALL60], dtype=float)
        for mk in mech_keys:
            x = np.array([extra[d][mk] for d in ALL60], dtype=float)
            rho = spearman(x, y)
            pos_corrs.append({"structural": sk, "mechanical": mk, "spearman": round(rho, 4), "abs": round(abs(rho), 4)})
        for ax, by_d in axis_prom.items():
            x = np.array([by_d.get(d, 0.0) for d in ALL60], dtype=float)
            if float(x.max()) <= 0:
                continue
            rho = spearman(x, y)
            pos_corrs.append({"structural": sk, "mechanical": f"prominence:{ax}", "spearman": round(rho, 4), "abs": round(abs(rho), 4)})
    pos_corrs.sort(key=lambda r: -r["abs"])
    notable_pos = [r for r in pos_corrs if r["abs"] >= 0.40]
    # unique structural keys among notable
    notable_struct = {r["structural"] for r in notable_pos}
    agg_corrs = [r for r in pos_corrs if not str(r["mechanical"]).startswith("prominence:")]
    agg_corrs.sort(key=lambda r: -r["abs"])
    notable_agg = [r for r in agg_corrs if r["abs"] >= 0.40]

    print("  reconstruct K terms", flush=True)
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

    def terms(a: str, b: str) -> list[dict]:
        block = recon[(a, b)]["families"]["conservative"]
        out = []
        for t in block.get("attackTerms") or []:
            if t.get("relation") not in HOSTILE:
                continue
            w = float(t.get("effectiveTerm") or 0)
            if w < TERM_FLOOR:
                continue
            out.append(t)
        return out

    def fams(a: str, b: str) -> set[str]:
        s = set()
        for t in terms(a, b):
            s.add(ablation_family(t["capability"]) or "other")
        return s

    # pair features
    cap_ids = sorted({k for d in ALL60 for k, c in profiles[d]["capabilities"].items() if eligible_axis(k, c)})
    dep_ids = sorted({k for d in ALL60 for k, c in profiles[d]["dependencies"].items() if eligible_axis(k, c)})

    def vec(bid: str) -> np.ndarray:
        caps = profiles[bid]["capabilities"]
        deps = profiles[bid]["dependencies"]
        return np.array(
            [float((caps.get(k) or {}).get("prominence") or 0) for k in cap_ids]
            + [float((deps.get(k) or {}).get("prominence") or 0) for k in dep_ids],
            dtype=float,
        )

    pair_rows = []
    for a, b in combinations(ALL60, 2):
        pa = slim[(a, b)]["estimators"]["conservative"]["hostile_pressure"]
        pb = slim[(b, a)]["estimators"]["conservative"]["hostile_pressure"]
        t = pa + pb
        mabs = abs(pa - pb)
        r = mabs / t if t else 0.0
        fa, fb = fams(a, b), fams(b, a)
        pkgs_a = {p.get("id") for p in (profiles[a].get("packages") or []) if p.get("active")}
        pkgs_b = {p.get("id") for p in (profiles[b].get("packages") or []) if p.get("active")}
        row = {
            "a": a,
            "b": b,
            "cls": pair_class[(a, b)],
            "cover": (a, b) in cover_pairs or (b, a) in cover_pairs,
            "T": t,
            "absM": mabs,
            "R": r,
            "familyJaccard": jaccard(fa, fb),
            "nFamiliesUnion": len(fa | fb),
            "nFamiliesBothWays": len(fa & fb),
            "hotCapJaccard": jaccard(hot_ids(profiles[a]["capabilities"]), hot_ids(profiles[b]["capabilities"])),
            "hotDepJaccard": jaccard(hot_ids(profiles[a]["dependencies"]), hot_ids(profiles[b]["dependencies"])),
            "packageJaccard": jaccard(pkgs_a, pkgs_b),
            "profileCosine": cosine(vec(a), vec(b)),
        }
        pair_rows.append(row)

    def class_table(feature: str, groups: list[str]) -> dict:
        out = {}
        for g in groups:
            out[g] = summarize([r[feature] for r in pair_rows if r["cls"] == g or (g == "INCOMPARABLE" and r["cls"] != "COMPARABLE") or (g == "COVER" and r["cover"])])
        # spearman vs binary
        return out

    pair_feats = ["T", "absM", "R", "familyJaccard", "nFamiliesUnion", "nFamiliesBothWays", "hotCapJaccard", "hotDepJaccard", "packageJaccard", "profileCosine"]
    groups = ["COMPARABLE", "RECIPROCAL_BOUNDARY", "STRUCTURALLY_UNRELATED"]
    pair_dist = {f: {g: summarize([r[f] for r in pair_rows if r["cls"] == g]) for g in groups} for f in pair_feats}
    pair_dist["COVER"] = {f: summarize([r[f] for r in pair_rows if r["cover"]]) for f in pair_feats}

    is_comp = np.array([1.0 if r["cls"] == "COMPARABLE" else 0.0 for r in pair_rows])
    comp_seps = []
    for f in pair_feats:
        x = np.array([r[f] for r in pair_rows], dtype=float)
        comp_seps.append({"feature": f, "spearmanVsComparable": round(spearman(x, is_comp), 4), "abs": round(abs(spearman(x, is_comp)), 4)})
    comp_seps.sort(key=lambda r: -r["abs"])

    inc_rows = [r for r in pair_rows if r["cls"] != "COMPARABLE"]
    is_recip = np.array([1.0 if r["cls"] == "RECIPROCAL_BOUNDARY" else 0.0 for r in inc_rows])
    recip_seps = []
    for f in pair_feats:
        x = np.array([r[f] for r in inc_rows], dtype=float)
        recip_seps.append({"feature": f, "spearmanVsReciprocal": round(spearman(x, is_recip), 4), "abs": round(abs(spearman(x, is_recip)), 4)})
    recip_seps.sort(key=lambda r: -r["abs"])

    # cover motifs
    edge_count = defaultdict(int)
    edge_mass = defaultdict(float)
    fam_present = defaultdict(int)
    fam_top = defaultdict(int)
    fam_depth = defaultdict(list)
    n_fam_hist = defaultdict(int)
    for u, v, _w in red:
        a, b = ALL60[u], ALL60[v]
        ts = terms(a, b)
        fm = defaultdict(float)
        for t in ts:
            key = f"{t['capability']} → {t['dependency']}"
            w = float(t["effectiveTerm"])
            edge_count[key] += 1
            edge_mass[key] += w
            fam = ablation_family(t["capability"]) or "other"
            fm[fam] += w
        present = {k for k, val in fm.items() if val > 0}
        for fam in present:
            fam_present[fam] += 1
        n_fam_hist[str(len(present))] += 1
        if fm:
            top = max(fm, key=fm.get)
            fam_top[top] += 1
            fam_depth[top].append((depth[u] + depth[v]) / 2)
    top_edges = sorted(edge_count, key=lambda k: (-edge_count[k], -edge_mass[k]))[:12]
    cover_motifs = {
        "nCover": len(red),
        "nFamiliesAtFloorHist": dict(n_fam_hist),
        "familyPresentOnCovers": {k: fam_present[k] for k in list(ABLATION_NAMES) + ["other"]},
        "familyTopOnCovers": dict(fam_top),
        "meanCoverDepthByTopFamily": {k: round(float(np.mean(vs)), 2) for k, vs in fam_depth.items()},
        "recurringTerms": [
            {"edge": e, "nCovers": edge_count[e], "mass": round(edge_mass[e], 4)} for e in top_edges
        ],
        "note": "Motifs only. Not types. Multi-mechanism covers expected from PR1.",
    }
    depths = [float(np.mean(vs)) for vs in fam_depth.values() if vs]
    n_cover = len(red)
    ubiquitous = [e for e in top_edges if edge_count[e] >= 0.80 * n_cover]
    local_motifs = [e for e in sorted(edge_count, key=lambda k: -edge_count[k]) if 8 <= edge_count[e] < 0.80 * n_cover]
    cover_motifs["ubiquitousTerms"] = [{"edge": e, "nCovers": edge_count[e], "mass": round(edge_mass[e], 4)} for e in ubiquitous[:8]]
    cover_motifs["localMotifs"] = [{"edge": e, "nCovers": edge_count[e], "mass": round(edge_mass[e], 4)} for e in local_motifs[:12]]
    cover_clear = bool(local_motifs) or (bool(ubiquitous) and len({e.split(" → ")[0] for e in ubiquitous}) >= 2)
    interlocking = (max(depths) - min(depths) <= 4.0) if len(depths) >= 3 else False

    pos_best = notable_pos[0]["abs"] if notable_pos else (pos_corrs[0]["abs"] if pos_corrs else 0)
    if not notable_pos and pos_corrs:
        pos_best = pos_corrs[0]["abs"]
    comp_best = comp_seps[0]["abs"] if comp_seps else 0
    recip_best = recip_seps[0]["abs"] if recip_seps else 0
    reading = decide(pos_best, len(notable_struct), comp_best, recip_best, cover_clear)
    reading["notes"].append(
        f"Cover top-family mean depths range {round(min(depths), 2) if depths else None}–{round(max(depths), 2) if depths else None}; interlocking={interlocking}."
    )
    if counts["STRUCTURALLY_UNRELATED"] < 40:
        reading["notes"].append(
            f"STRUCTURALLY_UNRELATED n={counts['STRUCTURALLY_UNRELATED']}; treat that split as small-n."
        )

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "MECHANICAL_ORDER_INTERPRETATION_AUDIT_V1",
        "parent": ["stable-hostile-order-audit-v1", "order-backbone-robustness-audit-v1", "bilateral-cancellation-audit-v1", "continuous-order-geometry-audit-v1"],
        "phaseA": {"pairClassCounts": dict(counts), "nCover": len(red), "descriptorsFrozen": True},
        "positionCorrelations": {
            "notableAbsGe040": notable_pos[:40],
            "topRegardless": pos_corrs[:20],
            "aggregateOnly": agg_corrs[:20],
            "notableAggregatesAbsGe040": notable_agg,
            "nNotableStructuralDescriptors": len(notable_struct),
        },
        "pairClasses": {
            "counts": dict(counts),
            "featureDistributions": pair_dist,
            "comparableSeparation": comp_seps,
            "reciprocalWithinIncomparableSeparation": recip_seps,
        },
        "coverMotifs": cover_motifs,
        "distributedOrder": {
            "interlockingTopFamilies": interlocking,
            "meanCoverDepthByTopFamily": cover_motifs["meanCoverDepthByTopFamily"],
            "note": "PR1 leftover: one family can drop many covers without collapsing height if families occupy overlapping depths.",
        },
        "reading": reading,
        "not": ["new coordinates", "CG4 PC names", "types", "clustering", "strength score", "ranking", "RPS"],
        "safety": {
            "newCoordinates": False,
            "axesNamed": False,
            "typesCreated": False,
            "strengthScore": False,
            "rankedDecks": False,
            "newDecks": False,
            "rpsAuthorized": False,
            "pressureEdited": False,
        },
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "MechanicalOrderInterpretationAudit",
                "version": "mechanical-order-interpretation-audit-v1",
                "status": "REPORT_AND_WAIT",
                "outcome": reading["code"],
                "coordinatesFrozen": False,
                "typesCreated": False,
                "note": "Explanatory mechanics only. Not types. Not a ranking. Not RPS.",
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
                "phaseA": dict(counts),
                "nNotablePos": len(notable_pos),
                "nNotableStruct": len(notable_struct),
                "topPos": pos_corrs[:12],
                "compSep": comp_seps[:6],
                "recipSep": recip_seps[:6],
                "pairMedT": {g: pair_dist["T"][g] for g in groups},
                "cover": {
                    "hist": dict(n_fam_hist),
                    "topFam": dict(fam_top),
                    "depths": cover_motifs["meanCoverDepthByTopFamily"],
                    "terms": cover_motifs["recurringTerms"][:8],
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

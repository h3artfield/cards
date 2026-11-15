#!/usr/bin/env python3
"""
Corpus Expansion v1 — Phases 1–3.

Selection uses frozen Profiles v2 coverage only.
Does not read K, M, Hodge, or desired counters when choosing decks.
Does not add K reviews. Does not write expanded Pressure. Does not run Hodge v1.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_deck_mechanical_profiles_v2 import profile_deck
from build_k_v13_active_coverage import resolve_cards
from build_k_v14_active_coverage import axis_mass
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from build_k_v25 import pair_h_both
from build_k_v27 import maturity_class
from mechanical_compatibility_v1 import compatibility
from mechanical_deck_profile_v1 import axis_stats, package_boost, prominence
from mechanical_deck_profile_v2 import (
    UNSUPPORTED_AXES as PROF_UNSUPPORTED,
    V1_PACKAGES,
    V2_PACKAGES,
    children_of,
    evaluate_packages,
    family_union_weights,
    is_broad,
    parent_of,
    role_type,
)
from mechanical_k_v2 import PROFILE_QA_BLOCKED, SPLIT_PARENTS, UNSUPPORTED_AXES, k_pressure_eligible, mark_hierarchy_dominance, polarity_blocked_caps
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
PROF1 = MS / "deck-mechanical-profiles-v1"
PROF2 = MS / "deck-mechanical-profiles-v2"
K27 = MS / "mechanical-pressure-k-v2.7"
P2 = MS / "deck-pressure-v2"
HODGE = MS / "hodge-diagnostic-v0"
SCREEN = MS / "compatibility-screen-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "corpus-expansion-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

LIVE = {"UNCHANGED_ENDPOINTS", "NEW_ENDPOINT", "CARRY_FORWARD_VERIFIED", "RETIRED_BROAD"}
CRED = {"HIGH", "MEDIUM"}
PROTO_HASH_FIELDS = ("nExpansion", "k", "seed")


def norm_name(s: str) -> str:
    return (s or "").lower().split(" //")[0].strip()


def commander_key(names: list[str]) -> tuple[str, ...]:
    return tuple(sorted(norm_name(n) for n in names if norm_name(n)))


def identity_key(names: list[str]) -> str:
    return "|".join(commander_key(names))


def eligible_axis_ids(concept_ids: list[str], by_axis: dict) -> list[str]:
    out = []
    blocked = set(PROFILE_QA_BLOCKED) | set(UNSUPPORTED_AXES) | set(PROF_UNSUPPORTED) | set(SPLIT_PARENTS)
    for cid in concept_ids:
        if cid in blocked:
            continue
        meta = by_axis.get(cid) or {}
        if meta.get("kind") not in {"capability", "dependency"}:
            continue
        if is_broad(meta):
            continue
        out.append(cid)
    return out


def percentile_ranks(scores: np.ndarray) -> np.ndarray:
    n, d = scores.shape
    ranks = np.empty_like(scores, dtype=np.float32)
    for j in range(d):
        col = scores[:, j]
        order = np.sort(col)
        ranks[:, j] = np.searchsorted(order, col, side="left") / float(n)
    return ranks


def lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of):
    nonland = []
    rows = []
    for card in cards:
        tl = (card.get("typeLine") or "").lower()
        nonland.append(not tl.startswith("land") and "land —" not in tl and not tl.startswith("basic land"))
        rows.append(card["row"])
    rows_i = np.asarray(rows, dtype=np.int32)
    W = np.clip((scores[rows_i] - p90) / (p99 - p90 + 1e-6), 0.0, 1.0)
    trained = set(concept_ids)
    trained_parents = {cid: parent_of(cid) for cid in concept_ids if parent_of(cid)}
    weights_by_id = {cid: W[:, j].tolist() for j, cid in enumerate(concept_ids)}
    raw = {"capability": {}, "dependency": {}, "resilience": {}}
    cmd_idx = [row_of[o] for o in cmd_oids if o in row_of]
    for j, cid in enumerate(concept_ids):
        meta = by_axis.get(cid) or {}
        kind = meta.get("kind")
        if kind not in raw:
            continue
        cmd_w = float(max((ranks[i, j] for i in cmd_idx), default=0.0))
        rec = axis_stats(weights_by_id[cid], cmd_w, nonland, kind)
        rec["id"] = cid
        rec["kind"] = kind
        rec["parent"] = meta.get("parent")
        rec["role"] = meta.get("role")
        rec["directionClass"] = meta.get("directionClass")
        rec["roleType"] = role_type(meta)
        rec["prominence"] = round(prominence(rec), 4)
        raw[kind][cid] = rec
    for kind in raw:
        for cid, rec in raw[kind].items():
            kids = children_of(cid, trained)
            if not kids:
                continue
            fam = family_union_weights(weights_by_id[cid], [weights_by_id[k] for k in kids if k in weights_by_id])
            adj = axis_stats(fam, rec["commander_link"], nonland, rec["kind"])
            rec["density"] = adj["density"]
            rec["redundancy"] = adj["redundancy"]
            rec["presence"] = adj["presence"]
            rec["nStrong"] = adj["nStrong"]
            rec["nIndependent"] = adj["nIndependent"]
            rec["criticality"] = adj["criticality"]
            rec["prominence"] = round(prominence(rec), 4)
    packages = evaluate_packages(V1_PACKAGES, raw, by_axis, weights_by_id, trained_parents, "v1_engine")
    packages += evaluate_packages(V2_PACKAGES, raw, by_axis, weights_by_id, trained_parents, "v2_child")
    active = [p for p in packages if p["active"]]
    for kind in raw:
        for cid, rec in raw[kind].items():
            rec["packageBoost"] = round(package_boost(cid, active), 4)
            rec["packageInformedProminence"] = round(min(1.0, rec["prominence"] + rec["packageBoost"]), 4)
    return raw, packages


def vector_of(axes: dict, axis_ids: list[str]) -> np.ndarray:
    flat = {cid: rec for kind in axes for cid, rec in axes[kind].items()}
    return np.array([float(flat[c].get("packageInformedProminence", flat[c]["prominence"])) if c in flat else 0.0 for c in axis_ids], dtype=np.float32)


def l2norm(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-12 else v


def kmeans(X: np.ndarray, k: int, seed: int, iters: int = 30) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = len(X)
    C = [X[int(rng.integers(n))]]
    for _ in range(k - 1):
        sim = X @ np.stack(C).T
        dmin = 1.0 - sim.max(axis=1)
        C.append(X[int(np.argmax(dmin))])
    C = np.stack(C)
    labels = np.zeros(n, dtype=int)
    for _ in range(iters):
        labels = (X @ C.T).argmax(axis=1)
        for j in range(k):
            mem = X[labels == j]
            if not len(mem):
                continue
            v = mem.mean(axis=0)
            nrm = float(np.linalg.norm(v))
            C[j] = v / nrm if nrm > 1e-12 else C[j]
        labels = (X @ C.T).argmax(axis=1)
    return labels


def coverage_gain(cand: np.ndarray, corpus_max: np.ndarray) -> float:
    return float(np.maximum(0.0, cand - corpus_max).sum())


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def pack_source(raw: dict, wanted: str) -> dict:
    return {
        "wantedCommander": wanted,
        "commanders": raw["commanders"],
        "commanderOracleIds": raw["commanderOracleIds"],
        "identity_key": identity_key(raw["commanders"]),
        "component_commander_ids": list(raw.get("commanderOracleIds") or []),
        "mainboard": raw["mainboard"],
        "sourceFile": raw["sourceFile"],
        "deckInstanceId": raw["deckInstanceId"],
    }


def collect_candidates(anchor_keys: set[tuple[str, ...]]) -> list[dict]:
    anchor_names = {n for key in anchor_keys for n in key}
    best: dict[tuple[str, ...], dict] = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for d in data:
            if d.get("commanderResolutionStatus") != "resolved":
                continue
            mb = d.get("mainboard") or []
            if len(mb) < 80:
                continue
            resolved = [x for x in mb if x.get("oracleId")]
            if len(resolved) < 70:
                continue
            cmds = d.get("commanders") or []
            names = [c.get("canonicalOracleName") or c.get("sourceName") or "" for c in cmds]
            key = commander_key(names)
            if not key or key in anchor_keys:
                continue
            if any(n in anchor_names for n in key):
                continue
            rec = {
                "key": key,
                "identity_key": "|".join(key),
                "commanders": names,
                "commanderOracleIds": [c.get("oracleId") for c in cmds if c.get("oracleId")],
                "component_commander_ids": [c.get("oracleId") for c in cmds if c.get("oracleId")],
                "mainboard": [
                    {
                        "oracleId": x["oracleId"],
                        "name": x.get("canonicalOracleName") or x.get("sourceName"),
                        "quantity": int(x.get("quantity") or 1),
                    }
                    for x in resolved
                ],
                "sourceFile": path.name,
                "deckInstanceId": str(d.get("deckInstanceId") or ""),
                "nMainboard": len(mb),
            }
            prev = best.get(key)
            dist = abs(rec["nMainboard"] - 99)
            if prev is None or dist < prev["_dist"] or (dist == prev["_dist"] and rec["deckInstanceId"] < prev["deckInstanceId"]):
                rec["_dist"] = dist
                best[key] = rec
        del data
    out = list(best.values())
    for r in out:
        r.pop("_dist", None)
    out.sort(key=lambda r: (r["key"], r["deckInstanceId"]))
    return out


def h_rows_for(decks: list[dict], leftover_el: list, attack: list[dict], polarity: dict, compat: dict) -> list[dict]:
    rows = []
    for a in decks:
        skip = polarity.get(a["id"]) or set()
        for b in decks:
            if a["id"] == b["id"]:
                continue
            best_m, best_lab = 0.0, None
            for e in attack:
                if e["capability"] in skip:
                    continue
                m = axis_mass(a, b, e["capability"], e["target"])
                if m > best_m:
                    best_m = m
                    best_lab = f"{e['capability']} → {e['target']}"
            thresh = best_m + 0.02
            h_raw = h_cred = 0.0
            for c, d in leftover_el:
                m = axis_mass(a, b, c, d)
                if m < 0.10:
                    continue
                h = m / thresh
                if h > h_raw:
                    h_raw = h
                if compat[(c, d)] in CRED and h > h_cred:
                    h_cred = h
            rows.append({"from": a["id"], "to": b["id"], "top": best_lab, "H_raw": round(h_raw, 4), "H_credible": round(h_cred, 4), "maturity": maturity_class(h_cred)})
    return rows


def mass_for(decks: list[dict], cells: list, leftover_el: set, reviewed_live: set, compat: dict) -> dict:
    reviewed_cred = unknown_cred = raw_unknown = 0.0
    n_pairs = 0
    for a in decks:
        cm = {c: rec.get("packageInformedProminence", rec["prominence"]) for c, rec in a["axes"]["capability"].items()}
        for b in decks:
            if a["id"] == b["id"]:
                continue
            n_pairs += 1
            dm = {t: rec["prominence"] for t, rec in b["axes"]["dependency"].items()}
            for c, d in cells:
                m = cm.get(c, 0.0) * dm.get(d, 0.0)
                if m <= 0:
                    continue
                lvl = compat[(c, d)]
                if (c, d) in leftover_el:
                    raw_unknown += m
                    if lvl in CRED:
                        unknown_cred += m
                elif (c, d) in reviewed_live and lvl in CRED:
                    reviewed_cred += m
    denom = reviewed_cred + unknown_cred
    return {
        "nPairs": n_pairs,
        "reviewed_credible_mass": round(reviewed_cred, 4),
        "unknown_credible_mass": round(unknown_cred, 4),
        "raw_unknown_mass": round(raw_unknown, 4),
        "reviewedShareOfCredible": round(reviewed_cred / denom, 4) if denom else None,
    }


def summarize_h(rows: list[dict]) -> dict:
    counts = defaultdict(int)
    for r in rows:
        counts[r["maturity"]] += 1
    hs = [r["H_credible"] for r in rows]
    return {
        "n": len(rows),
        "maturity": dict(counts),
        "mean_H_credible": round(float(np.mean(hs)), 4) if hs else None,
        "median_H_credible": round(float(np.median(hs)), 4) if hs else None,
        "n_Hcred_lt_1": int(sum(1 for x in hs if x < 1)),
        "n_Hcred_lt_05": int(sum(1 for x in hs if x < 0.5)),
    }


def main() -> None:
    proto = load_json(OUT / "selection-protocol.json")
    if proto.get("status") != "FROZEN":
        raise SystemExit("selection protocol must be frozen first")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (K27, "K v2.7"), (P2, "Pressure v2"), (HODGE, "Hodge v0")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    n_exp = int(proto["selection"]["nExpansion"])
    k = int(proto["stratification"]["k"])
    seed = int(proto["stratification"]["seed"])
    min_gain = float(proto["selection"]["stopIfMaxGainBelow"])
    min_cos = float(proto["selection"].get("minCosineDistanceAmongExpansion") or 0.12)
    cosine_vs_anchor = bool(proto["selection"].get("minCosineDistanceVsAnchor"))
    max_jac = float(proto["selection"]["cardJaccardMaxVsSelected"])

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    ranks = percentile_ranks(scores)
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]

    axis_ids = eligible_axis_ids(concept_ids, by_axis)
    sealed_anchor = load_json(PROF1 / "sealed-key.json")["key"]
    anchor_keys = {commander_key(row["commanders"]) for row in sealed_anchor}
    anchor_sources = load_json(PROF1 / "source-decks.json")

    print("collecting candidate pool…", flush=True)
    pool = collect_candidates(anchor_keys)

    def cards_of(raw):
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        return cards, cmd_oids

    print("profiling anchor 15…", flush=True)
    anchor_vecs = []
    anchor_oids = []
    anchor_axes = []
    for raw in anchor_sources:
        cards, cmd_oids = cards_of(raw)
        axes, pkgs = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        anchor_vecs.append(vector_of(axes, axis_ids))
        anchor_oids.append({c["oracleId"] for c in cards})
        anchor_axes.append(axes)

    print(f"profiling {len(pool)} unique-commander candidates…", flush=True)
    cand = []
    for i, raw in enumerate(pool):
        cards, cmd_oids = cards_of(raw)
        if len(cards) < 70:
            continue
        axes, pkgs = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        vec = vector_of(axes, axis_ids)
        active = [p["id"] for p in pkgs if p.get("active")]
        cand.append(
            {
                "raw": raw,
                "vec": vec,
                "oids": {c["oracleId"] for c in cards},
                "nCards": len(cards),
                "activePackages": active,
                "blockedCaps": [c for c in PROFILE_QA_BLOCKED if c in axes["capability"] and axes["capability"][c]["prominence"] >= 0.18],
            }
        )
        if (i + 1) % 200 == 0:
            print(f"  {i+1}/{len(pool)}", flush=True)

    A = np.stack([l2norm(v) for v in anchor_vecs])
    C = np.stack([l2norm(c["vec"]) for c in cand])
    X = np.vstack([A, C])
    labels = kmeans(X, k, seed)
    anchor_lab = labels[: len(A)]
    cand_lab = labels[len(A) :]
    represented = set(int(x) for x in anchor_lab)
    corpus_max = np.max(np.stack(anchor_vecs), axis=0)
    selected_idx: list[int] = []
    selected_lab = list(anchor_lab)

    def can_take(i: int) -> bool:
        if any(jaccard(cand[i]["oids"], anchor_oids[a]) > max_jac for a in range(len(anchor_oids))):
            return False
        if any(jaccard(cand[i]["oids"], cand[j]["oids"]) > max_jac for j in selected_idx):
            return False
        vn = l2norm(cand[i]["vec"])
        if selected_idx:
            sims = C[selected_idx] @ vn
            if float(sims.max()) > (1.0 - min_cos):
                return False
        if cosine_vs_anchor and float((A @ vn).max()) > (1.0 - min_cos):
            return False
        return True

    def pick_from(indices: list[int]) -> int | None:
        best_i, best_g = None, -1.0
        for i in indices:
            if i in selected_idx or not can_take(i):
                continue
            g = coverage_gain(cand[i]["vec"], corpus_max)
            if g > best_g:
                best_i, best_g = i, g
        return best_i

    phase_a = []
    for region in range(k):
        if region in represented:
            continue
        members = [i for i, lab in enumerate(cand_lab) if int(lab) == region]
        i = pick_from(members)
        if i is None:
            continue
        selected_idx.append(i)
        represented.add(region)
        corpus_max = np.maximum(corpus_max, cand[i]["vec"])
        phase_a.append({"index": i, "region": region, "gain": round(coverage_gain(cand[i]["vec"], np.max(np.stack(anchor_vecs), axis=0)), 4)})

    while len(selected_idx) < n_exp:
        i = pick_from(list(range(len(cand))))
        if i is None:
            break
        g = coverage_gain(cand[i]["vec"], corpus_max)
        if g < min_gain and len(selected_idx) >= 15:
            break
        selected_idx.append(i)
        corpus_max = np.maximum(corpus_max, cand[i]["vec"])

    # Full Profiles v2 for anchors + selected (authoritative formulas)
    print("full Profiles v2 on sealed corpus…", flush=True)
    frozen_profiles = load_json(PROF2 / "profiles.json")
    recon = []
    sealed = []
    sources = []
    full_profiles = []
    blind = []
    polarity = {}
    decks_for_k = []

    for i, raw in enumerate(anchor_sources):
        cards, cmd_oids = cards_of(raw)
        axes, pkgs, *rest = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        bid = f"D{i+1:02d}"
        frozen = next(p for p in frozen_profiles if p["blindId"] == bid)
        deltas = []
        fcap = frozen.get("capabilities") or {}
        fdep = frozen.get("dependencies") or {}
        for cid, rec in axes["capability"].items():
            if cid in fcap:
                deltas.append(abs(rec.get("packageInformedProminence", rec["prominence"]) - fcap[cid].get("packageInformedProminence", fcap[cid].get("prominence", 0))))
        for cid, rec in axes["dependency"].items():
            if cid in fdep:
                deltas.append(abs(rec.get("packageInformedProminence", rec["prominence"]) - fdep[cid].get("packageInformedProminence", fdep[cid].get("prominence", 0))))
        recon.append({"blindId": bid, "nCompared": len(deltas), "maxAbsDelta": round(max(deltas) if deltas else 0.0, 6), "meanAbsDelta": round(float(np.mean(deltas)) if deltas else 0.0, 6)})
        sealed.append({**sealed_anchor[i], "cohort": "anchor"})
        sources.append(pack_source(raw, sealed_anchor[i]["wantedCommander"]))
        polarity[bid] = polarity_blocked_caps(axes)
        decks_for_k.append({"id": bid, "axes": axes, "cohort": "anchor"})
        full_profiles.append({"blindId": bid, "cohort": "anchor", "nResolvedCards": len(cards), "capabilities": axes["capability"], "dependencies": axes["dependency"], "resilience": axes["resilience"], "packages": pkgs})
        blind.append({"blindId": bid, "cohort": "anchor", "nResolvedCards": len(cards), "topCapabilities": sorted(axes["capability"].values(), key=lambda r: -r["prominence"])[:8], "topDependencies": sorted(axes["dependency"].values(), key=lambda r: -r["prominence"])[:8], "activePackages": [p["id"] for p in pkgs if p.get("active")]})

    for t, i in enumerate(selected_idx):
        raw = cand[i]["raw"]
        cards, cmd_oids = cards_of(raw)
        axes, pkgs, *rest = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        bid = f"D{16+t:02d}"
        wanted = raw["commanders"][0]
        sealed.append({"blindId": bid, "cohort": "expansion", "commanders": raw["commanders"], "wantedCommander": wanted, "region": int(cand_lab[i])})
        sources.append(pack_source(raw, wanted))
        polarity[bid] = polarity_blocked_caps(axes)
        decks_for_k.append({"id": bid, "axes": axes, "cohort": "expansion"})
        full_profiles.append({"blindId": bid, "cohort": "expansion", "nResolvedCards": len(cards), "capabilities": axes["capability"], "dependencies": axes["dependency"], "resilience": axes["resilience"], "packages": pkgs})
        blind.append(
            {
                "blindId": bid,
                "cohort": "expansion",
                "nResolvedCards": len(cards),
                "region": int(cand_lab[i]),
                "topCapabilities": [{"id": r["id"], "prominence": r["prominence"], "roleType": r.get("roleType")} for r in sorted(axes["capability"].values(), key=lambda x: -x["prominence"])[:8]],
                "topDependencies": [{"id": r["id"], "prominence": r["prominence"], "roleType": r.get("roleType")} for r in sorted(axes["dependency"].values(), key=lambda x: -x["prominence"])[:8]],
                "activePackages": [p["id"] for p in pkgs if p.get("active")],
                "profileQABlockedPresent": [c for c in PROFILE_QA_BLOCKED if c in axes["capability"] and axes["capability"][c]["prominence"] >= 0.18],
                "unsupportedPresent": [c for c in list(UNSUPPORTED_AXES) + list(PROF_UNSUPPORTED) if any(c in axes[k] and axes[k][c]["prominence"] >= 0.18 for k in axes)],
            }
        )

    # Frozen-K applicability
    print("frozen-K applicability audit…", flush=True)
    edges = load_json(K27 / "edges.json")
    edges = mark_hierarchy_dominance(edges)
    for e in edges:
        e["pressureGate"] = k_pressure_eligible(e, by_axis)
        e["pressureEligible"] = e["pressureGate"]["eligible"]
    leftover = leftover_cells(concept_ids, by_axis, edges)
    leftover_el = _eligible_leftover(leftover, by_axis)
    leftover_set = set(leftover_el)
    reviewed_live = {(e["capability"], e["target"]) for e in edges if e.get("kClass") in LIVE}
    cells = sorted(reviewed_live | leftover_set)
    compat = {cd: compatibility(cd[0], cd[1])["level"] for cd in cells}

    cohorts = {
        "anchor15": [d for d in decks_for_k if d["cohort"] == "anchor"],
        "expansion": [d for d in decks_for_k if d["cohort"] == "expansion"],
        "combined": decks_for_k,
    }
    k_audit = {}
    frozen_h = load_json(K27 / "pairs-h-both.json")
    pairs, _ = compute_pairs(cohorts["combined"], [dict(e) for e in edges], leftover, by_axis, polarity)
    idx = pair_index_eligible(pairs, by_axis)
    all_h = pair_h_both(cohorts["combined"], leftover, idx, by_axis)
    for r in all_h:
        r["maturity"] = maturity_class(r["H_credible"])
    ids_of = {name: {d["id"] for d in ds} for name, ds in cohorts.items()}
    for name, ds in cohorts.items():
        ids = ids_of[name]
        rows = [r for r in all_h if r["from"] in ids and r["to"] in ids]
        mass = mass_for(ds, cells, leftover_set, reviewed_live, compat)
        k_audit[name] = {"mass": mass, "H": summarize_h(rows)}
        if name == "anchor15":
            by_new = {(r["from"], r["to"]): r for r in rows}
            mismatches = 0
            for r in frozen_h:
                nr = by_new.get((r["from"], r["to"]))
                if not nr or abs(nr["H_credible"] - r["H_credible"]) > 0.02:
                    mismatches += 1
            k_audit[name]["frozenHReproduction"] = {
                "nFrozen": len(frozen_h),
                "nMismatchAbsGt02": mismatches,
                "expectedMaturity": {"MATURE": 27, "PARTIALLY_MATURE": 110, "IMMATURE": 73},
                "observedMaturity": k_audit[name]["H"]["maturity"],
                "instrument": "compute_pairs + pair_h_both",
            }

    region_counts = {int(r): int(sum(1 for x in cand_lab if int(x) == r)) for r in range(k)}
    anchor_regions = {int(r): int(sum(1 for x in anchor_lab if int(x) == r)) for r in range(k)}
    selected_regions = {int(r): int(sum(1 for i in selected_idx if int(cand_lab[i]) == r)) for r in range(k)}

    gain_vs_anchor = coverage_gain(corpus_max, np.max(np.stack(anchor_vecs), axis=0))
    recon_pass = all(r["maxAbsDelta"] <= 1e-4 for r in recon)

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PHASES_1_2_3_COMPLETE",
        "protocol": "corpus-expansion-v1-protocol",
        "nAnchor": 15,
        "nExpansion": len(selected_idx),
        "nTotal": 15 + len(selected_idx),
        "nCandidateIdentities": len(cand),
        "nPoolListsDeduped": len(pool),
        "selectionDidNotUse": proto["forbiddenInputs"],
        "regions": {"k": k, "seed": seed, "anchor": anchor_regions, "candidates": region_counts, "selected": selected_regions, "emptyOfAnchorsFilled": phase_a},
        "coverageGainVsAnchor": round(gain_vs_anchor, 4),
        "anchorReconstruction": {"pass": recon_pass, "rows": recon},
        "profileQA": {
            "nExpansionProfileQABlocks": sum(len(b.get("profileQABlockedPresent") or []) for b in blind if b["cohort"] == "expansion"),
            "nExpansionUnsupportedHot": sum(len(b.get("unsupportedPresent") or []) for b in blind if b["cohort"] == "expansion"),
        },
        "kApplicability": k_audit,
        "safety": {
            "kReviewsAdded": False,
            "expandedPressure": False,
            "hodgeV1": False,
            "ontologyRetrain": False,
            "compatibilityEdited": False,
            "rpsClaim": False,
            "ranking": False,
            "openai": False,
            "reembed": False,
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "candidate-pool-summary.json").write_text(
        json.dumps({"nUniqueCommanders": len(pool), "nProfiled": len(cand), "k": k, "seed": seed, "regionCounts": region_counts}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT / "source-decks.json").write_text(json.dumps(sources, indent=2) + "\n", encoding="utf-8")
    (OUT / "sealed-key.json").write_text(json.dumps({"note": "Open only after reading blind-profiles.", "key": sealed}, indent=2) + "\n", encoding="utf-8")
    (OUT / "selected-expansion.json").write_text(
        json.dumps(
            [
                {
                    "blindId": f"D{16+t:02d}",
                    "commanders": cand[i]["raw"]["commanders"],
                    "region": int(cand_lab[i]),
                    "nCards": cand[i]["nCards"],
                    "activePackages": cand[i]["activePackages"],
                    "deckInstanceId": cand[i]["raw"]["deckInstanceId"],
                    "sourceFile": cand[i]["raw"]["sourceFile"],
                }
                for t, i in enumerate(selected_idx)
            ],
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT / "blind-profiles.json").write_text(json.dumps(blind, indent=2) + "\n", encoding="utf-8")
    (OUT / "profiles.json").write_text(json.dumps(full_profiles, indent=2) + "\n", encoding="utf-8")
    (OUT / "k-applicability.json").write_text(json.dumps(k_audit, indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "CorpusExpansion",
                "version": "corpus-expansion-v1",
                "status": "SEALED_QA_COMPLETE",
                "parent": "hodge-diagnostic-v0",
                "protocol": "FROZEN",
                "nAnchor": 15,
                "nExpansion": len(selected_idx),
                "note": "Decklists sealed. Profiles v2 run. Frozen-K applicability audited. No K expansion. No Pressure. No Hodge v1.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "nExpansion": len(selected_idx),
        "nTotal": 15 + len(selected_idx),
        "regionsSelected": selected_regions,
        "coverageGainVsAnchor": round(gain_vs_anchor, 4),
        "anchorReconPass": recon_pass,
        "kApplicability": {k: {kk: vv for kk, vv in rec.items() if kk != "frozenHReproduction"} for k, rec in k_audit.items()},
        "selected": [cand[i]["raw"]["commanders"] for i in selected_idx],
        "phaseA": phase_a,
    }, indent=2))


if __name__ == "__main__":
    main()

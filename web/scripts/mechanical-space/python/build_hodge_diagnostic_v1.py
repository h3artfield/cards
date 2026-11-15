#!/usr/bin/env python3
"""
Hodge Diagnostic v1 — sealed 30, frozen Pressure v3.

Aggregation robustness is the main instrument-validation question.
s is a transitive potential, not a ranking. No RPS claim.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

from build_hodge_diagnostic_v0 import (
    ABLATION_NAMES,
    CH_KEY,
    CHANNELS,
    ESTIMATORS,
    MATERIAL,
    NEAR_ZERO,
    ablation_family,
    attach_triangle_gates,
    build_M,
    estimator_robustness,
    oriented_key,
    pack_decomp,
    triangle_records,
)
from mechanical_hodge_v0 import decompose, flatten_upper, sign_agree
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P3 = MS / "deck-pressure-v3"
P2 = MS / "deck-pressure-v2"
H0 = MS / "hodge-diagnostic-v0"
K3 = MS / "mechanical-pressure-k-v3.0"
CEX = MS / "corpus-expansion-v1"
PROF2 = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "hodge-diagnostic-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

ANCHOR = [f"D{i:02d}" for i in range(1, 16)]
EXPANSION = [f"D{i:02d}" for i in range(16, 31)]
V0_ANCHOR = {
    "hostile": 0.025384,
    "supportive": 0.075864,
    "net": 0.031551,
}


def names_of() -> dict[str, str]:
    return {row["blindId"]: (row.get("wantedCommander") or row["blindId"]).split(",")[0] for row in load_json(CEX / "sealed-key.json")["key"]}


def sign_of(x: float) -> int:
    if x > 1e-9:
        return 1
    if x < -1e-9:
        return -1
    return 0


def m_edge_stability(vals: dict[str, float]) -> str:
    if all(abs(v) < NEAR_ZERO for v in vals.values()):
        return "STABLE_NEAR_ZERO"
    signs = {sign_of(v) for v in vals.values()}
    if 0 in signs and len(signs) == 2:
        return "SENSITIVE"
    if len(signs) == 1 and 0 not in signs:
        return "STABLE_DIRECTION"
    return "SENSITIVE"


def edge_cohort(a: str, b: str) -> str:
    aa, ba = a in ANCHOR, b in ANCHOR
    if aa and ba:
        return "anchor_anchor"
    if (not aa) and (not ba):
        return "expansion_expansion"
    return "anchor_expansion"


def submatrix(M: np.ndarray, keep: list[int]) -> np.ndarray:
    return M[np.ix_(keep, keep)]


def complete_mask(n: int) -> np.ndarray:
    m = np.ones((n, n), dtype=bool)
    np.fill_diagonal(m, False)
    return m


def stability_mask(n: int, ids: list[str], stab: dict, channel: str, allow_near_zero: bool = False) -> np.ndarray:
    ix = {d: i for i, d in enumerate(ids)}
    m = np.zeros((n, n), dtype=bool)
    ok = {"STABLE_DIRECTION"}
    if allow_near_zero:
        ok.add("STABLE_NEAR_ZERO")
    for (a, b), rec in stab.items():
        if rec[channel] not in ok:
            continue
        i, j = ix[a], ix[b]
        m[i, j] = m[j, i] = True
    return m


def cyclic_by_cohort(C: np.ndarray, ids: list[str]) -> dict:
    mass = defaultdict(float)
    n = len(ids)
    for i in range(n):
        for j in range(i + 1, n):
            w = float(C[i, j] ** 2)
            mass[edge_cohort(ids[i], ids[j])] += w
    tot = sum(mass.values())
    return {
        "mass": {k: round(mass[k], 6) for k in ("anchor_anchor", "expansion_expansion", "anchor_expansion")},
        "share": {k: round(mass[k] / tot, 4) if tot else None for k in ("anchor_anchor", "expansion_expansion", "anchor_expansion")},
        "nEdges": {"anchor_anchor": 105, "expansion_expansion": 105, "anchor_expansion": 225},
        "totalCyclicEnergy": round(tot, 6),
    }


def top_cyclic_edges(C: np.ndarray, ids: list[str], n: int = 12) -> list[dict]:
    rows = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            rows.append(
                {
                    "a": ids[i],
                    "b": ids[j],
                    "C": round(float(C[i, j]), 4),
                    "absC": round(abs(float(C[i, j])), 4),
                    "cohort": edge_cohort(ids[i], ids[j]),
                }
            )
    rows.sort(key=lambda r: -r["absC"])
    return rows[:n]


def classify_triangle(cons: dict, prom: dict | None, pres: dict | None, edge_stables: list[str]) -> str:
    if not cons.get("materialLegs") or cons.get("nearZeroArtifact"):
        return "REJECTED"
    if not all(s == "STABLE_DIRECTION" for s in edge_stables):
        return "REJECTED"
    if not cons.get("distinctCausalFamilies"):
        return "REJECTED"
    if not all(p.get("top") for p in cons.get("proofs") or []):
        return "REJECTED"
    fams = [f for f in (cons.get("families") or []) if f]
    if fams and len(set(fams)) == 1 and fams[0] == "removal":
        return "REJECTED"
    ck = oriented_key(cons)
    pk = oriented_key(prom) if prom and prom.get("materialLegs") else None
    sk = oriented_key(pres) if pres and pres.get("materialLegs") else None
    if pk != ck:
        return "ESTIMATOR_SENSITIVE"
    if sk == ck:
        return "CORE_ROBUST"
    return "PRIMARY_ROBUST"


def outcome_of(all30_h, all30_n, aa_h, ee_h, ae_share, rho_h, rho_n, ee_rho_h) -> dict:
    fh = (all30_h.get("cyclicFraction") or {}).get("conservative")
    fn = (all30_n.get("cyclicFraction") or {}).get("conservative")
    faa = (aa_h.get("cyclicFraction") or {}).get("conservative")
    fee = (ee_h.get("cyclicFraction") or {}).get("conservative")
    notes = []
    label = "MIXED"
    if fh is not None and fh < 0.08 and (rho_h is None or rho_h >= 0.65) and (faa is None or faa < 0.08) and (fee is None or fee < 0.10):
        label = "OUTCOME_A_STILL_MOSTLY_TRANSITIVE"
        notes.append("Expanded hostile geometry remains low-curl and reasonably estimator-stable.")
    if fh is not None and fh >= 0.12 and rho_h is not None and rho_h >= 0.70:
        label = "OUTCOME_B_ROBUST_CYCLIC"
        notes.append("Hostile cyclic fraction rose and is estimator-stable on the 30.")
    if rho_h is not None and rho_h < 0.45 or (ee_rho_h is not None and ee_rho_h < 0.45 and fee is not None and fee >= 0.08):
        label = "OUTCOME_C_AGGREGATION_SENSITIVE"
        notes.append("Cyclic residual disagrees across estimators, especially relative to expansion.")
    if (
        faa is not None
        and fee is not None
        and faa < 0.08
        and fee < 0.10
        and ae_share is not None
        and ae_share >= 0.50
        and fh is not None
        and fh >= 0.08
    ):
        label = "OUTCOME_D_CROSS_COHORT"
        notes.append("Within-cohort graphs are mostly transitive; cyclic energy concentrates on Anchor-Expansion edges.")
    return {
        "reading": label,
        "notes": notes,
        "notAClaim": "Instrument-validation reading. Not a Commander RPS result.",
        "observed": {
            "hostileCyclicFracALL30": fh,
            "netCyclicFracALL30": fn,
            "hostileCyclicFracAnchor": faa,
            "hostileCyclicFracExpansion": fee,
            "AEShareOfHostileCyclicEnergy": ae_share,
            "hostileSpearmanConsProm": rho_h,
            "netSpearmanConsProm": rho_n,
            "expansionHostileSpearmanConsProm": ee_rho_h,
        },
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((P3, "Pressure v3"), (K3, "K v3.0"), (H0, "Hodge v0"), (PROF2, "Profiles v2")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    names = names_of()
    slim = load_json(P3 / "pairs-summary.json")
    full = load_json(P3 / "pairs.json")
    by = {(r["from"], r["to"]): r for r in slim}
    full_of = {(r["from"], r["to"]): r for r in full}
    ids = [f"D{i:02d}" for i in range(1, 31)]
    if sorted({r["from"] for r in slim}) != ids:
        raise SystemExit("expected D01–D30")

    print("building M and edge stability…", flush=True)
    Ms = {ch: {est: build_M(ids, by, ch, est) for est in ESTIMATORS} for ch in CHANNELS}
    stab = {}
    stab_counts = {ch: defaultdict(int) for ch in CHANNELS}
    for a, b in combinations(ids, 2):
        rec = {}
        for ch in CHANNELS:
            vals = {est: float(Ms[ch][est][ids.index(a), ids.index(b)]) for est in ESTIMATORS}
            rec[ch] = m_edge_stability(vals)
            rec[f"{ch}_values"] = {est: round(vals[est], 4) for est in ESTIMATORS}
            stab_counts[ch][rec[ch]] += 1
        rec["cohort"] = edge_cohort(a, b)
        stab[(a, b)] = rec

    views = {
        "ALL30": ids,
        "ANCHOR15": ANCHOR,
        "EXPANSION15": EXPANSION,
    }
    masks_global = {
        "ALL": complete_mask(30),
        "HOSTILE_STABLE": stability_mask(30, ids, stab, "hostile"),
        "SUPPORTIVE_STABLE": stability_mask(30, ids, stab, "supportive"),
        "NET_STABLE": stability_mask(30, ids, stab, "net"),
        "ALL_CHANNEL_STABLE": stability_mask(30, ids, stab, "hostile", True)
        & stability_mask(30, ids, stab, "supportive", True)
        & stability_mask(30, ids, stab, "net", True),
    }

    packed, raw, robustness, triangles = {}, {}, {}, {}
    cohort_energy = {}
    print("decomposing views…", flush=True)
    for view_name, view_ids in views.items():
        keep = [ids.index(d) for d in view_ids]
        packed[view_name] = {}
        raw[view_name] = {}
        robustness[view_name] = {}
        triangles[view_name] = {}
        if view_name == "ALL30":
            view_masks = masks_global
        else:
            view_masks = {"ALL": complete_mask(len(view_ids))}
        for ch in CHANNELS:
            packed[view_name][ch] = {}
            raw[view_name][ch] = {}
            robustness[view_name][ch] = {}
            triangles[view_name][ch] = {}
            Mch = {est: submatrix(Ms[ch][est], keep) for est in ESTIMATORS}
            for mask_name, mask0 in view_masks.items():
                mask = mask0 if view_name == "ALL30" else mask0
                raw[view_name][ch][mask_name] = {}
                packed[view_name][ch][mask_name] = {}
                for est in ESTIMATORS:
                    dec = decompose(Mch[est], mask)
                    raw[view_name][ch][mask_name][est] = dec
                    packed[view_name][ch][mask_name][est] = pack_decomp(dec, view_ids, names)
                robustness[view_name][ch][mask_name] = estimator_robustness(raw[view_name][ch][mask_name], mask)
                if view_name == "ALL30" and mask_name == "ALL" and ch == "hostile":
                    cohort_energy[ch] = cyclic_by_cohort(raw[view_name][ch][mask_name]["conservative"]["C"], view_ids)
                if view_name == "ALL30" and mask_name == "ALL":
                    cohort_energy.setdefault("byChannel", {})[ch] = cyclic_by_cohort(raw[view_name][ch][mask_name]["conservative"]["C"], view_ids)

                raw_tris = triangle_records(Mch["conservative"], mask, view_ids, by, ch)
                gated = attach_triangle_gates(raw_tris[:80], by, names, ch)
                prom_map = {tuple(t["nodes"]): t for t in attach_triangle_gates(triangle_records(Mch["prominence"], mask, view_ids, by, ch)[:80], by, names, ch)}
                pres_map = {tuple(t["nodes"]): t for t in attach_triangle_gates(triangle_records(Mch["presence"], mask, view_ids, by, ch)[:80], by, names, ch)}
                labeled = []
                for t in gated:
                    nodes = tuple(t["nodes"])
                    und = list(combinations(nodes, 2))
                    stables = [stab[tuple(sorted(e))][ch] for e in und]
                    t["derivedEdgeStability"] = stables
                    t["robustnessClass"] = classify_triangle(t, prom_map.get(nodes), pres_map.get(nodes), stables)
                    labeled.append(t)
                cons_keys = {oriented_key(t) for t in labeled if t["materialLegs"] and abs(t["curl"]) >= MATERIAL}
                overlap = {}
                for est, mp in (("prominence", prom_map), ("presence", pres_map)):
                    keys = {oriented_key(t) for t in mp.values() if t.get("materialLegs") and abs(t.get("curl") or 0) >= MATERIAL}
                    overlap[est] = {
                        "nConservativeMaterial": len(cons_keys),
                        "nEstimatorMaterial": len(keys),
                        "nOverlapOriented": len(cons_keys & keys),
                    }
                counts = defaultdict(int)
                for t in labeled:
                    counts[t["robustnessClass"]] += 1
                triangles[view_name][ch][mask_name] = {
                    "top": labeled[:15],
                    "survivors": [t for t in labeled if t["robustnessClass"] in {"CORE_ROBUST", "PRIMARY_ROBUST"}],
                    "nMaterial": sum(1 for t in labeled if t["materialLegs"]),
                    "nInspected": len(labeled),
                    "robustnessCounts": dict(counts),
                    "estimatorCycleOverlap": overlap,
                    "note": "Counts are among the top-|curl| inspected triangles, not among all C(n,3) triples. Cycle count is not evidence.",
                }

    # Anchor v0 control
    h0_energy = load_json(H0 / "report.json")["energy"]
    v1_anchor = {ch: packed["ANCHOR15"][ch]["ALL"]["conservative"]["energy"]["cyclicFraction"] for ch in CHANNELS}
    anchor_control = {
        "v0": V0_ANCHOR,
        "v1": v1_anchor,
        "delta": {ch: round(v1_anchor[ch] - V0_ANCHOR[ch], 6) if v1_anchor[ch] is not None else None for ch in CHANNELS},
        "note": "K v3 filled old debt, so exact equality is not required. Large jumps would be implementation drift given ρ≈0.99.",
    }

    # Ablations on ALL30 conservative
    print("ablations and LOTO…", flush=True)
    ix = {d: i for i, d in enumerate(ids)}
    ablations = {}
    for fam in ABLATION_NAMES:
        h_ab = np.zeros((30, 30), dtype=float)
        s_ab = np.zeros((30, 30), dtype=float)
        for a in ids:
            for b in ids:
                if a == b:
                    continue
                rec = full_of[(a, b)]
                h = sum(float(t.get("effectiveTerm") or 0) for t in (rec.get("contributions") or {}).get("hostile") or [] if ablation_family(t["capability"]) != fam)
                s = sum(float(t.get("effectiveTerm") or 0) for t in (rec.get("contributions") or {}).get("supportive") or [] if ablation_family(t["capability"]) != fam)
                h_ab[ix[a], ix[b]] = h
                s_ab[ix[a], ix[b]] = s
        Mh, Ms_ = h_ab - h_ab.T, s_ab - s_ab.T
        Mn = (h_ab - s_ab) - (h_ab - s_ab).T
        ablations[fam] = {}
        for ch, M in (("hostile", Mh), ("supportive", Ms_), ("net", Mn)):
            dec = decompose(M, masks_global["ALL"])
            base = raw["ALL30"][ch]["ALL"]["conservative"]["energy"]
            ablations[fam][ch] = {
                "energy": dec["energy"],
                "cyclicFractionDelta": None
                if base["cyclicFraction"] is None or dec["energy"]["cyclicFraction"] is None
                else round(dec["energy"]["cyclicFraction"] - base["cyclicFraction"], 4),
                "totalEnergyRatio": round(dec["energy"]["total"] / base["total"], 4) if base["total"] else None,
            }

    loto = {}
    for ch in CHANNELS:
        base = raw["ALL30"][ch]["ALL"]["conservative"]
        rows, fracs = [], []
        for drop in range(30):
            keep = [i for i in range(30) if i != drop]
            dec = decompose(Ms[ch]["conservative"][np.ix_(keep, keep)], complete_mask(29))
            fracs.append(dec["energy"]["cyclicFraction"])
            rows.append({"leftOut": ids[drop], "commander": names.get(ids[drop], ids[drop]), "cohort": "anchor" if ids[drop] in ANCHOR else "expansion", "energy": dec["energy"]})
        valid = [f for f in fracs if f is not None]
        loto[ch] = {
            "baseCyclicFraction": base["energy"]["cyclicFraction"],
            "meanCyclicFraction": round(float(np.mean(valid)), 4) if valid else None,
            "stdCyclicFraction": round(float(np.std(valid)), 4) if valid else None,
            "minCyclicFraction": round(float(np.min(valid)), 4) if valid else None,
            "maxCyclicFraction": round(float(np.max(valid)), 4) if valid else None,
            "perDeck": rows,
        }

    ae_share = (cohort_energy.get("byChannel") or {}).get("hostile", {}).get("share", {}).get("anchor_expansion")
    reading = outcome_of(
        robustness["ALL30"]["hostile"]["ALL"],
        robustness["ALL30"]["net"]["ALL"],
        robustness["ANCHOR15"]["hostile"]["ALL"],
        robustness["EXPANSION15"]["hostile"]["ALL"],
        ae_share,
        (robustness["ALL30"]["hostile"]["ALL"].get("cyclicResidualSpearman") or {}).get("conservative_vs_prominence"),
        (robustness["ALL30"]["net"]["ALL"].get("cyclicResidualSpearman") or {}).get("conservative_vs_prominence"),
        (robustness["EXPANSION15"]["hostile"]["ALL"].get("cyclicResidualSpearman") or {}).get("conservative_vs_prominence"),
    )

    mask_meta = {
        name: {
            "nUndirected": int(m.sum() // 2),
            "nPossible": 435,
            "nComponents": decompose(Ms["hostile"]["conservative"], m)["nComponents"],
            "nIsolates": decompose(Ms["hostile"]["conservative"], m)["nIsolates"],
            "harmonicFraction": decompose(Ms["hostile"]["conservative"], m)["energy"]["harmonicFraction"],
        }
        for name, m in masks_global.items()
    }

    energy = {
        view: {ch: {mask: {est: packed[view][ch][mask][est]["energy"] for est in ESTIMATORS} for mask in packed[view][ch]} for ch in CHANNELS}
        for view in views
    }

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "HODGE_DIAGNOSTIC_V1",
        "parent": "deck-pressure-v3",
        "scope": "sealed 30",
        "primaryChannel": "M_hostile",
        "interpretation": "Aggregation robustness is the main instrument-validation question. s is not a ranking.",
        "not": ["Commander RPS claim", "deck ranking", "win probability", "matchup matrix"],
        "edgeStabilityCounts": {ch: dict(stab_counts[ch]) for ch in CHANNELS},
        "masks": mask_meta,
        "energy": energy,
        "cyclicEnergyByCohort": cohort_energy.get("byChannel"),
        "cyclicEnergyByCohortNote": "AE share near 225/435=0.517 means cyclic energy is proportional to edge count, not concentrated between cohorts.",
        "topHostileCyclicEdges": top_cyclic_edges(raw["ALL30"]["hostile"]["ALL"]["conservative"]["C"], ids),
        "estimatorRobustness": {view: {ch: robustness[view][ch] for ch in CHANNELS} for view in views},
        "anchorV0Control": anchor_control,
        "reading": reading,
        "safety": {"rpsAuthorized": False, "ranking": False, "winProbability": False, "newK": False, "pressureRecomputed": False, "ontologyRetrain": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "decompositions.json").write_text(json.dumps(packed, indent=2) + "\n", encoding="utf-8")
    (OUT / "edge-stability.json").write_text(
        json.dumps({"counts": report["edgeStabilityCounts"], "edges": [{**{"a": a, "b": b}, **rec} for (a, b), rec in stab.items()]}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT / "triangles.json").write_text(json.dumps(triangles, indent=2) + "\n", encoding="utf-8")
    (OUT / "ablations.json").write_text(json.dumps(ablations, indent=2) + "\n", encoding="utf-8")
    (OUT / "leave-one-deck.json").write_text(json.dumps(loto, indent=2) + "\n", encoding="utf-8")
    (OUT / "robustness.json").write_text(json.dumps(report["estimatorRobustness"], indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "HodgeDiagnostic",
                "version": "hodge-diagnostic-v1",
                "status": "DIAGNOSTIC_COMPLETE",
                "parent": "deck-pressure-v3",
                "outcome": reading["reading"],
                "note": "Instrument validation on sealed 30. Not a Commander RPS claim. Not a ranking.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "edgeStability": report["edgeStabilityCounts"],
                "masks": mask_meta,
                "cyclicALL30": {ch: energy["ALL30"][ch]["ALL"] for ch in CHANNELS},
                "cyclicAnchor": {ch: energy["ANCHOR15"][ch]["ALL"]["conservative"]["cyclicFraction"] for ch in CHANNELS},
                "cyclicExpansion": {ch: energy["EXPANSION15"][ch]["ALL"]["conservative"]["cyclicFraction"] for ch in CHANNELS},
                "cyclicStableHostile": energy["ALL30"]["hostile"].get("HOSTILE_STABLE", {}).get("conservative", {}).get("cyclicFraction"),
                "cohortHostile": cohort_energy.get("byChannel", {}).get("hostile"),
                "robustnessHostileALL": robustness["ALL30"]["hostile"]["ALL"],
                "robustnessNetALL": robustness["ALL30"]["net"]["ALL"],
                "robustnessHostileEE": robustness["EXPANSION15"]["hostile"]["ALL"],
                "triangleCountsHostileALL": triangles["ALL30"]["hostile"]["ALL"]["robustnessCounts"],
                "anchorV0": anchor_control,
                "ablationHostileCyclic": {k: v["hostile"]["energy"]["cyclicFraction"] for k, v in ablations.items()},
                "lotoHostile": {k: loto["hostile"][k] for k in loto["hostile"] if k != "perDeck"},
                "reading": reading,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

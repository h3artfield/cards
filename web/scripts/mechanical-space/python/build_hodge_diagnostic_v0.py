#!/usr/bin/env python3
"""
Hodge Diagnostic v0 — instrument validation on the sealed 15.

Frozen Pressure v2 only. No new K. No extra decks.
s is a transitive potential, not a ranking.
No Commander RPS claim. No win probability.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

from build_interaction_diversity_audit_v1 import cap_family
from build_k_v14_active_coverage import spearman_rho
from mechanical_hodge_v0 import decompose, flatten_upper, sign_agree
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P2 = MS / "deck-pressure-v2"
K27 = MS / "mechanical-pressure-k-v2.7"
PROF1 = MS / "deck-mechanical-profiles-v1"
PROF2 = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "hodge-diagnostic-v0"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

CHANNELS = ("hostile", "supportive", "net")
ESTIMATORS = ("conservative", "prominence", "presence")
CH_KEY = {
    "hostile": "hostile_pressure",
    "supportive": "supportive_pressure",
    "net": "net_interaction",
}
MATERIAL = 0.08  # experimental; same order as prior K material-reversal ε
NEAR_ZERO = 0.05
ABLATION_NAMES = (
    "removal",
    "artifact_shutdown",
    "graveyard_denial",
    "tax_counter",
    "discard",
    "combat_interference",
)


def ablation_family(cap_id: str) -> str | None:
    if cap_id == "ARTIFACT_SHUTDOWN":
        return "artifact_shutdown"
    if cap_id == "GRAVEYARD_DENIAL":
        return "graveyard_denial"
    fam = cap_family(cap_id)
    if fam in {"removal", "edict"} or cap_id == "ARTIFACT_REMOVAL":
        return "removal"
    if fam in {"tax", "counter"}:
        return "tax_counter"
    if fam == "discard":
        return "discard"
    if fam == "combat_interference":
        return "combat_interference"
    return None


def edge_maturity(ha: float, hb: float) -> str:
    if ha < 0.5 and hb < 0.5:
        return "EDGE_MATURE"
    if ha < 1.0 and hb < 1.0:
        return "EDGE_PARTIAL"
    return "EDGE_IMMATURE"


def names_of() -> dict[str, str]:
    key = load_json(PROF1 / "sealed-key.json")["key"]
    return {row["blindId"]: row["wantedCommander"].split(",")[0] for row in key}


def build_M(ids: list[str], by: dict, channel: str, estimator: str) -> np.ndarray:
    n = len(ids)
    M = np.zeros((n, n), dtype=float)
    key = CH_KEY[channel]
    ix = {d: i for i, d in enumerate(ids)}
    for a in ids:
        for b in ids:
            if a == b:
                continue
            pa = by[(a, b)]["estimators"][estimator][key]
            pb = by[(b, a)]["estimators"][estimator][key]
            M[ix[a], ix[b]] = pa - pb
    return M


def masks_for(ids: list[str], by: dict) -> dict[str, np.ndarray]:
    n = len(ids)
    ix = {d: i for i, d in enumerate(ids)}

    def empty():
        m = np.zeros((n, n), dtype=bool)
        return m

    all_m = empty()
    h1 = empty()
    h75 = empty()
    h5 = empty()
    stable = empty()
    mature_stable = empty()
    for i, a in enumerate(ids):
        for j, b in enumerate(ids):
            if i >= j:
                continue
            pa, pb = by[(a, b)], by[(b, a)]
            all_m[i, j] = all_m[j, i] = True
            ha, hb = pa["H_credible"], pb["H_credible"]
            if ha < 1 and hb < 1:
                h1[i, j] = h1[j, i] = True
            if ha < 0.75 and hb < 0.75:
                h75[i, j] = h75[j, i] = True
            if ha < 0.5 and hb < 0.5:
                h5[i, j] = h5[j, i] = True
            st = pa.get("net_sign_status") != "SENSITIVE" and pb.get("net_sign_status") != "SENSITIVE"
            if st:
                stable[i, j] = stable[j, i] = True
            if st and ha < 1 and hb < 1:
                mature_stable[i, j] = mature_stable[j, i] = True
    return {
        "ALL": all_m,
        "HCRED_LT_1": h1,
        "HCRED_LT_075": h75,
        "HCRED_LT_05": h5,
        "AGG_STABLE": stable,
        "MATURITY_AND_STABLE": mature_stable,
    }


def pack_decomp(dec: dict, ids: list[str], names: dict[str, str]) -> dict:
    s = dec["s"]
    coords = [
        {
            "id": ids[i],
            "commander": names.get(ids[i], ids[i]),
            "transitive_potential": round(float(s[i]), 4),
            "notARanking": True,
        }
        for i in range(len(ids))
    ]
    return {
        "nNodes": dec["nNodes"],
        "nEdges": dec["nEdges"],
        "nComponents": dec["nComponents"],
        "nIsolates": dec["nIsolates"],
        "nTriangles": dec["nTriangles"],
        "complete": dec["complete"],
        "globalPotentialDefined": dec["globalPotentialDefined"],
        "topology": dec["topology"],
        "energy": dec["energy"],
        "transitivePotential": coords,
        "transitivePotentialNote": "Best gradient fit to this flow. Not a deck ranking. Not a win-rate order.",
    }


def triangle_records(M: np.ndarray, mask: np.ndarray, ids: list[str], by: dict, channel: str) -> list[dict]:
    n = len(ids)
    rows = []
    for i, j, k in combinations(range(n), 3):
        if not (mask[i, j] and mask[j, k] and mask[i, k]):
            continue
        mij, mjk, mki = M[i, j], M[j, k], M[k, i]
        curl = mij + mjk + mki
        legs = (abs(mij), abs(mjk), abs(mki))
        if max(legs) < 1e-12:
            continue
        rows.append(
            {
                "nodes": [ids[i], ids[j], ids[k]],
                "M": [round(mij, 4), round(mjk, 4), round(mki, 4)],
                "absM": [round(x, 4) for x in legs],
                "curl": round(float(curl), 4),
                "materialLegs": all(x >= MATERIAL for x in legs),
                "nearZeroArtifact": any(x < NEAR_ZERO for x in legs),
            }
        )
    rows.sort(key=lambda r: -abs(r["curl"]))
    return rows


def attach_triangle_gates(rows: list[dict], by: dict, names: dict[str, str], channel: str) -> list[dict]:
    out = []
    for r in rows:
        a, b, c = r["nodes"]
        undirected = ((a, b), (b, c), (c, a))
        maturities = []
        stables = []
        proofs = []
        fams = []
        for x, y, mxy in zip((a, b, c), (b, c, a), r["M"]):
            px, py = by[(x, y)], by[(y, x)]
            maturities.append(edge_maturity(px["H_credible"], py["H_credible"]))
            stables.append(px.get("net_sign_status") != "SENSITIVE" and py.get("net_sign_status") != "SENSITIVE")
            # proof from the directed measurement that contributes positively to M
            src = px if mxy >= 0 else py
            tops = src.get("top_hostile_mechanisms") if channel != "supportive" else src.get("top_supportive_mechanisms")
            top = (tops or [{}])[0]
            edge = top.get("edge")
            cap = (edge or "").split(" → ")[0] if edge else None
            fams.append(ablation_family(cap) if cap else None)
            proofs.append(
                {
                    "dir": f"{src['from']}→{src['to']}",
                    "H_credible": src["H_credible"],
                    "top": top,
                    "ablationFamily": ablation_family(cap) if cap else None,
                }
            )
        bilateral = all(m != "EDGE_IMMATURE" for m in maturities)
        both_mature = all(m == "EDGE_MATURE" for m in maturities)
        distinct = len({f for f in fams if f}) >= 2
        orientation = None
        if r["curl"] > 0:
            orientation = f"{a}→{b}→{c}→{a}"
        elif r["curl"] < 0:
            orientation = f"{a}→{c}→{b}→{a}"
        out.append(
            {
                **r,
                "commanders": [names.get(x, x) for x in r["nodes"]],
                "orientation": orientation,
                "edgeMaturity": maturities,
                "aggregationStableLegs": stables,
                "bilateralAcceptable": bilateral,
                "bilateralMature": both_mature,
                "aggregationStableCycle": all(stables),
                "distinctCausalFamilies": distinct,
                "families": fams,
                "proofs": proofs,
                "gated": r["materialLegs"] and bilateral and all(stables) and distinct and not r["nearZeroArtifact"],
            }
        )
    return out


def estimator_robustness(decs: dict[str, dict], mask: np.ndarray) -> dict:
    """decs keyed by estimator, each a full decompose() result."""
    Cs = {e: decs[e]["C"] for e in ESTIMATORS}
    fracs = {e: decs[e]["energy"]["cyclicFraction"] for e in ESTIMATORS}
    pairs = list(combinations(ESTIMATORS, 2))
    rhos = {}
    signs = {}
    for a, b in pairs:
        shared = mask
        fa, fb = flatten_upper(Cs[a], shared), flatten_upper(Cs[b], shared)
        rhos[f"{a}_vs_{b}"] = round(spearman_rho(fa, fb), 4) if len(fa) >= 3 else None
        signs[f"{a}_vs_{b}"] = sign_agree(Cs[a], Cs[b], shared)
    return {
        "cyclicFraction": fracs,
        "cyclicResidualSpearman": rhos,
        "cyclicResidualSignAgreement": signs,
    }


def oriented_key(row: dict) -> tuple:
    nodes = tuple(row["nodes"])
    return (nodes, 1 if row["curl"] > 0 else (-1 if row["curl"] < 0 else 0))


def classify_outcome(summary: dict) -> dict:
    mh = summary["hostile"]["ALL"]
    mn = summary["net"]["ALL"]
    mh_ms = summary["hostile"].get("MATURITY_AND_STABLE") or {}
    mn_ms = summary["net"].get("MATURITY_AND_STABLE") or {}
    frac_h = (mh.get("cyclicFraction") or {}).get("conservative")
    frac_n = (mn.get("cyclicFraction") or {}).get("conservative")
    rho_h = (mh.get("cyclicResidualSpearman") or {}).get("conservative_vs_prominence")
    rho_n = (mn.get("cyclicResidualSpearman") or {}).get("conservative_vs_prominence")
    frac_h_ms = (mh_ms.get("cyclicFraction") or {}).get("conservative")
    notes = []
    label = "MIXED"
    if frac_h is not None and frac_h < 0.08 and (frac_h_ms is None or frac_h_ms < 0.08):
        label = "OUTCOME_4_MOSTLY_TRANSITIVE"
        notes.append("Cyclic energy is small on hostile flow after the laboratory is assembled.")
    if frac_h and frac_h >= 0.10 and frac_h_ms is not None and frac_h_ms < 0.05:
        label = "OUTCOME_3_IMMATURE_EDGE_DRIVEN"
        notes.append("Full-graph hostile curl shrinks once bilateral immature edges are removed.")
    if rho_n is not None and rho_n < 0.4 and (rho_h is None or rho_h >= 0.7):
        label = "OUTCOME_2_NET_AGGREGATION_SENSITIVE"
        notes.append("Hostile cyclic geometry is more estimator-stable than net cyclic geometry.")
    if rho_h is not None and rho_h < 0.4:
        label = "OUTCOME_2_AGGREGATION_SENSITIVE"
        notes.append("Hostile cyclic residuals disagree across estimators.")
    if (
        frac_h
        and frac_h >= 0.15
        and rho_h is not None
        and rho_h >= 0.75
        and frac_h_ms is not None
        and frac_h_ms >= 0.10
    ):
        label = "OUTCOME_1_ROBUST_CYCLIC"
        notes.append("Hostile cyclic fraction is material and fairly estimator-stable on the trustworthy subgraph.")
    return {
        "reading": label,
        "notes": notes,
        "notAClaim": "This is an instrument-validation reading, not a Commander RPS result.",
        "observed": {
            "hostileCyclicFracALL": frac_h,
            "netCyclicFracALL": frac_n,
            "hostileCyclicFracMatureStable": frac_h_ms,
            "hostileSpearmanConsProm": rho_h,
            "netSpearmanConsProm": rho_n,
        },
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(P2 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v2 must be frozen")
    if load_json(K27 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v2.7 must stay frozen")
    if load_json(PROF2 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must stay frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    names = names_of()
    slim = load_json(P2 / "pairs-summary.json")
    full = load_json(P2 / "pairs.json")
    by = {(r["from"], r["to"]): r for r in slim}
    full_of = {(r["from"], r["to"]): r for r in full}
    ids = sorted({r["from"] for r in slim})
    if len(ids) != 15:
        raise SystemExit(f"expected 15 decks, got {len(ids)}")

    Ms = {ch: {est: build_M(ids, by, ch, est) for est in ESTIMATORS} for ch in CHANNELS}
    masks = masks_for(ids, by)
    mask_meta = {
        name: {
            "nUndirected": int(m.sum() // 2),
            "nPossible": 105,
            "disconnected": decompose(Ms["hostile"]["conservative"], m)["nComponents"]
            - decompose(Ms["hostile"]["conservative"], m)["nIsolates"]
            > 1
            or decompose(Ms["hostile"]["conservative"], m)["nIsolates"] > 0,
            "nIsolates": decompose(Ms["hostile"]["conservative"], m)["nIsolates"],
            "nComponents": decompose(Ms["hostile"]["conservative"], m)["nComponents"],
        }
        for name, m in masks.items()
    }

    packed = {}
    raw_decs = {}
    robustness = {}
    triangles = {}
    for ch in CHANNELS:
        packed[ch] = {}
        raw_decs[ch] = {}
        robustness[ch] = {}
        triangles[ch] = {}
        for mask_name, mask in masks.items():
            raw_decs[ch][mask_name] = {}
            packed[ch][mask_name] = {}
            for est in ESTIMATORS:
                dec = decompose(Ms[ch][est], mask)
                raw_decs[ch][mask_name][est] = dec
                packed[ch][mask_name][est] = pack_decomp(dec, ids, names)
            robustness[ch][mask_name] = estimator_robustness(raw_decs[ch][mask_name], mask)
            # candidate triangles from conservative
            raw_tris = triangle_records(Ms[ch]["conservative"], mask, ids, by, ch)
            gated = attach_triangle_gates(raw_tris[:40], by, names, ch)
            # estimator cycle overlap on material conservative triangles
            cons_keys = {oriented_key(t) for t in gated if t["materialLegs"] and abs(t["curl"]) >= MATERIAL}
            overlap = {}
            for est in ("prominence", "presence"):
                et = attach_triangle_gates(triangle_records(Ms[ch][est], mask, ids, by, ch)[:40], by, names, ch)
                keys = {oriented_key(t) for t in et if t["materialLegs"] and abs(t["curl"]) >= MATERIAL}
                overlap[est] = {
                    "nConservativeMaterial": len(cons_keys),
                    "nEstimatorMaterial": len(keys),
                    "nOverlapOriented": len(cons_keys & keys),
                    "nOverlapUnordered": len({k[0] for k in cons_keys} & {k[0] for k in keys}),
                }
            triangles[ch][mask_name] = {
                "top": gated[:12],
                "nMaterial": sum(1 for t in gated if t["materialLegs"]),
                "nGated": sum(1 for t in gated if t["gated"]),
                "estimatorCycleOverlap": overlap,
            }

    # family mass on conservative hostile
    fam_mass = defaultdict(float)
    for r in full:
        for t in (r.get("contributions") or {}).get("hostile") or []:
            fam_mass[ablation_family(t["capability"]) or "other"] += abs(float(t.get("effectiveTerm") or 0))
    fam_total = sum(fam_mass.values()) or 1.0
    family_share = {k: round(v / fam_total, 4) for k, v in sorted(fam_mass.items(), key=lambda kv: -kv[1])}

    # ablations on conservative hostile / net, key masks
    ablations = {}
    key_masks = ("ALL", "HCRED_LT_1", "MATURITY_AND_STABLE")
    ix = {d: i for i, d in enumerate(ids)}
    for fam in ABLATION_NAMES:
        h_ab = np.zeros((15, 15), dtype=float)
        n_ab = np.zeros((15, 15), dtype=float)
        for a in ids:
            for b in ids:
                if a == b:
                    continue
                rec = full_of[(a, b)]
                h = sum(
                    float(t.get("effectiveTerm") or 0)
                    for t in (rec.get("contributions") or {}).get("hostile") or []
                    if ablation_family(t["capability"]) != fam
                )
                s = rec["channels"]["supportive_pressure"]
                h_ab[ix[a], ix[b]] = h
                n_ab[ix[a], ix[b]] = h - s
        Mh = h_ab - h_ab.T
        Mn = n_ab - n_ab.T
        ablations[fam] = {}
        for mask_name in key_masks:
            mask = masks[mask_name]
            dh = decompose(Mh, mask)
            dn = decompose(Mn, mask)
            base_h = raw_decs["hostile"][mask_name]["conservative"]["energy"]
            base_n = raw_decs["net"][mask_name]["conservative"]["energy"]
            ablations[fam][mask_name] = {
                "hostile": {
                    "energy": dh["energy"],
                    "cyclicFractionDelta": None
                    if base_h["cyclicFraction"] is None or dh["energy"]["cyclicFraction"] is None
                    else round(dh["energy"]["cyclicFraction"] - base_h["cyclicFraction"], 4),
                    "totalEnergyRatio": round(dh["energy"]["total"] / base_h["total"], 4) if base_h["total"] else None,
                },
                "net": {
                    "energy": dn["energy"],
                    "cyclicFractionDelta": None
                    if base_n["cyclicFraction"] is None or dn["energy"]["cyclicFraction"] is None
                    else round(dn["energy"]["cyclicFraction"] - base_n["cyclicFraction"], 4),
                    "totalEnergyRatio": round(dn["energy"]["total"] / base_n["total"], 4) if base_n["total"] else None,
                },
            }

    # leave-one-deck-out on ALL + MATURITY_AND_STABLE, conservative, all channels
    loto = {}
    for mask_name in ("ALL", "MATURITY_AND_STABLE"):
        loto[mask_name] = {}
        for ch in CHANNELS:
            base = raw_decs[ch][mask_name]["conservative"]
            rows = []
            fracs = []
            for drop in range(15):
                keep = [i for i in range(15) if i != drop]
                sub_M = Ms[ch]["conservative"][np.ix_(keep, keep)]
                sub_mask = masks[mask_name][np.ix_(keep, keep)]
                dec = decompose(sub_M, sub_mask)
                fracs.append(dec["energy"]["cyclicFraction"])
                rows.append(
                    {
                        "leftOut": ids[drop],
                        "commander": names.get(ids[drop], ids[drop]),
                        "energy": dec["energy"],
                        "nEdges": dec["nEdges"],
                        "nComponents": dec["nComponents"],
                        "nIsolates": dec["nIsolates"],
                    }
                )
            valid = [f for f in fracs if f is not None]
            loto[mask_name][ch] = {
                "baseCyclicFraction": base["energy"]["cyclicFraction"],
                "meanCyclicFraction": round(float(np.mean(valid)), 4) if valid else None,
                "stdCyclicFraction": round(float(np.std(valid)), 4) if valid else None,
                "minCyclicFraction": round(float(np.min(valid)), 4) if valid else None,
                "maxCyclicFraction": round(float(np.max(valid)), 4) if valid else None,
                "perDeck": rows,
            }

    # robustness summary table
    rob_table = {}
    for ch in CHANNELS:
        rob_table[ch] = {mask: robustness[ch][mask] for mask in masks}

    reading = classify_outcome(rob_table)
    # attach gated triangle family diversity
    gated_fams = set()
    for t in triangles["hostile"]["ALL"]["top"]:
        if t.get("gated"):
            gated_fams.update(f for f in t.get("families") or [] if f)
    reading["gatedHostileFamilies"] = sorted(gated_fams)
    reading["nGatedHostileTrianglesALL"] = triangles["hostile"]["ALL"]["nGated"]
    reading["nGatedHostileTrianglesMatureStable"] = triangles["hostile"]["MATURITY_AND_STABLE"]["nGated"]

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "HODGE_DIAGNOSTIC_V0",
        "parent": "deck-pressure-v2",
        "scope": "sealed 15 only",
        "interpretation": "instrument validation of Hodge on frozen Pressure v2",
        "not": [
            "Commander RPS claim",
            "deck ranking",
            "best-deck interpretation",
            "win probability",
            "corpus-general conclusion",
        ],
        "materialEpsilon": MATERIAL,
        "nearZeroEpsilon": NEAR_ZERO,
        "channels": list(CHANNELS),
        "estimators": list(ESTIMATORS),
        "masks": mask_meta,
        "familyShareConservativeHostile": family_share,
        "energy": {
            ch: {mask: {est: packed[ch][mask][est]["energy"] for est in ESTIMATORS} for mask in masks} for ch in CHANNELS
        },
        "robustness": rob_table,
        "reading": reading,
        "safety": {
            "rpsAuthorized": False,
            "ranking": False,
            "winProbability": False,
            "extraDecks": False,
            "multiplyMByOneMinusH": False,
            "openai": False,
            "reembed": False,
            "kEdited": False,
            "pressureRecomputed": False,
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "decompositions.json").write_text(json.dumps(packed, indent=2) + "\n", encoding="utf-8")
    (OUT / "triangles.json").write_text(json.dumps(triangles, indent=2) + "\n", encoding="utf-8")
    (OUT / "ablations.json").write_text(
        json.dumps({"familyShare": family_share, "ablations": ablations}, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "leave-one-deck.json").write_text(json.dumps(loto, indent=2) + "\n", encoding="utf-8")
    (OUT / "robustness.json").write_text(json.dumps(rob_table, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "HodgeDiagnostic",
                "version": "hodge-diagnostic-v0",
                "status": "DIAGNOSTIC_COMPLETE",
                "parent": "deck-pressure-v2",
                "note": "Instrument validation. Not a Commander RPS claim. Not a ranking. Not frozen as strategic truth.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "masks": mask_meta,
                "hostileALL": report["energy"]["hostile"]["ALL"],
                "netALL": report["energy"]["net"]["ALL"],
                "supportiveALL": report["energy"]["supportive"]["ALL"],
                "hostileMatureStable": report["energy"]["hostile"]["MATURITY_AND_STABLE"],
                "robustnessHostileALL": rob_table["hostile"]["ALL"],
                "robustnessNetALL": rob_table["net"]["ALL"],
                "nGatedHostile": triangles["hostile"]["ALL"]["nGated"],
                "familyShare": family_share,
                "ablationALL_hostile_cyclicFrac": {k: v["ALL"]["hostile"]["energy"]["cyclicFraction"] for k, v in ablations.items()},
                "lotoHostileALL": {k: loto["ALL"]["hostile"][k] for k in loto["ALL"]["hostile"] if k != "perDeck"},
                "reading": reading,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

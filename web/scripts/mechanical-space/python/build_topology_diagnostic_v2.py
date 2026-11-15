#!/usr/bin/env python3
"""
Topology Diagnostic v2 — sealed 60.

Part A: Hodge Diagnostic v2
Part B: Generalized Cycle Structure Audit v2

Frozen Pressure v4 only. No new thresholds. s is not a ranking. No RPS claim.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np

from build_generalized_cycle_audit_v1 import (
    VIEWS as CYCLE_VIEWS,
    bottleneck_cycles,
    build_view_edges,
    family_class,
    karp_max_mean,
    min_feedback_arc,
    pack_cycle,
    robustness_of,
    scc_report,
)
from build_hodge_diagnostic_v0 import CHANNELS, ESTIMATORS, MATERIAL, build_M, estimator_robustness, pack_decomp
from build_hodge_diagnostic_v1 import complete_mask, sign_of, submatrix
from mechanical_hodge_v0 import decompose
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
P4 = MS / "deck-pressure-v4"
H1 = MS / "hodge-diagnostic-v1"
G1 = MS / "generalized-cycle-audit-v1"
CEX1 = MS / "corpus-expansion-v1"
CEX2 = MS / "corpus-expansion-v2"
PROF2 = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "topology-diagnostic-v2"
H2 = OUT / "hodge"
C2 = OUT / "cycles"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

OLD30 = [f"D{i:02d}" for i in range(1, 31)]
E2 = [f"D{i:02d}" for i in range(31, 61)]
ALL60 = [f"D{i:02d}" for i in range(1, 61)]
HODGE_SMALL = 0.08


def names_of() -> dict[str, str]:
    out = {}
    for path in (CEX1 / "sealed-key.json", CEX2 / "sealed-key.json"):
        blob = load_json(path)
        for row in blob.get("key") or []:
            out[row["blindId"]] = (row.get("wantedCommander") or row["blindId"]).split(",")[0]
    return out


def edge_bucket(a: str, b: str) -> str:
    ao, bo = a in set(OLD30), b in set(OLD30)
    if ao and bo:
        return "OLD30_OLD30"
    if (not ao) and (not bo):
        return "E2_E2"
    return "OLD30_E2"


def cyclic_by_bucket(C: np.ndarray, ids: list[str]) -> dict:
    mass = defaultdict(float)
    n = len(ids)
    for i in range(n):
        for j in range(i + 1, n):
            mass[edge_bucket(ids[i], ids[j])] += float(C[i, j] ** 2)
    tot = sum(mass.values())
    keys = ("OLD30_OLD30", "E2_E2", "OLD30_E2")
    return {
        "mass": {k: round(mass[k], 6) for k in keys},
        "share": {k: round(mass[k] / tot, 4) if tot else None for k in keys},
        "nEdges": {"OLD30_OLD30": 435, "E2_E2": 435, "OLD30_E2": 900},
        "totalCyclicEnergy": round(tot, 6),
    }


def top_cyclic_edges(C: np.ndarray, ids: list[str], k: int = 12) -> list[dict]:
    rows = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            rows.append({"a": ids[i], "b": ids[j], "C": round(float(C[i, j]), 4), "absC": round(abs(float(C[i, j])), 4), "bucket": edge_bucket(ids[i], ids[j])})
    rows.sort(key=lambda r: -r["absC"])
    return rows[:k]


def top_overlap(Ca, Cb, ids, k=12) -> dict:
    ta = {(min(r["a"], r["b"]), max(r["a"], r["b"])) for r in top_cyclic_edges(Ca, ids, k)}
    tb = {(min(r["a"], r["b"]), max(r["a"], r["b"])) for r in top_cyclic_edges(Cb, ids, k)}
    return {"k": k, "overlap": len(ta & tb), "jaccard": round(len(ta & tb) / len(ta | tb), 4) if ta | tb else None}


def cons_prom_mask(n: int, ids: list[str], Ms: dict, channel: str) -> np.ndarray:
    ix = {d: i for i, d in enumerate(ids)}
    m = np.zeros((n, n), dtype=bool)
    Mc, Mp = Ms[channel]["conservative"], Ms[channel]["prominence"]
    for a, b in combinations(ids, 2):
        i, j = ix[a], ix[b]
        vc, vp = float(Mc[i, j]), float(Mp[i, j])
        if abs(vc) >= MATERIAL and abs(vp) >= MATERIAL and sign_of(vc) == sign_of(vp) and sign_of(vc) != 0:
            m[i, j] = m[j, i] = True
    return m


def all_three_mask(n: int, ids: list[str], Ms: dict, channel: str) -> np.ndarray:
    ix = {d: i for i, d in enumerate(ids)}
    m = np.zeros((n, n), dtype=bool)
    mats = [Ms[channel][e] for e in ESTIMATORS]
    for a, b in combinations(ids, 2):
        i, j = ix[a], ix[b]
        vals = [float(M[i, j]) for M in mats]
        if all(abs(v) >= MATERIAL for v in vals) and len({sign_of(v) for v in vals}) == 1 and sign_of(vals[0]) != 0:
            m[i, j] = m[j, i] = True
    return m


def channel_stable_mask(n: int, ids: list[str], stab: dict, channel: str) -> np.ndarray:
    ix = {d: i for i, d in enumerate(ids)}
    m = np.zeros((n, n), dtype=bool)
    for (a, b), rec in stab.items():
        if a not in ix or b not in ix:
            continue
        if rec.get(channel) != "STABLE_DIRECTION":
            continue
        i, j = ix[a], ix[b]
        m[i, j] = m[j, i] = True
    return m


def is_dag(scc: dict, fas: dict | None) -> bool:
    if scc.get("nNontrivial", 0) != 0:
        return False
    if fas and (fas.get("nRemoved") or 0) != 0:
        return False
    return True


def cycle_provenance(blind_ids: list[str]) -> str:
    old = any(x in set(OLD30) for x in blind_ids)
    e2 = any(x in set(E2) for x in blind_ids)
    if old and e2:
        return "OLD30_PLUS_E2"
    if e2 and not old:
        return "E2_ONLY"
    return "OLD30_ONLY"


def decide(h60: float | None, h30: float | None, dag_table: dict) -> dict:
    host = dag_table["hostile"]
    dag_all = all(host[est][view] for est in ESTIMATORS for view in CYCLE_VIEWS)
    dag_material_all_est = all(host[est]["ALL_MATERIAL"] for est in ESTIMATORS)
    dag_stable_cons = host["conservative"]["AGG_STABLE"]
    dag_cons_prom = host["conservative"]["CONS_PROM_STABLE"] and host["prominence"]["CONS_PROM_STABLE"]
    small = h60 is not None and h60 < HODGE_SMALL
    increased = h60 is not None and h30 is not None and h60 > h30 + 1e-6
    if dag_all and small:
        code, note = "T2-A", "STRONGLY_TRANSITIVE"
    elif dag_all and increased:
        code, note = "T2-B", "DIFFUSE_CYCLIC_RESIDUAL"
    elif dag_all:
        code, note = "T2-A", "STRONGLY_TRANSITIVE"
    elif (not dag_material_all_est) and dag_stable_cons and dag_cons_prom:
        code, note = "T2-C", "ESTIMATOR_SENSITIVE_CYCLES"
    elif (not dag_stable_cons) or (not dag_cons_prom):
        # cycles on stable or cons+prom: robust unless they fail presence-only
        if host["conservative"]["AGG_STABLE"] is False and host["conservative"]["CONS_PROM_STABLE"] is False:
            code, note = "T2-D", "ROBUST_NON_TRANSITIVITY"
        else:
            code, note = "T2-C", "ESTIMATOR_SENSITIVE_CYCLES"
    else:
        code, note = "T2-C", "ESTIMATOR_SENSITIVE_CYCLES"
    return {
        "code": code,
        "label": note,
        "hodgeCyclicFracALL60HostileConservative": h60,
        "hodgeCyclicFracOLD30HostileConservative": h30,
        "hostileDAGAllEstimatorsMasks": dag_all,
        "notAClaim": "Not a Commander RPS result. s is not a ranking.",
    }


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((P4, "Pressure v4"), (H1, "Hodge v1"), (G1, "G1"), (PROF2, "Profiles v2")):
        st = load_json(path / "IMMUTABLE.json")
        if st.get("status") not in {"FROZEN", "DIAGNOSTIC_COMPLETE"} and st.get("qa") != "DIAGNOSTIC_COMPLETE":
            if st.get("status") != "FROZEN":
                raise SystemExit(f"{label} must be frozen")
    if load_json(P4 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Pressure v4 must be frozen")
    if load_json(OUT / "protocol.json").get("status") != "FROZEN":
        raise SystemExit("Topology v2 protocol must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    names = names_of()
    slim = load_json(P4 / "pairs-summary.json")
    by = {(r["from"], r["to"]): r for r in slim}
    if sorted({r["from"] for r in slim}) != ALL60:
        raise SystemExit("expected D01–D60")

    print("building M…", flush=True)
    Ms = {ch: {est: build_M(ALL60, by, ch, est) for est in ESTIMATORS} for ch in CHANNELS}
    stab_raw = load_json(P4 / "edge-stability.json")["edges"]
    stab = {}
    for r in stab_raw:
        stab[(r["a"], r["b"])] = r
        stab[(r["b"], r["a"])] = r

    # ----- Part A: Hodge -----
    print("Hodge views…", flush=True)
    views = {"ALL60": ALL60, "OLD30": OLD30, "E2_30": E2}
    packed, raw, robustness, cohort = {}, {}, {}, {}
    for view_name, view_ids in views.items():
        keep = [ALL60.index(d) for d in view_ids]
        n = len(view_ids)
        Mview = {ch: {est: submatrix(Ms[ch][est], keep) for est in ESTIMATORS} for ch in CHANNELS}
        if view_name == "ALL60":
            masks = {
                "ALL": complete_mask(n),
                "CHANNEL_STABLE": None,
                "CONS_PROM_STABLE": None,
                "ALL_THREE_STABLE": None,
            }
        else:
            masks = {"ALL": complete_mask(n)}
        packed[view_name] = {}
        raw[view_name] = {}
        robustness[view_name] = {}
        for ch in CHANNELS:
            packed[view_name][ch] = {}
            raw[view_name][ch] = {}
            robustness[view_name][ch] = {}
            view_masks = dict(masks)
            if view_name == "ALL60":
                view_masks["CHANNEL_STABLE"] = channel_stable_mask(n, view_ids, stab, ch)
                view_masks["CONS_PROM_STABLE"] = cons_prom_mask(n, view_ids, Mview, ch)
                view_masks["ALL_THREE_STABLE"] = all_three_mask(n, view_ids, Mview, ch)
            for mask_name, mask in view_masks.items():
                raw[view_name][ch][mask_name] = {}
                packed[view_name][ch][mask_name] = {}
                print(f"  hodge {view_name} {ch} {mask_name}", flush=True)
                for est in ESTIMATORS:
                    dec = decompose(Mview[ch][est], mask)
                    raw[view_name][ch][mask_name][est] = dec
                    packed[view_name][ch][mask_name][est] = pack_decomp(dec, view_ids, names)
                robustness[view_name][ch][mask_name] = estimator_robustness(raw[view_name][ch][mask_name], mask)
                robustness[view_name][ch][mask_name]["topEdgeOverlap"] = {
                    "conservative_vs_prominence": top_overlap(raw[view_name][ch][mask_name]["conservative"]["C"], raw[view_name][ch][mask_name]["prominence"]["C"], view_ids),
                    "conservative_vs_presence": top_overlap(raw[view_name][ch][mask_name]["conservative"]["C"], raw[view_name][ch][mask_name]["presence"]["C"], view_ids),
                    "prominence_vs_presence": top_overlap(raw[view_name][ch][mask_name]["prominence"]["C"], raw[view_name][ch][mask_name]["presence"]["C"], view_ids),
                }
            if view_name == "ALL60":
                cohort[ch] = cyclic_by_bucket(raw[view_name][ch]["ALL"]["conservative"]["C"], view_ids)

    h1_energy = load_json(H1 / "report.json")["energy"]["ALL30"]
    old30_recon = {"pass": True, "deltas": {}}
    for ch in CHANNELS:
        for est in ESTIMATORS:
            old = h1_energy[ch]["ALL"][est]
            new = packed["OLD30"][ch]["ALL"][est]["energy"]
            dfrac = None if old.get("cyclicFraction") is None or new.get("cyclicFraction") is None else abs(old["cyclicFraction"] - new["cyclicFraction"])
            dcy = abs(float(old.get("cyclic") or 0) - float(new.get("cyclic") or 0))
            ok = (dfrac is None or dfrac <= 1e-6) and dcy <= 1e-4
            old30_recon["deltas"][f"{ch}.{est}"] = {"oldCyclicFraction": old.get("cyclicFraction"), "newCyclicFraction": new.get("cyclicFraction"), "dCyclic": round(dcy, 6), "pass": ok}
            if not ok:
                old30_recon["pass"] = False
    if not old30_recon["pass"]:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "IMMUTABLE.json").write_text(json.dumps({"status": "QA_FAILED", "reason": "OLD-30 Hodge did not reproduce Hodge v1", "reconstruction": old30_recon}, indent=2) + "\n", encoding="utf-8")
        raise SystemExit("OLD-30 Hodge reconstruction failed")

    # ----- Part B: cycles -----
    print("cycle audit…", flush=True)
    cycle_packed = {}
    dag_table = {ch: {est: {} for est in ESTIMATORS} for ch in CHANNELS}
    old30_g1 = {"pass": True, "rows": []}
    leading = []
    for scope_name, scope_ids in (("ALL60", ALL60), ("OLD30", OLD30)):
        keep = [ALL60.index(d) for d in scope_ids]
        Ms_s = {ch: {est: submatrix(Ms[ch][est], keep) for est in ESTIMATORS} for ch in CHANNELS}
        cycle_packed[scope_name] = {}
        for ch in CHANNELS:
            cycle_packed[scope_name][ch] = {}
            for est in ESTIMATORS:
                cycle_packed[scope_name][ch][est] = {}
                for view in CYCLE_VIEWS:
                    print(f"  cycle {scope_name} {ch} {est} {view}", flush=True)
                    edges = build_view_edges(scope_ids, Ms_s, stab, ch, est, view)
                    wdir = {(u, v): w for u, v, w in edges}
                    scc = scc_report(len(scope_ids), edges, scope_ids, names, Ms_s[ch][est])
                    fas = min_feedback_arc(len(scope_ids), edges)
                    dag = is_dag(scc, fas)
                    bn = [] if dag else bottleneck_cycles(len(scope_ids), edges)
                    mmc = None if dag else karp_max_mean(len(scope_ids), edges)
                    if scope_name == "ALL60":
                        dag_table[ch][est][view] = dag
                    if scope_name == "OLD30" and ch == "hostile":
                        old30_g1["rows"].append({"estimator": est, "view": view, "dag": dag, "nNontrivial": scc["nNontrivial"], "feedback": fas})
                        if not dag:
                            old30_g1["pass"] = False
                    buckets = {"3": [], "4": [], "5": [], "6-10": []}
                    for rawc in bn:
                        packed_c = pack_cycle(rawc, scope_ids, names, by, ch, wdir)
                        packed_c["robustnessClass"] = robustness_of(rawc["nodes"], scope_ids, Ms_s, ch)
                        packed_c["provenance"] = cycle_provenance(packed_c["blindIds"])
                        if packed_c["length"] == 3:
                            buckets["3"].append(packed_c)
                        elif packed_c["length"] == 4:
                            buckets["4"].append(packed_c)
                        elif packed_c["length"] == 5:
                            buckets["5"].append(packed_c)
                        else:
                            buckets["6-10"].append(packed_c)
                        if scope_name == "ALL60" and ch == "hostile" and est == "conservative" and view == "AGG_STABLE":
                            leading.append(packed_c)
                    cycle_packed[scope_name][ch][est][view] = {
                        "nDirected": len(edges),
                        "mass": round(sum(w for _u, _v, w in edges), 4),
                        "dag": dag,
                        "scc": {k: scc[k] for k in scc if k != "localRegions" or est == "conservative"},
                        "feedback": fas,
                        "maxMeanCycle": ({**pack_cycle(mmc, scope_ids, names, by, ch, wdir), "provenance": cycle_provenance([scope_ids[i] for i in mmc["nodes"]])} if mmc else None),
                        "strongestBottleneckByLength": {k: v[:5] for k, v in buckets.items()},
                        "nBottleneckCyclesFound": len(bn),
                        "provenanceCounts": {p: sum(1 for xs in buckets.values() for r in xs if r.get("provenance") == p) for p in ("OLD30_PLUS_E2", "E2_ONLY", "OLD30_ONLY")},
                    }
    if not old30_g1["pass"]:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "IMMUTABLE.json").write_text(json.dumps({"status": "QA_FAILED", "reason": "OLD-30 cycle audit is not a DAG", "g1": old30_g1}, indent=2) + "\n", encoding="utf-8")
        raise SystemExit("OLD-30 G1 reconstruction failed")

    for r in leading:
        if r["mechanismClass"] == "same-mechanism dominated" or not r["materialLegs"]:
            r["robustnessClass"] = "REJECTED"

    h60 = packed["ALL60"]["hostile"]["ALL"]["conservative"]["energy"]["cyclicFraction"]
    h30 = packed["OLD30"]["hostile"]["ALL"]["conservative"]["energy"]["cyclicFraction"]
    reading = decide(h60, h30, dag_table)

    energy = {view: {ch: {mask: {est: packed[view][ch][mask][est]["energy"] for est in ESTIMATORS} for mask in packed[view][ch]} for ch in CHANNELS} for view in views}

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "TOPOLOGY_DIAGNOSTIC_V2",
        "parent": "deck-pressure-v4",
        "protocol": "topology-diagnostic-v2",
        "scope": "sealed 60",
        "primaryChannel": "M_hostile",
        "A_hodge": {
            "old30Reconstruction": old30_recon,
            "energy": energy,
            "estimatorRobustness": {view: {ch: robustness[view][ch] for ch in CHANNELS} for view in views},
            "cyclicEnergyByBucket": cohort,
            "topHostileCyclicEdgesALL60": top_cyclic_edges(raw["ALL60"]["hostile"]["ALL"]["conservative"]["C"], ALL60),
        },
        "B_cycles": {
            "old30Reproduction": old30_g1,
            "hostileDAG": dag_table["hostile"],
            "primaryQuestion": "Is material M_hostile still a DAG?",
        },
        "reading": reading,
        "not": ["Commander RPS claim", "deck ranking", "win probability", "interpretation of s as a ranking"],
        "safety": {"rpsAuthorized": False, "ranking": False, "winProbability": False, "newK": False, "thresholdsEdited": False, "hodgeTuned": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    H2.mkdir(parents=True, exist_ok=True)
    C2.mkdir(parents=True, exist_ok=True)
    (H2 / "decompositions.json").write_text(json.dumps(packed, indent=2) + "\n", encoding="utf-8")
    (H2 / "robustness.json").write_text(json.dumps(report["A_hodge"]["estimatorRobustness"], indent=2) + "\n", encoding="utf-8")
    (H2 / "energy.json").write_text(json.dumps(energy, indent=2) + "\n", encoding="utf-8")
    (C2 / "graphs.json").write_text(json.dumps(cycle_packed, indent=2) + "\n", encoding="utf-8")
    (C2 / "leading-cycles.json").write_text(json.dumps(leading[:25], indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "TopologyDiagnostic",
                "version": "topology-diagnostic-v2",
                "status": "REPORT_AND_WAIT",
                "parent": "deck-pressure-v4",
                "old30Hodge": "PASS" if old30_recon["pass"] else "FAIL",
                "old30G1": "PASS" if old30_g1["pass"] else "FAIL",
                "outcome": reading["code"],
                "hodge": False,
                "note": "Report and wait. Not a Commander RPS claim. s is not a ranking.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "old30Hodge": old30_recon,
                "old30G1": {"pass": old30_g1["pass"], "nFail": sum(1 for r in old30_g1["rows"] if not r["dag"])},
                "energyALL60": {ch: energy["ALL60"][ch]["ALL"] for ch in CHANNELS},
                "energyOLD30": {ch: energy["OLD30"][ch]["ALL"]["conservative"]["cyclicFraction"] for ch in CHANNELS},
                "energyE2": {ch: energy["E2_30"][ch]["ALL"]["conservative"]["cyclicFraction"] for ch in CHANNELS},
                "cohortHostile": cohort.get("hostile"),
                "hostileDAG": dag_table["hostile"],
                "reading": reading,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

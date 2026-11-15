#!/usr/bin/env python3
"""
Pressure v3 — sealed 30, frozen Pressure-v2 formulas, K v3.0.

Out-of-sample application of conservative-v2. Not a new pressure model.
Does not run Hodge. Does not freeze ranking/RPS/win probability.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_deck_pressure_v2 import (
    BLOCKED,
    CRED,
    DIAGNOSTICS,
    LIVE,
    PRIMARY,
    TOL,
    aggregation_stability,
    channels_of,
    headline,
    interpret_u,
    net_sign_status,
    pack_hostile,
    pack_support,
    reconstruct_channels,
    sign_of,
)
from build_frozen_k_applicability_audit_v1 import ANCHOR, CLASSES, EXPANSION, pair_class
from build_interaction_diversity_audit_v1 import pressure_concentration
from build_k_v14_active_coverage import axis_mass, spearman_rho
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from build_k_v25 import pair_h_both
from build_k_v27 import maturity_class
from build_frozen_k_applicability_audit_v1 import load_corpus
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v2 import SPLIT_PARENTS, V3_REVIEWS, parent_of
from mechanical_pressure_channels_v1 import HOSTILE, SUPPORT, attach_channels
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K3 = MS / "mechanical-pressure-k-v3.0"
P2 = MS / "deck-pressure-v2"
PROF2 = MS / "deck-mechanical-profiles-v2"
CEX = MS / "corpus-expansion-v1"
P2PROF = MS / "expansion-profiles-v2"
P3 = MS / "frozen-k-applicability-audit-v1"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "deck-pressure-v3"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

V3_KEYS = set(V3_REVIEWS)
MATERIAL = 0.05
CREDIBLE_TAIL = {
    "status": "CLOSED",
    "scope": {
        "compatibilityScreen": "compatibility-screen-v1",
        "ontology": "mechanical-ontology-v2.2",
        "corpus": "corpus-expansion-v1-sealed-30",
    },
    "means": "No unreviewed HIGH/MED-compatible relation remains exposed on this corpus under compatibility-screen-v1.",
    "doesNotMean": "every possible causal relation in Magic has been reviewed",
}


def rho_of(xs, ys):
    if len(xs) < 3:
        return None
    return spearman_rho(xs, ys)


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (P2PROF, "Phase 2"), (CEX, "Phase 1"), (P3, "Phase 3"), (K3, "K v3.0"), (P2, "Pressure v2")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    rc8 = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]

    print("profiling sealed 30…", flush=True)
    decks, polarity = load_corpus(concept_ids, by_axis, scores, p90, p99, row_of, name_of, type_of)
    decks_by_id = {d["id"]: d for d in decks}
    edges = load_json(K3 / "edges.json")
    edge_of = {(e["capability"], e["target"]): e for e in edges}
    leftover = leftover_cells(concept_ids, by_axis, edges)
    leftover_el = set(_eligible_leftover(leftover, by_axis))
    reviewed_live = {(e["capability"], e["target"]) for e in edges if e.get("kClass") in LIVE}
    cells = sorted(reviewed_live | leftover_el)
    compat = {cd: compatibility(cd[0], cd[1])["level"] for cd in cells}

    print("frozen Pressure formulas on 870 pairs…", flush=True)
    pairs, edges = compute_pairs(decks, [dict(e) for e in edges], leftover, by_axis, polarity)
    attach_channels(pairs)
    idx = pair_index_eligible(pairs, by_axis)
    h_rows = {(r["from"], r["to"]): r for r in pair_h_both(decks, leftover, idx, by_axis)}
    pair_of = {(p["from"], p["to"]): p for p in pairs}

    cap_mass = {d["id"]: {c: rec.get("packageInformedProminence", rec["prominence"]) for c, rec in d["axes"]["capability"].items()} for d in decks}
    dep_mass = {d["id"]: {t: rec["prominence"] for t, rec in d["axes"]["dependency"].items()} for d in decks}

    out_pairs = []
    recon_fail, unknown_leak, blocked_push, parent_child, v3_ghost = [], [], [], [], []
    v3_seen = defaultdict(int)
    for p in pairs:
        a, b = p["from"], p["to"]
        h = h_rows[(a, b)]
        prim = p["families"][PRIMARY]
        chs = {fam: channels_of(p["families"][fam]) for fam in (PRIMARY, *DIAGNOSTICS)}
        recon = reconstruct_channels(prim)
        for k, v in recon.items():
            if abs(v - chs[PRIMARY][k]) > TOL:
                recon_fail.append({"pair": f"{a}→{b}", "field": k, "stored": chs[PRIMARY][k], "rebuilt": v})

        attacks = prim.get("attackTerms") or []
        enables = prim.get("enableTerms") or []
        hostile_t = [pack_hostile(t, edge_of.get((t["capability"], t["dependency"]))) for t in attacks if t.get("relation") in HOSTILE]
        cond_t = [pack_hostile(t, edge_of.get((t["capability"], t["dependency"]))) for t in attacks if t.get("relation") == "CONDITIONAL"]
        supp_t = [pack_support(t, edge_of.get((t["capability"], t.get("target") or t.get("dependency")))) for t in enables if t.get("relation") in SUPPORT]
        res_t = [t.get("resilience") for t in attacks if t.get("resilience")]

        for t in hostile_t + cond_t + supp_t:
            key = (t["capability"], t["dependency"])
            if key in leftover_el:
                unknown_leak.append({"pair": f"{a}→{b}", "edge": f"{key[0]} → {key[1]}"})
            if t["capability"] in BLOCKED or t["capability"] in SPLIT_PARENTS or t["dependency"] in SPLIT_PARENTS:
                blocked_push.append({"pair": f"{a}→{b}", "edge": f"{key[0]} → {key[1]}"})
            pc, pd = parent_of(t["capability"]), parent_of(t["dependency"])
            sibs = {(x["capability"], x["dependency"]) for x in hostile_t + cond_t + supp_t}
            if pc and (pc, t["dependency"]) in sibs:
                parent_child.append({"pair": f"{a}→{b}", "child": f"{t['capability']} → {t['dependency']}", "parentCap": pc})
            if pd and (t["capability"], pd) in sibs:
                parent_child.append({"pair": f"{a}→{b}", "child": f"{t['capability']} → {t['dependency']}", "parentDep": pd})
            if key in V3_KEYS:
                v3_seen[key] += 1
                if axis_mass(decks_by_id[a], decks_by_id[b], key[0], key[1]) <= 0:
                    v3_ghost.append({"pair": f"{a}→{b}", "edge": f"{key[0]} → {key[1]}"})

        cm, dm = cap_mass[a], dep_mass[b]
        reviewed_cred = unknown_cred = raw_unknown = 0.0
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

        klass = maturity_class(h["H_credible"])
        skip = polarity.get(a) or set()
        rec = {
            "from": a,
            "to": b,
            "pairClass": pair_class(a, b),
            "pressureEstimator": {"primary": "conservative-v2", "diagnostics": ["prominence-v2", "presence-v2"]},
            "channels": chs[PRIMARY],
            "estimators": chs,
            "H_raw": h["H_raw"],
            "H_credible": h["H_credible"],
            "maturity": klass,
            "maturityBands": "Pressure-v2 experimental; not a universal Magic constant",
            "credible_tail_status": CREDIBLE_TAIL["status"],
            "credible_tail_scope": CREDIBLE_TAIL["scope"],
            "uncertainty": interpret_u(h["H_raw"], h["H_credible"]),
            "aggregation_stability": aggregation_stability(chs),
            "net_sign_status": net_sign_status(chs),
            "top_hostile_mechanisms": [{"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]} for t in hostile_t[:5]],
            "top_supportive_mechanisms": [{"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]} for t in supp_t[:5]],
            "top_conditional_mechanisms": [{"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]} for t in cond_t[:5]],
            "top_resilience_mechanisms": res_t[:5],
            "reviewed_credible_mass": round(reviewed_cred, 4),
            "unknown_credible_mass": round(unknown_cred, 4),
            "raw_unknown_mass": round(raw_unknown, 4),
            "contributions": {"hostile": hostile_t, "supportive": supp_t, "conditional": cond_t},
            "eligibility": {"deckLocalBlockedCaps": sorted(skip), "profileQABlocked": sorted(BLOCKED), "splitParentsExcluded": sorted(SPLIT_PARENTS)},
            "largestUnresolvedRaw": h.get("largestRaw"),
            "largestUnresolvedCredible": h.get("largestCredible"),
            "nRawAboveH1": h.get("nRawAboveH1"),
            "nCredibleAboveH1": h.get("nCredibleAboveH1"),
        }
        out_pairs.append(rec)

    by = {(r["from"], r["to"]): r for r in out_pairs}
    derived, anti_fail = [], []
    ids = [d["id"] for d in decks]
    for a in ids:
        for b in ids:
            if a == b:
                continue
            pa, pb = by[(a, b)], by[(b, a)]
            derived.append(
                {
                    "from": a,
                    "to": b,
                    "pairClass": pair_class(a, b),
                    "M_hostile": round(pa["channels"]["hostile_pressure"] - pb["channels"]["hostile_pressure"], 4),
                    "M_net": round(pa["channels"]["net_interaction"] - pb["channels"]["net_interaction"], 4),
                }
            )
    der_of = {(r["from"], r["to"]): r for r in derived}
    for a in ids:
        for b in ids:
            if a >= b:
                continue
            ab, ba = der_of[(a, b)], der_of[(b, a)]
            if abs(ab["M_hostile"] + ba["M_hostile"]) > TOL or abs(ab["M_net"] + ba["M_net"]) > TOL:
                anti_fail.append({"pair": f"{a}↔{b}", "Mh": (ab["M_hostile"], ba["M_hostile"]), "Mn": (ab["M_net"], ba["M_net"])})

    n = len(out_pairs)
    host_agree = supp_agree = net_agree = 0
    for r in out_pairs:
        src = pair_of[(r["from"], r["to"])]
        hls = [headline(src["families"][fam].get("attackTerms") or [], HOSTILE, "dependency") for fam in (PRIMARY, *DIAGNOSTICS)]
        sls = [headline(src["families"][fam].get("enableTerms") or [], SUPPORT, "target") for fam in (PRIMARY, *DIAGNOSTICS)]
        if len(set(hls)) == 1:
            host_agree += 1
        if len(set(sls)) == 1:
            supp_agree += 1
        if len({sign_of(r["estimators"][fam]["net_interaction"]) for fam in (PRIMARY, *DIAGNOSTICS)}) == 1:
            net_agree += 1

    unknown_cred_total = sum(r["unknown_credible_mass"] for r in out_pairs)
    qa = {
        "nPairs": n,
        "nUndirected": n // 2,
        "reconstruction": {"nFail": len(recon_fail), "n": n, "pass": len(recon_fail) == 0 and n == 870},
        "antisymmetry": {"nFail": len(anti_fail), "pass": len(anti_fail) == 0},
        "unknownIntegrity": {"nLeak": len(unknown_leak), "unknownCredibleMass": round(unknown_cred_total, 4), "pass": len(unknown_leak) == 0 and unknown_cred_total <= TOL},
        "eligibilityIntegrity": {"nBlockedPush": len(blocked_push), "pass": len(blocked_push) == 0},
        "hierarchyIntegrity": {"nParentChild": len(parent_child), "pass": len(parent_child) == 0},
        "channelIntegrity": {
            "pass": all(abs(r["channels"]["net_interaction"] - (r["channels"]["hostile_pressure"] - r["channels"]["supportive_pressure"])) <= TOL for r in out_pairs)
        },
        "lowUnknownNoPressure": {"pass": len(unknown_leak) == 0},
        "v3AdditionsSupported": {"nGhost": len(v3_ghost), "nKeysSeen": len(v3_seen), "of": 53, "pass": len(v3_ghost) == 0},
        "hRawStoredNonzero": {"pass": any(r["H_raw"] > 0 for r in out_pairs), "mean": round(float(np.mean([r["H_raw"] for r in out_pairs])), 4)},
        "credibleTailClosed": {"pass": all(r["H_credible"] == 0 and r["maturity"] == "MATURE" for r in out_pairs)},
        "aggregationSensitivity": {
            "hostileHeadlineAgreement": {"n": host_agree, "of": n, "rate": round(host_agree / n, 4)},
            "supportiveHeadlineAgreement": {"n": supp_agree, "of": n, "rate": round(supp_agree / n, 4)},
            "netSignAgreement": {"n": net_agree, "of": n, "rate": round(net_agree / n, 4)},
        },
    }
    qa["allPass"] = all(qa[k]["pass"] for k in ("reconstruction", "antisymmetry", "unknownIntegrity", "eligibilityIntegrity", "hierarchyIntegrity", "channelIntegrity", "v3AdditionsSupported", "hRawStoredNonzero", "credibleTailClosed"))

    def class_rows(name):
        return [r for r in out_pairs if r["pairClass"] == name]

    cohort = {}
    sign_table = {}
    for name in CLASSES:
        rows = class_rows(name)
        ch = [r["channels"] for r in rows]
        signs = defaultdict(int)
        for r in rows:
            signs[r["net_sign_status"]] += 1
        sign_table[name] = dict(signs)
        pclass = [pair_of[(r["from"], r["to"])] for r in rows]
        cohort[name] = {
            "n": len(rows),
            "meanHostile": round(float(np.mean([c["hostile_pressure"] for c in ch])), 4),
            "meanSupportive": round(float(np.mean([c["supportive_pressure"] for c in ch])), 4),
            "meanConditional": round(float(np.mean([c["conditional_pressure"] for c in ch])), 4),
            "meanResilience": round(float(np.mean([c["resilience_mitigation"] for c in ch])), 4),
            "meanNet": round(float(np.mean([c["net_interaction"] for c in ch])), 4),
            "meanH_raw": round(float(np.mean([r["H_raw"] for r in rows])), 4),
            "meanH_credible": round(float(np.mean([r["H_credible"] for r in rows])), 4),
            "netSignStatus": dict(signs),
            "aggregation": {
                k: sum(1 for r in rows if r["aggregation_stability"] == k) for k in ("STABLE", "SENSITIVE", "NEAR_ZERO_DISAGREEMENT")
            },
            "hostileConcentration": {kk: pressure_concentration(pclass, "hostile")[kk] for kk in ("capabilityDomain", "capabilityFamily", "dependencyFamily", "mechanismPair")},
            "supportiveConcentration": {kk: pressure_concentration(pclass, "enable")[kk] for kk in ("capabilityDomain", "capabilityFamily", "dependencyFamily", "mechanismPair")},
        }

    # Anchor submatrix vs Pressure v2
    p2 = {(r["from"], r["to"]): r for r in load_json(P2 / "pairs-summary.json")}
    h_v2, h_v3, s_v2, s_v3, n_v2, n_v3 = [], [], [], [], [], []
    headline_same = status_same = 0
    material, unexplained = [], []
    for a in sorted(ANCHOR):
        for b in sorted(ANCHOR):
            if a == b:
                continue
            old, new = p2[(a, b)], by[(a, b)]
            h_v2.append(old["channels"]["hostile_pressure"])
            h_v3.append(new["channels"]["hostile_pressure"])
            s_v2.append(old["channels"]["supportive_pressure"])
            s_v3.append(new["channels"]["supportive_pressure"])
            n_v2.append(old["channels"]["net_interaction"])
            n_v3.append(new["channels"]["net_interaction"])
            old_h = (old.get("top_hostile_mechanisms") or [{}])[0].get("edge")
            new_h = (new.get("top_hostile_mechanisms") or [{}])[0].get("edge")
            if old_h == new_h:
                headline_same += 1
            if old.get("net_sign_status") == new["net_sign_status"]:
                status_same += 1
            dh = new["channels"]["hostile_pressure"] - old["channels"]["hostile_pressure"]
            ds = new["channels"]["supportive_pressure"] - old["channels"]["supportive_pressure"]
            dn = new["channels"]["net_interaction"] - old["channels"]["net_interaction"]
            if abs(dh) >= MATERIAL or abs(ds) >= MATERIAL or abs(dn) >= MATERIAL or old_h != new_h:
                cons = [t for ch in new["contributions"].values() for t in ch if (t["capability"], t["dependency"]) in V3_KEYS and float(t.get("effectiveTerm") or 0) >= 0.005]
                row = {
                    "from": a,
                    "to": b,
                    "dHostile": round(dh, 4),
                    "dSupportive": round(ds, 4),
                    "dNet": round(dn, 4),
                    "headlineV2": old_h,
                    "headlineV3": new_h,
                    "v3Terms": [f"{t['capability']} → {t['dependency']}" for t in cons[:6]],
                    "netSignV2": old.get("net_sign_status"),
                    "netSignV3": new["net_sign_status"],
                }
                material.append(row)
                if not cons and (abs(dh) >= MATERIAL or abs(ds) >= MATERIAL or abs(dn) >= MATERIAL):
                    unexplained.append(row)

    sign_flips = 0
    for x, y in zip(n_v2, n_v3):
        if sign_of(x) and sign_of(y) and sign_of(x) != sign_of(y) and abs(x) >= MATERIAL and abs(y) >= MATERIAL:
            sign_flips += 1

    anchor_control = {
        "n": 210,
        "rhoHostile": rho_of(h_v2, h_v3),
        "rhoSupportive": rho_of(s_v2, s_v3),
        "rhoNet": rho_of(n_v2, n_v3),
        "headlineRetention": {"same": headline_same, "n": 210},
        "netSignStatusRetention": {"same": status_same, "n": 210},
        "materialSignChanges": sign_flips,
        "nMaterialChanges": len(material),
        "nUnexplained": len(unexplained),
        "unexplained": unexplained[:12],
        "pass": len(unexplained) == 0 and sign_flips == 0,
    }
    qa["anchorControl"] = {"pass": anchor_control["pass"], "nUnexplained": len(unexplained), "materialSignChanges": sign_flips}
    qa["allPass"] = qa["allPass"] and anchor_control["pass"]

    diversity = {
        "combinedHostile": pressure_concentration(pairs, "hostile"),
        "combinedSupportive": pressure_concentration(pairs, "enable"),
        "byClass": {name: {"hostile": cohort[name]["hostileConcentration"], "supportive": cohort[name]["supportiveConcentration"]} for name in CLASSES},
    }

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PRESSURE_V3_CONSTRUCTED",
        "parent": "mechanical-pressure-k-v3.0",
        "lineage": "Ontology v2.2 → Profiles v2 → K v3.0 → Pressure v3",
        "pressureEstimator": {"primary": "conservative-v2", "diagnostics": ["prominence-v2", "presence-v2"], "retuned": False},
        "nDecks": 30,
        "nDirected": 870,
        "nUndirected": 435,
        "credibleTail": CREDIBLE_TAIL,
        "maturityNote": "All 870 are MATURE under frozen Pressure-v2 thresholds because H_credible=0. That is HIGH/MED leftover closure on this corpus, not global K completeness.",
        "qa": {k: qa[k] for k in qa if k != "allPass"} | {"allPass": qa["allPass"]},
        "netSignByClass": sign_table,
        "cohorts": {k: {kk: cohort[k][kk] for kk in cohort[k] if kk not in {"hostileConcentration", "supportiveConcentration"}} for k in cohort},
        "anchorControl": {k: anchor_control[k] for k in anchor_control if k != "unexplained"},
        "v3ContributionCounts": {f"{c} → {d}": v3_seen[(c, d)] for c, d in sorted(V3_KEYS, key=lambda x: -v3_seen[x])[:15]},
        "safety": {"hodge": False, "rpsAuthorized": False, "ranking": False, "winProbability": False, "ontologyRetrain": False, "compatibilityEdited": False, "newK": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    slim = [{k: r[k] for k in r if k != "contributions"} for r in out_pairs]
    print("writing artifacts…", flush=True)
    (OUT / "pairs.json").write_text(json.dumps(out_pairs, indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs-summary.json").write_text(json.dumps(slim, indent=2) + "\n", encoding="utf-8")
    (OUT / "derived-M.json").write_text(json.dumps(derived, indent=2) + "\n", encoding="utf-8")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    (OUT / "cohorts.json").write_text(json.dumps({"signTable": sign_table, "cohorts": extra["cohorts"]}, indent=2) + "\n", encoding="utf-8")
    (OUT / "anchor-control.json").write_text(json.dumps({"summary": anchor_control, "materialChanges": material[:60]}, indent=2) + "\n", encoding="utf-8")
    (OUT / "diversity.json").write_text(json.dumps(diversity, indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(extra, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "DeckPressure",
                "version": "deck-pressure-v3",
                "status": "QA_PASSED" if qa["allPass"] else "QA_FAILED",
                "lineage": "v3",
                "parent": "mechanical-pressure-k-v3.0",
                "pressureEstimator": "conservative-v2",
                "nDirected": 870,
                "credible_tail_status": "CLOSED",
                "hodge": False,
                "note": "Constructed measurement object on sealed 30. Report and wait. Hodge v1 is not authorized from this construction.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "nPairs": n,
                "qaPass": qa["allPass"],
                "signTable": sign_table,
                "cohortMeans": {k: {kk: cohort[k][kk] for kk in ("meanHostile", "meanSupportive", "meanNet", "meanH_raw")} for k in CLASSES},
                "aggregation": {k: cohort[k]["aggregation"] for k in CLASSES},
                "anchorControl": {k: anchor_control[k] for k in ("rhoHostile", "rhoSupportive", "rhoNet", "headlineRetention", "materialSignChanges", "nMaterialChanges", "nUnexplained", "pass")},
                "v3Seen": len(v3_seen),
                "unknownCred": unknown_cred_total,
                "hostileCR": {kk: diversity["combinedHostile"]["capabilityDomain"].get(kk) for kk in ("CR_1", "CR_5", "CR_10", "S", "N_eff")},
                "hostileDomains": (diversity["combinedHostile"]["capabilityDomain"].get("shares") or [])[:6],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Pressure v4 — sealed 60, frozen Pressure-v2/v3 formulas, frozen K v3.0.

Nothing upstream changed for D01–D30. The sealed-30 submatrix must equal Pressure v3.
Does not run Hodge. Does not freeze ranking/RPS/win probability.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_deck_mechanical_profiles_v2 import profile_deck
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
from build_frozen_k_applicability_audit_v2 import CLASSES, pair_class
from build_hodge_diagnostic_v0 import CH_KEY, ESTIMATORS, NEAR_ZERO
from build_hodge_diagnostic_v1 import m_edge_stability
from build_interaction_diversity_audit_v1 import pressure_concentration
from build_k_v13_active_coverage import resolve_cards
from build_k_v14_active_coverage import axis_mass
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from build_k_v25 import pair_h_both
from build_k_v27 import maturity_class
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v2 import SPLIT_PARENTS, V3_REVIEWS, parent_of, polarity_blocked_caps
from mechanical_pressure_channels_v1 import HOSTILE, SUPPORT, attach_channels
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K3 = MS / "mechanical-pressure-k-v3.0"
P3 = MS / "deck-pressure-v3"
PROF2 = MS / "deck-mechanical-profiles-v2"
CEX1 = MS / "corpus-expansion-v1"
CEX2 = MS / "corpus-expansion-v2"
P2PROF = MS / "expansion-v2-profiles-v2"
KAUDIT = MS / "frozen-k-applicability-audit-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "deck-pressure-v4"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

V3_KEYS = set(V3_REVIEWS)
SEALED30 = {f"D{i:02d}" for i in range(1, 31)}
CREDIBLE_TAIL = {
    "status": "CLOSED",
    "scope": {
        "compatibilityScreen": "compatibility-screen-v1",
        "ontology": "mechanical-ontology-v2.2",
        "corpus": "corpus-expansion-v2-sealed-60",
    },
    "means": "No unreviewed HIGH/MED-compatible relation remains exposed on this corpus under compatibility-screen-v1.",
    "doesNotMean": "every possible causal relation in Magic has been reviewed",
}
CR_KEYS = ("CR_1", "CR_5", "CR_10", "CR_20", "S", "N_eff")


def cr_slice(block: dict) -> dict:
    return {k: block.get(k) for k in CR_KEYS}


def term_key(t: dict) -> tuple:
    return (t.get("capability"), t.get("dependency"), t.get("relation"), round(float(t.get("effectiveTerm") or 0), 4))


def compare_p3(old: dict, new: dict) -> list[dict]:
    fails = []
    for field in ("hostile_pressure", "supportive_pressure", "conditional_pressure", "resilience_mitigation", "net_interaction"):
        if abs(float(old["channels"][field]) - float(new["channels"][field])) > TOL:
            fails.append({"field": f"channels.{field}", "old": old["channels"][field], "new": new["channels"][field]})
    for est in ESTIMATORS:
        for field in ("hostile_pressure", "supportive_pressure", "conditional_pressure", "resilience_mitigation", "net_interaction"):
            ov, nv = old["estimators"][est][field], new["estimators"][est][field]
            if abs(float(ov) - float(nv)) > TOL:
                fails.append({"field": f"estimators.{est}.{field}", "old": ov, "new": nv})
    for field in ("H_raw", "H_credible"):
        if abs(float(old[field]) - float(new[field])) > TOL:
            fails.append({"field": field, "old": old[field], "new": new[field]})
    for field in ("maturity", "aggregation_stability", "net_sign_status"):
        if old.get(field) != new.get(field):
            fails.append({"field": field, "old": old.get(field), "new": new.get(field)})
    for kind in ("hostile", "supportive", "conditional"):
        ot = [term_key(t) for t in (old.get("contributions") or {}).get(kind) or []]
        nt = [term_key(t) for t in (new.get("contributions") or {}).get(kind) or []]
        if ot != nt:
            fails.append({"field": f"contributions.{kind}", "oldN": len(ot), "newN": len(nt), "mismatch": True})
    return fails


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (P2PROF, "Phase 2"), (CEX2, "Expansion v2"), (KAUDIT, "K audit v2"), (K3, "K v3.0"), (P3, "Pressure v3")):
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

    sources = load_json(CEX1 / "source-decks.json") + load_json(CEX2 / "source-decks.json")
    if len(sources) != 60:
        raise SystemExit(f"expected 60 sealed lists, got {len(sources)}")
    print("profiling sealed 60…", flush=True)
    decks, polarity = [], {}
    for i, raw in enumerate(sources):
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, *_ = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        bid = f"D{i + 1:02d}"
        polarity[bid] = polarity_blocked_caps(axes)
        cohort = "anchor" if i < 15 else ("expansion_v1" if i < 30 else "expansion_v2")
        decks.append({"id": bid, "cohort": cohort, "axes": axes})
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/60", flush=True)
    decks_by_id = {d["id"]: d for d in decks}

    edges = load_json(K3 / "edges.json")
    edge_of = {(e["capability"], e["target"]): e for e in edges}
    leftover = leftover_cells(concept_ids, by_axis, edges)
    leftover_el = set(_eligible_leftover(leftover, by_axis))
    reviewed_live = {(e["capability"], e["target"]) for e in edges if e.get("kClass") in LIVE}
    cells = sorted(reviewed_live | leftover_el)
    compat = {cd: compatibility(cd[0], cd[1])["level"] for cd in cells}

    print("frozen Pressure formulas on 3540 pairs…", flush=True)
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
        out_pairs.append(
            {
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
        )

    by = {(r["from"], r["to"]): r for r in out_pairs}
    print("exact Pressure-v3 submatrix control…", flush=True)
    p3_pairs = {(r["from"], r["to"]): r for r in load_json(P3 / "pairs.json")}
    p3_fails = []
    for a in range(1, 31):
        for b in range(1, 31):
            if a == b:
                continue
            key = (f"D{a:02d}", f"D{b:02d}")
            fails = compare_p3(p3_pairs[key], by[key])
            for f in fails:
                p3_fails.append({"from": key[0], "to": key[1], **f})
    if p3_fails:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "IMMUTABLE.json").write_text(json.dumps({"status": "QA_FAILED", "reason": "Pressure-v3 sealed-30 submatrix is not an identity", "nFail": len(p3_fails), "sample": p3_fails[:20]}, indent=2) + "\n", encoding="utf-8")
        (OUT / "p3-submatrix-failures.json").write_text(json.dumps(p3_fails, indent=2) + "\n", encoding="utf-8")
        raise SystemExit(f"Pressure-v3 submatrix reconstruction failed: {len(p3_fails)} field mismatches")

    ids = [d["id"] for d in decks]
    derived, anti_fail = [], []
    for a in ids:
        for b in ids:
            if a == b:
                continue
            pa, pb = by[(a, b)], by[(b, a)]
            rec = {"from": a, "to": b, "pairClass": pair_class(a, b)}
            for est in ESTIMATORS:
                rec[est] = {
                    "M_hostile": round(pa["estimators"][est]["hostile_pressure"] - pb["estimators"][est]["hostile_pressure"], 4),
                    "M_supportive": round(pa["estimators"][est]["supportive_pressure"] - pb["estimators"][est]["supportive_pressure"], 4),
                    "M_net": round(pa["estimators"][est]["net_interaction"] - pb["estimators"][est]["net_interaction"], 4),
                }
            derived.append(rec)
    der_of = {(r["from"], r["to"]): r for r in derived}
    for a in ids:
        for b in ids:
            if a >= b:
                continue
            ab, ba = der_of[(a, b)], der_of[(b, a)]
            for est in ESTIMATORS:
                for ch in ("M_hostile", "M_supportive", "M_net"):
                    if abs(ab[est][ch] + ba[est][ch]) > TOL:
                        anti_fail.append({"pair": f"{a}↔{b}", "estimator": est, "channel": ch, "vals": (ab[est][ch], ba[est][ch])})

    edge_stab = []
    stab_counts = {ch: defaultdict(int) for ch in ("hostile", "supportive", "net")}
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            rec = {"a": a, "b": b, "pairClassUndirected": f"{min(pair_class(a, b), pair_class(b, a))}"}
            for ch, mkey in (("hostile", "M_hostile"), ("supportive", "M_supportive"), ("net", "M_net")):
                vals = {est: der_of[(a, b)][est][mkey] for est in ESTIMATORS}
                rec[ch] = m_edge_stability(vals)
                rec[f"{ch}_M"] = vals
                stab_counts[ch][rec[ch]] += 1
            edge_stab.append(rec)

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
        "reconstruction": {"nFail": len(recon_fail), "n": n, "pass": len(recon_fail) == 0 and n == 3540},
        "pressureV3Submatrix": {"n": 870, "nFail": 0, "pass": True, "note": "identity vs frozen Pressure v3; not a correlation"},
        "antisymmetry": {"nFail": len(anti_fail), "pass": len(anti_fail) == 0},
        "unknownIntegrity": {"nLeak": len(unknown_leak), "unknownCredibleMass": round(unknown_cred_total, 4), "pass": len(unknown_leak) == 0 and unknown_cred_total <= TOL},
        "eligibilityIntegrity": {"nBlockedPush": len(blocked_push), "pass": len(blocked_push) == 0},
        "hierarchyIntegrity": {"nParentChild": len(parent_child), "pass": len(parent_child) == 0},
        "channelIntegrity": {
            "pass": all(abs(r["channels"]["net_interaction"] - (r["channels"]["hostile_pressure"] - r["channels"]["supportive_pressure"])) <= TOL for r in out_pairs)
        },
        "lowUnknownNoPressure": {"pass": len(unknown_leak) == 0, "note": "LOW UNKNOWN contributes no pressure; it remains on H_raw"},
        "hRawStoredNonzero": {"pass": any(r["H_raw"] > 0 for r in out_pairs), "mean": round(float(np.mean([r["H_raw"] for r in out_pairs])), 4)},
        "credibleTailClosed": {"pass": all(r["H_credible"] == 0 and r["maturity"] == "MATURE" for r in out_pairs)},
        "undirectedEdges": {"n": len(edge_stab), "expected": 1770, "pass": len(edge_stab) == 1770},
        "aggregationSensitivity": {
            "hostileHeadlineAgreement": {"n": host_agree, "of": n, "rate": round(host_agree / n, 4)},
            "supportiveHeadlineAgreement": {"n": supp_agree, "of": n, "rate": round(supp_agree / n, 4)},
            "netSignAgreement": {"n": net_agree, "of": n, "rate": round(net_agree / n, 4)},
        },
    }
    qa["allPass"] = all(
        qa[k]["pass"]
        for k in (
            "reconstruction",
            "pressureV3Submatrix",
            "antisymmetry",
            "unknownIntegrity",
            "eligibilityIntegrity",
            "hierarchyIntegrity",
            "channelIntegrity",
            "hRawStoredNonzero",
            "credibleTailClosed",
            "undirectedEdges",
        )
    )

    cohort, sign_table = {}, {}
    for name in CLASSES:
        rows = [r for r in out_pairs if r["pairClass"] == name]
        ch = [r["channels"] for r in rows]
        signs = defaultdict(int)
        for r in rows:
            signs[r["net_sign_status"]] += 1
        sign_table[name] = dict(signs)
        pclass = [pair_of[(r["from"], r["to"])] for r in rows]
        nets = [c["net_interaction"] for c in ch]
        cohort[name] = {
            "n": len(rows),
            "meanHostile": round(float(np.mean([c["hostile_pressure"] for c in ch])), 4),
            "meanSupportive": round(float(np.mean([c["supportive_pressure"] for c in ch])), 4),
            "meanConditional": round(float(np.mean([c["conditional_pressure"] for c in ch])), 4),
            "meanResilience": round(float(np.mean([c["resilience_mitigation"] for c in ch])), 4),
            "meanNet": round(float(np.mean(nets)), 4),
            "netQuantiles": {q: round(float(np.quantile(nets, p)), 4) for q, p in (("p10", 0.10), ("p25", 0.25), ("p50", 0.50), ("p75", 0.75), ("p90", 0.90))},
            "meanH_raw": round(float(np.mean([r["H_raw"] for r in rows])), 4),
            "meanH_credible": round(float(np.mean([r["H_credible"] for r in rows])), 4),
            "netSignStatus": dict(signs),
            "aggregation": {k: sum(1 for r in rows if r["aggregation_stability"] == k) for k in ("STABLE", "SENSITIVE", "NEAR_ZERO_DISAGREEMENT")},
            "hostileConcentration": {kk: pressure_concentration(pclass, "hostile")[kk] for kk in ("capabilityDomain", "capabilityFamily", "dependencyFamily", "mechanismPair")},
            "supportiveConcentration": {kk: pressure_concentration(pclass, "enable")[kk] for kk in ("capabilityDomain", "capabilityFamily", "dependencyFamily", "mechanismPair")},
        }

    sealed30_raw = [p for p in pairs if p["from"] in SEALED30 and p["to"] in SEALED30]
    all_raw = pairs
    diversity30 = {"combinedHostile": pressure_concentration(sealed30_raw, "hostile"), "combinedSupportive": pressure_concentration(sealed30_raw, "enable")}
    diversity60 = {"combinedHostile": pressure_concentration(all_raw, "hostile"), "combinedSupportive": pressure_concentration(all_raw, "enable")}
    frozen30 = load_json(P3 / "diversity.json")

    def conc_compare(a, b):
        out = {}
        for ch in ("combinedHostile", "combinedSupportive"):
            out[ch] = {}
            for kind in ("capabilityDomain", "capabilityFamily", "dependencyFamily", "mechanismPair"):
                out[ch][kind] = {"sealed30": cr_slice(a[ch][kind]), "sealed60": cr_slice(b[ch][kind]), "frozenP3": cr_slice((frozen30.get(ch) or {}).get(kind) or {})}
        return out

    diversity = {
        "sealed30": diversity30,
        "sealed60": diversity60,
        "compare30to60": conc_compare(diversity30, diversity60),
        "byClass": {name: {"hostile": cohort[name]["hostileConcentration"], "supportive": cohort[name]["supportiveConcentration"]} for name in CLASSES},
        "note": "No concentration was corrected. Frozen Pressure-v3 sealed-30 diversity is the control.",
    }

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PRESSURE_V4_CONSTRUCTED",
        "parent": "mechanical-pressure-k-v3.0",
        "lineage": "Ontology v2.2 → Profiles v2 → K v3.0 → Pressure v4",
        "pressureEstimator": {"primary": "conservative-v2", "diagnostics": ["prominence-v2", "presence-v2"], "retuned": False},
        "nDecks": 60,
        "nDirected": 3540,
        "nUndirected": 1770,
        "nNewDirected": 2670,
        "credibleTail": CREDIBLE_TAIL,
        "maturityNote": "All 3540 are MATURE under frozen Pressure-v2 thresholds because H_credible=0. That is HIGH/MED leftover closure on this corpus, not global K completeness.",
        "qa": {k: qa[k] for k in qa if k != "allPass"} | {"allPass": qa["allPass"]},
        "netSignByClass": sign_table,
        "cohorts": {k: {kk: cohort[k][kk] for kk in cohort[k] if kk not in {"hostileConcentration", "supportiveConcentration"}} for k in cohort},
        "edgeStabilityCounts": {ch: dict(stab_counts[ch]) for ch in stab_counts},
        "representation": {"M_hostile": "PRIMARY", "M_supportive": "PARALLEL", "M_net": "DERIVED / AGGREGATION-SENSITIVE"},
        "safety": {"hodge": False, "cycleAudit": False, "rpsAuthorized": False, "ranking": False, "winProbability": False, "ontologyRetrain": False, "compatibilityEdited": False, "newK": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    slim = [{k: r[k] for k in r if k != "contributions"} for r in out_pairs]
    print("writing artifacts…", flush=True)
    (OUT / "pairs.json").write_text(json.dumps(out_pairs, indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs-summary.json").write_text(json.dumps(slim, indent=2) + "\n", encoding="utf-8")
    (OUT / "derived-M.json").write_text(json.dumps(derived, indent=2) + "\n", encoding="utf-8")
    (OUT / "edge-stability.json").write_text(json.dumps({"n": len(edge_stab), "nearZero": NEAR_ZERO, "counts": extra["edgeStabilityCounts"], "edges": edge_stab}, indent=2) + "\n", encoding="utf-8")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    (OUT / "cohorts.json").write_text(json.dumps({"signTable": sign_table, "cohorts": extra["cohorts"]}, indent=2) + "\n", encoding="utf-8")
    (OUT / "diversity.json").write_text(json.dumps(diversity, indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(extra, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "DeckPressure",
                "version": "deck-pressure-v4",
                "status": "QA_PASSED" if qa["allPass"] else "QA_FAILED",
                "lineage": "v4",
                "parent": "mechanical-pressure-k-v3.0",
                "pressureEstimator": "conservative-v2",
                "nDecks": 60,
                "nDirected": 3540,
                "nUndirected": 1770,
                "pressureV3Submatrix": "EXACT",
                "credible_tail_status": "CLOSED",
                "hodge": False,
                "note": "Constructed measurement object on sealed 60. Report and wait. Hodge v2 is not authorized from this construction.",
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
                "p3Submatrix": "EXACT",
                "signTable": sign_table,
                "cohortMeans": {k: {kk: cohort[k][kk] for kk in ("meanHostile", "meanSupportive", "meanConditional", "meanResilience", "meanNet", "meanH_raw")} for k in CLASSES},
                "aggregation": {k: cohort[k]["aggregation"] for k in CLASSES},
                "netSignAgreement": qa["aggregationSensitivity"]["netSignAgreement"],
                "edgeStability": extra["edgeStabilityCounts"],
                "unknownCred": unknown_cred_total,
                "diversity30to60": {
                    "hostileCapDom": diversity["compare30to60"]["combinedHostile"]["capabilityDomain"],
                    "hostileMech": diversity["compare30to60"]["combinedHostile"]["mechanismPair"],
                    "supportCapDom": diversity["compare30to60"]["combinedSupportive"]["capabilityDomain"],
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

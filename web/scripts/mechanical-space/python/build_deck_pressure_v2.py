#!/usr/bin/env python3
"""
Pressure v2 — measured directed geometry + explicit uncertainty.

Built from frozen K v2.7. UNKNOWN is not 0.
Does not freeze Hodge, ranking, win probability, or RPS.
Primary estimator: conservative-v2. Presence and prominence remain diagnostics.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_k_v2 import load_decks
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from build_k_v27 import maturity_class
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v2 import CAP_MECH, DEP_MECH, RES_MECH, PROFILE_QA_BLOCKED, SPLIT_PARENTS, parent_of
from mechanical_pressure_channels_v1 import HOSTILE, SUPPORT, attach_channels, pair_channels
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K15 = MS / "mechanical-pressure-k-v1.5"
K27 = MS / "mechanical-pressure-k-v2.7"
PROF = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "deck-pressure-v2"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"

PRIMARY = "conservative"
DIAGNOSTICS = ("prominence", "presence")
TOL = 1e-4
CRED = {"HIGH", "MEDIUM"}
LIVE = {"UNCHANGED_ENDPOINTS", "NEW_ENDPOINT", "CARRY_FORWARD_VERIFIED", "RETIRED_BROAD"}
BLOCKED = set(PROFILE_QA_BLOCKED)


def sign_of(x: float) -> int:
    if x > 1e-9:
        return 1
    if x < -1e-9:
        return -1
    return 0


def interpret_u(h_raw: float, h_cred: float) -> dict:
    klass = maturity_class(h_cred)
    if klass == "MATURE":
        cred = "No currently credible unresolved relation is large enough to closely challenge the leading causal explanation."
    elif klass == "PARTIALLY_MATURE":
        cred = "Some mechanically plausible UNKNOWN mass remains, but it is below the experimental H_credible=1 challenge line."
    else:
        cred = "One or more mechanically plausible UNKNOWN relations remain large enough to rewrite the current explanation."
    raw = "Significant unreviewed mechanical mass remains." if h_raw >= 1 else "Raw unreviewed mass is below the conservative H_raw=1 line."
    return {"H_raw_statement": raw, "H_credible_statement": cred, "combined": f"{raw} {cred}"}


def channels_of(block: dict) -> dict:
    ch = pair_channels(block) if "hostile_pressure" not in block else {
        "hostile_pressure": block["hostile_pressure"],
        "supportive_pressure": block["supportive_pressure"],
        "conditional_pressure": block["conditional_pressure"],
        "resilience_mitigation": block["resilience_mitigation"],
        "net_interaction": block["net_interaction"],
    }
    return ch


def reconstruct_channels(block: dict) -> dict:
    return pair_channels(block)


def pack_hostile(t: dict, edge: dict | None) -> dict:
    e = edge or {}
    return {
        "capability": t["capability"],
        "dependency": t["dependency"],
        "relation": t["relation"],
        "q": t.get("q") or e.get("q_relationConfidence"),
        "p": t.get("p") or e.get("p_mechanicalPressure"),
        "a_capabilityReliability": e.get("a_capabilityReliability"),
        "a_targetReliability": e.get("a_targetReliability"),
        "capabilityProminence": t.get("capabilityProminence"),
        "capabilityCapacity": t.get("capabilityCapacity"),
        "capabilityCommanderLink": t.get("capabilityCommanderLink"),
        "dependencyProminence": t.get("dependencyProminence"),
        "dependencyCriticality": t.get("dependencyCriticality"),
        "rawTerm": t.get("rawTerm"),
        "effectiveTerm": t.get("effectiveTerm"),
        "resilience": t.get("resilience"),
        "pressureEligible": e.get("pressureEligible"),
        "hierarchyDominated": e.get("hierarchyDominated"),
        "kClass": e.get("kClass"),
        "kVersionAdded": e.get("kVersionAdded"),
        "reason": t.get("reason") or e.get("reason"),
    }


def pack_support(t: dict, edge: dict | None) -> dict:
    e = edge or {}
    dep = t.get("target") or t.get("dependency")
    return {
        "capability": t["capability"],
        "dependency": dep,
        "relation": t["relation"],
        "q": e.get("q_relationConfidence"),
        "p": e.get("p_mechanicalPressure"),
        "a_capabilityReliability": e.get("a_capabilityReliability"),
        "a_targetReliability": e.get("a_targetReliability"),
        "effectiveTerm": t.get("effectiveTerm"),
        "pressureEligible": e.get("pressureEligible"),
        "hierarchyDominated": e.get("hierarchyDominated"),
        "kClass": e.get("kClass"),
        "kVersionAdded": e.get("kVersionAdded"),
        "reason": t.get("reason") or e.get("reason"),
    }


def headline(terms: list[dict], rels: set[str], dep_key: str) -> str | None:
    ranked = [t for t in terms if t.get("relation") in rels]
    if not ranked:
        return None
    t = max(ranked, key=lambda x: abs(float(x.get("effectiveTerm") or 0)))
    return f"{t['capability']} → {t.get(dep_key) or t.get('dependency') or t.get('target')}"


NEAR_ZERO_NET = 0.05  # Pressure-v2 experimental; not a universal Magic constant


def aggregation_stability(chs: dict[str, dict]) -> str:
    signs = {fam: sign_of(ch["net_interaction"]) for fam, ch in chs.items()}
    prim = signs[PRIMARY]
    others = [signs[f] for f in DIAGNOSTICS]
    if all(s == prim for s in others):
        return "STABLE"
    if prim == 0 or any(s == 0 for s in others):
        return "NEAR_ZERO_DISAGREEMENT" if any(s != prim for s in others) else "STABLE"
    return "SENSITIVE"


def net_sign_status(chs: dict[str, dict]) -> str:
    """Conservative-v2 net is always stored. Its sign is a conclusion only if STABLE_*."""
    if aggregation_stability(chs) == "SENSITIVE":
        return "SENSITIVE"
    nets = [float(ch["net_interaction"]) for ch in chs.values()]
    if all(abs(x) < NEAR_ZERO_NET for x in nets):
        return "STABLE_NEAR_ZERO"
    prim = float(chs[PRIMARY]["net_interaction"])
    if prim > 0:
        return "STABLE_POSITIVE"
    if prim < 0:
        return "STABLE_NEGATIVE"
    return "STABLE_NEAR_ZERO"


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    if load_json(K15 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.5 must stay frozen")
    if load_json(K27 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v2.7 must be frozen first")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    decks, polarity = load_decks(
        concept_ids, by_axis, scores, np.percentile(scores, 90, axis=0), np.percentile(scores, 99, axis=0), row_of, name_of, type_of
    )
    deck_of = {d["id"]: d for d in decks}

    edges = load_json(K27 / "edges.json")
    edge_of = {(e["capability"], e["target"]): e for e in edges}
    leftover = leftover_cells(concept_ids, by_axis, edges)
    leftover_el = set(_eligible_leftover(leftover, by_axis))
    reviewed_live = {(e["capability"], e["target"]) for e in edges if e.get("kClass") in LIVE}
    pairs = attach_channels(load_json(K27 / "pairs.json"))
    pair_of = {(p["from"], p["to"]): p for p in pairs}
    h_rows = {(r["from"], r["to"]): r for r in load_json(K27 / "pairs-h-both.json")}

    cap_mass = {d["id"]: {c: rec.get("packageInformedProminence", rec["prominence"]) for c, rec in d["axes"]["capability"].items()} for d in decks}
    dep_mass = {d["id"]: {t: rec["prominence"] for t, rec in d["axes"]["dependency"].items()} for d in decks}

    cells = sorted(reviewed_live | leftover_el)
    compat = {cd: compatibility(cd[0], cd[1])["level"] for cd in cells}

    out_pairs = []
    recon_fail = []
    unknown_leak = []
    blocked_push = []
    parent_child = []
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
            "pressureEstimator": {"primary": "conservative-v2", "diagnostics": ["prominence-v2", "presence-v2"]},
            "channels": chs[PRIMARY],
            "estimators": chs,
            "H_raw": h["H_raw"],
            "H_credible": h["H_credible"],
            "maturity": klass,
            "maturityBands": "Pressure-v2 experimental; not a universal Magic constant",
            "uncertainty": interpret_u(h["H_raw"], h["H_credible"]),
            "aggregation_stability": aggregation_stability(chs),
            "net_sign_status": net_sign_status(chs),
            "top_hostile_mechanisms": [
                {"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]}
                for t in hostile_t[:5]
            ],
            "top_supportive_mechanisms": [
                {"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]}
                for t in supp_t[:5]
            ],
            "top_conditional_mechanisms": [
                {"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]}
                for t in cond_t[:5]
            ],
            "top_resilience_mechanisms": res_t[:5],
            "reviewed_credible_mass": round(reviewed_cred, 4),
            "unknown_credible_mass": round(unknown_cred, 4),
            "raw_unknown_mass": round(raw_unknown, 4),
            "contributions": {"hostile": hostile_t, "supportive": supp_t, "conditional": cond_t},
            "eligibility": {
                "deckLocalBlockedCaps": sorted(skip),
                "profileQABlocked": sorted(BLOCKED),
                "splitParentsExcluded": sorted(SPLIT_PARENTS),
            },
            "largestUnresolvedRaw": h.get("largestRaw"),
            "largestUnresolvedCredible": h.get("largestCredible"),
            "nRawAboveH1": h.get("nRawAboveH1"),
            "nCredibleAboveH1": h.get("nCredibleAboveH1"),
        }
        out_pairs.append(rec)

    by = {(r["from"], r["to"]): r for r in out_pairs}
    derived = []
    anti_fail = []
    ids = [d["id"] for d in decks]
    for a in ids:
        for b in ids:
            if a == b:
                continue
            pa, pb = by[(a, b)], by[(b, a)]
            mh = round(pa["channels"]["hostile_pressure"] - pb["channels"]["hostile_pressure"], 4)
            mn = round(pa["channels"]["net_interaction"] - pb["channels"]["net_interaction"], 4)
            derived.append({"from": a, "to": b, "M_hostile": mh, "M_net": mn})
    der_of = {(r["from"], r["to"]): r for r in derived}
    for a in ids:
        for b in ids:
            if a >= b:
                continue
            ab, ba = der_of[(a, b)], der_of[(b, a)]
            if abs(ab["M_hostile"] + ba["M_hostile"]) > TOL or abs(ab["M_net"] + ba["M_net"]) > TOL:
                anti_fail.append({"pair": f"{a}↔{b}", "Mh": (ab["M_hostile"], ba["M_hostile"]), "Mn": (ab["M_net"], ba["M_net"])})

    counts = defaultdict(int)
    for r in out_pairs:
        counts[r["maturity"]] += 1
    expected = {"MATURE": 27, "PARTIALLY_MATURE": 110, "IMMATURE": 73}
    maturity_ok = dict(counts) == expected

    # aggregation sensitivity
    host_agree = supp_agree = net_agree = 0
    mature_sensitive = []
    for r in out_pairs:
        fams = r["estimators"]
        src = pair_of[(r["from"], r["to"])]
        hls = [headline(src["families"][fam].get("attackTerms") or [], HOSTILE, "dependency") for fam in (PRIMARY, *DIAGNOSTICS)]
        sls = [headline(src["families"][fam].get("enableTerms") or [], SUPPORT, "target") for fam in (PRIMARY, *DIAGNOSTICS)]
        if len(set(hls)) == 1:
            host_agree += 1
        if len(set(sls)) == 1:
            supp_agree += 1
        signs = [sign_of(fams[fam]["net_interaction"]) for fam in (PRIMARY, *DIAGNOSTICS)]
        if len(set(signs)) == 1:
            net_agree += 1
        if r["maturity"] == "MATURE" and r["aggregation_stability"] == "SENSITIVE":
            mature_sensitive.append({"pair": f"{r['from']}→{r['to']}", "nets": {fam: fams[fam]["net_interaction"] for fam in fams}})

    n = len(out_pairs)
    qa = {
        "reconstruction": {"nFail": len(recon_fail), "n": n, "pass": len(recon_fail) == 0, "failures": recon_fail[:8]},
        "antisymmetry": {"nFail": len(anti_fail), "pass": len(anti_fail) == 0, "failures": anti_fail[:8]},
        "maturityIntegrity": {"observed": dict(counts), "expected": expected, "pass": maturity_ok},
        "unknownIntegrity": {"nLeak": len(unknown_leak), "pass": len(unknown_leak) == 0, "leaks": unknown_leak[:8]},
        "eligibilityIntegrity": {"nBlockedPush": len(blocked_push), "pass": len(blocked_push) == 0, "pushes": blocked_push[:8]},
        "hierarchyIntegrity": {"nParentChild": len(parent_child), "pass": len(parent_child) == 0, "hits": parent_child[:8]},
        "channelIntegrity": {
            "note": "hostile and supportive stored separately; net is derived",
            "pass": all(abs(r["channels"]["net_interaction"] - (r["channels"]["hostile_pressure"] - r["channels"]["supportive_pressure"])) <= TOL for r in out_pairs),
        },
        "aggregationSensitivity": {
            "hostileHeadlineAgreement": {"n": host_agree, "of": n, "rate": round(host_agree / n, 4)},
            "supportiveHeadlineAgreement": {"n": supp_agree, "of": n, "rate": round(supp_agree / n, 4)},
            "netSignAgreement": {"n": net_agree, "of": n, "rate": round(net_agree / n, 4)},
            "matureSensitiveNets": mature_sensitive,
            "stabilityCounts": dict(defaultdict(int, {k: sum(1 for r in out_pairs if r["aggregation_stability"] == k) for k in ("STABLE", "SENSITIVE", "NEAR_ZERO_DISAGREEMENT")})),
        },
    }
    qa["allPass"] = all(
        qa[k]["pass"]
        for k in ("reconstruction", "antisymmetry", "maturityIntegrity", "unknownIntegrity", "eligibilityIntegrity", "hierarchyIntegrity", "channelIntegrity")
    )

    story_ids = {("D04", "D03"), ("D03", "D04"), ("D14", "D07"), ("D07", "D14"), ("D03", "D07")}
    stories = []
    for r in out_pairs:
        if (r["from"], r["to"]) not in story_ids:
            continue
        m = der_of[(r["from"], r["to"])]
        stories.append(
            {
                "pair": f"{r['from']}→{r['to']}",
                "channels": r["channels"],
                "H_raw": r["H_raw"],
                "H_credible": r["H_credible"],
                "maturity": r["maturity"],
                "uncertainty": r["uncertainty"],
                "aggregation_stability": r["aggregation_stability"],
                "top_hostile_mechanisms": r["top_hostile_mechanisms"],
                "top_supportive_mechanisms": r["top_supportive_mechanisms"],
                "M_hostile": m["M_hostile"],
                "M_net": m["M_net"],
            }
        )

    extra = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PRESSURE_V2_CONSTRUCTED",
        "parent": "mechanical-pressure-k-v2.7",
        "pressureEstimator": {"primary": "conservative-v2", "diagnostics": ["prominence-v2", "presence-v2"]},
        "maturityBands": {
            "MATURE": "H_credible < 0.50",
            "PARTIALLY_MATURE": "0.50 <= H_credible < 1.00",
            "IMMATURE": "H_credible >= 1.00",
            "note": "Pressure-v2 experimental maturity bands. Not universal Magic constants.",
        },
        "nPairs": n,
        "maturityCounts": dict(counts),
        "qa": qa,
        "storyPairs": stories,
        "safety": {
            "hodge": False,
            "rpsAuthorized": False,
            "extraDecks": False,
            "ranking": False,
            "winProbability": False,
            "pressureTimesOneMinusH": False,
            "unknownAsZero": False,
            "compatibilityEdited": False,
            "openai": False,
            "reembed": False,
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    slim = [{k: r[k] for k in r if k != "contributions"} for r in out_pairs]
    (OUT / "pairs.json").write_text(json.dumps(out_pairs, indent=2) + "\n", encoding="utf-8")
    (OUT / "pairs-summary.json").write_text(json.dumps(slim, indent=2) + "\n", encoding="utf-8")
    (OUT / "derived-M.json").write_text(json.dumps(derived, indent=2) + "\n", encoding="utf-8")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    (OUT / "story-pairs.json").write_text(json.dumps(stories, indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(extra, indent=2) + "\n", encoding="utf-8")
    status = "QA_PASSED" if qa["allPass"] else "QA_FAILED"
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "DeckPressure",
                "version": "deck-pressure-v2",
                "status": status,
                "lineage": "v2",
                "parent": "mechanical-pressure-k-v2.7",
                "pressureEstimator": "conservative-v2",
                "note": "Constructed measurement object. UNKNOWN ≠ 0. Channels do not cancel before storage.",
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
                "maturity": dict(counts),
                "qa": {k: ({"pass": qa[k]["pass"]} if isinstance(qa[k], dict) and "pass" in qa[k] else qa[k]) for k in qa},
                "aggregation": qa["aggregationSensitivity"],
                "stories": [
                    {
                        "pair": s["pair"],
                        "hostile": s["channels"]["hostile_pressure"],
                        "supportive": s["channels"]["supportive_pressure"],
                        "net": s["channels"]["net_interaction"],
                        "Hcred": s["H_credible"],
                        "maturity": s["maturity"],
                        "agg": s["aggregation_stability"],
                        "topH": (s["top_hostile_mechanisms"] or [{}])[0].get("edge"),
                    }
                    for s in stories
                ],
                "frozen": status == "FROZEN",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

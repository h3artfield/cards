#!/usr/bin/env python3
"""
K v2.0 carry-forward baseline, then K v2.1 first precision batch.

New graph on Ontology v2.2 + Profiles v2. Not a 216-cell migration.
No Hodge. No extra decks. No Pressure-v2 canonization.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from itertools import permutations
from pathlib import Path

import numpy as np

from build_deck_mechanical_profiles_v2 import profile_deck
from build_k_v13_active_coverage import M, credible_cycle, extract_pair_index, margin_report, resolve_cards, top_edge
from build_k_v14_active_coverage import axis_mass, coverage_decomp, parse_top, spearman_rho, status_of
from build_k_v15_precision_coverage import eligible_attack_pressure, eligible_top_edge, pair_index_eligible
from mechanical_deck_pressure_v1 import pressure_pair
from mechanical_k_eligibility_v15 import DIRECTIONAL
from mechanical_k_v11 import derive_pressure
from mechanical_k_v2 import (
    CAP_MECH,
    DEP_MECH,
    RES_MECH,
    SPLIT_PARENTS,
    UNSUPPORTED_AXES,
    V21_REVIEWS,
    axis_reliability,
    carry_forward_fields,
    classify_v15_edge,
    k_pressure_eligible,
    mark_hierarchy_dominance,
    polarity_blocked_caps,
    trained_children,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K15 = MS / "mechanical-pressure-k-v1.5"
PROF = MS / "deck-mechanical-profiles-v2"
PROF1 = MS / "deck-mechanical-profiles-v1"
OUTK20 = MS / "mechanical-pressure-k-v2.0"
OUTK21 = MS / "mechanical-pressure-k-v2.1"
STORY = {("D04", "D03"), ("D03", "D04"), ("D14", "D07"), ("D07", "D14"), ("D03", "D07")}


def review_record(c: str, d: str, decision: dict, by_axis: dict, lane: str) -> dict:
    p = derive_pressure(decision)
    q = 0.72 if decision["relation"] == "CONDITIONAL" else 0.82
    if decision["status"] == "SUPPORTED_NEUTRAL":
        q = 0.8
    a_c = axis_reliability(by_axis[c]) if c in by_axis else 0.2
    a_d = axis_reliability(by_axis[d]) if d in by_axis else 0.2
    rec = {
        "capability": c,
        "target": d,
        "targetKind": (by_axis.get(d) or {}).get("kind", "dependency"),
        "reviewBucket": lane,
        "relation": decision["relation"],
        "status": decision["status"],
        "conditionality": decision.get("conditionality"),
        "reason": decision.get("reason"),
        "mechanism": {
            "capability": CAP_MECH.get(c),
            "dependency": DEP_MECH.get(d) or RES_MECH.get(d),
        },
        "q_relationConfidence": q,
        "p_mechanicalPressure": p,
        "a_capabilityReliability": round(a_c, 4),
        "a_targetReliability": round(a_d, 4),
        "kClass": "NEW_ENDPOINT",
        "kVersionAdded": "mechanical-pressure-k-v2.1",
        "carryForward": False,
    }
    rec["pressureGate"] = k_pressure_eligible(rec, by_axis)
    rec["pressureEligible"] = rec["pressureGate"]["eligible"]
    return rec


def load_decks(concept_ids, by_axis, scores, p90, p99, row_of, name_of, type_of):
    sources = load_json(PROF1 / "source-decks.json")
    sealed = load_json(PROF1 / "sealed-key.json")["key"]
    decks = []
    polarity = {}
    for raw, key in zip(sources, sealed):
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, pkgs, *_rest = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
        polarity[key["blindId"]] = polarity_blocked_caps(axes)
        decks.append({"id": key["blindId"], "axes": axes, "packages": pkgs})
    return decks, polarity


def compute_pairs(decks, edges, leftover, by_axis, polarity):
    edges = mark_hierarchy_dominance(edges)
    for e in edges:
        e["pressureGate"] = k_pressure_eligible(e, by_axis)
        e["pressureEligible"] = e["pressureGate"]["eligible"]
    attack_all = [e for e in edges if e["relation"] in {"ATTACKS", "DISRUPTS", "CONDITIONAL"}]
    enable_all = [e for e in edges if e["relation"] in {"ENABLES", "BENEFITS"}]
    damper_by_cap = {e["capability"]: e for e in edges if e["relation"] == "MITIGATED_BY"}
    coverage_edges = [e for e in edges if e.get("kClass") not in {"SPLIT_ENDPOINT", "HISTORICAL_ONLY", "UNSUPPORTED_ENDPOINT"}]

    pairs = []
    for a in decks:
        skip = polarity.get(a["id"]) or set()
        attack = [e for e in attack_all if e.get("pressureEligible") and e["capability"] not in skip]
        enable = [e for e in enable_all if e.get("pressureEligible") and e["capability"] not in skip]
        for b in decks:
            if a["id"] == b["id"]:
                continue
            fams = {
                fam: pressure_pair(a["axes"], b["axes"], attack, enable, damper_by_cap, fam, leftover, coverage_edges=coverage_edges)
                for fam in ("presence", "prominence", "conservative")
            }
            for fam, block in fams.items():
                block["eligibleAttackPressure"] = eligible_attack_pressure(block, by_axis)
                block["eligibleTop"] = eligible_top_edge(block, by_axis)
                block["deckLocalBlockedCaps"] = sorted(skip)
            pairs.append({"from": a["id"], "to": b["id"], "families": fams})
    return pairs, edges


def coverage_stats(decks, edges, leftover, pairs, by_axis, trained):
    caps = [c for c in trained if (by_axis.get(c) or {}).get("kind") == "capability"]
    deps = [c for c in trained if (by_axis.get(c) or {}).get("kind") == "dependency"]
    elig_caps = [c for c in caps if k_pressure_eligible({"capability": c, "relation": "ATTACKS", "kClass": "NEW_ENDPOINT"}, by_axis)["eligible"]]
    possible = len(elig_caps) * len(deps)
    reviewed = [e for e in edges if e.get("kClass") in {"UNCHANGED_ENDPOINTS", "NEW_ENDPOINT", "RETIRED_BROAD", "CARRY_FORWARD_VERIFIED"}]
    # carry-forward + new reviews count as reviewed cells; split historical do not
    live = [e for e in edges if e.get("kClass") in {"UNCHANGED_ENDPOINTS", "NEW_ENDPOINT", "CARRY_FORWARD_VERIFIED", "RETIRED_BROAD"}]
    counts = defaultdict(int)
    for e in live:
        counts[status_of(e)] += 1
        counts["reviewed"] += 1
    counts["unknown_cells"] = possible - counts["reviewed"]
    decomp = coverage_decomp(decks, live, leftover)
    mean_cov = float(np.mean([p["families"]["conservative"]["coverage"] for p in pairs])) if pairs else 0.0
    return {
        "nCapabilities": len(caps),
        "nDependencies": len(deps),
        "nEligibleCapabilities": len(elig_caps),
        "possibleEligibleCells": possible,
        "reviewedLive": counts["reviewed"],
        "carryForwardAttackDisrupt": counts["active"],
        "carryForwardEnable": counts["enable"],
        "carryForwardNeutral": counts["neutral"],
        "carryForwardConditional": counts["conditional"],
        "meanReviewedCoverage": mean_cov,
        "decomp": decomp,
    }


def story_rows(pairs, idx):
    by = {(p["from"], p["to"]): p for p in pairs}
    out = []
    for a, b in sorted(STORY):
        block = by[(a, b)]["families"]["conservative"]
        tops = [
            {"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]}
            for t in (block.get("attackTerms") or [])[:4]
            if t["effectiveTerm"] >= 0.005
        ]
        out.append(
            {
                "pair": f"{a}→{b}",
                "P_eligible": block.get("eligibleAttackPressure", block["supportedAttackPressure"]),
                "P_raw": block["supportedAttackPressure"],
                "topEligible": block.get("eligibleTop") or top_edge(block),
                "topTerms": tops,
                "coverage": block["coverage"],
            }
        )
    return out


def cycles_of(pairs, ids):
    by_dir = {(p["from"], p["to"]): p for p in pairs}
    anti = {
        (p["from"], p["to"]): (p["families"]["conservative"].get("eligibleAttackPressure") or 0)
        - (by_dir[(p["to"], p["from"])]["families"]["conservative"].get("eligibleAttackPressure") or 0)
        for p in pairs
    }
    cap_domain = {k: v["domain"] for k, v in CAP_MECH.items()}
    cycles, seen = [], set()
    for a, b, c in permutations(ids, 3):
        key = tuple(sorted([(a, b), (b, c), (c, a)]))
        if key in seen:
            continue
        mab, mbc, mca = anti[(a, b)], anti[(b, c)], anti[(c, a)]
        if mab > 0.02 and mbc > 0.02 and mca > 0.02:
            seen.add(key)

            def expl(x, y):
                block = by_dir[(x, y)]["families"]["conservative"]
                return {
                    "from": x,
                    "to": y,
                    "supportedAttackPressure": block.get("eligibleAttackPressure", block["supportedAttackPressure"]),
                    "coverage": block["coverage"],
                    "topAttackTerms": [
                        {"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]}
                        for t in (block.get("attackTerms") or [])[:3]
                        if t["effectiveTerm"] >= 0.005
                    ],
                }

            cyc = {
                "cycle": [a, b, c, a],
                "M": {f"{a}→{b}": round(mab, 4), f"{b}→{c}": round(mbc, 4), f"{c}→{a}": round(mca, 4)},
                "explanations": [expl(a, b), expl(b, c), expl(c, a)],
            }
            cyc["credibleGate"] = credible_cycle(cyc, cap_domain)
            cycles.append(cyc)
    return cycles


def exposure_rank(decks, leftover):
    E = defaultdict(float)
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            for c, d in leftover:
                E[(c, d)] += axis_mass(a, b, c, d)
    return E


def write_k(out: Path, version: str, edges, pairs, extra: dict):
    out.mkdir(parents=True, exist_ok=True)
    (out / "edges.json").write_text(json.dumps(edges, indent=2) + "\n", encoding="utf-8")
    (out / "pairs.json").write_text(json.dumps(pairs, indent=2) + "\n", encoding="utf-8")
    (out / "IMMUTABLE.json").write_text(
        json.dumps({"artifactType": "MechanicalPressureK", "version": version, "status": "REVIEWED_BATCH", "lineage": "v2", "parentLineage": "v1.5-historical"}, indent=2) + "\n",
        encoding="utf-8",
    )
    (out / "manifest.json").write_text(json.dumps({"version": version, **{k: extra[k] for k in extra if k != "edges"}}, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("Profiles v2 must be frozen")
    if load_json(K15 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.5 must stay frozen")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    trained = set(concept_ids)
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    decks, polarity = load_decks(concept_ids, by_axis, scores, p90, p99, row_of, name_of, type_of)

    v15 = load_json(K15 / "edges.json")
    classified, v20_edges, historical = [], [], []
    for old in v15:
        c, d = old["capability"], old["target"]
        kclass = classify_v15_edge(c, d, trained)
        row = {"capability": c, "target": d, "v15Relation": old.get("relation"), "kClass": kclass}
        if kclass == "UNCHANGED_ENDPOINTS":
            rec = {"capability": c, "target": d, **carry_forward_fields(old)}
            rec["a_capabilityReliability"] = round(axis_reliability(by_axis[c]), 4)
            rec["a_targetReliability"] = round(axis_reliability(by_axis[d]), 4)
            rec["kClass"] = "CARRY_FORWARD_VERIFIED"
            rec["carryForward"] = True
            rec["definitionCheck"] = "both endpoints present in v2.2 and not split parents"
            rec["kVersionAdded"] = old.get("kVersionAdded") or "mechanical-pressure-k-v1.x"
            rec["sourceK"] = "mechanical-pressure-k-v1.5"
            v20_edges.append(rec)
            row["action"] = "CARRY_FORWARD_VERIFIED"
        else:
            hist = {**carry_forward_fields(old), "capability": c, "target": d, "kClass": kclass, "historicalOnly": True, "carryForward": False}
            if kclass == "SPLIT_ENDPOINT":
                hist["childrenUnknown"] = {
                    "capabilityChildren": trained_children(c, trained) if c in SPLIT_PARENTS else [],
                    "targetChildren": trained_children(d, trained) if d in SPLIT_PARENTS else [],
                }
            historical.append(hist)
            row["action"] = "HISTORICAL_ONLY"
        classified.append(row)

    class_counts = defaultdict(int)
    for r in classified:
        class_counts[r["kClass"]] += 1

    leftover20 = [
        (c, d)
        for c in concept_ids
        for d in concept_ids
        if (by_axis.get(c) or {}).get("kind") == "capability"
        and (by_axis.get(d) or {}).get("kind") == "dependency"
        and (c, d) not in {(e["capability"], e["target"]) for e in v20_edges}
        and c not in UNSUPPORTED_AXES
        and d not in UNSUPPORTED_AXES
    ]
    pairs20, v20_edges = compute_pairs(decks, v20_edges, leftover20, by_axis, polarity)
    stats20 = coverage_stats(decks, v20_edges, leftover20, pairs20, by_axis, trained)
    idx20 = pair_index_eligible(pairs20, by_axis)
    story20 = story_rows(pairs20, idx20)
    ids = [d["id"] for d in decks]

    extra20 = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "K_V2_0_CARRY_FORWARD_BASELINE",
        "classificationCounts": dict(class_counts),
        "nHistorical": len(historical),
        "nLive": len(v20_edges),
        "coverage": stats20,
        "storyPairs": story20,
        "cycles": cycles_of(pairs20, ids),
        "polarityFlags": {k: sorted(v) for k, v in polarity.items() if v},
        "profileQABlocked": ["DAMAGE_PLAYER"],
        "unsupportedAbsent": list(UNSUPPORTED_AXES),
        "kV21": False,
        "safety": {"hodge": False, "rpsAuthorized": False, "extraDecks": False, "openai": False, "reembed": False},
    }
    write_k(OUTK20, "mechanical-pressure-k-v2.0", v20_edges, pairs20, extra20)
    (OUTK20 / "classification.json").write_text(json.dumps({"v15": classified, "historical": historical}, indent=2) + "\n", encoding="utf-8")

    # ── K v2.1 precision reviews ────────────────────────────────
    E = exposure_rank(decks, leftover20)
    reviewed21 = {(e["capability"], e["target"]) for e in v20_edges}
    priority = [cd for cd in V21_REVIEWS if cd[0] in trained and cd[1] in trained and cd not in reviewed21]
    priority.sort(key=lambda cd: -E.get(cd, 0.0))
    new_edges = []
    for c, d in priority:
        new_edges.append(review_record(c, d, V21_REVIEWS[(c, d)], by_axis, "precision_v2.1"))
    v21_edges = v20_edges + new_edges
    leftover21 = [cd for cd in leftover20 if cd not in {(e["capability"], e["target"]) for e in v21_edges}]
    pairs21, v21_edges = compute_pairs(decks, v21_edges, leftover21, by_axis, polarity)
    stats21 = coverage_stats(decks, v21_edges, leftover21, pairs21, by_axis, trained)
    idx21 = pair_index_eligible(pairs21, by_axis)

    # H_eligible vs v2.0
    challenges = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top = idx21[(a["id"], b["id"])].get("topEligible") or idx21[(a["id"], b["id"])]["top"]
            tc, td = parse_top(top)
            top_m = axis_mass(a, b, tc, td)
            elig = []
            for c, d in leftover21:
                if c not in CAP_MECH or d not in DEP_MECH:
                    continue
                if c in SPLIT_PARENTS or d in SPLIT_PARENTS:
                    continue
                if not k_pressure_eligible({"capability": c, "relation": "ATTACKS", "kClass": "NEW_ENDPOINT"}, by_axis)["eligible"]:
                    continue
                m = axis_mass(a, b, c, d)
                if m >= 0.10:
                    elig.append((m, c, d))
            elig.sort(reverse=True)
            u = elig[0] if elig else (0.0, None, None)
            challenges.append(
                {
                    "from": a["id"],
                    "to": b["id"],
                    "topEligible": top,
                    "H_eligible": round(u[0] / (top_m + 0.02), 4),
                    "largestUnresolvedEligible": {"capability": u[1], "dependency": u[2], "mass": round(u[0], 4)} if u[1] else None,
                }
            )
    challenges.sort(key=lambda r: -r["H_eligible"])

    abs20, abs21 = [], []
    flips, material = [], 0
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            m20 = abs(M({k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx20.items()}, a, b))
            m21 = abs(M({k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx21.items()}, a, b))
            abs20.append(m20)
            abs21.append(m21)
    idx20e = {k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx20.items()}
    idx21e = {k: {**v, "P": v.get("P_eligible", v["P"])} for k, v in idx21.items()}
    for a in ids:
        for b in ids:
            if a == b:
                continue
            s0 = 1 if M(idx20e, a, b) > 1e-9 else (-1 if M(idx20e, a, b) < -1e-9 else 0)
            s1 = 1 if M(idx21e, a, b) > 1e-9 else (-1 if M(idx21e, a, b) < -1e-9 else 0)
            if s0 and s1 and s0 != s1:
                flips.append({"pair": f"{a}→{b}", "M20": round(M(idx20e, a, b), 4), "M21": round(M(idx21e, a, b), 4)})
                if abs(M(idx20e, a, b)) >= 0.08 and abs(M(idx21e, a, b)) >= 0.08:
                    material += 1
    rho = spearman_rho(abs20, abs21)
    tops_same = sum(1 for a in ids for b in ids if a != b and (idx20e[(a, b)].get("topEligible") or idx20e[(a, b)]["top"]) == (idx21e[(a, b)].get("topEligible") or idx21e[(a, b)]["top"]))
    n_pairs = 15 * 14
    story21 = story_rows(pairs21, idx21)
    for s in story21:
        fr, to = s["pair"].split("→")
        match = next((r for r in challenges if r["from"] == fr and r["to"] == to), None)
        s0 = next((r for r in story20 if r["pair"] == s["pair"]), None)
        s["v20"] = s0
        if match:
            s["H_eligible"] = match["H_eligible"]
            s["largestUnresolvedEligible"] = match["largestUnresolvedEligible"]

    extra21 = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "K_V2_1_PRECISION_BATCH",
        "parent": "mechanical-pressure-k-v2.0",
        "newReviews": [{"capability": e["capability"], "target": e["target"], "relation": e["relation"], "p": e["p_mechanicalPressure"], "pressureEligible": e["pressureEligible"]} for e in new_edges],
        "coverage": stats21,
        "coverageV20": stats20,
        "eligibleHeadlineStability": {"same": tops_same, "n": n_pairs},
        "rhoAbsM": rho,
        "signFlips": flips,
        "materialSignReversals": material,
        "cycles": cycles_of(pairs21, ids),
        "storyPairs": story21,
        "H_eligible": {"mean": float(np.mean([r["H_eligible"] for r in challenges])), "n_ge1": sum(1 for r in challenges if r["H_eligible"] >= 1), "top": challenges[:8]},
        "polarityFlags": {k: sorted(v) for k, v in polarity.items() if v},
        "safety": {"hodge": False, "rpsAuthorized": False, "extraDecks": False, "pressureV2Canon": False},
    }
    write_k(OUTK21, "mechanical-pressure-k-v2.1", v21_edges, pairs21, extra21)
    (OUTK21 / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUTK21 / "batch.json").write_text(json.dumps(extra21["newReviews"], indent=2) + "\n", encoding="utf-8")

    report = {
        "version": "mechanical-pressure-k-v2",
        "lineage": "v2",
        "k20": extra20,
        "k21": extra21,
        "classificationCounts": dict(class_counts),
        "note": "Do not compare raw % coverage to v1.5. Denominator is Ontology v2.2 eligible C×D.",
    }
    (MS / "mechanical-pressure-k-v2-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "classCounts": dict(class_counts),
                "v20Live": len(v20_edges),
                "v20Coverage": {k: stats20[k] for k in stats20 if k != "decomp"},
                "v21New": extra21["newReviews"],
                "v21Coverage": {k: stats21[k] for k in stats21 if k != "decomp"},
                "rho": rho,
                "topStable": f"{tops_same}/{n_pairs}",
                "materialFlips": material,
                "cycles": len(extra21["cycles"]),
                "story": story21,
                "polarity": extra21["polarityFlags"],
                "Hge1": extra21["H_eligible"]["n_ge1"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
K v1.5 — Precision coverage batch.

Pressure-eligibility mask. BROAD_FAMILY / UNDERDEFINED capabilities
cannot exert directional pressure. v1.4 edges are kept, not rewritten.
Queue: exposure 6 / pairwise-active 20 / structural 10.
No Hodge. No ontology retrain. No larger corpus.
"""

from __future__ import annotations

import json
import sys
import time
from collections import defaultdict
from itertools import permutations
from pathlib import Path

import numpy as np

import mechanical_k_v1 as kv1
from build_k_v13_active_coverage import M, credible_cycle, extract_pair_index, margin_report, resolve_cards, top_edge
from build_k_v14_active_coverage import PLAUSIBLE_OPS, axis_mass, coverage_decomp, parse_top, plausible, spearman_rho
from mechanical_k_eligibility_v15 import (
    DIRECTIONAL,
    capability_pressure_gate,
    edge_pressure_eligible,
    eligible_attack_pressure,
    eligible_top_edge,
    filter_edges,
    unknown_eligible_for_pressure,
)
from mechanical_k_v11 import CAP_MECH, DEP_MECH, OVERRIDES, derive_pressure, relate_v11
from mechanical_deck_pressure_v1 import pressure_pair
from mechanical_deck_profile_v1 import deck_axes_from_cards
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

kv1.CAP_MECH.update(CAP_MECH)

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v21"
RC8 = MS / "semantic-oracle-snapshot-v1"
K1 = MS / "mechanical-pressure-k-v1"
K14 = MS / "mechanical-pressure-k-v1.4"
PROF = MS / "deck-mechanical-profiles-v1"
OUTK = MS / "mechanical-pressure-k-v1.5"
OUTP = MS / "deck-pressure-v1.5"
LANE_EXPOSURE = 6
LANE_PAIRWISE = 20
LANE_STRUCTURAL = 10
GENERIC_CAPS = {"ADD_MANA", "SEARCH_LIBRARY", "LIFE_GAIN", "CAST_TRIGGER"}
PRIORITY = [
    ("HAND_ATTACK", "CARES_ABOUT_DRAWING_CARDS"),
    ("TAX_SPELL", "CARES_ABOUT_RESOLUTION"),
]
STORY = {("D04", "D03"), ("D03", "D04"), ("D14", "D07"), ("D07", "D14"), ("D03", "D07")}
ACTIVE_DEPS = {
    "CARES_ABOUT_GRAVEYARD",
    "CARES_ABOUT_ARTIFACTS",
    "CARES_ABOUT_ARTIFACT_ACTIVATIONS",
    "CARES_ABOUT_ONE_CREATURE",
    "CARES_ABOUT_COMMANDER",
    "CARES_ABOUT_CREATURES",
    "CARES_ABOUT_TOKENS",
    "CARES_ABOUT_CASTING_SPELLS",
    "CARES_ABOUT_RESOLUTION",
    "CARES_ABOUT_DRAWING_CARDS",
    "CARES_ABOUT_LARGE_HAND",
    "CARES_ABOUT_LANDS_ENTERING",
    "CARES_ABOUT_COMBAT",
    "CARES_ABOUT_COMBAT_DAMAGE",
    "CARES_ABOUT_CREATURE_DEATH",
    "CARES_ABOUT_DEATH_TRIGGERS",
    "CARES_ABOUT_SACRIFICE",
}


def queue_active(c: str, d: str, by_axis: dict) -> bool:
    """PURE attack-like cap × active dependency. Domain alias is not required to queue."""
    if not unknown_eligible_for_pressure(c, by_axis):
        return False
    cap = CAP_MECH.get(c)
    if not cap or cap.get("operation") not in PLAUSIBLE_OPS:
        return False
    return d in ACTIVE_DEPS or plausible(c, d)


def review_cell(c: str, d: str, lane: str, exposure: float) -> dict | None:
    decision = relate_v11(c, d)
    if decision.get("relation") == "UNKNOWN":
        return None
    p = derive_pressure(decision)
    q = 0.72 if decision["relation"] == "CONDITIONAL" else 0.82
    if decision["status"] == "SUPPORTED_NEUTRAL":
        q = 0.8
    return {
        "capability": c,
        "target": d,
        "targetKind": "dependency",
        "reviewBucket": f"precision_coverage_v1.5_{lane}",
        "relation": decision["relation"],
        "status": decision["status"],
        "conditionality": decision.get("conditionality"),
        "reason": decision.get("reason"),
        "mechanism": decision.get("mechanism"),
        "q_relationConfidence": q,
        "p_mechanicalPressure": p,
        "exposureMass": round(exposure, 4),
        "ontologyNote": decision.get("ontologyNote"),
        "kVersionAdded": "mechanical-pressure-k-v1.5",
        "pressureEligible": None,
    }


def headline_split(decks, leftover, idx, by_axis) -> list[dict]:
    rows = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top_c, top_d = parse_top(idx[(a["id"], b["id"])]["top"])
            top_m = axis_mass(a, b, top_c, top_d)
            all_c, elig_c = [], []
            for c, d in leftover:
                if not plausible(c, d):
                    continue
                m = axis_mass(a, b, c, d)
                if m < 0.10:
                    continue
                all_c.append((m, c, d))
                if unknown_eligible_for_pressure(c, by_axis):
                    elig_c.append((m, c, d))
            all_c.sort(reverse=True)
            elig_c.sort(reverse=True)
            u_all = all_c[0] if all_c else (0.0, None, None)
            u_el = elig_c[0] if elig_c else (0.0, None, None)
            rows.append(
                {
                    "from": a["id"],
                    "to": b["id"],
                    "topReviewed": idx[(a["id"], b["id"])]["top"],
                    "topReviewedMass": round(top_m, 4),
                    "topReviewedP": idx[(a["id"], b["id"])]["P"],
                    "largestUnresolvedAll": {"capability": u_all[1], "dependency": u_all[2], "mass": round(u_all[0], 4)} if u_all[1] else None,
                    "largestUnresolvedEligible": {"capability": u_el[1], "dependency": u_el[2], "mass": round(u_el[0], 4)} if u_el[1] else None,
                    "H_all": round(u_all[0] / (top_m + 0.02), 4),
                    "H_eligible": round(u_el[0] / (top_m + 0.02), 4),
                }
            )
    rows.sort(key=lambda r: -r["H_eligible"])
    return rows


def pair_index_eligible(pairs: list, by_axis: dict) -> dict:
    out = {}
    for p in pairs:
        cons = p["families"]["conservative"]
        if "eligibleAttackPressure" in cons:
            p_el = cons["eligibleAttackPressure"]
            top_el = cons.get("eligibleTop")
        else:
            p_el = eligible_attack_pressure(cons, by_axis)
            top_el = eligible_top_edge(cons, by_axis)
        out[(p["from"], p["to"])] = {
            "P": cons["supportedAttackPressure"],
            "P_eligible": p_el,
            "coverage": cons["coverage"],
            "top": top_edge(cons),
            "topEligible": top_el,
        }
    return out


def Me(idx, a, b):
    return idx[(a, b)]["P_eligible"] - idx[(b, a)]["P_eligible"]


def main() -> None:
    OUTK.mkdir(parents=True, exist_ok=True)
    OUTP.mkdir(parents=True, exist_ok=True)
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(K1 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1 must stay frozen")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("profiles must stay frozen")
    if load_json(K14 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1.4 must be frozen before v1.5")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    caps = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "capability"]
    deps = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "dependency"]
    k14_edges = load_json(K14 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in k14_edges}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    sources = load_json(PROF / "source-decks.json")
    sealed = load_json(PROF / "sealed-key.json")["key"]
    decks = []
    for raw, key in zip(sources, sealed):
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, _ = deck_axes_from_cards(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of)
        decks.append({"id": key["blindId"], "axes": axes})

    leftover = [(c, d) for c in caps for d in deps if (c, d) not in reviewed and c in CAP_MECH and d in DEP_MECH]
    E = {cd: 0.0 for cd in leftover}
    challenge_all = {cd: 0.0 for cd in leftover}
    challenge_el = {cd: 0.0 for cd in leftover}
    pairs14 = load_json(MS / "deck-pressure-v1.4" / "pairs.json")
    idx14 = pair_index_eligible(pairs14, by_axis)

    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top_c, top_d = parse_top(idx14[(a["id"], b["id"])]["topEligible"] or idx14[(a["id"], b["id"])]["top"])
            top_m = axis_mass(a, b, top_c, top_d)
            plaus = []
            for c, d in leftover:
                m = axis_mass(a, b, c, d)
                if m <= 0:
                    continue
                E[(c, d)] += m
                if queue_active(c, d, by_axis) and m >= 0.08:
                    plaus.append((m, c, d))
            plaus.sort(reverse=True)
            for rank, (m, c0, d0) in enumerate(plaus[:4]):
                w = (m / (top_m + 0.02)) / (rank + 1)
                challenge_all[(c0, d0)] += w
                if unknown_eligible_for_pressure(c0, by_axis):
                    challenge_el[(c0, d0)] += w

    structural_score = {}
    for c, d in leftover:
        s = challenge_el[(c, d)]
        if d in {"CARES_ABOUT_DRAWING_CARDS", "CARES_ABOUT_RESOLUTION", "CARES_ABOUT_ONE_CREATURE"}:
            s += 4 if unknown_eligible_for_pressure(c, by_axis) else 1.5
        if d in {"CARES_ABOUT_GRAVEYARD", "CARES_ABOUT_CASTING_SPELLS"} and plausible(c, d) and unknown_eligible_for_pressure(c, by_axis):
            s += 3
        if plausible(c, d):
            s += 5
        structural_score[(c, d)] = s

    selected, seen, n_generic = [], set(), defaultdict(int)

    def take(cd, lane):
        if cd in seen:
            return False
        c, d = cd
        if lane == "exposure" and c in GENERIC_CAPS and n_generic[c] >= 2:
            return False
        if lane == "pairwise" and cd not in PRIORITY:
            if not queue_active(c, d, by_axis):
                return False
            if n_generic[c] >= 2:
                return False
        if lane == "structural":
            if not unknown_eligible_for_pressure(c, by_axis):
                return False
            if not queue_active(c, d, by_axis) and d not in {"CARES_ABOUT_DRAWING_CARDS", "CARES_ABOUT_RESOLUTION", "CARES_ABOUT_ONE_CREATURE"}:
                return False
        seen.add(cd)
        selected.append((cd, lane))
        if lane in {"pairwise", "exposure"}:
            n_generic[c] += 1
        return True

    for cd in PRIORITY:
        if cd in leftover:
            take(cd, "pairwise")
    for cd in sorted(leftover, key=lambda x: -E[x]):
        if sum(1 for _, ln in selected if ln == "exposure") >= LANE_EXPOSURE:
            break
        take(cd, "exposure")
    for cd in sorted(leftover, key=lambda x: (-challenge_el[x], -challenge_all[x])):
        if sum(1 for _, ln in selected if ln == "pairwise") >= LANE_PAIRWISE:
            break
        take(cd, "pairwise")
    for cd in sorted(leftover, key=lambda x: -structural_score[x]):
        if sum(1 for _, ln in selected if ln == "structural") >= LANE_STRUCTURAL:
            break
        take(cd, "structural")

    if "--queue-only" in sys.argv:
        preview = []
        for (c, d), lane in selected:
            dec = relate_v11(c, d)
            gate = capability_pressure_gate(c, by_axis)
            preview.append(
                {
                    "lane": lane,
                    "cell": f"{c} → {d}",
                    "exposure": round(E[(c, d)], 4),
                    "challengeEligible": round(challenge_el[(c, d)], 4),
                    "engineGuess": dec.get("relation"),
                    "reason": dec.get("reason"),
                    "capEligible": gate["eligible"],
                    "capGate": gate["reason"],
                    "hasOverride": (c, d) in OVERRIDES,
                }
            )
        print(json.dumps({"selected": len(preview), "queue": preview}, indent=2))
        return

    new_edges, ontology_notes, status_counts, batch_rows = [], [], defaultdict(int), []
    for (c, d), lane in selected:
        edge = review_cell(c, d, lane, E[(c, d)])
        gate = capability_pressure_gate(c, by_axis)
        rec = {
            "capability": c,
            "dependency": d,
            "lane": lane,
            "exposureMass": round(E[(c, d)], 4),
            "challengeEligible": round(challenge_el[(c, d)], 4),
            "pressureGate": gate,
        }
        if not edge:
            status_counts["REMAINS_UNKNOWN"] += 1
            rec["review"] = {"relation": "UNKNOWN", "status": "UNKNOWN"}
            batch_rows.append(rec)
            continue
        edge["pressureEligible"] = bool(gate["eligible"] and edge["relation"] in {"ATTACKS", "DISRUPTS", "ENABLES", "BENEFITS", "CONDITIONAL", "MITIGATED_BY"})
        edge["pressureGate"] = gate
        new_edges.append(edge)
        status_counts[edge["status"]] += 1
        rec["review"] = {k: edge[k] for k in ("relation", "status", "conditionality", "reason", "p_mechanicalPressure", "ontologyNote", "pressureEligible")}
        batch_rows.append(rec)
        if edge.get("ontologyNote"):
            ontology_notes.append({"pair": f"{c} → {d}", "note": edge["ontologyNote"], "debtOnly": True})

    v15_edges = [dict(e) for e in k14_edges] + new_edges
    (OUTK / "batch.json").write_text(json.dumps(batch_rows, indent=2) + "\n", encoding="utf-8")
    (OUTK / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUTK / "edges.json").write_text(json.dumps(v15_edges, indent=2) + "\n", encoding="utf-8")

    reviewed_set = {(e["capability"], e["target"]) for e in v15_edges}
    leftover_after_all = [(c, d) for c in caps for d in deps if (c, d) not in reviewed_set]
    leftover_after = [(c, d) for c, d in leftover_after_all if c in CAP_MECH and d in DEP_MECH]
    attack_raw = [e for e in v15_edges if e["relation"] in {"ATTACKS", "DISRUPTS", "CONDITIONAL"}]
    enable_raw = [e for e in v15_edges if e["relation"] in {"ENABLES", "BENEFITS"}]
    attack_el = filter_edges(attack_raw, by_axis)
    enable_el = filter_edges(enable_raw, by_axis)
    damper_by_cap = {e["capability"]: e for e in v15_edges if e["relation"] == "MITIGATED_BY"}

    def directed(a, b):
        raw = {
            fam: pressure_pair(a["axes"], b["axes"], attack_raw, enable_raw, damper_by_cap, fam, leftover_after_all, coverage_edges=v15_edges)
            for fam in ("presence", "prominence", "conservative")
        }
        elig = {
            fam: pressure_pair(a["axes"], b["axes"], attack_el, enable_el, damper_by_cap, fam, leftover_after_all, coverage_edges=v15_edges)
            for fam in ("presence", "prominence", "conservative")
        }
        for fam in elig:
            elig[fam]["eligibleAttackPressure"] = elig[fam]["supportedAttackPressure"]
            elig[fam]["eligibleTop"] = top_edge(elig[fam])
            elig[fam]["rawAttackPressure"] = raw[fam]["supportedAttackPressure"]
            elig[fam]["rawTop"] = top_edge(raw[fam])
        return {"from": a["id"], "to": b["id"], "families": elig, "familiesRaw": {"conservative": raw["conservative"]}}

    pairs = [directed(a, b) for a in decks for b in decks if a["id"] != b["id"]]
    by_dir = {(p["from"], p["to"]): p for p in pairs}
    idx15 = pair_index_eligible(pairs, by_axis)
    idx1 = extract_pair_index(load_json(MS / "deck-pressure-v1" / "pairs.json"))
    idx13 = extract_pair_index(load_json(MS / "deck-pressure-v1.3" / "pairs.json"))
    ids = [d["id"] for d in decks]

    # v1.4 eligible vs v1.4 raw, then v1.4 eligible vs v1.5 eligible
    raw_same = elig_same = raw_chg = elig_chg = 0
    raw_flips, elig_flips, abs_dp, story = [], [], [], []
    for a in ids:
        for b in ids:
            if a == b:
                continue
            if idx14[(a, b)]["top"] == idx15[(a, b)]["top"]:
                raw_same += 1
            else:
                raw_chg += 1
            if idx14[(a, b)]["topEligible"] == idx15[(a, b)]["topEligible"]:
                elig_same += 1
            else:
                elig_chg += 1
            s14 = 1 if Me(idx14, a, b) > 1e-9 else (-1 if Me(idx14, a, b) < -1e-9 else 0)
            s15 = 1 if Me(idx15, a, b) > 1e-9 else (-1 if Me(idx15, a, b) < -1e-9 else 0)
            if s14 and s15 and s14 != s15:
                elig_flips.append({"pair": f"{a}→{b}", "M_v14e": round(Me(idx14, a, b), 4), "M_v15e": round(Me(idx15, a, b), 4), "nearZero": abs(Me(idx14, a, b)) < 0.05 or abs(Me(idx15, a, b)) < 0.05})
            sr14 = 1 if M(idx14, a, b) > 1e-9 else (-1 if M(idx14, a, b) < -1e-9 else 0)
            sr15 = 1 if M(idx15, a, b) > 1e-9 else (-1 if M(idx15, a, b) < -1e-9 else 0)
            if sr14 and sr15 and sr14 != sr15:
                raw_flips.append({"pair": f"{a}→{b}", "M_v14": round(M(idx14, a, b), 4), "M_v15": round(M(idx15, a, b), 4)})
            abs_dp.append(abs(idx15[(a, b)]["P_eligible"] - idx14[(a, b)]["P_eligible"]))
            if (a, b) in STORY:
                story.append(
                    {
                        "pair": f"{a}→{b}",
                        "P_raw": {"v1": idx1[(a, b)]["P"], "v1.3": idx13[(a, b)]["P"], "v1.4": idx14[(a, b)]["P"], "v1.5": idx15[(a, b)]["P"]},
                        "P_eligible": {"v1.4": idx14[(a, b)]["P_eligible"], "v1.5": idx15[(a, b)]["P_eligible"]},
                        "M_eligible": {"v1.4": round(Me(idx14, a, b), 4), "v1.5": round(Me(idx15, a, b), 4)},
                        "topRaw": {"v1.4": idx14[(a, b)]["top"], "v1.5": idx15[(a, b)]["top"]},
                        "topEligible": {"v1.4": idx14[(a, b)]["topEligible"], "v1.5": idx15[(a, b)]["topEligible"]},
                    }
                )

    abs14e, abs15e, abs14r, abs15r = [], [], [], []
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            abs14e.append(abs(Me(idx14, a, b)))
            abs15e.append(abs(Me(idx15, a, b)))
            abs14r.append(abs(M(idx14, a, b)))
            abs15r.append(abs(M(idx15, a, b)))
    rho_e = spearman_rho(abs14e, abs15e)
    rho_r = spearman_rho(abs14r, abs15r)
    rho_mask = spearman_rho(abs14r, abs14e)

    # eligible margin using eligible M
    idx14e = {k: {**v, "P": v["P_eligible"]} for k, v in idx14.items()}
    idx15e = {k: {**v, "P": v["P_eligible"]} for k, v in idx15.items()}
    margins = margin_report(idx14e, idx15e, ids)

    challenges = headline_split(decks, leftover_after, idx15e, by_axis)
    h_all = [r["H_all"] for r in challenges]
    h_el = [r["H_eligible"] for r in challenges]
    for s in story:
        fr, to = s["pair"].split("→")
        match = next((r for r in challenges if r["from"] == fr and r["to"] == to), None)
        if match:
            s["headlineChallenge"] = {k: match[k] for k in ("H_all", "H_eligible", "largestUnresolvedAll", "largestUnresolvedEligible", "topReviewedMass")}

    decomp = coverage_decomp(decks, v15_edges, leftover_after)
    mean_cov = float(np.mean([p["families"]["conservative"]["coverage"] for p in pairs]))
    v14_rep = load_json(MS / "mechanical-pressure-k-v14-report.json")
    v14_cov = v14_rep["coverageLearningCurve"][-1]["meanCoverage"]
    n_new = len(new_edges)

    anti = {(p["from"], p["to"]): p["families"]["conservative"]["supportedAttackPressure"] - by_dir[(p["to"], p["from"])]["families"]["conservative"]["supportedAttackPressure"] for p in pairs}
    cap_domain = {k: v["domain"] for k, v in CAP_MECH.items()}
    cycles, seen_c = [], set()
    for a, b, c in permutations(ids, 3):
        key = tuple(sorted([(a, b), (b, c), (c, a)]))
        if key in seen_c:
            continue
        mab, mbc, mca = anti[(a, b)], anti[(b, c)], anti[(c, a)]
        if mab > 0.02 and mbc > 0.02 and mca > 0.02:
            seen_c.add(key)

            def expl(x, y):
                block = by_dir[(x, y)]["families"]["conservative"]
                return {
                    "from": x,
                    "to": y,
                    "supportedAttackPressure": block["supportedAttackPressure"],
                    "coverage": block["coverage"],
                    "topAttackTerms": [
                        {"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]}
                        for t in block["attackTerms"][:3]
                        if t["effectiveTerm"] >= 0.005
                    ],
                }

            cyc = {"cycle": [a, b, c, a], "M": {f"{a}→{b}": round(mab, 4), f"{b}→{c}": round(mbc, 4), f"{c}→{a}": round(mca, 4)}, "explanations": [expl(a, b), expl(b, c), expl(c, a)]}
            cyc["credibleGate"] = credible_cycle(cyc, cap_domain)
            cycles.append(cyc)

    masked = [e for e in v15_edges if e["relation"] in DIRECTIONAL and not edge_pressure_eligible(e, by_axis)]
    learning = list(v14_rep["coverageLearningCurve"]) + [
        {
            "kVersion": "v1.5",
            "reviewedCells": len(v15_edges),
            "newReviews": n_new,
            "meanCoverage": round(mean_cov, 4),
            "marginalCoveragePerReview": round((mean_cov - v14_cov) / n_new, 5) if n_new else 0,
            "coverageDecomposed": decomp["meanPairFractions"],
            "cycles": len(cycles),
            "credibleCycles": sum(1 for c in cycles if c["credibleGate"]["credible"]),
            "rawTopUnchanged": raw_same,
            "eligibleTopUnchanged": elig_same,
            "spearmanAbsM_eligible_v14_v15": round(rho_e, 4),
            "spearmanAbsM_raw_v14_v15": round(rho_r, 4),
            "spearmanAbsM_v14_raw_vs_eligible": round(rho_mask, 4),
        }
    ]

    k_man = {
        "version": "mechanical-pressure-k-v1.5",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parent": "mechanical-pressure-k-v1.4",
        "status": "REPORT AND WAIT",
        "kind": "precision_coverage_batch",
        "frozenBge": {"checksum": LOCKED_CHECKSUM, "usedAsRelation": False},
        "reviewedTotal": len(v15_edges),
        "reviewedNew": n_new,
        "lanes": {"exposure": LANE_EXPOSURE, "pairwise": LANE_PAIRWISE, "structural": LANE_STRUCTURAL},
        "statusCounts": dict(status_counts),
        "pressureEligibility": {
            "v14EdgesPreserved": True,
            "maskedDirectionalEdges": len(masked),
            "maskedCapabilities": sorted({e["capability"] for e in masked}),
            "note": "Mask applies at pressure time. K history is not rewritten.",
        },
        "ontologyRetrain": False,
        "safety": {"productionFirestoreWrites": "NONE", "openai": "NONE", "hodge": False, "largerCorpus": False, "rpsAuthorized": False},
    }
    (OUTK / "manifest.json").write_text(json.dumps(k_man, indent=2) + "\n", encoding="utf-8")
    (OUTK / "IMMUTABLE.json").write_text(
        json.dumps({"artifactType": "MechanicalPressureK", "version": "mechanical-pressure-k-v1.5", "status": "REVIEWED_BATCH", "parent": "mechanical-pressure-k-v1.4"}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUTP / "pairs.json").write_text(json.dumps(pairs) + "\n", encoding="utf-8")
    (OUTP / "cycles-conservative.json").write_text(json.dumps(cycles[:8], indent=2) + "\n", encoding="utf-8")
    (OUTP / "stability.json").write_text(
        json.dumps(
            {
                "rawTopSame": raw_same,
                "rawTopChanged": raw_chg,
                "eligibleTopSame": elig_same,
                "eligibleTopChanged": elig_chg,
                "eligibleSignFlips": elig_flips,
                "spearman": {"eligible": rho_e, "raw": rho_r, "v14_raw_vs_eligible_mask": rho_mask},
                "marginsEligible": margins,
                "headlineChallenges": challenges[:20],
                "storyPairs": story,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    report = {
        **k_man,
        "coverageLearningCurve": learning,
        "coverageDecomposed": decomp,
        "stability": {
            "rawTopUnchangedFrac": round(raw_same / max(raw_same + raw_chg, 1), 4),
            "eligibleTopUnchangedFrac": round(elig_same / max(elig_same + elig_chg, 1), 4),
            "eligibleTopChanges": [
                {"pair": f"{a}→{b}", "v1.4": idx14[(a, b)]["topEligible"], "v1.5": idx15[(a, b)]["topEligible"]}
                for a in ids
                for b in ids
                if a != b and idx14[(a, b)]["topEligible"] != idx15[(a, b)]["topEligible"]
            ][:12],
            "eligibleSignFlips": len(elig_flips),
            "eligibleSignFlipsMaterialBothGte0.08": sum(1 for f in elig_flips if abs(f["M_v14e"]) >= 0.08 and abs(f["M_v15e"]) >= 0.08),
            "spearmanAbsM_eligible_v14_v15": round(rho_e, 4),
            "spearmanAbsM_raw_v14_v15": round(rho_r, 4),
            "spearmanAbsM_v14_raw_vs_eligible": round(rho_mask, 4),
            "meanAbsDeltaP_eligible": round(float(np.mean(abs_dp)), 4) if abs_dp else 0,
            "marginsEligible": margins,
            "storyPairs": story,
            "headlineChallenge": {
                "formula_H_all": "largest plausible UNKNOWN / (top + 0.02)",
                "formula_H_eligible": "largest UNKNOWN whose capability is pressure-eligible / (top + 0.02)",
                "median_H_all": round(float(np.median(h_all)), 4),
                "median_H_eligible": round(float(np.median(h_el)), 4),
                "n_H_eligible_ge1": sum(1 for h in h_el if h >= 1.0),
                "n_H_eligible_lt0.2": sum(1 for h in h_el if h < 0.2),
                "highestEligible": [r for r in challenges if r["H_eligible"] >= 1.0][:8],
            },
        },
        "cycles": {"n": len(cycles), "credible": sum(1 for c in cycles if c["credibleGate"]["credible"])},
        "batchReviews": [{**r, **(r.get("review") or {})} for r in batch_rows],
        "newOntologyDebt": ontology_notes,
    }
    (MS / "mechanical-pressure-k-v15-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "newEdges": n_new,
                "statusCounts": dict(status_counts),
                "lanes": {ln: [f"{c}→{d}" for (c, d), x in selected if x == ln] for ln in ("exposure", "pairwise", "structural")},
                "curveTail": learning[-2:],
                "decomp": decomp["meanPairFractions"],
                "stability": {
                    "rawTopUnchanged": raw_same,
                    "eligibleTopUnchanged": elig_same,
                    "rhoEligible": round(rho_e, 4),
                    "rhoRaw": round(rho_r, 4),
                    "rhoMaskOnV14": round(rho_mask, 4),
                    "eligFlips": len(elig_flips),
                    "H": report["stability"]["headlineChallenge"],
                    "margins": {k: margins[k] for k in ("quantiles_absM", "stayedNearZero_bothLt0.05", "stayedDirectional_bothGte0.08", "meanAbsDeltaM")},
                },
                "maskedCaps": k_man["pressureEligibility"]["maskedCapabilities"],
                "story": story,
                "cycles": report["cycles"],
                "decisions": [f"{r['capability']}→{r['dependency']} {(r.get('review') or {}).get('relation')} [{r['lane']}] elig={(r.get('review') or {}).get('pressureEligible')}" for r in batch_rows],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

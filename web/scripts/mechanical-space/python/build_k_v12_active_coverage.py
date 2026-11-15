#!/usr/bin/env python3
"""
K v1.2 — Batch 2 active coverage.

Three-lane queue. Same frozen 15 decks / profiles / formulas.
Track coverage, sign stability, top-mechanism stability.
No Hodge. No ontology retrain. No larger corpus.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from itertools import permutations
from pathlib import Path

import numpy as np

import mechanical_k_v1 as kv1
from mechanical_k_v11 import CAP_MECH, OVERRIDES, derive_pressure, relate_v11
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
K11 = MS / "mechanical-pressure-k-v1.1"
PROF = MS / "deck-mechanical-profiles-v1"
OUTK = MS / "mechanical-pressure-k-v1.2"
OUTP = MS / "deck-pressure-v1.2"
LANE_EXPOSURE = 14
LANE_PAIRWISE = 12
LANE_STRUCTURAL = 10
GENERIC_CAPS = {"ADD_MANA", "SEARCH_LIBRARY", "LIFE_GAIN", "CAST_TRIGGER"}


def resolve_cards(raw, row_of, name_of, type_of):
    cards = []
    for entry in raw["mainboard"]:
        oid = entry["oracleId"]
        if oid not in row_of:
            continue
        cards.append(
            {
                "oracleId": oid,
                "name": name_of.get(oid, entry.get("name")),
                "quantity": max(1, int(entry.get("quantity") or 1)),
                "row": row_of[oid],
                "typeLine": type_of[oid],
            }
        )
    cmd_oids = [o for o in raw.get("commanderOracleIds") or [] if o in row_of]
    have = {c["oracleId"] for c in cards}
    for oid in cmd_oids:
        if oid not in have:
            cards.append({"oracleId": oid, "name": name_of[oid], "quantity": 1, "row": row_of[oid], "typeLine": type_of[oid]})
    return cards, cmd_oids


def top_edge(block: dict) -> str | None:
    for t in block.get("attackTerms") or []:
        if t.get("effectiveTerm", 0) >= 0.005:
            return f"{t['capability']} → {t['dependency']}"
    return None


def extract_pair_index(pairs: list) -> dict:
    out = {}
    for p in pairs:
        cons = p["families"]["conservative"]
        out[(p["from"], p["to"])] = {
            "P": cons["supportedAttackPressure"],
            "coverage": cons["coverage"],
            "top": top_edge(cons),
        }
    return out


def credible_cycle(cycle: dict, cap_domain: dict) -> dict:
    legs = cycle["explanations"]
    domains = []
    for e in legs:
        top = (e.get("topAttackTerms") or [{}])[0]
        cap = top.get("edge", "").split(" → ")[0] if top.get("edge") else ""
        domains.append(cap_domain.get(cap, cap or "?"))
    covs = [e.get("coverage", 0) for e in legs]
    ms = list(cycle["M"].values())
    gate = {
        "distinctDomains": len({d for d in domains if d != "?"}) >= 3,
        "domains": domains,
        "minM": round(min(ms), 4),
        "materialAdvantage": min(ms) >= 0.08,
        "minCoverage": round(min(covs), 4),
        "coverageOk": min(covs) >= 0.05,
        "proofsPresent": all(bool(e.get("topAttackTerms")) for e in legs),
    }
    gate["credible"] = bool(
        gate["distinctDomains"] and gate["materialAdvantage"] and gate["coverageOk"] and gate["proofsPresent"]
    )
    return gate


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
        "reviewBucket": f"active_coverage_v1.2_{lane}",
        "relation": decision["relation"],
        "status": decision["status"],
        "conditionality": decision.get("conditionality"),
        "reason": decision.get("reason"),
        "mechanism": decision.get("mechanism"),
        "q_relationConfidence": q,
        "p_mechanicalPressure": p,
        "exposureMass": round(exposure, 4),
        "ontologyNote": decision.get("ontologyNote"),
        "kVersionAdded": "mechanical-pressure-k-v1.2",
    }


def main() -> None:
    OUTK.mkdir(parents=True, exist_ok=True)
    OUTP.mkdir(parents=True, exist_ok=True)
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(K1 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1 must stay frozen")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("profiles must stay frozen")

    k11_edges = load_json(K11 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in k11_edges}
    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    caps = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "capability"]
    deps = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "dependency"]

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
        axes, packages = deck_axes_from_cards(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of)
        decks.append({"id": key["blindId"], "axes": axes, "packages": packages})

    leftover = [(c, d) for c in caps for d in deps if (c, d) not in reviewed]
    E = {cd: 0.0 for cd in leftover}
    pair_expl = {cd: 0.0 for cd in leftover}
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            masses = []
            for c, d in leftover:
                ca, db = a["axes"]["capability"].get(c), b["axes"]["dependency"].get(d)
                if not ca or not db:
                    continue
                m = ca.get("packageInformedProminence", ca["prominence"]) * db["prominence"]
                if m <= 0:
                    continue
                E[(c, d)] += m
                masses.append(((c, d), m))
            masses.sort(key=lambda x: -x[1])
            for cd, m in masses[:8]:
                pair_expl[cd] += m

    # Structural: leftover ONE_CREATURE / COMMANDER probes + cycle-adjacent from v1.1
    v11_cycles = load_json(MS / "deck-pressure-v1.1" / "cycles-conservative.json")
    cycle_ids = set()
    for cyc in v11_cycles:
        for i, x in enumerate(cyc["cycle"][:-1]):
            cycle_ids.add((x, cyc["cycle"][i + 1]))

    structural_score = {cd: 0.0 for cd in leftover}
    for c, d in leftover:
        s = 0.0
        if d == "CARES_ABOUT_ONE_CREATURE":
            s += 8 + E[(c, d)] / 20
        if d == "CARES_ABOUT_COMMANDER" and c in {"COUNTER_SPELL", "DESTROY", "EXILE", "BOUNCE", "TAP", "REMOVAL"}:
            s += 6
        if (c, d) in OVERRIDES:
            s += 4
        if c in {"BOARD_WIPE", "MASS_CREATURE_REMOVAL", "TAP", "DISCARD_CARD"}:
            s += 3
        structural_score[(c, d)] = s + pair_expl[(c, d)] / 40

    by_E = sorted(leftover, key=lambda cd: -E[cd])
    by_pair = sorted(leftover, key=lambda cd: -pair_expl[cd])
    by_struct = sorted(leftover, key=lambda cd: -structural_score[cd])

    selected = []
    seen = set()
    n_generic = defaultdict(int)

    def take(cd, lane, limit_generic=2):
        if cd in seen:
            return False
        c, d = cd
        if c in GENERIC_CAPS and n_generic[c] >= limit_generic and lane == "exposure":
            return False
        seen.add(cd)
        selected.append((cd, lane))
        if c in GENERIC_CAPS:
            n_generic[c] += 1
        return True

    for cd in by_E:
        if sum(1 for _, ln in selected if ln == "exposure") >= LANE_EXPOSURE:
            break
        take(cd, "exposure")
    for cd in by_pair:
        if sum(1 for _, ln in selected if ln == "pairwise") >= LANE_PAIRWISE:
            break
        take(cd, "pairwise", limit_generic=1)
    for cd in by_struct:
        if sum(1 for _, ln in selected if ln == "structural") >= LANE_STRUCTURAL:
            break
        take(cd, "structural", limit_generic=1)

    new_edges = []
    ontology_notes = []
    status_counts = defaultdict(int)
    remains = []
    batch_rows = []
    for (c, d), lane in selected:
        edge = review_cell(c, d, lane, E[(c, d)])
        rec = {"capability": c, "dependency": d, "lane": lane, "exposureMass": round(E[(c, d)], 4), "pairwiseExplMass": round(pair_expl[(c, d)], 4)}
        if not edge:
            status_counts["REMAINS_UNKNOWN"] += 1
            remains.append(rec)
            rec["review"] = {"relation": "UNKNOWN", "status": "UNKNOWN"}
            batch_rows.append(rec)
            continue
        new_edges.append(edge)
        status_counts[edge["status"]] += 1
        rec["review"] = {k: edge[k] for k in ("relation", "status", "conditionality", "reason", "p_mechanicalPressure", "ontologyNote")}
        batch_rows.append(rec)
        if edge.get("ontologyNote"):
            ontology_notes.append({"pair": f"{c} → {d}", "note": edge["ontologyNote"], "debtOnly": True})

    v12_edges = [dict(e) for e in k11_edges] + new_edges
    (OUTK / "batch.json").write_text(json.dumps(batch_rows, indent=2) + "\n", encoding="utf-8")
    (OUTK / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUTK / "edges.json").write_text(json.dumps(v12_edges, indent=2) + "\n", encoding="utf-8")
    prior_notes = load_json(K11 / "ontology-notes.json") if (K11 / "ontology-notes.json").exists() else []
    (OUTK / "ontology-notes.json").write_text(
        json.dumps(
            {
                "frozenProfiles": True,
                "doNotRetrainInThisBatch": True,
                "recordedDebt": [
                    {
                        "axis": "CARES_ABOUT_ONE_CREATURE",
                        "proposedChildren": [
                            "MUST_KEEP_ON_BATTLEFIELD",
                            "MUST_ATTACK",
                            "COMMANDER_DAMAGE_PLAN",
                            "AURA_EQUIPMENT_INVESTMENT",
                        ],
                    }
                ],
                "notes": prior_notes + ontology_notes,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # Pressure rerun
    attack_edges = [e for e in v12_edges if e["relation"] in {"ATTACKS", "DISRUPTS", "CONDITIONAL"}]
    enable_edges = [e for e in v12_edges if e["relation"] in {"ENABLES", "BENEFITS"}]
    damper_by_cap = {e["capability"]: e for e in v12_edges if e["relation"] == "MITIGATED_BY"}
    reviewed_now = {(e["capability"], e["target"]) for e in v12_edges}
    unknown_candidates = [(c, d) for c in caps for d in deps if (c, d) not in reviewed_now]
    FAMILIES = ("presence", "prominence", "conservative")

    def directed(a, b):
        return {
            "from": a["id"],
            "to": b["id"],
            "families": {
                fam: pressure_pair(
                    a["axes"], b["axes"], attack_edges, enable_edges, damper_by_cap, fam, unknown_candidates, coverage_edges=v12_edges
                )
                for fam in FAMILIES
            },
        }

    pairs = [directed(a, b) for a in decks for b in decks if a["id"] != b["id"]]
    by_dir = {(p["from"], p["to"]): p for p in pairs}
    idx12 = extract_pair_index(pairs)
    idx1 = extract_pair_index(load_json(MS / "deck-pressure-v1" / "pairs.json"))
    idx11 = extract_pair_index(load_json(MS / "deck-pressure-v1.1" / "pairs.json"))

    def M(idx, a, b):
        return idx[(a, b)]["P"] - idx[(b, a)]["P"]

    sign_flip_11_12 = []
    sign_flip_1_12 = []
    top_change_11_12 = 0
    top_same_11_12 = 0
    abs_dp = []
    story_rows = []
    ids = [d["id"] for d in decks]
    for a in ids:
        for b in ids:
            if a == b:
                continue
            s11 = 1 if M(idx11, a, b) > 1e-9 else (-1 if M(idx11, a, b) < -1e-9 else 0)
            s12 = 1 if M(idx12, a, b) > 1e-9 else (-1 if M(idx12, a, b) < -1e-9 else 0)
            s1 = 1 if M(idx1, a, b) > 1e-9 else (-1 if M(idx1, a, b) < -1e-9 else 0)
            if s11 != 0 and s12 != 0 and s11 != s12:
                sign_flip_11_12.append({"pair": f"{a}→{b}", "M_v11": round(M(idx11, a, b), 4), "M_v12": round(M(idx12, a, b), 4)})
            if s1 != 0 and s12 != 0 and s1 != s12:
                sign_flip_1_12.append(f"{a}→{b}")
            if idx11[(a, b)]["top"] == idx12[(a, b)]["top"]:
                top_same_11_12 += 1
            else:
                top_change_11_12 += 1
            abs_dp.append(abs(idx12[(a, b)]["P"] - idx11[(a, b)]["P"]))
            if (a, b) in {("D04", "D03"), ("D03", "D04"), ("D14", "D07"), ("D07", "D14"), ("D03", "D07")}:
                story_rows.append(
                    {
                        "pair": f"{a}→{b}",
                        "P": {"v1": idx1[(a, b)]["P"], "v1.1": idx11[(a, b)]["P"], "v1.2": idx12[(a, b)]["P"]},
                        "M": {"v1": round(M(idx1, a, b), 4), "v1.1": round(M(idx11, a, b), 4), "v1.2": round(M(idx12, a, b), 4)},
                        "top": {"v1": idx1[(a, b)]["top"], "v1.1": idx11[(a, b)]["top"], "v1.2": idx12[(a, b)]["top"]},
                        "signStable_v11_v12": s11 == s12,
                    }
                )

    mean_cov = float(np.mean([p["families"]["conservative"]["coverage"] for p in pairs]))
    v11_rep = load_json(MS / "mechanical-pressure-k-v11-report.json")
    v11_cov = v11_rep["coverageLearningCurve"][-1]["meanCoverage"]
    n_new = len(new_edges)
    marginal = (mean_cov - v11_cov) / n_new if n_new else 0

    anti = {(p["from"], p["to"]): p["families"]["conservative"]["supportedAttackPressure"] - by_dir[(p["to"], p["from"])]["families"]["conservative"]["supportedAttackPressure"] for p in pairs}
    cap_domain = {k: v["domain"] for k, v in CAP_MECH.items()}
    cycles = []
    seen_c = set()
    eps = 0.02
    for a, b, c in permutations(ids, 3):
        key = tuple(sorted([(a, b), (b, c), (c, a)]))
        if key in seen_c:
            continue
        mab, mbc, mca = anti[(a, b)], anti[(b, c)], anti[(c, a)]
        if mab > eps and mbc > eps and mca > eps:
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
    cycles.sort(key=lambda x: -x["credibleGate"]["minM"])

    learning = list(v11_rep["coverageLearningCurve"]) + [
        {
            "kVersion": "v1.2",
            "reviewedCells": len(v12_edges),
            "newReviews": n_new,
            "meanCoverage": round(mean_cov, 4),
            "marginalCoveragePerReview": round(marginal, 5),
            "cycles": len(cycles),
            "credibleCycles": sum(1 for c in cycles if c["credibleGate"]["credible"]),
            "signFlips_v11_to_v12": len(sign_flip_11_12),
            "topMechanismUnchanged_v11_to_v12": top_same_11_12,
            "topMechanismChanged_v11_to_v12": top_change_11_12,
            "meanAbsDeltaP_v11_to_v12": round(float(np.mean(abs_dp)), 4),
        }
    ]

    k_man = {
        "version": "mechanical-pressure-k-v1.2",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parent": "mechanical-pressure-k-v1.1",
        "status": "REPORT AND WAIT",
        "frozenBge": {"checksum": LOCKED_CHECKSUM, "usedAsRelation": False},
        "reviewedTotal": len(v12_edges),
        "reviewedNew": n_new,
        "lanes": {"exposure": LANE_EXPOSURE, "pairwise": LANE_PAIRWISE, "structural": LANE_STRUCTURAL},
        "statusCounts": dict(status_counts),
        "ontologyRetrain": False,
        "safety": {"productionFirestoreWrites": "NONE", "openai": "NONE", "hodge": False, "largerCorpus": False},
    }
    (OUTK / "manifest.json").write_text(json.dumps(k_man, indent=2) + "\n", encoding="utf-8")
    (OUTK / "IMMUTABLE.json").write_text(
        json.dumps({"artifactType": "MechanicalPressureK", "version": "mechanical-pressure-k-v1.2", "status": "REVIEWED_BATCH", "parent": "mechanical-pressure-k-v1.1", "parentFrozen": True}, indent=2) + "\n",
        encoding="utf-8",
    )
    K11.joinpath("IMMUTABLE.json").write_text(
        json.dumps({"artifactType": "MechanicalPressureK", "version": "mechanical-pressure-k-v1.1", "status": "FROZEN", "parent": "mechanical-pressure-k-v1", "parentFrozen": True}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUTP / "pairs.json").write_text(json.dumps(pairs) + "\n", encoding="utf-8")
    (OUTP / "cycles-conservative.json").write_text(json.dumps(cycles[:12], indent=2) + "\n", encoding="utf-8")
    (OUTP / "stability.json").write_text(
        json.dumps(
            {
                "signFlips_v11_v12": sign_flip_11_12,
                "nSignFlips_v1_v12": len(set(sign_flip_1_12)),
                "topMechanismSame_v11_v12": top_same_11_12,
                "topMechanismChanged_v11_v12": top_change_11_12,
                "meanAbsDeltaP": round(float(np.mean(abs_dp)), 4),
                "storyPairs": story_rows,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    report = {
        **k_man,
        "coverageLearningCurve": learning,
        "stability": {
            "signFlips_v11_to_v12": len(sign_flip_11_12),
            "signFlipPairs": sign_flip_11_12[:12],
            "topMechanismUnchangedFrac": round(top_same_11_12 / max(top_same_11_12 + top_change_11_12, 1), 4),
            "meanAbsDeltaP": round(float(np.mean(abs_dp)), 4),
            "storyPairs": story_rows,
            "note": "Sign flips mean that pair is not mature. Top-mechanism persistence while coverage rises is the desired pattern.",
        },
        "cycles": {"n": len(cycles), "credible": sum(1 for c in cycles if c["credibleGate"]["credible"]), "inspected": cycles[:4]},
        "batchReviews": [{**r, **(r.get("review") or {})} for r in batch_rows],
        "newOntologyDebt": ontology_notes,
        "note": "NEUTRAL reviews are coverage. CONDITIONAL is not a stereotype attack. Profiles stay frozen.",
    }
    (MS / "mechanical-pressure-k-v12-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "newEdges": n_new,
                "statusCounts": dict(status_counts),
                "lanes": {ln: [f"{c}→{d}" for (c, d), x in selected if x == ln] for ln in ("exposure", "pairwise", "structural")},
                "curve": learning,
                "stability": report["stability"] | {"signFlipPairs": sign_flip_11_12[:8]},
                "credibleCycles": report["cycles"]["credible"],
                "nCycles": len(cycles),
                "decisions": [f"{r['capability']}→{r['dependency']} {(r.get('review') or {}).get('relation')} [{r['lane']}]" for r in batch_rows],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

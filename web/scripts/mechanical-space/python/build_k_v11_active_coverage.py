#!/usr/bin/env python3
"""
K v1.1 — active coverage expansion.

Rank UNKNOWN cells by exposure mass on the frozen 15-deck corpus.
Review a diverse high-mass batch mechanically. Rerun the same 210 pairs.
No cosine relations. No Hodge. No larger corpus.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

import mechanical_k_v1 as kv1
from mechanical_k_v11 import CAP_MECH, OVERRIDES, _domain_rel, derive_pressure, relate_v11
from mechanical_deck_pressure_v1 import pressure_pair
from mechanical_deck_profile_v1 import deck_axes_from_cards
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

# Expand v1 engine cards so generic domain matching works for new capabilities.
kv1.CAP_MECH.update(CAP_MECH)

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v21"
RC8 = MS / "semantic-oracle-snapshot-v1"
K1 = MS / "mechanical-pressure-k-v1"
PROF = MS / "deck-mechanical-profiles-v1"
OUTK = MS / "mechanical-pressure-k-v1.1"
OUTP = MS / "deck-pressure-v1.1"
BATCH = 36
MAX_PER_CAP = 3
MAX_PER_DEP = 4


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


def family_of(axis_id: str, by_axis: dict) -> str:
    return (by_axis.get(axis_id) or {}).get("family") or axis_id.split("_")[0]


def credible_cycle(cycle: dict, cap_domain: dict) -> dict:
    legs = cycle["explanations"]
    domains = []
    for e in legs:
        top = (e.get("topAttackTerms") or [{}])[0]
        cap = top.get("edge", "").split(" → ")[0] if top.get("edge") else ""
        domains.append(cap_domain.get(cap, cap or "?"))
    covs = [e.get("coverage", 0) for e in legs]
    ms = list(cycle["M"].values())
    return {
        "distinctDomains": len(set(d for d in domains if d != "?")) >= 3,
        "domains": domains,
        "minM": round(min(ms), 4),
        "materialAdvantage": min(ms) >= 0.08,
        "minCoverage": round(min(covs), 4),
        "coverageOk": min(covs) >= 0.05,
        "proofsPresent": all(bool(e.get("topAttackTerms")) for e in legs),
        "credible": False,
    }


def main() -> None:
    OUTK.mkdir(parents=True, exist_ok=True)
    OUTP.mkdir(parents=True, exist_ok=True)
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(K1 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1 must stay frozen")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("profiles must stay frozen")

    k1_edges = load_json(K1 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in k1_edges}
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

    # Exposure: E_cd = sum_{A≠B} C_A,c * D_B,d   (package-informed prominence)
    E = {(c, d): 0.0 for c in caps for d in deps if (c, d) not in reviewed}
    pair_hits = {(c, d): 0 for c, d in E}
    dominate = {(c, d): 0 for c, d in E}
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            masses = []
            for c, d in E:
                ca = a["axes"]["capability"].get(c)
                db = b["axes"]["dependency"].get(d)
                if not ca or not db:
                    continue
                m = ca.get("packageInformedProminence", ca["prominence"]) * db["prominence"]
                if m <= 0:
                    continue
                E[(c, d)] += m
                if m >= 0.25:
                    pair_hits[(c, d)] += 1
                masses.append(((c, d), m))
            masses.sort(key=lambda x: -x[1])
            for cd, _ in masses[:5]:
                dominate[cd] += 1

    cycle_pairs = {("D10", "D14"), ("D14", "D15"), ("D15", "D10")}
    on_cycle = {(c, d): 0 for c, d in E}
    id_of = {d["id"]: d for d in decks}
    for frm, to in cycle_pairs:
        a, b = id_of[frm], id_of[to]
        for c, d in E:
            ca, db = a["axes"]["capability"].get(c), b["axes"]["dependency"].get(d)
            if ca and db and ca["prominence"] * db["prominence"] >= 0.35:
                on_cycle[(c, d)] += 1

    ranked = []
    for (c, d), mass in E.items():
        ac = by_axis.get(c) or {}
        ad = by_axis.get(d) or {}
        hn = ((ac.get("hardNegative") or {}).get("auroc"), (ad.get("hardNegative") or {}).get("auroc"))
        ranked.append(
            {
                "capability": c,
                "dependency": d,
                "exposureMass": round(mass, 4),
                "pairsAbove025": pair_hits[(c, d)],
                "top5UnknownHits": dominate[(c, d)],
                "onCandidateCycle": on_cycle[(c, d)],
                "capClass": ac.get("directionClass"),
                "depClass": ad.get("directionClass"),
                "capFamily": family_of(c, by_axis),
                "depFamily": family_of(d, by_axis),
                "axisHN": hn,
            }
        )
    ranked.sort(key=lambda r: (-r["exposureMass"], -r["pairsAbove025"], -r["top5UnknownHits"]))

    GENERIC_CAPS = {"ADD_MANA", "SEARCH_LIBRARY", "LIFE_GAIN", "CAST_TRIGGER"}
    FORCE = [k for k in OVERRIDES if k in E]

    def take(row, n_cap, n_dep, n_generic, generic_limit=2):
        if n_cap[row["capability"]] >= MAX_PER_CAP:
            return False
        if n_dep[row["dependency"]] >= MAX_PER_DEP:
            return False
        if row["capability"] in GENERIC_CAPS and n_generic[row["capability"]] >= generic_limit:
            return False
        return True

    batch, seen_cd = [], set()
    n_cap, n_dep, n_generic = defaultdict(int), defaultdict(int), defaultdict(int)

    def add_row(row):
        cd = (row["capability"], row["dependency"])
        if cd in seen_cd:
            return
        batch.append(row)
        seen_cd.add(cd)
        n_cap[row["capability"]] += 1
        n_dep[row["dependency"]] += 1
        if row["capability"] in GENERIC_CAPS:
            n_generic[row["capability"]] += 1

    by_cd = {(r["capability"], r["dependency"]): r for r in ranked}
    for cd in FORCE:
        if cd in by_cd:
            add_row(by_cd[cd])
    for row in ranked:
        if len(batch) >= 16:
            break
        if take(row, n_cap, n_dep, n_generic, generic_limit=2):
            add_row(row)
    related = []
    for row in ranked:
        if (row["capability"], row["dependency"]) in seen_cd:
            continue
        cap = CAP_MECH.get(row["capability"])
        dep = kv1.DEP_MECH.get(row["dependency"])
        if not cap or not dep:
            continue
        rel = _domain_rel(cap["domain"], dep["domain"])
        if rel != "unrelated" or (row["capability"], row["dependency"]) in OVERRIDES:
            related.append(row)
    related.sort(key=lambda r: -r["exposureMass"])
    for row in related:
        if len(batch) >= BATCH:
            break
        if take(row, n_cap, n_dep, n_generic, generic_limit=1):
            add_row(row)
    for row in ranked:
        if len(batch) >= BATCH:
            break
        if take(row, n_cap, n_dep, n_generic, generic_limit=1):
            add_row(row)

    # Review the batch. Remain UNKNOWN if still no mechanism card / engine refuses.
    new_edges = []
    ontology_notes = []
    status_counts = defaultdict(int)
    for row in batch:
        c, d = row["capability"], row["dependency"]
        decision = relate_v11(c, d)
        if decision.get("relation") == "UNKNOWN":
            status_counts["REMAINS_UNKNOWN"] += 1
            row["review"] = {"relation": "UNKNOWN", "status": "UNKNOWN", "reason": decision.get("reason")}
            continue
        p = derive_pressure(decision)
        q = 0.72 if decision["relation"] == "CONDITIONAL" else 0.82
        if decision["status"] == "SUPPORTED_NEUTRAL":
            q = 0.8
        edge = {
            "capability": c,
            "target": d,
            "targetKind": "dependency",
            "reviewBucket": "active_coverage_v1.1",
            "relation": decision["relation"],
            "status": decision["status"],
            "conditionality": decision.get("conditionality"),
            "reason": decision.get("reason"),
            "mechanism": decision.get("mechanism"),
            "q_relationConfidence": q,
            "p_mechanicalPressure": p,
            "exposureMass": row["exposureMass"],
            "ontologyNote": decision.get("ontologyNote"),
            "kVersionAdded": "mechanical-pressure-k-v1.1",
        }
        new_edges.append(edge)
        status_counts[decision["status"]] += 1
        row["review"] = {k: edge[k] for k in ("relation", "status", "conditionality", "reason", "p_mechanicalPressure", "ontologyNote")}
        if decision.get("ontologyNote"):
            ontology_notes.append({"pair": f"{c} → {d}", "note": decision["ontologyNote"]})

    # Carry v1 edges unchanged; append v1.1 reviews.
    v11_edges = []
    for e in k1_edges:
        ee = dict(e)
        ee["kVersionAdded"] = "mechanical-pressure-k-v1"
        v11_edges.append(ee)
    v11_edges.extend(new_edges)

    (OUTK / "exposure-ranked.json").write_text(json.dumps(ranked[:200], indent=2) + "\n", encoding="utf-8")
    (OUTK / "batch.json").write_text(json.dumps(batch, indent=2) + "\n", encoding="utf-8")
    (OUTK / "edges.json").write_text(json.dumps(v11_edges, indent=2) + "\n", encoding="utf-8")
    (OUTK / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUTK / "ontology-notes.json").write_text(json.dumps(ontology_notes, indent=2) + "\n", encoding="utf-8")
    (OUTK / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "MechanicalPressureK",
                "version": "mechanical-pressure-k-v1.1",
                "status": "REVIEWED_BATCH",
                "parent": "mechanical-pressure-k-v1",
                "parentFrozen": True,
                "policy": {
                    "densify": False,
                    "useBgeCosineAsRelation": False,
                    "unknownIsZero": False,
                    "reviewMethod": "exposure-ranked mechanical teachers",
                },
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # Rerun 210 pairs on K v1.1
    attack_edges = [e for e in v11_edges if e["relation"] in {"ATTACKS", "DISRUPTS", "CONDITIONAL"}]
    enable_edges = [e for e in v11_edges if e["relation"] in {"ENABLES", "BENEFITS"}]
    damper_by_cap = {e["capability"]: e for e in v11_edges if e["relation"] == "MITIGATED_BY"}
    reviewed_now = {(e["capability"], e["target"]) for e in v11_edges}
    unknown_candidates = [(c, d) for c in caps for d in deps if (c, d) not in reviewed_now]
    FAMILIES = ("presence", "prominence", "conservative")

    def directed(a, b):
        return {
            "from": a["id"],
            "to": b["id"],
            "families": {
                fam: pressure_pair(
                    a["axes"],
                    b["axes"],
                    attack_edges,
                    enable_edges,
                    damper_by_cap,
                    fam,
                    unknown_candidates,
                    coverage_edges=v11_edges,
                )
                for fam in FAMILIES
            },
        }

    pairs = [directed(a, b) for a in decks for b in decks if a["id"] != b["id"]]
    by_dir = {(p["from"], p["to"]): p for p in pairs}
    anti = {}
    for p in pairs:
        pa = p["families"]["conservative"]["supportedAttackPressure"]
        pb = by_dir[(p["to"], p["from"])]["families"]["conservative"]["supportedAttackPressure"]
        anti[(p["from"], p["to"])] = round(pa - pb, 4)

    from itertools import permutations

    def explain(p):
        block = p["families"]["conservative"]
        return {
            "from": p["from"],
            "to": p["to"],
            "supportedAttackPressure": block["supportedAttackPressure"],
            "coverage": block["coverage"],
            "topAttackTerms": [
                {"edge": f"{t['capability']} → {t['dependency']}", "relation": t["relation"], "effective": t["effectiveTerm"]}
                for t in block["attackTerms"][:4]
                if t["effectiveTerm"] >= 0.005
            ],
        }

    cap_domain = {k: v["domain"] for k, v in CAP_MECH.items()}
    cycles = []
    seen = set()
    ids = [d["id"] for d in decks]
    eps = 0.02
    for a, b, c in permutations(ids, 3):
        key = tuple(sorted([(a, b), (b, c), (c, a)]))
        if key in seen:
            continue
        mab, mbc, mca = anti[(a, b)], anti[(b, c)], anti[(c, a)]
        if mab > eps and mbc > eps and mca > eps:
            seen.add(key)
            cyc = {
                "cycle": [a, b, c, a],
                "M": {f"{a}→{b}": mab, f"{b}→{c}": mbc, f"{c}→{a}": mca},
                "explanations": [explain(by_dir[(a, b)]), explain(by_dir[(b, c)]), explain(by_dir[(c, a)])],
            }
            gate = credible_cycle(cyc, cap_domain)
            gate["credible"] = bool(gate["distinctDomains"] and gate["materialAdvantage"] and gate["coverageOk"] and gate["proofsPresent"])
            cyc["credibleGate"] = gate
            cycles.append(cyc)
    cycles.sort(key=lambda x: (-x["credibleGate"]["distinctDomains"], -x["credibleGate"]["minM"]))

    v1_rep = load_json(MS / "deck-pressure-v1-report.json")
    mean_cov = float(np.mean([p["families"]["conservative"]["coverage"] for p in pairs]))
    v1_unknown = [(c, d) for c in caps for d in deps if (c, d) not in reviewed]
    v1_covs = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            v1_covs.append(
                pressure_pair(
                    a["axes"],
                    b["axes"],
                    [e for e in k1_edges if e["relation"] in {"ATTACKS", "DISRUPTS"}],
                    [e for e in k1_edges if e["relation"] == "ENABLES"],
                    {e["capability"]: e for e in k1_edges if e["relation"] == "MITIGATED_BY"},
                    "conservative",
                    v1_unknown,
                    coverage_edges=k1_edges,
                )["coverage"]
            )
    v1_mean_cov = float(np.mean(v1_covs)) if v1_covs else 0
    learning = [
        {"kVersion": "v1", "reviewedCells": 36, "meanCoverage": round(v1_mean_cov, 4), "meanCoverageOldAttackOnly": v1_rep["coverageSummary"]["conservative"]["mean"], "cycles": v1_rep["conservativeCycleCount"], "credibleCycles": 0},
        {
            "kVersion": "v1.1",
            "reviewedCells": len(v11_edges),
            "newReviews": len(new_edges),
            "batchConsidered": len(batch),
            "remainedUnknown": status_counts["REMAINS_UNKNOWN"],
            "meanCoverage": round(mean_cov, 4),
            "cycles": len(cycles),
            "credibleCycles": sum(1 for c in cycles if c["credibleGate"]["credible"]),
            "distinctMechanismCycles": sum(1 for c in cycles if c["credibleGate"]["distinctDomains"]),
        },
    ]

    v1_cycles = {tuple(c["cycle"]) for c in v1_rep.get("candidateCyclesConservative") or []}
    v11_cycles = {tuple(c["cycle"]) for c in cycles}
    stability = {
        "v1CyclesStillPresent": [list(c) for c in v1_cycles & v11_cycles],
        "v1CyclesGone": [list(c) for c in v1_cycles - v11_cycles],
        "newCycles": [list(c) for c in v11_cycles - v1_cycles][:12],
        "note": "A real RPS structure should survive K expansion. Disappearing triangles were coverage artifacts.",
    }

    k_man = {
        "version": "mechanical-pressure-k-v1.1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parent": "mechanical-pressure-k-v1",
        "status": "REPORT AND WAIT",
        "frozenBge": {"checksum": LOCKED_CHECKSUM, "usedAsRelation": False},
        "reviewedTotal": len(v11_edges),
        "reviewedV1": 36,
        "reviewedNew": len(new_edges),
        "batchSize": len(batch),
        "statusCounts": dict(status_counts),
        "unknownStill": 67 * 20 - len({(e["capability"], e["target"]) for e in v11_edges if e.get("targetKind") == "dependency"}),
        "ontologyNotes": ontology_notes,
        "safety": {"productionFirestoreWrites": "NONE", "openai": "NONE", "reembed": False, "hodge": False, "largerCorpus": False},
    }
    (OUTK / "manifest.json").write_text(json.dumps(k_man, indent=2) + "\n", encoding="utf-8")
    (OUTP / "pairs.json").write_text(json.dumps(pairs) + "\n", encoding="utf-8")
    (OUTP / "cycles-conservative.json").write_text(json.dumps(cycles[:15], indent=2) + "\n", encoding="utf-8")
    report = {
        **k_man,
        "coverageLearningCurve": learning,
        "cycleStability": stability,
        "topExposureUnknownRemaining": [r for r in ranked if not r.get("review") or r["review"].get("status") == "UNKNOWN"][:15],
        "batchReviews": [{"capability": r["capability"], "dependency": r["dependency"], "exposureMass": r["exposureMass"], **(r.get("review") or {})} for r in batch],
        "credibleCycles": [c for c in cycles if c["credibleGate"]["credible"]],
        "inspectedCycles": cycles[:6],
        "note": "Do not treat coverage as a power ranking. CONDITIONAL edges are weak by design. Ontology notes are corrections backward, not new trained axes.",
    }
    (MS / "mechanical-pressure-k-v11-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUTP / "manifest.json").write_text(
        json.dumps(
            {
                "version": "deck-pressure-v1.1",
                "k": "mechanical-pressure-k-v1.1",
                "directedPairs": len(pairs),
                "meanCoverageConservative": round(mean_cov, 4),
                "cycles": len(cycles),
                "credibleCycles": learning[1]["credibleCycles"],
                "deckRankingProduced": False,
                "hodge": False,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "topExposure": [f"{r['capability']}→{r['dependency']} E={r['exposureMass']}" for r in ranked[:12]],
                "batch": len(batch),
                "newEdges": len(new_edges),
                "statusCounts": dict(status_counts),
                "curve": learning,
                "stability": {k: (len(v) if isinstance(v, list) else v) for k, v in stability.items()},
                "ontologyNotes": ontology_notes,
                "batchDecisions": [f"{r['capability']}→{r['dependency']} {(r.get('review') or {}).get('relation')}" for r in batch],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

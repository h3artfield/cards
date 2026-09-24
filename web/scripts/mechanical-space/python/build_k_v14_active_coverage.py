#!/usr/bin/env python3
"""
K v1.4 — Batch 4 active coverage.

Tilt: exposure 10 / pairwise 16 / structural 10.
Decompose coverage. Headline-challenge UNKNOWN mass.
Spearman |M| shape stability. No Hodge. No ontology retrain.
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
from build_k_v13_active_coverage import (
    INSPECT_EPS,
    M,
    credible_cycle,
    extract_pair_index,
    margin_report,
    resolve_cards,
    top_edge,
)
from mechanical_k_v11 import CAP_MECH, DEP_MECH, OVERRIDES, _domain_rel, derive_pressure, relate_v11
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
K13 = MS / "mechanical-pressure-k-v1.3"
PROF = MS / "deck-mechanical-profiles-v1"
OUTK = MS / "mechanical-pressure-k-v1.4"
OUTP = MS / "deck-pressure-v1.4"
LANE_EXPOSURE = 10
LANE_PAIRWISE = 16
LANE_STRUCTURAL = 10
GENERIC_CAPS = {"ADD_MANA", "SEARCH_LIBRARY", "LIFE_GAIN", "CAST_TRIGGER"}
PLAUSIBLE_OPS = {"deny", "prevent_resolution", "destroy", "exile", "restrict", "disable", "wipe", "discard", "prevent", "force_sacrifice", "damage", "bounce", "tax", "drain"}


def plausible(c: str, d: str) -> bool:
    """Could this UNKNOWN become an attack/disrupt that rewrites a headline?"""
    if (c, d) in OVERRIDES:
        return OVERRIDES[(c, d)]["relation"] in {"ATTACKS", "DISRUPTS", "CONDITIONAL"}
    cap, dep = CAP_MECH.get(c), DEP_MECH.get(d)
    if not cap or not dep:
        return False
    if cap.get("operation") not in PLAUSIBLE_OPS:
        return False
    rel = _domain_rel(cap["domain"], dep["domain"])
    return rel not in {"unrelated", "unrelated_unless_commander_damage"}


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
        "reviewBucket": f"active_coverage_v1.4_{lane}",
        "relation": decision["relation"],
        "status": decision["status"],
        "conditionality": decision.get("conditionality"),
        "reason": decision.get("reason"),
        "mechanism": decision.get("mechanism"),
        "q_relationConfidence": q,
        "p_mechanicalPressure": p,
        "exposureMass": round(exposure, 4),
        "ontologyNote": decision.get("ontologyNote"),
        "kVersionAdded": "mechanical-pressure-k-v1.4",
    }


def status_of(edge: dict) -> str:
    rel = edge.get("relation")
    if rel in {"ATTACKS", "DISRUPTS"}:
        return "active"
    if rel in {"ENABLES", "BENEFITS"}:
        return "enable"
    if rel == "CONDITIONAL":
        return "conditional"
    if rel == "NEUTRAL":
        return "neutral"
    if rel == "MITIGATED_BY":
        return "damper"
    return "other"


def coverage_decomp(decks, edges: list[dict], leftover: list[tuple[str, str]]) -> dict:
    by_pair = {(e["capability"], e["target"]): status_of(e) for e in edges}
    totals = defaultdict(float)
    by_dep = {d: defaultdict(float) for _, d in leftover}
    for e in edges:
        by_dep.setdefault(e["target"], defaultdict(float))
    pair_fracs = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            bucket = defaultdict(float)
            for c, rec in a["axes"]["capability"].items():
                cp = rec.get("packageInformedProminence", rec["prominence"])
                if cp < 0.15:
                    continue
                for d, drec in b["axes"]["dependency"].items():
                    dp = drec["prominence"]
                    if dp < 0.15:
                        continue
                    m = cp * dp
                    st = by_pair.get((c, d), "unknown")
                    bucket[st] += m
                    totals[st] += m
                    by_dep.setdefault(d, defaultdict(float))[st] += m
            s = sum(bucket.values()) or 1.0
            pair_fracs.append({k: bucket[k] / s for k in ("active", "enable", "conditional", "neutral", "unknown")})
    mean = {k: round(float(np.mean([p.get(k, 0) for p in pair_fracs])), 4) for k in ("active", "enable", "conditional", "neutral", "unknown")}
    mean["reviewed"] = round(1.0 - mean["unknown"], 4)
    dep_rows = []
    for d, bkt in by_dep.items():
        tot = sum(bkt.values())
        if tot < 1:
            continue
        dep_rows.append(
            {
                "dependency": d,
                "reviewed": round(1 - bkt.get("unknown", 0) / tot, 4),
                "active": round(bkt.get("active", 0) / tot, 4),
                "enable": round(bkt.get("enable", 0) / tot, 4),
                "conditional": round(bkt.get("conditional", 0) / tot, 4),
                "neutral": round(bkt.get("neutral", 0) / tot, 4),
                "unknown": round(bkt.get("unknown", 0) / tot, 4),
            }
        )
    dep_rows.sort(key=lambda r: -r["reviewed"])
    return {"meanPairFractions": mean, "byDependency": dep_rows, "note": "Mass is C×D prominence, not win rate. Neutral is known zero."}


def axis_mass(a, b, c: str | None, d: str | None) -> float:
    if not c or not d:
        return 0.0
    ca, db = a["axes"]["capability"].get(c), b["axes"]["dependency"].get(d)
    if not ca or not db:
        return 0.0
    return float(ca.get("packageInformedProminence", ca["prominence"]) * db["prominence"])


def parse_top(label: str | None) -> tuple[str | None, str | None]:
    if not label or " → " not in label:
        return None, None
    c, d = label.split(" → ", 1)
    return c, d


def spearman_rho(x, y) -> float:
    rx = np.argsort(np.argsort(np.asarray(x, dtype=float)))
    ry = np.argsort(np.argsort(np.asarray(y, dtype=float)))
    if rx.std() == 0 or ry.std() == 0:
        return 0.0
    return float(np.corrcoef(rx, ry)[0, 1])


def headline_challenges(decks, leftover, idx) -> list[dict]:
    rows = []
    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            top_c, top_d = parse_top(idx[(a["id"], b["id"])]["top"])
            top_m = axis_mass(a, b, top_c, top_d)
            cands = []
            for c, d in leftover:
                if not plausible(c, d):
                    continue
                m = axis_mass(a, b, c, d)
                if m >= 0.10:
                    cands.append((m, c, d))
            cands.sort(reverse=True)
            top_u = cands[0] if cands else (0.0, None, None)
            rows.append(
                {
                    "from": a["id"],
                    "to": b["id"],
                    "topReviewed": idx[(a["id"], b["id"])]["top"],
                    "topReviewedMass": round(top_m, 4),
                    "topReviewedP": idx[(a["id"], b["id"])]["P"],
                    "largestUnresolvedPlausible": {"capability": top_u[1], "dependency": top_u[2], "mass": round(top_u[0], 4)} if top_u[1] else None,
                    "H": round(top_u[0] / (top_m + 0.02), 4),
                }
            )
    rows.sort(key=lambda r: -r["H"])
    return rows


def main() -> None:
    OUTK.mkdir(parents=True, exist_ok=True)
    OUTP.mkdir(parents=True, exist_ok=True)
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(K1 / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("K v1 must stay frozen")
    if load_json(PROF / "IMMUTABLE.json").get("status") != "FROZEN":
        raise SystemExit("profiles must stay frozen")

    k13_edges = load_json(K13 / "edges.json")
    reviewed = {(e["capability"], e["target"]) for e in k13_edges}
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
        axes, _ = deck_axes_from_cards(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of)
        decks.append({"id": key["blindId"], "axes": axes})

    leftover = [(c, d) for c in caps for d in deps if (c, d) not in reviewed and c in CAP_MECH and d in DEP_MECH]
    E = {cd: 0.0 for cd in leftover}
    pair_expl = {cd: 0.0 for cd in leftover}
    challenge_score = {cd: 0.0 for cd in leftover}
    idx13 = extract_pair_index(load_json(MS / "deck-pressure-v1.3" / "pairs.json"))

    for a in decks:
        for b in decks:
            if a["id"] == b["id"]:
                continue
            masses = []
            plaus = []
            for c, d in leftover:
                ca, db = a["axes"]["capability"].get(c), b["axes"]["dependency"].get(d)
                if not ca or not db:
                    continue
                m = ca.get("packageInformedProminence", ca["prominence"]) * db["prominence"]
                if m <= 0:
                    continue
                E[(c, d)] += m
                masses.append(((c, d), m))
                if plausible(c, d) and m >= 0.10:
                    plaus.append((m, c, d))
            masses.sort(key=lambda x: -x[1])
            for cd, m in masses[:8]:
                pair_expl[cd] += m
            if plaus:
                plaus.sort(reverse=True)
                top_c, top_d = parse_top(idx13[(a["id"], b["id"])]["top"])
                top_m = axis_mass(a, b, top_c, top_d)
                for rank, (m, c0, d0) in enumerate(plaus[:3]):
                    challenge_score[(c0, d0)] += (m / (top_m + 0.02)) / (rank + 1)

    structural_score = {cd: 0.0 for cd in leftover}
    for c, d in leftover:
        s = 0.0
        if d == "CARES_ABOUT_ONE_CREATURE":
            s += 6
        if d in {"CARES_ABOUT_GRAVEYARD", "CARES_ABOUT_LANDS_ENTERING", "CARES_ABOUT_CASTING_SPELLS"} and plausible(c, d):
            s += 4
        if (c, d) in OVERRIDES:
            s += 5
        structural_score[(c, d)] = s + challenge_score[(c, d)]

    selected, seen, n_generic = [], set(), defaultdict(int)

    def take(cd, lane):
        if cd in seen:
            return False
        c, _ = cd
        if lane == "exposure" and c in GENERIC_CAPS and n_generic[c] >= 2:
            return False
        seen.add(cd)
        selected.append((cd, lane))
        if c in GENERIC_CAPS:
            n_generic[c] += 1
        return True

    for cd in sorted(leftover, key=lambda x: -E[x]):
        if sum(1 for _, ln in selected if ln == "exposure") >= LANE_EXPOSURE:
            break
        take(cd, "exposure")
    for cd in sorted(leftover, key=lambda x: (-challenge_score[x], -pair_expl[x])):
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
            preview.append(
                {
                    "lane": lane,
                    "cell": f"{c} → {d}",
                    "exposure": round(E[(c, d)], 4),
                    "challengeScore": round(challenge_score[(c, d)], 4),
                    "engineGuess": dec.get("relation"),
                    "engineStatus": dec.get("status"),
                    "reason": dec.get("reason"),
                    "hasOverride": (c, d) in OVERRIDES,
                }
            )
        print(json.dumps({"selected": len(preview), "queue": preview}, indent=2))
        return

    new_edges, ontology_notes, status_counts, batch_rows = [], [], defaultdict(int), []
    for (c, d), lane in selected:
        edge = review_cell(c, d, lane, E[(c, d)])
        rec = {"capability": c, "dependency": d, "lane": lane, "exposureMass": round(E[(c, d)], 4), "challengeScore": round(challenge_score[(c, d)], 4)}
        if not edge:
            status_counts["REMAINS_UNKNOWN"] += 1
            rec["review"] = {"relation": "UNKNOWN", "status": "UNKNOWN"}
            batch_rows.append(rec)
            continue
        new_edges.append(edge)
        status_counts[edge["status"]] += 1
        rec["review"] = {k: edge[k] for k in ("relation", "status", "conditionality", "reason", "p_mechanicalPressure", "ontologyNote")}
        batch_rows.append(rec)
        if edge.get("ontologyNote"):
            ontology_notes.append({"pair": f"{c} → {d}", "note": edge["ontologyNote"], "debtOnly": True})

    v14_edges = [dict(e) for e in k13_edges] + new_edges
    (OUTK / "batch.json").write_text(json.dumps(batch_rows, indent=2) + "\n", encoding="utf-8")
    (OUTK / "new-edges.json").write_text(json.dumps(new_edges, indent=2) + "\n", encoding="utf-8")
    (OUTK / "edges.json").write_text(json.dumps(v14_edges, indent=2) + "\n", encoding="utf-8")

    reviewed_set = {(e["capability"], e["target"]) for e in v14_edges}
    leftover_after_all = [(c, d) for c in caps for d in deps if (c, d) not in reviewed_set]
    leftover_after = [(c, d) for c, d in leftover_after_all if c in CAP_MECH and d in DEP_MECH]
    attack_edges = [e for e in v14_edges if e["relation"] in {"ATTACKS", "DISRUPTS", "CONDITIONAL"}]
    enable_edges = [e for e in v14_edges if e["relation"] in {"ENABLES", "BENEFITS"}]
    damper_by_cap = {e["capability"]: e for e in v14_edges if e["relation"] == "MITIGATED_BY"}
    unknown_candidates = leftover_after_all

    def directed(a, b):
        return {
            "from": a["id"],
            "to": b["id"],
            "families": {
                fam: pressure_pair(a["axes"], b["axes"], attack_edges, enable_edges, damper_by_cap, fam, unknown_candidates, coverage_edges=v14_edges)
                for fam in ("presence", "prominence", "conservative")
            },
        }

    pairs = [directed(a, b) for a in decks for b in decks if a["id"] != b["id"]]
    by_dir = {(p["from"], p["to"]): p for p in pairs}
    idx14 = extract_pair_index(pairs)
    idx1 = extract_pair_index(load_json(MS / "deck-pressure-v1" / "pairs.json"))
    idx11 = extract_pair_index(load_json(MS / "deck-pressure-v1.1" / "pairs.json"))
    idx12 = extract_pair_index(load_json(MS / "deck-pressure-v1.2" / "pairs.json"))
    ids = [d["id"] for d in decks]

    sign_flips, top_same, top_change, abs_dp, story = [], 0, 0, [], []
    for a in ids:
        for b in ids:
            if a == b:
                continue
            s13 = 1 if M(idx13, a, b) > 1e-9 else (-1 if M(idx13, a, b) < -1e-9 else 0)
            s14 = 1 if M(idx14, a, b) > 1e-9 else (-1 if M(idx14, a, b) < -1e-9 else 0)
            if s13 and s14 and s13 != s14:
                sign_flips.append({"pair": f"{a}→{b}", "M_v13": round(M(idx13, a, b), 4), "M_v14": round(M(idx14, a, b), 4), "nearZero": abs(M(idx13, a, b)) < 0.05 or abs(M(idx14, a, b)) < 0.05})
            if idx13[(a, b)]["top"] == idx14[(a, b)]["top"]:
                top_same += 1
            else:
                top_change += 1
            abs_dp.append(abs(idx14[(a, b)]["P"] - idx13[(a, b)]["P"]))
            if (a, b) in {("D04", "D03"), ("D03", "D04"), ("D14", "D07"), ("D07", "D14"), ("D03", "D07")}:
                story.append(
                    {
                        "pair": f"{a}→{b}",
                        "P": {"v1": idx1[(a, b)]["P"], "v1.1": idx11[(a, b)]["P"], "v1.2": idx12[(a, b)]["P"], "v1.3": idx13[(a, b)]["P"], "v1.4": idx14[(a, b)]["P"]},
                        "M": {"v1": round(M(idx1, a, b), 4), "v1.1": round(M(idx11, a, b), 4), "v1.2": round(M(idx12, a, b), 4), "v1.3": round(M(idx13, a, b), 4), "v1.4": round(M(idx14, a, b), 4)},
                        "top": {"v1": idx1[(a, b)]["top"], "v1.1": idx11[(a, b)]["top"], "v1.2": idx12[(a, b)]["top"], "v1.3": idx13[(a, b)]["top"], "v1.4": idx14[(a, b)]["top"]},
                    }
                )

    top_changes = []
    for a in ids:
        for b in ids:
            if a == b:
                continue
            if idx13[(a, b)]["top"] != idx14[(a, b)]["top"]:
                top_changes.append({"pair": f"{a}→{b}", "v1.3": idx13[(a, b)]["top"], "v1.4": idx14[(a, b)]["top"]})

    # Spearman of unordered |M|
    abs13, abs14 = [], []
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            abs13.append(abs(M(idx13, a, b)))
            abs14.append(abs(M(idx14, a, b)))
    rho = spearman_rho(abs13, abs14)
    margins = margin_report(idx13, idx14, ids)
    challenges = headline_challenges(decks, leftover_after, idx14)
    h_vals = [r["H"] for r in challenges]
    challenged = [r for r in challenges if r["H"] >= 1.0][:12]
    story_ids = {("D04", "D03"), ("D03", "D04"), ("D14", "D07"), ("D07", "D14"), ("D03", "D07")}
    story_h = [r for r in challenges if (r["from"], r["to"]) in story_ids]
    for s in story:
        fr, to = s["pair"].split("→")
        match = next((r for r in story_h if r["from"] == fr and r["to"] == to), None)
        if match:
            s["headlineChallenge"] = {
                "H": match["H"],
                "topReviewedMass": match["topReviewedMass"],
                "largestUnresolvedPlausible": match["largestUnresolvedPlausible"],
            }
    n_both_near = sum(1 for f in sign_flips if abs(f["M_v13"]) < 0.05 and abs(f["M_v14"]) < 0.05)
    n_material = sum(1 for f in sign_flips if abs(f["M_v13"]) >= 0.08 and abs(f["M_v14"]) >= 0.08)

    decomp = coverage_decomp(decks, v14_edges, leftover_after)
    mean_cov = float(np.mean([p["families"]["conservative"]["coverage"] for p in pairs]))
    v13_rep = load_json(MS / "mechanical-pressure-k-v13-report.json")
    v13_cov = v13_rep["coverageLearningCurve"][-1]["meanCoverage"]
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

    learning = list(v13_rep["coverageLearningCurve"]) + [
        {
            "kVersion": "v1.4",
            "reviewedCells": len(v14_edges),
            "newReviews": n_new,
            "meanCoverage": round(mean_cov, 4),
            "marginalCoveragePerReview": round((mean_cov - v13_cov) / n_new, 5) if n_new else 0,
            "coverageDecomposed": decomp["meanPairFractions"],
            "cycles": len(cycles),
            "credibleCycles": sum(1 for c in cycles if c["credibleGate"]["credible"]),
            "signFlips_v13_to_v14": len(sign_flips),
            "topMechanismUnchanged": top_same,
            "topMechanismChanged": top_change,
            "meanAbsDeltaP_v13_to_v14": round(float(np.mean(abs_dp)), 4) if abs_dp else 0,
            "spearmanAbsM_v13_v14": round(float(rho), 4),
            "headlineChallenge": {
                "medianH": round(float(np.median(h_vals)), 4),
                "nHge1.0": sum(1 for h in h_vals if h >= 1.0),
                "nHlt0.2": sum(1 for h in h_vals if h < 0.2),
                "nHge0.4": sum(1 for h in h_vals if h >= 0.4),
            },
            "signFlipsBothNearZero": n_both_near,
            "signFlipsMaterialBothGte0.08": n_material,
        }
    ]

    k_man = {
        "version": "mechanical-pressure-k-v1.4",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parent": "mechanical-pressure-k-v1.3",
        "status": "REPORT AND WAIT",
        "frozenBge": {"checksum": LOCKED_CHECKSUM, "usedAsRelation": False},
        "reviewedTotal": len(v14_edges),
        "reviewedNew": n_new,
        "lanes": {"exposure": LANE_EXPOSURE, "pairwise": LANE_PAIRWISE, "structural": LANE_STRUCTURAL},
        "statusCounts": dict(status_counts),
        "ontologyRetrain": False,
        "safety": {"productionFirestoreWrites": "NONE", "openai": "NONE", "hodge": False, "largerCorpus": False, "rpsAuthorized": False},
    }
    (OUTK / "manifest.json").write_text(json.dumps(k_man, indent=2) + "\n", encoding="utf-8")
    (OUTK / "IMMUTABLE.json").write_text(json.dumps({"artifactType": "MechanicalPressureK", "version": "mechanical-pressure-k-v1.4", "status": "REVIEWED_BATCH", "parent": "mechanical-pressure-k-v1.3"}, indent=2) + "\n", encoding="utf-8")
    (K13 / "IMMUTABLE.json").write_text(json.dumps({"artifactType": "MechanicalPressureK", "version": "mechanical-pressure-k-v1.3", "status": "FROZEN", "parent": "mechanical-pressure-k-v1.2", "parentFrozen": True}, indent=2) + "\n", encoding="utf-8")
    (OUTP / "pairs.json").write_text(json.dumps(pairs) + "\n", encoding="utf-8")
    (OUTP / "cycles-conservative.json").write_text(json.dumps(cycles[:8], indent=2) + "\n", encoding="utf-8")
    (OUTP / "stability.json").write_text(
        json.dumps(
            {
                "signFlips": sign_flips,
                "topSame": top_same,
                "topChanged": top_change,
                "topChanges": top_changes,
                "spearmanAbsM": {"rho": float(rho), "method": "rank-Pearson (not canonized)"},
                "margins": margins,
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
            "signFlips": len(sign_flips),
            "signFlipPairs": sign_flips,
            "topMechanismUnchangedFrac": round(top_same / max(top_same + top_change, 1), 4),
            "spearmanAbsM_v13_v14": round(float(rho), 4),
            "margins": margins,
            "storyPairs": story,
            "headlineChallenge": {
                "formula": "H = largest_plausible_UNKNOWN_C×D_prominence / (top_reviewed_C×D_prominence + 0.02)  — not canonized",
                "medianH": round(float(np.median(h_vals)), 4),
                "nHlt0.2": sum(1 for h in h_vals if h < 0.2),
                "nHge0.4": sum(1 for h in h_vals if h >= 0.4),
                "nHge1.0": sum(1 for h in h_vals if h >= 1.0),
                "highest": challenged,
                "storyPairs": story_h,
            },
            "topMechanismChanges": top_changes,
            "signFlipSplit": {"n": len(sign_flips), "bothNearZero": n_both_near, "materialBothGte0.08": n_material},
        },
        "cycles": {"n": len(cycles), "credible": sum(1 for c in cycles if c["credibleGate"]["credible"])},
        "batchReviews": [{**r, **(r.get("review") or {})} for r in batch_rows],
        "newOntologyDebt": ontology_notes,
    }
    (MS / "mechanical-pressure-k-v14-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "newEdges": n_new,
                "statusCounts": dict(status_counts),
                "lanes": {ln: [f"{c}→{d}" for (c, d), x in selected if x == ln] for ln in ("exposure", "pairwise", "structural")},
                "curveTail": learning[-2:],
                "decomp": decomp["meanPairFractions"],
                "depCoverageTop": decomp["byDependency"][:8],
                "depCoverageLow": sorted(decomp["byDependency"], key=lambda r: r["reviewed"])[:6],
                "stability": {
                    "signFlips": len(sign_flips),
                    "signFlipSplit": {"bothNearZero": n_both_near, "materialBothGte0.08": n_material},
                    "topUnchanged": top_same,
                    "topChanges": top_changes,
                    "rho": round(float(rho), 4),
                    "H": learning[-1]["headlineChallenge"],
                    "margins": {k: margins[k] for k in ("quantiles_absM", "stayedNearZero_bothLt0.05", "stayedDirectional_bothGte0.08", "meanAbsDeltaM")},
                },
                "story": story,
                "challenges": challenged[:6],
                "cycles": report["cycles"],
                "decisions": [f"{r['capability']}→{r['dependency']} {(r.get('review') or {}).get('relation')} [{r['lane']}]" for r in batch_rows],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

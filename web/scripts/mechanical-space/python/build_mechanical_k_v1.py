#!/usr/bin/env python3
"""
K v1 — sparse mechanical pressure graph.

No dense bilinear model. No BGE cosine as relation. No hand-written 0.8 weights.
Unreviewed cells are UNKNOWN. No deck profiles. No RPS.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import numpy as np

from mechanical_k_v1 import (
    CAP_MECH,
    DEP_MECH,
    RES_MECH,
    REVIEW_ATTACK_OR_SPECIAL,
    REVIEW_BENEFIT,
    REVIEW_HARD_NEG,
    REVIEW_RESILIENCE,
    derive_pressure,
    relate,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v21"
RC8 = MS / "semantic-oracle-snapshot-v1"
OUT = MS / "mechanical-pressure-k-v1"


def axis_reliability(row: dict) -> float:
    hn = (row.get("hardNegative") or {}).get("auroc")
    cls = row.get("directionClass")
    mmap = (row.get("holdout") or {}).get("mAP") or 0
    if cls == "PURE" and hn is not None:
        return float(0.45 + 0.55 * hn)
    if cls == "PURE":
        return float(0.55 + 0.3 * min(mmap, 1))
    if cls == "BROAD_FAMILY":
        return 0.55
    if cls == "UNDERDEFINED":
        return 0.28
    return 0.4


def occupancy(texts: list[str], hints: tuple[str, ...]) -> float:
    if not texts or not hints:
        return 0.0
    regs = [re.compile(h, re.I) for h in hints]
    hits = sum(1 for t in texts if any(r.search(t or "") for r in regs))
    return hits / len(texts)


def exemplars(ids: list[str], scores: np.ndarray, names: dict, texts: dict, k: int = 8) -> list[dict]:
    if not len(ids):
        return []
    order = np.argsort(-scores)
    out = []
    for i in order[:k]:
        oid = ids[i] if False else None
    # scores aligned to full corpus rows
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    neu_man = load_json(NEU / "manifest.json")
    assert_frozen_bge(neu_man)
    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    caps = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "capability"]
    deps = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "dependency"]
    ress = [c for c in concept_ids if by_axis.get(c, {}).get("kind") == "resilience"]

    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    weights = np.fromfile(DIR / "directions.f32", dtype=np.float32).reshape(len(concept_ids), 1024)
    # L2 for control cosine only
    wn = weights / np.clip(np.linalg.norm(weights, axis=1, keepdims=True), 1e-8, None)
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    names = {r["oracleId"]: r.get("name", r["oracleId"]) for r in rc8_idx}
    texts = {r["oracleId"]: r.get("oracleText") or "" for r in rc8_idx}
    oracle_ids = [""] * len(rc8_idx)
    for r in rc8_idx:
        oracle_ids[int(r["i"])] = r["oracleId"]

    cid = {c: i for i, c in enumerate(concept_ids)}

    def top_cards(axis: str, k: int = 10) -> list[dict]:
        if axis not in cid:
            return []
        col = scores[:, cid[axis]]
        order = np.argsort(-col)[:k]
        return [
            {"name": names[oracle_ids[i]], "oracleId": oracle_ids[i], "score": float(col[i]), "oracleText": (texts[oracle_ids[i]] or "")[:180]}
            for i in order
        ]

    def top_texts(axis: str, k: int = 30) -> list[str]:
        if axis not in cid:
            return []
        col = scores[:, cid[axis]]
        return [texts[oracle_ids[i]] or "" for i in np.argsort(-col)[:k]]

    reviewed = []
    review_sets = [
        ("candidate", REVIEW_ATTACK_OR_SPECIAL + REVIEW_BENEFIT + REVIEW_RESILIENCE),
        ("hard_negative", REVIEW_HARD_NEG),
    ]
    for bucket, pairs in review_sets:
        for a, b in pairs:
            decision = relate(a, b)
            p = derive_pressure(decision)
            a_c = axis_reliability(by_axis[a]) if a in by_axis else 0.2
            a_d = axis_reliability(by_axis[b]) if b in by_axis else 0.2
            cap_m = CAP_MECH.get(a, {})
            other_m = DEP_MECH.get(b) or RES_MECH.get(b) or CAP_MECH.get(b) or {}
            pop_c = occupancy(top_texts(a), tuple(cap_m.get("textHints") or ()))
            pop_d = occupancy(top_texts(b), tuple(other_m.get("textHints") or ()))
            pop_agree = float(min(pop_c, pop_d)) if decision["relation"] not in {"NEUTRAL", "UNKNOWN"} else float(1 - max(pop_c, pop_d) * 0.0)
            # teacher agreement: ontology decision vs population actually talking about the claimed domains
            if decision["relation"] in {"ATTACKS", "DISRUPTS", "ENABLES", "MITIGATED_BY"}:
                pop_support = 0.5 * pop_c + 0.5 * pop_d
            else:
                pop_support = 1.0 - 0.5 * min(pop_c, pop_d)
            q = float(np.clip(0.35 * (1 if decision["relation"] != "UNKNOWN" else 0) + 0.4 * pop_support + 0.25 * (a_c * a_d) ** 0.5, 0, 1))
            bge = None
            if a in cid and b in cid:
                bge = float(wn[cid[a]] @ wn[cid[b]])
            aggs = None
            if p is not None:
                aggs = {
                    "p_times_q": round(abs(p) * q * (1 if p >= 0 else -1), 4),
                    "p_times_q_times_sqrt_axes": round(p * q * (a_c * a_d) ** 0.5, 4),
                    "p_times_q_times_min_axis": round(p * q * min(a_c, a_d), 4),
                    "canonicalization": "NONE — components kept separate; these are comparison-only",
                }
            expected_hn = bucket == "hard_negative"
            reviewed.append(
                {
                    "capability": a,
                    "target": b,
                    "targetKind": by_axis.get(b, {}).get("kind"),
                    "reviewBucket": bucket,
                    "relation": decision.get("relation"),
                    "status": decision.get("status", "UNKNOWN"),
                    "conditionality": decision.get("conditionality"),
                    "reason": decision.get("reason"),
                    "mechanism": decision.get("mechanism"),
                    "q_relationConfidence": round(q, 4),
                    "p_mechanicalPressure": p,
                    "a_capabilityReliability": round(a_c, 4),
                    "a_targetReliability": round(a_d, 4),
                    "populationEvidence": {
                        "capabilityHintOccupancy@30": round(pop_c, 4),
                        "targetHintOccupancy@30": round(pop_d, 4),
                        "populationSupport": round(pop_support, 4),
                    },
                    "bgeDirectionCosineCONTROL": bge,
                    "aggregationComparisons": aggs,
                    "expectedHardNegative": expected_hn,
                    "topCapabilityExemplars": top_cards(a, 6),
                    "topTargetExemplars": top_cards(b, 6),
                }
            )

    # Relation-level ranking: |p|*q should rank true attacks/benefits above hard-negs
    def score_edge(e):
        if e["p_mechanicalPressure"] is None:
            return 0.0
        return abs(e["p_mechanicalPressure"]) * e["q_relationConfidence"]

    pos = [e for e in reviewed if e["reviewBucket"] == "candidate" and e["relation"] in {"ATTACKS", "DISRUPTS", "ENABLES", "MITIGATED_BY"}]
    hn = [e for e in reviewed if e["expectedHardNegative"]]
    y = np.array([1] * len(pos) + [0] * len(hn))
    s = np.array([score_edge(e) for e in pos] + [score_edge(e) for e in hn])
    rel_auroc = None
    if len(pos) and len(hn) and len(set(y.tolist())) == 2:
        from sklearn.metrics import roc_auc_score

        rel_auroc = float(roc_auc_score(y, s))

    # Control: BGE cosine should NOT separate attacks from hard-negs as cleanly
    bge_pos = [e["bgeDirectionCosineCONTROL"] for e in pos if e["bgeDirectionCosineCONTROL"] is not None]
    bge_hn = [e["bgeDirectionCosineCONTROL"] for e in hn if e["bgeDirectionCosineCONTROL"] is not None]
    bge_auroc = None
    if bge_pos and bge_hn:
        from sklearn.metrics import roc_auc_score

        bge_auroc = float(
            roc_auc_score(
                [1] * len(bge_pos) + [0] * len(bge_hn),
                bge_pos + bge_hn,
            )
        )

    status_counts = {}
    for e in reviewed:
        status_counts[e["status"]] = status_counts.get(e["status"], 0) + 1
    possible = len(caps) * len(deps)
    unknown_cells = possible - sum(1 for e in reviewed if e["targetKind"] == "dependency")

    (OUT / "edges.jsonl").write_text("".join(json.dumps(e) + "\n" for e in reviewed), encoding="utf-8")
    (OUT / "edges.json").write_text(json.dumps(reviewed, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "version": "mechanical-pressure-k-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT AND WAIT",
        "frozenBge": {"checksum": neu_man["checksum"], "usedAsRelation": False},
        "matrix": {
            "capabilityAxesEligible": len(caps),
            "dependencyAxesEligible": len(deps),
            "resilienceAxesEligible": len(ress),
            "possibleCapabilityDependencyCells": possible,
            "reviewed": len(reviewed),
            "unknownCells": unknown_cells,
            "unknownMeansUnknown": True,
            "zeroIsNotDefault": True,
        },
        "statusCounts": status_counts,
        "relationEval": {
            "candidateSupported": len(pos),
            "hardNegatives": len(hn),
            "pressureTimesConfidenceAUROC": rel_auroc,
            "bgeCosineControlAUROC": bge_auroc,
            "note": "BGE cosine is a control. It must not be used as K. Opposing graveyard axes can be semantically close.",
        },
        "aggregationPolicy": "q, p, and axis reliabilities are stored separately. No formula is canonized.",
        "safety": {
            "productionFirestoreWrites": "NONE",
            "openai": "NONE",
            "reembed": False,
            "deckModeling": False,
            "rpsAuthorized": False,
            "denseBilinear": False,
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    # Compact report + every nonzero/reviewed edge audit
    (MS / "mechanical-pressure-k-v1-report.json").write_text(
        json.dumps(
            {
                **manifest,
                "edges": [
                    {
                        k: e[k]
                        for k in (
                            "capability",
                            "target",
                            "targetKind",
                            "reviewBucket",
                            "relation",
                            "status",
                            "conditionality",
                            "reason",
                            "q_relationConfidence",
                            "p_mechanicalPressure",
                            "a_capabilityReliability",
                            "a_targetReliability",
                            "populationEvidence",
                            "bgeDirectionCosineCONTROL",
                            "aggregationComparisons",
                            "expectedHardNegative",
                        )
                    }
                    | {
                        "topCapabilityExemplars": [x["name"] for x in e["topCapabilityExemplars"][:4]],
                        "topTargetExemplars": [x["name"] for x in e["topTargetExemplars"][:4]],
                    }
                    for e in reviewed
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "reviewed": len(reviewed),
                "statusCounts": status_counts,
                "possibleCells": possible,
                "unknownCells": unknown_cells,
                "relationAUROC": rel_auroc,
                "bgeControlAUROC": bge_auroc,
                "attacks": [f"{e['capability']}→{e['target']} p={e['p_mechanicalPressure']} q={e['q_relationConfidence']}" for e in reviewed if e["relation"] == "ATTACKS"],
                "disrupts": [f"{e['capability']}→{e['target']} p={e['p_mechanicalPressure']}" for e in reviewed if e["relation"] == "DISRUPTS"],
                "enables": [f"{e['capability']}→{e['target']}" for e in reviewed if e["relation"] == "ENABLES"],
                "mitigated": [f"{e['capability']}→{e['target']}" for e in reviewed if e["relation"] == "MITIGATED_BY"],
                "neutral": [f"{e['capability']}→{e['target']}" for e in reviewed if e["relation"] == "NEUTRAL"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

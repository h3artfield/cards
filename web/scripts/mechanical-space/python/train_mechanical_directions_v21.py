#!/usr/bin/env python3
"""
Mechanical Ontology v2.1 — fill missing capability/dependency/resilience sides.

Linear directions on frozen BGE. No K matrix. No RPS. No re-embed. No OpenAI.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from mechanical_ontology_v21 import (
    BY_ID,
    COMPILED,
    CONCEPTS,
    K_CANDIDATE_PAIRS,
    STRATEGIC_MIN_SUPPORT,
    lexical_buckets,
    map_oracle_hard_negatives,
    map_oracle_text,
    map_rc8_row,
    map_spellbook_feature,
)
from mechanical_ontology_v2 import is_token_card as _is_token_card
from train_experiments import gpu_report, load_json, set_seeds
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge, assign_split, ranking_metrics

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
RC8 = MS / "semantic-oracle-snapshot-v1"
SB = MS / "spellbook-reference-normalization-v1"
IDMAP = MS / "oracle-identity-mapping-v1"
OUT = MS / "mechanical-directions-v21"
SEED = 42
MIN_SUPPORT = 20
MIN_HN = 8
EPOCHS = 50
BATCH = 512


def classify_direction(row: dict) -> str:
    """Precision is judged by hard-negative and lexical gaps, not PU mAP alone."""
    hn = row.get("hardNegative") or {}
    lex = row.get("lexicalAudit") or {}
    mmap = row["holdout"].get("mAP", 0)
    hn_auc = hn.get("auroc")
    lex_gap = lex.get("primaryGap")
    if lex.get("contaminated"):
        return "LEXICALLY_CONTAMINATED"
    if lex.get("polarityConflated"):
        return "POLARITY_CONFLATED"
    if hn_auc is not None and hn_auc >= 0.75:
        return "PURE"
    if row.get("role") == "broad" and mmap >= 0.40:
        return "BROAD_FAMILY"
    if hn_auc is not None and hn_auc < 0.62 and mmap >= 0.40:
        return "BROAD_FAMILY"
    if lex_gap is not None and lex_gap < 0.08 and mmap >= 0.35 and row.get("role") == "precise":
        return "BROAD_FAMILY"
    if mmap >= 0.45:
        return "PURE"
    return "UNDERDEFINED"


def auroc(y: np.ndarray, s: np.ndarray) -> float | None:
    from sklearn.metrics import roc_auc_score

    if y.min() == y.max() or len(np.unique(y)) < 2:
        return None
    try:
        return float(roc_auc_score(y, s))
    except Exception:
        return None


def main() -> None:
    set_seeds(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    neu_man = load_json(NEU / "manifest.json")
    assert_frozen_bge(neu_man)
    rc8_man = load_json(RC8 / "manifest.json")

    neu = np.fromfile(NEU / "vectors.f32", dtype=np.float32).reshape(int(neu_man["vectorCount"]), 1024)
    rc8 = np.fromfile(RC8 / "vectors.f32", dtype=np.float32).reshape(int(rc8_man["vectorCount"]), 117)
    neu_idx = [json.loads(l) for l in (NEU / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    neu_by = {r["oracleId"]: int(r["i"]) for r in neu_idx}
    rc8_by = {r["oracleId"]: int(r["i"]) for r in rc8_idx}
    names = {r["oracleId"]: r.get("name", r["oracleId"]) for r in rc8_idx}
    texts = {r["oracleId"]: r.get("oracleText") or "" for r in rc8_idx}
    types = {r["oracleId"]: r.get("typeLine") or "" for r in rc8_idx}

    n = len(rc8_idx)
    X = np.zeros((n, 1024), dtype=np.float32)
    oracle_ids = [""] * n
    for r in rc8_idx:
        i = int(r["i"])
        oracle_ids[i] = r["oracleId"]
        X[i] = neu[neu_by[r["oracleId"]]]

    concept_ids = [c["id"] for c in CONCEPTS]
    cid = {c: i for i, c in enumerate(concept_ids)}
    Y = np.zeros((n, len(concept_ids)), dtype=np.int8)  # +1 pos, -1 HN, 0 unknown

    # Teachers → positives
    cards = load_json(SB / "cards-slim.json")
    mapped_ext = {}
    if (IDMAP / "mappings.jsonl").exists():
        for line in (IDMAP / "mappings.jsonl").read_text(encoding="utf-8").splitlines():
            if not line:
                continue
            row = json.loads(line)
            if row.get("oracleId") and row.get("classification") == "EXACT_ID":
                mapped_ext[str(row.get("externalId"))] = row["oracleId"]
    for card in cards:
        oid = card.get("oracleId") if card.get("oracleId") in rc8_by else mapped_ext.get(str(card.get("id")))
        if not oid or oid not in rc8_by:
            continue
        row = rc8_by[oid]
        for f in card.get("features") or []:
            for hid in map_spellbook_feature(f.get("featureName") or ""):
                Y[row, cid[hid]] = 1
    for i in range(n):
        for hid in map_rc8_row(rc8[i]):
            Y[i, cid[hid]] = 1
        for hid in map_oracle_text(texts[oracle_ids[i]]):
            Y[i, cid[hid]] = 1
        if _is_token_card(types[oracle_ids[i]], names[oracle_ids[i]]):
            Y[i, cid["IS_A_TOKEN"]] = 1

    # Hard negatives: explicit oracle, then siblings (never override a positive)
    for i in range(n):
        text = texts[oracle_ids[i]]
        for hid in map_oracle_hard_negatives(text):
            if Y[i, cid[hid]] == 0:
                Y[i, cid[hid]] = -1
        if Y[i, cid["IS_A_TOKEN"]] == 1 and Y[i, cid["CREATE_TOKEN"]] != 1:
            Y[i, cid["CREATE_TOKEN"]] = -1

    for c in COMPILED:
        j = cid[c["id"]]
        for sib in c["hn_siblings"]:
            if sib not in cid:
                continue
            sj = cid[sib]
            mask = (Y[:, sj] == 1) & (Y[:, j] == 0)
            Y[mask, j] = -1

    supports = (Y == 1).sum(axis=0)
    hn_counts = (Y == -1).sum(axis=0)
    keep = []
    dropped = []
    for j, s in enumerate(supports):
        hid = concept_ids[j]
        need = 15 if hid in STRATEGIC_MIN_SUPPORT else MIN_SUPPORT
        if s >= need:
            keep.append(j)
        else:
            dropped.append({"id": hid, "support": int(s), "minRequired": need})
    # Always keep IS_A_TOKEN if present for audit even if we don't advertise it
    concept_ids = [concept_ids[j] for j in keep]
    Y = Y[:, keep]
    cid = {c: i for i, c in enumerate(concept_ids)}

    splits = {"train": [], "validation": [], "holdout": []}
    split_of = {}
    for oid in oracle_ids:
        sp = assign_split(oid)
        splits[sp].append(oid)
        split_of[oid] = sp
    tr = np.array([rc8_by[i] for i in splits["train"]])
    ho = np.array([rc8_by[i] for i in splits["holdout"]])

    import torch
    import torch.nn as nn

    device = "cuda" if torch.cuda.is_available() else "cpu"
    F = Y.shape[1]
    model = nn.Linear(1024, F).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    Xt = torch.tensor(X[tr], dtype=torch.float32, device=device)
    Yt = torch.tensor(Y[tr], dtype=torch.int8, device=device)
    used_pu = []
    t0 = time.time()
    for _ in range(EPOCHS):
        perm = torch.randperm(Xt.shape[0], device=device)
        for start in range(0, Xt.shape[0], BATCH):
            ix = perm[start : start + BATCH]
            logits = model(Xt[ix])
            yb = Yt[ix]
            loss = torch.zeros((), device=device)
            for j in range(F):
                col = yb[:, j]
                pos = col == 1
                hn = col == -1
                if pos.sum() == 0:
                    continue
                if hn.sum() >= 1:
                    idx = pos | hn
                    target = (col[idx] == 1).float()
                    loss = loss + nn.functional.binary_cross_entropy_with_logits(logits[idx, j], target)
                else:
                    # PU fallback: unlabeled as background, not trusted negatives
                    target = (col == 1).float()
                    pw = float(max((col != 1).sum().item(), 1) / max(pos.sum().item(), 1))
                    pw = min(pw, 40.0)
                    loss = loss + nn.functional.binary_cross_entropy_with_logits(
                        logits[:, j], target, pos_weight=torch.tensor(pw, device=device)
                    )
            opt.zero_grad()
            (loss / max(F, 1)).backward()
            opt.step()
    train_s = time.time() - t0

    with torch.no_grad():
        scores = torch.sigmoid(model(torch.tensor(X, dtype=torch.float32, device=device))).cpu().numpy().astype(np.float32)
        weights = model.weight.detach().cpu().numpy().astype(np.float32)
        bias = model.bias.detach().cpu().numpy().astype(np.float32)

    scores.tofile(OUT / "scores.f32")
    weights.tofile(OUT / "directions.f32")
    bias.tofile(OUT / "bias.f32")

    # Signed axes from pole scores
    signed = {}
    if "COST_REDUCTION" in cid and "COST_INCREASE" in cid:
        signed["SIGNED_COST_MODIFICATION"] = scores[:, cid["COST_REDUCTION"]] - scores[:, cid["COST_INCREASE"]]
    if "RECURSION" in cid and "GRAVEYARD_DENIAL" in cid:
        signed["SIGNED_GRAVEYARD_RELATION"] = scores[:, cid["RECURSION"]] - scores[:, cid["GRAVEYARD_DENIAL"]]
    if "CREATE_TOKEN" in cid and "BOARD_WIPE" in cid:
        signed["SIGNED_BOARD_RELATION"] = scores[:, cid["CREATE_TOKEN"]] - scores[:, cid["BOARD_WIPE"]]
    if signed:
        np.stack(list(signed.values()), axis=1).astype(np.float32).tofile(OUT / "signed-scores.f32")

    per = []
    audit_rows = []
    for j, hid in enumerate(concept_ids):
        meta = BY_ID[hid]
        yho = Y[ho, j]
        sho = scores[ho, j]
        pos_vs_unl = ranking_metrics((yho == 1).astype(np.int32), sho)
        hn_ho = (yho == -1)
        pos_ho = (yho == 1)
        hn_report = {"nHardNegHoldout": int(hn_ho.sum()), "nPosHoldout": int(pos_ho.sum())}
        if hn_ho.sum() >= 3 and pos_ho.sum() >= 3:
            pair_y = np.concatenate([np.ones(int(pos_ho.sum())), np.zeros(int(hn_ho.sum()))])
            pair_s = np.concatenate([sho[pos_ho], sho[hn_ho]])
            hn_report["auroc"] = auroc(pair_y, pair_s)
            hn_report["meanPos"] = float(sho[pos_ho].mean())
            hn_report["meanHardNeg"] = float(sho[hn_ho].mean())
            hn_report["margin"] = hn_report["meanPos"] - hn_report["meanHardNeg"]
            # pairwise P(pos > hn)
            hn_report["pairwiseWin"] = float((sho[pos_ho][:, None] > sho[hn_ho][None, :]).mean())
        # lexical
        lex_scores = defaultdict(list)
        for i, oid in enumerate(oracle_ids):
            buckets = lexical_buckets(hid, texts[oid], types[oid], names[oid])
            for b in buckets:
                lex_scores[b].append(float(scores[i, j]))
        lex = {"buckets": {k: {"n": len(v), "meanScore": float(np.mean(v))} for k, v in lex_scores.items()}}
        keys = list(lex_scores)
        if keys:
            primary = next((k for k in keys if k.startswith("A_")), keys[0])
            others = [k for k in keys if k != primary]
            if others:
                lex["primaryGap"] = lex["buckets"][primary]["meanScore"] - max(lex["buckets"][k]["meanScore"] for k in others)
            lex["contaminated"] = bool(
                hid == "CREATE_TOKEN"
                and "B_is_a_token" in lex["buckets"]
                and lex["buckets"]["B_is_a_token"]["meanScore"] >= lex["buckets"].get("A_creates_token", {}).get("meanScore", 0) - 0.05
            )
            if hid in ("COST_REDUCTION", "COST_MODIFICATION") and "A_reduction" in lex["buckets"] and "B_increase" in lex["buckets"]:
                lex["polarityConflated"] = lex["buckets"]["B_increase"]["meanScore"] > lex["buckets"]["A_reduction"]["meanScore"] - 0.05
        # neighborhood-resistant
        tr_pos = tr[Y[tr, j] == 1]
        ho_pos = ho[Y[ho, j] == 1]
        nr = None
        if len(tr_pos) and len(ho_pos):
            sims = X[ho_pos] @ X[tr_pos].T
            keep_m = sims.max(axis=1) < 0.92
            if keep_m.sum():
                y = np.zeros(len(ho), dtype=np.int8)
                for i in ho_pos[keep_m]:
                    y[np.where(ho == i)[0][0]] = 1
                nr = ranking_metrics(y, sho).get("mAP")
        unlabeled = np.where(Y[:, j] == 0)[0]
        top_fp = []
        if len(unlabeled):
            for i in unlabeled[np.argsort(-scores[unlabeled, j])[:8]]:
                oid = oracle_ids[i]
                top_fp.append(
                    {
                        "name": names[oid],
                        "oracleId": oid,
                        "score": float(scores[i, j]),
                        "oracleText": (texts[oid] or "")[:220],
                        "typeLine": types[oid],
                    }
                )
        ho_ranks = []
        if pos_ho.sum():
            order = np.argsort(-sho)
            rank_of = {int(ho[k]): r + 1 for r, k in enumerate(order)}
            for i in ho[pos_ho]:
                ho_ranks.append({"name": names[oracle_ids[i]], "rank": rank_of[int(i)], "score": float(scores[i, j])})
            ho_ranks.sort(key=lambda r: r["rank"])
        hn_examples = []
        if hn_ho.sum():
            worst = ho[hn_ho][np.argsort(-sho[hn_ho])[:6]]
            for i in worst:
                hn_examples.append({"name": names[oracle_ids[i]], "score": float(scores[i, j]), "oracleText": (texts[oracle_ids[i]] or "")[:160]})
        pu_fallback = int((Y[tr, j] == -1).sum()) < MIN_HN
        used_pu.append(pu_fallback)
        row = {
            "id": hid,
            "parent": meta["parent"],
            "kind": meta["kind"],
            "role": meta["role"],
            "family": meta["family"],
            "support": int((Y[:, j] == 1).sum()),
            "hardNegatives": int((Y[:, j] == -1).sum()),
            "usedPuFallback": pu_fallback,
            "holdout": pos_vs_unl,
            "neighborhoodResistantMAP": nr,
            "hardNegative": hn_report,
            "lexicalAudit": lex,
            "holdoutPositiveRanks": ho_ranks[:10],
            "topUnknown": top_fp,
            "topHardNegativesByScore": hn_examples,
        }
        row["directionClass"] = classify_direction(row)
        per.append(row)
        audit_rows.append({k: row[k] for k in ("id", "kind", "role", "directionClass", "support", "hardNegatives", "holdout", "neighborhoodResistantMAP", "hardNegative", "lexicalAudit")})

    per.sort(key=lambda r: r["holdout"].get("mAP", 0), reverse=True)
    trained = [r for r in per if r["id"] != "IS_A_TOKEN"]
    maps = [r["holdout"]["mAP"] for r in trained if not r["holdout"].get("undefined")]
    hn_aucs = [r["hardNegative"]["auroc"] for r in trained if r["hardNegative"].get("auroc") is not None]
    class_counts = defaultdict(int)
    for r in trained:
        class_counts[r["directionClass"]] += 1
    by_kind = defaultdict(list)
    for r in trained:
        if not r["holdout"].get("undefined"):
            by_kind[r["kind"]].append(r["holdout"]["mAP"])

    # Signed sanity
    signed_audit = {}
    if "SIGNED_COST_MODIFICATION" in signed:
        s = signed["SIGNED_COST_MODIFICATION"]
        red = Y[:, cid["COST_REDUCTION"]] == 1
        inc = Y[:, cid["COST_INCREASE"]] == 1
        if red.sum() and inc.sum():
            signed_audit["SIGNED_COST_MODIFICATION"] = {
                "meanReduction": float(s[red].mean()),
                "meanIncrease": float(s[inc].mean()),
                "auroc": auroc(np.concatenate([np.ones(int(red.sum())), np.zeros(int(inc.sum()))]), np.concatenate([s[red], s[inc]])),
            }
    if "SIGNED_GRAVEYARD_RELATION" in signed:
        s = signed["SIGNED_GRAVEYARD_RELATION"]
        rec = Y[:, cid["RECURSION"]] == 1
        den = Y[:, cid["GRAVEYARD_DENIAL"]] == 1
        if rec.sum() and den.sum():
            signed_audit["SIGNED_GRAVEYARD_RELATION"] = {
                "meanRecursion": float(s[rec].mean()),
                "meanDenial": float(s[den].mean()),
                "auroc": auroc(np.concatenate([np.ones(int(rec.sum())), np.zeros(int(den.sum()))]), np.concatenate([s[rec], s[den]])),
            }

    (OUT / "concept-ids.json").write_text(json.dumps(concept_ids, indent=2) + "\n", encoding="utf-8")
    (OUT / "ontology.json").write_text(
        json.dumps({"version": "mechanical-ontology-v2.1", "concepts": CONCEPTS, "hierarchyNote": "parent/child; kind=capability|dependency|resilience|audit"}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT / "audit.json").write_text(json.dumps({"version": "direction-semantic-audit-v2", "directions": audit_rows}, indent=2) + "\n", encoding="utf-8")

    gpu = gpu_report()
    report = {
        "version": "mechanical-directions-v21",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT AND WAIT",
        "frozenBge": {"checksum": neu_man["checksum"], "immutable": True, "reembedded": False},
        "model": "linear 1024→F; hard-negative BCE when available; PU fallback otherwise; unknown ignored in HN loss",
        "gpu": gpu,
        "trainingSeconds": train_s,
        "counts": {
            "cards": n,
            "conceptsDefined": len(CONCEPTS),
            "conceptsTrained": len(trained),
            "capabilities": sum(1 for r in trained if r["kind"] == "capability"),
            "dependencies": sum(1 for r in trained if r["kind"] == "dependency"),
            "resilience": sum(1 for r in trained if r["kind"] == "resilience"),
            "droppedLowSupport": dropped,
            "withHardNegatives": sum(1 for r in trained if r["hardNegatives"] >= MIN_HN),
            "puFallback": int(sum(used_pu)),
            "train": len(splits["train"]),
            "holdout": len(splits["holdout"]),
        },
        "macro": {
            "mAP": float(np.mean(maps)) if maps else 0,
            "medianMAP": float(np.median(maps)) if maps else 0,
            "meanP@20": float(np.mean([r["holdout"]["P@20"] for r in trained if "P@20" in r["holdout"]])),
            "meanNeighborhoodResistantMAP": float(np.mean([r["neighborhoodResistantMAP"] for r in trained if r["neighborhoodResistantMAP"] is not None])),
            "meanHardNegativeAUROC": float(np.mean(hn_aucs)) if hn_aucs else None,
            "nHardNegativeEvaluated": len(hn_aucs),
        },
        "mAPByKind": {k: float(np.mean(v)) for k, v in by_kind.items()},
        "directionClassCounts": dict(class_counts),
        "signedAudit": signed_audit,
        "kCandidatePairs": [
            {
                "capability": a,
                "target": b,
                "capabilityTrained": a in {r["id"] for r in trained},
                "targetTrained": b in {r["id"] for r in trained},
                "ready": a in {r["id"] for r in trained} and b in {r["id"] for r in trained},
                "note": "Existence only. K is not built in this milestone.",
            }
            for a, b in K_CANDIDATE_PAIRS
        ],
        "perConcept": per,
        "qualityGate": {
            "pureOrBroadPreferred": True,
            "note": "A direction is only precise if hard-negative AUROC and lexical gap agree with its name.",
        },
        "safety": {
            "productionFirestoreWrites": "NONE",
            "openai": "NONE",
            "reembed": False,
            "rc8Concatenated": False,
            "rpsAuthorized": False,
        },
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    showcase_ids = {
        "REPEATABLE_SACRIFICE_OUTLET",
        "EDICT",
        "SACRIFICE",
        "COUNTER_SPELL",
        "REDIRECT_SPELL",
        "COST_REDUCTION",
        "COST_INCREASE",
        "CREATE_TOKEN",
        "GRAVEYARD_DENIAL",
        "CARES_ABOUT_GRAVEYARD",
        "CARES_ABOUT_TOKENS",
        "CARES_ABOUT_SACRIFICE",
        "CARES_ABOUT_CASTING_SPELLS",
        "ARTIFACT_SHUTDOWN",
        "HAND_ATTACK",
        "GRAVEYARD_HATE_RESILIENCE",
        "COUNTERSPELL_RESILIENCE",
    }
    (MS / "mechanical-ontology-v21-report.json").write_text(
        json.dumps(
            {
                k: report[k]
                for k in report
                if k != "perConcept"
            }
            | {
                "showcase": [r for r in per if r["id"] in showcase_ids],
                "classExamples": {
                    cls: [r["id"] for r in trained if r["directionClass"] == cls][:12] for cls in class_counts
                },
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    ready = [p for p in report["kCandidatePairs"] if p["ready"]]
    print(
        json.dumps(
            {
                "defined": len(CONCEPTS),
                "trained": len(trained),
                "dropped": dropped,
                "macroMAP": report["macro"]["mAP"],
                "nrMAP": report["macro"]["meanNeighborhoodResistantMAP"],
                "hnAUROC": report["macro"]["meanHardNegativeAUROC"],
                "classes": report["directionClassCounts"],
                "byKind": report["mAPByKind"],
                "signed": signed_audit,
                "kPairsReady": f"{len(ready)}/{len(K_CANDIDATE_PAIRS)}",
                "gaps": {
                    hid: next(({"class": r["directionClass"], "mAP": r["holdout"].get("mAP"), "support": r["support"], "hn": r["hardNegative"].get("auroc")} for r in per if r["id"] == hid), "MISSING")
                    for hid in (
                        "GRAVEYARD_DENIAL",
                        "REDIRECT_SPELL",
                        "CARES_ABOUT_TOKENS",
                        "CARES_ABOUT_SACRIFICE",
                        "CARES_ABOUT_CREATURE_DEATH",
                        "CARES_ABOUT_CASTING_SPELLS",
                        "CARES_ABOUT_DRAWING_CARDS",
                        "CARES_ABOUT_LIFE_GAIN",
                        "CARES_ABOUT_ARTIFACTS",
                        "ARTIFACT_SHUTDOWN",
                        "HAND_ATTACK",
                        "GRAVEYARD_HATE_RESILIENCE",
                    )
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

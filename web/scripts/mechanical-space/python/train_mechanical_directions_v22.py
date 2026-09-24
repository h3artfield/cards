#!/usr/bin/env python3
"""
Mechanical Ontology v2.2 — precision repair on frozen BGE.

Linear only. Debt-driven splits. Parent-child coherence audit.
Does not mutate v2.1 / K v1.5. No K. No RPS. No re-embed.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from mechanical_ontology_v2 import is_token_card as _is_token_card
from mechanical_ontology_v22 import (
    BY_ID,
    COMPILED,
    CONCEPTS,
    K_CANDIDATE_PAIRS,
    PROVENANCE_COUNTS,
    SPLITS,
    STRATEGIC_MIN_SUPPORT,
    lexical_buckets,
    map_oracle_hard_negatives,
    map_oracle_text,
    map_rc8_row,
    map_spellbook_feature,
)
from train_experiments import gpu_report, load_json, set_seeds
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge, assign_split, ranking_metrics
from train_mechanical_directions_v21 import auroc, classify_direction

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
RC8 = MS / "semantic-oracle-snapshot-v1"
SB = MS / "spellbook-reference-normalization-v1"
IDMAP = MS / "oracle-identity-mapping-v1"
OUT = MS / "mechanical-directions-v22"
SEED = 42
MIN_SUPPORT = 20
MIN_HN = 8
EPOCHS = 50
BATCH = 512


def inherit_child_positives(Y: np.ndarray, cid: dict) -> int:
    """Child-positive cards are parent-positive. Does not invent new families."""
    moved = 0
    for c in CONCEPTS:
        parent = c.get("parent")
        if not parent or c["id"] not in cid or parent not in cid:
            continue
        pj, cj = cid[parent], cid[c["id"]]
        mask = (Y[:, cj] == 1) & (Y[:, pj] != 1)
        Y[mask, pj] = 1
        moved += int(mask.sum())
    return moved


def parent_child_coherence(Y: np.ndarray, scores: np.ndarray, cid: dict, ho: np.ndarray) -> list[dict]:
    rows = []
    children_of = defaultdict(list)
    for c in CONCEPTS:
        if c.get("parent") and c["id"] in cid and c["parent"] in cid:
            children_of[c["parent"]].append(c["id"])
    for parent, kids in sorted(children_of.items()):
        pj = cid[parent]
        parent_pos = Y[:, pj] == 1
        rec = {
            "parent": parent,
            "children": kids,
            "parentSupport": int(parent_pos.sum()),
            "childCoverageOfParent": {},
            "childPosInsideParent": {},
            "siblingDiscrimination": [],
        }
        for kid in kids:
            kj = cid[kid]
            kpos = Y[:, kj] == 1
            if kpos.sum() == 0:
                continue
            rec["childPosInsideParent"][kid] = round(float((kpos & parent_pos).sum() / kpos.sum()), 4)
            if parent_pos.sum():
                rec["childCoverageOfParent"][kid] = round(float((kpos & parent_pos).sum() / parent_pos.sum()), 4)
        for i, a in enumerate(kids):
            for b in kids[i + 1 :]:
                ja, jb = cid[a], cid[b]
                a_only = (Y[ho, ja] == 1) & (Y[ho, jb] != 1)
                b_only = (Y[ho, jb] == 1) & (Y[ho, ja] != 1)
                if a_only.sum() >= 3 and b_only.sum() >= 3:
                    y = np.concatenate([np.ones(int(a_only.sum())), np.zeros(int(b_only.sum()))])
                    s = np.concatenate([scores[ho[a_only], ja] - scores[ho[a_only], jb], scores[ho[b_only], ja] - scores[ho[b_only], jb]])
                    rec["siblingDiscrimination"].append({"a": a, "b": b, "auroc_scoreA_minus_scoreB": auroc(y, s)})
        rows.append(rec)
    return rows


def main() -> None:
    set_seeds(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    neu_man = load_json(NEU / "manifest.json")
    assert_frozen_bge(neu_man)
    if neu_man.get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch — v2.2 must use the frozen space")
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
    Y = np.zeros((n, len(concept_ids)), dtype=np.int8)

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
            if "IS_A_TOKEN" in cid:
                Y[i, cid["IS_A_TOKEN"]] = 1

    inherited = inherit_child_positives(Y, cid)

    for i in range(n):
        text = texts[oracle_ids[i]]
        for hid in map_oracle_hard_negatives(text):
            if hid in cid and Y[i, cid[hid]] == 0:
                Y[i, cid[hid]] = -1
        if "IS_A_TOKEN" in cid and "CREATE_TOKEN" in cid and Y[i, cid["IS_A_TOKEN"]] == 1 and Y[i, cid["CREATE_TOKEN"]] != 1:
            Y[i, cid["CREATE_TOKEN"]] = -1

    for c in COMPILED:
        if c["id"] not in cid:
            continue
        j = cid[c["id"]]
        for sib in c["hn_siblings"]:
            if sib not in cid:
                continue
            sj = cid[sib]
            mask = (Y[:, sj] == 1) & (Y[:, j] == 0)
            Y[mask, j] = -1

    supports = (Y == 1).sum(axis=0)
    keep, dropped = [], []
    for j, s in enumerate(supports):
        hid = concept_ids[j]
        need = 15 if hid in STRATEGIC_MIN_SUPPORT else MIN_SUPPORT
        if s >= need:
            keep.append(j)
        else:
            dropped.append({"id": hid, "support": int(s), "minRequired": need, "provenance": BY_ID.get(hid, {}).get("provenance")})
    concept_ids = [concept_ids[j] for j in keep]
    Y = Y[:, keep]
    cid = {c: i for i, c in enumerate(concept_ids)}

    splits = {"train": [], "validation": [], "holdout": []}
    for oid in oracle_ids:
        splits[assign_split(oid)].append(oid)
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
    (OUT / "concept-ids.json").write_text(json.dumps(concept_ids, indent=2) + "\n", encoding="utf-8")

    per, audit_rows = [], []
    for j, hid in enumerate(concept_ids):
        meta = BY_ID[hid]
        yho = Y[ho, j]
        sho = scores[ho, j]
        pos_vs_unl = ranking_metrics((yho == 1).astype(np.int32), sho)
        hn_ho = yho == -1
        pos_ho = yho == 1
        hn_report = {"nHardNegHoldout": int(hn_ho.sum()), "nPosHoldout": int(pos_ho.sum())}
        if hn_ho.sum() >= 3 and pos_ho.sum() >= 3:
            pair_y = np.concatenate([np.ones(int(pos_ho.sum())), np.zeros(int(hn_ho.sum()))])
            pair_s = np.concatenate([sho[pos_ho], sho[hn_ho]])
            hn_report["auroc"] = auroc(pair_y, pair_s)
            hn_report["meanPos"] = float(sho[pos_ho].mean())
            hn_report["meanHardNeg"] = float(sho[hn_ho].mean())
            hn_report["margin"] = hn_report["meanPos"] - hn_report["meanHardNeg"]
            hn_report["pairwiseWin"] = float((sho[pos_ho][:, None] > sho[hn_ho][None, :]).mean())
        lex_scores = defaultdict(list)
        if BY_ID[hid].get("lexical_re"):
            for i, oid in enumerate(oracle_ids):
                for b in lexical_buckets(hid, texts[oid], types[oid], names[oid]):
                    lex_scores[b].append(float(scores[i, j]))
        lex = {"buckets": {k: {"n": len(v), "meanScore": float(np.mean(v))} for k, v in lex_scores.items()}}
        keys = list(lex_scores)
        if keys:
            primary = next((k for k in keys if k.startswith("A_")), keys[0])
            others = [k for k in keys if k != primary]
            if others:
                lex["primaryGap"] = lex["buckets"][primary]["meanScore"] - max(lex["buckets"][k]["meanScore"] for k in others)
        unlabeled = np.where(Y[:, j] == 0)[0]
        top_fp = []
        if len(unlabeled):
            for i in unlabeled[np.argsort(-scores[unlabeled, j])[:6]]:
                oid = oracle_ids[i]
                top_fp.append({"name": names[oid], "score": float(scores[i, j]), "oracleText": (texts[oid] or "")[:180]})
        pu_fallback = int((Y[tr, j] == -1).sum()) < MIN_HN
        used_pu.append(pu_fallback)
        row = {
            "id": hid,
            "parent": meta["parent"],
            "kind": meta["kind"],
            "role": meta["role"],
            "family": meta["family"],
            "provenance": meta.get("provenance"),
            "support": int((Y[:, j] == 1).sum()),
            "hardNegatives": int((Y[:, j] == -1).sum()),
            "usedPuFallback": pu_fallback,
            "holdout": pos_vs_unl,
            "hardNegative": hn_report,
            "lexicalAudit": lex,
            "topUnknown": top_fp,
        }
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
        row["neighborhoodResistantMAP"] = nr
        row["directionClass"] = classify_direction(row)
        per.append(row)
        audit_rows.append({k: row[k] for k in ("id", "kind", "role", "parent", "directionClass", "support", "hardNegatives", "holdout", "hardNegative", "provenance")})

    per.sort(key=lambda r: r["holdout"].get("mAP", 0), reverse=True)
    trained = [r for r in per if r["id"] != "IS_A_TOKEN"]
    maps = [r["holdout"]["mAP"] for r in trained if not r["holdout"].get("undefined")]
    hn_aucs = [r["hardNegative"]["auroc"] for r in trained if r["hardNegative"].get("auroc") is not None]
    class_counts = defaultdict(int)
    for r in trained:
        class_counts[r["directionClass"]] += 1
    new_ids = {c["id"] for c in SPLITS}
    new_rows = [r for r in trained if r["id"] in new_ids]
    coherence = parent_child_coherence(Y, scores, cid, ho)

    (OUT / "concept-ids.json").write_text(json.dumps(concept_ids, indent=2) + "\n", encoding="utf-8")
    (OUT / "ontology.json").write_text(
        json.dumps({"version": "mechanical-ontology-v2.2", "parent": "mechanical-ontology-v2.1", "concepts": CONCEPTS}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT / "audit.json").write_text(json.dumps({"version": "direction-semantic-audit-v22", "directions": audit_rows, "parentChildCoherence": coherence}, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps({"artifactType": "MechanicalDirections", "version": "mechanical-directions-v22", "ontology": "mechanical-ontology-v2.2", "status": "REVIEWED_BATCH", "parentLineageFrozen": "mechanical-space-v1"}, indent=2) + "\n",
        encoding="utf-8",
    )

    report = {
        "version": "mechanical-directions-v22",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT AND WAIT",
        "kind": "ontology_precision_repair",
        "parentOntology": "mechanical-ontology-v2.1",
        "frozenBge": {"checksum": LOCKED_CHECKSUM, "immutable": True, "reembedded": False},
        "model": "linear 1024→F; HN BCE when available; PU fallback otherwise",
        "gpu": gpu_report(),
        "trainingSeconds": train_s,
        "childPositivesInheritedOntoParents": inherited,
        "provenanceCounts": PROVENANCE_COUNTS,
        "counts": {
            "cards": n,
            "conceptsDefined": len(CONCEPTS),
            "conceptsTrained": len(trained),
            "newSplitsDefined": len(SPLITS),
            "newSplitsTrained": len(new_rows),
            "droppedLowSupport": dropped,
            "capabilities": sum(1 for r in trained if r["kind"] == "capability"),
            "dependencies": sum(1 for r in trained if r["kind"] == "dependency"),
            "withHardNegatives": sum(1 for r in trained if r["hardNegatives"] >= MIN_HN),
        },
        "macro": {
            "mAP": float(np.mean(maps)) if maps else 0,
            "medianMAP": float(np.median(maps)) if maps else 0,
            "meanHardNegativeAUROC": float(np.mean(hn_aucs)) if hn_aucs else None,
            "nHardNegativeEvaluated": len(hn_aucs),
            "meanNeighborhoodResistantMAP": float(np.mean([r["neighborhoodResistantMAP"] for r in trained if r["neighborhoodResistantMAP"] is not None])),
        },
        "directionClassCounts": dict(class_counts),
        "newSplitAudit": [
            {
                "id": r["id"],
                "parent": r["parent"],
                "class": r["directionClass"],
                "support": r["support"],
                "mAP": r["holdout"].get("mAP"),
                "hnAUROC": r["hardNegative"].get("auroc"),
                "provenance": r.get("provenance"),
            }
            for r in sorted(new_rows, key=lambda x: x["id"])
        ],
        "parentChildCoherence": coherence,
        "kCandidatePairs": [
            {"capability": a, "target": b, "ready": a in cid and b in cid, "note": "Existence only. K v2 is not built here."}
            for a, b in K_CANDIDATE_PAIRS
        ],
        "perConcept": per,
        "next": {"authorized": False, "wouldBe": ["deck-mechanical-profiles-v2", "mechanical-pressure-k-v2"]},
        "safety": {"productionFirestoreWrites": "NONE", "openai": "NONE", "reembed": False, "hodge": False, "rpsAuthorized": False, "extraDecks": False},
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    slim = {k: report[k] for k in report if k != "perConcept"}
    slim["showcase"] = [r for r in per if r["id"] in new_ids or r["id"] in {"DEAL_DAMAGE", "CARES_ABOUT_COMBAT", "CARES_ABOUT_DRAWING_CARDS", "CARES_ABOUT_ONE_CREATURE", "HAND_ATTACK", "ARTIFACT_SHUTDOWN"}]
    (MS / "mechanical-ontology-v22-report.json").write_text(json.dumps(slim, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "defined": len(CONCEPTS),
                "trained": len(trained),
                "newTrained": [r["id"] for r in new_rows],
                "dropped": dropped,
                "macroMAP": report["macro"]["mAP"],
                "hnAUROC": report["macro"]["meanHardNegativeAUROC"],
                "classes": report["directionClassCounts"],
                "newSplitAudit": report["newSplitAudit"],
                "coherenceParents": [c["parent"] for c in coherence],
                "kReady": sum(1 for p in report["kCandidatePairs"] if p["ready"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

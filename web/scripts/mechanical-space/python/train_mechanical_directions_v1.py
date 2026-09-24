#!/usr/bin/env python3
"""
Mechanical Directions v1

Learn s_f(x) = w_f^T x + b_f in frozen BGE Oracle space.
Teachers: Spellbook + RC8 + high-precision Oracle-text phrases.
Do not concatenate RC8 onto neural vectors. No 0.5 F1 headline. No re-embed.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from mechanical_ontology_v1 import COMPILED, CONCEPTS, FEATURE_NAMES, map_oracle_text, map_rc8_row, map_spellbook_feature
from train_experiments import gpu_report, load_json, set_seeds

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
RC8 = MS / "semantic-oracle-snapshot-v1"
SB = MS / "spellbook-reference-normalization-v1"
IDMAP = MS / "oracle-identity-mapping-v1"
OUT = MS / "mechanical-directions-v1"
LOCKED_CHECKSUM = "433dafe15ec3fa4920bfa8ef49d9b1fa7b771e670bd6b571f2f4b015eae35203"
SEED = 42
MIN_SUPPORT = 25
EPOCHS = 40
BATCH = 512


def assert_frozen_bge(manifest: dict) -> None:
    if manifest.get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE space checksum mismatch — refusing to train. Space is frozen.")
    if manifest.get("version") != "oracle-neural-semantic-space-v1":
        raise SystemExit("Unexpected neural space version")


def assign_split(oracle_id: str) -> str:
    n = int(hashlib.sha256(f"evalA:{oracle_id}".encode()).hexdigest()[:8], 16) % 100
    if n < 70:
        return "train"
    if n < 85:
        return "validation"
    return "holdout"


def ranking_metrics(y: np.ndarray, s: np.ndarray) -> dict:
    """y in {0,1}; 1 = known positive, 0 = unlabeled background."""
    from sklearn.metrics import average_precision_score

    pos = y == 1
    n_pos = int(pos.sum())
    if n_pos == 0:
        return {"undefined": True}
    order = np.argsort(-s)
    ranks = np.empty_like(order)
    ranks[order] = np.arange(1, len(s) + 1)
    pos_ranks = ranks[pos]
    out = {
        "mAP": float(average_precision_score(pos.astype(np.int32), s)),
        "nPos": n_pos,
        "nUnlabeled": int((~pos).sum()),
        "medianHoldoutRank": float(np.median(pos_ranks)),
        "meanHoldoutRank": float(np.mean(pos_ranks)),
        "rankEnrichment": float((len(s) + 1) / 2 / max(np.mean(pos_ranks), 1e-6)),
        "holdoutRanks": [int(r) for r in np.sort(pos_ranks)[:20]],
    }
    for k in (10, 20, 50, 100):
        hits = int(pos[order[:k]].sum())
        out[f"P@{k}"] = hits / k
        out[f"R@{k}"] = hits / n_pos
    return out


def main() -> None:
    set_seeds(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    neu_man = load_json(NEU / "manifest.json")
    assert_frozen_bge(neu_man)
    rc8_man = load_json(RC8 / "manifest.json")
    if int(rc8_man["dimensions"]) != 117:
        raise SystemExit(f"RC8 dim {rc8_man['dimensions']} != 117")

    neu = np.fromfile(NEU / "vectors.f32", dtype=np.float32).reshape(int(neu_man["vectorCount"]), 1024)
    rc8 = np.fromfile(RC8 / "vectors.f32", dtype=np.float32).reshape(int(rc8_man["vectorCount"]), 117)
    neu_idx = [json.loads(l) for l in (NEU / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    neu_by = {r["oracleId"]: int(r["i"]) for r in neu_idx}
    rc8_by = {r["oracleId"]: int(r["i"]) for r in rc8_idx}
    names = {r["oracleId"]: r.get("name", r["oracleId"]) for r in rc8_idx}
    texts = {r["oracleId"]: r.get("oracleText") or "" for r in rc8_idx}
    types = {r["oracleId"]: r.get("typeLine") or "" for r in rc8_idx}

    # Align to RC8 row order (same 35932 cards).
    X = np.zeros((len(rc8_idx), 1024), dtype=np.float32)
    oracle_ids = [r["oracleId"] for r in sorted(rc8_idx, key=lambda r: r["i"])]
    missing_neu = 0
    for oid, i in rc8_by.items():
        if oid in neu_by:
            X[i] = neu[neu_by[oid]]
        else:
            missing_neu += 1
    if missing_neu:
        raise SystemExit(f"{missing_neu} RC8 cards missing from frozen BGE space")

    n = X.shape[0]
    concept_ids = [c["id"] for c in CONCEPTS]
    cid = {c: i for i, c in enumerate(concept_ids)}
    Y = np.zeros((n, len(concept_ids)), dtype=np.int8)
    teacher_counts = {c: {"spellbook": 0, "rc8": 0, "oracle": 0} for c in concept_ids}
    spellbook_mapped = 0
    spellbook_unmapped = []

    # Teacher 1: Spellbook
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
            hits = map_spellbook_feature(f.get("featureName") or "")
            if not hits:
                spellbook_unmapped.append(f.get("featureName") or "")
            else:
                spellbook_mapped += 1
            for hid in hits:
                Y[row, cid[hid]] = 1
                teacher_counts[hid]["spellbook"] += 1

    # Teacher 2: RC8 parser dimensions (high-confidence literals / derived roles)
    for i in range(n):
        for hid in map_rc8_row(rc8[i]):
            if Y[i, cid[hid]] == 0:
                teacher_counts[hid]["rc8"] += 1
            Y[i, cid[hid]] = 1

    # Teacher 3: high-precision Oracle-text phrases
    for oid, i in rc8_by.items():
        for hid in map_oracle_text(texts.get(oid, "")):
            if Y[i, cid[hid]] == 0:
                teacher_counts[hid]["oracle"] += 1
            Y[i, cid[hid]] = 1

    supports = Y.sum(axis=0)
    keep = [j for j, s in enumerate(supports) if s >= MIN_SUPPORT]
    concept_ids = [concept_ids[j] for j in keep]
    Y = Y[:, keep]
    teacher_counts = {c: teacher_counts[c] for c in concept_ids}
    families = {c["id"]: c["family"] for c in CONCEPTS}

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
    pos = (Y[tr] == 1).sum(axis=0).astype(np.float32)
    unl = (Y[tr] == 0).sum(axis=0).astype(np.float32)
    pos_weight = torch.tensor(np.clip(unl / np.maximum(pos, 1), 1, 50), dtype=torch.float32, device=device)

    model = nn.Linear(1024, F).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    Xt = torch.tensor(X[tr], dtype=torch.float32, device=device)
    Yt = torch.tensor((Y[tr] == 1).astype(np.float32), dtype=torch.float32, device=device)
    t0 = time.time()
    for _ in range(EPOCHS):
        perm = torch.randperm(Xt.shape[0], device=device)
        for start in range(0, Xt.shape[0], BATCH):
            ix = perm[start : start + BATCH]
            logits = model(Xt[ix])
            loss = nn.functional.binary_cross_entropy_with_logits(logits, Yt[ix], pos_weight=pos_weight)
            opt.zero_grad()
            loss.backward()
            opt.step()
    train_s = time.time() - t0

    with torch.no_grad():
        scores = torch.sigmoid(model(torch.tensor(X, dtype=torch.float32, device=device))).detach().cpu().numpy().astype(np.float32)
        weights = model.weight.detach().cpu().numpy().astype(np.float32)
        bias = model.bias.detach().cpu().numpy().astype(np.float32)

    scores.tofile(OUT / "scores.f32")
    weights.tofile(OUT / "directions.f32")
    bias.tofile(OUT / "bias.f32")

    per = []
    novel = []
    for j, cid_name in enumerate(concept_ids):
        yho = Y[ho, j]
        sho = scores[ho, j]
        metrics = ranking_metrics(yho, sho)
        teachers = teacher_counts[cid_name]
        teacher_set = [k for k, v in teachers.items() if v > 0]
        # Novel: unlabeled anywhere, high score, not a train/holdout positive
        unlabeled = np.where(Y[:, j] == 0)[0]
        top_u = unlabeled[np.argsort(-scores[unlabeled, j])[:15]]
        novels = []
        for i in top_u:
            oid = oracle_ids[i]
            novels.append(
                {
                    "name": names.get(oid, oid),
                    "oracleId": oid,
                    "score": float(scores[i, j]),
                    "typeLine": types.get(oid, ""),
                    "oracleText": (texts.get(oid) or "")[:280],
                    "split": split_of[oid],
                }
            )
        # Holdout positives with ranks
        ho_pos = ho[yho == 1]
        ho_ranks = []
        if len(ho_pos):
            order = np.argsort(-sho)
            rank_of = {int(ho[k]): r + 1 for r, k in enumerate(order)}
            for i in ho_pos:
                ho_ranks.append({"name": names[oracle_ids[i]], "oracleId": oracle_ids[i], "rank": rank_of[int(i)], "score": float(scores[i, j])})
            ho_ranks.sort(key=lambda r: r["rank"])
        row = {
            "id": cid_name,
            "family": families[cid_name],
            "support": int(Y[:, j].sum()),
            "teachers": teachers,
            "teacherSet": teacher_set,
            "holdout": metrics,
            "holdoutPositiveRanks": ho_ranks[:12],
            "topNovel": novels,
        }
        per.append(row)
        for nrec in novels[:8]:
            novel.append({"concept": cid_name, **nrec})

    per.sort(key=lambda r: r["holdout"].get("mAP", 0), reverse=True)
    maps = [r["holdout"]["mAP"] for r in per if not r["holdout"].get("undefined")]
    by_teacher = defaultdict(list)
    for r in per:
        key = "+".join(r["teacherSet"]) if r["teacherSet"] else "none"
        if not r["holdout"].get("undefined"):
            by_teacher[key].append(r["holdout"]["mAP"])

    # Neighborhood-resistant: drop holdout positives with neural cosine >= 0.92 to a train positive
    leak_maps = []
    for j, cid_name in enumerate(concept_ids):
        tr_pos = tr[Y[tr, j] == 1]
        ho_pos = ho[Y[ho, j] == 1]
        if len(tr_pos) == 0 or len(ho_pos) == 0:
            continue
        sims = X[ho_pos] @ X[tr_pos].T
        keep_mask = sims.max(axis=1) < 0.92
        if keep_mask.sum() == 0:
            continue
        y = np.zeros(len(ho), dtype=np.int8)
        kept = ho_pos[keep_mask]
        for i in kept:
            y[np.where(ho == i)[0][0]] = 1
        leak_maps.append(ranking_metrics(y, scores[ho, j])["mAP"])

    unmapped_unique = sorted(set(spellbook_unmapped))
    directions_meta = []
    for j, cid_name in enumerate(concept_ids):
        w = weights[j]
        directions_meta.append(
            {
                "id": cid_name,
                "family": families[cid_name],
                "norm": float(np.linalg.norm(w)),
                "bias": float(bias[j]),
                "topAbsDims": [int(i) for i in np.argsort(-np.abs(w))[:8]],
            }
        )

    (OUT / "ontology.json").write_text(
        json.dumps(
            {
                "version": "mechanical-ontology-v1",
                "concepts": CONCEPTS,
                "minSupport": MIN_SUPPORT,
                "trained": concept_ids,
                "literalRc8Names": FEATURE_NAMES,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT / "concept-ids.json").write_text(json.dumps(concept_ids, indent=2) + "\n", encoding="utf-8")
    (OUT / "novel-predictions.jsonl").write_text("".join(json.dumps(x) + "\n" for x in novel), encoding="utf-8")

    gpu = gpu_report()
    report = {
        "version": "mechanical-directions-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT AND WAIT",
        "frozenBge": {
            "checksum": neu_man["checksum"],
            "model": neu_man["model"],
            "immutable": True,
            "reembedded": False,
        },
        "rc8": {"checksum": rc8_man["checksum"], "usedAs": "teacher labels only, not concatenated features"},
        "gpu": gpu,
        "training": {
            "epochs": EPOCHS,
            "batchSize": BATCH,
            "seconds": train_s,
            "device": device,
            "model": "independent linear heads 1024→F with PU pos_weight",
            "thresholdPolicy": "none — ranking only; 0.5 is not used",
        },
        "counts": {
            "cards": n,
            "conceptsDefined": len(CONCEPTS),
            "conceptsTrained": len(concept_ids),
            "minSupport": MIN_SUPPORT,
            "train": len(splits["train"]),
            "validation": len(splits["validation"]),
            "holdout": len(splits["holdout"]),
            "spellbookFeatureMappingsFired": spellbook_mapped,
            "spellbookFeatureNamesUnmapped": len(unmapped_unique),
        },
        "macro": {
            "mAP": float(np.mean(maps)) if maps else 0,
            "medianMAP": float(np.median(maps)) if maps else 0,
            "meanP@20": float(np.mean([r["holdout"]["P@20"] for r in per if "P@20" in r["holdout"]])),
            "meanR@20": float(np.mean([r["holdout"]["R@20"] for r in per if "R@20" in r["holdout"]])),
            "meanP@50": float(np.mean([r["holdout"]["P@50"] for r in per if "P@50" in r["holdout"]])),
            "meanR@50": float(np.mean([r["holdout"]["R@50"] for r in per if "R@50" in r["holdout"]])),
            "meanRankEnrichment": float(np.mean([r["holdout"]["rankEnrichment"] for r in per if "rankEnrichment" in r["holdout"]])),
            "neighborhoodResistantMAP": float(np.mean(leak_maps)) if leak_maps else None,
            "neighborhoodResistantConcepts": len(leak_maps),
        },
        "mAPByTeacherCombo": {k: float(np.mean(v)) for k, v in by_teacher.items()},
        "directions": directions_meta,
        "perConcept": per,
        "unmappedSpellbookExamples": unmapped_unique[:40],
        "safety": {
            "productionFirestoreWrites": "NONE",
            "openai": "NONE",
            "reembed": False,
            "rc8Concatenated": False,
            "rpsAuthorized": False,
            "node2vecExtended": False,
        },
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (MS / "mechanical-directions-v1-report.json").write_text(
        json.dumps({k: report[k] for k in report if k != "perConcept"} | {"topConcepts": per[:12], "showcase": [r for r in per if r["id"] in ("SACRIFICE_OUTLET", "CREATE_TOKEN", "COST_REDUCTION", "REANIMATION", "COUNTER_SPELL", "LANDFALL")]}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "conceptsTrained": len(concept_ids),
                "macroMAP": report["macro"]["mAP"],
                "meanP@20": report["macro"]["meanP@20"],
                "meanR@20": report["macro"]["meanR@20"],
                "neighborhoodResistantMAP": report["macro"]["neighborhoodResistantMAP"],
                "mAPByTeacherCombo": report["mAPByTeacherCombo"],
                "top": [{"id": r["id"], "mAP": r["holdout"].get("mAP"), "P@20": r["holdout"].get("P@20"), "support": r["support"]} for r in per[:10]],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

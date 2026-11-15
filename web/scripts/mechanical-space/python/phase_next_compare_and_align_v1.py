#!/usr/bin/env python3
"""
PHASE NEXT: RC8 vs Neural vs Hybrid Spellbook probes, then graph embedding + alignment.

No OpenAI. No Firestore writes. Does not replace RC8.
"""

from __future__ import annotations

import hashlib
import json
import random
import time
from collections import defaultdict, deque
from pathlib import Path

import numpy as np

from train_experiments import (
    SEED,
    frequency_predict,
    gpu_report,
    knn_predict,
    load_json,
    multilabel_report,
    set_seeds,
    train_linear,
    train_mlp,
)

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
RC8 = MS / "semantic-oracle-snapshot-v1"
NEU = MS / "oracle-neural-semantic-space-v1"
SUP = MS / "mechanical-supervision-v1"
SB = MS / "spellbook-reference-normalization-v1"
CMP = MS / "representation-comparison-v1"
GRAPH = MS / "mechanical-graph-embedding-v1"
ALIGN = MS / "mechanical-alignment-v1"


def l2(x: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(x, axis=1, keepdims=True)
    n[n == 0] = 1
    return x / n


def zscore_train(train: np.ndarray, all_x: np.ndarray) -> np.ndarray:
    mean = train.mean(axis=0)
    std = train.std(axis=0)
    std[std < 1e-8] = 1
    return (all_x - mean) / std


def load_space(dir_path: Path):
    man = load_json(dir_path / "manifest.json")
    vec = np.fromfile(dir_path / "vectors.f32", dtype=np.float32).reshape(int(man["vectorCount"]), int(man["dimensions"]))
    index = [json.loads(line) for line in (dir_path / "index.jsonl").read_text(encoding="utf-8").splitlines() if line]
    by_id = {row["oracleId"]: int(row["i"]) for row in index}
    names = {row["oracleId"]: row.get("name", row["oracleId"]) for row in index}
    return man, vec, by_id, names


def evaluate_space(name: str, X_all: np.ndarray, by_id: dict[str, int], oracle_ids, feature_ids, Y_all, splits, device: str):
    def stack(ids):
        return X_all[[by_id[i] for i in ids]]

    Xtr, Xho = stack(splits["train"]), stack(splits["holdout"])
    Ytr = Y_all[[oracle_ids.index(i) for i in splits["train"]]]
    Yho = Y_all[[oracle_ids.index(i) for i in splits["holdout"]]]
    freq = multilabel_report(Yho, frequency_predict(Ytr, len(splits["holdout"])), feature_ids)
    knn = {}
    for k in (1, 3, 5, 10, 20):
        knn[str(k)] = multilabel_report(Yho, knn_predict(Xtr, Ytr, Xho, k), feature_ids)
    _, lin_s, lin_t, lin_p, lin_n = train_linear(Xtr, Ytr, Xho, device=device)
    _, mlp_s, mlp_t, mlp_p, mlp_n = train_mlp(Xtr, Ytr, Xho, device=device)
    lin = multilabel_report(Yho, lin_s, feature_ids)
    mlp = multilabel_report(Yho, mlp_s, feature_ids)
    return {
        "representation": name,
        "dimensions": int(X_all.shape[1]),
        "frequency": {"mAP": freq["mAP"], "microF1": freq["micro"].get("f1VsUnlabeled")},
        "knn": {k: {"mAP": v["mAP"], "microF1": v["micro"].get("f1VsUnlabeled")} for k, v in knn.items()},
        "linear": {
            "mAP": lin["mAP"],
            "microF1": lin["micro"].get("f1VsUnlabeled"),
            "macroF1": lin["macroF1"],
            "precision@5": lin["precision@5"],
            "recall@5": lin["recall@5"],
            "seconds": lin_t,
            "parameters": lin_n,
            "peakGpu": lin_p,
        },
        "mlp": {
            "mAP": mlp["mAP"],
            "microF1": mlp["micro"].get("f1VsUnlabeled"),
            "macroF1": mlp["macroF1"],
            "precision@5": mlp["precision@5"],
            "recall@5": mlp["recall@5"],
            "seconds": mlp_t,
            "parameters": mlp_n,
            "peakGpu": mlp_p,
        },
        "full": {"frequency": freq, "knn": knn, "linear": lin, "mlp": mlp},
    }


def neighborhood_holdout(ids: list[str], X: np.ndarray, by_id: dict[str, int], threshold=0.92):
    """Connected components of high cosine similarity stay on one side of the split."""
    idx = np.array([by_id[i] for i in ids])
    A = l2(X[idx])
    sims = A @ A.T
    n = len(ids)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(n):
        for j in np.where(sims[i] >= threshold)[0]:
            if j > i:
                union(i, j)
    comps: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        comps[find(i)].append(i)
    train, hold = [], []
    for members in comps.values():
        dest = hold if int(hashlib.sha256(str(sorted(members)).encode()).hexdigest()[:8], 16) % 100 < 16 else train
        dest.extend(ids[m] for m in members)
    if not hold:
        hold = train[-max(1, len(train) // 8) :]
        train = train[: -len(hold)]
    return {"train": sorted(set(train) - set(hold)), "holdout": sorted(set(hold)), "components": len(comps), "threshold": threshold}


def build_graph():
    cards = load_json(SB / "cards-slim.json")
    variants = load_json(SB / "variants-sample.json")
    edges = []
    nodes = set()
    for c in cards:
        if not c.get("oracleId"):
            continue
        card = f"card:{c['oracleId']}"
        nodes.add(card)
        for f in c.get("features") or []:
            feat = f"feature:{f['featureId']}"
            nodes.add(feat)
            edges.append((card, feat))
    for v in variants:
        rec = f"recipe:{v.get('of', [v['id']])[0] if v.get('of') else v['id']}"
        nodes.add(rec)
        for u in v.get("uses") or []:
            if u.get("oracleId"):
                card = f"card:{u['oracleId']}"
                nodes.add(card)
                edges.append((rec, card))
        for p in v.get("produces") or []:
            feat = f"feature:{p['featureId']}"
            nodes.add(feat)
            edges.append((rec, feat))
    return sorted(nodes), edges


def node2vec(nodes: list[str], edges: list[tuple[str, str]], dim=32, walks=8, walk_len=12, epochs=3, device="cpu"):
    import torch
    import torch.nn as nn

    adj: dict[str, list[str]] = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    node_index = {n: i for i, n in enumerate(nodes)}
    sequences = []
    rng = random.Random(SEED)
    for _ in range(walks):
        order = nodes[:]
        rng.shuffle(order)
        for start in order:
            walk = [start]
            cur = start
            for _ in range(walk_len - 1):
                nbrs = adj.get(cur)
                if not nbrs:
                    break
                cur = rng.choice(nbrs)
                walk.append(cur)
            sequences.append([node_index[x] for x in walk])

    pairs = []
    for walk in sequences:
        for i, center in enumerate(walk):
            for j in range(max(0, i - 2), min(len(walk), i + 3)):
                if i != j:
                    pairs.append((center, walk[j]))
    if not pairs:
        return np.zeros((len(nodes), dim), dtype=np.float32), {"walks": 0}

    emb = nn.Embedding(len(nodes), dim).to(device)
    opt = torch.optim.Adam(emb.parameters(), lr=1e-2)
    pair_t = torch.tensor(pairs, dtype=torch.long, device=device)
    t0 = time.time()
    for _ in range(epochs):
        perm = torch.randperm(pair_t.shape[0], device=device)
        for start in range(0, pair_t.shape[0], 2048):
            batch = pair_t[perm[start : start + 2048]]
            src, dst = emb(batch[:, 0]), emb(batch[:, 1])
            neg = emb(torch.randint(0, len(nodes), (batch.shape[0],), device=device))
            pos = (src * dst).sum(-1)
            neg_s = (src * neg).sum(-1)
            loss = -torch.nn.functional.logsigmoid(pos).mean() - torch.nn.functional.logsigmoid(-neg_s).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
    g = torch.nn.functional.normalize(emb.weight, dim=1).detach().cpu().numpy().astype(np.float32)
    return g, {"nodes": len(nodes), "edges": len(edges), "pairs": len(pairs), "seconds": time.time() - t0, "dim": dim}


def train_align(X, G, epochs=80, hidden=256, device="cpu"):
    import torch
    import torch.nn as nn

    D, Dg = X.shape[1], G.shape[1]
    model = nn.Sequential(nn.Linear(D, hidden), nn.ReLU(), nn.Linear(hidden, Dg)).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    xt = torch.tensor(X, dtype=torch.float32, device=device)
    gt = torch.tensor(G, dtype=torch.float32, device=device)
    t0 = time.time()
    for _ in range(epochs):
        pred = torch.nn.functional.normalize(model(xt), dim=1)
        loss = 1 - (pred * gt).sum(-1).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
    pred = torch.nn.functional.normalize(model(xt), dim=1).detach().cpu().numpy()
    cos = float((pred * G).sum(-1).mean())
    return model, pred, cos, time.time() - t0


def main() -> None:
    set_seeds(SEED)
    CMP.mkdir(parents=True, exist_ok=True)
    GRAPH.mkdir(parents=True, exist_ok=True)
    ALIGN.mkdir(parents=True, exist_ok=True)
    gpu = gpu_report()
    device = "cuda" if gpu.get("gpuDetected") else "cpu"

    rc8_man, rc8, rc8_id, names = load_space(RC8)
    neu_man, neu, neu_id, _ = load_space(NEU)
    oracle_ids = load_json(SUP / "oracle-ids.json")
    feature_ids = load_json(SUP / "feature-ids.json")
    splits = load_json(SUP / "splits-eval-a-random.json")
    Y_all = np.fromfile(SUP / "labels.i8", dtype=np.int8).reshape(len(oracle_ids), len(feature_ids))

    # Align row order to RC8 index for hybrid
    labeled = [oid for oid in oracle_ids if oid in rc8_id and oid in neu_id]
    X_rc8 = rc8
    X_neu = np.zeros_like(rc8, shape=(rc8.shape[0], neu.shape[1]), dtype=np.float32)
    for oid, i in rc8_id.items():
        if oid in neu_id:
            X_neu[i] = neu[neu_id[oid]]
    train_idx = [rc8_id[i] for i in splits["train"] if i in rc8_id]
    X_hyb = np.concatenate([l2(X_neu), zscore_train(X_rc8[train_idx], X_rc8)], axis=1)

    eval_a = {
        "RC8": evaluate_space("RC8", X_rc8, rc8_id, oracle_ids, feature_ids, Y_all, splits, device),
        "Neural": evaluate_space("Neural", X_neu, rc8_id, oracle_ids, feature_ids, Y_all, splits, device),
        "Hybrid": evaluate_space("Neural+RC8", X_hyb, rc8_id, oracle_ids, feature_ids, Y_all, splits, device),
    }

    leak = neighborhood_holdout(labeled, X_neu, rc8_id, 0.92)
    leak_splits = {"train": leak["train"], "holdout": leak["holdout"], "validation": []}
    # if holdout empty of labels in Y, filter
    leak_splits["train"] = [i for i in leak_splits["train"] if i in oracle_ids]
    leak_splits["holdout"] = [i for i in leak_splits["holdout"] if i in oracle_ids]
    eval_c = {}
    if len(leak_splits["train"]) >= 50 and len(leak_splits["holdout"]) >= 20:
        eval_c = {
            "RC8": evaluate_space("RC8-evalC", X_rc8, rc8_id, oracle_ids, feature_ids, Y_all, leak_splits, device),
            "Neural": evaluate_space("Neural-evalC", X_neu, rc8_id, oracle_ids, feature_ids, Y_all, leak_splits, device),
            "Hybrid": evaluate_space("Hybrid-evalC", X_hyb, rc8_id, oracle_ids, feature_ids, Y_all, leak_splits, device),
        }

    nodes, edges = build_graph()
    g, gstats = node2vec(nodes, edges, device=device)
    card_nodes = {n[5:]: i for i, n in enumerate(nodes) if n.startswith("card:")}
    known = [oid for oid in labeled if oid in card_nodes]
    G_cards = np.stack([g[card_nodes[oid]] for oid in known]).astype(np.float32)
    rng = np.random.RandomState(SEED)
    perm = rng.permutation(len(known))
    cut = int(0.8 * len(known))
    tr, ho = [known[i] for i in perm[:cut]], [known[i] for i in perm[cut:]]

    def pack(ids, X):
        return np.stack([X[rc8_id[i]] for i in ids])

    alignments = {}
    inspect = []
    for key, X in (("Neural", X_neu), ("RC8", X_rc8), ("Hybrid", X_hyb)):
        Xtr, Gtr = pack(tr, X), np.stack([g[card_nodes[i]] for i in tr])
        Xho, Gho = pack(ho, X), np.stack([g[card_nodes[i]] for i in ho])
        model, _, train_cos, secs = train_align(Xtr, l2(Gtr), device=device)
        import torch

        pred = torch.nn.functional.normalize(model(torch.tensor(Xho, dtype=torch.float32, device=device)), dim=1).detach().cpu().numpy()
        hold_cos = float((pred * l2(Gho)).sum(-1).mean())
        # nearest known mechanical neighbor for a few holdout cards
        gall = l2(Gtr)
        examples = []
        for i, oid in enumerate(ho[:8]):
            sims = pred[i] @ gall.T
            top = np.argsort(-sims)[:5]
            examples.append(
                {
                    "card": names.get(oid, oid),
                    "oracleId": oid,
                    "neighbors": [{"card": names.get(tr[j], tr[j]), "cosine": float(sims[j])} for j in top],
                }
            )
        alignments[key] = {"trainCosine": train_cos, "holdoutCosine": hold_cos, "seconds": secs, "examples": examples}

        # project unlabeled cards and inspect
        unlabeled = [oid for oid in rc8_id if oid not in card_nodes][:12]
        if unlabeled:
            Xu = pack(unlabeled, X)
            pu = torch.nn.functional.normalize(model(torch.tensor(Xu, dtype=torch.float32, device=device)), dim=1).detach().cpu().numpy()
            for i, oid in enumerate(unlabeled[:6]):
                sims = pu[i] @ gall.T
                top = np.argsort(-sims)[:5]
                inspect.append(
                    {
                        "source": key,
                        "uncoveredCard": names.get(oid, oid),
                        "oracleId": oid,
                        "nearestKnownMechanical": [{"card": names.get(tr[j], tr[j]), "cosine": float(sims[j])} for j in top],
                    }
                )

    g.tofile(GRAPH / "node-vectors.f32")
    (GRAPH / "nodes.json").write_text(json.dumps(nodes) + "\n", encoding="utf-8")
    (GRAPH / "manifest.json").write_text(json.dumps({"version": "mechanical-graph-embedding-v1", **gstats, "method": "random-walk skipgram (node2vec-style)"}, indent=2) + "\n", encoding="utf-8")

    comparison = {
        "version": "representation-comparison-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "gpu": gpu,
        "rc8": {"model": rc8_man.get("model"), "checksum": rc8_man.get("checksum"), "dim": rc8_man.get("dimensions")},
        "neural": {"model": neu_man.get("model"), "checksum": neu_man.get("checksum"), "dim": neu_man.get("dimensions")},
        "evalA_sameSplit": {k: {kk: vv for kk, vv in v.items() if kk != "full"} for k, v in eval_a.items()},
        "evalC_neighborhoodResistant": {
            "split": {k: leak[k] for k in ("train", "holdout", "components", "threshold") if k != "x"},
            "holdoutCount": len(leak_splits["holdout"]),
            "trainCount": len(leak_splits["train"]),
            "results": {k: {kk: vv for kk, vv in v.items() if kk != "full"} for k, v in eval_c.items()},
        },
    }
    # compact table
    table = []
    for split_name, block in (("evalA", eval_a), ("evalC", eval_c)):
        for rep, res in block.items():
            table.append(
                {
                    "split": split_name,
                    "representation": res["representation"],
                    "knn5_mAP": res["knn"]["5"]["mAP"],
                    "knn5_F1": res["knn"]["5"]["microF1"],
                    "linear_mAP": res["linear"]["mAP"],
                    "linear_F1": res["linear"]["microF1"],
                    "mlp_mAP": res["mlp"]["mAP"],
                    "mlp_F1": res["mlp"]["microF1"],
                }
            )
    comparison["table"] = table
    (CMP / "report.json").write_text(json.dumps(comparison, indent=2) + "\n", encoding="utf-8")
    (ALIGN / "report.json").write_text(
        json.dumps(
            {
                "version": "mechanical-alignment-v1",
                "createdAt": comparison["createdAt"],
                "target": "node2vec card coordinate g",
                "mappings": alignments,
                "uncoveredInspection": inspect,
                "note": "Alignment asks where a card belongs in mechanical graph space, not whether it has Feature 837.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"table": table, "alignment": {k: {sk: sv for sk, sv in v.items() if sk != "examples"} for k, v in alignments.items()}, "gpu": gpu}, indent=2))


if __name__ == "__main__":
    main()

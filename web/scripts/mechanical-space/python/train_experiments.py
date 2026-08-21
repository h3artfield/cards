#!/usr/bin/env python3
"""Local mechanical-feature ML on frozen RC8 Oracle vectors. No OpenAI. No embedding updates."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[4]  # .../web when run from web/scripts/...
# File: web/scripts/mechanical-space/python/train_experiments.py -> parents[4] is repo? 
# parents[0]=python, [1]=mechanical-space, [2]=scripts, [3]=web
WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
SNAP = MS / "semantic-oracle-snapshot-v1"
SUP = MS / "mechanical-supervision-v1"
OUT = MS / "mechanical-feature-ml-v1"
SEED = 42


def set_seeds(seed: int = SEED) -> None:
    import random

    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
            torch.backends.cudnn.deterministic = True
            torch.backends.cudnn.benchmark = False
    except Exception:
        pass


def gpu_report() -> dict:
    report = {
        "gpuDetected": False,
        "cuda": None,
        "pytorch": None,
        "deviceName": None,
        "vramBytes": None,
        "driver": None,
        "smokeOk": False,
    }
    try:
        import torch

        report["pytorch"] = torch.__version__
        report["cuda"] = torch.version.cuda
        report["gpuDetected"] = bool(torch.cuda.is_available())
        if torch.cuda.is_available():
            report["deviceName"] = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            report["vramBytes"] = int(props.total_memory)
            x = torch.ones((256, 256), device="cuda")
            y = x @ x
            report["smokeOk"] = bool(torch.isfinite(y).all().item())
            report["peakVramBytes"] = int(torch.cuda.max_memory_allocated())
        else:
            x = __import__("torch").ones((32, 32))
            report["smokeOk"] = bool(x.sum().item() == 1024)
    except Exception as exc:
        report["error"] = str(exc)
    return report


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_snapshot():
    manifest = load_json(SNAP / "manifest.json")
    dim = int(manifest["dimensions"])
    vectors = np.fromfile(SNAP / "vectors.f32", dtype=np.float32)
    n = int(manifest["vectorCount"])
    vectors = vectors.reshape(n, dim)
    index = [json.loads(line) for line in (SNAP / "index.jsonl").read_text(encoding="utf-8").splitlines() if line]
    by_id = {row["oracleId"]: int(row["i"]) for row in index}
    return manifest, vectors, by_id, index


def metrics(y_true: np.ndarray, y_score: np.ndarray, mask: np.ndarray) -> dict:
    """y_true in {0,1}, mask True where labeled (UNKNOWN excluded)."""
    from sklearn.metrics import average_precision_score, brier_score_loss

    if mask.sum() == 0:
        return {"undefined": True}
    yt = y_true[mask]
    ys = y_score[mask]
    pred = (ys >= 0.5).astype(np.int32)
    tp = int(((pred == 1) & (yt == 1)).sum())
    fp = int(((pred == 1) & (yt == 0)).sum())
    fn = int(((pred == 0) & (yt == 1)).sum())
    tn = int(((pred == 0) & (yt == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    try:
        ap = float(average_precision_score(yt, ys)) if yt.max() != yt.min() else float(yt.mean())
    except Exception:
        ap = 0.0
    try:
        brier = float(brier_score_loss(yt, np.clip(ys, 0, 1)))
    except Exception:
        brier = None
    return {
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "ap": ap,
        "brier": brier,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "supportPositive": int(yt.sum()),
        "labeled": int(mask.sum()),
    }


def pu_feature_metrics(y: np.ndarray, s: np.ndarray, k: int = 20) -> dict:
    """Positives vs unlabeled background. Unlabeled are NOT trusted negatives."""
    from sklearn.metrics import average_precision_score

    pos = y == 1
    if pos.sum() == 0:
        return {"undefined": True}
    # background = unlabeled (and any rare known negatives)
    order = np.argsort(-s)
    ranked_pos = pos[order]
    total_pos = int(pos.sum())
    hits_at_k = int(ranked_pos[:k].sum())
    pred_pos = s >= 0.5
    tp = int((pred_pos & pos).sum())
    fp_unlabeled = int((pred_pos & ~pos).sum())
    fn = int((~pred_pos & pos).sum())
    prec = tp / (tp + fp_unlabeled) if tp + fp_unlabeled else 0.0
    rec = tp / total_pos if total_pos else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    try:
        ap = float(average_precision_score(pos.astype(np.int32), s))
    except Exception:
        ap = 0.0
    return {
        "precisionVsUnlabeled": prec,
        "recallPositives": rec,
        "f1VsUnlabeled": f1,
        "apVsUnlabeled": ap,
        "precisionAt20": hits_at_k / k,
        "recallAt20": hits_at_k / total_pos,
        "tp": tp,
        "fpUnlabeled": fp_unlabeled,
        "fn": fn,
        "supportPositive": total_pos,
        "note": "Unlabeled treated as background for ranking only; they are not known negatives.",
    }


def multilabel_report(Y: np.ndarray, S: np.ndarray, feature_ids: list[str], k: int = 5) -> dict:
    # Y: 1 pos, -1 neg, 0 unknown
    labeled = Y != 0
    binary = (Y == 1).astype(np.float32)
    labeled_only_warning = bool((Y == -1).sum() == 0)
    per_feature = []
    pu_f1s, pu_aps, pu_precs, pu_recs = [], [], [], []
    for j, fid in enumerate(feature_ids):
        pu = pu_feature_metrics(Y[:, j], S[:, j])
        labeled_r = metrics(binary[:, j], S[:, j], labeled[:, j])
        row = {"featureId": fid, "pu": pu, "labeledOnlyDegenerate": labeled_r}
        per_feature.append(row)
        if not pu.get("undefined"):
            pu_f1s.append(pu["f1VsUnlabeled"])
            pu_aps.append(pu["apVsUnlabeled"])
            pu_precs.append(pu["precisionVsUnlabeled"])
            pu_recs.append(pu["recallPositives"])
    # card-level P@K / R@K among features
    p_at, r_at = [], []
    for i in range(Y.shape[0]):
        pos = set(np.where(Y[i] == 1)[0])
        if not pos:
            continue
        top = np.argsort(-S[i])[:k]
        hit = len(pos.intersection(top.tolist()))
        p_at.append(hit / k)
        r_at.append(hit / len(pos))
    micro_pu = pu_feature_metrics(Y.reshape(-1), S.reshape(-1))
    return {
        "evaluationProtocol": "PU ranking: known positives vs unlabeled background. Labeled-only F1 is degenerate without negatives.",
        "labeledOnlyF1IsDegenerate": labeled_only_warning,
        "micro": micro_pu,
        "macroPrecision": float(np.mean(pu_precs)) if pu_precs else 0.0,
        "macroRecall": float(np.mean(pu_recs)) if pu_recs else 0.0,
        "macroF1": float(np.mean(pu_f1s)) if pu_f1s else 0.0,
        "mAP": float(np.mean(pu_aps)) if pu_aps else 0.0,
        f"precision@{k}": float(np.mean(p_at)) if p_at else 0.0,
        f"recall@{k}": float(np.mean(r_at)) if r_at else 0.0,
        "perFeature": per_feature,
    }


def frequency_predict(Y_train: np.ndarray, n: int) -> np.ndarray:
    pos = (Y_train == 1).sum(axis=0)
    labeled = (Y_train != 0).sum(axis=0)
    freq = np.divide(pos, np.maximum(labeled, 1))
    return np.tile(freq, (n, 1))


def knn_predict(X_train, Y_train, X_query, k: int) -> np.ndarray:
    # cosine on L2-normalized rows
    def norm(a):
        n = np.linalg.norm(a, axis=1, keepdims=True)
        n[n == 0] = 1
        return a / n

    A = norm(X_train)
    B = norm(X_query)
    sims = B @ A.T
    idx = np.argpartition(-sims, min(k, A.shape[0] - 1), axis=1)[:, :k]
    out = np.zeros((X_query.shape[0], Y_train.shape[1]), dtype=np.float32)
    for i in range(X_query.shape[0]):
        neigh = Y_train[idx[i]]
        pos = (neigh == 1).sum(axis=0)
        known = (neigh != 0).sum(axis=0)
        out[i] = np.divide(pos, np.maximum(known, 1))
    return out


def train_linear(Xtr, Ytr, Xva, epochs=40, batch=256, device="cpu"):
    import torch
    import torch.nn as nn

    F = Ytr.shape[1]
    D = Xtr.shape[1]
    model = nn.Linear(D, F).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    X = torch.tensor(Xtr, dtype=torch.float32, device=device)
    Y = torch.tensor(Ytr, dtype=torch.float32, device=device)
    t0 = time.time()
    peak = 0
    for _ in range(epochs):
        perm = torch.randperm(X.shape[0], device=device)
        for start in range(0, X.shape[0], batch):
            ix = perm[start : start + batch]
            logits = model(X[ix])
            target = (Y[ix] == 1).float()
            mask = (Y[ix] != 0).float()
            loss = (nn.functional.binary_cross_entropy_with_logits(logits, target, reduction="none") * mask).sum()
            denom = mask.sum().clamp(min=1.0)
            loss = loss / denom
            opt.zero_grad()
            loss.backward()
            opt.step()
        if device.startswith("cuda"):
            peak = max(peak, int(torch.cuda.max_memory_allocated()))
    scores = torch.sigmoid(model(torch.tensor(Xva, dtype=torch.float32, device=device))).detach().cpu().numpy()
    return model, scores, time.time() - t0, peak, D * F + F


def train_mlp(Xtr, Ytr, Xva, hidden=(256, 128), epochs=40, batch=256, device="cpu"):
    import torch
    import torch.nn as nn

    D = Xtr.shape[1]
    F = Ytr.shape[1]
    model = nn.Sequential(
        nn.Linear(D, hidden[0]),
        nn.ReLU(),
        nn.Dropout(0.1),
        nn.Linear(hidden[0], hidden[1]),
        nn.ReLU(),
        nn.Linear(hidden[1], F),
    ).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    X = torch.tensor(Xtr, dtype=torch.float32, device=device)
    Y = torch.tensor(Ytr, dtype=torch.float32, device=device)
    t0 = time.time()
    peak = 0
    for _ in range(epochs):
        perm = torch.randperm(X.shape[0], device=device)
        for start in range(0, X.shape[0], batch):
            ix = perm[start : start + batch]
            logits = model(X[ix])
            target = (Y[ix] == 1).float()
            mask = (Y[ix] != 0).float()
            loss = (nn.functional.binary_cross_entropy_with_logits(logits, target, reduction="none") * mask).sum()
            loss = loss / mask.sum().clamp(min=1.0)
            opt.zero_grad()
            loss.backward()
            opt.step()
        if str(device).startswith("cuda"):
            peak = max(peak, int(torch.cuda.max_memory_allocated()))
    scores = torch.sigmoid(model(torch.tensor(Xva, dtype=torch.float32, device=device))).detach().cpu().numpy()
    params = sum(p.numel() for p in model.parameters())
    return model, scores, time.time() - t0, peak, params


def train_projection(Xtr, Ytr, Xall, dim=32, epochs=30, device="cpu"):
    import torch
    import torch.nn as nn

    D = Xtr.shape[1]
    proj = nn.Linear(D, dim, bias=False).to(device)
    opt = torch.optim.Adam(proj.parameters(), lr=1e-3)
    X = torch.tensor(Xtr, dtype=torch.float32, device=device)
    Y = torch.tensor((Ytr == 1).astype(np.float32), dtype=torch.float32, device=device)
    t0 = time.time()
    for _ in range(epochs):
        z = nn.functional.normalize(proj(X), dim=1)
        # supervised: cards sharing a feature should have higher cosine than random pairs
        i = torch.randint(0, X.shape[0], (256,), device=device)
        j = torch.randint(0, X.shape[0], (256,), device=device)
        share = ((Y[i] * Y[j]).sum(dim=1) > 0).float()
        sim = (z[i] * z[j]).sum(dim=1)
        loss = ((sim - (share * 2 - 1)) ** 2).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
    z_all = nn.functional.normalize(proj(torch.tensor(Xall, dtype=torch.float32, device=device)), dim=1)
    return z_all.detach().cpu().numpy(), time.time() - t0, dim


def main() -> None:
    set_seeds(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    gpu = gpu_report()
    (OUT / "gpu-report.json").write_text(json.dumps(gpu, indent=2) + "\n", encoding="utf-8")

    snap_manifest, vectors, by_id, _index = load_snapshot()
    oracle_ids = load_json(SUP / "oracle-ids.json")
    feature_ids = load_json(SUP / "feature-ids.json")
    splits = load_json(SUP / "splits-eval-a-random.json")
    Y_all = np.fromfile(SUP / "labels.i8", dtype=np.int8).reshape(len(oracle_ids), len(feature_ids))

    def stack(ids):
        rows = [by_id[oid] for oid in ids]
        return vectors[rows], ids

    Xtr, id_tr = stack(splits["train"])
    Xva, id_va = stack(splits["validation"])
    Xho, id_ho = stack(splits["holdout"])
    Ytr = Y_all[[oracle_ids.index(i) for i in id_tr]]
    Yva = Y_all[[oracle_ids.index(i) for i in id_va]]
    Yho = Y_all[[oracle_ids.index(i) for i in id_ho]]

    device = "cpu"
    try:
        import torch

        if torch.cuda.is_available():
            device = "cuda"
    except Exception:
        device = "cpu"

    freq_ho = frequency_predict(Ytr, len(id_ho))
    knn_reports = {}
    for k in (1, 3, 5, 10, 20):
        knn_ho = knn_predict(Xtr, Ytr, Xho, k)
        knn_reports[str(k)] = multilabel_report(Yho, knn_ho, feature_ids)

    lin_model, lin_ho, lin_time, lin_peak, lin_params = train_linear(Xtr, Ytr, Xho, device=device)
    mlp_model, mlp_ho, mlp_time, mlp_peak, mlp_params = train_mlp(Xtr, Ytr, Xho, device=device)
    z_all, proj_time, proj_dim = train_projection(Xtr, Ytr, vectors, device=device)

    # neighbor examples in mechanical space for a few holdout cards
    neighbor_examples = []
    if len(id_ho):
        z_ho = z_all[[by_id[i] for i in id_ho[:8]]]
        z_tr = z_all[[by_id[i] for i in id_tr]]
        sims = z_ho @ z_tr.T
        for i, oid in enumerate(id_ho[:8]):
            top = np.argsort(-sims[i])[:5]
            neighbor_examples.append(
                {
                    "holdoutOracleId": oid,
                    "neighbors": [{"oracleId": id_tr[j], "cosine": float(sims[i, j])} for j in top],
                }
            )

    linear_report = multilabel_report(Yho, lin_ho, feature_ids)
    mlp_report = multilabel_report(Yho, mlp_ho, feature_ids)
    freq_report = multilabel_report(Yho, freq_ho, feature_ids)
    knn5 = knn_reports["5"]

    # persist holdout scores + full-corpus linear scores for inspector
    import torch

    lin_all = (
        torch.sigmoid(lin_model(torch.tensor(vectors, dtype=torch.float32, device=device)))
        .detach()
        .cpu()
        .numpy()
        .astype(np.float32)
    )
    mlp_all = (
        torch.sigmoid(mlp_model(torch.tensor(vectors, dtype=torch.float32, device=device)))
        .detach()
        .cpu()
        .numpy()
        .astype(np.float32)
    )
    knn_all = knn_predict(Xtr, Ytr, vectors, 5).astype(np.float32)
    lin_all.tofile(OUT / "linear-scores.f32")
    mlp_all.tofile(OUT / "mlp-scores.f32")
    knn_all.tofile(OUT / "knn-scores.f32")
    z_all.astype(np.float32).tofile(OUT / "mechanical-projection.f32")

    best_knn = max(knn_reports.items(), key=lambda kv: kv[1]["micro"].get("f1", 0))

    summary = {
        "version": "mechanical-feature-ml-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "embeddingModel": snap_manifest["model"],
        "embeddingVersion": snap_manifest.get("embeddingVersion"),
        "embeddingChecksum": snap_manifest["checksum"],
        "embeddingDimensions": snap_manifest["dimensions"],
        "trainingDatasetChecksum": load_json(SUP / "manifest.json").get("datasetChecksum"),
        "featureOntologyChecksum": load_json(SUP / "manifest.json").get("ontologyChecksum"),
        "randomSeed": SEED,
        "device": device,
        "gpu": gpu,
        "counts": {
            "train": len(id_tr),
            "validation": len(id_va),
            "holdout": len(id_ho),
            "features": len(feature_ids),
        },
        "baselines": {
            "frequency": freq_report,
            "knn": knn_reports,
            "bestKnnK": best_knn[0],
        },
        "linearProbe": {
            **linear_report,
            "epochs": 40,
            "batchSize": 256,
            "parameters": lin_params,
            "trainingSeconds": lin_time,
            "peakGpuMemory": lin_peak,
        },
        "mlp": {
            **mlp_report,
            "architecture": "D-256-128-F",
            "epochs": 40,
            "batchSize": 256,
            "parameters": mlp_params,
            "trainingSeconds": mlp_time,
            "peakGpuMemory": mlp_peak,
        },
        "mechanicalProjection": {
            "method": "linear projection + pairwise cosine supervised by shared-feature pairs",
            "dimensions": proj_dim,
            "objective": "MSE(cosine, +1 if share any positive feature else -1)",
            "trainingSeconds": proj_time,
            "neighborExamples": neighbor_examples,
        },
        "comparison": {
            "frequencyMicroF1": freq_report["micro"].get("f1VsUnlabeled"),
            "knn5MicroF1": knn5["micro"].get("f1VsUnlabeled"),
            "linearMicroF1": linear_report["micro"].get("f1VsUnlabeled"),
            "mlpMicroF1": mlp_report["micro"].get("f1VsUnlabeled"),
            "frequencyMAP": freq_report.get("mAP"),
            "knn5MAP": knn5.get("mAP"),
            "linearMAP": linear_report.get("mAP"),
            "mlpMAP": mlp_report.get("mAP"),
            "nonlinearHelped": (mlp_report["micro"].get("f1VsUnlabeled", 0) - linear_report["micro"].get("f1VsUnlabeled", 0)) > 0.02,
        },
        "featureIds": feature_ids,
    }
    (OUT / "report.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("comparison", "gpu", "counts")}, indent=2))


if __name__ == "__main__":
    os.chdir(WEB)
    main()

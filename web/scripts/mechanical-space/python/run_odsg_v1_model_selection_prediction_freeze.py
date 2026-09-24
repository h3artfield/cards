#!/usr/bin/env python3
"""
ODSG v1 model selection + FINAL_TEST prediction freeze.

Execute P3–P7 as one pipeline. No mid-run retuning.
FINAL_TEST winners stay sealed. No FINAL_TEST metrics.
"""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

import outcome_firewall_v1 as fw
from freeze_odsg_v1_training_procedure_amendment import main as freeze_amendment
from odsg_v1_architecture import INIT_SEED, parameter_counts
from odsg_v1_representation import INPUT_DIM
from odsg_v1_torch_models import (
    Model2,
    SharedStrength,
    build_model1,
    build_model2,
    interaction_l2,
)
from odsg_v1_winners import load_winner_seats
from outcome_firewall_v1 import (
    assert_odsg_v1_final_test_outcomes_absent,
    assert_odsg_v1_final_test_winners_locked,
)
from test_odsg_v1_architecture import run_selftest as architecture_selftest
from test_odsg_v1_final_test_firewall import main as firewall_selftest
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
PARENT = MS / "outcome-derived-strategic-geometry-v1"
REP = PARENT / "representation-architecture-freeze-v1"
AMEND = PARENT / "training-procedure-amendment-v1"
OUT = PARENT / "model-selection-prediction-freeze-v1"
PROTOCOL_SHA = "74b651a70a0860d9d4ffa3db2bb82310fdad4d14dc1995c60530e3654350a195"
ELIGIBLE_SHA = "c358398b47a6e49bf45936c9a89668926e220084e8d541b5fb87b821d91721e1"
XNORM_SHA = "9392f4f48ba64cc95c2e5bc1dc7e310718a115f751be34f6b27ec3d362892983"
LRS = [1e-4, 3e-4, 1e-3]
WDS = [1e-5, 1e-4, 1e-3]
RANKS = [2, 4, 8, 16, 32]
LAMBDAS = [1e-5, 1e-4, 1e-3, 1e-2]
MAX_EPOCHS = 40
PATIENCE = 5
BATCH = 32
LN4 = float(math.log(4.0))


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def git_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=WEB.parent).decode().strip()


def set_unlock(**flags) -> None:
    for k, v in flags.items():
        setattr(fw, k, v)
    if fw.ODSG_V1_DEV_WINNER_UNLOCKED and fw.ODSG_V1_VAL_WINNER_UNLOCKED:
        fw.ODSG_V1_DEV_VAL_WINNER_UNLOCKED = True
    write_json(
        OUT / "unlock-state.json",
        {
            "ODSG_V1_TRAINING_AUTHORIZED": fw.ODSG_V1_TRAINING_AUTHORIZED,
            "ODSG_V1_DEV_WINNER_UNLOCKED": fw.ODSG_V1_DEV_WINNER_UNLOCKED,
            "ODSG_V1_VAL_WINNER_UNLOCKED": fw.ODSG_V1_VAL_WINNER_UNLOCKED,
            "ODSG_V1_FINAL_TEST_WINNER_UNLOCKED": fw.ODSG_V1_FINAL_TEST_WINNER_UNLOCKED,
            "ODSG_V1_FINAL_PREDICTIONS_FROZEN": fw.ODSG_V1_FINAL_PREDICTIONS_FROZEN,
        },
    )


def state_bytes(model: torch.nn.Module) -> dict[str, torch.Tensor]:
    return {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}


def load_state(model: torch.nn.Module, state: dict[str, torch.Tensor]) -> None:
    model.load_state_dict(state)


def weight_sha(state: dict[str, torch.Tensor]) -> str:
    h = hashlib.sha256()
    for k in sorted(state):
        h.update(k.encode())
        h.update(state[k].contiguous().cpu().numpy().astype(np.float32).tobytes())
    return h.hexdigest()


def save_state(path: Path, state: dict[str, torch.Tensor]) -> None:
    torch.save({k: v.cpu() for k, v in state.items()}, path)


def pod_nll(logp: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    return F.nll_loss(logp, y, reduction="mean")


def metrics(probs: np.ndarray, y: np.ndarray) -> dict:
    p = np.clip(probs, 1e-12, 1.0)
    nll = float(-np.log(p[np.arange(len(y)), y]).mean())
    onehot = np.zeros_like(p)
    onehot[np.arange(len(y)), y] = 1.0
    return {
        "n": int(len(y)),
        "logloss": nll,
        "top1": float((p.argmax(1) == y).mean()),
        "brier": float(((p - onehot) ** 2).sum(1).mean()),
    }


def evaluate(model, X: torch.Tensor, y: torch.Tensor | None) -> tuple[np.ndarray, dict | None]:
    model.eval()
    probs = []
    with torch.no_grad():
        for i in range(0, X.shape[0], 256):
            u = model.utilities(X[i : i + 256])
            probs.append(torch.softmax(u, dim=-1).cpu().numpy())
    p = np.concatenate(probs, axis=0)
    if y is None:
        return p, None
    return p, metrics(p, y.cpu().numpy())


def train_candidate(
    model,
    x_fit: torch.Tensor,
    y_fit: torch.Tensor,
    x_es: torch.Tensor,
    y_es: torch.Tensor,
    lr: float,
    wd: float,
    lambda_i: float,
    device: torch.device,
    label: str,
) -> dict:
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=wd, betas=(0.9, 0.999), eps=1e-8)
    best_state = state_bytes(model)
    best_es = float("inf")
    best_epoch = 0
    stale = 0
    history = []
    n = x_fit.shape[0]
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        g = torch.Generator()
        g.manual_seed(INIT_SEED + epoch)
        perm = torch.randperm(n, generator=g)
        total = 0.0
        seen = 0
        for s in range(0, n, BATCH):
            idx = perm[s : s + BATCH]
            xb = x_fit[idx].to(device, non_blocking=True)
            yb = y_fit[idx].to(device, non_blocking=True)
            u = model.utilities(xb)
            loss = pod_nll(F.log_softmax(u, dim=-1), yb)
            if lambda_i and isinstance(model, Model2):
                loss = loss + lambda_i * interaction_l2(model)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            total += float(loss.detach()) * int(yb.shape[0])
            seen += int(yb.shape[0])
        _, es = evaluate(model, x_es, y_es)
        rec = {"epoch": epoch, "fitLoss": total / max(seen, 1), "earlyStopLogloss": es["logloss"]}
        history.append(rec)
        print(f"    {label} epoch {epoch} fit={rec['fitLoss']:.4f} es={es['logloss']:.4f}", flush=True)
        if es["logloss"] < best_es - 1e-12:
            best_es = es["logloss"]
            best_epoch = epoch
            best_state = state_bytes(model)
            stale = 0
        else:
            stale += 1
            if stale >= PATIENCE:
                break
    load_state(model, best_state)
    return {
        "bestEpoch": best_epoch,
        "bestEarlyStopLogloss": best_es,
        "history": history,
        "weightSha256": weight_sha(best_state),
        "state": best_state,
    }


def model1_configs() -> list[dict]:
    out = []
    for wd_i, wd in enumerate(WDS):
        for lr_i, lr in enumerate(LRS):
            out.append({"id": f"m1_wd{wd_i}_lr{lr_i}", "wdIndex": wd_i, "lrIndex": lr_i, "weightDecay": wd, "lr": lr})
    return out


def model2_configs() -> list[dict]:
    out = []
    for r_i, r in enumerate(RANKS):
        for l_i, lam in enumerate(LAMBDAS):
            out.append({"id": f"m2_r{r}_l{l_i}", "rankIndex": r_i, "lambdaIndex": l_i, "rank": r, "lambdaI": lam})
    return out


def select_min(rows: list[dict], keys: list[str]) -> dict:
    return min(rows, key=lambda r: tuple(r[k] for k in keys))


def build_pack(
    pods: list[dict],
    instance_hash: dict[str, str],
    row_of: dict[str, int],
    Xn: np.ndarray,
    seats: dict[str, int] | None,
) -> tuple[list[str], np.ndarray, np.ndarray | None]:
    ids = [p["podId"] for p in pods]
    x = np.zeros((len(pods), 4, INPUT_DIM), dtype=np.float32)
    y = np.zeros(len(pods), dtype=np.int64) if seats is not None else None
    for i, p in enumerate(pods):
        for j, did in enumerate(p["deckInstanceIds"]):
            x[i, j] = Xn[row_of[instance_hash[did]]]
        if seats is not None:
            y[i] = seats[p["podId"]]
    return ids, x, y


def main() -> None:
    t0 = time.time()
    architecture_selftest()
    firewall_selftest()
    if sha256_file(PARENT / "PROTOCOL.json") != PROTOCOL_SHA:
        raise SystemExit("PROTOCOL.json sha changed")
    if sha256_file(PARENT / "eligible-pods.json") != ELIGIBLE_SHA:
        raise SystemExit("eligible-pods.json sha changed")
    if sha256_file(REP / "x_norm.f32") != XNORM_SHA:
        raise SystemExit("x_norm.f32 sha changed")
    assert_odsg_v1_final_test_winners_locked()
    if fw.ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise SystemExit("FINAL_TEST winners must stay locked")

    print("  freeze training-procedure amendment", flush=True)
    amend = freeze_amendment()
    OUT.mkdir(parents=True, exist_ok=True)
    set_unlock(
        ODSG_V1_TRAINING_AUTHORIZED=True,
        ODSG_V1_DEV_WINNER_UNLOCKED=False,
        ODSG_V1_VAL_WINNER_UNLOCKED=False,
        ODSG_V1_FINAL_TEST_WINNER_UNLOCKED=False,
        ODSG_V1_FINAL_PREDICTIONS_FROZEN=False,
    )

    print("  load representation + pods", flush=True)
    hashes = [ln for ln in (REP / "exact-list-hashes.txt").read_text(encoding="utf-8").splitlines() if ln]
    row_of = {h: i for i, h in enumerate(hashes)}
    Xn = np.fromfile(REP / "x_norm.f32", dtype=np.float32).reshape(len(hashes), INPUT_DIM)
    instance_hash = {}
    for line in (REP / "instance-hash-map.jsonl").read_text(encoding="utf-8").splitlines():
        rec = json.loads(line)
        instance_hash[rec["deckInstanceId"]] = rec["exactListHash"]
    pod_hash = {}
    for line in (REP / "pod-exact-hashes.jsonl").read_text(encoding="utf-8").splitlines():
        rec = json.loads(line)
        pod_hash[rec["podId"]] = rec["exactListHashes"]
    pods = load_json(PARENT / "eligible-pods.json")["pods"]
    assert_odsg_v1_final_test_outcomes_absent({"pods": pods[:3]}, "dataset_loader")
    split = load_json(AMEND / "development-internal-split.json")
    fit_ids = set(split["fitPodIds"])
    es_ids = set(split["earlyStopPodIds"])
    strict = set(load_json(REP / "FINAL_TEST_STRICT_UNSEEN_EXACT_4.json")["podIds"])
    by_part = {"DEVELOPMENT": [], "VALIDATION": [], "FINAL_TEST": []}
    for p in pods:
        by_part[p["partition"]].append(p)
    fit_pods = [p for p in by_part["DEVELOPMENT"] if p["podId"] in fit_ids]
    es_pods = [p for p in by_part["DEVELOPMENT"] if p["podId"] in es_ids]
    if len(fit_pods) != split["nFitPods"] or len(es_pods) != split["nEarlyStopPods"]:
        raise SystemExit("internal split pod counts drifted")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  device {device}", flush=True)

    set_unlock(ODSG_V1_DEV_WINNER_UNLOCKED=True, ODSG_V1_VAL_WINNER_UNLOCKED=False)
    print("  unlock DEVELOPMENT winners", flush=True)
    dev_seats = load_winner_seats(pods, {"DEVELOPMENT"})
    write_json(OUT / "winner-seats-development.json", {"n": len(dev_seats), "seats": dev_seats})

    _, x_fit_np, y_fit_np = build_pack(fit_pods, instance_hash, row_of, Xn, dev_seats)
    _, x_es_np, y_es_np = build_pack(es_pods, instance_hash, row_of, Xn, dev_seats)
    x_fit = torch.from_numpy(x_fit_np).to(device)
    y_fit = torch.from_numpy(y_fit_np).to(device)
    x_es = torch.from_numpy(x_es_np).to(device)
    y_es = torch.from_numpy(y_es_np).to(device)

    print("  train Model 1 candidates", flush=True)
    m1_rows = []
    for cfg in model1_configs():
        model = build_model1(INPUT_DIM, device)
        rec = train_candidate(model, x_fit, y_fit, x_es, y_es, cfg["lr"], cfg["weightDecay"], 0.0, device, cfg["id"])
        save_state(OUT / f"{cfg['id']}.pt", rec["state"])
        m1_rows.append({**cfg, **{k: rec[k] for k in ("bestEpoch", "bestEarlyStopLogloss", "weightSha256", "history")}})
        write_json(OUT / "model1-candidates.json", {"n": len(m1_rows), "candidates": m1_rows})

    set_unlock(ODSG_V1_VAL_WINNER_UNLOCKED=True)
    print("  unlock VALIDATION winners", flush=True)
    val_seats = load_winner_seats(pods, {"VALIDATION"})
    write_json(OUT / "winner-seats-validation.json", {"n": len(val_seats), "seats": val_seats})
    _, x_val_np, y_val_np = build_pack(by_part["VALIDATION"], instance_hash, row_of, Xn, val_seats)
    _, x_dev_np, y_dev_np = build_pack(by_part["DEVELOPMENT"], instance_hash, row_of, Xn, dev_seats)
    x_val = torch.from_numpy(x_val_np).to(device)
    y_val = torch.from_numpy(y_val_np).to(device)
    x_dev = torch.from_numpy(x_dev_np).to(device)
    y_dev = torch.from_numpy(y_dev_np).to(device)

    for row in m1_rows:
        model = build_model1(INPUT_DIM, device)
        load_state(model, torch.load(OUT / f"{row['id']}.pt", map_location=device))
        _, val_m = evaluate(model, x_val, y_val)
        row["valLogloss"] = val_m["logloss"]
        row["valTop1"] = val_m["top1"]
        row["valBrier"] = val_m["brier"]
    write_json(OUT / "model1-candidates.json", {"n": len(m1_rows), "candidates": m1_rows})
    selected1 = select_min(m1_rows, ["valLogloss", "wdIndex", "lrIndex"])
    spec1 = {
        "MODEL1_SPEC_SELECTED": True,
        "id": selected1["id"],
        "lr": selected1["lr"],
        "weightDecay": selected1["weightDecay"],
        "bestEpoch": selected1["bestEpoch"],
        "backbone": "Dense256-GELU-Dense128-GELU-linear StrengthHead",
        "parameterCount": parameter_counts(INPUT_DIM, 8)["model1"],
        "valLogloss": selected1["valLogloss"],
        "tieRule": "min VAL logloss, then lower wd index, then lower lr index",
    }
    write_json(OUT / "MODEL1_SPEC_SELECTED.json", spec1)

    print("  train Model 2 candidates", flush=True)
    m2_rows = []
    for cfg in model2_configs():
        model = build_model2(INPUT_DIM, cfg["rank"], device)
        rec = train_candidate(
            model,
            x_fit,
            y_fit,
            x_es,
            y_es,
            selected1["lr"],
            selected1["weightDecay"],
            cfg["lambdaI"],
            device,
            cfg["id"],
        )
        save_state(OUT / f"{cfg['id']}.pt", rec["state"])
        m2_rows.append({**cfg, **{k: rec[k] for k in ("bestEpoch", "bestEarlyStopLogloss", "weightSha256", "history")}})
        write_json(OUT / "model2-candidates.json", {"n": len(m2_rows), "candidates": m2_rows})

    for row in m2_rows:
        model = build_model2(INPUT_DIM, row["rank"], device)
        load_state(model, torch.load(OUT / f"{row['id']}.pt", map_location=device))
        _, val_m = evaluate(model, x_val, y_val)
        row["valLogloss"] = val_m["logloss"]
        row["valTop1"] = val_m["top1"]
        row["valBrier"] = val_m["brier"]
    write_json(OUT / "model2-candidates.json", {"n": len(m2_rows), "candidates": m2_rows})
    selected2 = select_min(m2_rows, ["valLogloss", "rankIndex", "lambdaIndex"])
    spec2 = {
        "MODEL2_SPEC_SELECTED": True,
        "id": selected2["id"],
        "rank": selected2["rank"],
        "lambdaI": selected2["lambdaI"],
        "lr": selected1["lr"],
        "weightDecay": selected1["weightDecay"],
        "bestEpoch": selected2["bestEpoch"],
        "parameterCount": parameter_counts(INPUT_DIM, selected2["rank"])["model2"],
        "valLogloss": selected2["valLogloss"],
        "inheritsModel1Backbone": True,
        "tieRule": "min VAL logloss, then lower rank index, then lower lambda_I index",
    }
    write_json(OUT / "MODEL2_SPEC_SELECTED.json", spec2)

    print("  final refit DEVELOPMENT+VALIDATION, no early stop", flush=True)
    x_ref = torch.from_numpy(np.concatenate([x_dev_np, x_val_np], axis=0))
    y_ref = torch.from_numpy(np.concatenate([y_dev_np, y_val_np], axis=0))

    def refit(build, epochs, lambda_i, label):
        model = build()
        opt = torch.optim.AdamW(
            model.parameters(),
            lr=selected1["lr"],
            weight_decay=selected1["weightDecay"],
            betas=(0.9, 0.999),
            eps=1e-8,
        )
        n = x_ref.shape[0]
        n_ep = max(1, int(epochs))
        for epoch in range(1, n_ep + 1):
            model.train()
            g = torch.Generator()
            g.manual_seed(INIT_SEED + epoch)
            perm = torch.randperm(n, generator=g)
            total = 0.0
            for s in range(0, n, BATCH):
                idx = perm[s : s + BATCH]
                xb = x_ref[idx].to(device, non_blocking=True)
                yb = y_ref[idx].to(device, non_blocking=True)
                u = model.utilities(xb)
                loss = pod_nll(F.log_softmax(u, dim=-1), yb)
                if lambda_i and isinstance(model, Model2):
                    loss = loss + lambda_i * interaction_l2(model)
                opt.zero_grad(set_to_none=True)
                loss.backward()
                opt.step()
                total += float(loss.detach()) * int(yb.shape[0])
            print(f"    {label} refit epoch {epoch}/{n_ep} loss={total / n:.4f}", flush=True)
        st = state_bytes(model)
        return model, st

    model1, st1 = refit(lambda: build_model1(INPUT_DIM, device), selected1["bestEpoch"], 0.0, "model1")
    model2, st2 = refit(
        lambda: build_model2(INPUT_DIM, selected2["rank"], device),
        selected2["bestEpoch"],
        selected2["lambdaI"],
        "model2",
    )
    save_state(OUT / "model1-final.pt", st1)
    save_state(OUT / "model2-final.pt", st2)
    sha1 = weight_sha(st1)
    sha2 = weight_sha(st2)

    p0_dev = {"logloss": LN4, "top1": 0.25, "brier": 0.75, "n": len(y_dev_np)}
    p0_val = {"logloss": LN4, "top1": 0.25, "brier": 0.75, "n": len(y_val_np)}
    _, m1_dev = evaluate(model1, x_dev, y_dev)
    _, m1_val = evaluate(model1, x_val, y_val)
    _, m2_dev = evaluate(model2, x_dev, y_dev)
    _, m2_val = evaluate(model2, x_val, y_val)

    print("  FINAL_TEST predictions; winners remain sealed", flush=True)
    assert_odsg_v1_final_test_winners_locked()
    if fw.ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise SystemExit("FINAL_TEST unlock leaked")
    final_pods = by_part["FINAL_TEST"]
    if len(final_pods) != 5712:
        raise SystemExit("FINAL_TEST pod count drifted")
    for p in final_pods:
        assert_odsg_v1_final_test_outcomes_absent(p, "dataset_loader")
    ids_f, x_f_np, y_f = build_pack(final_pods, instance_hash, row_of, Xn, None)
    if y_f is not None:
        raise SystemExit("FINAL_TEST targets must not exist")
    x_f = torch.from_numpy(x_f_np).to(device)
    p1, _ = evaluate(model1, x_f, None)
    p2, _ = evaluate(model2, x_f, None)
    rows = []
    for i, p in enumerate(final_pods):
        rec = {
            "podId": p["podId"],
            "tid": p["tid"],
            "exactListHashes": pod_hash[p["podId"]],
            "strictUnseenExact4": p["podId"] in strict,
            "pModel1": [float(x) for x in p1[i]],
            "pModel2": [float(x) for x in p2[i]],
        }
        assert_odsg_v1_final_test_outcomes_absent(rec, "prediction_writer")
        rows.append(rec)
    if sum(1 for r in rows if r["strictUnseenExact4"]) != 4012:
        raise SystemExit("strict-unseen membership drifted")
    write_json(
        OUT / "final-test-predictions.json",
        {
            "n": 5712,
            "nStrictUnseenExact4": 4012,
            "ODSG_V1_FINAL_TEST_WINNER_UNLOCKED": False,
            "metricsComputed": False,
            "pods": rows,
        },
    )
    p1.tofile(OUT / "final-test-p-model1.f32")
    p2.tofile(OUT / "final-test-p-model2.f32")

    diag = {
        "note": "DEV/VAL diagnostics after final refit are in-sample for those partitions. They cannot change the search.",
        "model0": {"DEVELOPMENT": p0_dev, "VALIDATION": p0_val},
        "model1FinalRefit": {"DEVELOPMENT": m1_dev, "VALIDATION": m1_val},
        "model2FinalRefit": {"DEVELOPMENT": m2_dev, "VALIDATION": m2_val},
        "selectedModel1CandidateVal": {k: selected1[k] for k in ("id", "valLogloss", "valTop1", "valBrier", "bestEpoch")},
        "selectedModel2CandidateVal": {k: selected2[k] for k in ("id", "valLogloss", "valTop1", "valBrier", "bestEpoch")},
    }
    write_json(OUT / "pre-final-diagnostics.json", diag)

    fw.ODSG_V1_FINAL_PREDICTIONS_FROZEN = True
    set_unlock(ODSG_V1_FINAL_PREDICTIONS_FROZEN=True, ODSG_V1_FINAL_TEST_WINNER_UNLOCKED=False)
    sha_p1 = sha256_file(OUT / "final-test-p-model1.f32")
    sha_p2 = sha256_file(OUT / "final-test-p-model2.f32")
    sha_pred = sha256_file(OUT / "final-test-predictions.json")
    bundle = {
        "protocolSha256": PROTOCOL_SHA,
        "representationXNormSha256": XNORM_SHA,
        "amendmentSha256": amend["amendmentSha256"],
        "internalSplitSha256": amend["checksums"]["internalSplit"],
        "model1WeightsSha256": sha1,
        "model2WeightsSha256": sha2,
        "model1PredictionsSha256": sha_p1,
        "model2PredictionsSha256": sha_p2,
        "predictionsJsonSha256": sha_pred,
        "gitSha": git_sha(),
        "nFinalTest": 5712,
        "nStrictUnseenExact4": 4012,
    }
    write_json(OUT / "config-bundle.json", {**bundle, **spec1, **{f"m2_{k}": v for k, v in spec2.items()}})
    combined = sha256_bytes(json.dumps(bundle, sort_keys=True).encode())
    report = {
        "artifactType": "OdsgV1ModelSelectionPredictionFreeze",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsedSec": time.time() - t0,
        "TRAINING_PROCEDURE": {
            "nFitEvents": amend["nFitEvents"],
            "nEarlyStopEvents": amend["nEarlyStopEvents"],
            "nFitPods": amend["nFitPods"],
            "nEarlyStopPods": amend["nEarlyStopPods"],
            "amendmentSha256": amend["amendmentSha256"],
        },
        "MODEL1": {
            "valLoglosses": [{k: r[k] for k in ("id", "lr", "weightDecay", "bestEpoch", "valLogloss")} for r in m1_rows],
            "selected": spec1,
            "finalParameterCount": spec1["parameterCount"],
            "finalWeightSha256": sha1,
        },
        "MODEL2": {
            "valLoglosses": [
                {k: r[k] for k in ("id", "rank", "lambdaI", "bestEpoch", "valLogloss")} for r in m2_rows
            ],
            "selected": spec2,
            "finalParameterCount": spec2["parameterCount"],
            "finalWeightSha256": sha2,
        },
        "PRE_FINAL_DIAGNOSTICS": diag,
        "FINAL_FREEZE": {
            "nFinalTest": 5712,
            "nStrictUnseenExact4": 4012,
            "model1PredictionSha256": sha_p1,
            "model2PredictionSha256": sha_p2,
            "predictionsJsonSha256": sha_pred,
            "combinedPredictionFreezeSha256": combined,
            "gitSha": bundle["gitSha"],
        },
        "FINAL_TEST_WINNERS_OPENED": "NO",
        "FINAL_TEST_METRICS_COMPUTED": "NO",
        "ODSG_V1_FINAL_PREDICTIONS_FROZEN": True,
    }
    write_json(OUT / "REPORT.json", report)
    checks = {
        "report": sha256_file(OUT / "REPORT.json"),
        "model1Final": sha256_file(OUT / "model1-final.pt"),
        "model2Final": sha256_file(OUT / "model2-final.pt"),
        "pModel1": sha_p1,
        "pModel2": sha_p2,
        "predictions": sha_pred,
        "combined": combined,
        "spec1": sha256_file(OUT / "MODEL1_SPEC_SELECTED.json"),
        "spec2": sha256_file(OUT / "MODEL2_SPEC_SELECTED.json"),
    }
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(
        OUT / "PREDICTION_FROZEN.json",
        {
            "ODSG_V1_FINAL_PREDICTIONS_FROZEN": True,
            "ODSG_V1_FINAL_TEST_WINNER_UNLOCKED": False,
            "combinedPredictionFreezeSha256": combined,
            "n": 5712,
        },
    )
    write_json(
        PARENT / "FINAL_PREDICTIONS_FROZEN.json",
        {
            "ODSG_V1_FINAL_PREDICTIONS_FROZEN": True,
            "FINAL_TEST_WINNERS_OPENED": "NO",
            "dir": "model-selection-prediction-freeze-v1",
            "combinedPredictionFreezeSha256": combined,
        },
    )
    print(json.dumps({k: report[k] for k in ("FINAL_TEST_WINNERS_OPENED", "ODSG_V1_FINAL_PREDICTIONS_FROZEN", "FINAL_FREEZE")}, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
ODSG v1 FINAL_TEST winner reveal + primary adjudication.

Does not retrain, refit, recalibrate, or regenerate predictions.
Does not inspect I(A,B) geometry.
"""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

import outcome_firewall_v1 as fw
from odsg_v1_winners import load_winner_seats
from outcome_firewall_v1 import require_odsg_v1_final_test_winners_unlocked
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
PARENT = MS / "outcome-derived-strategic-geometry-v1"
PRED = PARENT / "model-selection-prediction-freeze-v1"
OUT = PARENT / "final-test-adjudication-v1"

EXP_P1 = "6e4c3bcf4fb093bf040edbf18b799754774d0211ba18639c0beac632966c8e57"
EXP_P2 = "86e29ff4c4a7ed9cbafa956c17978ddfc4bd8289f0516dea037d30447b421ccd"
EXP_COMBINED = "304302b0a188c482347a29de738f00331980c27ec8357a1a6b42b1d67f77c635"
EXP_GIT = "50789e02c667f2150ae70adc3ca92ec8f743942b"
PROTOCOL_SHA = "74b651a70a0860d9d4ffa3db2bb82310fdad4d14dc1995c60530e3654350a195"
N_BOOT = 10000
BOOT_SEED = 20260821
LN4 = float(math.log(4.0))
EPS = 1e-12


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def git_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=WEB.parent).decode().strip()


def verify_frozen_predictions() -> dict:
    p1 = sha256_file(PRED / "final-test-p-model1.f32")
    p2 = sha256_file(PRED / "final-test-p-model2.f32")
    pj = sha256_file(PRED / "final-test-predictions.json")
    git = git_sha()
    bundle = {
        "protocolSha256": PROTOCOL_SHA,
        "representationXNormSha256": "9392f4f48ba64cc95c2e5bc1dc7e310718a115f751be34f6b27ec3d362892983",
        "amendmentSha256": "71e9a39c6892702f15ecd12d7d9a0feb33d9993c0f41f27e10148579f769e926",
        "internalSplitSha256": "f5186558420ce1c961bc321f8d2e59760945b6125d99035d4ed3aee66780b69b",
        "model1WeightsSha256": "fe71832c1ad3948ad7a15a333ab4c331055800597c3adb117247b8801e20b5d1",
        "model2WeightsSha256": "d3794fe531fc64d043e32f11b7ac80579ddb8e26b82845d4fcf01f6306f346b8",
        "model1PredictionsSha256": p1,
        "model2PredictionsSha256": p2,
        "predictionsJsonSha256": pj,
        "gitSha": git,
        "nFinalTest": 5712,
        "nStrictUnseenExact4": 4012,
    }
    combined = sha256_bytes(json.dumps(bundle, sort_keys=True).encode())
    checks = {
        "model1Predictions": {"expected": EXP_P1, "actual": p1, "match": p1 == EXP_P1},
        "model2Predictions": {"expected": EXP_P2, "actual": p2, "match": p2 == EXP_P2},
        "combinedPredictionFreeze": {"expected": EXP_COMBINED, "actual": combined, "match": combined == EXP_COMBINED},
        "gitSha": {"expected": EXP_GIT, "actual": git, "match": git == EXP_GIT},
        "predictionsJsonSha256": pj,
    }
    if not all(checks[k]["match"] for k in ("model1Predictions", "model2Predictions", "combinedPredictionFreeze", "gitSha")):
        write_json(OUT / "HASH_MISMATCH_STOP.json", checks)
        raise SystemExit("STOP AND REPORT: frozen prediction artifact hash mismatch; predictions not regenerated")
    return checks


def scores(p: np.ndarray, y: np.ndarray) -> dict:
    p = np.clip(p, EPS, 1.0)
    ll = -np.log(p[np.arange(len(y)), y])
    onehot = np.zeros_like(p)
    onehot[np.arange(len(y)), y] = 1.0
    return {
        "logloss": float(ll.mean()),
        "top1": float((p.argmax(1) == y).mean()),
        "brier": float(((p - onehot) ** 2).sum(1).mean()),
        "ll": ll,
    }


def calibration(p: np.ndarray, y: np.ndarray, n_bins: int = 10) -> dict:
    conf = p.max(axis=1)
    hit = (p.argmax(1) == y).astype(np.float64)
    pw = p[np.arange(len(y)), y]
    edges = np.linspace(0.0, 1.0, n_bins + 1)

    def bins(values: np.ndarray, outcomes: np.ndarray) -> list[dict]:
        out = []
        ece = 0.0
        for i in range(n_bins):
            lo, hi = edges[i], edges[i + 1]
            mask = (values >= lo) & (values < hi) if i < n_bins - 1 else (values >= lo) & (values <= hi)
            n = int(mask.sum())
            mean_p = float(values[mask].mean()) if n else None
            emp = float(outcomes[mask].mean()) if n else None
            rec = {"bin": [float(lo), float(hi)], "n": n, "meanPredicted": mean_p, "empirical": emp}
            out.append(rec)
            if n:
                ece += (n / len(values)) * abs(mean_p - emp)
        return out, float(ece)

    max_bins, ece_max = bins(conf, hit)
    return {
        "nBins": n_bins,
        "predictedClassReliability": max_bins,
        "ecePredictedClass": ece_max,
        "meanPWinner": float(pw.mean()),
        "pWinnerQuartiles": [float(np.percentile(pw, q)) for q in (25, 50, 75)],
    }


def event_clustered_delta(ll1: np.ndarray, ll2: np.ndarray, event_idx: list[np.ndarray], seed: int) -> dict:
    delta = ll1 - ll2
    rng = np.random.default_rng(seed)
    n_ev = len(event_idx)
    stats = np.empty(N_BOOT, dtype=np.float64)
    for b in range(N_BOOT):
        pick = rng.integers(0, n_ev, size=n_ev)
        parts = [delta[event_idx[i]] for i in pick]
        stats[b] = float(np.concatenate(parts).mean()) if parts else float("nan")
    lo, hi = float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5))
    return {
        "nResamples": N_BOOT,
        "seed": seed,
        "cluster": "tid",
        "point": float(delta.mean()),
        "ci95": [lo, hi],
        "meanBootstrap": float(stats.mean()),
    }


def sg_call(ci: list[float]) -> str:
    lo, hi = ci
    if lo > 0:
        return "SG1_MATCHUP_SIGNAL"
    if hi < 0:
        return "SG3_INTERACTION_MODEL_WORSE"
    return "SG2_NO_ESTABLISHED_MATCHUP_SIGNAL"


def main() -> None:
    print("  verify frozen prediction hashes", flush=True)
    provenance = verify_frozen_predictions()
    if not fw.ODSG_V1_FINAL_PREDICTIONS_FROZEN:
        raise SystemExit("predictions are not frozen")
    require_odsg_v1_final_test_winners_unlocked("FINAL_TEST winner reveal")

    pred = load_json(PRED / "final-test-predictions.json")
    if pred["n"] != 5712 or pred.get("metricsComputed") is not False:
        raise SystemExit("frozen prediction object drifted")
    p1 = np.fromfile(PRED / "final-test-p-model1.f32", dtype=np.float32).reshape(5712, 4)
    p2 = np.fromfile(PRED / "final-test-p-model2.f32", dtype=np.float32).reshape(5712, 4)
    if sha256_file(PRED / "final-test-p-model1.f32") != EXP_P1 or sha256_file(PRED / "final-test-p-model2.f32") != EXP_P2:
        raise SystemExit("prediction files changed after initial verify")

    eligible = load_json(PARENT / "eligible-pods.json")["pods"]
    final_pods = [p for p in eligible if p["partition"] == "FINAL_TEST"]
    if [p["podId"] for p in final_pods] != [r["podId"] for r in pred["pods"]]:
        raise SystemExit("FINAL_TEST pod order does not match frozen predictions")
    if len(final_pods) != 5712:
        raise SystemExit("FINAL_TEST count drifted")

    print("  reveal FINAL_TEST winners only", flush=True)
    seats = load_winner_seats(final_pods, {"FINAL_TEST"})
    corruptions = []
    y = np.zeros(5712, dtype=np.int64)
    for i, row in enumerate(pred["pods"]):
        pid = row["podId"]
        if pid not in seats:
            corruptions.append({"podId": pid, "reason": "missing_winner"})
            continue
        y[i] = seats[pid]
        if not (0 <= y[i] < 4):
            corruptions.append({"podId": pid, "reason": "winner_seat_out_of_range", "seat": int(y[i])})
    if corruptions:
        write_json(OUT / "corruptions.json", {"n": len(corruptions), "rows": corruptions})
        raise SystemExit(f"enumerated {len(corruptions)} FINAL_TEST winner join problems; not silently dropped")

    p0 = np.full((5712, 4), 0.25, dtype=np.float64)
    s0 = scores(p0, y)
    s1 = scores(p1.astype(np.float64), y)
    s2 = scores(p2.astype(np.float64), y)
    delta = s1["ll"] - s2["ll"]
    events = [row["tid"] for row in pred["pods"]]
    by_ev: dict[str, list[int]] = defaultdict(list)
    for i, tid in enumerate(events):
        by_ev[tid].append(i)
    ev_ids = sorted(by_ev)
    ev_idx = [np.asarray(by_ev[t], dtype=np.int64) for t in ev_ids]
    boot = event_clustered_delta(s1["ll"], s2["ll"], ev_idx, BOOT_SEED)
    call = sg_call(boot["ci95"])

    ev_delta = np.array([float(delta[by_ev[t]].mean()) for t in ev_ids], dtype=np.float64)
    ev_ll1 = np.array([float(s1["ll"][by_ev[t]].mean()) for t in ev_ids])
    ev_ll2 = np.array([float(s2["ll"][by_ev[t]].mean()) for t in ev_ids])
    event_dist = {
        "nEvents": len(ev_ids),
        "nEventsModel2Improves": int((ev_delta > 0).sum()),
        "nEventsModel1Improves": int((ev_delta < 0).sum()),
        "nEventsTie": int((ev_delta == 0).sum()),
        "medianEventDelta": float(np.median(ev_delta)),
        "q1EventDelta": float(np.percentile(ev_delta, 25)),
        "q3EventDelta": float(np.percentile(ev_delta, 75)),
        "meanEventDeltaUnweighted": float(ev_delta.mean()),
        "eventLogloss": {
            "model1": {
                "median": float(np.median(ev_ll1)),
                "q1": float(np.percentile(ev_ll1, 25)),
                "q3": float(np.percentile(ev_ll1, 75)),
            },
            "model2": {
                "median": float(np.median(ev_ll2)),
                "q1": float(np.percentile(ev_ll2, 25)),
                "q3": float(np.percentile(ev_ll2, 75)),
            },
        },
        "descriptiveOnly": True,
        "doNotSearchSubgroups": True,
    }

    strict_mask = np.array([bool(r["strictUnseenExact4"]) for r in pred["pods"]], dtype=bool)
    if int(strict_mask.sum()) != 4012:
        raise SystemExit("strict-unseen membership drifted")
    ys, p1s, p2s = y[strict_mask], p1[strict_mask], p2[strict_mask]
    ss0, ss1, ss2 = scores(np.full((4012, 4), 0.25), ys), scores(p1s.astype(np.float64), ys), scores(p2s.astype(np.float64), ys)
    strict_events = [pred["pods"][i]["tid"] for i, m in enumerate(strict_mask) if m]
    by_sev: dict[str, list[int]] = defaultdict(list)
    for j, tid in enumerate(strict_events):
        by_sev[tid].append(j)
    sev_ids = sorted(by_sev)
    sev_idx = [np.asarray(by_sev[t], dtype=np.int64) for t in sev_ids]
    sboot = event_clustered_delta(ss1["ll"], ss2["ll"], sev_idx, BOOT_SEED)
    primary_lo, primary_hi = boot["ci95"]
    strict_lo, strict_hi = sboot["ci95"]
    if (primary_lo > 0 and strict_lo > 0) or (primary_hi < 0 and strict_hi < 0) or (
        primary_lo <= 0 <= primary_hi and strict_lo <= 0 <= strict_hi
    ):
        consistency = "direction_and_uncertainty_consistent_with_primary"
    elif (boot["point"] > 0) == (sboot["point"] > 0):
        consistency = "same_point_direction_uncertainty_differs"
    else:
        consistency = "point_direction_inconsistent_with_primary"

    primary = {
        "model0Logloss": s0["logloss"],
        "model1Logloss": s1["logloss"],
        "model2Logloss": s2["logloss"],
        "delta": float(delta.mean()),
        "bootstrap": boot,
        "call": call,
        "SG1_MATCHUP_SIGNAL": call == "SG1_MATCHUP_SIGNAL",
        "SG2_NO_ESTABLISHED_MATCHUP_SIGNAL": call == "SG2_NO_ESTABLISHED_MATCHUP_SIGNAL",
        "SG3_INTERACTION_MODEL_WORSE": call == "SG3_INTERACTION_MODEL_WORSE",
    }
    secondary = {
        "cannotOverrideSgCall": True,
        "top1": {"model0": s0["top1"], "model1": s1["top1"], "model2": s2["top1"]},
        "brier": {"model0": s0["brier"], "model1": s1["brier"], "model2": s2["brier"]},
        "calibration": {
            "model0": calibration(p0, y),
            "model1": calibration(p1.astype(np.float64), y),
            "model2": calibration(p2.astype(np.float64), y),
        },
        "eventLevel": event_dist,
    }
    strict = {
        "label": "STRICT_EXACT_LIST_NOVELTY_SENSITIVITY",
        "replacesPrimary": False,
        "createsSeparateRpsGate": False,
        "nPods": 4012,
        "nEvents": len(sev_ids),
        "model0Logloss": ss0["logloss"],
        "model1Logloss": ss1["logloss"],
        "model2Logloss": ss2["logloss"],
        "delta": float((ss1["ll"] - ss2["ll"]).mean()),
        "bootstrap": sboot,
        "consistencyWithPrimary": consistency,
    }
    report = {
        "artifactType": "OdsgV1FinalTestAdjudication",
        "lineage": "OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "PROVENANCE": {
            "predictionHashesVerifiedBeforeReveal": True,
            "hashes": provenance,
            "nFinalTestPods": 5712,
            "nFinalTestEvents": len(ev_ids),
            "winnerCoverage": {"nJoined": 5712, "nMissing": 0},
            "corruptionExclusions": [],
            "predictionsRegenerated": False,
            "modelsChangedAfterReveal": False,
        },
        "PRIMARY": primary,
        "SECONDARY": secondary,
        "STRICT_UNSEEN": strict,
        "FINAL_TEST_WINNERS_OPENED": "YES",
        "MODEL_PREDICTIONS_CHANGED_AFTER_REVEAL": "NO",
        "cycleGeometryInspected": False,
        "I_AB_inspected": False,
    }
    write_json(OUT / "REPORT.json", report)
    write_json(OUT / "primary.json", primary)
    write_json(OUT / "secondary.json", secondary)
    write_json(OUT / "strict-unseen.json", strict)
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "call": call,
            "delta": primary["delta"],
            "ci95": boot["ci95"],
            "modelsChangedAfterReveal": False,
            "cycleGeometryAuthorized": False,
        },
    )
    (OUT / "checksums.txt").write_text(
        "\n".join(
            f"{k} {sha256_file(OUT / name)}"
            for k, name in (
                ("report", "REPORT.json"),
                ("primary", "primary.json"),
                ("secondary", "secondary.json"),
                ("strict", "strict-unseen.json"),
            )
        )
        + "\n",
        encoding="utf-8",
    )
    write_json(
        PARENT / "FINAL_TEST_ADJUDICATED.json",
        {
            "call": call,
            "delta": primary["delta"],
            "ci95": boot["ci95"],
            "FINAL_TEST_WINNERS_OPENED": "YES",
            "MODEL_PREDICTIONS_CHANGED_AFTER_REVEAL": "NO",
        },
    )
    print(json.dumps({"call": call, "delta": primary["delta"], "ci95": boot["ci95"], "strict": strict["consistencyWithPrimary"]}, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
COS_V2_FINAL_TEST reveal + adjudication.

No refit, recalibration, feature edit, threshold change, or model selection.
Does not open CMMG reserved winners. Does not change COS v1 or Professor.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np

from cos_v2_lib import COS1, COS2, TOPDECK, calibration_bins, commander_identity
from freeze_cmmg_v1_dataset_protocol import winner_field_present
from odsg_v1_winners import winner_deck_instance_id
from outcome_firewall_v1 import assert_cmmg_v1_reserved_winners_locked
from run_spellbook_historical_outcome_association_v1 import sha256_file, write_json
from train_experiments import load_json

DEV = COS2 / "development"
OUT = COS2 / "final-test-adjudication-v1"
N_BOOT = 10000
BOOT_SEED = 20260821
MATERIAL_ECE = 0.02  # same material-regression band used at V2 selection; frozen before reveal

EXPECTED = {
    "nEvents": 33,
    "nPods": 236,
    "FORMULA.json": "3a4fd5becd2a0d489f57854b3d1b10cf0ea33b389a099ae6c96f7de7b91a2a3a",
    "SCHEMA.json": "1844ad083a08823c0cd320fcd52b857479847cc1e10ffc7a893317b95d8a4f09",
    "MODEL.json": "e710aefc519589913a467951d85ee233a636c69d77b6b5f3097be977ddcede88",
    "REFERENCE.json": "3a63868a144094036527966301a96c0dd3cf072097c079eaf9e34e1d7e032d87",
    "FINAL_TEST_PREDICTIONS.json": "14e4ee3a53b884fc30f80ce1a9ae406221767512b9c7d41ef5011b17f9ba8788",
    "v1FinalTestProbs": "42d1c2527bbc3dca86c10bf3eef5e60efe1103eafc2e31085118eb27e4904c99",
    "v2FinalTestProbs": "2c54370a5a980a833036b534f8e73e01a1c1f982885ebbffda000350d617c50d",
    "COS_V2_FINAL_TEST_EVENT_IDS": "f03cbe5359632ad8e4e7677ffbadb157bb972b009c62a05b672afe8b8a60d0a5",
}


def sha_probs(pods: list[dict], key: str) -> str:
    return hashlib.sha256(json.dumps([p[key] for p in pods], separators=(",", ":")).encode()).hexdigest()


def metrics_pack(p: np.ndarray, y: np.ndarray, tids: list[str]) -> dict:
    n = len(y)
    pw = p[np.arange(n), y]
    ll = float(-np.log(np.clip(pw, 1e-12, 1.0)).mean())
    one = np.zeros_like(p)
    one[np.arange(n), y] = 1.0
    brier = float(((p - one) ** 2).sum(axis=1).mean())
    top1 = float((p.argmax(axis=1) == y).mean())
    buckets = defaultdict(list)
    for i, tid in enumerate(tids):
        buckets[tid].append(-math.log(float(np.clip(pw[i], 1e-12, 1))))
    ev = np.array([float(np.mean(v)) for v in buckets.values()], dtype=np.float64)
    cal = calibration_bins(p, y)
    return {
        "nPods": n,
        "nEvents": len(ev),
        "podLogloss": ll,
        "eventMeanLogloss": float(ev.mean()),
        "brier": brier,
        "ece": cal["ece"],
        "top1": top1,
        "meanWinnerProb": float(pw.mean()),
        "eventLogloss": ev,
    }


def bootstrap_event_delta(d_event: np.ndarray, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    n = len(d_event)
    stats = np.empty(N_BOOT, dtype=np.float64)
    for b in range(N_BOOT):
        pick = rng.integers(0, n, size=n)
        stats[b] = float(d_event[pick].mean())
    lo, hi = float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5))
    return {
        "nResamples": N_BOOT,
        "seed": seed,
        "cluster": "whole_event",
        "point": float(d_event.mean()),
        "ci95": [lo, hi],
        "meanBootstrap": float(stats.mean()),
        "fracEventsPositive": float((d_event > 0).mean()),
        "medianEventDelta": float(np.median(d_event)),
    }


def pct_from_grid(value: float, grid: list[float]) -> float:
    return float(np.interp(value, grid, np.linspace(0.0, 100.0, 101)))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    assert_cmmg_v1_reserved_winners_locked()

    print("  pre-reveal verification", flush=True)
    event_ids = [ln.strip() for ln in (COS2 / "COS_V2_FINAL_TEST_EVENT_IDS.txt").read_text(encoding="utf-8").splitlines() if ln.strip()]
    pred = load_json(DEV / "FINAL_TEST_PREDICTIONS.json")
    checks = {
        "nFinalTestEvents": {"expected": EXPECTED["nEvents"], "got": len(event_ids), "ok": len(event_ids) == EXPECTED["nEvents"]},
        "nFinalTestPods": {"expected": EXPECTED["nPods"], "got": pred.get("nPods"), "ok": pred.get("nPods") == EXPECTED["nPods"] and len(pred.get("pods") or []) == EXPECTED["nPods"]},
        "nEventsInPred": {"expected": EXPECTED["nEvents"], "got": pred.get("nEvents"), "ok": pred.get("nEvents") == EXPECTED["nEvents"]},
        "eventIdsHash": {
            "expected": EXPECTED["COS_V2_FINAL_TEST_EVENT_IDS"],
            "got": sha256_file(COS2 / "COS_V2_FINAL_TEST_EVENT_IDS.txt"),
        },
        "selectedCandidate": {"expected": "V2-E", "got": pred.get("selectedCandidate"), "ok": pred.get("selectedCandidate") == "V2-E"},
        "exclusionRules": {
            "completedFourPlayer": True,
            "winnerFieldPresentRequiredForInclusion": True,
            "usableExactLists": True,
            "resolvedCommander": True,
            "cmmgReservedExcluded": True,
            "noPostRevealExclusionsExceptCorruptWinner": True,
        },
    }
    checks["eventIdsHash"]["ok"] = checks["eventIdsHash"]["got"] == checks["eventIdsHash"]["expected"]
    for name in ("FORMULA.json", "SCHEMA.json", "MODEL.json", "REFERENCE.json", "FINAL_TEST_PREDICTIONS.json"):
        got = sha256_file(DEV / name)
        checks[name] = {"expected": EXPECTED[name], "got": got, "ok": got == EXPECTED[name]}
    checks["v1FinalTestProbs"] = {
        "expected": EXPECTED["v1FinalTestProbs"],
        "got": sha_probs(pred["pods"], "v1Probs"),
    }
    checks["v1FinalTestProbs"]["ok"] = checks["v1FinalTestProbs"]["got"] == checks["v1FinalTestProbs"]["expected"]
    checks["v2FinalTestProbs"] = {
        "expected": EXPECTED["v2FinalTestProbs"],
        "got": sha_probs(pred["pods"], "v2Probs"),
    }
    checks["v2FinalTestProbs"]["ok"] = checks["v2FinalTestProbs"]["got"] == checks["v2FinalTestProbs"]["expected"]
    ok = all(v.get("ok", True) is True for v in checks.values() if isinstance(v, dict) and "ok" in v)
    verify = {
        "stage": "PRE_REVEAL",
        "FINAL_TEST_OUTCOMES_OPENED": False,
        "ok": ok,
        "checks": checks,
    }
    write_json(OUT / "PRE_REVEAL_VERIFY.json", verify)
    if not ok:
        write_json(OUT / "STOP.json", verify)
        raise SystemExit("STOP: frozen artifact mismatch")

    print("  reveal winners once", flush=True)
    wanted = {p["podId"]: p for p in pred["pods"]}
    reserved_pids = {
        str(p["podId"])
        for p in load_json(COS2.parent / "commander-meta-matchup-geometry-v1" / "LEGACY_BLINDED_RESERVE_V1.json")["pods"]
    }
    y = []
    tids = []
    p1 = []
    p2 = []
    u2 = []
    decks = []
    corrupt = []
    seen = set()
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for pod in load_json(path):
            pid = str(pod.get("podId") or "")
            if pid not in wanted or pid in seen:
                continue
            seen.add(pid)
            if pid in reserved_pids:
                raise SystemExit("reserved leaked into FINAL_TEST reveal")
            rec = wanted[pid]
            if not winner_field_present(pod):
                corrupt.append({"podId": pid, "reason": "winner_field_missing_at_reveal"})
                continue
            win = winner_deck_instance_id(pod)
            ids = rec["deckInstanceIds"]
            if win not in ids:
                corrupt.append({"podId": pid, "reason": "winner_not_in_frozen_seat_list", "winnerDeckInstanceId": win})
                continue
            y.append(ids.index(win))
            tids.append(rec["tid"])
            p1.append(rec["v1Probs"])
            p2.append(rec["v2Probs"])
            u2.append(rec["v2Utilities"])
            decks.append(ids)
    if len(y) != EXPECTED["nPods"] - len(corrupt):
        pass
    if set(wanted) - seen:
        raise SystemExit(f"unmatched frozen pods: {len(set(wanted) - seen)}")
    if len(y) != EXPECTED["nPods"]:
        write_json(OUT / "CORRUPT_RECORDS.json", {"n": len(corrupt), "records": corrupt})
        if corrupt:
            print(f"  corrupt/excluded {len(corrupt)}", flush=True)
    y = np.asarray(y, dtype=np.int64)
    p1 = np.asarray(p1, dtype=np.float64)
    p2 = np.asarray(p2, dtype=np.float64)
    u2 = np.asarray(u2, dtype=np.float64)
    m1 = metrics_pack(p1, y, tids)
    m2 = metrics_pack(p2, y, tids)
    d_event = m1["eventLogloss"] - m2["eventLogloss"]
    boot = bootstrap_event_delta(d_event, BOOT_SEED)
    delta_pod = m1["podLogloss"] - m2["podLogloss"]
    ece_reg = (m2["ece"] - m1["ece"]) > MATERIAL_ECE
    if boot["ci95"][0] > 0 and boot["point"] > 0 and not ece_reg:
        call = "COS_V2_FINAL_TEST_PASS"
    elif boot["point"] > 0 and boot["ci95"][0] <= 0 and not ece_reg:
        call = "COS_V2_PROMISING_AWAITING_MORE_PROSPECTIVE_DATA"
    else:
        call = "COS_V2_FINAL_TEST_NO_REPLACEMENT"

    # Build Optimization descriptive check from frozen V2-E residuals
    model = load_json(DEV / "MODEL.json")
    reference = load_json(DEV / "REFERENCE.json")
    deck_cmd = {}
    needed = {d for ids in decks for d in ids}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did in needed:
                deck_cmd[did] = commander_identity(list(deck.get("commanderOracleIds") or []))
    ids_list = model["commanderIdentities"]
    S = np.asarray(model["S"], dtype=np.float64)
    resid = np.zeros_like(u2)
    bo = np.full_like(u2, np.nan)
    eligible = []
    for i, ids in enumerate(decks):
        row_el = []
        for j, did in enumerate(ids):
            ident = deck_cmd.get(did)
            idx = ids_list.index(ident) if ident in ids_list else -1
            s = float(S[idx + 1]) if idx >= 0 else 0.0
            r = float(u2[i, j] - s)
            resid[i, j] = r
            ref = (reference.get("commanders") or {}).get(ident or "")
            ok_bo = bool(ref and ref.get("eligibleBuildOptimization") and ref.get("residualQuantiles"))
            row_el.append(ok_bo)
            if ok_bo:
                bo[i, j] = pct_from_grid(r, ref["residualQuantiles"])
        eligible.append(row_el)
    win_r = []
    lose_r = []
    conc = []
    for i in range(len(y)):
        if not eligible[i][int(y[i])]:
            continue
        wr = float(resid[i, int(y[i])])
        others = [float(resid[i, j]) for j in range(4) if j != int(y[i])]
        win_r.append(wr)
        lose_r.extend(others)
        conc.append(1.0 if wr > float(np.mean(others)) else 0.0)
    bo_diag = {
        "thresholdSource": "frozen V2-E REFERENCE eligibleBuildOptimization (nUnique>=30); no new bins",
        "nPodsWinnerCommanderBoEligible": len(win_r),
        "meanWinnerResidual": float(np.mean(win_r)) if win_r else None,
        "meanOtherSeatResidual": float(np.mean(lose_r)) if lose_r else None,
        "fracWinnerResidualGtMeanOthers": float(np.mean(conc)) if conc else None,
        "note": "Descriptive only. Does not override the V1-vs-V2-E replacement gate.",
    }

    del m1["eventLogloss"]
    del m2["eventLogloss"]
    adjudication = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
        "selectedCandidate": "V2-E",
        "call": call,
        "FINAL_TEST_OUTCOMES_OPENED": True,
        "COS_V1_CHANGED": False,
        "COS_V2_CHANGED_AFTER_REVEAL": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "PROFESSOR_CHANGED": False,
        "CONSTRUCTOR_USES_COS": False,
        "nScoredPods": int(len(y)),
        "nCorruptExcluded": len(corrupt),
        "corrupt": corrupt,
        "primary": {
            "LL_V1_eventMean": m1["eventMeanLogloss"],
            "LL_V2E_eventMean": m2["eventMeanLogloss"],
            "delta": boot["point"],
            "definition": "Δ = event-mean LL(COS_V1) - event-mean LL(V2-E); positive favors V2-E",
            "bootstrap": boot,
            "gate": {
                "require": "CI_low > 0 and no material ECE regression",
                "materialEceDelta": MATERIAL_ECE,
                "ciLow": boot["ci95"][0],
                "ciLowGtZero": boot["ci95"][0] > 0,
                "eceV1": m1["ece"],
                "eceV2E": m2["ece"],
                "eceDelta": m2["ece"] - m1["ece"],
                "materialCalibrationRegression": ece_reg,
            },
            "podDelta": delta_pod,
        },
        "secondary": {"COS_V1": m1, "V2-E": m2},
        "buildOptimizationCheck": bo_diag,
        "selectionReminder": {"V1_eventMean": 1.31381, "V2E_eventMean": 1.31969},
        "replacementGateWeakened": False,
    }
    write_json(OUT / "ADJUDICATION.json", adjudication)
    write_json(
        COS2 / "STATUS.json",
        {
            "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
            "status": call,
            "selectedCandidate": "V2-E",
            "COS_V1_IMMUTABLE": True,
            "COS_V1_REMAINS_PRODUCT": call != "COS_V2_FINAL_TEST_PASS",
            "FINAL_TEST_OUTCOMES_OPENED": True,
            "COS_V2_CHANGED_AFTER_REVEAL": False,
            "CONSTRUCTOR_USES_COS": False,
            "productMigrationAuthorized": False,
        },
    )
    if call == "COS_V2_FINAL_TEST_PASS":
        write_json(
            COS2 / "FREEZE.json",
            {
                "lineage": "COMMANDER_OPTIMIZATION_SCORE_V2",
                "status": "FORMULA_FROZEN_NOT_DEPLOYED",
                "selectedCandidate": "V2-E",
                "checksums": {k: EXPECTED[k] for k in ("FORMULA.json", "SCHEMA.json", "MODEL.json", "REFERENCE.json")},
                "productMigrationAuthorized": False,
            },
        )
    print(json.dumps({k: adjudication[k] for k in ("call", "primary", "secondary", "buildOptimizationCheck", "nCorruptExcluded")}, indent=2), flush=True)


if __name__ == "__main__":
    main()

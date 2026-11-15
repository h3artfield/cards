#!/usr/bin/env python3
"""
Spent-data diagnostic: how often a strength-only world yields 62 stable legs and a 3-cycle.

Does not inspect CMMG C2. Does not open the 354. Not an MG p-value.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from cmmg_v1_models import CommanderStrength, set_seeds, strength_l2
from freeze_cmmg_v1_dataset_protocol import commander_identity, winner_field_present
from odsg_v1_winners import winner_deck_instance_id
from outcome_firewall_v1 import assert_cmmg_v1_reserved_winners_locked
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
ODSG = MS / "outcome-derived-strategic-geometry-v1"
CMMG = MS / "commander-meta-matchup-geometry-v1"
HIST = MS / "historical-commander-meta-geometry-v1"
OUT = MS / "historical-commander-meta-null-audit-v1"

LAM_S = 1e-5
MAX_EPOCHS = 28
BATCH = 128
LR = 1e-3
SEED = 20260821
SIM_SEED = 20260821
N_SIM = 5000
SHRINK_K = 20.0
MIN_N = 25
MIN_ABS = 0.015
MIN_Z = 1.64
OTHER_MIN = 10
OBSERVED_LEGS = 62
OBSERVED_CYCLES = 1
OBSERVED_CYCLE_WEAK_LEG = 0.059825266977672126


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def fit_strength(x: torch.Tensor, y: torch.Tensor, n_ident: int, device) -> tuple[np.ndarray, np.ndarray]:
    set_seeds(SEED)
    model = CommanderStrength(n_ident).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR, betas=(0.9, 0.999), eps=1e-8)
    n = x.shape[0]
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        g = torch.Generator()
        g.manual_seed(SEED + epoch)
        perm = torch.randperm(n, generator=g)
        for s in range(0, n, BATCH):
            ii = perm[s : s + BATCH]
            u = model.utilities(x[ii])
            loss = F.nll_loss(F.log_softmax(u, dim=-1), y[ii]) + LAM_S * strength_l2(model)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            model.center_strength()
    model.eval()
    with torch.no_grad():
        p = torch.softmax(model.utilities(x), dim=-1).cpu().numpy()
        S = model.S.weight.detach().cpu().numpy().reshape(-1)
    return p, S


def score_corpus(y, p, pair_rows, ge20_a, ge20_b) -> dict:
    ia = pair_rows["ia"]
    ib = pair_rows["ib"]
    pid = pair_rows["pair"]
    pod = pair_rows["pod"]
    sign = pair_rows["sign"]
    fold = pair_rows["fold"]
    half = pair_rows["half"]
    other = pair_rows["other"]
    n_pairs = int(pair_rows["n_pairs"])
    m = sign * (((y[pod] == ia).astype(np.float64) - p[pod, ia]) - ((y[pod] == ib).astype(np.float64) - p[pod, ib]))
    n = np.bincount(pid, minlength=n_pairs).astype(np.float64)
    sm = np.bincount(pid, weights=m, minlength=n_pairs)
    sm2 = np.bincount(pid, weights=m * m, minlength=n_pairs)
    raw = np.divide(sm, n, out=np.zeros_like(sm), where=n > 0)
    var = np.maximum(np.divide(sm2, n, out=np.zeros_like(sm2), where=n > 0) - raw * raw, 0.0)
    se = np.sqrt(np.divide(var, n, out=np.full_like(var, np.inf), where=n > 0))
    z = np.divide(raw, se, out=np.zeros_like(raw), where=se > 0)
    shrunk = (n / (n + SHRINK_K)) * raw

    def slice_mean(mask):
        nn = np.bincount(pid[mask], minlength=n_pairs).astype(np.float64)
        ss = np.bincount(pid[mask], weights=m[mask], minlength=n_pairs)
        return nn, np.divide(ss, nn, out=np.zeros_like(ss), where=nn > 0)

    n0, m0 = slice_mean(fold == 0)
    n1, m1 = slice_mean(fold == 1)
    ne, me = slice_mean(half == 0)
    nl, ml = slice_mean(half == 1)
    no0, mo0 = slice_mean(other == 0)
    no1, mo1 = slice_mean(other == 1)
    supported = (ge20_a & ge20_b & (n >= MIN_N))
    away = (np.abs(shrunk) >= MIN_ABS) & (np.abs(z) >= MIN_Z)
    fold_ok = (n0 >= MIN_N) & (n1 >= MIN_N) & (m0 * m1 > 0)
    time_ok = (ne >= MIN_N) & (nl >= MIN_N) & (me * ml > 0)
    other_ok = np.where((no0 >= OTHER_MIN) & (no1 >= OTHER_MIN), mo0 * mo1 > 0, True)
    interesting = supported & away & fold_ok & time_ok & other_ok
    idx = np.where(interesting)[0]
    out_n = defaultdict(list)
    max_abs = float(np.max(np.abs(shrunk[idx]))) if len(idx) else 0.0
    edges = []
    for k in idx:
        a = int(pair_rows["a"][k])
        b = int(pair_rows["b"][k])
        if shrunk[k] > 0:
            w, l = a, b
        else:
            w, l = b, a
        out_n[w].append(l)
        edges.append((w, l, float(abs(shrunk[k]))))
    cycles = 0
    weak = []
    seen = set()
    strength = {(min(w, l), max(w, l)): mag for w, l, mag in edges}
    for a, bs in out_n.items():
        for b in bs:
            for c in out_n.get(b, []):
                if a in out_n.get(c, []) and len({a, b, c}) == 3:
                    key = tuple(sorted((a, b, c)))
                    if key in seen:
                        continue
                    seen.add(key)
                    cycles += 1
                    legs = [
                        strength.get((min(a, b), max(a, b)), 0.0),
                        strength.get((min(b, c), max(b, c)), 0.0),
                        strength.get((min(c, a), max(c, a)), 0.0),
                    ]
                    weak.append(min(legs))
    return {
        "nSupported": int(supported.sum()),
        "nInteresting": int(interesting.sum()),
        "nCycles": cycles,
        "maxAbsShrunk": max_abs,
        "maxMinCycleLeg": float(max(weak)) if weak else 0.0,
    }


def load_spent(device):
    reserved_ids = {p["podId"] for p in load_json(CMMG / "LEGACY_BLINDED_RESERVE_V1.json")["pods"]}
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    odsg = load_json(ODSG / "eligible-pods.json")["pods"]
    spent_ids = {str(p["podId"]) for p in holdout["pods"]} | {str(p["podId"]) for p in odsg}
    vocab = load_json(CMMG / "development-model-freeze-v1" / "commander-vocabulary.json")
    ge20 = {r["commanderIdentity"] for r in vocab["identities"] if int(r["nPodAppearances"]) >= 20}
    cmd_of = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did and (deck.get("commanderResolutionStatus") or "") == "resolved":
                cmd_of[did] = commander_identity(list(deck.get("commanderOracleIds") or []))
    wanted = {}
    rows = []
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for pod in load_json(path):
            pid = str(pod.get("podId") or "")
            if pid in reserved_ids or pid not in spent_ids:
                continue
            if int(pod.get("podSize") or 0) != 4 or (pod.get("status") or "") != "Completed":
                continue
            if not winner_field_present(pod):
                continue
            ids = [str(p.get("deckInstanceId") or "") for p in (pod.get("participants") or [])]
            if len(ids) != 4 or any(not x for x in ids) or len(set(ids)) != 4:
                continue
            idents = [cmd_of.get(d) for d in ids]
            if any(not x for x in idents):
                continue
            date = pod.get("tournamentDate") if isinstance(pod.get("tournamentDate"), str) else None
            wanted[pid] = ids
            rows.append({"podId": pid, "tid": str(pod.get("tid") or ""), "commanderIdentities": idents, "tournamentDate": date.strip() if isinstance(date, str) and date.strip() else None})
    seats = {}
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for raw in load_json(path):
            pid = str(raw.get("podId") or "")
            if pid in reserved_ids or pid not in wanted:
                continue
            did = winner_deck_instance_id(raw)
            seats[pid] = wanted[pid].index(did)
    if len(rows) != 44625:
        raise SystemExit(f"spent rows {len(rows)}")
    appear = defaultdict(int)
    for r in rows:
        for c in set(r["commanderIdentities"]):
            appear[c] += 1
    vocab_ids = sorted(appear)
    index = {c: i for i, c in enumerate(vocab_ids)}
    x = np.zeros((len(rows), 4), dtype=np.int64)
    y = np.zeros(len(rows), dtype=np.int64)
    for i, r in enumerate(rows):
        for j, c in enumerate(r["commanderIdentities"]):
            x[i, j] = index[c] + 1
        y[i] = seats[r["podId"]]
    dated = [r["tournamentDate"] for r in rows if r["tournamentDate"]]
    median_date = sorted(dated)[len(dated) // 2]
    occ = {k: [] for k in ("pod", "ia", "ib", "pair", "sign", "fold", "half", "other", "a", "b")}
    pair_index = {}
    for i, r in enumerate(rows):
        cs = r["commanderIdentities"]
        fold = int(hashlib.sha256(f"HCMG_V1_FOLD:{r['tid']}".encode()).hexdigest(), 16) % 2
        date = r["tournamentDate"]
        half = 1 if (date and date > median_date) else 0
        for ia in range(4):
            for ib in range(ia + 1, 4):
                a, b = cs[ia], cs[ib]
                if a == b:
                    continue
                sa, sb = (1 if a < b else -1), (ia, ib) if a < b else (ib, ia)
                lo, hi = (a, b) if a < b else (b, a)
                key = (lo, hi)
                if key not in pair_index:
                    pair_index[key] = len(pair_index)
                others = tuple(sorted(x for j, x in enumerate(cs) if j not in (ia, ib)))
                oh = int(hashlib.sha256(f"HCMG_V1_OTHER:{others[0]}|{others[1]}".encode()).hexdigest(), 16) % 2
                occ["pod"].append(i)
                occ["ia"].append(sb[0])
                occ["ib"].append(sb[1])
                occ["pair"].append(pair_index[key])
                occ["sign"].append(1.0)
                occ["fold"].append(fold)
                occ["half"].append(half)
                occ["other"].append(oh)
                occ["a"].append(index[lo])
                occ["b"].append(index[hi])
    pair_rows = {k: np.asarray(v) for k, v in occ.items()}
    pair_rows["n_pairs"] = len(pair_index)
    keys = [None] * len(pair_index)
    for k, i in pair_index.items():
        keys[i] = k
    ge20_a = np.array([keys[i][0] in ge20 for i in range(len(keys))])
    ge20_b = np.array([keys[i][1] in ge20 for i in range(len(keys))])
    xt = torch.from_numpy(x).to(device)
    yt = torch.from_numpy(y).to(device)
    return xt, yt, y, pair_rows, ge20_a, ge20_b, len(vocab_ids), x


def main() -> None:
    t0 = time.time()
    assert_cmmg_v1_reserved_winners_locked()
    OUT.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  load spent corpus on {device}", flush=True)
    xt, yt, y_obs, pair_rows, ge20_a, ge20_b, n_ident, x_np = load_spent(device)
    print("  fit observed strength (full-batch equivalent of original C1 class)", flush=True)
    p_obs, S = fit_strength(xt, yt, n_ident, device)
    observed = score_corpus(y_obs, p_obs, pair_rows, ge20_a, ge20_b)
    print("  observed replay", observed, flush=True)

    rng = np.random.default_rng(SIM_SEED)
    norefit = []
    for s in range(N_SIM):
        u = rng.random(len(y_obs))
        cdf = np.cumsum(p_obs, axis=1)
        y_syn = (u[:, None] >= cdf).sum(axis=1).clip(0, 3).astype(np.int64)
        norefit.append(score_corpus(y_syn, p_obs, pair_rows, ge20_a, ge20_b))
    def summarize(recs, label):
        legs = np.array([r["nInteresting"] for r in recs])
        cyc = np.array([r["nCycles"] for r in recs])
        supp = np.array([r["nSupported"] for r in recs])
        mx = np.array([r["maxAbsShrunk"] for r in recs])
        weak = np.array([r["maxMinCycleLeg"] for r in recs])
        return {
            "label": label,
            "nSim": len(recs),
            "supportedMean": float(supp.mean()),
            "interestingMean": float(legs.mean()),
            "interestingP95": float(np.percentile(legs, 95)),
            "interestingP99": float(np.percentile(legs, 99)),
            "cyclesMean": float(cyc.mean()),
            "P_legs_ge_62": float((legs >= OBSERVED_LEGS).mean()),
            "P_cycles_ge_1": float((cyc >= 1).mean()),
            "P_maxMinCycleLeg_ge_observedWeak": float((weak >= OBSERVED_CYCLE_WEAK_LEG).mean()),
            "maxAbsShrunkMean": float(mx.mean()),
        }
    write_json(OUT / "NOREFIT.json", {"null": summarize(norefit, "generate_from_S_score_with_same_S"), "n": N_SIM})
    print("  no-refit", summarize(norefit, "same-S"), flush=True)

    rng = np.random.default_rng(SIM_SEED)
    recs = []
    for s in range(1, N_SIM + 1):
        u = rng.random(len(y_obs))
        cdf = np.cumsum(p_obs, axis=1)
        y_syn = (u[:, None] >= cdf).sum(axis=1).clip(0, 3).astype(np.int64)
        yt_s = torch.from_numpy(y_syn).to(device)
        p_s, _ = fit_strength(xt, yt_s, n_ident, device)
        rec = score_corpus(y_syn, p_s, pair_rows, ge20_a, ge20_b)
        recs.append(rec)
        if s % 25 == 0 or s == 1:
            print(f"    refit sim {s}/{N_SIM} legs={rec['nInteresting']} cycles={rec['nCycles']}", flush=True)
            write_json(OUT / "REFIT_CHECKPOINT.json", {"nDone": s, "last": rec})

    legs = np.array([r["nInteresting"] for r in recs])
    cyc = np.array([r["nCycles"] for r in recs])
    supp = np.array([r["nSupported"] for r in recs])
    mx = np.array([r["maxAbsShrunk"] for r in recs])
    weak = np.array([r["maxMinCycleLeg"] for r in recs])
    report = {
        "artifactType": "HistoricalCommanderMetaNullAuditV1",
        "role": "SPENT_DATA_DIAGNOSTIC_ONLY",
        "confirmatory": False,
        "nSim": N_SIM,
        "seed": SIM_SEED,
        "refit": "minibatch Adam 28 epochs batch 128, same λS/seed/centering as discovery",
        "observedReplay": observed,
        "targetObserved": {"nSupported": 1515, "nInteresting": OBSERVED_LEGS, "nCycles": OBSERVED_CYCLES, "cycleWeakLeg": OBSERVED_CYCLE_WEAK_LEG},
        "nullSameSNoRefit": summarize(norefit, "generate_from_S_score_with_same_S"),
        "nullRefit": {
            "supportedMean": float(supp.mean()),
            "interestingMean": float(legs.mean()),
            "interestingP95": float(np.percentile(legs, 95)),
            "interestingP99": float(np.percentile(legs, 99)),
            "cyclesMean": float(cyc.mean()),
            "P_legs_ge_62": float((legs >= OBSERVED_LEGS).mean()),
            "P_cycles_ge_1": float((cyc >= 1).mean()),
            "P_maxMinCycleLeg_ge_observedWeak": float((weak >= OBSERVED_CYCLE_WEAK_LEG).mean()),
            "maxAbsShrunkMean": float(mx.mean()),
        },
        "notAnMGValue": True,
        "frozenC2Inspected": False,
        "legacyReserveOpened": False,
        "elapsedSec": time.time() - t0,
    }
    write_json(OUT / "REPORT.json", report)
    write_json(OUT / "null-summaries.json", {"sims": recs})
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

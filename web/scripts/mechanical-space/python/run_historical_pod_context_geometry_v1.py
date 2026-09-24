#!/usr/bin/env python3
"""
HISTORICAL_POD_CONTEXT_GEOMETRY_V1

H1 (commander + own frozen architecture) vs H3 (same + permutation-invariant
three-opponent table context, including own x table terms).

Spent pods only. No pairwise I. No RPS. No Professor. No CMMG seal.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch

from freeze_cmmg_v1_dataset_protocol import commander_identity, winner_field_present
from odsg_v1_winners import winner_deck_instance_id
from outcome_firewall_v1 import assert_cmmg_v1_reserved_winners_locked
from run_spellbook_historical_outcome_association_v1 import (
    FEATURE_NAMES,
    H1,
    N_FOLDS,
    SEED,
    fp_vector,
    metrics,
    standardize,
    train_eval,
    verify_freeze,
    write_json,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
ARCH = MS / "spellbook-win-architecture-space-v1"
CMMG = MS / "commander-meta-matchup-geometry-v1"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
ODSG = MS / "outcome-derived-strategic-geometry-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
ASSOC = MS / "spellbook-historical-outcome-association-v1"
OUT = MS / "historical-pod-context-geometry-v1"

CTX_NAMES = [
    "opp_n_two_card",
    "opp_n_commander_involved",
    "opp_n_terminal",
    "opp_n_zero",
    "opp_n_independent",
    "opp_n_dependent",
    "opp_n_mixed",
    "opp_n_distinct_term_buckets",
    "opp_n_distinct_term_packages",
    "opp_n_distinct_motifs",
    "opp_term_package_entropy",
    "opp_n_shared_term_buckets",
    "opp_n_dense5",
    "opp_n_dense10",
    "opp_mean_n_combos",
    "opp_min_combo_size",
    "opp_n_same_motif_as_own",
    "own_term_x_opp_term",
    "own_term_x_opp_no_term",
    "own_dependent_x_opp_two_card",
    "own_minsize_x_opp_two_card",
    "own_zero_x_opp_term",
    "own_two_card_x_opp_two_card",
    "own_cmdinv_x_opp_cmdinv",
    "opp_n_share_own_terminal",
    "own_dense5_x_opp_dense5",
]


def ncomb(fp: dict) -> int:
    return int(fp.get("nNormalizedCombos") or 0)


def minc(fp: dict) -> int:
    v = fp.get("minComboCardCount")
    return int(v) if v is not None else 99


def has_two(fp: dict) -> float:
    return 1.0 if (int(fp.get("nTwoCard") or 0) > 0 or minc(fp) == 2) else 0.0


def has_term(fp: dict) -> float:
    return 1.0 if fp.get("terminalBuckets") else 0.0


def cmd_inv(fp: dict) -> float:
    return 1.0 if int(fp.get("nCommanderInvolved") or 0) > 0 else 0.0


def pod_context(fps4: list[dict], i: int) -> np.ndarray:
    own = fps4[i]
    opps = [fps4[j] for j in range(4) if j != i]
    term_sets = [frozenset(fp.get("terminalBuckets") or []) for fp in opps]
    pkgs = [fp.get("terminalPackage") or "NO_TERMINAL" for fp in opps]
    motifs = [fp.get("architectureMotif") or "" for fp in opps]
    deps = [fp.get("commanderDependence") or "NONE" for fp in opps]
    pc = Counter(pkgs)
    ent = -sum((c / 3.0) * math.log(c / 3.0, 2) for c in pc.values())
    union_term = set().union(*term_sets) if term_sets else set()
    bc = Counter(b for s in term_sets for b in s)
    own_term = set(own.get("terminalBuckets") or [])
    own_mot = own.get("architectureMotif") or ""
    n_term = sum(has_term(fp) for fp in opps)
    n_two = sum(has_two(fp) for fp in opps)
    n_cmd = sum(cmd_inv(fp) for fp in opps)
    n_dense = sum(1.0 for fp in opps if ncomb(fp) >= 5)
    mins = [minc(fp) for fp in opps]
    vec = [
        n_two,
        n_cmd,
        n_term,
        sum(1.0 for fp in opps if ncomb(fp) == 0),
        sum(1.0 for d in deps if d == "COMMANDER_INDEPENDENT"),
        sum(1.0 for d in deps if d == "COMMANDER_DEPENDENT"),
        sum(1.0 for d in deps if d == "MIXED"),
        float(len(union_term)),
        float(len(set(pkgs))),
        float(len(set(motifs))),
        ent,
        float(sum(1 for v in bc.values() if v >= 2)),
        n_dense,
        sum(1.0 for fp in opps if ncomb(fp) >= 10),
        float(np.mean([ncomb(fp) for fp in opps])),
        float(min(mins)),
        float(sum(1 for m in motifs if m == own_mot)),
        has_term(own) * n_term,
        has_term(own) * (3.0 - n_term),
        (1.0 if own.get("commanderDependence") == "COMMANDER_DEPENDENT" else 0.0) * n_two,
        (0.0 if minc(own) >= 99 else float(minc(own))) * n_two / 3.0,
        (1.0 if ncomb(own) == 0 else 0.0) * n_term,
        has_two(own) * n_two,
        cmd_inv(own) * n_cmd,
        float(sum(1 for s in term_sets if s & own_term)),
        (1.0 if ncomb(own) >= 5 else 0.0) * n_dense,
    ]
    return np.asarray(vec, dtype=np.float64)


def main() -> None:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    assoc_freeze = load_json(ASSOC / "FREEZE.json")
    if assoc_freeze.get("status") != "OWN_ARCHITECTURE_SIGNAL / NO_OPPONENT_ARCHITECTURE_SIGNAL":
        raise SystemExit("association freeze missing")
    print("  prior freeze:", assoc_freeze["status"], flush=True)
    ver = verify_freeze()
    if not ver["SPELLBOOK_REPRESENTATION_HASH_VERIFIED"]:
        write_json(OUT / "STOP.json", {"reason": "FROZEN_REPRESENTATION_HASH_MISMATCH", **ver})
        raise SystemExit("STOP: representation hash mismatch")
    print("  SPELLBOOK_REPRESENTATION_HASH_VERIFIED = true", flush=True)
    assert_cmmg_v1_reserved_winners_locked()

    fps = {}
    with (ARCH / "architecture-fingerprints.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rec = json.loads(line)
                fps[str(rec["deckInstanceId"])] = rec

    reserved_ids = {p["podId"] for p in load_json(CMMG / "LEGACY_BLINDED_RESERVE_V1.json")["pods"]}
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    odsg = load_json(ODSG / "eligible-pods.json")["pods"]
    spent_ids = {str(p["podId"]) for p in holdout["pods"]} | {str(p["podId"]) for p in odsg}
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
            if any(not x for x in idents) or any(d not in fps for d in ids):
                continue
            wanted[pid] = ids
            rows.append({"podId": pid, "tid": str(pod.get("tid") or ""), "decks": ids, "commanders": idents})
    seats = {}
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for raw in load_json(path):
            pid = str(raw.get("podId") or "")
            if pid in reserved_ids or pid not in wanted:
                continue
            seats[pid] = wanted[pid].index(winner_deck_instance_id(raw))
    if reserved_ids & set(seats):
        raise SystemExit("reserved leaked")
    rows = [r for r in rows if r["podId"] in seats]
    if len(rows) != 38461:
        raise SystemExit(f"joined {len(rows)} != 38461")

    appear = defaultdict(int)
    for r in rows:
        for c in r["commanders"]:
            appear[c] += 1
    vocab = sorted(appear)
    cidx = {c: i + 1 for i, c in enumerate(vocab)}
    n = len(rows)
    c = np.zeros((n, 4), dtype=np.int64)
    y = np.zeros(n, dtype=np.int64)
    w = np.zeros((n, 4, len(FEATURE_NAMES)), dtype=np.float64)
    g = np.zeros((n, 4, len(CTX_NAMES)), dtype=np.float64)
    for i, r in enumerate(rows):
        y[i] = seats[r["podId"]]
        fps4 = [fps[d] for d in r["decks"]]
        for j in range(4):
            c[i, j] = cidx[r["commanders"][j]]
            w[i, j] = fp_vector(fps4[j])
            g[i, j] = pod_context(fps4, j)
    h3 = np.concatenate([w, g], axis=-1)

    # shuffle table context within commander; keep own W
    by_cmd = defaultdict(list)
    for i, r in enumerate(rows):
        for j in range(4):
            by_cmd[r["commanders"][j]].append((i, j))
    rng = np.random.default_rng(SEED)
    gshuf = g.copy()
    for ident, locs in by_cmd.items():
        src = [g[i, j].copy() for i, j in locs]
        rng.shuffle(src)
        for (i, j), vec in zip(locs, src):
            gshuf[i, j] = vec
    h3shuf = np.concatenate([w, gshuf], axis=-1)

    folds = np.array([int(hashlib.sha256(f"SWA_V1_EVENT:{r['tid']}".encode()).hexdigest(), 16) % N_FOLDS for r in rows])
    tids = [r["tid"] for r in rows]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  event CV on {device} n={n}", flush=True)
    oof = {k: np.zeros((n, 4)) for k in ("h1", "h3", "h3shuf")}
    betas = []
    for fold in range(N_FOLDS):
        tr = np.where(folds != fold)[0]
        te = np.where(folds == fold)[0]
        print(f"    fold {fold} train {len(tr)} test {len(te)}", flush=True)
        w_std = np.zeros_like(w)
        w_std[tr], w_std[te] = standardize(w[tr], w[te])
        h3_std = np.zeros_like(h3)
        h3_std[tr], h3_std[te] = standardize(h3[tr], h3[te])
        hs_std = np.zeros_like(h3shuf)
        hs_std[tr], hs_std[te] = standardize(h3shuf[tr], h3shuf[te])
        oof["h1"][te], _ = train_eval(H1, len(vocab), c, w_std, y, tr, te, device)
        oof["h3"][te], b3 = train_eval(H1, len(vocab), c, h3_std, y, tr, te, device)
        oof["h3shuf"][te], _ = train_eval(H1, len(vocab), c, hs_std, y, tr, te, device)
        if b3 is not None:
            betas.append(b3)

    m1, m3, ms = metrics(oof["h1"], y), metrics(oof["h3"], y), metrics(oof["h3shuf"], y)
    event = defaultdict(lambda: {"h1": [], "h3": []})
    for i, tid in enumerate(tids):
        event[tid]["h1"].append(-math.log(float(np.clip(oof["h1"][i, y[i]], 1e-12, 1))))
        event[tid]["h3"].append(-math.log(float(np.clip(oof["h3"][i, y[i]], 1e-12, 1))))
    deltas = np.array([np.mean(v["h1"]) - np.mean(v["h3"]) for v in event.values()])
    names = FEATURE_NAMES + CTX_NAMES
    contrib = []
    if betas:
        mb = np.mean(betas, axis=0)
        for name, val in zip(names, mb):
            contrib.append({"feature": name, "meanBeta": float(val), "abs": float(abs(val)), "isContext": name in CTX_NAMES})
        contrib.sort(key=lambda r: -r["abs"])
    ctx_contrib = [r for r in contrib if r["isContext"]][:15]

    report = {
        "artifactType": "HistoricalPodContextGeometryV1",
        "role": "HISTORICAL_EXPLORATORY_ONLY",
        "confirmatory": False,
        "priorFreeze": "OWN_ARCHITECTURE_SIGNAL / NO_OPPONENT_ARCHITECTURE_SIGNAL",
        "SPELLBOOK_REPRESENTATION_HASH_VERIFIED": True,
        "SPELLBOOK_REPRESENTATION_CHANGED": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "PROFESSOR_CHANGED": False,
        "pairwiseInteractionUsed": False,
        "rpsSearched": False,
        "nPods": n,
        "nEvents": len(set(tids)),
        "contextFields": CTX_NAMES,
        "H1": m1,
        "H3": m3,
        "deltaPodContext_LL_H1_minus_H3": m1["logloss"] - m3["logloss"],
        "eventDeltaH1H3": {
            "nEvents": int(len(deltas)),
            "mean": float(deltas.mean()),
            "p50": float(np.median(deltas)),
            "p10": float(np.percentile(deltas, 10)),
            "p90": float(np.percentile(deltas, 90)),
            "fracPositive": float((deltas > 0).mean()),
        },
        "controlShuffleContextWithinCommander": ms,
        "h3ContextCoefficients": ctx_contrib,
        "elapsedSec": time.time() - t0,
    }
    write_json(OUT / "REPORT.json", report)
    write_json(
        OUT / "RESEARCH_STATUS.json",
        {
            "lineage": "HISTORICAL_POD_CONTEXT_GEOMETRY_V1",
            "status": "REPORTED",
            "CMMG_SEALED_OUTCOMES_OPENED": False,
            "PROFESSOR_CHANGED": False,
        },
    )
    write_json(
        OUT / "PROTOCOL.json",
        {
            "H1": "commander + own frozen architecture",
            "H3": "H1 + permutation-invariant opponent-set descriptors + own x table",
            "not": ["pairwise I", "RPS", "neural set encoder"],
            "eventFolds": N_FOLDS,
        },
    )
    print(json.dumps({k: report[k] for k in ("H1", "H3", "deltaPodContext_LL_H1_minus_H3", "eventDeltaH1H3", "controlShuffleContextWithinCommander")}, indent=2))


if __name__ == "__main__":
    main()

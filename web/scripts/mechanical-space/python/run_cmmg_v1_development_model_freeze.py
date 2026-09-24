#!/usr/bin/env python3
"""
CMMG v1 development model freeze.

Trains only on the spent 44,625. Does not open the 354 reserved winners.
Does not inspect I(c,d).
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
import torch.nn.functional as F

import outcome_firewall_v1 as fw
from cmmg_v1_models import (
    INIT_SEED,
    UNK,
    CommanderMatchup,
    CommanderStrength,
    interaction_l2,
    set_seeds,
    strength_l2,
)
from freeze_cmmg_v1_dataset_protocol import commander_identity, winner_field_present
from odsg_v1_winners import winner_deck_instance_id
from outcome_firewall_v1 import (
    ODSG_V1_FINAL_CALL,
    assert_cmmg_v1_reserved_winners_locked,
    assert_odsg_v1_lineage_closed,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
CEX2 = MS / "corpus-expansion-v2"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
ODSG = MS / "outcome-derived-strategic-geometry-v1"
OUT = MS / "commander-meta-matchup-geometry-v1"
DEV = OUT / "development-model-freeze-v1"
ACC = OUT / "prospective-test-accumulator-v1"

LAM_S = [1e-5, 1e-4, 1e-3, 1e-2, 1e-1]
RANKS = [2, 4, 8, 16, 32]
LAM_I = [1e-5, 1e-4, 1e-3, 1e-2, 1e-1]
MAX_EPOCHS = 40
PATIENCE = 5
BATCH = 128
LR = 1e-3
EXPOSURE = 20
FIT_FRAC = 0.80
LN4 = float(math.log(4.0))


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


def event_key(tid: str) -> tuple[str, str]:
    return sha256_bytes(f"CMMG_V1_META_DEV:{tid}".encode()), tid


def state_bytes(model: torch.nn.Module) -> dict[str, torch.Tensor]:
    return {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}


def weight_sha(state: dict[str, torch.Tensor]) -> str:
    h = hashlib.sha256()
    for k in sorted(state):
        h.update(k.encode())
        h.update(state[k].contiguous().cpu().numpy().astype(np.float32).tobytes())
    return h.hexdigest()


def metrics(probs: np.ndarray, y: np.ndarray) -> dict:
    p = np.clip(probs, 1e-12, 1.0)
    return {
        "n": int(len(y)),
        "logloss": float(-np.log(p[np.arange(len(y)), y]).mean()),
        "top1": float((p.argmax(1) == y).mean()),
    }


def evaluate(model, idx: torch.Tensor, y: torch.Tensor | None) -> tuple[np.ndarray, dict | None]:
    model.eval()
    probs = []
    with torch.no_grad():
        for i in range(0, idx.shape[0], 512):
            u = model.utilities(idx[i : i + 512])
            probs.append(torch.softmax(u, dim=-1).cpu().numpy())
    p = np.concatenate(probs, axis=0)
    if y is None:
        return p, None
    return p, metrics(p, y.cpu().numpy())


def train_one(model, x_fit, y_fit, x_sel, y_sel, lam_s, lam_i, label, device):
    opt = torch.optim.Adam(model.parameters(), lr=LR, betas=(0.9, 0.999), eps=1e-8)
    best_state = state_bytes(model)
    best_sel = float("inf")
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
            ii = perm[s : s + BATCH]
            xb = x_fit[ii]
            yb = y_fit[ii]
            u = model.utilities(xb)
            loss = F.nll_loss(F.log_softmax(u, dim=-1), yb)
            loss = loss + lam_s * strength_l2(model)
            if lam_i and isinstance(model, CommanderMatchup):
                loss = loss + lam_i * interaction_l2(model)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            model.center_strength()
            total += float(loss.detach()) * int(yb.shape[0])
            seen += int(yb.shape[0])
        _, sel = evaluate(model, x_sel, y_sel)
        rec = {"epoch": epoch, "fitLoss": total / max(seen, 1), "selectionLogloss": sel["logloss"]}
        history.append(rec)
        print(f"    {label} epoch {epoch} fit={rec['fitLoss']:.4f} sel={sel['logloss']:.4f}", flush=True)
        if sel["logloss"] < best_sel - 1e-12:
            best_sel = sel["logloss"]
            best_epoch = epoch
            best_state = state_bytes(model)
            stale = 0
        else:
            stale += 1
            if stale >= PATIENCE:
                break
    model.load_state_dict(best_state)
    return {"bestEpoch": best_epoch, "bestSelectionLogloss": best_sel, "history": history, "state": best_state}


def main() -> None:
    t0 = time.time()
    assert_odsg_v1_lineage_closed()
    if ODSG_V1_FINAL_CALL != "SG3_INTERACTION_MODEL_WORSE":
        raise SystemExit("ODSG v1 must remain SG3")
    assert_cmmg_v1_reserved_winners_locked()
    if not fw.CMMG_V1_SPENT_DEVELOPMENT_AUTHORIZED:
        raise SystemExit("spent development not authorized")
    DEV.mkdir(parents=True, exist_ok=True)
    ACC.mkdir(parents=True, exist_ok=True)

    search = {
        "writtenBeforeDevelopmentResults": True,
        "optimizer": {"name": "Adam", "lr": LR, "betas": [0.9, 0.999], "eps": 1e-8, "weightDecay": 0.0},
        "objective": "mean four-player winner NLL plus λS||S||^2 and λI(||A||^2+||B||^2)",
        "equalPodWeight": True,
        "maxEpochs": MAX_EPOCHS,
        "earlyStop": {"monitor": "META_DEV_SELECTION logloss", "patience": PATIENCE, "restoreBest": True},
        "seed": INIT_SEED,
        "batchSizePods": BATCH,
        "lambdaS": LAM_S,
        "rank": RANKS,
        "lambdaI": LAM_I,
        "exposureThreshold": EXPOSURE,
        "identifiability": "center seen S to mean 0 each step; UNK index keeps S=a=b=0",
        "c1Selects": "lambdaS",
        "c2InheritsC1LambdaSSelects": ["rank", "lambdaI"],
        "c1Tie": ["min META_DEV_SELECTION logloss", "lower lambdaS index"],
        "c2Tie": ["min META_DEV_SELECTION logloss", "lower rank index", "lower lambdaI index"],
        "doNotEnlargeAfterSeeingResults": True,
        "doNotInspectInteractionMatrix": True,
    }
    write_json(DEV / "search-space.json", search)

    print("  index commanders and classify pods", flush=True)
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    odsg = load_json(ODSG / "eligible-pods.json")["pods"]
    holdout_map = {str(p["podId"]): p for p in holdout["pods"]}
    odsg_map = {str(p["podId"]): p for p in odsg}
    spent_ids = set(holdout_map) | set(odsg_map)
    if len(spent_ids) != 44625:
        raise SystemExit(f"spent pod dedupe is {len(spent_ids)}, expected 44625")
    sealed = load_json(CEX2 / "source-decks-60.json")
    sealed_ids = {str(d.get("deckInstanceId") or "") for d in sealed if d.get("deckInstanceId")}
    sealed_tids = {did.rsplit(":", 1)[0] for did in sealed_ids if ":" in did}
    opened_tids = {str(p.get("tid") or "") for p in holdout["pods"]} | {p["tid"] for p in odsg}
    opened_tids.discard("")

    cmd_of: dict[str, str | None] = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if not did:
                continue
            ident = None
            if (deck.get("commanderResolutionStatus") or "") == "resolved":
                ident = commander_identity(list(deck.get("commanderOracleIds") or []))
            cmd_of[did] = ident
        print(f"    decks {path.parent.name}", flush=True)

    reserved = []
    spent_rows = []
    seen = set()
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        print(f"    pods {path.parent.name}", flush=True)
        for pod in load_json(path):
            pid = str(pod.get("podId") or "")
            if not pid or pid in seen:
                continue
            if int(pod.get("podSize") or 0) != 4 or (pod.get("status") or "") != "Completed":
                continue
            parts = pod.get("participants") or []
            ids = [str(p.get("deckInstanceId") or "") for p in parts]
            if len(ids) != 4 or any(not x for x in ids) or len(set(ids)) != 4:
                continue
            if not winner_field_present(pod):
                continue
            seen.add(pid)
            idents = [cmd_of.get(d) for d in ids]
            if any(not x for x in idents):
                continue
            tid = str(pod.get("tid") or "")
            date = pod.get("tournamentDate") if isinstance(pod.get("tournamentDate"), str) else None
            rec = {
                "podId": pid,
                "tid": tid,
                "round": pod.get("round"),
                "table": pod.get("table"),
                "deckInstanceIds": ids,
                "commanderIdentities": idents,
                "tournamentDate": date.strip() if isinstance(date, str) and date.strip() else None,
            }
            if pid in spent_ids:
                spent_rows.append(rec)
            elif tid not in opened_tids and tid not in sealed_tids:
                reserved.append({k: rec[k] for k in rec if k != "deckInstanceIds"})
    if len(spent_rows) != 44625:
        raise SystemExit(f"spent commander-valid rows {len(spent_rows)} != 44625")
    if len(reserved) != 354:
        raise SystemExit(f"reserved pods {len(reserved)} != 354")
    reserved_ids = {r["podId"] for r in reserved}

    print("  load spent winners only", flush=True)
    wanted = {r["podId"]: r["deckInstanceIds"] for r in spent_rows}
    seats: dict[str, int] = {}
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for raw in load_json(path):
            pid = str(raw.get("podId") or "")
            if pid in reserved_ids:
                continue
            if pid not in wanted:
                continue
            did = winner_deck_instance_id(raw)
            ids = wanted[pid]
            if did not in ids:
                raise SystemExit(f"spent winner not in seats: {pid}")
            seats[pid] = ids.index(did)
    missing = sorted(set(wanted) - set(seats))
    if missing:
        raise SystemExit(f"missing spent winners: {len(missing)}")
    if reserved_ids & set(seats):
        raise SystemExit("reserved winners leaked into spent seat map")

    events = sorted({r["tid"] for r in spent_rows})
    ranked = sorted(events, key=event_key)
    n_sel_ev = max(1, int(round((1.0 - FIT_FRAC) * len(ranked))))
    n_fit_ev = len(ranked) - n_sel_ev
    fit_ev = set(ranked[:n_fit_ev])
    sel_ev = set(ranked[n_fit_ev:])
    fit_rows = [r for r in spent_rows if r["tid"] in fit_ev]
    sel_rows = [r for r in spent_rows if r["tid"] in sel_ev]

    appear = Counter()
    for r in spent_rows:
        for c in set(r["commanderIdentities"]):
            appear[c] += 1
    vocab = sorted(appear)
    index = {c: i + 1 for i, c in enumerate(vocab)}
    n_ge20 = sum(1 for n in appear.values() if n >= EXPOSURE)

    def pack(rows):
        x = np.zeros((len(rows), 4), dtype=np.int64)
        y = np.zeros(len(rows), dtype=np.int64)
        for i, r in enumerate(rows):
            for j, c in enumerate(r["commanderIdentities"]):
                x[i, j] = index[c]
            y[i] = seats[r["podId"]]
        return x, y

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    set_seeds(INIT_SEED)
    x_fit, y_fit = pack(fit_rows)
    x_sel, y_sel = pack(sel_rows)
    x_all, y_all = pack(spent_rows)
    xt_fit = torch.from_numpy(x_fit).to(device)
    yt_fit = torch.from_numpy(y_fit).to(device)
    xt_sel = torch.from_numpy(x_sel).to(device)
    yt_sel = torch.from_numpy(y_sel).to(device)
    xt_all = torch.from_numpy(x_all).to(device)
    yt_all = torch.from_numpy(y_all).to(device)

    print("  train C1", flush=True)
    c1_rows = []
    for i, lam in enumerate(LAM_S):
        model = CommanderStrength(len(vocab)).to(device)
        rec = train_one(model, xt_fit, yt_fit, xt_sel, yt_sel, lam, 0.0, f"c1_l{i}", device)
        _, sel_m = evaluate(model, xt_sel, yt_sel)
        c1_rows.append(
            {
                "id": f"c1_l{i}",
                "lambdaS": lam,
                "lambdaSIndex": i,
                "bestEpoch": rec["bestEpoch"],
                "selectionLogloss": sel_m["logloss"],
                "selectionTop1": sel_m["top1"],
                "weightSha256": weight_sha(rec["state"]),
                "state": rec["state"],
                "history": rec["history"],
            }
        )
    selected1 = min(c1_rows, key=lambda r: (r["selectionLogloss"], r["lambdaSIndex"]))
    write_json(
        DEV / "c1-candidates.json",
        {"candidates": [{k: v for k, v in r.items() if k != "state"} for r in c1_rows]},
    )

    print("  train C2", flush=True)
    c2_rows = []
    for ri, rank in enumerate(RANKS):
        for li, lam_i in enumerate(LAM_I):
            model = CommanderMatchup(len(vocab), rank).to(device)
            rec = train_one(
                model,
                xt_fit,
                yt_fit,
                xt_sel,
                yt_sel,
                selected1["lambdaS"],
                lam_i,
                f"c2_r{rank}_l{li}",
                device,
            )
            _, sel_m = evaluate(model, xt_sel, yt_sel)
            c2_rows.append(
                {
                    "id": f"c2_r{rank}_l{li}",
                    "rank": rank,
                    "rankIndex": ri,
                    "lambdaI": lam_i,
                    "lambdaIIndex": li,
                    "lambdaS": selected1["lambdaS"],
                    "bestEpoch": rec["bestEpoch"],
                    "selectionLogloss": sel_m["logloss"],
                    "selectionTop1": sel_m["top1"],
                    "weightSha256": weight_sha(rec["state"]),
                    "state": rec["state"],
                    "history": rec["history"],
                }
            )
    selected2 = min(c2_rows, key=lambda r: (r["selectionLogloss"], r["rankIndex"], r["lambdaIIndex"]))
    write_json(
        DEV / "c2-candidates.json",
        {"candidates": [{k: v for k, v in r.items() if k != "state"} for r in c2_rows]},
    )

    print("  refit on complete 44625", flush=True)

    def refit(build, epochs, lam_s, lam_i, label):
        model = build().to(device)
        opt = torch.optim.Adam(model.parameters(), lr=LR, betas=(0.9, 0.999), eps=1e-8)
        n = xt_all.shape[0]
        n_ep = max(1, int(epochs))
        for epoch in range(1, n_ep + 1):
            model.train()
            g = torch.Generator()
            g.manual_seed(INIT_SEED + epoch)
            perm = torch.randperm(n, generator=g)
            total = 0.0
            for s in range(0, n, BATCH):
                ii = perm[s : s + BATCH]
                u = model.utilities(xt_all[ii])
                loss = F.nll_loss(F.log_softmax(u, dim=-1), yt_all[ii])
                loss = loss + lam_s * strength_l2(model)
                if lam_i and isinstance(model, CommanderMatchup):
                    loss = loss + lam_i * interaction_l2(model)
                opt.zero_grad(set_to_none=True)
                loss.backward()
                opt.step()
                model.center_strength()
                total += float(loss.detach()) * int(ii.shape[0])
            print(f"    {label} refit {epoch}/{n_ep} loss={total / n:.4f}", flush=True)
        st = state_bytes(model)
        return model, st

    c1, st1 = refit(lambda: CommanderStrength(len(vocab)), selected1["bestEpoch"], selected1["lambdaS"], 0.0, "c1")
    c2, st2 = refit(
        lambda: CommanderMatchup(len(vocab), selected2["rank"]),
        selected2["bestEpoch"],
        selected1["lambdaS"],
        selected2["lambdaI"],
        "c2",
    )
    torch.save(st1, DEV / "c1-final.pt")
    torch.save(st2, DEV / "c2-final.pt")
    sha1, sha2 = weight_sha(st1), weight_sha(st2)
    _, c1_fit = evaluate(c1, xt_fit, yt_fit)
    _, c1_sel = evaluate(c1, xt_sel, yt_sel)
    _, c1_all = evaluate(c1, xt_all, yt_all)
    _, c2_fit = evaluate(c2, xt_fit, yt_fit)
    _, c2_sel = evaluate(c2, xt_sel, yt_sel)
    _, c2_all = evaluate(c2, xt_all, yt_all)

    reserved_primary = 0
    for r in reserved:
        if all(appear.get(c, 0) >= EXPOSURE for c in r["commanderIdentities"]):
            reserved_primary += 1

    write_json(
        DEV / "spent-development-split.json",
        {
            "role": "SPENT_DEVELOPMENT_CORPUS",
            "confirmatory": False,
            "nPods": 44625,
            "nEvents": len(events),
            "nFitEvents": len(fit_ev),
            "nSelectionEvents": len(sel_ev),
            "nFitPods": len(fit_rows),
            "nSelectionPods": len(sel_rows),
            "fitEvents": sorted(fit_ev),
            "selectionEvents": sorted(sel_ev),
        },
    )
    write_json(
        DEV / "commander-vocabulary.json",
        {
            "unkIndex": UNK,
            "nIdentities": len(vocab),
            "nAtLeast20": n_ge20,
            "exposureThreshold": EXPOSURE,
            "identities": [{"commanderIdentity": c, "nPodAppearances": appear[c], "index": index[c]} for c in vocab],
        },
    )
    write_json(
        OUT / "LEGACY_BLINDED_RESERVE_V1.json",
        {
            "name": "LEGACY_BLINDED_RESERVE_V1",
            "nPods": 354,
            "nEvents": 85,
            "winnerIdentityRetained": False,
            "nPrimaryEligibleExposure20": reserved_primary,
            "pods": reserved,
        },
    )
    snapshot_tids = sorted({r["tid"] for r in spent_rows} | {r["tid"] for r in reserved} | opened_tids | sealed_tids)
    accumulator = {
        "artifactType": "COMMANDER_META_PROSPECTIVE_TEST_ACCUMULATOR_V1",
        "status": "AWAITING_FUTURE_INGEST",
        "nCurrentSnapshotEventsExcluded": len(snapshot_tids),
        "nAccumulatedFutureEvents": 0,
        "nAccumulatedFuturePods": 0,
        "rules": [
            "event must not exist in the current TopDeck snapshot",
            "ingested after this protocol freeze",
            "exactly four players",
            "all four commander identities resolved",
            "structured non-draw winner field present",
            "must not overlap a prior outcome-opened event",
            "selection uses metadata and winner-field presence only",
            "winner identity inaccessible",
            "no cherry-picking by matchup, player, winner, or model probabilities",
            "append every eligible event deterministically",
        ],
        "confirmatoryRevealGate": {
            "minPrimaryEligiblePods": 2000,
            "minUntouchedEvents": 100,
            "primaryEligible": "all four commanders have >=20 spent-development appearances",
            "legacyReserveMayCountIfEligible": True,
            "doNotLowerLater": True,
        },
        "legacyReservePrimaryEligiblePods": reserved_primary,
        "legacyReserveEvents": 85,
        "gateReached": False,
        "excludedCurrentSnapshotEventTids": snapshot_tids,
    }
    write_json(ACC / "ACCUMULATOR.json", accumulator)
    write_json(
        ACC / "accumulate.py.README.json",
        {"script": "web/scripts/mechanical-space/python/accumulate_cmmg_v1_prospective_test.py", "runWhen": "new TopDeck ingest exists"},
    )

    spec = {
        "COMMANDER_META_MODELS_FROZEN": True,
        "C1": {
            "lambdaS": selected1["lambdaS"],
            "bestEpoch": selected1["bestEpoch"],
            "selectionLogloss": selected1["selectionLogloss"],
            "finalWeightSha256": sha1,
        },
        "C2": {
            "rank": selected2["rank"],
            "lambdaI": selected2["lambdaI"],
            "lambdaS": selected1["lambdaS"],
            "bestEpoch": selected2["bestEpoch"],
            "selectionLogloss": selected2["selectionLogloss"],
            "finalWeightSha256": sha2,
            "geometryInspected": False,
        },
        "nVocab": len(vocab),
        "nExposureAtLeast20": n_ge20,
    }
    write_json(DEV / "MODEL_SPEC_SELECTED.json", spec)
    write_json(DEV / "c1-final-diagnostics.json", {"FIT": c1_fit, "SELECTION": c1_sel, "ALL_SPENT_REFIT": c1_all, "spentOnly": True})
    write_json(DEV / "c2-final-diagnostics.json", {"FIT": c2_fit, "SELECTION": c2_sel, "ALL_SPENT_REFIT": c2_all, "spentOnly": True})

    fw.CMMG_V1_MODELS_FROZEN = True
    report = {
        "artifactType": "CmmgV1DevelopmentModelFreeze",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsedSec": time.time() - t0,
        "nDevelopmentPods": 44625,
        "nDevelopmentEvents": len(events),
        "nFitPods": len(fit_rows),
        "nFitEvents": len(fit_ev),
        "nSelectionPods": len(sel_rows),
        "nSelectionEvents": len(sel_ev),
        "nCommanderIdentities": len(vocab),
        "nExposureAtLeast20": n_ge20,
        "C1": {
            "candidates": [{k: r[k] for k in ("id", "lambdaS", "bestEpoch", "selectionLogloss")} for r in c1_rows],
            "selectedLambdaS": selected1["lambdaS"],
            "selectedBestEpoch": selected1["bestEpoch"],
            "selectionLogloss": selected1["selectionLogloss"],
            "fitRefitLogloss": c1_all["logloss"],
            "finalWeightSha256": sha1,
        },
        "C2": {
            "candidates": [{k: r[k] for k in ("id", "rank", "lambdaI", "bestEpoch", "selectionLogloss")} for r in c2_rows],
            "selectedRank": selected2["rank"],
            "selectedLambdaI": selected2["lambdaI"],
            "selectedBestEpoch": selected2["bestEpoch"],
            "selectionLogloss": selected2["selectionLogloss"],
            "fitRefitLogloss": c2_all["logloss"],
            "finalWeightSha256": sha2,
            "interactionGeometryInspected": False,
        },
        "legacyReserve": {
            "nPods": 354,
            "nEvents": 85,
            "nPrimaryEligibleExposure20": reserved_primary,
            "winnersOpened": False,
        },
        "accumulator": {
            "status": "AWAITING_FUTURE_INGEST",
            "nAccumulatedFutureEvents": 0,
            "gate": "2000 primary-eligible pods AND 100 untouched events",
            "gateReached": False,
        },
        "LEGACY_RESERVE_WINNERS_OPENED": "NO",
        "COMMANDER_META_MODELS_FROZEN": True,
        "uniformLogloss": LN4,
    }
    write_json(DEV / "REPORT.json", report)
    write_json(OUT / "COMMANDER_META_MODELS_FROZEN.json", {"COMMANDER_META_MODELS_FROZEN": True, "dir": "development-model-freeze-v1"})
    checks = {p.name: sha256_file(p) for p in sorted(DEV.iterdir()) if p.is_file() and p.name != "checksums.txt"}
    (DEV / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(
        OUT / "PROTOCOL.json",
        {
            **load_json(OUT / "PROTOCOL.json"),
            "status": "DEVELOPMENT_MODELS_FROZEN_RESERVE_SEALED",
            "trainingAuthorized": False,
            "spentDevelopmentOnly": True,
            "COMMANDER_META_MODELS_FROZEN": True,
        },
    )
    print(json.dumps({k: report[k] for k in (
        "nDevelopmentPods",
        "nCommanderIdentities",
        "nExposureAtLeast20",
        "LEGACY_RESERVE_WINNERS_OPENED",
        "COMMANDER_META_MODELS_FROZEN",
        "legacyReserve",
        "accumulator",
    )}, indent=2))
    print("C1", spec["C1"])
    print("C2", spec["C2"])


if __name__ == "__main__":
    main()

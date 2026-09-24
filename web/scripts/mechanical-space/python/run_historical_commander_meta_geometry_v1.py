#!/usr/bin/env python3
"""
HISTORICAL_COMMANDER_META_GEOMETRY_V1 — exploratory discovery on spent 44,625.

Does not score frozen CMMG C1/C2. Does not inspect frozen C2 I(c,d).
Does not open the 354 reserved outcomes.
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
OUT = MS / "historical-commander-meta-geometry-v1"

LAM_S = 1e-5
MAX_EPOCHS = 28
BATCH = 128
LR = 1e-3
SEED = 20260821
SHRINK_K = 20.0
MIN_N = 25
MIN_ABS = 0.015
MIN_Z = 1.64
OTHER_MIN = 10


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def pair_key(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def display_name(item) -> str:
    if isinstance(item, dict):
        return str(item.get("canonicalOracleName") or item.get("sourceName") or "").strip()
    return str(item).strip() if item else ""


def main() -> None:
    t0 = time.time()
    assert_cmmg_v1_reserved_winners_locked()
    reserved_ids = {p["podId"] for p in load_json(CMMG / "LEGACY_BLINDED_RESERVE_V1.json")["pods"]}
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    odsg = load_json(ODSG / "eligible-pods.json")["pods"]
    spent_ids = {str(p["podId"]) for p in holdout["pods"]} | {str(p["podId"]) for p in odsg}
    vocab = load_json(CMMG / "development-model-freeze-v1" / "commander-vocabulary.json")
    ge20 = {r["commanderIdentity"] for r in vocab["identities"] if int(r["nPodAppearances"]) >= 20}

    print("  index decks", flush=True)
    cmd_of: dict[str, str | None] = {}
    names: dict[str, str] = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if not did:
                continue
            oids = list(deck.get("commanderOracleIds") or [])
            cnames = list(deck.get("commanders") or [])
            ident = None
            if (deck.get("commanderResolutionStatus") or "") == "resolved":
                ident = commander_identity(oids)
            cmd_of[did] = ident
            pretty = " / ".join(p for p in (display_name(x) for x in cnames) if p)
            if ident and pretty:
                names[ident] = pretty
            for oid, nm in zip(oids, cnames):
                shown = display_name(nm)
                if oid and shown:
                    names[str(oid)] = shown
        print(f"    decks {path.parent.name}", flush=True)

    print("  load spent pods and winners", flush=True)
    wanted: dict[str, list[str]] = {}
    rows = []
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        print(f"    pods {path.parent.name}", flush=True)
        for pod in load_json(path):
            pid = str(pod.get("podId") or "")
            if pid in reserved_ids:
                continue
            if pid not in spent_ids:
                continue
            if int(pod.get("podSize") or 0) != 4 or (pod.get("status") or "") != "Completed":
                continue
            if not winner_field_present(pod):
                continue
            parts = pod.get("participants") or []
            ids = [str(p.get("deckInstanceId") or "") for p in parts]
            if len(ids) != 4 or any(not x for x in ids) or len(set(ids)) != 4:
                continue
            idents = [cmd_of.get(d) for d in ids]
            if any(not x for x in idents):
                continue
            date = pod.get("tournamentDate") if isinstance(pod.get("tournamentDate"), str) else None
            wanted[pid] = ids
            rows.append(
                {
                    "podId": pid,
                    "tid": str(pod.get("tid") or ""),
                    "commanderIdentities": idents,
                    "tournamentDate": date.strip() if isinstance(date, str) and date.strip() else None,
                }
            )
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
    if reserved_ids & set(seats):
        raise SystemExit("reserved winners leaked")
    if len(rows) != 44625:
        raise SystemExit(f"spent rows {len(rows)} != 44625")
    missing = [r["podId"] for r in rows if r["podId"] not in seats]
    if missing:
        raise SystemExit(f"missing winners {len(missing)}")

    appear = defaultdict(int)
    for r in rows:
        for c in set(r["commanderIdentities"]):
            appear[c] += 1
    vocab_ids = sorted(appear)
    index = {c: i + 1 for i, c in enumerate(vocab_ids)}
    x = np.zeros((len(rows), 4), dtype=np.int64)
    y = np.zeros(len(rows), dtype=np.int64)
    for i, r in enumerate(rows):
        for j, c in enumerate(r["commanderIdentities"]):
            x[i, j] = index[c]
        y[i] = seats[r["podId"]]

    print("  fit independent strength model", flush=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    set_seeds(SEED)
    model = CommanderStrength(len(vocab_ids)).to(device)
    xt = torch.from_numpy(x).to(device)
    yt = torch.from_numpy(y).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR, betas=(0.9, 0.999), eps=1e-8)
    n = xt.shape[0]
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        g = torch.Generator()
        g.manual_seed(SEED + epoch)
        perm = torch.randperm(n, generator=g)
        total = 0.0
        for s in range(0, n, BATCH):
            ii = perm[s : s + BATCH]
            u = model.utilities(xt[ii])
            loss = F.nll_loss(F.log_softmax(u, dim=-1), yt[ii]) + LAM_S * strength_l2(model)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            model.center_strength()
            total += float(loss.detach()) * int(ii.shape[0])
        print(f"    strength epoch {epoch} loss={total / n:.4f}", flush=True)
    model.eval()
    with torch.no_grad():
        probs = torch.softmax(model.utilities(xt), dim=-1).cpu().numpy()
        S = model.S.weight.detach().cpu().numpy().reshape(-1)
    strengths = [
        {
            "commanderIdentity": c,
            "name": names.get(c, c),
            "S": float(S[index[c]]),
            "n": appear[c],
            "inExposure20": c in ge20,
        }
        for c in vocab_ids
    ]
    strengths.sort(key=lambda r: -r["S"])

    dated = [r["tournamentDate"] for r in rows if r["tournamentDate"]]
    median_date = sorted(dated)[len(dated) // 2] if dated else None

    acc: dict[tuple[str, str], dict] = {}

    def bucket(a: str, b: str) -> dict:
        k = pair_key(a, b)
        if k not in acc:
            acc[k] = {
                "n": 0,
                "sum": 0.0,
                "sumsq": 0.0,
                "fold": {0: [0, 0.0], 1: [0, 0.0]},
                "time": {"early": [0, 0.0], "late": [0, 0.0]},
                "other": {0: [0, 0.0], 1: [0, 0.0]},
            }
        return acc[k]

    print("  accumulate residuals", flush=True)
    for i, r in enumerate(rows):
        cs = r["commanderIdentities"]
        p = probs[i]
        yi = y[i]
        fold = int(hashlib.sha256(f"HCMG_V1_FOLD:{r['tid']}".encode()).hexdigest(), 16) % 2
        date = r["tournamentDate"]
        half = "late" if (date and median_date and date > median_date) else "early"
        for ia in range(4):
            for ib in range(ia + 1, 4):
                a, b = cs[ia], cs[ib]
                if a == b:
                    continue
                m = ((1.0 if yi == ia else 0.0) - float(p[ia])) - ((1.0 if yi == ib else 0.0) - float(p[ib]))
                if a > b:
                    a, b = b, a
                    m = -m
                rec = bucket(a, b)
                rec["n"] += 1
                rec["sum"] += m
                rec["sumsq"] += m * m
                rec["fold"][fold][0] += 1
                rec["fold"][fold][1] += m
                if date:
                    rec["time"][half][0] += 1
                    rec["time"][half][1] += m
                others = tuple(sorted(x for j, x in enumerate(cs) if j not in (ia, ib)))
                oh = int(hashlib.sha256(f"HCMG_V1_OTHER:{others[0]}|{others[1]}".encode()).hexdigest(), 16) % 2
                rec["other"][oh][0] += 1
                rec["other"][oh][1] += m

    def label(c: str) -> str:
        return names.get(c, c[:8])

    pairs = []
    interesting = []
    for (a, b), rec in acc.items():
        n_ab = rec["n"]
        raw = rec["sum"] / n_ab if n_ab else 0.0
        var = max(rec["sumsq"] / n_ab - raw * raw, 0.0) if n_ab else 0.0
        se = math.sqrt(var / n_ab) if n_ab else float("inf")
        z = raw / se if se > 0 else 0.0
        shrunk = (n_ab / (n_ab + SHRINK_K)) * raw
        folds = {k: (v[1] / v[0] if v[0] else 0.0) for k, v in rec["fold"].items()}
        times = {k: (v[1] / v[0] if v[0] else 0.0) for k, v in rec["time"].items()}
        others = {k: (v[1] / v[0] if v[0] else 0.0) for k, v in rec["other"].items()}
        fold_ok = rec["fold"][0][0] >= MIN_N and rec["fold"][1][0] >= MIN_N and (folds[0] * folds[1] > 0)
        time_ok = rec["time"]["early"][0] >= MIN_N and rec["time"]["late"][0] >= MIN_N and (times["early"] * times["late"] > 0)
        o0, o1 = rec["other"][0][0], rec["other"][1][0]
        if o0 >= OTHER_MIN and o1 >= OTHER_MIN:
            other_status = "same_sign" if others[0] * others[1] > 0 else "sign_flip"
            other_ok = other_status == "same_sign"
        else:
            other_status = "insufficient_other_cast"
            other_ok = True
        supported = a in ge20 and b in ge20 and n_ab >= MIN_N
        away = abs(shrunk) >= MIN_ABS and abs(z) >= MIN_Z
        is_int = supported and away and fold_ok and time_ok and other_ok
        row = {
            "a": a,
            "b": b,
            "nameA": label(a),
            "nameB": label(b),
            "n": n_ab,
            "M_raw": raw,
            "M_shrunk": shrunk,
            "z": z,
            "fold0": folds[0],
            "fold1": folds[1],
            "early": times["early"],
            "late": times["late"],
            "otherCastStatus": other_status,
            "interesting": is_int,
        }
        pairs.append(row)
        if is_int:
            interesting.append(row)

    interesting.sort(key=lambda r: -abs(r["M_shrunk"]))
    pairs.sort(key=lambda r: -abs(r["M_shrunk"]))

    directed = []
    out_n: dict[str, list[str]] = defaultdict(list)
    for row in interesting:
        if row["M_shrunk"] > 0:
            winner, loser = row["a"], row["b"]
        else:
            winner, loser = row["b"], row["a"]
        directed.append({"winner": winner, "loser": loser, "nameW": label(winner), "nameL": label(loser), **{k: row[k] for k in ("n", "M_shrunk", "z")}})
        out_n[winner].append(loser)

    cycles = []
    seen_cyc = set()
    for a, bs in out_n.items():
        for b in bs:
            for c in out_n.get(b, []):
                if a in out_n.get(c, []) and len({a, b, c}) == 3:
                    key = tuple(sorted((a, b, c)))
                    if key in seen_cyc:
                        continue
                    seen_cyc.add(key)
                    cycles.append(
                        {
                            "cycle": [label(a), label(b), label(c)],
                            "identities": [a, b, c],
                            "orientation": f"{label(a)} > {label(b)} > {label(c)} > {label(a)}",
                            "label": "DEVELOPMENT_DERIVED_CANDIDATE_CYCLE",
                            "confirmatory": False,
                        }
                    )

    write_json(OUT / "commander-strength.json", {"n": len(strengths), "commanders": strengths[:200], "allShaNote": "top 200 by S; full ranking in all-strengths.json"})
    write_json(OUT / "all-strengths.json", {"commanders": strengths})
    write_json(
        OUT / "interesting-legs.json",
        {
            "nInteresting": len(interesting),
            "criteria": {"minN": MIN_N, "minAbsShrunk": MIN_ABS, "minAbsZ": MIN_Z, "shrinkK": SHRINK_K},
            "legs": [
                {
                    **row,
                    "direction": f"{row['nameA']} residual-beats {row['nameB']}" if row["M_shrunk"] > 0 else f"{row['nameB']} residual-beats {row['nameA']}",
                }
                for row in interesting
            ],
        },
    )
    write_json(OUT / "candidate-cycles.json", {"n": len(cycles), "cycles": cycles, "confirmatory": False})
    n_pairs_ge25 = sum(1 for p in pairs if p["n"] >= MIN_N and p["a"] in ge20 and p["b"] in ge20)
    report = {
        "artifactType": "HistoricalCommanderMetaGeometryV1",
        "role": "EXPLORATORY_DISCOVERY_ONLY",
        "confirmatory": False,
        "nPods": 44625,
        "nEvents": len({r["tid"] for r in rows}),
        "nIdentities": len(vocab_ids),
        "nExposure20": len(ge20),
        "nSupportedPairsN25": n_pairs_ge25,
        "nInterestingLegs": len(interesting),
        "nCandidateCycles": len(cycles),
        "medianTournamentDate": median_date,
        "strengthLogloss": float(-np.log(np.clip(probs[np.arange(len(y)), y], 1e-12, 1.0)).mean()),
        "topStrength": [s for s in strengths if s["inExposure20"]][:15],
        "topInterestingLegs": interesting[:25],
        "candidateCycles": cycles[:50],
        "frozenC2Inspected": False,
        "legacyReserveOpened": False,
        "cmmgProspectiveUntouched": True,
        "elapsedSec": time.time() - t0,
    }
    write_json(OUT / "REPORT.json", report)
    print(json.dumps({k: report[k] for k in ("nInterestingLegs", "nCandidateCycles", "nSupportedPairsN25", "strengthLogloss")}, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
INTRINSIC_DECK_OPTIMIZATION_GEOMETRY_V1

What properties of an exact deck explain the strength signal,
after controlling for commander identity?

Spent outcomes only. No opponent features. No RPS. No Professor. No CMMG seal.
Does not regenerate the Spellbook representation.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import re
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
POINTS = WEB / "data" / "milestones" / "catalog-shadow" / "catalog-semantic-visualization-v1-points.json.gz"
PARSE = WEB / "data" / "milestones" / "catalog-shadow" / "catalog-shadow-parse-rc8-firestore-v2.jsonl.gz"
OUT = MS / "intrinsic-deck-optimization-geometry-v1"

RX_TUTOR = re.compile(r"search your library", re.I)
RX_DRAW = re.compile(r"draw (?:a card|cards|x cards|two cards|three cards)", re.I)
RX_RAMP = re.compile(r"search your library for (?:a |up to .* )?(?:basic )?land|add \{[wubrgc\d]", re.I)
RX_INTERACT = re.compile(r"counter target|destroy target|exile target|fight target|deal \d+ damage to (?:any target|target)", re.I)
RX_PROTECT = re.compile(r"\bhexproof\b|\bindestructible\b|protection from|\bward\b|counter target spell that targets", re.I)
RX_RECUR = re.compile(r"from (?:your )?graveyard|reanimate|flashback|unearth|escape|return .* graveyard", re.I)


def load_points() -> dict:
    with gzip.open(POINTS, "rt", encoding="utf-8") as fh:
        rows = json.load(fh)
    return {
        r["oracleId"]: r
        for r in rows
        if r.get("oracleId")
    }


def load_texts() -> dict[str, str]:
    out = {}
    with gzip.open(PARSE, "rt", encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            oid = rec.get("oracleId")
            if not oid:
                continue
            chunks = []
            for ab in ((rec.get("semantic") or {}).get("abilities") or []):
                t = ((ab.get("abilitySpan") or {}).get("text") or "").strip()
                if t:
                    chunks.append(t)
            out[oid] = "\n".join(chunks)
    return out


def families(text: str) -> set[str]:
    if not text:
        return set()
    hit = set()
    if RX_TUTOR.search(text):
        hit.add("tutor")
    if RX_DRAW.search(text):
        hit.add("draw")
    if RX_RAMP.search(text):
        hit.add("ramp")
    if RX_INTERACT.search(text):
        hit.add("interact")
    if RX_PROTECT.search(text):
        hit.add("protect")
    if RX_RECUR.search(text):
        hit.add("recur")
    return hit


def deck_features(cmd_oids: list[str], mainboard: list[dict], fp: dict, points: dict, texts: dict) -> dict:
    ident = set()
    mvs = []
    land = 0
    nonland = 0
    inst = 0
    fam = Counter()
    compress = 0
    clusters = []
    for oid in cmd_oids:
        pt = points.get(oid)
        if pt:
            ident.update(pt.get("colorIdentity") or [])
    for card in mainboard:
        oid = str(card.get("oracleId") or card.get("oracle_id") or "")
        q = int(card.get("quantity") or 1)
        if not oid:
            continue
        pt = points.get(oid)
        tl = ((pt.get("typeLine") if pt else "") or "").lower()
        is_land = "land" in tl
        if is_land:
            land += q
        else:
            nonland += q
            if pt and pt.get("manaValue") is not None:
                mvs.extend([float(pt["manaValue"])] * q)
            if "instant" in tl or "sorcery" in tl:
                inst += q
        if pt and pt.get("clusterId") is not None:
            clusters.extend([int(pt["clusterId"])] * q)
        hits = families(texts.get(oid, ""))
        for h in hits:
            fam[h] += q
        if len(hits) >= 2:
            compress += q
    tot = max(land + nonland, 1)
    nl = max(nonland, 1)
    n_col = len(ident)
    ncomb = int(fp.get("nNormalizedCombos") or 0)
    min_sz = fp.get("minComboCardCount")
    n2 = int(fp.get("nTwoCard") or 0)
    cl_ent = 0.0
    if clusters:
        c = Counter(clusters)
        n = len(clusters)
        cl_ent = -sum((v / n) * math.log(v / n, 2) for v in c.values())
    return {
        "nColors": float(n_col),
        "idW": 1.0 if "W" in ident else 0.0,
        "idU": 1.0 if "U" in ident else 0.0,
        "idB": 1.0 if "B" in ident else 0.0,
        "idR": 1.0 if "R" in ident else 0.0,
        "idG": 1.0 if "G" in ident else 0.0,
        "colors3plus": 1.0 if n_col >= 3 else 0.0,
        "colors5": 1.0 if n_col >= 5 else 0.0,
        "minComboSize": float(min_sz or 0),
        "hasTwoCard": 1.0 if n2 > 0 else 0.0,
        "fracTwoCard": (n2 / ncomb) if ncomb else 0.0,
        "logCombos": math.log1p(ncomb),
        "logSharedPieces": math.log1p(int(fp.get("nCardsInMultipleComboSets") or 0)),
        "sharedConc": float(fp.get("sharedPieceConcentration") or 0),
        "logTermRoutes": math.log1p(int(fp.get("nTerminalRoutes") or 0)),
        "cmdInvFrac": float(fp.get("fractionCommanderInvolved") or 0),
        "cmdDependent": 1.0 if fp.get("commanderDependence") == "COMMANDER_DEPENDENT" else 0.0,
        "cmdIndependent": 1.0 if fp.get("commanderDependence") == "COMMANDER_INDEPENDENT" else 0.0,
        "meanMvNonland": float(np.mean(mvs)) if mvs else 0.0,
        "fracMvLe2": (sum(1 for x in mvs if x <= 2) / len(mvs)) if mvs else 0.0,
        "landFrac": land / tot,
        "instantSorceryFrac": inst / tot,
        "tutorFrac": fam["tutor"] / nl,
        "drawFrac": fam["draw"] / nl,
        "rampFrac": fam["ramp"] / nl,
        "interactFrac": fam["interact"] / nl,
        "protectFrac": fam["protect"] / nl,
        "recurFrac": fam["recur"] / nl,
        "roleCompressFrac": compress / nl,
        "clusterEntropy": cl_ent,
        "zeroCombo": 1.0 if ncomb == 0 else 0.0,
    }


COLOR_KEYS = ["nColors", "idW", "idU", "idB", "idR", "idG", "colors3plus", "colors5"]
TUNE_KEYS = [
    "minComboSize",
    "hasTwoCard",
    "fracTwoCard",
    "logCombos",
    "logSharedPieces",
    "sharedConc",
    "logTermRoutes",
    "cmdInvFrac",
    "cmdDependent",
    "cmdIndependent",
    "zeroCombo",
]
ACCESS_KEYS = [
    "meanMvNonland",
    "fracMvLe2",
    "landFrac",
    "instantSorceryFrac",
    "tutorFrac",
    "drawFrac",
    "rampFrac",
    "interactFrac",
    "protectFrac",
    "recurFrac",
    "roleCompressFrac",
    "clusterEntropy",
]
ALL_KEYS = COLOR_KEYS + TUNE_KEYS + ACCESS_KEYS


def vec(feat: dict, keys: list[str]) -> np.ndarray:
    return np.asarray([float(feat[k]) for k in keys], dtype=np.float64)


def event_delta(p_a, p_b, y, tids):
    buckets = defaultdict(lambda: [[], []])
    for i, tid in enumerate(tids):
        buckets[tid][0].append(-math.log(float(np.clip(p_a[i, y[i]], 1e-12, 1))))
        buckets[tid][1].append(-math.log(float(np.clip(p_b[i, y[i]], 1e-12, 1))))
    xs = np.array([np.mean(a) - np.mean(b) for a, b in buckets.values()])
    return {
        "nEvents": int(len(xs)),
        "mean": float(xs.mean()),
        "p50": float(np.median(xs)),
        "fracPositive": float((xs > 0).mean()),
    }


def cv_fit(c, x, y, folds, n_ident, device):
    n = len(y)
    oof = np.zeros((n, 4))
    betas = []
    for fold in range(N_FOLDS):
        tr = np.where(folds != fold)[0]
        te = np.where(folds == fold)[0]
        xs = np.zeros_like(x)
        if x.shape[-1] == 0:
            # commander-only: dummy 1-d zeros, use H0 path via H1 with d=1 all-zero
            x = np.zeros((n, 4, 1))
            xs = x
        else:
            xs[tr], xs[te] = standardize(x[tr], x[te])
        p, b = train_eval(H1, n_ident, c, xs, y, tr, te, device)
        oof[te] = p
        if b is not None:
            betas.append(b)
    return oof, (np.mean(betas, axis=0) if betas else None)


def main() -> None:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    ver = verify_freeze()
    if not ver["SPELLBOOK_REPRESENTATION_HASH_VERIFIED"]:
        write_json(OUT / "STOP.json", ver)
        raise SystemExit("STOP: representation hash mismatch")
    assert_cmmg_v1_reserved_winners_locked()
    print("  load points + rc8 texts", flush=True)
    points = load_points()
    texts = load_texts()
    print(f"    points={len(points)} texts={len(texts)}", flush=True)

    fps = {}
    with (ARCH / "architecture-fingerprints.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rec = json.loads(line)
                fps[str(rec["deckInstanceId"])] = rec

    decks = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did and (deck.get("commanderResolutionStatus") or "") == "resolved":
                decks[did] = deck

    reserved_ids = {p["podId"] for p in load_json(CMMG / "LEGACY_BLINDED_RESERVE_V1.json")["pods"]}
    holdout = load_json(HOLDOUT / "holdout-pods.json")
    odsg = load_json(ODSG / "eligible-pods.json")["pods"]
    spent_ids = {str(p["podId"]) for p in holdout["pods"]} | {str(p["podId"]) for p in odsg}
    cmd_of = {did: commander_identity(list(d.get("commanderOracleIds") or [])) for did, d in decks.items()}
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
            if any(d not in fps or d not in decks or not cmd_of.get(d) for d in ids):
                continue
            wanted[pid] = ids
            rows.append({"podId": pid, "tid": str(pod.get("tid") or ""), "decks": ids, "commanders": [cmd_of[d] for d in ids]})
    seats = {}
    for path in sorted(TOPDECK.glob("*/normalized-pods-v3.json")):
        for raw in load_json(path):
            pid = str(raw.get("podId") or "")
            if pid in reserved_ids or pid not in wanted:
                continue
            seats[pid] = wanted[pid].index(winner_deck_instance_id(raw))
    rows = [r for r in rows if r["podId"] in seats]
    if reserved_ids & set(seats):
        raise SystemExit("reserved leaked")
    print(f"  joined pods {len(rows)}", flush=True)

    appear = defaultdict(int)
    for r in rows:
        for c in r["commanders"]:
            appear[c] += 1
    vocab = sorted(appear)
    cidx = {c: i + 1 for i, c in enumerate(vocab)}
    n = len(rows)
    cmat = np.zeros((n, 4), dtype=np.int64)
    y = np.zeros(n, dtype=np.int64)
    feat_rows = []
    for i, r in enumerate(rows):
        y[i] = seats[r["podId"]]
        fr = []
        for j, did in enumerate(r["decks"]):
            cmat[i, j] = cidx[r["commanders"][j]]
            deck = decks[did]
            fr.append(
                deck_features(
                    list(deck.get("commanderOracleIds") or []),
                    list(deck.get("mainboard") or []),
                    fps[did],
                    points,
                    texts,
                )
            )
        feat_rows.append(fr)

    def stack(keys):
        x = np.zeros((n, 4, len(keys)), dtype=np.float64)
        for i in range(n):
            for j in range(4):
                x[i, j] = vec(feat_rows[i][j], keys)
        return x

    w_arch = np.zeros((n, 4, len(FEATURE_NAMES)), dtype=np.float64)
    for i, r in enumerate(rows):
        for j, did in enumerate(r["decks"]):
            w_arch[i, j] = fp_vector(fps[did])

    folds = np.array([int(hashlib.sha256(f"SWA_V1_EVENT:{r['tid']}".encode()).hexdigest(), 16) % N_FOLDS for r in rows])
    tids = [r["tid"] for r in rows]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  event CV on {device}", flush=True)

    groups = {
        "M0_commander": np.zeros((n, 4, 1)),
        "M_color": stack(COLOR_KEYS),
        "M_tune": stack(TUNE_KEYS),
        "M_arch": w_arch,
        "M_access": stack(ACCESS_KEYS),
        "M_color_tune": stack(COLOR_KEYS + TUNE_KEYS),
        "M_full": stack(ALL_KEYS),
        "M_full_plus_arch": np.concatenate([w_arch, stack(COLOR_KEYS + ACCESS_KEYS)], axis=-1),
    }
    # commander-free full
    results = {}
    betas = {}
    for name, x in groups.items():
        print(f"    {name} d={x.shape[-1]}", flush=True)
        p, b = cv_fit(cmat, x, y, folds, len(vocab), device)
        results[name] = {"metrics": metrics(p, y), "p": p, "beta": b}

    # no-commander control: same M_full features but H1 still has commander embeddings.
    # True commander-free: fit utilities from features only.
    class FeatOnly(torch.nn.Module):
        def __init__(self, n_ident, d):
            super().__init__()
            self.S = torch.nn.Embedding(1, 1)  # unused
            self.beta = torch.nn.Linear(d, 1)
            torch.nn.init.zeros_(self.beta.weight)
            torch.nn.init.zeros_(self.beta.bias)

        def utilities(self, c, w):
            return self.beta(w).squeeze(-1)

        def center(self):
            pass

    oof_nc = np.zeros((n, 4))
    xfull = groups["M_full"]
    for fold in range(N_FOLDS):
        tr = np.where(folds != fold)[0]
        te = np.where(folds == fold)[0]
        xs = np.zeros_like(xfull)
        xs[tr], xs[te] = standardize(xfull[tr], xfull[te])
        p, _ = train_eval(FeatOnly, len(vocab), cmat, xs, y, tr, te, device)
        oof_nc[te] = p
    results["M_full_no_commander"] = {"metrics": metrics(oof_nc, y), "p": oof_nc, "beta": None}

    m0 = results["M0_commander"]["metrics"]
    table = []
    for name, rec in results.items():
        m = rec["metrics"]
        table.append(
            {
                "model": name,
                **m,
                "deltaVsCommander": m0["logloss"] - m["logloss"],
            }
        )

    # color descriptive
    color_n = Counter()
    color_w = Counter()
    for i in range(n):
        for j in range(4):
            k = int(feat_rows[i][j]["nColors"])
            color_n[k] += 1
            color_w[k] += int(y[i] == j)
    color_rows = [
        {"nColors": k, "seats": color_n[k], "winRate": color_w[k] / color_n[k] if color_n[k] else None}
        for k in sorted(color_n)
    ]

    # within-commander color/tune residual for large commanders
    cmd_stats = defaultdict(lambda: {"n": 0, "wins": 0, "by_colors": defaultdict(lambda: [0, 0]), "by_twocard": defaultdict(lambda: [0, 0])})
    names = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            ident = cmd_of.get(did)
            if not ident:
                continue
            parts = []
            for cm in deck.get("commanders") or []:
                if isinstance(cm, dict) and cm.get("canonicalOracleName"):
                    parts.append(cm["canonicalOracleName"])
            if parts:
                names[ident] = " / ".join(parts)
    for i, r in enumerate(rows):
        for j in range(4):
            ident = r["commanders"][j]
            rec = cmd_stats[ident]
            rec["n"] += 1
            rec["wins"] += int(y[i] == j)
            nc = int(feat_rows[i][j]["nColors"])
            rec["by_colors"][nc][0] += 1
            rec["by_colors"][nc][1] += int(y[i] == j)
            tw = int(feat_rows[i][j]["hasTwoCard"])
            rec["by_twocard"][tw][0] += 1
            rec["by_twocard"][tw][1] += int(y[i] == j)

    within = []
    for ident, rec in cmd_stats.items():
        if rec["n"] < 200:
            continue
        p0 = rec["wins"] / rec["n"]
        tw = rec["by_twocard"]
        if tw[0][0] >= 30 and tw[1][0] >= 30:
            r0 = tw[0][1] / tw[0][0]
            r1 = tw[1][1] / tw[1][0]
            s0 = (tw[0][0] / (tw[0][0] + 20)) * r0 + (20 / (tw[0][0] + 20)) * p0
            s1 = (tw[1][0] / (tw[1][0] + 20)) * r1 + (20 / (tw[1][0] + 20)) * p0
            within.append(
                {
                    "name": names.get(ident, ident[:16]),
                    "nSeats": rec["n"],
                    "commanderWinRate": p0,
                    "noTwoCard": {"n" : tw[0][0], "raw": r0, "shrunk": s0},
                    "hasTwoCard": {"n": tw[1][0], "raw": r1, "shrunk": s1},
                    "shrunkDeltaTwoCardMinusNone": s1 - s0,
                }
            )
    within.sort(key=lambda r: -abs(r["shrunkDeltaTwoCardMinusNone"]))

    full_beta = results["M_full"]["beta"]
    contrib = []
    if full_beta is not None:
        for k, v in zip(ALL_KEYS, full_beta):
            contrib.append({"feature": k, "meanBeta": float(v), "abs": float(abs(v))})
        contrib.sort(key=lambda r: -r["abs"])

    report = {
        "artifactType": "IntrinsicDeckOptimizationGeometryV1",
        "role": "HISTORICAL_EXPLORATORY_ONLY",
        "confirmatory": False,
        "question": "What properties of an exact deck explain the strength signal after controlling for commander identity?",
        "notMatchupGeometry": True,
        "SPELLBOOK_REPRESENTATION_CHANGED": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "PROFESSOR_CHANGED": False,
        "nPods": n,
        "nEvents": len(set(tids)),
        "models": [{k: r[k] for k in r if k != "p"} for r in ({"model": t["model"], **results[t["model"]]["metrics"], "deltaVsCommander": t["deltaVsCommander"]} for t in table)],
        "eventDeltaFullVsCommander": event_delta(results["M0_commander"]["p"], results["M_full"]["p"], y, tids),
        "eventDeltaColorVsCommander": event_delta(results["M0_commander"]["p"], results["M_color"]["p"], y, tids),
        "eventDeltaTuneVsCommander": event_delta(results["M0_commander"]["p"], results["M_tune"]["p"], y, tids),
        "eventDeltaAccessVsCommander": event_delta(results["M0_commander"]["p"], results["M_access"]["p"], y, tids),
        "colorCountWinRates": color_rows,
        "fullModelCoefficients": contrib,
        "withinCommanderTwoCard": within[:15],
        "deferred": [
            "piece quality beyond regex families",
            "BGE pairwise semantic synergy (no re-embed; cluster entropy used as coherence proxy)",
            "tutor-to-combo-piece targeting graph",
        ],
        "elapsedSec": time.time() - t0,
    }
    # strip numpy from models list
    report["models"] = table
    write_json(OUT / "REPORT.json", report)
    write_json(
        OUT / "RESEARCH_STATUS.json",
        {
            "lineage": "INTRINSIC_DECK_OPTIMIZATION_GEOMETRY_V1",
            "status": "HISTORICAL_EXPLORATORY_REPORTED",
            "CMMG_SEALED_OUTCOMES_OPENED": False,
            "PROFESSOR_CHANGED": False,
            "matchupMining": False,
        },
    )
    write_json(
        OUT / "PROTOCOL.json",
        {
            "baseline": "commander identity",
            "groups": {"color": COLOR_KEYS, "tune": TUNE_KEYS, "access": ACCESS_KEYS},
            "eventFolds": N_FOLDS,
            "opponentFeatures": False,
        },
    )
    print(json.dumps({"models": table, "colors": color_rows, "topBeta": contrib[:12]}, indent=2))


if __name__ == "__main__":
    main()

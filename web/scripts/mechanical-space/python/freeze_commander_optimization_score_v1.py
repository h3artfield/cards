#!/usr/bin/env python3
"""
COMMANDER_OPTIMIZATION_SCORE_V1

Freeze the first COS formula from the spent intrinsic ablation.
Does not change Professor. Does not open CMMG sealed outcomes.
Does not regenerate the Spellbook representation. No opponent features.
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

from outcome_firewall_v1 import assert_cmmg_v1_reserved_winners_locked
from run_intrinsic_deck_optimization_geometry_v1 import (
    ACCESS_KEYS,
    cv_fit,
    deck_features,
    vec,
)
from run_intrinsic_strength_ablation_v1 import ACCESS_SPLITS, load_joined
from run_spellbook_historical_outcome_association_v1 import (
    BATCH,
    FEATURE_NAMES,
    H1,
    LAM_S,
    LAM_W,
    LR,
    MAX_EPOCHS,
    N_FOLDS,
    SEED,
    fp_vector,
    metrics,
    set_seeds,
    sha256_file,
    verify_freeze,
    write_json,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
ARCH = MS / "spellbook-win-architecture-space-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
ABLATION = MS / "intrinsic-strength-ablation-v1"
OUT = MS / "commander-optimization-score-v1"

MIN_COMMANDER_UNIQUE = 30
HEADLINE_KEYS = list(FEATURE_NAMES) + list(ACCESS_KEYS)

PROFILE_AXES = [
    {
        "id": "win_architecture",
        "label": "Win architecture",
        "role": "load_bearing",
        "higherIsBetter": True,
        "measurement": "routes + two-card flag − 0.25×minComboSize; 0 if no CARD_COMPLETE combo",
    },
    {
        "id": "access_consistency",
        "label": "Access / consistency",
        "role": "descriptive_only",
        "higherIsBetter": True,
        "measurement": "tutorFrac",
        "note": "Isolation signal only. Not an independent headline weight.",
    },
    {
        "id": "mana_efficiency",
        "label": "Mana efficiency",
        "role": "load_bearing",
        "higherIsBetter": True,
        "measurement": "fracMvLe2 + rampFrac − 0.15×meanMvNonland",
    },
    {
        "id": "redundancy",
        "label": "Redundancy",
        "role": "descriptive_only",
        "higherIsBetter": True,
        "measurement": "sharedPieceConcentration",
        "note": "Architecture-slice LOO was ~0. Profile descriptor only.",
    },
    {
        "id": "interaction",
        "label": "Interaction",
        "role": "load_bearing",
        "higherIsBetter": True,
        "measurement": "interactFrac",
    },
    {
        "id": "protection",
        "label": "Protection",
        "role": "load_bearing",
        "higherIsBetter": True,
        "measurement": "protectFrac",
    },
    {
        "id": "resilience",
        "label": "Resilience",
        "role": "descriptive_only",
        "higherIsBetter": True,
        "measurement": "recurFrac",
    },
    {
        "id": "card_advantage",
        "label": "Card advantage",
        "role": "load_bearing",
        "higherIsBetter": True,
        "measurement": "drawFrac",
    },
    {
        "id": "role_compression",
        "label": "Role compression",
        "role": "descriptive_only",
        "higherIsBetter": True,
        "measurement": "roleCompressFrac",
    },
    {
        "id": "coherence",
        "label": "Coherence",
        "role": "load_bearing",
        "higherIsBetter": True,
        "measurement": "−clusterEntropy",
    },
]


def profile_scalars(feat: dict, fp: dict) -> dict[str, float]:
    ncomb = int(fp.get("nNormalizedCombos") or 0)
    if ncomb == 0:
        arch = 0.0
    else:
        routes = math.log1p(int(fp.get("nTerminalRoutes") or 0))
        two = 1.0 if int(fp.get("nTwoCard") or 0) > 0 else 0.0
        arch = routes + two - 0.25 * float(fp.get("minComboCardCount") or 0)
    return {
        "win_architecture": arch,
        "access_consistency": float(feat["tutorFrac"]),
        "mana_efficiency": float(feat["fracMvLe2"]) + float(feat["rampFrac"]) - 0.15 * float(feat["meanMvNonland"]),
        "redundancy": float(feat["sharedConc"]),
        "interaction": float(feat["interactFrac"]),
        "protection": float(feat["protectFrac"]),
        "resilience": float(feat["recurFrac"]),
        "card_advantage": float(feat["drawFrac"]),
        "role_compression": float(feat["roleCompressFrac"]),
        "coherence": -float(feat["clusterEntropy"]),
    }


def grid101(xs: np.ndarray) -> list[float]:
    if len(xs) == 0:
        return [0.0] * 101
    return [float(v) for v in np.quantile(xs, np.linspace(0.0, 1.0, 101))]


def pct_from_grid(value: float, grid: list[float]) -> float:
    return float(np.interp(value, grid, np.linspace(0.0, 100.0, 101)))


def train_full(n_ident, c, w, y, device):
    d = w.shape[-1]
    model = H1(n_ident, d).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    ct = torch.from_numpy(c).to(device)
    wt = torch.from_numpy(w).float().to(device)
    yt = torch.from_numpy(y).to(device)
    n = ct.shape[0]
    set_seeds(SEED)
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        g = torch.Generator()
        g.manual_seed(SEED + epoch)
        perm = torch.randperm(n, generator=g)
        for s in range(0, n, BATCH):
            ii = perm[s : s + BATCH]
            u = model.utilities(ct[ii], wt[ii])
            loss = F_nll(u, yt[ii]) + LAM_S * model.S.weight[1:].pow(2).sum() + LAM_W * model.beta.weight.pow(2).sum()
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            model.center()
    model.eval()
    with torch.no_grad():
        s = model.S.weight.detach().cpu().numpy().reshape(-1)
        beta = model.beta.weight.detach().cpu().numpy().reshape(-1)
    return s, beta


def F_nll(u, y):
    return torch.nn.functional.nll_loss(torch.nn.functional.log_softmax(u, dim=-1), y)


def formula_doc() -> dict:
    return {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V1",
        "COS_FORMULA_FROZEN": True,
        "outputs": {
            "competitiveStrength": {
                "range": "0-100",
                "answers": "How strong does this deck appear overall?",
                "utility": "S[commander] + beta · z(architecture ⊕ access)",
                "mapping": "percentile of utility among unique spent lists",
                "includes": ["commander identity", "frozen Spellbook architecture", "access/construction densities"],
                "excludes": ["color_enabler", "opponent features", "equal-weighted profile sum"],
            },
            "buildOptimization": {
                "range": "0-100 percentile or null",
                "answers": "Given this commander, how well is the 99 optimized?",
                "residual": "beta · z(architecture ⊕ access)",
                "mapping": "percentile of residual among unique spent lists of the same commander",
                "minUniqueLists": MIN_COMMANDER_UNIQUE,
                "insufficientReference": None,
            },
            "profile": {
                "role": "explain why; do not average into Competitive Strength",
                "mapping": "within-commander percentile of outcome-blind axis scalars; global fallback if n < 30",
                "axes": PROFILE_AXES,
            },
        },
        "rejected": [
            "CRISPI-style equal buckets",
            "points per additional color",
            "tutor density as an independent headline weight",
            "averaging profile axes into the overall number",
        ],
        "ablation": {
            "dir": "intrinsic-strength-ablation-v1",
            "fullDeltaVsCommander": 0.005193110414959179,
            "uniqueAccessBundle": 0.002887981388759897,
            "uniqueArchitecture": 0.0017898644392000396,
            "uniqueColor": -9.284889436433907e-05,
        },
        "colorRole": "ENABLER_NOT_MEASURE",
        "opponentFeatures": False,
        "professorChanged": False,
    }


def main() -> None:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    write_json(OUT / "FORMULA.json", formula_doc())
    ver = verify_freeze()
    if not ver["SPELLBOOK_REPRESENTATION_HASH_VERIFIED"]:
        write_json(OUT / "STOP.json", ver)
        raise SystemExit("STOP: representation hash mismatch")
    assert_cmmg_v1_reserved_winners_locked()
    if "nColors" in HEADLINE_KEYS or "colors5" in HEADLINE_KEYS:
        raise SystemExit("STOP: color leaked into headline features")

    print("  load points + texts + join", flush=True)
    from run_intrinsic_deck_optimization_geometry_v1 import load_points, load_texts

    points = load_points()
    texts = load_texts()
    rows, seats, decks, fps = load_joined()
    print(f"  joined pods {len(rows)}", flush=True)

    appear = {}
    for r in rows:
        for c in r["commanders"]:
            appear[c] = appear.get(c, 0) + 1
    vocab = sorted(appear)
    cidx = {c: i + 1 for i, c in enumerate(vocab)}
    n = len(rows)
    cmat = np.zeros((n, 4), dtype=np.int64)
    y = np.zeros(n, dtype=np.int64)
    x = np.zeros((n, 4, len(HEADLINE_KEYS)), dtype=np.float64)
    feat_rows = []
    dids = []
    prof_rows = []
    for i, r in enumerate(rows):
        y[i] = seats[r["podId"]]
        fr = []
        pr = []
        ds = []
        for j, did in enumerate(r["decks"]):
            cmat[i, j] = cidx[r["commanders"][j]]
            deck = decks[did]
            feat = deck_features(
                list(deck.get("commanderOracleIds") or []),
                list(deck.get("mainboard") or []),
                fps[did],
                points,
                texts,
            )
            arch = fp_vector(fps[did])
            acc = vec(feat, ACCESS_KEYS)
            x[i, j] = np.concatenate([arch, acc])
            fr.append(feat)
            pr.append(profile_scalars(feat, fps[did]))
            ds.append(did)
        feat_rows.append(fr)
        prof_rows.append(pr)
        dids.append(ds)

    folds = np.array(
        [int(hashlib.sha256(f"SWA_V1_EVENT:{r['tid']}".encode()).hexdigest(), 16) % N_FOLDS for r in rows]
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  event CV headline (no color) on {device} d={x.shape[-1]}", flush=True)
    p0, _ = cv_fit(cmat, np.zeros((n, 4, 1)), y, folds, len(vocab), device)
    p1, _ = cv_fit(cmat, x, y, folds, len(vocab), device)
    m0 = metrics(p0, y)
    m1 = metrics(p1, y)

    mu = x.mean(axis=(0, 1))
    sd = x.std(axis=(0, 1))
    sd = np.where(sd < 1e-8, 1.0, sd)
    xs = (x - mu) / sd
    print("  full-spent fit for frozen scorer", flush=True)
    S, beta = train_full(len(vocab), cmat, xs, y, device)
    util = S[cmat] + xs @ beta
    resid = xs @ beta

    did_to_cmd = {}
    for r in rows:
        for j, did in enumerate(r["decks"]):
            did_to_cmd[did] = r["commanders"][j]
    names = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            ident = did_to_cmd.get(did)
            if not ident:
                continue
            parts = [
                cm["canonicalOracleName"]
                for cm in (deck.get("commanders") or [])
                if isinstance(cm, dict) and cm.get("canonicalOracleName")
            ]
            if parts:
                names[ident] = " / ".join(parts)

    # unique lists
    seen = {}
    for i, r in enumerate(rows):
        for j, did in enumerate(r["decks"]):
            if did in seen:
                continue
            seen[did] = {
                "did": did,
                "commander": r["commanders"][j],
                "U": float(util[i, j]),
                "R": float(resid[i, j]),
                "profile": prof_rows[i][j],
            }
    unique = list(seen.values())
    U = np.array([d["U"] for d in unique], dtype=np.float64)
    global_u = grid101(U)
    global_profile = {
        ax["id"]: grid101(np.array([d["profile"][ax["id"]] for d in unique], dtype=np.float64)) for ax in PROFILE_AXES
    }
    by_cmd = defaultdict(list)
    for d in unique:
        by_cmd[d["commander"]].append(d)

    commander_ref = {}
    for ident, items in by_cmd.items():
        rvals = np.array([it["R"] for it in items], dtype=np.float64)
        rec = {
            "name": names.get(ident, ident[:24]),
            "nUnique": len(items),
            "eligibleBuildOptimization": len(items) >= MIN_COMMANDER_UNIQUE,
            "residualQuantiles": grid101(rvals) if len(items) >= MIN_COMMANDER_UNIQUE else None,
            "profileQuantiles": {},
        }
        for ax in PROFILE_AXES:
            xs_ax = np.array([it["profile"][ax["id"]] for it in items], dtype=np.float64)
            rec["profileQuantiles"][ax["id"]] = grid101(xs_ax) if len(items) >= MIN_COMMANDER_UNIQUE else None
        commander_ref[ident] = rec

    # illustrations: commanders with enough unique lists
    illustrations = []
    for ident, rec in commander_ref.items():
        if rec["nUnique"] < 80:
            continue
        items = by_cmd[ident]
        cs = [pct_from_grid(it["U"], global_u) for it in items]
        bo = [pct_from_grid(it["R"], rec["residualQuantiles"]) for it in items]
        illustrations.append(
            {
                "name": rec["name"],
                "nUnique": rec["nUnique"],
                "competitiveStrength": {
                    "p10": float(np.quantile(cs, 0.10)),
                    "p50": float(np.quantile(cs, 0.50)),
                    "p90": float(np.quantile(cs, 0.90)),
                },
                "buildOptimization": {
                    "p10": float(np.quantile(bo, 0.10)),
                    "p50": float(np.quantile(bo, 0.50)),
                    "p90": float(np.quantile(bo, 0.90)),
                },
            }
        )
    illustrations.sort(key=lambda r: -r["nUnique"])

    schema = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V1",
        "headlineFeatures": HEADLINE_KEYS,
        "colorInHeadline": False,
        "accessKeys": list(ACCESS_KEYS),
        "architectureFeatures": list(FEATURE_NAMES),
        "profileAxes": PROFILE_AXES,
        "minCommanderUnique": MIN_COMMANDER_UNIQUE,
        "standardize": "per-feature mean/sd over spent seats",
        "eventFolds": "SWA_V1_EVENT",
        "seed": SEED,
        "epochs": MAX_EPOCHS,
        "lamS": LAM_S,
        "lamW": LAM_W,
        "accessSplits": ACCESS_SPLITS,
    }
    write_json(OUT / "SCHEMA.json", schema)
    model = {
        "nIdent": len(vocab),
        "commanderIdentities": vocab,
        "featureNames": HEADLINE_KEYS,
        "mu": [float(v) for v in mu],
        "sd": [float(v) for v in sd],
        "S": [float(v) for v in S],
        "beta": [float(v) for v in beta],
    }
    write_json(OUT / "MODEL.json", model)
    reference = {
        "nUniqueLists": len(unique),
        "minCommanderUnique": MIN_COMMANDER_UNIQUE,
        "globalUtilityQuantiles": global_u,
        "globalProfileQuantiles": global_profile,
        "commanders": commander_ref,
    }
    write_json(OUT / "REFERENCE.json", reference)

    hashes = {name: sha256_file(OUT / name) for name in ("FORMULA.json", "SCHEMA.json", "MODEL.json", "REFERENCE.json")}
    freeze = {
        "lineage": "COMMANDER_OPTIMIZATION_SCORE_V1",
        "status": "FORMULA_FROZEN",
        "frozen": True,
        "role": "HISTORICAL_EXPLORATORY_CALIBRATION",
        "confirmatory": False,
        "COS_FORMULA_FROZEN": True,
        "outputs": ["competitiveStrength", "buildOptimization", "profile"],
        "headline": "commander + Spellbook architecture + access/construction; color excluded",
        "profileNotAveragedIntoHeadline": True,
        "heldOut": {
            "nPods": n,
            "nEvents": len({r["tid"] for r in rows}),
            "commanderLogloss": m0["logloss"],
            "headlineLogloss": m1["logloss"],
            "deltaVsCommander": m0["logloss"] - m1["logloss"],
            "commanderTop1": m0["top1"],
            "headlineTop1": m1["top1"],
        },
        "nUniqueLists": len(unique),
        "nCommandersEligibleForBuildOptimization": sum(
            1 for rec in commander_ref.values() if rec["eligibleBuildOptimization"]
        ),
        "checksums": hashes,
        "SPELLBOOK_REPRESENTATION_CHANGED": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "PROFESSOR_CHANGED": False,
        "caveat": "0-100 mapping is a spent-data calibration of the frozen scorer, not a prospective gate. Not wired into Professor.",
    }
    write_json(OUT / "FREEZE.json", freeze)
    report = {
        "artifactType": "CommanderOptimizationScoreV1",
        **freeze,
        "illustrations": illustrations[:12],
        "elapsedSec": time.time() - t0,
    }
    write_json(OUT / "REPORT.json", report)
    write_json(
        OUT / "RESEARCH_STATUS.json",
        {
            "lineage": "COMMANDER_OPTIMIZATION_SCORE_V1",
            "status": "FORMULA_FROZEN",
            "COS_FORMULA_FROZEN": True,
            "CMMG_SEALED_OUTCOMES_OPENED": False,
            "PROFESSOR_CHANGED": False,
            "matchupMining": False,
        },
    )
    write_json(
        ABLATION / "COS_V1_PROPOSAL.json",
        {
            "artifactType": "CommanderOptimizationScoreV1Proposal",
            "COS_FORMULA_FROZEN": True,
            "status": "ACCEPTED_AND_FROZEN",
            "frozenLineage": "COMMANDER_OPTIMIZATION_SCORE_V1",
            "dir": "commander-optimization-score-v1",
        },
    )
    print(
        json.dumps(
            {
                "heldOutDelta": freeze["heldOut"]["deltaVsCommander"],
                "nUnique": len(unique),
                "nEligibleBO": freeze["nCommandersEligibleForBuildOptimization"],
                "checksums": hashes,
                "topIllustrations": illustrations[:5],
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
INTRINSIC_STRENGTH_ABLATION_V1

Outcome-blind taxonomy of frozen intrinsic features, then spent-data
leave-one-group-out and group-only ablations of the +0.00519 commander-
controlled lift.

Does not freeze COMMANDER_OPTIMIZATION_SCORE_V1.
Does not add opponent features, inspect CMMG C2, or change Professor.
Does not regenerate the Spellbook representation.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import numpy as np
import torch

from freeze_cmmg_v1_dataset_protocol import commander_identity, winner_field_present
from odsg_v1_winners import winner_deck_instance_id
from outcome_firewall_v1 import assert_cmmg_v1_reserved_winners_locked
from run_intrinsic_deck_optimization_geometry_v1 import (
    ACCESS_KEYS,
    COLOR_KEYS,
    cv_fit,
    deck_features,
    event_delta,
    load_points,
    load_texts,
    vec,
)
from run_spellbook_historical_outcome_association_v1 import (
    DEP,
    ENAB_BUCKETS,
    FEATURE_NAMES,
    N_FOLDS,
    TERM_BUCKETS,
    ZONE_KEYS,
    fp_vector,
    metrics,
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
OUT = MS / "intrinsic-strength-ablation-v1"

# Outcome-blind COS candidate dimensions. Groups are defined from frozen
# feature meaning, not from coefficients or held-out performance.
ACCESS_SPLITS = {
    "access_consistency": ["tutorFrac"],
    "mana_efficiency": ["meanMvNonland", "fracMvLe2", "landFrac", "rampFrac"],
    "card_advantage": ["drawFrac"],
    "interaction": ["interactFrac"],
    "protection": ["protectFrac"],
    "resilience": ["recurFrac"],
    "role_compression": ["roleCompressFrac"],
    "coherence": ["clusterEntropy"],
    "spell_speed": ["instantSorceryFrac"],
}

ARCH_SLICES = {
    "arch_compactness": [
        "logCombos",
        "logNative",
        "zeroCombo",
        "minSize",
        "logTwo",
        "logThree",
        "logFour",
        "hasTerminal",
    ],
    "arch_redundancy": ["logSharedCards", "sharedConc"],
    "arch_commander_participation": ["fracCmd", "logCmdInv"] + [f"dep_{d}" for d in DEP],
    "arch_packages": (
        ["logTermRoutes", "logResLoops", "logPrereq", "logMana"]
        + [f"term_{b}" for b in TERM_BUCKETS]
        + [f"enab_{b}" for b in ENAB_BUCKETS]
    ),
    "arch_zones": [f"zone_{z}" for z in ZONE_KEYS],
}

MISSING_FROM_CURRENT_MEASUREMENT = [
    "tutor-to-combo-piece targeting graph",
    "piece quality beyond RC8 regex families",
    "free vs paid interaction split",
    "BGE pairwise semantic synergy (cluster entropy is the coherence proxy; no re-embed)",
    "colored-mana tightness / fast-mana vs generic ramp",
    "protection specifically of the win attempt vs generic hexproof/ward density",
]


def taxonomy() -> dict:
    return {
        "artifactType": "IntrinsicStrengthFeatureTaxonomyV1",
        "role": "OUTCOME_BLIND",
        "question": "What measurable own-deck properties exist before any scoring weights are chosen?",
        "COS_FORMULA_FROZEN": False,
        "equalBucketWeights": False,
        "colorIsScoringTarget": False,
        "colorRole": "ENABLER_NOT_MEASURE",
        "SPELLBOOK_REPRESENTATION_CHANGED": False,
        "dimensions": [
            {
                "id": "spellbook_architecture",
                "label": "Win architecture",
                "answers": "How is this 100 constructed to win?",
                "source": "frozen Spellbook architecture fingerprint",
                "features": list(FEATURE_NAMES),
                "slices": {k: v for k, v in ARCH_SLICES.items()},
                "notAPowerScore": True,
            },
            {
                "id": "access_consistency",
                "label": "Access / consistency",
                "answers": "How densely can the deck find pieces?",
                "source": "RC8 ability-text regex on catalog cards",
                "features": ACCESS_SPLITS["access_consistency"],
                "measurementNote": "Tutor density only. Does not yet measure which pieces are tutored.",
            },
            {
                "id": "mana_efficiency",
                "label": "Mana efficiency",
                "answers": "How cheap and accelerated is the list?",
                "source": "catalog manaValue + RC8 ramp regex + land fraction",
                "features": ACCESS_SPLITS["mana_efficiency"],
                "measurementNote": "Ramp regex is generic (land search / add mana). Not a fast-mana taxonomy.",
            },
            {
                "id": "card_advantage",
                "label": "Card advantage",
                "answers": "How much draw / selection text is present?",
                "source": "RC8 draw regex",
                "features": ACCESS_SPLITS["card_advantage"],
            },
            {
                "id": "interaction",
                "label": "Interaction",
                "answers": "How much disruption text is present?",
                "source": "RC8 interact regex",
                "features": ACCESS_SPLITS["interaction"],
                "measurementNote": "Does not split free vs paid or flexible vs narrow.",
            },
            {
                "id": "protection",
                "label": "Protection",
                "answers": "How much protect-the-engine text is present?",
                "source": "RC8 protect regex",
                "features": ACCESS_SPLITS["protection"],
            },
            {
                "id": "resilience",
                "label": "Resilience",
                "answers": "How much recursion / recovery text is present?",
                "source": "RC8 recur regex",
                "features": ACCESS_SPLITS["resilience"],
            },
            {
                "id": "role_compression",
                "label": "Role compression",
                "answers": "What fraction of nonlands hit 2+ measured families?",
                "source": "count of cards matching >=2 RC8 families",
                "features": ACCESS_SPLITS["role_compression"],
            },
            {
                "id": "coherence",
                "label": "Coherence",
                "answers": "How concentrated is the list in catalog semantic clusters?",
                "source": "cluster-id entropy of mainboard oracles",
                "features": ACCESS_SPLITS["coherence"],
                "measurementNote": "Lower entropy = more cluster-concentrated. Not pairwise BGE synergy.",
            },
            {
                "id": "spell_speed",
                "label": "Instant / sorcery density",
                "answers": "What fraction of the list is instant or sorcery?",
                "source": "catalog typeLine",
                "features": ACCESS_SPLITS["spell_speed"],
                "scoringCandidate": False,
                "measurementNote": "Residual construction descriptor. Not a proposed COS profile axis.",
            },
            {
                "id": "color_enabler",
                "label": "Color identity / color count",
                "answers": "What colors does the commander identity have?",
                "source": "catalog colorIdentity of commanders",
                "features": list(COLOR_KEYS),
                "scoringCandidate": False,
                "role": "ENABLER_NOT_MEASURE",
                "measurementNote": "Included so ablation can confirm it earns no independent credit.",
            },
        ],
        "deferred": MISSING_FROM_CURRENT_MEASUREMENT,
        "scoringRule": {
            "overallStrength": "empirically validated commander + intrinsic model, not equal-weighted profile sum",
            "profileAxes": "describe measurable properties; do not average into the headline number",
            "sameCommanderPercentile": "residual of the intrinsic model within commander, after COS formula freeze",
            "doNotScore": ["color_enabler", "spell_speed"],
        },
    }


def load_joined():
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
            rows.append(
                {
                    "podId": pid,
                    "tid": str(pod.get("tid") or ""),
                    "decks": ids,
                    "commanders": [cmd_of[d] for d in ids],
                }
            )
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
    return rows, seats, decks, fps


def stack_keys(feat_rows, keys):
    n = len(feat_rows)
    x = np.zeros((n, 4, len(keys)), dtype=np.float64)
    for i in range(n):
        for j in range(4):
            x[i, j] = vec(feat_rows[i][j], keys)
    return x


def drop_columns(x, keep_mask):
    if not np.any(keep_mask):
        return np.zeros((x.shape[0], x.shape[1], 1), dtype=np.float64)
    return x[:, :, keep_mask]


def main() -> None:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    tax = taxonomy()
    write_json(OUT / "TAXONOMY.json", tax)
    ver = verify_freeze()
    if not ver["SPELLBOOK_REPRESENTATION_HASH_VERIFIED"]:
        write_json(OUT / "STOP.json", ver)
        raise SystemExit("STOP: representation hash mismatch")
    assert_cmmg_v1_reserved_winners_locked()
    print("  load points + rc8 texts", flush=True)
    points = load_points()
    texts = load_texts()
    print("  join spent fingerprinted pods", flush=True)
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
    feat_rows = []
    w_arch = np.zeros((n, 4, len(FEATURE_NAMES)), dtype=np.float64)
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
            w_arch[i, j] = fp_vector(fps[did])
        feat_rows.append(fr)

    color = stack_keys(feat_rows, COLOR_KEYS)
    access_parts = {name: stack_keys(feat_rows, keys) for name, keys in ACCESS_SPLITS.items()}
    access_all = stack_keys(feat_rows, ACCESS_KEYS)
    blocks = [("spellbook_architecture", w_arch), ("color_enabler", color)]
    blocks.extend((name, access_parts[name]) for name in ACCESS_SPLITS)
    names = [b[0] for b in blocks]
    full = np.concatenate([b[1] for b in blocks], axis=-1)
    widths = [b[1].shape[-1] for b in blocks]
    starts = np.cumsum([0] + widths[:-1])
    col_of = {}
    for name, start, width in zip(names, starts, widths):
        col_of[name] = np.zeros(full.shape[-1], dtype=bool)
        col_of[name][start : start + width] = True
    col_of["access_bundle"] = np.zeros(full.shape[-1], dtype=bool)
    for name in ACCESS_SPLITS:
        col_of["access_bundle"] |= col_of[name]
    arch_idx = {f: i for i, f in enumerate(FEATURE_NAMES)}
    for slice_name, feats in ARCH_SLICES.items():
        mask = np.zeros(full.shape[-1], dtype=bool)
        for f in feats:
            mask[arch_idx[f]] = True
        col_of[slice_name] = mask

    folds = np.array(
        [int(hashlib.sha256(f"SWA_V1_EVENT:{r['tid']}".encode()).hexdigest(), 16) % N_FOLDS for r in rows]
    )
    tids = [r["tid"] for r in rows]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  event CV on {device} full_d={full.shape[-1]}", flush=True)

    jobs = []
    jobs.append(("M0_commander", np.zeros((n, 4, 1))))
    jobs.append(("FULL_commander_plus_all", full))
    jobs.append(("ADD_spellbook_architecture", w_arch))
    jobs.append(("ADD_color_enabler", color))
    jobs.append(("ADD_access_bundle", access_all))
    for name, x in access_parts.items():
        jobs.append((f"ADD_{name}", x))
    for name, mask in col_of.items():
        jobs.append((f"LOO_{name}", drop_columns(full, ~mask)))

    table = []
    preds = {}
    for name, x in jobs:
        print(f"    {name} d={x.shape[-1]}", flush=True)
        p, _ = cv_fit(cmat, x, y, folds, len(vocab), device)
        m = metrics(p, y)
        preds[name] = p
        table.append({"model": name, "d": int(x.shape[-1]), **m})

    by_name = {r["model"]: r for r in table}
    m0 = by_name["M0_commander"]["logloss"]
    full_ll = by_name["FULL_commander_plus_all"]["logloss"]
    full_delta = m0 - full_ll

    def pack(model_name, kind, group):
        rec = by_name[model_name]
        return {
            "group": group,
            "kind": kind,
            "model": model_name,
            "d": rec["d"],
            "logloss": rec["logloss"],
            "top1": rec["top1"],
            "deltaVsCommander": m0 - rec["logloss"],
            "heldOutDropVsFull": rec["logloss"] - full_ll if kind == "leave_one_group_out" else None,
            "eventDeltaVsCommander": event_delta(preds["M0_commander"], preds[model_name], y, tids),
            "eventDeltaVsFull": (
                event_delta(preds["FULL_commander_plus_all"], preds[model_name], y, tids)
                if kind == "leave_one_group_out"
                else None
            ),
        }

    additive = [
        pack("ADD_spellbook_architecture", "additive_from_commander", "spellbook_architecture"),
        pack("ADD_color_enabler", "additive_from_commander", "color_enabler"),
        pack("ADD_access_bundle", "additive_from_commander", "access_bundle"),
    ]
    additive.extend(pack(f"ADD_{name}", "additive_from_commander", name) for name in ACCESS_SPLITS)
    loo = [pack(f"LOO_{name}", "leave_one_group_out", name) for name in col_of]
    additive.sort(key=lambda r: -r["deltaVsCommander"])
    loo.sort(key=lambda r: -(r["heldOutDropVsFull"] or 0))

    report = {
        "artifactType": "IntrinsicStrengthAblationV1",
        "role": "HISTORICAL_EXPLORATORY_ONLY",
        "confirmatory": False,
        "question": "Which frozen intrinsic groups carry the commander-controlled +0.00519 lift?",
        "COS_FORMULA_FROZEN": False,
        "notMatchupGeometry": True,
        "SPELLBOOK_REPRESENTATION_CHANGED": False,
        "CMMG_SEALED_OUTCOMES_OPENED": False,
        "PROFESSOR_CHANGED": False,
        "nPods": n,
        "nEvents": len(set(tids)),
        "commanderLogloss": m0,
        "fullLogloss": full_ll,
        "fullDeltaVsCommander": full_delta,
        "models": [
            {**r, "deltaVsCommander": m0 - r["logloss"], "heldOutDropVsFull": r["logloss"] - full_ll}
            for r in table
        ],
        "additiveFromCommander": additive,
        "leaveOneGroupOut": loo,
        "interpretationRule": {
            "additive": "commander + this group only; isolation credit, can be borrowed from correlated groups",
            "leaveOneGroupOut": "unique held-out credit after the other frozen groups are present",
            "doNotUseCoefficients": True,
        },
        "elapsedSec": time.time() - t0,
    }
    write_json(OUT / "REPORT.json", report)
    write_json(
        OUT / "RESEARCH_STATUS.json",
        {
            "lineage": "INTRINSIC_STRENGTH_ABLATION_V1",
            "status": "HISTORICAL_EXPLORATORY_REPORTED",
            "COS_FORMULA_FROZEN": False,
            "CMMG_SEALED_OUTCOMES_OPENED": False,
            "PROFESSOR_CHANGED": False,
            "matchupMining": False,
        },
    )
    write_json(
        OUT / "PROTOCOL.json",
        {
            "baseline": "commander identity",
            "fullModel": "commander + frozen Spellbook architecture + color enabler + access splits",
            "folds": "SWA_V1_EVENT whole-event 5-fold",
            "seed": 20260821,
            "opponentFeatures": False,
            "groups": {**{"spellbook_architecture": list(FEATURE_NAMES), "color_enabler": list(COLOR_KEYS)}, **ACCESS_SPLITS},
            "architectureSlices": ARCH_SLICES,
        },
    )
    print(
        json.dumps(
            {
                "fullDeltaVsCommander": full_delta,
                "additive": [{k: r[k] for k in ("group", "deltaVsCommander")} for r in additive],
                "loo": [{k: r[k] for k in ("group", "heldOutDropVsFull")} for r in loo],
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Same-pod frozen predictions for qualified Seed-80 games.
Does not open outcomes. Does not build a global poset.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path

from build_deck_mechanical_profiles_v2 import profile_deck
from build_deck_pressure_v2 import (
    BLOCKED,
    CRED,
    DIAGNOSTICS,
    LIVE,
    PRIMARY,
    aggregation_stability,
    channels_of,
    interpret_u,
    net_sign_status,
    pack_hostile,
    pack_support,
)
from build_deck_pressure_v4 import CREDIBLE_TAIL
from build_hodge_diagnostic_v0 import ESTIMATORS, MATERIAL, NEAR_ZERO
from build_hodge_diagnostic_v1 import m_edge_stability
from build_k_v13_active_coverage import resolve_cards
from build_k_v14_active_coverage import axis_mass
from build_k_v15_precision_coverage import pair_index_eligible
from build_k_v2 import compute_pairs
from build_k_v22 import leftover_cells
from build_k_v23 import _eligible_leftover
from build_k_v25 import pair_h_both
from build_k_v27 import maturity_class
from mechanical_compatibility_v1 import compatibility
from mechanical_k_v2 import SPLIT_PARENTS, polarity_blocked_caps
from mechanical_pressure_channels_v1 import HOSTILE, SUPPORT, attach_channels
from outcome_firewall_v1 import OUTCOME_UNLOCKED, assert_outcomes_locked
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
K3 = MS / "mechanical-pressure-k-v3.0"
PROF2 = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
OUT = MS / "external-gameplay-validation-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_obj(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def compact_axes(axes: dict) -> dict:
    out = {}
    for kind, blob in axes.items():
        out[kind] = {}
        for cid, rec in blob.items():
            out[kind][cid] = {
                "presence": rec.get("presence"),
                "prominence": rec.get("prominence"),
                "packageInformedProminence": rec.get("packageInformedProminence", rec.get("prominence")),
                "commander_link": rec.get("commander_link"),
            }
    return out


def sign_of(x: float) -> int:
    if x > 1e-9:
        return 1
    if x < -1e-9:
        return -1
    return 0


def main() -> None:
    assert_outcomes_locked()
    if OUTCOME_UNLOCKED:
        raise SystemExit("OUTCOME_UNLOCKED must be false")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (K3, "K v3.0"), (MS / "deck-pressure-v4", "Pressure v4")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    if sha256_file(COMPAT_PY) != load_json(SCREEN / "IMMUTABLE.json")["sha256"]:
        raise SystemExit("compatibility-screen-v1 was edited")

    combined = load_json(OUT / "combined-qualified-set-v1.json")
    if combined.get("outcomesOpened") is not False or combined.get("outcomeUnlocked") is not False:
        raise SystemExit("combined set opened outcomes")
    if combined.get("gate") != "CUMULATIVE_PASS":
        raise SystemExit("cumulative gate failed; do not run predictions")
    games = combined.get("games") or []
    if len(games) < 40:
        raise SystemExit("gate failed; do not run predictions")
    seed_qual = load_json(OUT / "source-qualification-v1.json")
    x2_qual = load_json(OUT / "source-expansion-v2" / "source-qualification-v2.json")
    if seed_qual.get("gate") != "STOP_BELOW_40" or seed_qual.get("nQualified") != 17:
        raise SystemExit("seed80 freeze was mutated")
    if x2_qual.get("outcomesOpened") is not False:
        raise SystemExit("expansion qualification opened outcomes")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    import numpy as np

    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    rc8 = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]

    edges = load_json(K3 / "edges.json")
    edge_of = {(e["capability"], e["target"]): e for e in edges}
    leftover = leftover_cells(concept_ids, by_axis, edges)
    leftover_el = set(_eligible_leftover(leftover, by_axis))
    reviewed_live = {(e["capability"], e["target"]) for e in edges if e.get("kClass") in LIVE}
    cells = sorted(reviewed_live | leftover_el)
    compat = {cd: compatibility(cd[0], cd[1])["level"] for cd in cells}

    profiles = []
    k_ood = []
    pair_rows = []
    n_ood_pairs = 0

    for g in games:
        decks = []
        polarity = {}
        meta = {}
        for snap_meta in g["deckSnapshots"]:
            raw = load_json(OUT / snap_meta["snapshotPath"])
            cards, cmd_oids = resolve_cards(
                {
                    "mainboard": raw["mainboard"],
                    "commanderOracleIds": raw["commanderOracleIds"],
                },
                row_of,
                name_of,
                type_of,
            )
            axes, *_ = profile_deck(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, row_of, hierarchy=True)
            did = f"{g['externalGameId']}-{snap_meta['seatKey']}"
            polarity[did] = polarity_blocked_caps(axes)
            decks.append({"id": did, "axes": axes})
            meta[did] = snap_meta
            profiles.append(
                {
                    "deckId": did,
                    "externalGameId": g["externalGameId"],
                    "seatKey": snap_meta["seatKey"],
                    "snapshotSha256": snap_meta["snapshotSha256"],
                    "contentSha256": snap_meta["contentSha256"],
                    "commanderNames": snap_meta["commanderNames"],
                    "nResolvedCards": len(cards),
                    "axes": compact_axes(axes),
                }
            )
        pairs, _edges = compute_pairs(decks, [dict(e) for e in edges], leftover, by_axis, polarity)
        attach_channels(pairs)
        idx = pair_index_eligible(pairs, by_axis)
        h_rows = {(r["from"], r["to"]): r for r in pair_h_both(decks, leftover, idx, by_axis)}
        pair_of = {(p["from"], p["to"]): p for p in pairs}
        directed = {}
        for p in pairs:
            a, b = p["from"], p["to"]
            h = h_rows[(a, b)]
            prim = p["families"][PRIMARY]
            chs = {fam: channels_of(p["families"][fam]) for fam in (PRIMARY, *DIAGNOSTICS)}
            attacks = prim.get("attackTerms") or []
            enables = prim.get("enableTerms") or []
            hostile_t = [pack_hostile(t, edge_of.get((t["capability"], t["dependency"]))) for t in attacks if t.get("relation") in HOSTILE]
            cond_t = [pack_hostile(t, edge_of.get((t["capability"], t["dependency"]))) for t in attacks if t.get("relation") == "CONDITIONAL"]
            supp_t = [pack_support(t, edge_of.get((t["capability"], t.get("target") or t.get("dependency")))) for t in enables if t.get("relation") in SUPPORT]
            cm = {c: rec.get("packageInformedProminence", rec["prominence"]) for c, rec in next(d for d in decks if d["id"] == a)["axes"]["capability"].items()}
            dm = {t: rec["prominence"] for t, rec in next(d for d in decks if d["id"] == b)["axes"]["dependency"].items()}
            unknown_cred = 0.0
            ood_cells = []
            for c, d in leftover_el:
                m = cm.get(c, 0.0) * dm.get(d, 0.0)
                if m <= 0:
                    continue
                lvl = compat[(c, d)]
                if lvl in CRED:
                    unknown_cred += m
                    ood_cells.append({"capability": c, "dependency": d, "level": lvl, "mass": round(m, 4)})
            directed[(a, b)] = {
                "from": a,
                "to": b,
                "channels": chs[PRIMARY],
                "estimators": chs,
                "H_raw": h["H_raw"],
                "H_credible": h["H_credible"],
                "maturity": maturity_class(h["H_credible"]),
                "uncertainty": interpret_u(h["H_raw"], h["H_credible"]),
                "aggregation_stability": aggregation_stability(chs),
                "net_sign_status": net_sign_status(chs),
                "unknown_credible_mass": round(unknown_cred, 4),
                "externalKOodCells": ood_cells,
                "contributions": {"hostile": hostile_t, "supportive": supp_t, "conditional": cond_t},
                "largestUnresolvedCredible": h.get("largestCredible"),
            }
            if ood_cells:
                n_ood_pairs += 1
                k_ood.append({"externalGameId": g["externalGameId"], "from": a, "to": b, "nCells": len(ood_cells), "unknown_credible_mass": round(unknown_cred, 4)})

        ids = [d["id"] for d in decks]
        for a, b in combinations(ids, 2):
            pa, pb = directed[(a, b)], directed[(b, a)]
            mvals = {}
            for est in ESTIMATORS:
                mvals[est] = {
                    "M_hostile": round(pa["estimators"][est]["hostile_pressure"] - pb["estimators"][est]["hostile_pressure"], 4),
                    "M_supportive": round(pa["estimators"][est]["supportive_pressure"] - pb["estimators"][est]["supportive_pressure"], 4),
                    "M_net": round(pa["estimators"][est]["net_interaction"] - pb["estimators"][est]["net_interaction"], 4),
                }
            host_stab = m_edge_stability({est: mvals[est]["M_hostile"] for est in ESTIMATORS})
            mh = mvals["conservative"]["M_hostile"]
            material = abs(mh) >= MATERIAL
            if host_stab == "STABLE_DIRECTION":
                src, dst = (a, b) if mh > 0 else (b, a)
                direction = {"from": src, "to": dst, "channel": "M_hostile", "note": "Frozen same-pod residual. Not a ranking."}
                relation = "STABLE_DIRECTION"
            elif host_stab == "STABLE_NEAR_ZERO":
                direction = None
                relation = "NO_STABLE_DIRECTION"
            else:
                direction = None
                relation = "INCOMPARABLE_OR_SENSITIVE"
            pair_rows.append(
                {
                    "externalGameId": g["externalGameId"],
                    "a": a,
                    "b": b,
                    "snapshotSha256A": meta[a]["snapshotSha256"],
                    "snapshotSha256B": meta[b]["snapshotSha256"],
                    "contentSha256A": meta[a]["contentSha256"],
                    "contentSha256B": meta[b]["contentSha256"],
                    "directed": {"a_to_b": pa, "b_to_a": pb},
                    "M": mvals,
                    "hostileStability": host_stab,
                    "materialHostile": material,
                    "materialEpsilon": MATERIAL,
                    "nearZero": NEAR_ZERO,
                    "relation": relation,
                    "direction": direction,
                    "externalKOod": bool(pa["externalKOodCells"] or pb["externalKOodCells"]),
                    "outcomeOpened": False,
                }
            )

    pred = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "SAME_POD_PREDICTIONS_FROZEN",
        "outcomesOpened": False,
        "nGames": len(games),
        "nPairs": len(pair_rows),
        "pairs": pair_rows,
        "note": "Same-pod pairs only. No global poset. No outcomes.",
    }
    (OUT / "external-game-pair-predictions-v1.json").write_text(json.dumps(pred, indent=2) + "\n", encoding="utf-8")
    (OUT / "external-profiles-v2-v1.json").write_text(json.dumps({"n": len(profiles), "profiles": profiles, "outcomesOpened": False}, indent=2) + "\n", encoding="utf-8")
    kapp = {
        "nDirectedWithHighMedUnknown": n_ood_pairs,
        "nFlaggedPairs": len({(r["externalGameId"], r["from"], r["to"]) for r in k_ood}),
        "rows": k_ood,
        "note": "EXTERNAL_K_OOD. Do not adjudicate or modify K. Not silently mature.",
    }
    (OUT / "external-k-applicability-v1.json").write_text(json.dumps(kapp, indent=2) + "\n", encoding="utf-8")

    snap_shas = sorted(d["snapshotSha256"] for g in games for d in g["deckSnapshots"])
    freeze = {
        "artifactType": "ExternalGameplayPredictionFreeze",
        "version": "external-gameplay-validation-v1",
        "status": "FROZEN",
        "outcomesOpened": False,
        "transcriptsOpened": False,
        "nQualifiedGames": len(games),
        "nExactDeckSnapshots": len(snap_shas),
        "nSamePodPairs": len(pair_rows),
        "nExternalKOodDirected": n_ood_pairs,
        "checksums": {
            "sourceManifestSeed80": sha256_file(OUT / "source-manifest.seed80.json"),
            "sourceQualificationSeed80": sha256_file(OUT / "source-qualification-v1.json"),
            "sourceManifestExpansionV2": sha256_file(OUT / "source-expansion-v2" / "source-manifest.expansion-v2.seed60.json"),
            "sourceQualificationExpansionV2": sha256_file(OUT / "source-expansion-v2" / "source-qualification-v2.json"),
            "combinedQualifiedSet": sha256_file(OUT / "combined-qualified-set-v1.json"),
            "externalProfiles": sha256_file(OUT / "external-profiles-v2-v1.json"),
            "externalKApplicability": sha256_file(OUT / "external-k-applicability-v1.json"),
            "externalGamePairPredictions": sha256_file(OUT / "external-game-pair-predictions-v1.json"),
            "compatibilityScreen": load_json(SCREEN / "IMMUTABLE.json")["sha256"],
            "bge": LOCKED_CHECKSUM,
            "deckSnapshotsSortedConcat": sha256_obj(snap_shas),
        },
        "gitSha": "50789e02c667f2150ae70adc3ca92ec8f743942b",
        "frozenLineage": "Ontology v2.2 → Profiles v2 → K v3.0 → Pressure v4 conservative-v2 / stability",
        "note": "Predictions are now untouchable. Do not open outcomes.",
    }
    freeze["predictionFreezeSha256"] = sha256_obj(freeze)
    (OUT / "prediction-freeze-v1.json").write_text(json.dumps(freeze, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "ExternalGameplayValidation",
                "version": "external-gameplay-validation-v1",
                "status": "REPORT_AND_WAIT",
                "outcomesOpened": False,
                "transcriptsOpened": False,
                "nQualified": len(games),
                "nSamePodPairs": len(pair_rows),
                "nExternalKOodDirected": n_ood_pairs,
                "predictionFreezeSha256": freeze["predictionFreezeSha256"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "nQualified": len(games),
                "nPairs": len(pair_rows),
                "nOodDirected": n_ood_pairs,
                "freeze": freeze["predictionFreezeSha256"],
                "outcomesOpened": False,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

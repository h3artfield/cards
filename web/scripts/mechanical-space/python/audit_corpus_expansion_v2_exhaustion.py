#!/usr/bin/env python3
"""
Expansion v2 selection exhaustion audit.

Replays the frozen protocol. Does not reselect. Does not write a new cohort.
No K, Pressure, Hodge, or ontology edits.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import Counter
from pathlib import Path

import numpy as np

from build_corpus_expansion_v1 import (
    coverage_gain,
    eligible_axis_ids,
    jaccard,
    kmeans,
    lite_axes,
    l2norm,
    percentile_ranks,
    vector_of,
)
from build_corpus_expansion_v2 import collect_remaining, oids_of_source
from build_k_v13_active_coverage import resolve_cards
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
CEX1 = MS / "corpus-expansion-v1"
CEX2 = MS / "corpus-expansion-v2"
PROF_EXP = MS / "expansion-profiles-v2"
PROF2 = MS / "deck-mechanical-profiles-v2"
SCREEN = MS / "compatibility-screen-v1"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"
OUT = CEX2 / "exhaustion-audit"


def reject_reason(i, selected_idx, cand, sealed_oids, C, min_cos, max_jac) -> str:
    if any(jaccard(cand[i]["oids"], o) > max_jac for o in sealed_oids):
        return "JACCARD_VS_SEALED_30"
    if any(jaccard(cand[i]["oids"], cand[j]["oids"]) > max_jac for j in selected_idx):
        return "JACCARD_VS_EXPANSION_V2"
    if selected_idx:
        sims = C[selected_idx] @ l2norm(cand[i]["vec"])
        if float(sims.max()) > (1.0 - min_cos):
            return "COSINE_VS_EXPANSION_V2"
    return "ELIGIBLE"


def main() -> None:
    proto = load_json(CEX2 / "selection-protocol.json")
    if proto.get("status") != "FROZEN":
        raise SystemExit("protocol must stay frozen")
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (PROF_EXP, "Expansion Profiles v2"), (CEX1, "Corpus Expansion v1")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    n_exp = int(proto["selection"]["nExpansion"])
    k = int(proto["stratification"]["k"])
    seed = int(proto["stratification"]["seed"])
    min_cos = float(proto["selection"]["minCosineDistanceAmongExpansionV2"])
    max_jac = float(proto["selection"]["cardJaccardMaxVsSelected"])
    early_stop = bool(proto["selection"].get("doNotEarlyStopOnSmallGain"))
    held = load_json(CEX2 / "selected-expansion.json")

    drep = load_json(DIR / "report.json")
    concept_ids = load_json(DIR / "concept-ids.json")
    by_axis = {r["id"]: r for r in drep["perConcept"]}
    scores = np.fromfile(DIR / "scores.f32", dtype=np.float32).reshape(-1, len(concept_ids))
    p90 = np.percentile(scores, 90, axis=0)
    p99 = np.percentile(scores, 99, axis=0)
    ranks = percentile_ranks(scores)
    rc8_idx = [json.loads(l) for l in (RC8 / "index.jsonl").read_text(encoding="utf-8").splitlines() if l]
    row_of, type_of, name_of = {}, {}, {}
    for r in rc8_idx:
        row_of[r["oracleId"]] = int(r["i"])
        type_of[r["oracleId"]] = r.get("typeLine") or ""
        name_of[r["oracleId"]] = r.get("name") or r["oracleId"]
    axis_ids = eligible_axis_ids(concept_ids, by_axis)

    from build_corpus_expansion_v1 import commander_key

    sealed_key = load_json(CEX1 / "sealed-key.json")["key"]
    sealed_sources = load_json(CEX1 / "source-decks.json")
    official = {p["blindId"]: p for p in load_json(PROF_EXP / "profiles.json")}
    exclude_keys = {commander_key(row["commanders"]) for row in sealed_key}
    exclude_names = {n for key in exclude_keys for n in key}

    pool, frame = collect_remaining(exclude_keys, exclude_names)
    sealed_official = [vec_from_official(official[row["blindId"]], axis_ids) for row in sealed_key]
    sealed_oids = [oids_of_source(raw) for raw in sealed_sources]
    print("profiling sealed 30 with the same lite_axes used for candidates…", flush=True)
    sealed_full = []
    for raw in sealed_sources:
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, _pkgs = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        sealed_full.append(vector_of(axes, axis_ids))

    cand = []
    skipped_short = 0
    for raw in pool:
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        if len(cards) < 70:
            skipped_short += 1
            continue
        axes, pkgs = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        cand.append({"raw": raw, "vec": vector_of(axes, axis_ids), "oids": {c["oracleId"] for c in cards}})

    vecs = np.stack([c["vec"] for c in cand])
    artifact = {
        "nEligibleLists": frame["nEligibleLists"],
        "nIdentitiesInEligibleLists": frame["nIdentitiesInEligibleLists"],
        "nExcludedSealed30Overlap": frame["nExcludedSealed30Overlap"],
        "nEligibleNewIdentities": frame["nEligibleNewIdentities"],
        "nProfiled": len(cand),
        "nSkippedShortResolve": skipped_short,
        "uniqueIdentityKeys": len({c["raw"]["identity_key"] for c in cand}),
        "nNanVectors": int(np.isnan(vecs).any(axis=1).sum()),
        "nInfVectors": int(np.isinf(vecs).any(axis=1).sum()),
        "nZeroVectors": int((np.linalg.norm(vecs, axis=1) < 1e-12).sum()),
        "nNearZeroVectors": int((np.linalg.norm(vecs, axis=1) < 1e-6).sum()),
        "vecDim": int(vecs.shape[1]),
        "noPagination": True,
        "loopCapInCode": n_exp,
        "heldN": len(held),
        "v1EligibleAfterAnchorOnly": 1286,
        "expectedAfterSealed30": 1314 - frame["nExcludedSealed30Overlap"],
    }
    artifact["identityUniverseArithmetic"] = {
        "v1": "1314 unique → exclude 28 anchor-overlap → 1286",
        "v2": f"1314 unique → exclude {frame['nExcludedSealed30Overlap']} sealed-30-overlap → {frame['nEligibleNewIdentities']}",
        "matchesProfiled": frame["nEligibleNewIdentities"] == len(cand) and skipped_short == 0,
    }

    def replay(sealed_source_vecs):
        loc_max = np.max(np.stack(sealed_source_vecs), axis=0)
        loc_S = np.stack([l2norm(v) for v in sealed_source_vecs])
        loc_lab = kmeans(np.vstack([loc_S, C]), k, seed)
        loc_cand_lab = loc_lab[len(loc_S) :]
        loc_repr = set(int(x) for x in loc_lab[: len(loc_S)])
        loc_sel: list[int] = []
        loc_steps = []

        def loc_can(i):
            return reject_reason(i, loc_sel, cand, sealed_oids, C, min_cos, max_jac) == "ELIGIBLE"

        def loc_pick(indices):
            best_i, best_g = None, -1.0
            for i in indices:
                if i in loc_sel or not loc_can(i):
                    continue
                g = coverage_gain(cand[i]["vec"], loc_max)
                if g > best_g:
                    best_i, best_g = i, g
            return best_i, best_g

        for region in range(k):
            if region in loc_repr:
                continue
            i, g = loc_pick([j for j, lab in enumerate(loc_cand_lab) if int(lab) == region])
            if i is None:
                continue
            loc_sel.append(i)
            loc_steps.append({"step": len(loc_sel), "phase": "A", "gain": round(g, 4)})
            loc_max = np.maximum(loc_max, cand[i]["vec"])
        loc_stop = None
        while len(loc_sel) < n_exp:
            rem = [j for j in range(len(cand)) if j not in loc_sel]
            i, g = loc_pick(rem)
            if i is None:
                loc_stop = "no_can_take"
                break
            loc_sel.append(i)
            loc_steps.append({"step": len(loc_sel), "phase": "B", "gain": round(g, 4)})
            loc_max = np.maximum(loc_max, cand[i]["vec"])
        return loc_sel, loc_steps, loc_stop, loc_max, loc_cand_lab, loc_lab[: len(loc_S)]

    S = np.stack([l2norm(v) for v in sealed_official])
    C = np.stack([l2norm(c["vec"]) for c in cand])
    labels = kmeans(np.vstack([S, C]), k, seed)
    sealed_lab = labels[: len(S)]
    cand_lab = labels[len(S) :]
    represented = set(int(x) for x in sealed_lab)
    corpus_max = np.max(np.stack(sealed_official), axis=0)
    selected_idx: list[int] = []
    steps = []

    def can_take(i: int) -> bool:
        return reject_reason(i, selected_idx, cand, sealed_oids, C, min_cos, max_jac) == "ELIGIBLE"

    def pick_from(indices):
        best_i, best_g = None, -1.0
        for i in indices:
            if i in selected_idx or not can_take(i):
                continue
            g = coverage_gain(cand[i]["vec"], corpus_max)
            if g > best_g:
                best_i, best_g = i, g
        return best_i, best_g

    for region in range(k):
        if region in represented:
            continue
        i, g = pick_from([j for j, lab in enumerate(cand_lab) if int(lab) == region])
        if i is None:
            continue
        selected_idx.append(i)
        steps.append({"step": len(selected_idx), "phase": "A", "gain": round(g, 4), "region": region, "nRemainingAfter": len(cand) - len(selected_idx)})
        corpus_max = np.maximum(corpus_max, cand[i]["vec"])

    stop_reason = None
    while len(selected_idx) < n_exp:
        remaining = [j for j in range(len(cand)) if j not in selected_idx]
        reasons = Counter(reject_reason(j, selected_idx, cand, sealed_oids, C, min_cos, max_jac) for j in remaining)
        gains_all = [coverage_gain(cand[j]["vec"], corpus_max) for j in remaining]
        i, g = pick_from(remaining)
        if i is None:
            stop_reason = {
                "rule": "while len(selected) < nExpansion: pick_from(all); break if no candidate satisfies can_take",
                "can_take": "Jaccard <= 0.7 vs sealed 30 and vs already-selected Expansion-v2, and cosine distance >= 0.12 among Expansion-v2",
                "didNotUse": "stopIfMaxGainBelow / gain threshold (doNotEarlyStopOnSmallGain=true)",
                "nExpansionTarget": n_exp,
                "nSelected": len(selected_idx),
                "nRemaining": len(remaining),
                "rejectCounts": dict(reasons),
                "bestGainAmongRemainingIncludingIneligible": round(float(max(gains_all)), 6) if gains_all else None,
                "nRemainingWithPositiveGain": int(sum(1 for x in gains_all if x > 1e-12)),
            }
            break
        selected_idx.append(i)
        steps.append(
            {
                "step": len(selected_idx),
                "phase": "B",
                "gain": round(g, 4),
                "region": int(cand_lab[i]),
                "nRemainingAfter": len(cand) - len(selected_idx),
                "rejectCountsAmongUnselected": dict(reasons),
            }
        )
        corpus_max = np.maximum(corpus_max, cand[i]["vec"])

    if stop_reason is None and len(selected_idx) == n_exp:
        stop_reason = {"rule": "hit nExpansion target", "nSelected": n_exp}

    replay_ids = [cand[i]["raw"]["deckInstanceId"] for i in selected_idx]
    held_ids = [r["deckInstanceId"] for r in held]
    replay_matches_held = replay_ids == held_ids

    remaining = [j for j in range(len(cand)) if j not in selected_idx]
    reasons = Counter(reject_reason(j, selected_idx, cand, sealed_oids, C, min_cos, max_jac) for j in remaining)
    gains_rem = np.array([coverage_gain(cand[j]["vec"], corpus_max) for j in remaining], dtype=float)
    best_unsel = int(remaining[int(np.argmax(gains_rem))]) if len(remaining) else None
    novelty = []
    if best_unsel is not None:
        vn = l2norm(cand[best_unsel]["vec"])
        sealed50 = np.vstack([S, C[selected_idx]])
        novelty.append(
            {
                "kind": "bestRemainingCoverageGain",
                "gain": round(float(gains_rem.max()), 6),
                "rejectReason": reject_reason(best_unsel, selected_idx, cand, sealed_oids, C, min_cos, max_jac),
                "minCosineDistanceToSealed50": round(1.0 - float((sealed50 @ vn).max()), 4),
                "region": int(cand_lab[best_unsel]),
            }
        )
        # nearest remaining that fails only cosine
        cosine_only = [j for j in remaining if reject_reason(j, selected_idx, cand, sealed_oids, C, min_cos, max_jac) == "COSINE_VS_EXPANSION_V2"]
        if cosine_only:
            gcos = [coverage_gain(cand[j]["vec"], corpus_max) for j in cosine_only]
            j = cosine_only[int(np.argmax(gcos))]
            vn = l2norm(cand[j]["vec"])
            novelty.append(
                {
                    "kind": "bestCosineBlocked",
                    "gain": round(float(max(gcos)), 6),
                    "minCosineDistanceToSealed50": round(1.0 - float((sealed50 @ vn).max()), 4),
                    "maxSimilarityToExpansionV2": round(float((C[selected_idx] @ vn).max()), 4),
                    "cosineThresholdSimilarity": round(1.0 - min_cos, 4),
                }
            )

    region_remaining = Counter(int(cand_lab[j]) for j in remaining)
    region_all = Counter(int(x) for x in cand_lab)
    region_sealed = Counter(int(x) for x in sealed_lab)

    off = np.stack(sealed_official)
    full = np.stack(sealed_full)
    official_nz = (off > 1e-9).sum(axis=1)
    full_nz = (full > 1e-9).sum(axis=1)
    cand_nz = (vecs > 1e-9).sum(axis=1)
    coordinate = {
        "whatSelectionUsed": "expansion-profiles-v2/profiles.json story axes only (top 8/6/4)",
        "whatCandidatesUsed": "lite_axes full eligible packageInformedProminence (same as Expansion v1)",
        "meanNonzeroSealedOfficial": round(float(official_nz.mean()), 2),
        "meanNonzeroSealedFullLiteAxes": round(float(full_nz.mean()), 2),
        "meanNonzeroCandidates": round(float(cand_nz.mean()), 2),
        "meanAbsOfficialVsFull": round(float(np.abs(off - full).mean()), 4),
        "asymmetric": bool(official_nz.mean() + 10 < cand_nz.mean()),
        "note": "Expansion v1 built anchor corpus_max from full lite_axes. v2 substituted truncated published profiles. That is a coordinate artifact.",
    }
    print("counterfactual replay with full sealed-30 lite_axes…", flush=True)
    cf_sel, cf_steps, cf_stop, _cf_max, _cf_clab, _cf_slab = replay(sealed_full)
    counterfactual = {
        "wroteNewCohort": False,
        "nSelected": len(cf_sel),
        "stop": cf_stop,
        "perPickGain": [s["gain"] for s in cf_steps],
        "sameOrderAsHeld": [cand[i]["raw"]["deckInstanceId"] for i in cf_sel] == held_ids,
        "nSharedWithHeld": len(set(cand[i]["raw"]["deckInstanceId"] for i in cf_sel) & set(held_ids)),
    }

    qa = {
        "allCandidatesProfiled": skipped_short == 0 and len(cand) == frame["nEligibleNewIdentities"],
        "noTruncationVsV1Universe": frame["nIdentitiesInEligibleLists"] == 1314 and frame["nEligibleLists"] == 79197,
        "exclusionIsSealed30NotArtificialShrink": frame["nEligibleNewIdentities"] == 1314 - frame["nExcludedSealed30Overlap"],
        "uniqueIdentityDedup": artifact["uniqueIdentityKeys"] == len(cand),
        "noNanOrZeroVectors": artifact["nNanVectors"] == 0 and artifact["nInfVectors"] == 0 and artifact["nZeroVectors"] == 0,
        "noHiddenCapAt20": n_exp == 30 and len(selected_idx) != 30,
        "replayMatchesHeldDraft": replay_matches_held,
        "doNotEarlyStopOnSmallGainHonored": early_stop and any(s["gain"] == 0.0 for s in steps),
        "sealed30VectorsSameFormulaAsCandidates": not coordinate["asymmetric"],
    }
    qa["pass"] = all(qa.values())

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "EXHAUSTION_AUDIT",
        "reselection": False,
        "predeclaredStoppingRule": {
            "source": "corpus-expansion-v2/selection-protocol.json",
            "nExpansion": 30,
            "doNotEarlyStopOnSmallGain": True,
            "minCosineDistanceAmongExpansionV2": min_cos,
            "cardJaccardMaxVsSelected": max_jac,
            "minCosineDistanceVsSealed30": False,
            "loop": "select while n < 30 and some candidate satisfies Jaccard/cosine can_take; else break",
            "notAGainThreshold": "v1 stopIfMaxGainBelow was intentionally not used",
        },
        "stopReason": stop_reason,
        "nSelected": len(selected_idx),
        "perPickGain": [s["gain"] for s in steps],
        "steps": steps,
        "after20": {
            "nRemaining": len(remaining),
            "rejectCounts": dict(reasons),
            "gainDistribution": {
                "min": round(float(gains_rem.min()), 6) if len(gains_rem) else None,
                "p50": round(float(np.median(gains_rem)), 6) if len(gains_rem) else None,
                "p90": round(float(np.quantile(gains_rem, 0.90)), 6) if len(gains_rem) else None,
                "p99": round(float(np.quantile(gains_rem, 0.99)), 6) if len(gains_rem) else None,
                "max": round(float(gains_rem.max()), 6) if len(gains_rem) else None,
                "mean": round(float(gains_rem.mean()), 6) if len(gains_rem) else None,
                "nPositive": int(np.sum(gains_rem > 1e-12)),
                "nZero": int(np.sum(gains_rem <= 1e-12)),
            },
            "noveltyBestUnselected": novelty,
        },
        "regions": {
            "k": k,
            "seed": seed,
            "sealed30": dict(sorted(region_sealed.items())),
            "allRemainingCandidates": dict(sorted(region_all.items())),
            "unselectedAfterStop": dict(sorted(region_remaining.items())),
            "dominantRegionShareOfRemaining": round(max(region_remaining.values()) / len(remaining), 4) if remaining else None,
            "note": "k-means on sealed 30 + remaining. Sealed-30 extrema occupy other centroids; leftover identities collapse to one region.",
        },
        "artifactChecks": artifact,
        "coordinateAsymmetry": coordinate,
        "counterfactualFullSealed30Vectors": counterfactual,
        "qa": qa,
        "interpretation": {
            "coverageExhaustedAfter": next((s["step"] for s in steps if s["gain"] == 0.0), None),
            "stopWasDiversityConstraintNotQuota": stop_reason is not None and stop_reason.get("nSelected") != 30,
            "doNotSealIfCoordinateArtifact": coordinate["asymmetric"],
            "A_vs_B": "If coordinates match, audit still cannot distinguish real mechanical saturation from Profiles-v2 representation saturation. Do not retrain the ontology.",
        },
        "safety": {"reselection": False, "k": False, "pressure": False, "hodge": False, "ontologyRetrain": False},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "SelectionExhaustionAudit",
                "version": "corpus-expansion-v2-exhaustion-audit",
                "status": "PASS" if qa["pass"] else "FAIL",
                "reselection": False,
                "nSelectedReplay": len(selected_idx),
                "replayMatchesHeldDraft": replay_matches_held,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "qa": qa,
                "nSelected": len(selected_idx),
                "stopReason": stop_reason,
                "perPickGain": [s["gain"] for s in steps],
                "after20gain": report["after20"]["gainDistribution"],
                "after20reject": dict(reasons),
                "regionsUnselected": dict(region_remaining),
                "novelty": novelty,
                "coordinate": coordinate,
                "counterfactual": counterfactual,
                "artifact": {k: artifact[k] for k in artifact if k != "identityUniverseArithmetic"},
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

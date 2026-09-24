#!/usr/bin/env python3
"""
Corpus Expansion v2 — Phase 1 only.

Select and seal 30 additional commander identities by incremental
Profiles-v2 coverage versus the already-sealed 30.

Does not read K, Pressure, M, Hodge, s, or desired counters.
Does not add K. Does not construct Pressure v4. Does not run Hodge v2.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import numpy as np

from build_corpus_expansion_v1 import (
    commander_key,
    coverage_gain,
    eligible_axis_ids,
    identity_key,
    jaccard,
    kmeans,
    lite_axes,
    l2norm,
    pack_source,
    percentile_ranks,
    vector_of,
)
from build_k_v13_active_coverage import resolve_cards
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
DIR = MS / "mechanical-directions-v22"
RC8 = MS / "semantic-oracle-snapshot-v1"
CEX1 = MS / "corpus-expansion-v1"
PROF_EXP = MS / "expansion-profiles-v2"
PROF2 = MS / "deck-mechanical-profiles-v2"
H1 = MS / "hodge-diagnostic-v1"
SCREEN = MS / "compatibility-screen-v1"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
OUT = MS / "corpus-expansion-v2"
COMPAT_PY = Path(__file__).resolve().parent / "mechanical_compatibility_v1.py"
EXPECTED_DIM = 76


def assert_representation_parity(axis_ids: list[str], sealed_vecs: list[np.ndarray], cand_vecs: list[np.ndarray]) -> dict:
    if len(axis_ids) != EXPECTED_DIM:
        raise SystemExit(f"eligible dim {len(axis_ids)} != {EXPECTED_DIM}")
    if len(axis_ids) != len(set(axis_ids)):
        raise SystemExit("duplicate eligible coordinates")
    for label, vecs in (("sealed30", sealed_vecs), ("candidates", cand_vecs)):
        if not vecs:
            raise SystemExit(f"{label} has no vectors")
        for i, v in enumerate(vecs):
            if v.shape != (EXPECTED_DIM,):
                raise SystemExit(f"{label}[{i}] shape {v.shape} != ({EXPECTED_DIM},)")
            if np.isnan(v).any() or np.isinf(v).any():
                raise SystemExit(f"{label}[{i}] has NaN/Inf")
            if float(np.linalg.norm(v)) < 1e-12:
                raise SystemExit(f"{label}[{i}] is a zero vector")
    nz_s = np.array([(v > 1e-9).sum() for v in sealed_vecs], dtype=float)
    nz_c = np.array([(v > 1e-9).sum() for v in cand_vecs], dtype=float)
    if float(nz_s.mean()) + 20 < float(nz_c.mean()):
        raise SystemExit(f"sealed-30 still sparse ({nz_s.mean():.1f} nonzero) vs candidates ({nz_c.mean():.1f})")
    return {
        "pass": True,
        "dim": EXPECTED_DIM,
        "coordinateNames": axis_ids,
        "nSealed": len(sealed_vecs),
        "nCandidates": len(cand_vecs),
        "meanNonzeroSealed30": round(float(nz_s.mean()), 2),
        "meanNonzeroCandidates": round(float(nz_c.mean()), 2),
        "eligibility": "eligible_axis_ids",
        "statistic": "packageInformedProminence via lite_axes / vector_of",
        "clusteringNormalization": "L2",
        "coverageOn": "unnormalized packageInformedProminence",
    }


def oids_of_source(raw: dict) -> set[str]:
    return {x["oracleId"] for x in (raw.get("mainboard") or []) if x.get("oracleId")}


def collect_remaining(exclude_keys: set[tuple[str, ...]], exclude_names: set[str]) -> tuple[list[dict], dict]:
    best: dict[tuple[str, ...], dict] = {}
    n_eligible_lists = 0
    n_identities_all = 0
    excluded_ids: set[tuple[str, ...]] = set()
    seen_all: set[tuple[str, ...]] = set()
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for d in data:
            if d.get("commanderResolutionStatus") != "resolved":
                continue
            mb = d.get("mainboard") or []
            if len(mb) < 80:
                continue
            resolved = [x for x in mb if x.get("oracleId")]
            if len(resolved) < 70:
                continue
            n_eligible_lists += 1
            cmds = d.get("commanders") or []
            names = [c.get("canonicalOracleName") or c.get("sourceName") or "" for c in cmds]
            key = commander_key(names)
            if not key:
                continue
            if key not in seen_all:
                seen_all.add(key)
                n_identities_all += 1
            if key in exclude_keys or any(n in exclude_names for n in key):
                excluded_ids.add(key)
                continue
            rec = {
                "key": key,
                "identity_key": "|".join(key),
                "commanders": names,
                "commanderOracleIds": [c.get("oracleId") for c in cmds if c.get("oracleId")],
                "component_commander_ids": [c.get("oracleId") for c in cmds if c.get("oracleId")],
                "mainboard": [
                    {
                        "oracleId": x["oracleId"],
                        "name": x.get("canonicalOracleName") or x.get("sourceName"),
                        "quantity": int(x.get("quantity") or 1),
                    }
                    for x in resolved
                ],
                "sourceFile": str(path.relative_to(TOPDECK)).replace("\\", "/"),
                "deckInstanceId": str(d.get("deckInstanceId") or ""),
                "nMainboard": len(mb),
            }
            prev = best.get(key)
            dist = abs(rec["nMainboard"] - 99)
            if prev is None or dist < prev["_dist"] or (dist == prev["_dist"] and rec["deckInstanceId"] < prev["deckInstanceId"]):
                rec["_dist"] = dist
                best[key] = rec
        del data
    out = list(best.values())
    for r in out:
        r.pop("_dist", None)
    out.sort(key=lambda r: (r["key"], r["deckInstanceId"]))
    frame = {
        "nEligibleLists": n_eligible_lists,
        "nIdentitiesInEligibleLists": n_identities_all,
        "nExcludedSealed30Overlap": len(excluded_ids),
        "nEligibleNewIdentities": len(out),
    }
    return out, frame


def main() -> None:
    proto = load_json(OUT / "selection-protocol-v2.json")
    if proto.get("status") != "FROZEN" or not proto.get("frozenBeforeSelection"):
        raise SystemExit("selection protocol v2 must be frozen before selection")
    addendum = load_json(OUT / "representation-parity-addendum.json")
    if addendum.get("status") != "FROZEN" or not addendum.get("frozenBeforeRetry"):
        raise SystemExit("representation-parity addendum must be frozen")
    cal = load_json(OUT / "packing-calibration.json")
    if cal.get("status") != "FROZEN":
        raise SystemExit("packing-calibration.json must be frozen before Attempt 3")
    if cal.get("candidatesInspected") or cal.get("quotaUsed"):
        raise SystemExit("packing calibration must not have used candidates or the quota")
    OUT.mkdir(parents=True, exist_ok=True)
    assert_frozen_bge(load_json(NEU / "manifest.json"))
    if load_json(NEU / "manifest.json").get("checksum") != LOCKED_CHECKSUM:
        raise SystemExit("BGE checksum mismatch")
    for path, label in ((PROF2, "Profiles v2"), (PROF_EXP, "Expansion Profiles v2"), (CEX1, "Corpus Expansion v1"), (H1, "Hodge v1")):
        if load_json(path / "IMMUTABLE.json").get("status") != "FROZEN":
            raise SystemExit(f"{label} must be frozen")
    frozen_hash = load_json(SCREEN / "IMMUTABLE.json")["sha256"]
    if hashlib.sha256(COMPAT_PY.read_bytes()).hexdigest() != frozen_hash:
        raise SystemExit("compatibility-screen-v1 was edited")

    n_exp = int(proto["selection"]["nExpansion"])
    k = int(proto["stratification"]["k"])
    seed = int(proto["stratification"]["seed"])
    min_cos = float(cal["realizedMinCosineAmongExpansionV2"])
    max_jac = float(proto["selection"]["cardJaccardMaxVsSelected"])
    print(f"Attempt 3 packing: min_cos={min_cos} (calibrated; Jaccard={max_jac})", flush=True)

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

    sealed_key = load_json(CEX1 / "sealed-key.json")["key"]
    sealed_sources = load_json(CEX1 / "source-decks.json")
    exclude_keys = {commander_key(row["commanders"]) for row in sealed_key}
    exclude_names = {n for key in exclude_keys for n in key}

    print("collecting remaining identities…", flush=True)
    pool, frame_counts = collect_remaining(exclude_keys, exclude_names)

    print("profiling sealed 30 with full lite_axes…", flush=True)
    sealed_vecs = []
    sealed_oids = []
    for raw in sealed_sources:
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        axes, _pkgs = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        sealed_vecs.append(vector_of(axes, axis_ids))
        sealed_oids.append(oids_of_source(raw))

    print(f"profiling {len(pool)} remaining identities…", flush=True)
    cand = []
    for i, raw in enumerate(pool):
        cards, cmd_oids = resolve_cards(raw, row_of, name_of, type_of)
        if len(cards) < 70:
            continue
        axes, pkgs = lite_axes(cards, cmd_oids, concept_ids, by_axis, scores, p90, p99, ranks, row_of)
        cand.append(
            {
                "raw": raw,
                "vec": vector_of(axes, axis_ids),
                "oids": {c["oracleId"] for c in cards},
                "nCards": len(cards),
                "activePackages": [p["id"] for p in pkgs if p.get("active")],
                "topCaps": [{"id": r["id"], "prominence": r["prominence"]} for r in sorted(axes["capability"].values(), key=lambda x: -x["prominence"])[:6]],
                "topDeps": [{"id": r["id"], "prominence": r["prominence"]} for r in sorted(axes["dependency"].values(), key=lambda x: -x["prominence"])[:6]],
            }
        )
        if (i + 1) % 200 == 0:
            print(f"  {i + 1}/{len(pool)}", flush=True)

    parity = assert_representation_parity(axis_ids, sealed_vecs, [c["vec"] for c in cand])
    (OUT / "representation-parity.json").write_text(json.dumps(parity, indent=2) + "\n", encoding="utf-8")
    print(f"representation parity PASS  dim={parity['dim']}  sealedNZ={parity['meanNonzeroSealed30']}  candNZ={parity['meanNonzeroCandidates']}", flush=True)

    S = np.stack([l2norm(v) for v in sealed_vecs])
    C = np.stack([l2norm(c["vec"]) for c in cand])
    labels = kmeans(np.vstack([S, C]), k, seed)
    sealed_lab = labels[: len(S)]
    cand_lab = labels[len(S) :]
    represented = set(int(x) for x in sealed_lab)
    corpus_max = np.max(np.stack(sealed_vecs), axis=0)
    baseline_max = corpus_max.copy()
    selected_idx: list[int] = []
    picks: list[dict] = []

    def can_take(i: int) -> bool:
        if any(jaccard(cand[i]["oids"], o) > max_jac for o in sealed_oids):
            return False
        if any(jaccard(cand[i]["oids"], cand[j]["oids"]) > max_jac for j in selected_idx):
            return False
        if selected_idx:
            sims = C[selected_idx] @ l2norm(cand[i]["vec"])
            if float(sims.max()) > (1.0 - min_cos):
                return False
        return True

    def pick_from(indices: list[int]) -> tuple[int | None, float]:
        best_i, best_g = None, -1.0
        for i in indices:
            if i in selected_idx or not can_take(i):
                continue
            g = coverage_gain(cand[i]["vec"], corpus_max)
            if g > best_g:
                best_i, best_g = i, g
        return best_i, best_g

    phase_a = []
    for region in range(k):
        if region in represented:
            continue
        members = [i for i, lab in enumerate(cand_lab) if int(lab) == region]
        i, g = pick_from(members)
        if i is None:
            continue
        selected_idx.append(i)
        represented.add(region)
        picks.append({"phase": "A", "region": region, "gain": round(g, 4)})
        corpus_max = np.maximum(corpus_max, cand[i]["vec"])
        phase_a.append({"index": i, "region": region, "gain": round(g, 4)})

    stop = None
    while len(selected_idx) < n_exp:
        i, g = pick_from(list(range(len(cand))))
        if i is None:
            rem = [j for j in range(len(cand)) if j not in selected_idx]
            grems = [coverage_gain(cand[j]["vec"], corpus_max) for j in rem]
            n_pos = int(sum(1 for x in grems if x > 1e-12))
            best = max(grems) if grems else 0.0
            stop = {
                "stop_reason": "PACKING_EXHAUSTED" if n_pos else "COVERAGE_EXHAUSTED",
                "nSelected": len(selected_idx),
                "nRemaining": len(rem),
                "positive_gain_remaining": n_pos,
                "best_gain_remaining": round(float(best), 6),
                "representation_saturation": n_pos == 0,
            }
            break
        selected_idx.append(i)
        picks.append({"phase": "B", "region": int(cand_lab[i]), "gain": round(g, 4)})
        corpus_max = np.maximum(corpus_max, cand[i]["vec"])
    if stop is None and len(selected_idx) == n_exp:
        stop = {"stop_reason": "TARGET_REACHED", "nSelected": n_exp, "representation_saturation": False}

    sealed = []
    sources = []
    blind = []
    selected = []
    for t, i in enumerate(selected_idx):
        raw = cand[i]["raw"]
        bid = f"D{31 + t:02d}"
        wanted = raw["commanders"][0]
        sealed.append(
            {
                "blindId": bid,
                "cohort": "expansion_v2",
                "commanders": raw["commanders"],
                "wantedCommander": wanted,
                "identity_key": identity_key(raw["commanders"]),
                "component_commander_ids": list(raw.get("commanderOracleIds") or []),
                "region": int(cand_lab[i]),
            }
        )
        sources.append(pack_source(raw, wanted))
        selected.append(
            {
                "blindId": bid,
                "commanders": raw["commanders"],
                "region": int(cand_lab[i]),
                "nCards": cand[i]["nCards"],
                "nMainboard": raw["nMainboard"],
                "activePackages": cand[i]["activePackages"],
                "coverageGainAtPick": picks[t]["gain"],
                "phase": picks[t]["phase"],
                "deckInstanceId": raw["deckInstanceId"],
                "sourceFile": raw["sourceFile"],
            }
        )
        blind.append(
            {
                "blindId": bid,
                "cohort": "expansion_v2",
                "region": int(cand_lab[i]),
                "nCards": cand[i]["nCards"],
                "nMainboard": raw["nMainboard"],
                "phase": picks[t]["phase"],
                "coverageGainAtPick": picks[t]["gain"],
                "topCapabilities": cand[i]["topCaps"],
                "topDependencies": cand[i]["topDeps"],
                "activePackages": cand[i]["activePackages"],
            }
        )

    region_counts = {int(r): int(sum(1 for x in cand_lab if int(x) == r)) for r in range(k)}
    sealed_regions = {int(r): int(sum(1 for x in sealed_lab if int(x) == r)) for r in range(k)}
    selected_regions = {int(r): int(sum(1 for i in selected_idx if int(cand_lab[i]) == r)) for r in range(k)}
    gain_vs_30 = coverage_gain(corpus_max, baseline_max)

    sampling = {
        "artifactType": "CorpusSamplingFrame",
        "version": "corpus-expansion-v2",
        "status": "FROZEN",
        "claim": "Corpus Expansion v2 samples remaining commander identities after the sealed 30, by incremental Profiles-v2 coverage only.",
        "listDiversity": {
            "eligibleTopDeckLists": frame_counts["nEligibleLists"],
            "role": "establish a representative list per identity; not a sampling weight",
        },
        "commanderDiversity": {
            "uniqueIdentitiesInEligibleLists": frame_counts["nIdentitiesInEligibleLists"],
            "afterExcludingSealed30Overlap": frame_counts["nEligibleNewIdentities"],
            "nExcluded": frame_counts["nExcludedSealed30Overlap"],
            "primarySamplingUnit": "commander identity",
        },
        "exclusion": {
            "rule": "exclude any identity whose component commander name set intersects the sealed 30",
            "sealed30ComponentCommanders": sorted(exclude_names),
            "prevents": "a sealed commander re-entering via a partner pairing",
        },
        "listChoiceIfMany": "mainboard size closest to 99; tie-break deckInstanceId. Not nLists-weighted.",
        "notPopularityWeighted": True,
        "blindTo": ["K", "Pressure", "M", "Hodge", "s", "desired counters", "desired cycles"],
        "coverageRelativeTo": "already-sealed 30",
    }

    def overlap_with(path: Path) -> int:
        if not path.exists():
            return 0
        held = {r["deckInstanceId"] for r in load_json(path)}
        return len({r["deckInstanceId"] for r in selected} & held)

    overlap1 = overlap_with(OUT / "attempt-1-invalid" / "selected-expansion.json")
    overlap2 = overlap_with(OUT / "attempt-2-hold" / "selected-expansion.json")

    report = {
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "REPORT_AND_WAIT",
        "attempt": 3,
        "protocol": "corpus-expansion-v2-protocol-v2",
        "sealed": False,
        "minCosine": min_cos,
        "representationParity": "PASS",
        "nSealedPrior": 30,
        "nExpansionV2": len(selected_idx),
        "nTotalIfComplete": 30 + len(selected_idx),
        "nCandidateIdentities": len(cand),
        "nPoolListsDeduped": len(pool),
        "stop": stop,
        "attempt1OverlapDeckInstanceIds": overlap1,
        "attempt2OverlapDeckInstanceIds": overlap2,
        "priorAttemptsNotUsedAsSeed": True,
        "selectionDidNotUse": proto["forbiddenInputs"],
        "regions": {
            "k": k,
            "seed": seed,
            "sealed30": sealed_regions,
            "candidates": region_counts,
            "selected": selected_regions,
            "emptyOfSealed30Filled": phase_a,
        },
        "coverageGainVsSealed30": round(float(gain_vs_30), 4),
        "perPickGain": [p["gain"] for p in picks],
        "underfilled": len(selected_idx) < n_exp,
        "next": "REPORT AND WAIT. Do not seal automatically.",
        "safety": {
            "kReviewsAdded": False,
            "pressureV4": False,
            "hodgeV2": False,
            "ontologyRetrain": False,
            "compatibilityEdited": False,
            "estimatorsTuned": False,
            "hodgeTuned": False,
            "rpsClaim": False,
            "ranking": False,
            "openai": False,
            "reembed": False,
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "sampling-frame.json").write_text(json.dumps(sampling, indent=2) + "\n", encoding="utf-8")
    (OUT / "candidate-pool-summary.json").write_text(
        json.dumps({"nUniqueCommanders": len(pool), "nProfiled": len(cand), "k": k, "seed": seed, "regionCounts": region_counts, **frame_counts}, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT / "source-decks.json").write_text(json.dumps(sources, indent=2) + "\n", encoding="utf-8")
    (OUT / "sealed-key.json").write_text(json.dumps({"note": "Open only after reading blind-selection.", "key": sealed}, indent=2) + "\n", encoding="utf-8")
    (OUT / "selected-expansion.json").write_text(json.dumps(selected, indent=2) + "\n", encoding="utf-8")
    (OUT / "blind-selection.json").write_text(json.dumps(blind, indent=2) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (OUT / "IMMUTABLE.json").write_text(
        json.dumps(
            {
                "artifactType": "CorpusExpansion",
                "version": "corpus-expansion-v2",
                "attempt": 3,
                "phase": "1",
                "status": "REPORT_AND_WAIT",
                "sealed": False,
                "protocol": "corpus-expansion-v2-protocol-v2",
                "parent": "hodge-diagnostic-v1",
                "samplingFrame": "FROZEN",
                "representationParity": "PASS",
                "minCosine": min_cos,
                "stop": stop,
                "primarySamplingUnit": "commander identity",
                "popularityWeighted": False,
                "nSealedPrior": 30,
                "nExpansionV2": len(selected_idx),
                "nTotal": 30 + len(selected_idx),
                "attempt1": "INVALID / NOT USED",
                "attempt2": "VALID / HOLD_UNDERFILLED / PACKING_EXHAUSTED",
                "protection": "selection probability is over commander identities, not TopDeck list frequency",
                "note": "Attempt 3 complete. Report and wait. Not sealed.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "attempt": 3,
                "sealed": False,
                "nExpansionV2": len(selected_idx),
                "nTotal": 30 + len(selected_idx),
                "minCosine": min_cos,
                "parity": {k: parity[k] for k in parity if k != "coordinateNames"},
                "stop": stop,
                "attempt1Overlap": overlap1,
                "attempt2Overlap": overlap2,
                "frame": frame_counts,
                "regionsSelected": selected_regions,
                "coverageGainVsSealed30": round(float(gain_vs_30), 4),
                "perPickGain": [p["gain"] for p in picks],
                "phaseA": phase_a,
                "blindIds": [f"D{31 + t:02d}" for t in range(len(selected_idx))],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

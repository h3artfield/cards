#!/usr/bin/env python3
"""
ODSG v1 pre-outcome representation + architecture freeze.

Does not unlock winners. Does not train.
Does not alter the frozen 39,625-pod dataset/protocol.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

from odsg_v1_architecture import (
    HIDDEN_DIM,
    INIT_SEED,
    LATENT_DIM,
    parameter_counts,
    run_selftest,
)
from odsg_v1_representation import (
    BGE_DIM,
    INPUT_DIM,
    build_x_d,
    exact_list_hash,
    field_manifest,
)
from outcome_firewall_v1 import (
    ODSG_V1_DEV_VAL_WINNER_UNLOCKED,
    ODSG_V1_FINAL_TEST_WINNER_UNLOCKED,
    ODSG_V1_TRAINING_AUTHORIZED,
    assert_odsg_v1_final_test_winners_locked,
    assert_odsg_v1_training_locked,
)
from train_experiments import load_json
from train_mechanical_directions_v1 import LOCKED_CHECKSUM, assert_frozen_bge

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
NEU = MS / "oracle-neural-semantic-space-v1"
POINTS = WEB / "data" / "milestones" / "catalog-shadow" / "catalog-semantic-visualization-v1-points.json.gz"
TOPDECK = WEB / "data" / "milestones" / "topdeck" / "topdeckImportRuns"
HOLDOUT = MS / "topdeck-holdout-outcome-validation-v1"
PARENT = MS / "outcome-derived-strategic-geometry-v1"
OUT = PARENT / "representation-architecture-freeze-v1"

PROTOCOL_SHA = "74b651a70a0860d9d4ffa3db2bb82310fdad4d14dc1995c60530e3654350a195"
ELIGIBLE_SHA = "c358398b47a6e49bf45936c9a89668926e220084e8d541b5fb87b821d91721e1"
FORBIDDEN_KEYS = {
    "winner",
    "winnerPlayerIdHash",
    "playerIdHash",
    "standings",
    "winRate",
    "placement",
}


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_obj(obj) -> str:
    return sha256_bytes(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8"))


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def assert_dataset_untouched() -> None:
    proto = sha256_file(PARENT / "PROTOCOL.json")
    if proto != PROTOCOL_SHA:
        raise SystemExit(f"PROTOCOL.json sha changed: {proto}")
    elig = sha256_file(PARENT / "eligible-pods.json")
    if elig != ELIGIBLE_SHA:
        raise SystemExit("eligible-pods.json sha changed — dataset freeze must stay intact")
    if ODSG_V1_TRAINING_AUTHORIZED or ODSG_V1_DEV_VAL_WINNER_UNLOCKED or ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise SystemExit("ODSG winner/training flags must stay false")


def assert_no_forbidden(obj, path: str = "") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in FORBIDDEN_KEYS:
                raise SystemExit(f"forbidden key {k} at {path}")
            assert_no_forbidden(v, f"{path}.{k}")
    elif isinstance(obj, list) and obj and not isinstance(obj[0], (int, float, str, bool, type(None))):
        for i, v in enumerate(obj[:20]):
            assert_no_forbidden(v, f"{path}[{i}]")


def main() -> None:
    assert_odsg_v1_training_locked()
    assert_odsg_v1_final_test_winners_locked()
    assert_dataset_untouched()
    run_selftest()

    neu_man = load_json(NEU / "manifest.json")
    assert_frozen_bge(neu_man)
    if sha256_file(NEU / "vectors.f32") != neu_man["vectorsSha256"]:
        raise SystemExit("BGE vectors.f32 checksum mismatch")

    print("  load catalog + BGE", flush=True)
    points = {r["oracleId"]: r for r in json.loads(gzip.open(POINTS, "rt", encoding="utf-8").read())}
    bge = np.fromfile(NEU / "vectors.f32", dtype=np.float32).reshape(int(neu_man["vectorCount"]), BGE_DIM)
    bge_row = {}
    for line in (NEU / "index.jsonl").read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        rec = json.loads(line)
        bge_row[rec["oracleId"]] = int(rec["i"])

    pods = load_json(PARENT / "eligible-pods.json")["pods"]
    if len(pods) != 39625:
        raise SystemExit("eligible pod count drifted")
    needed = {did for p in pods for did in p["deckInstanceIds"]}
    print(f"  load {len(needed)} deck instances", flush=True)
    decks: dict[str, dict] = {}
    for path in sorted(TOPDECK.glob("*/normalized-decks-v3.json")):
        for deck in load_json(path):
            did = str(deck.get("deckInstanceId") or "")
            if did in needed:
                decks[did] = {
                    "commanderOracleIds": list(deck.get("commanderOracleIds") or []),
                    "mainboard": [
                        {"oracleId": c.get("oracleId"), "quantity": int(c.get("quantity") or 1)}
                        for c in (deck.get("mainboard") or [])
                    ],
                }
        print(f"    {path.parent.name} have={len(decks)}", flush=True)
    missing_instances = sorted(needed - set(decks))
    if missing_instances:
        raise SystemExit(f"missing {len(missing_instances)} deck instances")

    instance_hash: dict[str, str] = {}
    hash_payload: dict[str, tuple[list[str], list[dict]]] = {}
    for did, deck in decks.items():
        h = exact_list_hash(deck["commanderOracleIds"], deck["mainboard"])
        instance_hash[did] = h
        hash_payload.setdefault(h, (deck["commanderOracleIds"], deck["mainboard"]))

    part_hashes = {"DEVELOPMENT": set(), "VALIDATION": set(), "FINAL_TEST": set()}
    part_instances = {"DEVELOPMENT": set(), "VALIDATION": set(), "FINAL_TEST": set()}
    pod_hashes: dict[str, list[str]] = {}
    for pod in pods:
        hs = [instance_hash[d] for d in pod["deckInstanceIds"]]
        pod_hashes[pod["podId"]] = hs
        part = pod["partition"]
        part_hashes[part].update(hs)
        part_instances[part].update(pod["deckInstanceIds"])

    inter_dv = part_hashes["DEVELOPMENT"] & part_hashes["VALIDATION"]
    inter_df = part_hashes["DEVELOPMENT"] & part_hashes["FINAL_TEST"]
    inter_vf = part_hashes["VALIDATION"] & part_hashes["FINAL_TEST"]
    inter_all = inter_dv & part_hashes["FINAL_TEST"]
    prior = part_hashes["DEVELOPMENT"] | part_hashes["VALIDATION"]

    final_pods = [p for p in pods if p["partition"] == "FINAL_TEST"]
    seen_ge1 = []
    unseen0 = []
    for p in final_pods:
        hs = pod_hashes[p["podId"]]
        n_seen = sum(1 for h in hs if h in prior)
        if n_seen:
            seen_ge1.append(p["podId"])
        else:
            unseen0.append(p["podId"])
    strict = [p["podId"] for p in final_pods if all(h not in prior for h in pod_hashes[p["podId"]])]
    if strict != unseen0:
        raise SystemExit("STRICT_UNSEEN_EXACT_4 must equal FINAL pods with 0 previously seen lists")

    holdout = load_json(HOLDOUT / "holdout-pods.json")
    spent_tids = {str(p.get("tid") or "") for p in holdout.get("pods") or []}
    spent_tids.discard("")
    remaining_tids = {p["tid"] for p in pods}
    overlap_tids = sorted(spent_tids & remaining_tids)
    overlap_parts = {p["partition"] for p in pods if p["tid"] in set(overlap_tids)}
    if overlap_parts != {"DEVELOPMENT"}:
        raise SystemExit(f"prior-outcome overlap not DEVELOPMENT-only: {overlap_parts}")

    print(f"  materialize {len(hash_payload)} unique exact lists", flush=True)
    hashes = sorted(hash_payload)
    X = np.zeros((len(hashes), INPUT_DIM), dtype=np.float32)
    cov_rows = []
    card_seen = set()
    card_sem_missing = set()
    card_sem_empty = set()
    card_bge_missing = set()
    for i, h in enumerate(hashes):
        cmd, mb = hash_payload[h]
        x, cov = build_x_d(cmd, mb, points, bge_row, bge)
        X[i] = x
        cov_rows.append({"exactListHash": h, **cov})
        oids = [str(o) for o in cmd if o] + [str(c["oracleId"]) for c in mb if c.get("oracleId")]
        for oid in oids:
            card_seen.add(oid)
            pt = points.get(oid)
            if pt is None:
                card_sem_missing.add(oid)
            elif not (pt.get("topActions") or pt.get("abilityTypes") or pt.get("derivedRoles")):
                card_sem_empty.add(oid)
            if oid not in bge_row:
                card_bge_missing.add(oid)
        if (i + 1) % 5000 == 0:
            print(f"    {i + 1}/{len(hashes)}", flush=True)

    row_of = {h: i for i, h in enumerate(hashes)}
    dev_idx = [row_of[h] for h in hashes if h in part_hashes["DEVELOPMENT"]]
    if not dev_idx:
        raise SystemExit("no DEVELOPMENT lists for normalization")
    mean = X[dev_idx].mean(axis=0)
    std = X[dev_idx].std(axis=0)
    std = np.where(std < 1e-6, 1.0, std).astype(np.float32)
    Xn = ((X - mean) / std).astype(np.float32)

    names = field_manifest()
    if len(names) != INPUT_DIM or INPUT_DIM != 32 + 95 + 95 + 4 * BGE_DIM:
        raise SystemExit(f"field manifest length mismatch: {INPUT_DIM}")

    OUT.mkdir(parents=True, exist_ok=True)
    Xn.tofile(OUT / "x_norm.f32")
    mean.tofile(OUT / "dev_mean.f32")
    std.tofile(OUT / "dev_std.f32")
    (OUT / "exact-list-hashes.txt").write_text("\n".join(hashes) + "\n", encoding="utf-8")
    with (OUT / "instance-hash-map.jsonl").open("w", encoding="utf-8") as fh:
        for did in sorted(instance_hash):
            fh.write(json.dumps({"deckInstanceId": did, "exactListHash": instance_hash[did]}, ensure_ascii=False) + "\n")
    with (OUT / "pod-exact-hashes.jsonl").open("w", encoding="utf-8") as fh:
        for p in pods:
            fh.write(
                json.dumps(
                    {
                        "podId": p["podId"],
                        "tid": p["tid"],
                        "partition": p["partition"],
                        "exactListHashes": pod_hashes[p["podId"]],
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    p0 = {
        "KNOWN_PRIOR_OUTCOME_EVENT_OVERLAP": "DEVELOPMENT_ONLY",
        "overlapEventTids": overlap_tids,
        "nOverlapEvents": len(overlap_tids),
        "historicalOutcomesForbiddenAsFeatures": True,
        "historicalOutcomesForbiddenAsArchitectureEvidence": True,
        "spentHoldoutRemainsExcludedAndSpent": True,
    }
    overlap = {
        "hashDefinition": "sha256(json{sorted commanderOracleIds, sorted mainboard oracleId+quantity})",
        "nUniqueExactListHashes": len(hashes),
        "nUniqueInstanceIds": len(instance_hash),
        "nHashesByPartition": {k: len(v) for k, v in part_hashes.items()},
        "nDevIntersectVal": len(inter_dv),
        "nDevIntersectFinal": len(inter_df),
        "nValIntersectFinal": len(inter_vf),
        "nAllThree": len(inter_all),
        "intersectionChecksums": {
            "DEV_VAL": sha256_obj(sorted(inter_dv)),
            "DEV_FINAL": sha256_obj(sorted(inter_df)),
            "VAL_FINAL": sha256_obj(sorted(inter_vf)),
            "ALL_THREE": sha256_obj(sorted(inter_all)),
        },
        "nFinalPods": len(final_pods),
        "nFinalPodsWithAtLeastOnePreviouslySeenExactList": len(seen_ge1),
        "nFinalPodsWithZeroPreviouslySeenExactLists": len(unseen0),
        "playerIdentityUsedAsFeature": False,
    }
    strict_doc = {
        "name": "FINAL_TEST_STRICT_UNSEEN_EXACT_4",
        "label": "STRICT_EXACT_LIST_NOVELTY_SENSITIVITY",
        "replacesPrimaryFinalTest": False,
        "createsSeparateRpsGate": False,
        "rule": "all four exact list hashes absent from DEVELOPMENT and VALIDATION",
        "nPods": len(strict),
        "nEvents": len({p["tid"] for p in final_pods if p["podId"] in set(strict)}),
        "podIds": strict,
        "secondaryMetric": "same Model1-vs-Model2 Δ and event-clustered CI if sample size permits",
    }
    coverage = {
        "nUniqueOracleIdsAcrossLists": len(card_seen),
        "nMissingSemanticPoint": len(card_sem_missing),
        "nSemanticPointButEmptyFields": len(card_sem_empty),
        "nMissingBge": len(card_bge_missing),
        "fracMissingSemanticPoint": len(card_sem_missing) / max(len(card_seen), 1),
        "fracSemanticEmpty": len(card_sem_empty) / max(len(card_seen), 1),
        "fracMissingBge": len(card_bge_missing) / max(len(card_seen), 1),
        "nListsMissingAnySemCmd": sum(1 for r in cov_rows if r["missingSemCmd"] > 0),
        "nListsMissingAnySem99": sum(1 for r in cov_rows if r["missingSem99"] > 0),
        "nListsMissingAnyBgeCmd": sum(1 for r in cov_rows if r["missingBgeCmd"] > 0),
        "nListsMissingAnyBge99": sum(1 for r in cov_rows if r["missingBge99"] > 0),
        "missingSemanticPointOracleIds": sorted(card_sem_missing)[:200],
        "missingBgeOracleIds": sorted(card_bge_missing)[:200],
    }
    manifest = {
        "artifactType": "OdsgV1OutcomeBlindDeckRepresentation",
        "status": "FROZEN",
        "dimension": INPUT_DIM,
        "fields": names,
        "blocks": {
            "structural": 32,
            "semanticCommander": 95,
            "semanticLibrary": 95,
            "bgeCommander": BGE_DIM,
            "bgeLibraryMean": BGE_DIM,
            "bgeLibraryStd": BGE_DIM,
            "bgeLibraryMax": BGE_DIM,
        },
        "normalization": {
            "method": "zscore",
            "statisticsFrom": "DEVELOPMENT unique exact lists only",
            "outcomeBlind": True,
            "nDevelopmentLists": len(dev_idx),
            "stdFloor": 1e-6,
        },
        "excluded": [
            "player identity",
            "tournament identity",
            "standings",
            "popularity",
            "win rate",
            "result history",
            "Pressure/K outputs",
        ],
        "bgeChecksum": LOCKED_CHECKSUM,
        "partnerCommanders": "deterministic mean of commander BGE vectors",
        "noNewSemanticTaxonomyFromOutcomes": True,
    }
    counts_r8 = parameter_counts(INPUT_DIM, 8)
    architecture = {
        "sharedEncoder": {
            "input": f"x_D dim={INPUT_DIM}",
            "layers": [
                {"type": "Dense", "units": HIDDEN_DIM, "activation": "GELU"},
                {"type": "Dense", "units": LATENT_DIM, "activation": "GELU"},
            ],
            "latent": f"h_D dim={LATENT_DIM}",
        },
        "strengthHead": {"type": "Dense", "units": 1, "activation": "linear"},
        "model1": {
            "u_i": "S(D_i)",
            "P": "softmax(u_1..u_4)",
            "parameterCount": counts_r8["model1"],
        },
        "model2": {
            "interaction": "low-rank antisymmetric I(A,B)=a_A·b_B - a_B·b_A with a=A h, b=B h",
            "noPairConcatMlp": True,
            "noOutcomeDerivedPairLabels": True,
            "u_i": "S(D_i) + sum_{j!=i} I(D_i,D_j)",
            "P": "softmax(u_1..u_4)",
            "sameEncoderAndStrengthHeadClassAsModel1": True,
            "parameterCountAtRank8": counts_r8["model2"],
            "parameterCountsByRank": {str(r): parameter_counts(INPUT_DIM, r) for r in (2, 4, 8, 16, 32)},
        },
        "nestedComparisonRule": [
            "Tune/select shared strength backbone using Model 1 only.",
            "Freeze chosen backbone architecture/training hyperparameters.",
            "Model 2 receives that same backbone specification.",
            "Only interaction rank and λI may then be selected for Model 2.",
            "Model 2 may train weights jointly; scalar model class may not become richer than Model 1.",
        ],
    }
    search = {
        "doNotEnlargeAfterSeeingDevVal": True,
        "initialization": {
            "hidden": "kaiming_uniform fan_in bound=sqrt(6/fan_in)",
            "biases": "zeros",
            "seed": INIT_SEED,
        },
        "batchConstruction": {
            "unit": "one 4-player pod",
            "batchSizePods": 32,
            "shuffleDevelopmentEachEpoch": True,
            "shuffleSeed": INIT_SEED,
            "noPlayerIdentityFeature": True,
        },
        "maxEpochs": 40,
        "earlyStopping": {"monitor": "VALIDATION pod log loss", "patience": 5, "restoreBest": True},
        "numericalPrecision": "float32",
        "randomSeeds": {"init": INIT_SEED, "shuffle": INIT_SEED, "bootstrap": 20260821},
        "model1Search": {
            "learning_rate": [1e-4, 3e-4, 1e-3],
            "weight_decay": [1e-5, 1e-4, 1e-3],
        },
        "model2SearchAfterBackboneFrozen": {
            "interaction_rank": [2, 4, 8, 16, 32],
            "lambda_I": [1e-5, 1e-4, 1e-3, 1e-2],
        },
    }
    sequence = {
        "executed": False,
        "stages": {
            "A": "Unlock DEVELOPMENT winners. Train Model-1 candidates on DEVELOPMENT. NOT EXECUTED.",
            "B": "Unlock VALIDATION winners. Choose Model-1 by VALIDATION pod log loss. Freeze. NOT EXECUTED.",
            "C": "Train preregistered Model-2 interaction configs on DEVELOPMENT. Select rank/λI on VALIDATION. NOT EXECUTED.",
            "D": "Refit Model 1 and Model 2 on DEVELOPMENT+VALIDATION under selected specs. NOT EXECUTED.",
            "E": "Predict every FINAL_TEST pod while ODSG_V1_FINAL_TEST_WINNER_UNLOCKED=false. Checksum weights, probabilities, IDs, representation, config. Then wait for a separate FINAL_TEST reveal authorization. NOT EXECUTED.",
        },
        "winnersOpened": False,
        "trainingExecuted": False,
    }
    primary = {
        "unchanged": True,
        "delta": "logloss(Model1) - logloss(Model2)",
        "pairedAtPod": True,
        "bootstrap": {"n": 10000, "seed": 20260821, "method": "event-clustered", "ci": "95% percentile"},
        "SG1": "MATCHUP_SIGNAL iff CI lower bound > 0",
        "SG2": "NO_ESTABLISHED_MATCHUP_SIGNAL iff CI contains 0",
        "SG3": "INTERACTION_MODEL_WORSE iff CI upper bound < 0",
        "cycleInspection": "only if FINAL_TEST produces SG1",
    }

    write_json(OUT / "P0_KNOWN_PRIOR_OUTCOME_EVENT_OVERLAP.json", p0)
    write_json(OUT / "exact-list-overlap-audit.json", overlap)
    write_json(OUT / "FINAL_TEST_STRICT_UNSEEN_EXACT_4.json", strict_doc)
    write_json(OUT / "coverage.json", coverage)
    write_json(OUT / "representation-field-manifest.json", manifest)
    write_json(OUT / "architecture-spec.json", architecture)
    write_json(OUT / "search-space.json", search)
    write_json(OUT / "training-sequence.json", sequence)
    write_json(OUT / "primary-metric-unchanged.json", primary)

    firewall = {
        "ODSG_V1_TRAINING_AUTHORIZED": ODSG_V1_TRAINING_AUTHORIZED,
        "ODSG_V1_DEV_VAL_WINNER_UNLOCKED": ODSG_V1_DEV_VAL_WINNER_UNLOCKED,
        "ODSG_V1_FINAL_TEST_WINNER_UNLOCKED": ODSG_V1_FINAL_TEST_WINNER_UNLOCKED,
        "protocolShaUnchanged": sha256_file(PARENT / "PROTOCOL.json") == PROTOCOL_SHA,
        "eligiblePodsShaUnchanged": sha256_file(PARENT / "eligible-pods.json") == ELIGIBLE_SHA,
        "winnerFieldsInNewArtifacts": False,
        "playerIdentityAsFeature": False,
        "pressureKUsed": False,
        "architectureSelftest": "PASS",
        "interactionDisabledReducesToModel1": True,
        "interactionAntisymmetric": True,
        "selfInteractionZero": True,
        "permutationEquivariant": True,
    }
    write_json(OUT / "firewall.json", firewall)

    report = {
        "artifactType": "OdsgV1PreOutcomeRepresentationArchitectureFreeze",
        "lineage": "OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1",
        "status": "DATASET_PROTOCOL_FROZEN_WINNERS_MASKED",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "WINNERS_OPENED": "NO",
        "TRAINING_EXECUTED": "NO",
        "representationDimension": INPUT_DIM,
        "nUniqueExactListHashes": len(hashes),
        "exactListOverlap": {
            "DEV_VAL": len(inter_dv),
            "DEV_FINAL": len(inter_df),
            "VAL_FINAL": len(inter_vf),
            "ALL_THREE": len(inter_all),
        },
        "nFinalPodsWithAtLeastOnePreviouslySeenExactList": len(seen_ge1),
        "nFinalPodsWithZeroPreviouslySeenExactLists": len(unseen0),
        "FINAL_TEST_STRICT_UNSEEN_EXACT_4": len(strict),
        "nStrictUnseenEvents": strict_doc["nEvents"],
        "missingSemanticOracle": {
            "nMissingPoint": coverage["nMissingSemanticPoint"],
            "nEmptyFields": coverage["nSemanticPointButEmptyFields"],
        },
        "model1ParameterCount": counts_r8["model1"],
        "model2ParameterCountAtRank8": counts_r8["model2"],
        "KNOWN_PRIOR_OUTCOME_EVENT_OVERLAP": "DEVELOPMENT_ONLY",
        "protocolSha256": PROTOCOL_SHA,
        "bgeChecksum": LOCKED_CHECKSUM,
    }
    write_json(OUT / "REPORT.json", report)

    for path in OUT.glob("*.json"):
        assert_no_forbidden(load_json(path), path.name)

    checks = {
        "protocolProvenance": PROTOCOL_SHA,
        "eligiblePodsProvenance": ELIGIBLE_SHA,
        "xNorm": sha256_file(OUT / "x_norm.f32"),
        "devMean": sha256_file(OUT / "dev_mean.f32"),
        "devStd": sha256_file(OUT / "dev_std.f32"),
        "exactListHashes": sha256_file(OUT / "exact-list-hashes.txt"),
        "instanceMap": sha256_file(OUT / "instance-hash-map.jsonl"),
        "podHashes": sha256_file(OUT / "pod-exact-hashes.jsonl"),
        "p0": sha256_file(OUT / "P0_KNOWN_PRIOR_OUTCOME_EVENT_OVERLAP.json"),
        "overlap": sha256_file(OUT / "exact-list-overlap-audit.json"),
        "strictUnseen": sha256_file(OUT / "FINAL_TEST_STRICT_UNSEEN_EXACT_4.json"),
        "coverage": sha256_file(OUT / "coverage.json"),
        "manifest": sha256_file(OUT / "representation-field-manifest.json"),
        "architecture": sha256_file(OUT / "architecture-spec.json"),
        "search": sha256_file(OUT / "search-space.json"),
        "sequence": sha256_file(OUT / "training-sequence.json"),
        "primary": sha256_file(OUT / "primary-metric-unchanged.json"),
        "firewall": sha256_file(OUT / "firewall.json"),
        "report": sha256_file(OUT / "REPORT.json"),
    }
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "status": "REPRESENTATION_ARCHITECTURE_FROZEN_WINNERS_MASKED",
            "trainingAuthorized": False,
            "winnersOpened": False,
            "xNormSha256": checks["xNorm"],
            "doNotEnlargeSearchAfterSeeingResults": True,
        },
    )
    write_json(
        PARENT / "REPRESENTATION_ARCHITECTURE_FROZEN.json",
        {
            "status": "REPRESENTATION_ARCHITECTURE_FROZEN_WINNERS_MASKED",
            "dir": "representation-architecture-freeze-v1",
            "WINNERS_OPENED": "NO",
            "TRAINING_EXECUTED": "NO",
            "protocolSha256": PROTOCOL_SHA,
        },
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

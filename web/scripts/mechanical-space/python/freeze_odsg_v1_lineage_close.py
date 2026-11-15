#!/usr/bin/env python3
"""
Close OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1 as SG3.

Does not inspect I(A,B). Does not run cycle audit.
Does not retrain or recompute FINAL_TEST metrics.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from outcome_firewall_v1 import (
    ODSG_V1_CYCLE_GEOMETRY_AUTHORIZED,
    ODSG_V1_FINAL_CALL,
    ODSG_V1_INTERACTION_MATRIX_INSPECTION_AUTHORIZED,
    ODSG_V1_LINEAGE_CLOSED,
    assert_odsg_v1_lineage_closed,
)
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
PARENT = MS / "outcome-derived-strategic-geometry-v1"
ADJ = PARENT / "final-test-adjudication-v1"
OUT = PARENT / "lineage-close-v1"

PRIMARY_DELTA = -0.009165524795563354
PRIMARY_CI = [-0.01665609409137473, -0.00183668218923592]
STRICT_DELTA = -0.009992567379632637
STRICT_CI = [-0.018522035979440812, -0.0012746623508728535]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    assert_odsg_v1_lineage_closed()
    if not ODSG_V1_LINEAGE_CLOSED:
        raise SystemExit("lineage must be closed")
    if ODSG_V1_CYCLE_GEOMETRY_AUTHORIZED or ODSG_V1_INTERACTION_MATRIX_INSPECTION_AUTHORIZED:
        raise SystemExit("cycle/I(A,B) flags must stay false")
    if ODSG_V1_FINAL_CALL != "SG3_INTERACTION_MODEL_WORSE":
        raise SystemExit("final call drifted")

    adj = load_json(ADJ / "REPORT.json")
    if adj["PRIMARY"]["call"] != "SG3_INTERACTION_MODEL_WORSE":
        raise SystemExit("adjudication call is not SG3")
    if adj["PRIMARY"]["delta"] != PRIMARY_DELTA:
        raise SystemExit("primary delta drifted")
    if adj["cycleGeometryInspected"] or adj["I_AB_inspected"]:
        raise SystemExit("geometry was inspected; refuse close-out rewrite")

    final_call = {
        "artifactType": "OdsgV1FinalCall",
        "lineage": "OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1",
        "status": "FINISHED",
        "call": "SG3_INTERACTION_MODEL_WORSE",
        "label": "SG3 — INTERACTION_MODEL_WORSE",
        "primary": {
            "delta": PRIMARY_DELTA,
            "ci95": PRIMARY_CI,
            "model0Logloss": 1.3862943611198906,
            "model1Logloss": 1.358440878982198,
            "model2Logloss": 1.3676064037777613,
            "nPods": 5712,
            "nEvents": 329,
            "bootstrap": {"n": 10000, "seed": 20260821, "cluster": "tid"},
        },
        "strictUnseenExact4": {
            "label": "STRICT_EXACT_LIST_NOVELTY_SENSITIVITY",
            "delta": STRICT_DELTA,
            "ci95": STRICT_CI,
            "nPods": 4012,
            "nEvents": 301,
            "secondary": True,
        },
        "conclusion": (
            "The preregistered opponent-specific pairwise interaction model does not add "
            "held-out winner information beyond scalar deck strength and generalizes significantly worse."
        ),
        "OUTCOME_DERIVED_CYCLE_GEOMETRY_AUDIT_V1": "NOT_AUTHORIZED",
        "RPS_CYCLIC_MATCHUP_STRUCTURE": "NOT_ESTABLISHED",
        "testedAndUnsupported": "exact-deck additive pairwise antisymmetric interaction I(A,B)=-I(B,A)",
        "notProvenImpossible": [
            "three-way or four-way pod interactions",
            "political/player-dependent effects",
            "turn-order dependence",
            "tournament/meta-level structure",
            "nonlinear combination of all four decks",
            "play skill, mulligans, draws, or tactics unavailable from decklists",
            "commander/meta-family matchup residuals after controlling for commander strength",
        ],
    }
    closed = {
        "artifactType": "OdsgV1LineageClose",
        "version": "outcome-derived-strategic-geometry-v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PERMANENTLY_FROZEN",
        "doNotRevise": True,
        "doNotReopen": True,
        "call": "SG3_INTERACTION_MODEL_WORSE",
        "scientificStatement": (
            "We found no prospective evidence that pairwise deck-vs-deck interaction geometry "
            "contributes useful winner information beyond scalar deck strength in this Commander corpus."
        ),
        "twoIndependentProspectiveFailures": [
            {
                "lineage": "Profiles v2 / K v3.0 / Pressure v4",
                "label": "HELD_OUT_OUTCOME_BLIND_TOPDECK_VALIDATION_V1_FAIL",
                "n": 5000,
                "result": "hand-constructed semantic matchup direction failed the spent holdout",
            },
            {
                "lineage": "OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1",
                "label": "SG3_INTERACTION_MODEL_WORSE",
                "n": 5712,
                "result": "outcome-trained antisymmetric exact-list interaction was significantly worse than strength alone",
            },
        ],
        "hierarchy": {
            "deckCompositionBeatsUniform": True,
            "model1VsModel0": {"model0": 1.3862943611198906, "model1": 1.358440878982198},
            "opponentSpecificInteractionImprovesPrediction": False,
            "pairwiseInteractionMerelyFailsToHelp": False,
            "pairwiseInteractionHurts": True,
            "cycleInspectionWarranted": False,
        },
        "interpretationNotANewFormalClaim": {
            "model1ContainsGeneralizedStrengthSignal": True,
            "alignmentWithEarlierMechanicalGeometry": (
                "earlier analysis showed one strong order direction plus weak/cancelled cycles; "
                "outcome analysis found scalar strength generalizes and pairwise interaction does not. "
                "Do not turn this alignment into a new formal claim on these spent data."
            ),
            "model0Top1IsArgmaxTieArtifact": True,
            "popularityOrCommanderRankingsDoNotContradictSg3": True,
            "nextDistinctHypothesisIfEverAuthorizedSeparately": (
                "After controlling for each commander/meta's overall win strength, "
                "do commander-level matchup combinations show stable non-transitive residuals?"
            ),
            "thatHypothesisIsNotAuthorizedHere": True,
        },
        "forbiddenNext": [
            "inspect I(A,B)",
            "run OUTCOME_DERIVED_CYCLE_GEOMETRY_AUDIT_V1",
            "retrain or redesign Model 2 from FINAL_TEST",
            "mine DEVELOPMENT, VALIDATION, or FINAL_TEST for a cyclic story",
            "relabel spent residuals as Commander RPS",
            "treat EDHREC/EDHTop16 rankings as contradicting SG3",
        ],
        "adjudicationReportSha256": sha256_file(ADJ / "REPORT.json"),
        "predictionFreezeSha256": "304302b0a188c482347a29de738f00331980c27ec8357a1a6b42b1d67f77c635",
        "protocolSha256": "74b651a70a0860d9d4ffa3db2bb82310fdad4d14dc1995c60530e3654350a195",
    }
    permanent = {
        "artifactType": "OdsgV1LineagePermanentFreeze",
        "label": "OUTCOME_DERIVED_STRATEGIC_GEOMETRY_V1_SG3",
        "call": "SG3_INTERACTION_MODEL_WORSE",
        "status": "PERMANENTLY_FROZEN",
        "doNotRevise": True,
        "doNotReopen": True,
        "cycleAudit": "NOT_AUTHORIZED",
        "interactionMatrixInspection": "NOT_AUTHORIZED",
        "rpsEstablished": False,
        "testedScope": "exact-deck additive pairwise antisymmetric interaction",
        "broaderConclusion": (
            "Commander deck composition appears to contain a general strength signal. "
            "We have not found evidence that adding pairwise who-beats-whom geometry "
            "improves prediction of real four-player outcomes."
        ),
        "defensibleUnsupportedClaim": "Exact-deck, additive pairwise matchup geometry was unsupported.",
        "tooBroadDoNotUse": "the empirical RPS/matchup-geometry hypothesis unsupported in all forms",
    }

    write_json(OUT / "FINAL_CALL.json", final_call)
    write_json(OUT / "LINEAGE_CLOSED.json", closed)
    write_json(OUT / "FAIL_PERMANENT.json", permanent)
    write_json(
        OUT / "IMMUTABLE.json",
        {
            "status": "PERMANENTLY_FROZEN",
            "call": "SG3_INTERACTION_MODEL_WORSE",
            "doNotReopen": True,
            "cycleGeometryAuthorized": False,
        },
    )
    write_json(PARENT / "LINEAGE_CLOSED.json", {"status": "FINISHED", "call": "SG3_INTERACTION_MODEL_WORSE", "dir": "lineage-close-v1"})
    write_json(PARENT / "FINAL_CALL.json", {"call": "SG3_INTERACTION_MODEL_WORSE", "delta": PRIMARY_DELTA, "ci95": PRIMARY_CI})
    checks = {
        "finalCall": sha256_file(OUT / "FINAL_CALL.json"),
        "lineageClosed": sha256_file(OUT / "LINEAGE_CLOSED.json"),
        "failPermanent": sha256_file(OUT / "FAIL_PERMANENT.json"),
        "adjudicationReport": sha256_file(ADJ / "REPORT.json"),
    }
    (OUT / "checksums.txt").write_text("\n".join(f"{k} {v}" for k, v in checks.items()) + "\n", encoding="utf-8")
    print(json.dumps({"call": "SG3_INTERACTION_MODEL_WORSE", "status": "FINISHED", **checks}, indent=2))


if __name__ == "__main__":
    main()

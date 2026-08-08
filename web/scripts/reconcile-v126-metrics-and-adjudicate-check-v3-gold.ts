/**
 * Reconcile expansion-v4 accepted-tier metrics and diagnose check-v3 gold defects.
 * Does not re-run parser; uses frozen v1.26 extraction path.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { ExpectedPrimitiveAction } from "./oracle-action-eval-shared";

function countGoldPositives(cases: OracleActionEvalCaseV2[]): number {
  let n = 0;
  for (const c of cases) {
    for (const e of c.expectedPrimitiveActions) {
      if (!e.negative) n++;
    }
  }
  return n;
}

function evalCorpus(
  cases: OracleActionEvalCaseV2[],
  goldOverlay?: Map<string, ExpectedPrimitiveAction[]>,
) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let acceptedEmissions = 0;
  let goldPositives = 0;
  const caseDetails: Array<Record<string, unknown>> = [];

  for (const testCase of cases) {
    const gold =
      goldOverlay?.get(testCase.id) ??
      testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    goldPositives += gold.length;

    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const patchedCase = { ...testCase, expectedPrimitiveActions: gold };
    const unified = evaluateCaseUnified(
      patchedCase,
      raw.actions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        evidenceStart: a.evidenceStart,
        evidenceEnd: a.evidenceEnd,
        faceId: a.faceId,
        abilityIndex: a.abilityIndex,
        loyaltyCost: a.loyaltyCost,
        sagaChapterId: a.sagaChapterId,
        modalOptionId: a.modalOptionId,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
        tokenCopyOf: a.tokenCopyOf,
      })),
    );
    acceptedEmissions += raw.actions.filter((a) => a.reviewStatus === "accepted").length;
    tp += unified.accepted.tp;
    fp += unified.accepted.fp;
    fn += unified.accepted.fn;

    if (unified.accepted.fp > 0 || unified.accepted.fn > 0) {
      caseDetails.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        tp: unified.accepted.tp,
        fp: unified.accepted.fp,
        fn: unified.accepted.fn,
        gold,
        accepted: raw.actions
          .filter((a) => a.reviewStatus === "accepted")
          .map((a) => ({
            type: normalizeToPrimitive(a.actionType, a.evidenceText),
            evidence: a.evidenceText.slice(0, 90),
            modalOptionId: a.modalOptionId,
            optionalEffect: a.optionalEffect,
            tokenCopyOf: a.tokenCopyOf,
          })),
      });
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  return { tp, fp, fn, precision, recall, acceptedEmissions, goldPositives, caseDetails };
}

async function main() {
  const v4 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v4.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const v4Metrics = evalCorpus(v4.cases);

  const chk3 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-check-v3.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const originalChk3 = evalCorpus(chk3.cases);

  const goldOverlay = new Map<string, ExpectedPrimitiveAction[]>();
  for (const c of chk3.cases) {
    goldOverlay.set(
      c.id,
      c.expectedPrimitiveActions.filter((e) => !e.negative).map((e) => ({ ...e })),
    );
  }

  // Three Steps Ahead: create_token + tokenCopyOf, not copy
  goldOverlay.set("dev-exp-chk-v3-013", [
    {
      actionType: "create_token",
      evidenceContains: "Create a token that's a copy of target artifact or creature you control",
      optionId: "opt-2",
      tokenCopyOf: "target artifact or creature you control",
    },
  ]);

  // Captain Kirk: mandatory search — no optionalEffect
  goldOverlay.set("dev-exp-chk-v3-009", [
    {
      actionType: "search_library",
      evidenceContains: "search your library and/or graveyard",
      optionalEffect: false,
    },
  ]);

  const correctedChk3 = evalCorpus(chk3.cases, goldOverlay);

  const threeSteps = chk3.cases.find((c) => c.id === "dev-exp-chk-v3-013")!;
  const kirk = chk3.cases.find((c) => c.id === "dev-exp-chk-v3-009")!;
  const kirkRaw = extractOracleActionsV1({
    oracleId: kirk.oracleId,
    oracleText: kirk.oracleText,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    expansionV4Reconciliation: {
      tier: "accepted_only",
      formula: "precision = TP / (TP + FP)",
      ...v4Metrics,
      priorReportError:
        "Prior summary incorrectly stated FP=0 alongside P=97.4%; checkpoint JSON rc2-checkpoint-v126-dev.json records FP=1.",
      note: v4Metrics.fp === 0 ? "FP zero implies P=100%" : `FP=${v4Metrics.fp} implies P=${v4Metrics.precision}`,
    },
    checkV3Original: {
      tier: "accepted_only",
      diagnostic: false,
      tp: originalChk3.tp,
      fp: originalChk3.fp,
      fn: originalChk3.fn,
      precision: originalChk3.precision,
      recall: originalChk3.recall,
      goldPositives: originalChk3.goldPositives,
      acceptedEmissions: originalChk3.acceptedEmissions,
      holdoutStatus: "spent — not re-run",
    },
    checkV3GoldCorrected: {
      tier: "accepted_only",
      diagnostic: true,
      corrections: [
        {
          caseId: "dev-exp-chk-v3-013",
          cardName: "Three Steps Ahead",
          adjudication: "gold_taxonomy_defect",
          originalGold: threeSteps.expectedPrimitiveActions,
          correctedGold: goldOverlay.get("dev-exp-chk-v3-013"),
          canonicalOracle:
            "+ {3} — Create a token that's a copy of target artifact or creature you control.",
          rule: "Create a token that's a copy of X → create_token + tokenCopyOf, not copy primitive",
        },
        {
          caseId: "dev-exp-chk-v3-009",
          cardName: "Captain Kirk, Boldly Going",
          adjudication: "gold_error",
          originalGold: kirk.expectedPrimitiveActions,
          correctedGold: goldOverlay.get("dev-exp-chk-v3-009"),
          canonicalOracle:
            "Whenever Captain Kirk enters or attacks, search your library and/or graveyard for a basic land card or a card named Starship Enterprise, reveal it, and put it into your hand. If you search your library this way, shuffle.",
          parserEmission: kirkRaw.actions
            .filter((a) => a.actionType === "search_library")
            .map((a) => ({
              optionalEffect: a.optionalEffect,
              evidence: a.evidenceText,
              reviewStatus: a.reviewStatus,
            })),
          classification: "gold_error",
          reason:
            "Oracle uses imperative 'search...' with no 'you may'; optionalEffect=true in gold is incorrect. Parser optionalEffect=false is deterministic and correct.",
        },
      ],
      tp: correctedChk3.tp,
      fp: correctedChk3.fp,
      fn: correctedChk3.fn,
      precision: correctedChk3.precision,
      recall: correctedChk3.recall,
      goldPositives: correctedChk3.goldPositives,
      acceptedEmissions: correctedChk3.acceptedEmissions,
      remainingFailures: correctedChk3.caseDetails,
    },
  };

  const outPath = resolve(
    process.cwd(),
    "data/milestones/rc2-development-planning/v126-metric-reconciliation-and-gold-adjudication.json",
  );
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();

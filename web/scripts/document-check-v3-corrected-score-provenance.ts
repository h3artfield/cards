/**
 * Check-v3 corrected-score provenance — incremental gold adjudication deltas.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import type { ExpectedPrimitiveAction } from "./oracle-action-eval-shared";

function score(cases: OracleActionEvalCaseV2[], overlay: Map<string, ExpectedPrimitiveAction[]>) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const perCase: Record<string, { tp: number; fp: number; fn: number }> = {};
  for (const c of cases) {
    const gold = overlay.get(c.id) ?? c.expectedPrimitiveActions.filter((e) => !e.negative);
    const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
    const u = evaluateCaseUnified(
      { ...c, expectedPrimitiveActions: gold },
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
      })),
    );
    tp += u.accepted.tp;
    fp += u.accepted.fp;
    fn += u.accepted.fn;
    if (u.accepted.fn || u.accepted.fp) {
      perCase[c.id] = { tp: u.accepted.tp, fp: u.accepted.fp, fn: u.accepted.fn };
    }
  }
  return {
    tp,
    fp,
    fn,
    precision: tp + fp > 0 ? tp / (tp + fp) : 1,
    recall: tp + fn > 0 ? tp / (tp + fn) : 1,
    perCase,
  };
}

function overlayFrom(cases: OracleActionEvalCaseV2[]) {
  const m = new Map<string, ExpectedPrimitiveAction[]>();
  for (const c of cases) {
    m.set(c.id, c.expectedPrimitiveActions.filter((e) => !e.negative).map((e) => ({ ...e })));
  }
  return m;
}

async function main() {
  const chk3 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-check-v3.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const base = overlayFrom(chk3.cases);
  const original = score(chk3.cases, base);

  const threeStepsOnly = overlayFrom(chk3.cases);
  threeStepsOnly.set("dev-exp-chk-v3-013", [
    {
      actionType: "create_token",
      evidenceContains: "Create a token that's a copy of target artifact or creature you control",
      optionId: "opt-2",
    },
  ]);
  const afterThreeSteps = score(chk3.cases, threeStepsOnly);

  const kirkOnly = overlayFrom(chk3.cases);
  kirkOnly.set("dev-exp-chk-v3-009", [
    {
      actionType: "search_library",
      evidenceContains: "search your library and/or graveyard",
      optionalEffect: false,
    },
  ]);
  const afterKirk = score(chk3.cases, kirkOnly);

  const both = overlayFrom(chk3.cases);
  both.set("dev-exp-chk-v3-013", threeStepsOnly.get("dev-exp-chk-v3-013")!);
  both.set("dev-exp-chk-v3-009", kirkOnly.get("dev-exp-chk-v3-009")!);
  const afterBoth = score(chk3.cases, both);

  const report = {
    generatedAt: new Date().toISOString(),
    holdout: { status: "spent_for_development", parserExecutionCount: 1, noParserRerun: true },
    original: { tp: original.tp, fp: original.fp, fn: original.fn, precision: original.precision, recall: original.recall },
    incrementalAdjudications: {
      threeStepsAheadOnly: {
        caseId: "dev-exp-chk-v3-013",
        change: "copy → create_token (+ tokenCopyOf referent)",
        delta: {
          tp: afterThreeSteps.tp - original.tp,
          fp: afterThreeSteps.fp - original.fp,
          fn: afterThreeSteps.fn - original.fn,
        },
        result: {
          tp: afterThreeSteps.tp,
          fp: afterThreeSteps.fp,
          fn: afterThreeSteps.fn,
          precision: afterThreeSteps.precision,
          recall: afterThreeSteps.recall,
        },
      },
      captainKirkOnly: {
        caseId: "dev-exp-chk-v3-009",
        change: "optionalEffect true → false (imperative search)",
        delta: { tp: afterKirk.tp - original.tp, fp: afterKirk.fp - original.fp, fn: afterKirk.fn - original.fn },
        result: {
          tp: afterKirk.tp,
          fp: afterKirk.fp,
          fn: afterKirk.fn,
          precision: afterKirk.precision,
          recall: afterKirk.recall,
        },
      },
      bothCombined: {
        cases: ["dev-exp-chk-v3-013", "dev-exp-chk-v3-009"],
        delta: { tp: afterBoth.tp - original.tp, fp: afterBoth.fp - original.fp, fn: afterBoth.fn - original.fn },
        result: {
          tp: afterBoth.tp,
          fp: afterBoth.fp,
          fn: afterBoth.fn,
          precision: afterBoth.precision,
          recall: afterBoth.recall,
        },
        note: "Diagnostic corrected score uses BOTH adjudications together",
      },
    },
    provenanceSummary: {
      bothAdjudicationsRequired: true,
      threeStepsAhead: "+1 TP, −1 FN (copy→create_token)",
      captainKirk: "+1 TP, −1 FN (optionalEffect gold error)",
      combined: "+2 TP, −2 FN → 28/1/3",
    },
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/check-v3-corrected-score-provenance-v127.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();

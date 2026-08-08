/**
 * Structured diagnosis of spent check-v4 failures by semantic layer.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";

type FailureLayer =
  | "incorrect_ability_block"
  | "incorrect_option_block"
  | "argument_extraction"
  | "unresolved_referent"
  | "quantity_parsing"
  | "action_grammar"
  | "review_status_calibration"
  | "matcher_evaluator"
  | "semantic_ast_would_resolve";

function classifyFailure(input: {
  testCase: OracleActionEvalCaseV2;
  gold: { actionType: string; evidenceContains: string; loyaltyCost?: string; optionId?: string; optionalEffect?: boolean };
  parse: ReturnType<typeof parseOracleSemantics>;
  legacyFn: boolean;
}): { primaryLayer: FailureLayer; notes: string; semanticHasMatchingAction: boolean } {
  const { testCase, gold, parse, legacyFn } = input;
  const semMatch = parse.actions.find(
    (a) =>
      a.actionType === gold.actionType &&
      a.reviewStatus === "accepted" &&
      (gold.loyaltyCost ? parse.abilities.some((ab) => ab.loyaltyCost === gold.loyaltyCost && ab.abilityId === a.parentAbilityId) : true) &&
      (gold.optionId
        ? a.modalOptionId?.endsWith(`.${gold.optionId}`) || a.modalOptionId?.includes(gold.optionId)
        : true) &&
      (a.provenance.actionSpan.text.toLowerCase().includes(gold.evidenceContains.toLowerCase().slice(0, 12)) ||
        gold.evidenceContains.toLowerCase().includes(a.provenance.actionSpan.text.toLowerCase().slice(0, 12))),
  );

  if (legacyFn && semMatch) {
    return {
      primaryLayer: "semantic_ast_would_resolve",
      notes: "Canonical semantic parse contains matching action; legacy matcher/abilityIndex path fails",
      semanticHasMatchingAction: true,
    };
  }

  if (gold.loyaltyCost) {
    const loyalty = parse.abilities.find((a) => a.loyaltyCost === gold.loyaltyCost);
    if (!loyalty) {
      return {
        primaryLayer: "incorrect_ability_block",
        notes: `No loyalty ability block for ${gold.loyaltyCost}`,
        semanticHasMatchingAction: false,
      };
    }
    const wrongCostAction = parse.legacy.actions.find(
      (a) => a.actionType === gold.actionType && a.loyaltyCost && a.loyaltyCost !== gold.loyaltyCost,
    );
    if (wrongCostAction && !semMatch) {
      return {
        primaryLayer: "incorrect_ability_block",
        notes: `Action tagged with wrong loyaltyCost ${wrongCostAction.loyaltyCost} vs gold ${gold.loyaltyCost}`,
        semanticHasMatchingAction: false,
      };
    }
  }

  if (gold.optionId) {
    const opt = parse.abilities.flatMap((a) => a.options ?? []).find((o) => o.optionId.endsWith(`.${gold.optionId}`));
    if (!opt) {
      return {
        primaryLayer: "incorrect_option_block",
        notes: `Missing option block ${gold.optionId}`,
        semanticHasMatchingAction: false,
      };
    }
  }

  const anyAccepted = parse.legacy.actions.some(
    (a) =>
      a.reviewStatus === "accepted" &&
      a.actionType === gold.actionType &&
      a.evidenceText.toLowerCase().includes(gold.evidenceContains.toLowerCase().slice(0, 10)),
  );
  if (!anyAccepted) {
    if (/search your library and\/or graveyard for an artifact/i.test(gold.evidenceContains)) {
      return {
        primaryLayer: "action_grammar",
        notes: "Search pattern too specific — parser matches shorter library/gy stem only",
        semanticHasMatchingAction: false,
      };
    }
    if (/Return target permanent you control/i.test(gold.evidenceContains)) {
      return {
        primaryLayer: "action_grammar",
        notes: "Return-to-hand pattern not matched for compound permanent clause",
        semanticHasMatchingAction: false,
      };
    }
    if (/counter it unless its controller pays/i.test(gold.evidenceContains)) {
      return {
        primaryLayer: "action_grammar",
        notes: "Counter-unless-pay pattern not in ACTION_PATTERNS",
        semanticHasMatchingAction: false,
      };
    }
    if (/Each player loses a third/i.test(gold.evidenceContains)) {
      return {
        primaryLayer: "quantity_parsing",
        notes: "Third-fraction lose_life not extracted; discard/sacrifice thirds may match instead",
        semanticHasMatchingAction: false,
      };
    }
    return {
      primaryLayer: "action_grammar",
      notes: "No accepted legacy action matches gold evidence",
      semanticHasMatchingAction: !!semMatch,
    };
  }

  if (gold.optionalEffect !== undefined) {
    return {
      primaryLayer: "matcher_evaluator",
      notes: "Action may exist but optionalEffect dimension fails unified matcher",
      semanticHasMatchingAction: !!semMatch,
    };
  }

  return {
    primaryLayer: "matcher_evaluator",
    notes: "Legacy unified matcher FN despite partial emission overlap",
    semanticHasMatchingAction: !!semMatch,
  };
}

async function main() {
  const diag = JSON.parse(
    readFileSync("data/milestones/rc2-development-planning/expansion-check-v4-failure-diagnosis-v127.json", "utf8"),
  ) as { failures: Array<{ caseId: string; cardName: string; family: string; gold: unknown[]; accepted: unknown[] }> };

  const envelope = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-check-v4.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const breakdown = [];
  for (const f of diag.failures) {
    const testCase = envelope.cases.find((c) => c.id === f.caseId)!;
    const parse = parseOracleSemantics({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
    const unified = evaluateCaseUnified(
      testCase,
      parse.legacy.actions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        evidenceStart: a.evidenceStart,
        evidenceEnd: a.evidenceEnd,
        faceId: a.faceId,
        abilityIndex: a.abilityIndex,
        loyaltyCost: a.loyaltyCost,
        modalOptionId: a.modalOptionId,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
      })),
    );
    const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const layers = gold.map((g) =>
      classifyFailure({
        testCase,
        gold: g,
        parse,
        legacyFn: unified.accepted.fn > 0,
      }),
    );
    breakdown.push({
      caseId: f.caseId,
      cardName: f.cardName,
      family: f.family,
      legacyMetrics: unified.accepted,
      semanticActionCount: parse.actions.length,
      semanticAbilityCount: parse.abilities.length,
      goldExpectations: gold.length,
      layerClassification: layers,
      primaryLayers: [...new Set(layers.map((l) => l.primaryLayer))],
      wouldResolveWithSemanticAst: layers.some((l) => l.primaryLayer === "semantic_ast_would_resolve"),
    });
  }

  const summary = Object.fromEntries(
    [...new Set(breakdown.flatMap((b) => b.primaryLayers))].map((layer) => [
      layer,
      breakdown.filter((b) => b.primaryLayers.includes(layer as FailureLayer)).map((b) => b.caseId),
    ]),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: parseOracleSemantics({ oracleId: "x", oracleText: "Draw a card." }).parserVersion,
    holdout: "expansion-check-v4 (spent)",
    failureCount: breakdown.length,
    summary,
    breakdown,
    astResolutionHypothesis: {
      countWouldResolve: breakdown.filter((b) => b.wouldResolveWithSemanticAst).length,
      note: "Cases where canonical semantic parse already contains gold-aligned action but legacy eval path FN",
    },
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-check-v4-structural-fn-breakdown-v128.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ summary, astResolutionHypothesis: report.astResolutionHypothesis }, null, 2));
}

main();

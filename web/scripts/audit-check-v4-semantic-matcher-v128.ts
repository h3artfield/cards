/**
 * Audit-only check-v4 legacy vs semantic matcher score from saved execution evidence.
 * Does NOT rerun check-v4 or increment parserExecutionCount.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

async function main() {
  const savedExecution = JSON.parse(
    readFileSync("data/milestones/rc2-development-planning/rc2-expansion-check-v4-execution-1.json", "utf8"),
  ) as { metrics: { tp: number; fp: number; fn: number; precision: number; recall: number } };

  const envelope = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-check-v4.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const legacyPerCase: Array<{ caseId: string; cardName?: string; tp: number; fp: number; fn: number }> = [];
  const semanticPerCase: typeof legacyPerCase = [];
  const fnConversions: Array<{
    caseId: string;
    cardName?: string;
    legacyFn: number;
    semanticFn: number;
    converted: boolean;
    family?: string;
  }> = [];

  const diagnosis = JSON.parse(
    readFileSync("data/milestones/rc2-development-planning/expansion-check-v4-failure-diagnosis-v127.json", "utf8"),
  ) as { failures: Array<{ caseId: string; cardName: string; family: string }> };
  const familyByCase = new Map(diagnosis.failures.map((f) => [f.caseId, f.family]));

  for (const testCase of envelope.cases) {
    const parsed = parseOracleSemantics({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });

    const legacy = evaluateCaseUnified(
      testCase,
      parsed.legacy.actions.map((a) => ({
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

    const semantic = evaluateCaseSemantic(testCase, parsed);
    const semanticScopeOnly = evaluateCaseSemantic(testCase, parsed, { ignoreOptionalEffect: true });

    legacyPerCase.push({ caseId: testCase.id, cardName: testCase.cardName, ...legacy.accepted });
    semanticPerCase.push({ caseId: testCase.id, cardName: testCase.cardName, ...semantic.accepted });

    if (legacy.accepted.fn > 0) {
      fnConversions.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        legacyFn: legacy.accepted.fn,
        semanticFn: semantic.accepted.fn,
        semanticScopeOnlyFn: semanticScopeOnly.accepted.fn,
        convertedStrict: legacy.accepted.fn > 0 && semantic.accepted.fn < legacy.accepted.fn,
        convertedScopeOnly:
          legacy.accepted.fn > 0 && semanticScopeOnly.accepted.fn < legacy.accepted.fn,
        family: familyByCase.get(testCase.id),
      });
    }
  }

  const sum = (rows: typeof legacyPerCase) => {
    const tp = rows.reduce((s, r) => s + r.tp, 0);
    const fp = rows.reduce((s, r) => s + r.fp, 0);
    const fn = rows.reduce((s, r) => s + r.fn, 0);
    return {
      tp,
      fp,
      fn,
      precision: tp + fp > 0 ? tp / (tp + fp) : 1,
      recall: tp + fn > 0 ? tp / (tp + fn) : 1,
    };
  };

  const legacyScore = sum(legacyPerCase);
  const semanticScore = sum(semanticPerCase);
  const semanticScopeOnlyScore = sum(
    envelope.cases.map((testCase) => {
      const parsed = parseOracleSemantics({
        oracleId: testCase.oracleId,
        oracleText: testCase.oracleText,
        cardFace: testCase.cardFace,
      });
      return evaluateCaseSemantic(testCase, parsed, { ignoreOptionalEffect: true }).accepted;
    }).map((m, i) => ({ caseId: envelope.cases[i].id, ...m })),
  );
  const convertedStrict = fnConversions.filter((c) => c.convertedStrict);
  const convertedScopeOnly = fnConversions.filter((c) => c.convertedScopeOnly);

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    holdout: "expansion-check-v4 (spent — audit only, no re-execution)",
    savedLegacyExecution: savedExecution.metrics,
    legacyMatcherScore: legacyScore,
    semanticMatcherScore: semanticScore,
    semanticScopeOnlyMatcherScore: semanticScopeOnlyScore,
    fnConversions: {
      totalLegacyFnCases: fnConversions.length,
      convertedStrictCount: convertedStrict.length,
      convertedStrictCaseIds: convertedStrict.map((c) => c.caseId),
      convertedScopeOnlyCount: convertedScopeOnly.length,
      convertedScopeOnlyCaseIds: convertedScopeOnly.map((c) => c.caseId),
      details: fnConversions,
    },
    remainingSemanticFns: fnConversions
      .filter((c) => c.semanticFn > 0)
      .map((c) => ({ caseId: c.caseId, cardName: c.cardName, semanticFn: c.semanticFn, family: c.family })),
    note: "Semantic matcher uses parentAbilityId/modalOptionId/provenance — no check-v4 re-run",
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/check-v4-semantic-matcher-audit-v128.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        savedLegacyExecution: savedExecution.metrics,
        legacyMatcherScore: legacyScore,
        semanticMatcherScore: semanticScore,
        semanticScopeOnlyMatcherScore: semanticScopeOnlyScore,
        convertedStrictCount: convertedStrict.length,
        convertedScopeOnlyCount: convertedScopeOnly.length,
        convertedScopeOnlyCaseIds: convertedScopeOnly.map((c) => c.caseId),
      },
      null,
      2,
    ),
  );
}

main();

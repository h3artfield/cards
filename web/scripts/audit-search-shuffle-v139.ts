/**
 * Parser-blind audit ledger for search/shuffle cases and legacy search FPs.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateCaseSemantic, matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

function loadCase(id: string): OracleActionEvalCaseV2 {
  const paths = [
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  ];
  for (const p of paths) {
    const raw = (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases;
    const migrated = applyGoldMigrationV135(raw);
    const found = migrated.find((c) => c.id === id);
    if (found) return found;
  }
  throw new Error(`case not found: ${id}`);
}

function actionRow(parse: ReturnType<typeof parseOracleSemanticsRC3>, a: (typeof parse.actions)[number]) {
  const ability = parse.abilities.find((ab) => ab.abilityId === a.parentAbilityId);
  return {
    actionType: a.actionType,
    evidence: a.provenance.actionSpan.text,
    faceId: ability?.faceId,
    clauseId: a.clauseId,
    reviewStatus: a.reviewStatus,
    executionContext: a.executionContext,
    extractionSource: a.extractionSource,
    referentObjectId: a.arguments.referentObjectId,
    sourceZone: a.arguments.sourceZone,
    destinationZone: a.arguments.destinationZone,
  };
}

function auditCase(id: string) {
  const c = loadCase(id);
  const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
  const metrics = evaluateCaseSemantic(c, parse);
  const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
  const matched = matchGoldToSemanticActions({
    expected,
    parse,
    tier: "accepted",
    oracleText: c.oracleText,
    caseId: c.id,
  });
  const accepted = parse.actions.filter((a) => a.reviewStatus === "accepted");
  const unmatchedGold = matched.matches.filter((m) => !m.matched).map((m) => expected[m.expectedIndex]);
  const fpIndices = new Set(matched.unmatchedActionIndices);
  const fps = accepted.filter((_, i) => fpIndices.has(i));

  return {
    caseId: c.id,
    cardName: (c as { cardName?: string }).cardName,
    oracleText: c.oracleText,
    caseScope: (c as { caseScope?: string }).caseScope,
    coverageStratum: (c as { coverageStratum?: string }).coverageStratum,
    metrics,
    expectedGold: expected.map((g) => ({
      actionType: g.actionType,
      evidenceContains: g.evidenceContains,
      cardFace: g.cardFace,
    })),
    emittedAccepted: accepted.map((a) => actionRow(parse, a)),
    falsePositives: fps.map((a) => actionRow(parse, a)),
    unmatchedGold: unmatchedGold.map((g) => ({
      actionType: g?.actionType,
      evidenceContains: g?.evidenceContains,
    })),
    matchDetail: matched.matches.map((m) => ({
      expected: expected[m.expectedIndex]?.actionType,
      evidenceContains: expected[m.expectedIndex]?.evidenceContains,
      matched: m.matched,
    })),
  };
}

const caseIds = ["rc3-pos-cat-0005", "rc3-pos-cat-0007", "dev-v9-018", "dev-exp-v1-012", "dev-v9-001"];
const report = {
  generatedAt: new Date().toISOString(),
  checkpoint: "search-shuffle-audit-v139",
  cases: Object.fromEntries(caseIds.map((id) => [id, auditCase(id)])),
};

mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
writeFileSync(
  resolve("data/milestones/rc3-development/search-shuffle-audit-v139.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

/**
 * RC2 v1.21 diagnostic — unsupported + lose_life FP inventory.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function loadJson(path: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
}

function diagnoseUnsupported(cases: OracleActionEvalCaseV2[], label: string) {
  const evalResult = evaluateCaseSet(cases, label);
  const unsupportedCount = evalResult.authoritativeClassification.counts.genuinely_unsupported_by_oracle;
  console.log(`\n=== ${label}: unsupported=${unsupportedCount} ===`);

  for (const c of cases) {
    const raw = extractOracleActionsV1({
      oracleId: c.oracleId,
      oracleText: c.oracleText,
      cardFace: c.cardFace,
    });
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      textRole: a.textRole,
    }));
    const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: c.oracleText });
    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      const inGold = expected.some((e) => e.actionType === a.primitive);
      const forbidden = c.forbiddenPrimitiveActions?.includes(a.primitive);
      if (inGold || forbidden) continue;
      console.log(JSON.stringify({
        caseId: c.id,
        cardName: c.cardName,
        family: (c as { expansionMetadata?: { family?: string } }).expansionMetadata?.family,
        primitive: a.primitive,
        evidence: a.evidenceText,
        role: a.textRole,
        oracleSnippet: c.oracleText.replace(/\n/g, " | ").slice(0, 200),
        gold: expected.map((p) => `${p.actionType}:${p.evidenceContains.slice(0, 50)}`),
        forbidden: c.forbiddenPrimitiveActions,
      }, null, 2));
    }
  }
}

function diagnoseLoseLifeFp(cases: OracleActionEvalCaseV2[]) {
  console.log("\n=== dev lose_life FP ===");
  for (const c of cases) {
    const raw = extractOracleActionsV1({
      oracleId: c.oracleId,
      oracleText: c.oracleText,
      cardFace: c.cardFace,
    });
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      textRole: a.textRole,
    }));
    const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: c.oracleText });
    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || a.primitive !== "lose_life") continue;
      console.log(JSON.stringify({
        caseId: c.id,
        cardName: c.cardName,
        evidence: a.evidenceText,
        role: a.textRole,
        oracleSnippet: c.oracleText.replace(/\n/g, " | ").slice(0, 220),
        gold: expected.map((p) => `${p.actionType}:${p.evidenceContains.slice(0, 50)}`),
        structure: c.expectedStructure,
        forbidden: c.forbiddenPrimitiveActions,
      }, null, 2));
    }
  }
}

const dev = loadJson("data/oracle-action-eval-development-v25.json");
const exp = loadJson("data/oracle-action-eval-development-generalization-expansion-v1.json");
const training = exp.cases.filter(
  (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
);

diagnoseUnsupported(training, "expansion-training");
diagnoseUnsupported(exp.cases.filter(
  (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-check",
), "expansion-check");
diagnoseLoseLifeFp(dev.cases);

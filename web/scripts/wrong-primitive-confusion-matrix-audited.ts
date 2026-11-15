/**
 * Audited confusion matrix — separates taxonomy/gold issues from true parser errors.
 * Run: npx tsx scripts/wrong-primitive-confusion-matrix-audited.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { matchGoldToActions, primitiveMatchesExpected } from "./oracle-action-unified-matcher";
import { evidenceMatchesExtracted, evidenceMatchesOracle } from "./oracle-action-eval-shared";

loadEnvLocal();

type AuditCategory =
  | "true_primitive_confusion"
  | "missing_layer2_gold"
  | "action_word_in_trigger_header"
  | "action_word_in_cost"
  | "static_permission_restriction"
  | "replacement_structure_only"
  | "genuine_unsupported_extraction"
  | "reminder_text_spurious";

function inferExpectedLabel(testCase: OracleActionEvalCaseV2, evidenceText: string, predicted: string): string {
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  for (const exp of gold) {
    if (evidenceMatchesExtracted(evidenceText, exp.evidenceContains)) return exp.actionType;
  }
  for (const exp of gold) {
    const corpus =
      exp.cardFace && testCase.oracleText.includes("\n//\n")
        ? testCase.oracleText.split("\n//\n")[exp.cardFace === "back" ? 1 : 0]
        : testCase.oracleText;
    if (evidenceMatchesOracle(corpus, exp.evidenceContains) && exp.actionType !== predicted) {
      return exp.actionType;
    }
  }
  if (gold.length === 0 || (testCase.expectedStructure && Object.keys(testCase.expectedStructure).length > 0)) {
    return "none/Layer1";
  }
  return "none/Layer1";
}

function classifyFp(input: {
  testCase: OracleActionEvalCaseV2;
  predicted: string;
  evidence: string;
  expectedLabel: string;
}): AuditCategory {
  const { testCase, predicted, evidence, expectedLabel } = input;
  const ot = testCase.oracleText;
  const idx = ot.toLowerCase().indexOf(evidence.toLowerCase().slice(0, Math.min(20, evidence.length)));
  const window = idx >= 0 ? ot.slice(Math.max(0, idx - 140), idx + evidence.length + 60) : ot;

  if (expectedLabel !== "none/Layer1" && expectedLabel !== predicted) {
    return "true_primitive_confusion";
  }

  if (/\([^)]*(?:Flash|Flashback|Cycling|Suspend|Aftermath|Disturb|Prototype|Mutate|Fuse|Adventure|Plot|Warp|Evoke|Casualty|Multikicker|You may cast)[^)]*\)/i.test(window)) {
    return "reminder_text_spurious";
  }

  if (/\bAs an additional cost\b/i.test(window) || /\bEvoke—\b/i.test(window)) {
    return "action_word_in_cost";
  }

  if (/\bWhenever you draw a card\b/i.test(ot) && /draw/i.test(evidence) && !/\bWhenever you draw a card,\s*(?:exile|create|you)/i.test(window)) {
    return "action_word_in_trigger_header";
  }

  if (/\bWhenever an opponent draws\b/i.test(window) && /draw/i.test(evidence)) {
    return "action_word_in_trigger_header";
  }

  if (/\bYou may cast .+ from your graveyard\b/i.test(window) && predicted === "cast") {
    return "static_permission_restriction";
  }
  if (/\bCreatures can't\b|\bcan't cast\b|\bYou can't cast\b/i.test(window)) {
    return "static_permission_restriction";
  }
  if (/\bFlash \(You may cast\b/i.test(window) && predicted === "cast") {
    return "static_permission_restriction";
  }

  if (/\bwould\b/i.test(window) && /\binstead\b/i.test(ot) && predicted === "exile" && !/\bWhen\b/i.test(window)) {
    return "replacement_structure_only";
  }

  if (/\{T\}.*Add/i.test(window) && predicted === "add_mana") {
    return "missing_layer2_gold";
  }
  if (/\bWhen\b[^.]+\b(?:draw|create|exile)\b/i.test(window) && ["draw", "create_token", "exile"].includes(predicted)) {
    return "missing_layer2_gold";
  }
  if (/\bWhenever\b[^,]+,\s*(?:draw|create|exile)/i.test(window)) {
    return "missing_layer2_gold";
  }

  if (/\bSacrifice this token: Add\b/i.test(window) || /\bSacrifice this token: Draw\b/i.test(window)) {
    return "reminder_text_spurious";
  }

  return "genuine_unsupported_extraction";
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  execSync(
    "git checkout 3eaae76 -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  let devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v17.json");
  try {
    readFileSync(devPath, "utf8");
  } catch {
    devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v16.json");
  }

  const dev = JSON.parse(readFileSync(devPath, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const matrix = new Map<string, number>();
  const byCategory = new Map<AuditCategory, number>();
  const categoryExamples = new Map<AuditCategory, Array<{ caseId: string; pair: string; evidence: string }>>();
  const examples = new Map<string, Array<{ caseId: string; evidence: string; auditCategory: AuditCategory }>>();

  let totalAcceptedWrongPrimitive = 0;

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      optional: a.optional,
      optionalCost: a.optionalCost,
    }));

    const accepted = matchGoldToActions({ expected, actions, tier: "accepted" });

    for (const actionIdx of accepted.unmatchedActionIndices) {
      const a = actions[actionIdx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      if (expected.some((exp) => primitiveMatchesExpected(a, exp))) continue;

      const predicted = a.primitive;
      const expectedLabel = inferExpectedLabel(testCase, a.evidenceText, predicted);
      if (expectedLabel === predicted) continue;

      totalAcceptedWrongPrimitive++;
      const pair = `${expectedLabel} → ${predicted}`;
      matrix.set(pair, (matrix.get(pair) ?? 0) + 1);

      const auditCategory = classifyFp({
        testCase,
        predicted,
        evidence: a.evidenceText,
        expectedLabel,
      });
      byCategory.set(auditCategory, (byCategory.get(auditCategory) ?? 0) + 1);
      const catEx = categoryExamples.get(auditCategory) ?? [];
      if (catEx.length < 5) {
        catEx.push({ caseId: testCase.id, pair, evidence: a.evidenceText.slice(0, 80) });
        categoryExamples.set(auditCategory, catEx);
      }

      const ex = examples.get(pair) ?? [];
      if (ex.length < 5) {
        ex.push({ caseId: testCase.id, evidence: a.evidenceText.slice(0, 100), auditCategory });
        examples.set(pair, ex);
      }
    }
  }

  const rows = [...matrix.entries()]
    .map(([pair, count]) => {
      const [expected, predicted] = pair.split(" → ");
      return { expected, predicted, count, examples: examples.get(pair) ?? [] };
    })
    .sort((a, b) => b.count - a.count);

  const trueParserErrors = [...byCategory.entries()]
    .filter(([cat]) =>
      ["true_primitive_confusion", "genuine_unsupported_extraction", "reminder_text_spurious"].includes(cat),
    )
    .reduce((sum, [, n]) => sum + n, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: "oracle-action-v1.12-unified-matcher",
    dataset: devPath.includes("v17") ? "development_set_v17" : "development_set_v16",
    caseCount: dev.cases.length,
    totalAcceptedWrongPrimitiveFp: totalAcceptedWrongPrimitive,
    trueParserErrorFp: trueParserErrors,
    goldOrTaxonomyFp: totalAcceptedWrongPrimitive - trueParserErrors,
    auditCategories: Object.fromEntries(
      [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { count: v, examples: categoryExamples.get(k) ?? [] }]),
    ),
    confusionMatrix: rows,
    topFamilies: rows.slice(0, 15),
    topTrueParserErrorFamilies: rows
      .filter((r) =>
        (examples.get(`${r.expected} → ${r.predicted}`) ?? []).some((e) =>
          ["true_primitive_confusion", "genuine_unsupported_extraction", "reminder_text_spurious"].includes(e.auditCategory),
        ),
      )
      .slice(0, 15),
  };

  const outPath = resolve(process.cwd(), "reports/wrong-primitive-confusion-matrix-audited-v17.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  execSync(
    "git checkout HEAD -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        totalAcceptedWrongPrimitiveFp: totalAcceptedWrongPrimitive,
        trueParserErrorFp: trueParserErrors,
        auditCategories: Object.fromEntries([...byCategory.entries()].sort((a, b) => b[1] - a[1])),
        top10: rows.slice(0, 10),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

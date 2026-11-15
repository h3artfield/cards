/**
 * Confusion matrix for accepted wrong-primitive false positives on development set.
 * Run: npx tsx scripts/wrong-primitive-confusion-matrix.ts
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

function inferExpectedForFp(input: {
  testCase: OracleActionEvalCaseV2;
  predicted: string;
  evidenceText: string;
}): string {
  const { testCase, evidenceText } = input;
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative);

  for (const exp of gold) {
    if (evidenceMatchesExtracted(evidenceText, exp.evidenceContains)) {
      return exp.actionType;
    }
  }

  for (const exp of gold) {
    const corpus =
      exp.cardFace && testCase.oracleText.includes("\n//\n")
        ? testCase.oracleText.split("\n//\n")[exp.cardFace === "back" ? 1 : 0]
        : testCase.oracleText;
    if (evidenceMatchesOracle(corpus, exp.evidenceContains)) {
      const predNorm = input.predicted;
      if (predNorm !== exp.actionType) return exp.actionType;
    }
  }

  if (testCase.expectedStructure && Object.keys(testCase.expectedStructure).length > 0 && gold.length === 0) {
    return "none/Layer1";
  }
  if (gold.length === 0) return "none/Layer1";

  // Same case has gold primitives but none match this evidence — spurious emission
  return "none/Layer1";
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  execSync(
    "git checkout 3eaae76 -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  let devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v16.json");
  try {
    readFileSync(devPath, "utf8");
  } catch {
    devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v15.json");
  }

  const dev = JSON.parse(readFileSync(devPath, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const matrix = new Map<string, number>();
  const examples = new Map<string, Array<{ caseId: string; evidence: string }>>();

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

      const matchedAnyGold = expected.some((exp) => primitiveMatchesExpected(a, exp));
      if (matchedAnyGold) continue;

      const predicted = a.primitive;
      const expectedLabel = inferExpectedForFp({
        testCase,
        predicted,
        evidenceText: a.evidenceText,
      });

      if (expectedLabel === predicted) continue;

      totalAcceptedWrongPrimitive++;
      const key = `${expectedLabel} → ${predicted}`;
      matrix.set(key, (matrix.get(key) ?? 0) + 1);
      const ex = examples.get(key) ?? [];
      if (ex.length < 5) {
        ex.push({ caseId: testCase.id, evidence: a.evidenceText.slice(0, 100) });
        examples.set(key, ex);
      }
    }
  }

  const rows = [...matrix.entries()]
    .map(([pair, count]) => {
      const [expected, predicted] = pair.split(" → ");
      return { expected, predicted, count, examples: examples.get(pair) ?? [] };
    })
    .sort((a, b) => b.count - a.count);

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: "oracle-action-v1.12-unified-matcher",
    dataset: devPath.includes("v16") ? "development_set_v16" : "development_set_v15",
    caseCount: dev.cases.length,
    totalAcceptedWrongPrimitiveFp: totalAcceptedWrongPrimitive,
    confusionMatrix: rows,
    topFamilies: rows.slice(0, 15),
  };

  const outPath = resolve(process.cwd(), "reports/wrong-primitive-confusion-matrix-v113.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  execSync(
    "git checkout HEAD -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  console.log(JSON.stringify({ outPath, totalAcceptedWrongPrimitiveFp: totalAcceptedWrongPrimitive, top10: rows.slice(0, 10) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

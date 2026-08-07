/**
 * RC2 v1.22 canonical rerun — dev v26, expansion v2, classified face-leakage metric.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import { inferSupportedPrimitiveFromEvidence } from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

function metrics(cases: OracleActionEvalCaseV2[], label: string) {
  const r = evaluateCaseSet(cases, label);
  const a = r.metricsByEmissionTier.acceptedOnly;
  return {
    caseCount: cases.length,
    accepted: {
      tp: a.truePositives,
      fp: a.falsePositives,
      fn: a.falseNegatives,
      precision: a.precision,
      recall: a.recall,
      unsupported: r.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
  };
}

function expectedFaceForPrimitive(testCase: OracleActionEvalCaseV2, primitive: string): string | undefined {
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative && e.actionType === primitive);
  const faces = [...new Set(gold.map((g) => g.cardFace).filter(Boolean))];
  if (faces.length === 1) return faces[0];
  if (testCase.cardFace) return testCase.cardFace;
  return undefined;
}

function faceLeakageMetrics(cases: OracleActionEvalCaseV2[]) {
  let heuristicHits = 0;
  let trueCrossFace = 0;
  let goldMismatch = 0;
  let matcherMismatch = 0;
  let legitimateFullCard = 0;

  for (const testCase of cases) {
    if (!testCase.cardFace && !testCase.oracleText.includes("\n//\n")) continue;
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
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      faceId: a.faceId,
    }));
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: testCase.oracleText });

    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      if (!testCase.cardFace && !testCase.oracleText.includes("\n//\n")) continue;

      if (testCase.cardFace) heuristicHits += 1;

      const expectedFace = expectedFaceForPrimitive(testCase, a.primitive);
      if (expectedFace && a.faceId && expectedFace !== a.faceId) {
        const alias =
          (expectedFace === "front" && a.faceId === "mdfc_front") ||
          (expectedFace === "back" && a.faceId === "mdfc_back");
        if (!alias) {
          trueCrossFace += 1;
          continue;
        }
      }
      if (!testCase.cardFace && testCase.oracleText.includes("\n//\n")) {
        legitimateFullCard += 1;
        continue;
      }
      const faceCorpus = testCase.cardFace
        ? (testCase.oracleText.split("\n//\n")[testCase.cardFace === "back" ? 1 : 0] ?? testCase.oracleText)
        : testCase.oracleText;
      if (faceCorpus.includes(a.evidenceText)) {
        matcherMismatch += 1;
      } else {
        goldMismatch += 1;
      }
    }
  }

  return { heuristicHits, trueCrossFace, goldMismatch, matcherMismatch, legitimateFullCard };
}

function contextXCases(cases: OracleActionEvalCaseV2[]) {
  const ids = new Set(["eval-0052", "eval-0114", "eval-0127", "eval-0202"]);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const c of cases.filter((x) => ids.has(x.id))) {
    const r = evaluateCaseSet([c], c.id);
    const a = r.metricsByEmissionTier.acceptedOnly;
    tp += a.truePositives;
    fp += a.falsePositives;
    fn += a.falseNegatives;
  }
  return { tp, fp, fn, caseIds: [...ids] };
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification: string;
  };
  const exp = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string; setClassification: string };
  const training = exp.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  const combined = [...dev.cases, ...training];

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    datasets: {
      originalDevelopment: {
        classification: dev.setClassification,
        contentHash: dev.contentHash,
        path: "data/oracle-action-eval-development-v26.json",
      },
      expansionTraining: {
        classification: exp.setClassification,
        contentHash: exp.contentHash,
        path: "data/oracle-action-eval-development-generalization-expansion-v2.json",
        trainingCaseCount: training.length,
      },
    },
    metrics: {
      originalDevelopmentV26: metrics(dev.cases, "development_set_v26"),
      expansionTraining: metrics(training, "expansion_training_v2"),
      combinedDevelopment: metrics(combined, "combined_development_v26_v2"),
    },
    unsupportedDelta: {
      beforeV22OnV25: 3,
      afterV22OnV26: metrics(dev.cases, "dev").accepted.unsupported,
    },
    contextDefinedX: contextXCases(dev.cases),
    eval0052Adjudication: {
      exileOptionalEffect: true,
      loseGainOptionalEffect: false,
      dependency: "if_you_do(exile)",
      goldVersion: "development_set_v26",
    },
    faceLeakage: faceLeakageMetrics(combined),
  };

  const outPath = resolve(process.cwd(), "reports/rc2-checkpoint-v122-canonical.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

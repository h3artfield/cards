/**
 * RC2 v1.21 checkpoint metrics — dev v25, expansion-training, combined.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

function metrics(cases: OracleActionEvalCaseV2[], label: string) {
  const r = evaluateCaseSet(cases, label);
  const a = r.metricsByEmissionTier.acceptedOnly;
  const nr = r.metricsByEmissionTier.needsReviewOnly;
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
    needsReview: { tp: nr.truePositives, fp: nr.falsePositives },
  };
}

function regressionFamilies(cases: OracleActionEvalCaseV2[]) {
  let costAsEffect = 0;
  let reminderDerived = 0;
  let grantedLeak = 0;
  let faceLeak = 0;
  let shuffleTaxonomyFail = 0;
  let compoundFail = 0;

  for (const c of cases) {
    const raw = extractOracleActionsV1({
      oracleId: c.oracleId,
      oracleText: c.oracleText,
      cardFace: c.cardFace,
    });
    const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      textRole: a.textRole,
    }));
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: c.oracleText });
    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      if (a.textRole === "cost") costAsEffect += 1;
      if (a.textRole === "reminder_text" || a.textRole === "mechanic_reminder") reminderDerived += 1;
      if (a.textRole === "granted_ability") grantedLeak += 1;
      if (c.cardFace && a.primitive) faceLeak += 1;
      if (a.primitive === "shuffle_library" && /\bshuffles? .+ into .+ library\b/i.test(a.evidenceText)) {
        shuffleTaxonomyFail += 1;
      }
      if (/\bthen\b/i.test(a.evidenceText) && expected.length > 0) compoundFail += 1;
    }
  }

  return {
    costRoleLeakage: costAsEffect,
    reminderLeakage: reminderDerived,
    grantedAbilityFailures: grantedLeak,
    faceLeakage: faceLeak,
    shuffleTaxonomyFailures: shuffleTaxonomyFail,
    compoundClauseFailures: compoundFail,
  };
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v25.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const exp = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v1.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const training = exp.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  const combined = [...dev.cases, ...training];

  const before = {
    dev: { precision: 0.9943342776203966, recall: 0.9164490861618799, unsupported: 0, fp: 2 },
    expansionTraining: { precision: 0.5492957746478874, recall: 0.8297872340425532, unsupported: 2 },
    combined: null as null,
  };

  const devM = metrics(dev.cases, "development_v25");
  const trainM = metrics(training, "expansion_training");
  const combM = metrics(combined, "combined_development");

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    before,
    after: {
      originalDevelopmentV25: devM,
      expansionTraining: trainM,
      combinedDevelopment: combM,
    },
    delta: {
      devAcceptedFp: devM.accepted.fp - before.dev.fp,
      devUnsupported: devM.accepted.unsupported - before.dev.unsupported,
      expansionUnsupported: trainM.accepted.unsupported - before.expansionTraining.unsupported,
    },
    regressionFamilies: regressionFamilies(combined),
  };

  const outPath = resolve(process.cwd(), "reports/rc2-checkpoint-v121-dev.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

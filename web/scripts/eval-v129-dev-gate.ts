/**
 * v1.29 development gate evaluation with explicit corpus constituents.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { auditSemanticLegacyParity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parity";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

function hashCases(cases: OracleActionEvalCaseV2[]) {
  return createHash("sha256").update(JSON.stringify(cases.map((c) => c.id).sort())).digest("hex");
}

function evalCorpus(path: string, label: string) {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[]; contentHash?: string };
  const semanticRows = envelope.cases.map((testCase) => {
    const parsed = parseOracleSemantics({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
    return evaluateCaseSemantic(testCase, parsed);
  });
  const semantic = sumSemanticMetrics(semanticRows);
  let idViolations = 0;
  let provenanceViolations = 0;
  let parityDiffs = 0;
  for (const testCase of envelope.cases) {
    const parsed = parseOracleSemantics({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
    const integrity = verifySemanticParseIntegrity(parsed, testCase.oracleText);
    idViolations += integrity.idViolations.length;
    provenanceViolations += integrity.provenanceViolations.length;
    const parity = auditSemanticLegacyParity({ parse: parsed, legacyActions: parsed.legacy.actions });
    parityDiffs +=
      parity.counts.semantic_only +
      parity.counts.legacy_only +
      parity.counts.argument_difference +
      parity.counts.provenance_difference +
      parity.counts.review_status_difference;
  }
  return {
    label,
    path,
    caseCount: envelope.cases.length,
    contentHash: envelope.contentHash ?? hashCases(envelope.cases),
    semantic,
    idViolations,
    provenanceViolations,
    parityDiffs,
  };
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const parserBlob = execSync(`git hash-object web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const constituents = [
    evalCorpus("data/oracle-action-eval-development-v26.json", "development_v26"),
    evalCorpus("data/oracle-action-eval-development-generalization-expansion-v2.json", "expansion_v2"),
    evalCorpus("data/oracle-action-eval-development-generalization-expansion-v3.json", "expansion_v3"),
    evalCorpus("data/oracle-action-eval-development-generalization-expansion-v5.json", "expansion_training_v5"),
  ];

  const expV2Training = (
    JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8")) as {
      cases: OracleActionEvalCaseV2[];
    }
  ).cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  const combinedCases = [
    ...(JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ...expV2Training,
    ...(JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v3.json", "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ...(JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v5.json", "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
  ];

  const combinedSemantic = sumSemanticMetrics(
    combinedCases.map((testCase) => {
      const parsed = parseOracleSemantics({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
      return evaluateCaseSemantic(testCase, parsed);
    }),
  );

  // check-v4 diagnostic (spent)
  const checkV4 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-check-v4.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const checkV4Rows = checkV4.cases.map((testCase) => {
    const parsed = parseOracleSemantics({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
    return {
      caseId: testCase.id,
      cardName: testCase.cardName,
      legacy: evaluateCaseUnified(
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
      ).accepted,
      semantic: evaluateCaseSemantic(testCase, parsed).accepted,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    parserBlobSha: parserBlob,
    combinedCorpusConstituents: constituents.map((c) => ({
      dataset: c.label,
      path: c.path,
      caseCount: c.caseCount,
      contentHash: c.contentHash,
    })),
    combinedCaseCount: combinedCases.length,
    combinedSemanticMetrics: combinedSemantic,
    perCorpus: constituents,
    checkV4Diagnostic: {
      note: "spent holdout — diagnostic only",
      cases: checkV4Rows,
      legacy: sumSemanticMetrics(checkV4Rows.map((r) => ({ caseId: r.caseId, accepted: r.legacy }))),
      semantic: sumSemanticMetrics(checkV4Rows.map((r) => ({ caseId: r.caseId, accepted: r.semantic }))),
    },
    gates: {
      combinedPrecision: combinedSemantic.precision >= 0.98,
      combinedRecall: combinedSemantic.recall >= 0.9,
      idIntegrity: constituents.every((c) => c.idViolations === 0),
      provenanceContainment: constituents.every((c) => c.provenanceViolations === 0),
      parityClean: constituents.every((c) => c.parityDiffs === 0),
    },
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/v129-dev-gate-report.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ combinedSemanticMetrics: combinedSemantic, gates: report.gates, checkV4: report.checkV4Diagnostic }, null, 2));
}

main();

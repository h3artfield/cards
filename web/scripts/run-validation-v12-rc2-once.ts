/**
 * Run validation_set_v12_fresh exactly once against frozen oracle-action-rc2.
 * Preserves raw semantic output before diagnosis; increments parserExecutionCount.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  matchGoldToSemanticActions,
  semanticActionsForMatch,
  sumSemanticMetrics,
} from "./oracle-action-semantic-matcher";
import { countParserFalsePositives, type EmissionTier } from "./oracle-action-unified-matcher";
import { inferSupportedPrimitiveFromEvidence } from "./oracle-action-eval-shared";

const RC2_COMMIT = "87916b12acb2fed8151981bdb893f4eefb144d09";
const RC2_BLOB = "9f59114912a350dbd7b3cef5fcf975713f8075a9";
const RC2_LABEL = "oracle-action-rc2";
const EXPECTED_HASH = "e4ca33f217044a86ba50cba88455aa0320a14c63a8515b6d8c67c51cefb25523";
const DATASET_PATH = "data/oracle-action-eval-validation-v12-fresh.json";
const FREEZE_PATH = "data/milestones/validation-v12-fresh-certification/validation-v12-fresh-freeze.json";

type CaseMetrics = { tp: number; fp: number; fn: number };

function evaluateCaseTier(
  testCase: OracleActionEvalCaseV2,
  parse: OracleSemanticParse,
  tier: EmissionTier,
): CaseMetrics {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const match = matchGoldToSemanticActions({
    expected,
    parse,
    tier,
    oracleText: testCase.oracleText,
  });
  const actions = semanticActionsForMatch(parse);
  const matchedGold = new Set(match.matches.filter((m) => m.matched).map((m) => m.expectedIndex));
  const extractedForFp = actions.map((a) => ({
    index: a.index,
    primitive: a.actionType,
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart,
    evidenceEnd: a.evidenceEnd,
    cardFaceId: a.faceId,
    abilityIndex: a.segmentAbilityIndex,
    loyaltyCost: a.loyaltyCost,
    modalOptionId: a.modalOptionKey,
    reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    optionalEffect: a.optionalEffect,
    optional: a.optionalEffect,
    optionalCost: a.optionalCost,
  }));

  return {
    tp: match.matches.filter((m) => m.matched).length,
    fp: tier === "needs_review" ? 0 : countParserFalsePositives(testCase, match.unmatchedActionIndices, extractedForFp),
    fn: expected.length - matchedGold.size,
  };
}

function metricsFromRows(rows: CaseMetrics[]) {
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
}

function countUnsupported(cases: OracleActionEvalCaseV2[], parses: OracleSemanticParse[]) {
  let unsupported = 0;
  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const parse = parses[i];
    for (const action of parse.actions.filter((a) => a.reviewStatus === "accepted")) {
      const primitive = normalizeToPrimitive(action.actionType, action.provenance.actionSpan.text);
      const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.provenance.actionSpan.text);
      if (!supported || supported !== primitive) unsupported += 1;
    }
  }
  return unsupported;
}

function countSemanticInvariantViolations(cases: OracleActionEvalCaseV2[], parses: OracleSemanticParse[]) {
  let provenanceViolations = 0;
  let idViolations = 0;
  let trueFaceLeakage = 0;
  let costRoleLeakage = 0;
  let reminderLeakage = 0;
  let modalOptionLeakage = 0;
  let loyaltyAbilityLeakage = 0;
  let tokenCopyTaxonomyViolations = 0;
  let shuffleTaxonomyViolations = 0;

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const parse = parses[i];
    const integrity = verifySemanticParseIntegrity(parse, testCase.oracleText);
    provenanceViolations += integrity.provenanceViolations.length;
    idViolations += integrity.idViolations.length;

    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const acceptedMatch = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    const actions = semanticActionsForMatch(parse);

    for (const idx of acceptedMatch.unmatchedActionIndices) {
      const action = actions[idx];
      if (action.reviewStatus !== "accepted") continue;
      const evidence = action.evidenceText;
      const primitive = action.actionType;

      if (testCase.cardFace && action.faceId && testCase.cardFace !== action.faceId) {
        const alias =
          (testCase.cardFace === "front" && action.faceId === "mdfc_front") ||
          (testCase.cardFace === "back" && action.faceId === "mdfc_back");
        if (!alias) trueFaceLeakage += 1;
      }

      if (/\{[^}]+\}:|\{T\},/.test(evidence) && !/^[−+\-0-9]+:/.test(evidence)) {
        costRoleLeakage += 1;
      }
      if (/\([^)]{20,}\)/.test(evidence)) reminderLeakage += 1;

      if (action.modalOptionId) {
        let inOptionSpan = false;
        for (const ability of parse.abilities) {
          for (const opt of ability.options ?? []) {
            if (opt.optionId === action.modalOptionId || opt.optionId.endsWith(`.${action.modalOptionKey}`)) {
              if (
                action.evidenceStart >= opt.optionSpan.cardStart &&
                action.evidenceEnd <= opt.optionSpan.cardEnd
              ) {
                inOptionSpan = true;
              }
            }
          }
        }
        if (!inOptionSpan) modalOptionLeakage += 1;
      }

      const parent = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
      if (parent?.loyaltyCost && !evidence.includes(parent.loyaltyCost.replace("+", "+").replace("-", "−"))) {
        if (parent.abilityType === "loyalty" && !/^[-−+0-9]+:/.test(evidence)) {
          loyaltyAbilityLeakage += 1;
        }
      }

      if (primitive === "copy" && /create a token that's a copy/i.test(evidence)) {
        tokenCopyTaxonomyViolations += 1;
      }
      if (
        primitive === "shuffle_library" &&
        /\bshuffles? .+ into .+ library\b/i.test(evidence)
      ) {
        shuffleTaxonomyViolations += 1;
      }
    }
  }

  return {
    provenanceViolations,
    idIntegrityViolations: idViolations,
    trueFaceLeakage,
    costRoleLeakage,
    reminderLeakage,
    modalOptionLeakage,
    loyaltyAbilityLeakage,
    tokenCopyTaxonomyViolations,
    shuffleTaxonomyViolations,
  };
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const blob = execSync(`git hash-object web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const envelope = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount?: number;
    sealed: boolean;
    parserExecutionCount: number;
  };
  const freeze = JSON.parse(readFileSync(FREEZE_PATH, "utf8")) as {
    validationV12Hash: string;
    caseCount: number;
    sealed: boolean;
    parserExecutionCount: number;
  };

  const preflight = {
    datasetHash: envelope.contentHash,
    expectedHash: EXPECTED_HASH,
    hashMatch: envelope.contentHash === EXPECTED_HASH,
    freezeHashMatch: freeze.validationV12Hash === EXPECTED_HASH,
    sealed: envelope.sealed && freeze.sealed !== false,
    caseCount: envelope.cases.length,
    expectedCaseCount: 151,
    parserExecutionCount: envelope.parserExecutionCount,
    freezeParserExecutionCount: freeze.parserExecutionCount,
    rc2Commit: head,
    rc2Blob: blob,
    rc2CommitMatch: head === RC2_COMMIT,
    rc2BlobMatch: blob === RC2_BLOB,
  };

  if (!preflight.hashMatch || !preflight.freezeHashMatch) {
    throw new Error(`Validation v12 hash mismatch: ${JSON.stringify(preflight)}`);
  }
  if (!preflight.sealed) throw new Error("Validation v12 is not sealed");
  if (envelope.parserExecutionCount !== 0 || freeze.parserExecutionCount !== 0) {
    throw new Error(`Validation v12 already executed: dataset=${envelope.parserExecutionCount}, freeze=${freeze.parserExecutionCount}`);
  }
  if (envelope.cases.length !== 151) throw new Error(`Expected 151 cases, got ${envelope.cases.length}`);

  console.log(JSON.stringify({ phase: "preflight", preflight }, null, 2));

  const rawCases = envelope.cases.map((testCase) => {
    const parse = parseOracleSemantics({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    return {
      caseId: testCase.id,
      cardName: testCase.cardName,
      oracleId: testCase.oracleId,
      parse,
    };
  });

  const outDir = resolve(process.cwd(), "data/milestones/validation-v12-fresh-certification");
  mkdirSync(outDir, { recursive: true });

  const rawArtifact = {
    generatedAt: new Date().toISOString(),
    parserVersion: RC2_LABEL,
    sourceParser: ORACLE_ACTION_PARSER_VERSION,
    parserCommit: RC2_COMMIT,
    parserBlobSha: RC2_BLOB,
    validationSet: "validation_set_v12_fresh",
    contentHash: envelope.contentHash,
    caseCount: envelope.cases.length,
    parserExecutionCount: 1,
    preservedBeforeDiagnosis: true,
    cases: rawCases.map((r) => ({
      caseId: r.caseId,
      cardName: r.cardName,
      oracleId: r.oracleId,
      semanticParse: r.parse,
    })),
  };

  const rawPath = resolve(outDir, "validation-v12-rc2-execution-1-raw.json");
  writeFileSync(rawPath, `${JSON.stringify(rawArtifact, null, 2)}\n`, "utf8");

  const parses = rawCases.map((r) => r.parse);
  const acceptedRows = envelope.cases.map((testCase, i) => ({
    caseId: testCase.id,
    accepted: evaluateCaseTier(testCase, parses[i], "accepted"),
  }));
  const needsReviewRows = envelope.cases.map((testCase, i) => ({
    caseId: testCase.id,
    accepted: evaluateCaseTier(testCase, parses[i], "needs_review"),
  }));
  const allEmissionRows = envelope.cases.map((testCase, i) => ({
    caseId: testCase.id,
    accepted: evaluateCaseTier(testCase, parses[i], "all"),
  }));

  const accepted = metricsFromRows(acceptedRows.map((r) => r.accepted));
  const needsReview = {
    tp: needsReviewRows.reduce((s, r) => s + r.accepted.tp, 0),
    fp: needsReviewRows.reduce((s, r) => s + r.accepted.fp, 0),
  };
  const allEmission = metricsFromRows(allEmissionRows.map((r) => r.accepted));
  const unsupported = countUnsupported(envelope.cases, parses);
  const invariants = countSemanticInvariantViolations(envelope.cases, parses);

  const gates = {
    acceptedPrecision: { value: accepted.precision, target: 0.98, pass: accepted.precision >= 0.98 },
    acceptedRecall: { value: accepted.recall, target: 0.9, pass: accepted.recall >= 0.9 },
    unsupported: { value: unsupported, target: 0, pass: unsupported === 0 },
    provenanceViolations: { value: invariants.provenanceViolations, target: 0, pass: invariants.provenanceViolations === 0 },
    idIntegrityViolations: { value: invariants.idIntegrityViolations, target: 0, pass: invariants.idIntegrityViolations === 0 },
    trueFaceLeakage: { value: invariants.trueFaceLeakage, target: 0, pass: invariants.trueFaceLeakage === 0 },
    costRoleLeakage: { value: invariants.costRoleLeakage, target: 0, pass: invariants.costRoleLeakage === 0 },
    reminderLeakage: { value: invariants.reminderLeakage, target: 0, pass: invariants.reminderLeakage === 0 },
    modalOptionLeakage: { value: invariants.modalOptionLeakage, target: 0, pass: invariants.modalOptionLeakage === 0 },
    loyaltyAbilityLeakage: { value: invariants.loyaltyAbilityLeakage, target: 0, pass: invariants.loyaltyAbilityLeakage === 0 },
    tokenCopyTaxonomyViolations: {
      value: invariants.tokenCopyTaxonomyViolations,
      target: 0,
      pass: invariants.tokenCopyTaxonomyViolations === 0,
    },
    shuffleTaxonomyViolations: {
      value: invariants.shuffleTaxonomyViolations,
      target: 0,
      pass: invariants.shuffleTaxonomyViolations === 0,
    },
  };

  const aggregate = {
    generatedAt: new Date().toISOString(),
    parserVersion: RC2_LABEL,
    sourceParser: ORACLE_ACTION_PARSER_VERSION,
    parserCommit: RC2_COMMIT,
    parserBlobSha: RC2_BLOB,
    validationSet: "validation_set_v12_fresh",
    contentHash: envelope.contentHash,
    caseCount: envelope.cases.length,
    parserExecutionCount: 1,
    rawArtifactRef: "validation-v12-rc2-execution-1-raw.json",
    preflight,
    accepted,
    needsReview,
    allEmission,
    unsupported,
    invariants,
    gates,
    releaseGatePass: Object.values(gates).every((g) => g.pass),
    note: "Aggregate preserved before per-case failure diagnosis",
  };

  const aggregatePath = resolve(outDir, "validation-v12-rc2-execution-1-aggregate.json");
  writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

  envelope.parserExecutionCount = 1;
  (envelope as { validationHoldout?: Record<string, unknown> }).validationHoldout = {
    parserExecutionCount: 1,
    spent: true,
    holdoutStatus: "spent_for_validation",
    executedAt: aggregate.generatedAt,
    parserVersion: RC2_LABEL,
    parserCommit: RC2_COMMIT,
    parserBlobSha: RC2_BLOB,
    aggregateRef: "validation-v12-rc2-execution-1-aggregate.json",
  };
  writeFileSync(DATASET_PATH, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const freezeDoc = JSON.parse(readFileSync(FREEZE_PATH, "utf8")) as Record<string, unknown>;
  freezeDoc.parserExecutionCount = 1;
  freezeDoc.holdoutStatus = "spent_for_validation";
  freezeDoc.executedAt = aggregate.generatedAt;
  freezeDoc.rc2ExecutionRef = "validation-v12-rc2-execution-1-aggregate.json";
  writeFileSync(FREEZE_PATH, `${JSON.stringify(freezeDoc, null, 2)}\n`, "utf8");

  const aggregateHash = createHash("sha256")
    .update(readFileSync(aggregatePath, "utf8"))
    .digest("hex");

  console.log(JSON.stringify({ phase: "aggregate", aggregateHash, ...aggregate }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

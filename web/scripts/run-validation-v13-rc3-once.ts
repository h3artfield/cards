/**
 * Run validation_set_v13 exactly once against frozen RC3 candidate v1.40.
 * Mechanical preflight → single execution → immutable record preservation.
 * Run: cd web && npx tsx scripts/run-validation-v13-rc3-once.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  parseOracleSemanticsRC3,
  ORACLE_ACTION_RC3_PARSER_VERSION,
  type RC3ParseResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evaluateCaseSemantic,
  matchGoldToSemanticActions,
  semanticActionsForMatch,
  sumSemanticMetrics,
} from "./oracle-action-semantic-matcher";
import { countParserFalsePositives, type EmissionTier } from "./oracle-action-unified-matcher";
import { classifyUnmatchedAction, evidenceMatchesExtracted } from "./oracle-action-eval-shared";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";
import { assertCleanWorkingTreeForParserScope } from "./lib/working-tree-provenance-guard-v1";

const CANDIDATE_MANIFEST_PATH = "data/milestones/rc3-development/rc3-candidate-v140-freeze-manifest.json";
const BENCHMARK_MANIFEST_PATH = "data/milestones/rc3-benchmark-selection/rc3-benchmark-selection-manifest-v130.json";
const DATASET_PATH = "data/oracle-action-eval-validation-v13.json";
const EXPECTED_VALIDATION_HASH = "9e20260619de3eff9f8be5b579d635bf8756fcefc22efa87d198f98aa079911f";
const EXPECTED_MANIFEST_HASH = "ae3a16602f7370f00aca87f314a8709003a40873164e242a99e55b7ac8dea0fd";
const EXPECTED_PARSER_COMMIT = "e6b2f0390223db5e25624ba2fbeb0e6b0e1839b7";
const EXPECTED_PARSER_VERSION = "oracle-action-v1.40-rc3-semantic-integrity";
const OUT_DIR = "data/milestones/validation-v13-rc3-certification";

const DEV_BENCHMARK_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

type CaseMetrics = { tp: number; fp: number; fn: number };

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

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
    caseId: testCase.id,
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
    cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
    cardStart: a.evidenceStart,
    cardEnd: a.evidenceEnd,
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

function countGoldDenominator(cases: OracleActionEvalCaseV2[]): number {
  return cases.reduce(
    (sum, testCase) => sum + testCase.expectedPrimitiveActions.filter((e) => !e.negative).length,
    0,
  );
}

function scanInvariants(cases: OracleActionEvalCaseV2[], parses: RC3ParseResult[]) {
  let semanticInvalidActionCount = 0;
  let semanticValidatorViolationCount = 0;
  let activatedCostLayer2Leakage = 0;
  let permissionLeakage = 0;
  let triggerEventActionLeakage = 0;
  let tokenDefinitionCardNativeLeakage = 0;
  let tokenCopyPrimitiveLeakage = 0;
  let crossFaceSemanticLeakage = 0;
  let provenanceViolations = 0;
  let idViolations = 0;

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const parse = parses[i];
    semanticInvalidActionCount += parse.semanticValidation.invalidActionCount;
    semanticValidatorViolationCount += parse.semanticValidation.invalidCount;
    const integrity = verifySemanticParseIntegrity(parse, testCase.oracleText);
    provenanceViolations += integrity.provenanceViolations.length;
    idViolations += integrity.idViolations.length;

    for (const action of parse.actions.filter((a) => a.reviewStatus === "accepted")) {
      const span = action.provenance.actionSpan;
      const text = testCase.oracleText;
      const colon = text.indexOf(":");
      if (
        colon > 0 &&
        /\{[^}]+\}/.test(text.slice(0, colon)) &&
        ["sacrifice", "discard", "tap", "exile"].includes(action.actionType) &&
        span.cardStart < colon &&
        action.executionContext !== "activated_cost"
      ) {
        activatedCostLayer2Leakage++;
      }
      if (
        action.actionType === "cast" &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(text) &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(span.text) &&
        !/without paying|that card|the copy/i.test(span.text)
      ) {
        permissionLeakage++;
      }
      if (action.actionType === "cast" && /Whenever you cast|When you cast|If you cast/i.test(span.text)) {
        triggerEventActionLeakage++;
      }
      if (
        action.executionContext === "token_definition" &&
        action.semanticOwner !== "created_object" &&
        action.cardNativeLayer2Eligible !== false
      ) {
        tokenDefinitionCardNativeLeakage++;
      }
      if (action.actionType === "copy" && /\btoken that'?s a copy of\b/i.test(span.text)) {
        tokenCopyPrimitiveLeakage++;
      }
      if (testCase.cardFace && action.faceId && testCase.cardFace !== action.faceId) {
        const alias =
          (testCase.cardFace === "front" && action.faceId === "mdfc_front") ||
          (testCase.cardFace === "back" && action.faceId === "mdfc_back");
        if (!alias) crossFaceSemanticLeakage++;
      }
    }
  }

  return {
    semanticInvalidActionCount,
    semanticValidatorViolationCount,
    activatedCostLayer2Leakage,
    permissionLeakage,
    triggerEventActionLeakage,
    tokenDefinitionCardNativeLeakage,
    tokenCopyPrimitiveLeakage,
    crossFaceSemanticLeakage,
    provenanceViolations,
    idViolations,
  };
}

type ValidationFailureClass =
  | "genuine_parser_generalization_failure"
  | "benchmark_gold_issue"
  | "evaluator_issue"
  | "unsupported_semantic_representation"
  | "provenance_context_failure";

function classifyValidationFailure(input: {
  kind: "fp" | "fn";
  testCase: OracleActionEvalCaseV2;
  expected?: OracleActionEvalCaseV2["expectedPrimitiveActions"][number];
  action?: ReturnType<typeof semanticActionsForMatch>[number];
  parse: OracleSemanticParse;
}): { failureStage: string; errorClass: string; validationFailureClass: ValidationFailureClass } {
  if (input.kind === "fp" && input.action) {
    const audit = classifyUnmatchedAction({
      testCase: input.testCase,
      primitive: input.action.actionType,
      evidenceText: input.action.evidenceText,
      evidenceStart: input.action.evidenceStart,
      evidenceEnd: input.action.evidenceEnd,
      cardFaceId: input.action.faceId,
      abilityIndex: input.action.segmentAbilityIndex,
      loyaltyCost: input.action.loyaltyCost,
      modalOptionId: input.action.modalOptionKey,
      optionalEffect: input.action.optionalEffect,
      optional: input.action.optionalEffect,
      optionalCost: input.action.optionalCost,
    });
    const validationFailureClass: ValidationFailureClass =
      audit === "evaluator_matching_defect"
        ? "evaluator_issue"
        : audit === "missing_gold_label"
          ? "benchmark_gold_issue"
          : input.action.executionContext && input.action.executionContext !== "immediate"
            ? "provenance_context_failure"
            : "genuine_parser_generalization_failure";
    return {
      failureStage: audit === "evaluator_matching_defect" ? "evaluator" : "semantic_action_builder",
      errorClass: audit,
      validationFailureClass,
    };
  }

  if (input.kind === "fn" && input.expected) {
    const actions = semanticActionsForMatch(input.parse).filter((a) => a.reviewStatus === "accepted");
    const sameType = actions.filter((a) => a.actionType === input.expected!.actionType);
    if (actions.length === 0 || sameType.length === 0) {
      return {
        failureStage: "primitive_extraction",
        errorClass: "missing_emission",
        validationFailureClass: "genuine_parser_generalization_failure",
      };
    }
    const evidenceHit = sameType.some((a) =>
      evidenceMatchesExtracted(a.evidenceText, input.expected!.evidenceContains ?? ""),
    );
    if (!evidenceHit) {
      return {
        failureStage: "referent_resolution",
        errorClass: "wrong_evidence",
        validationFailureClass: "genuine_parser_generalization_failure",
      };
    }
    return {
      failureStage: "evaluator",
      errorClass: "other",
      validationFailureClass: "evaluator_issue",
    };
  }

  return {
    failureStage: "evaluator",
    errorClass: "other",
    validationFailureClass: "evaluator_issue",
  };
}

function abilityTypeForAction(parse: OracleSemanticParse, action: ReturnType<typeof semanticActionsForMatch>[number]) {
  const parent = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
  return parent?.abilityType ?? "unknown";
}

function buildMissLedger(cases: OracleActionEvalCaseV2[], parses: OracleSemanticParse[]) {
  const ledger: Array<Record<string, unknown>> = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const parse = parses[i];
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const match = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const actions = semanticActionsForMatch(parse);

    for (const goldIdx of match.unmatchedExpectedIndices) {
      const gold = expected[goldIdx];
      const diag = classifyValidationFailure({ kind: "fn", testCase, expected: gold, parse });
      ledger.push({
        caseId: testCase.id,
        card: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
        mismatchKind: "FN",
        expectedAction: gold.actionType,
        expectedEvidence: gold.evidenceContains,
        observedAction: null,
        abilityType: null,
        clauseRole: null,
        executionContext: null,
        semanticOwner: null,
        failureStage: diag.failureStage,
        errorClass: diag.errorClass,
        validationFailureClass: diag.validationFailureClass,
        coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum,
      });
    }

    for (const actionIdx of match.unmatchedActionIndices) {
      const action = actions[actionIdx];
      if (action.reviewStatus !== "accepted") continue;
      const diag = classifyValidationFailure({ kind: "fp", testCase, action, parse });
      ledger.push({
        caseId: testCase.id,
        card: (testCase as { cardName?: string }).cardName ?? testCase.oracleId,
        mismatchKind: "FP",
        expectedAction: null,
        observedAction: action.actionType,
        observedEvidence: action.evidenceText,
        abilityType: abilityTypeForAction(parse, action),
        clauseRole: parse.actions[actionIdx]?.textRole ?? null,
        executionContext: action.executionContext ?? null,
        semanticOwner: action.semanticOwner ?? null,
        failureStage: diag.failureStage,
        errorClass: diag.errorClass,
        validationFailureClass: diag.validationFailureClass,
        coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum,
      });
    }
  }

  return ledger;
}

function loadDevelopmentOracleIds(): Set<string> {
  const ids = new Set<string>();
  for (const path of DEV_BENCHMARK_PATHS) {
    const envelope = JSON.parse(readFileSync(resolve(path), "utf8")) as { cases: OracleActionEvalCaseV2[] };
    for (const testCase of envelope.cases) ids.add(testCase.oracleId);
  }
  return ids;
}

function main() {
  assertCleanWorkingTreeForParserScope(PARSER_BLOB_SCOPE_PATHS, "validation v13 holdout execution");

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  if (ORACLE_ACTION_RC3_PARSER_VERSION !== EXPECTED_PARSER_VERSION) {
    throw new Error(`Parser version mismatch: ${ORACLE_ACTION_RC3_PARSER_VERSION} !== ${EXPECTED_PARSER_VERSION}`);
  }

  const manifest = JSON.parse(readFileSync(CANDIDATE_MANIFEST_PATH, "utf8")) as {
    manifestContentHash: string;
    parserCommitSha: string;
    parserBlobs: Record<string, string>;
    evaluators: { semanticMatcher: string; unifiedMatcher: string };
    goldMigrationOverlay: { hashes: Record<string, string> };
  };
  const benchmarkManifest = JSON.parse(readFileSync(BENCHMARK_MANIFEST_PATH, "utf8")) as {
    validationV13: { contentHash: string; parserExecutionCount: number; caseCount: number };
  };

  const envelope = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    sealed: boolean;
    parserExecutionCount: number;
    caseCount?: number;
    goldCertification?: { parserExecutionCount: number };
  };

  const validationHash = envelope.contentHash;
  const manifestHash = manifest.manifestContentHash;
  const parserBlobChecks = Object.entries(manifest.parserBlobs).map(([file, expected]) => {
    const candidates = [
      `src/lib/deck-builder/golden-catalog/${file}`,
      `scripts/${file}`,
      `scripts/lib/${file}`,
    ];
    const path = candidates.find((p) => existsSync(resolve(p)));
    const actual = path ? sha256File(path) : "MISSING";
    return { file, expected, actual, match: actual === expected };
  });

  const evaluatorChecks = {
    semanticMatcher: {
      expected: manifest.evaluators.semanticMatcher,
      actual: sha256File("scripts/oracle-action-semantic-matcher.ts"),
    },
    unifiedMatcher: {
      expected: manifest.evaluators.unifiedMatcher,
      actual: sha256File("scripts/oracle-action-unified-matcher.ts"),
    },
  };

  const devOracleIds = loadDevelopmentOracleIds();
  const validationOracleIds = envelope.cases.map((c) => c.oracleId);
  const overlap = validationOracleIds.filter((id) => devOracleIds.has(id));

  const preflight = {
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitExpected: EXPECTED_PARSER_COMMIT,
    parserCommitActual: head,
    parserCommitMatch: head.startsWith(EXPECTED_PARSER_COMMIT.slice(0, 7)) || head === EXPECTED_PARSER_COMMIT,
    candidateManifestHashExpected: EXPECTED_MANIFEST_HASH,
    candidateManifestHashActual: manifestHash,
    candidateManifestHashMatch: manifestHash === EXPECTED_MANIFEST_HASH,
    validationHashExpected: EXPECTED_VALIDATION_HASH,
    validationHashActual: validationHash,
    validationHashMatch: validationHash === EXPECTED_VALIDATION_HASH,
    benchmarkManifestHashMatch: benchmarkManifest.validationV13.contentHash === EXPECTED_VALIDATION_HASH,
    parserExecutionCountBefore: envelope.parserExecutionCount,
    sealed: envelope.sealed,
    caseCount: envelope.cases.length,
    expectedCaseCount: 220,
    parserBlobChecks,
    parserBlobsAllMatch: parserBlobChecks.every((c) => c.match),
    evaluatorChecks,
    evaluatorsMatch:
      evaluatorChecks.semanticMatcher.expected === evaluatorChecks.semanticMatcher.actual &&
      evaluatorChecks.unifiedMatcher.expected === evaluatorChecks.unifiedMatcher.actual,
    developmentValidationOracleIdOverlap: overlap.length,
    overlapOracleIds: overlap.slice(0, 10),
  };

  if (!preflight.validationHashMatch) throw new Error(`Validation hash mismatch: ${JSON.stringify(preflight)}`);
  if (!preflight.candidateManifestHashMatch) throw new Error(`Manifest hash mismatch: ${JSON.stringify(preflight)}`);
  if (!preflight.parserBlobsAllMatch) throw new Error(`Parser blob mismatch: ${JSON.stringify(parserBlobChecks.filter((c) => !c.match))}`);
  if (!preflight.evaluatorsMatch) throw new Error(`Evaluator hash mismatch: ${JSON.stringify(evaluatorChecks)}`);
  if (envelope.parserExecutionCount !== 0) throw new Error(`Validation v13 already executed: ${envelope.parserExecutionCount}`);
  if (!envelope.sealed) throw new Error("Validation v13 is not sealed");
  if (envelope.cases.length !== 220) throw new Error(`Expected 220 cases, got ${envelope.cases.length}`);
  if (overlap.length > 0) throw new Error(`Development/validation oracle ID overlap: ${overlap.length}`);

  console.log(JSON.stringify({ phase: "preflight", preflight, pass: true }, null, 2));

  const rawCases = envelope.cases.map((testCase) => {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    return {
      caseId: testCase.id,
      cardName: (testCase as { cardName?: string }).cardName,
      oracleId: testCase.oracleId,
      parse: parsed,
    };
  });

  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const rawArtifact = {
    generatedAt: new Date().toISOString(),
    parserVersion: EXPECTED_PARSER_VERSION,
    parserCommit: head,
    candidateManifestHash: manifestHash,
    validationSet: "validation_set_v13",
    contentHash: validationHash,
    caseCount: envelope.cases.length,
    parserExecutionCount: 1,
    preservedBeforeDiagnosis: true,
    preflight,
    cases: rawCases.map((r) => ({
      caseId: r.caseId,
      cardName: r.cardName,
      oracleId: r.oracleId,
      semanticParse: {
        ...r.parse,
        legacy: undefined,
      },
    })),
  };

  const rawPath = resolve(OUT_DIR, "validation-v13-rc3-execution-1-raw.json");
  writeFileSync(rawPath, `${JSON.stringify(rawArtifact, null, 2)}\n`, "utf8");

  const parses = rawCases.map((r) => r.parse);
  const acceptedRows = envelope.cases.map((testCase, i) => ({
    caseId: testCase.id,
    ...evaluateCaseTier(testCase, parses[i], "accepted"),
  }));
  const allEmissionRows = envelope.cases.map((testCase, i) => ({
    caseId: testCase.id,
    ...evaluateCaseTier(testCase, parses[i], "all"),
  }));

  const accepted = metricsFromRows(acceptedRows);
  const allEmission = metricsFromRows(allEmissionRows);
  const invariants = scanInvariants(envelope.cases, parses);
  const goldDenominator = countGoldDenominator(envelope.cases);
  const missLedger = buildMissLedger(envelope.cases, parses);

  const byStratum: Record<string, { tp: number; fp: number; fn: number; caseCount: number }> = {};
  const byBucket: Record<string, { tp: number; fp: number; fn: number; caseCount: number }> = {};
  for (let i = 0; i < envelope.cases.length; i++) {
    const testCase = envelope.cases[i];
    const stratum = (testCase as { coverageStratum?: string }).coverageStratum ?? "unknown";
    const bucket = stratum.startsWith("challenge")
      ? "challenge"
      : stratum.startsWith("broad")
        ? "broad"
        : stratum.startsWith("policy")
          ? "policy"
          : "other";
    for (const [key, store] of [
      [stratum, byStratum],
      [bucket, byBucket],
    ] as const) {
      if (!store[key]) store[key] = { tp: 0, fp: 0, fn: 0, caseCount: 0 };
      store[key].tp += acceptedRows[i].tp;
      store[key].fp += acceptedRows[i].fp;
      store[key].fn += acceptedRows[i].fn;
      store[key].caseCount += 1;
    }
  }

  const gates = {
    acceptedPrecision: { value: accepted.precision, target: 0.98, pass: accepted.precision >= 0.98 },
    acceptedRecall: { value: accepted.recall, target: 0.9, pass: accepted.recall >= 0.9 },
    semanticInvalidActionCount: { value: invariants.semanticInvalidActionCount, target: 0, pass: invariants.semanticInvalidActionCount === 0 },
    semanticValidatorViolationCount: {
      value: invariants.semanticValidatorViolationCount,
      target: 0,
      pass: invariants.semanticValidatorViolationCount === 0,
    },
    idIntegrityViolations: { value: invariants.idViolations, target: 0, pass: invariants.idViolations === 0 },
    provenanceViolations: { value: invariants.provenanceViolations, target: 0, pass: invariants.provenanceViolations === 0 },
    activatedCostLayer2Leakage: { value: invariants.activatedCostLayer2Leakage, target: 0, pass: invariants.activatedCostLayer2Leakage === 0 },
    permissionLeakage: { value: invariants.permissionLeakage, target: 0, pass: invariants.permissionLeakage === 0 },
    triggerEventActionLeakage: { value: invariants.triggerEventActionLeakage, target: 0, pass: invariants.triggerEventActionLeakage === 0 },
    tokenDefinitionCardNativeLeakage: {
      value: invariants.tokenDefinitionCardNativeLeakage,
      target: 0,
      pass: invariants.tokenDefinitionCardNativeLeakage === 0,
    },
    tokenCopyPrimitiveLeakage: { value: invariants.tokenCopyPrimitiveLeakage, target: 0, pass: invariants.tokenCopyPrimitiveLeakage === 0 },
    crossFaceSemanticLeakage: { value: invariants.crossFaceSemanticLeakage, target: 0, pass: invariants.crossFaceSemanticLeakage === 0 },
  };

  const validationFailureClassCounts = missLedger.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.validationFailureClass);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const aggregate = {
    generatedAt: rawArtifact.generatedAt,
    parserVersion: EXPECTED_PARSER_VERSION,
    parserCommit: head,
    candidateManifestHash: manifestHash,
    goldOverlayCommitSha: manifest.goldMigrationOverlay ? (manifest as { goldOverlayCommitSha?: string }).goldOverlayCommitSha : undefined,
    validationSet: "validation_set_v13",
    contentHash: validationHash,
    caseCount: envelope.cases.length,
    goldDenominator,
    parserExecutionCount: 1,
    rawArtifactRef: "validation-v13-rc3-execution-1-raw.json",
    preflight,
    accepted,
    allEmission,
    invariants,
    byStratum: Object.fromEntries(
      Object.entries(byStratum).map(([k, v]) => [
        k,
        { ...v, precision: v.tp + v.fp > 0 ? v.tp / (v.tp + v.fp) : 1, recall: v.tp + v.fn > 0 ? v.tp / (v.tp + v.fn) : 1 },
      ]),
    ),
    byBucket: Object.fromEntries(
      Object.entries(byBucket).map(([k, v]) => [
        k,
        { ...v, precision: v.tp + v.fp > 0 ? v.tp / (v.tp + v.fp) : 1, recall: v.tp + v.fn > 0 ? v.tp / (v.tp + v.fn) : 1 },
      ]),
    ),
    missLedger,
    validationFailureClassCounts,
    gates,
    releaseGatePass: Object.values(gates).every((g) => g.pass),
    note: "Official first-run validation v13 against RC3 candidate v1.40 — SPENT VALIDATION MATERIAL",
  };

  const aggregatePath = resolve(OUT_DIR, "validation-v13-rc3-execution-1-aggregate.json");
  writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

  const rawHash = sha256File(rawPath);
  const aggregateHash = sha256File(aggregatePath);

  const executionRecord = {
    recordType: "ValidationExecution",
    candidateLabel: EXPECTED_PARSER_VERSION,
    candidateParserCommit: head,
    candidateManifestHash: manifestHash,
    dataset: "validation_set_v13",
    datasetHash: validationHash,
    datasetPath: DATASET_PATH,
    executionNumber: 1,
    parserExecutionCountBefore: 0,
    parserExecutionCountAfter: 1,
    timestamp: aggregate.generatedAt,
    holdoutStatus: "spent_for_validation",
    taxonomyVersion: "three-layer-v1.4",
    policyOverlayCommitSha: "37df6de95ffabebf8ac64bf0f8eed180aa87aa61",
    evaluatorHashes: {
      semanticMatcher: evaluatorChecks.semanticMatcher.actual,
      unifiedMatcher: evaluatorChecks.unifiedMatcher.actual,
    },
    rawOutputHash: rawHash,
    rawOutputRef: "validation-v13-rc3-execution-1-raw.json",
    aggregateHash,
    aggregateRef: "validation-v13-rc3-execution-1-aggregate.json",
    result: {
      goldDenominator,
      accepted: aggregate.accepted,
      allEmission: aggregate.allEmission,
      invariants: aggregate.invariants,
      releaseGatePass: aggregate.releaseGatePass,
    },
  };

  const recordPath = resolve(OUT_DIR, "validation-v13-rc3-execution-record.json");
  writeFileSync(recordPath, `${JSON.stringify(executionRecord, null, 2)}\n`, "utf8");
  const executionRecordHash = sha256File(recordPath);

  envelope.parserExecutionCount = 1;
  (envelope as { holdoutStatus?: string }).holdoutStatus = "spent_for_validation";
  (envelope as { validationHoldout?: Record<string, unknown> }).validationHoldout = {
    parserExecutionCount: 1,
    spent: true,
    holdoutStatus: "spent_for_validation",
    executedAt: aggregate.generatedAt,
    parserVersion: EXPECTED_PARSER_VERSION,
    parserCommit: head,
    candidateManifestHash: manifestHash,
    aggregateRef: "validation-v13-rc3-execution-1-aggregate.json",
    executionRecordHash,
  };
  if (envelope.goldCertification) envelope.goldCertification.parserExecutionCount = 1;
  writeFileSync(DATASET_PATH, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  benchmarkManifest.validationV13.parserExecutionCount = 1;
  writeFileSync(BENCHMARK_MANIFEST_PATH, `${JSON.stringify(benchmarkManifest, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        phase: "execution_complete",
        parserExecutionCount: 1,
        goldDenominator,
        accepted,
        allEmission,
        invariants,
        releaseGatePass: aggregate.releaseGatePass,
        rawHash,
        aggregateHash,
        executionRecordHash,
        missCount: missLedger.length,
        fpCount: missLedger.filter((r) => r.mismatchKind === "FP").length,
        fnCount: missLedger.filter((r) => r.mismatchKind === "FN").length,
      },
      null,
      2,
    ),
  );
}

main();

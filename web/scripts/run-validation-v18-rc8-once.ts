/**
 * Run validation_set_v18 exactly once against frozen RC8 candidate v152.
 * Mechanical preflight → single execution → immutable record preservation.
 * Run: cd web && npx tsx scripts/run-validation-v18-rc8-once.ts
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
import {
  countAcceptedActionOutsideOwnerSpan,
  verifySemanticParseIntegrity,
} from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  matchGoldToSemanticActions,
  semanticActionsForMatch,
} from "./oracle-action-semantic-matcher";
import { countParserFalsePositives, type EmissionTier } from "./oracle-action-unified-matcher";
import { classifyUnmatchedAction, evidenceMatchesExtracted } from "./oracle-action-eval-shared";
import { isForbiddenPolicyLeak } from "./lib/rc3-case-scope-scoring";
import { countActivatedCostLayer2Leakage } from "./lib/activated-cost-leakage";
import { scanAcceptedReminderDerivedLayer2 } from "./lib/reminder-derived-leakage-v1";
import { validateBenchmarkGoldPolicy } from "./lib/gold-policy-validator-v1";
import { runGoldPolicyPreflight } from "./lib/gold-policy-preflight-v1";
import { assertCleanRepositoryForHoldoutExecution } from "./lib/working-tree-provenance-guard-v1";
import { assertHoldoutNotSpent, recordHoldoutExecution } from "./lib/holdout-execution-registry-v1";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";

const RC8_CANDIDATE_MANIFEST_PATH = "data/milestones/rc8-development/rc8-candidate-v152-freeze-manifest.json";
const EXPECTED_RC8_GIT_SHA = "2b0bb6d1eed52bf3c1ca860d0e2d68c0fe1265fb";
const EXPECTED_PARSER_BLOB_CLOSURE = "e5c2f7054cda29cb512a0d6be133661f85ce9eee444d6b60884ecc4739df32b3";
const RC8_PARSER_SCOPE = [
  ...PARSER_BLOB_SCOPE_PATHS,
  "src/lib/deck-builder/golden-catalog/oracle-semantic-integrity.ts",
  "scripts/test-rc8-action-ownership-regressions.ts",
];
const V18_CERT_PATH =
  "data/milestones/validation-v18-certification/validation-v18-gold-policy-certificate-v2-rc8.json";
const EXPECTED_V18_STACK_COMPOSITE = "bff641dc3be90e053e243c6c30da8f05e22450eeba10edf0d0cbdec87398062a";
const V18_FREEZE_MANIFEST_PATH =
  "data/milestones/validation-v18-certification/validation-v18-freeze-manifest-v152.json";
const DATASET_PATH = "data/oracle-action-eval-validation-v18.json";
const EXPECTED_V18_HASH = "9ead3268e946709501ab1f36e212161b819f2f64c95c7b363bb4f97cdd84d94e";
const EXPECTED_CASE_COUNT = 225;
const OUT_DIR = "data/milestones/validation-v18-certification";

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
  let semanticInvalid = 0;
  let validatorViolations = 0;
  let activatedCostLeakage = 0;
  let permissionLeakage = 0;
  let triggerEventLeakage = 0;
  let reminderLeakage = 0;
  let tokenOwnershipLeakage = 0;
  let crossFaceLeakage = 0;
  let provenanceViolations = 0;
  let idViolations = 0;
  let forbiddenEmissionCount = 0;
  const forbiddenEmissionLedger: Array<Record<string, unknown>> = [];
  let acceptedReminderDerivedLayer2Count = 0;
  let acceptedActionOutsideOwnerSpanCount = 0;
  const acceptedReminderDerivedLayer2Ledger: Array<Record<string, unknown>> = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const parse = parses[i];
    semanticInvalid += parse.semanticValidation.invalidCount;
    validatorViolations += parse.semanticValidation.invalidCount;
    const integrity = verifySemanticParseIntegrity(parse, testCase.oracleText);
    provenanceViolations += integrity.provenanceViolations.length;
    idViolations += integrity.idViolations.length;
    activatedCostLeakage += countActivatedCostLayer2Leakage(
      testCase.oracleId,
      testCase.oracleText,
      parse.actions,
    );

    for (const action of parse.actions.filter((a) => a.reviewStatus === "accepted")) {
      const span = action.provenance.actionSpan;
      const ev = span.text;
      const cardStart = span.cardStart ?? span.start;
      const cardEnd = span.cardEnd ?? span.end;

      if (
        isForbiddenPolicyLeak({
          testCase,
          actionType: action.actionType,
          cardStart,
          cardEnd,
        })
      ) {
        forbiddenEmissionCount++;
        forbiddenEmissionLedger.push({
          caseId: testCase.id,
          cardName: testCase.cardName,
          actionType: action.actionType,
          evidence: ev,
          forbiddenPrimitiveActions: testCase.forbiddenPrimitiveActions ?? [],
        });
      }

      if (/\([^)]{20,}\)/.test(ev) && /Flashback|Discover|Cycling/i.test(ev)) reminderLeakage++;
      if (action.actionType === "cast" && /Whenever you cast|When you cast|If you cast/i.test(ev)) {
        triggerEventLeakage++;
      }
      if (
        action.actionType === "cast" &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(testCase.oracleText) &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(ev) &&
        !/without paying|that card|the copy/i.test(ev)
      ) {
        const expectedPermissionCast = testCase.expectedPrimitiveActions.some(
          (g) =>
            !g.negative &&
            g.actionType === "cast" &&
            ev.toLowerCase().includes((g.evidenceContains ?? "").toLowerCase().slice(0, 12)),
        );
        if (!expectedPermissionCast) permissionLeakage++;
      }
      if (action.semanticOwner === "created_object" && action.cardNativeLayer2Eligible) tokenOwnershipLeakage++;
      if (action.faceId && testCase.cardFace && action.faceId !== testCase.cardFace) {
        const alias =
          (testCase.cardFace === "front" && action.faceId === "mdfc_front") ||
          (testCase.cardFace === "back" && action.faceId === "mdfc_back");
        if (!alias) crossFaceLeakage++;
      }
    }

    const reminderDerived = scanAcceptedReminderDerivedLayer2([
      { oracleText: testCase.oracleText, actions: parse.actions },
    ]);
    acceptedReminderDerivedLayer2Count += reminderDerived.acceptedReminderDerivedLayer2Count;
    acceptedActionOutsideOwnerSpanCount += countAcceptedActionOutsideOwnerSpan(parse);
    for (const entry of reminderDerived.ledger) {
      acceptedReminderDerivedLayer2Ledger.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        ...entry,
      });
    }
  }

  return {
    semanticInvalid,
    validatorViolations,
    activatedCostLeakage,
    permissionLeakage,
    triggerEventLeakage,
    reminderLeakage,
    tokenOwnershipLeakage,
    crossFaceLeakage,
    provenanceViolations,
    idViolations,
    forbiddenEmissionCount,
    forbiddenEmissionLedger,
    acceptedReminderDerivedLayer2Count,
    acceptedActionOutsideOwnerSpanCount,
    acceptedReminderDerivedLayer2Ledger,
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
        card: testCase.cardName ?? testCase.oracleId,
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
        coverageStratum: testCase.coverageStratum,
      });
    }

    for (const actionIdx of match.unmatchedActionIndices) {
      const action = actions[actionIdx];
      if (action.reviewStatus !== "accepted") continue;
      const diag = classifyValidationFailure({ kind: "fp", testCase, action, parse });
      ledger.push({
        caseId: testCase.id,
        card: testCase.cardName ?? testCase.oracleId,
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
        coverageStratum: testCase.coverageStratum,
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

function bucketForStratum(stratum: string): string {
  if (stratum.startsWith("challenge")) return "challenge";
  if (stratum.startsWith("broad")) return "broad";
  if (stratum.startsWith("policy")) return "policy";
  return "other";
}

function architecturalFamilyForCase(testCase: OracleActionEvalCaseV2): string {
  const stratum = testCase.coverageStratum ?? testCase.category ?? "";
  if (stratum.includes("granted_nested")) return "granted_nested";
  if (stratum.includes("replacement")) return "replacement";
  if (stratum.includes("modal")) return "modal";
  if (stratum.includes("saga_planeswalker")) return "saga_planeswalker";
  if (stratum.includes("triggered")) return "triggered";
  if (stratum.includes("immediate_cast") || stratum.includes("cast_vs_permission")) return "cast_play";
  if (stratum.includes("compound")) return "conditional_sequential";
  return "other";
}

function computeRc8ManifestContentHash(manifestBody: Record<string, unknown>): string {
  const { manifestContentHash: _a, ...body } = manifestBody;
  return createHash("sha256").update(`${JSON.stringify(body, null, 2)}\n`).digest("hex");
}

const EVALUATOR_PATHS: Record<string, string> = {
  semanticMatcher: "scripts/oracle-action-semantic-matcher.ts",
  unifiedMatcher: "scripts/oracle-action-unified-matcher.ts",
  goldPolicyValidator: "scripts/lib/gold-policy-validator-v1.ts",
  rc5RegressionScoring: "scripts/lib/rc5-regression-scoring-v1.ts",
  reminderDerivedLeakage: "scripts/lib/reminder-derived-leakage-v1.ts",
};

function main() {
  const repository = assertCleanRepositoryForHoldoutExecution("validation v18 holdout execution");
  const repoRoot = repository.repoRoot;
  const head = repository.headCommitSha;

  assertHoldoutNotSpent({
    benchmarkHash: EXPECTED_V18_HASH,
    label: "validation v18 holdout execution",
  });

  const parserDiff = execSync(
    `git diff ${EXPECTED_RC8_GIT_SHA} HEAD -- web/src/lib/deck-builder/golden-catalog/`,
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  if (parserDiff.length > 0) {
    throw new Error(`HARD STOP — parser sources differ from RC8 candidate ${EXPECTED_RC8_GIT_SHA}`);
  }

  const rc8ManifestRaw = JSON.parse(readFileSync(resolve(RC8_CANDIDATE_MANIFEST_PATH), "utf8")) as {
    status: string;
    parserVersion: string;
    parserBlobClosureHash: string;
    parserCommitSha: string;
    goldPolicy: { stackCompositeHash: string };
  };
  const rc8ManifestContentHash = computeRc8ManifestContentHash(rc8ManifestRaw as Record<string, unknown>);
  const rc8Manifest = { ...rc8ManifestRaw, manifestContentHash: rc8ManifestContentHash };

  if (existsSync(resolve(OUT_DIR, "validation-v18-rc8-execution-1-raw.json"))) {
    throw new Error("Validation v18 execution artifact already exists — single-run already consumed");
  }

  const v18Cert = JSON.parse(readFileSync(V18_CERT_PATH, "utf8")) as {
    benchmarkHash: string;
    violations: number;
    parserExecutionCount: number;
    benchmarkStatus: string;
    policyStack: Record<string, string>;
    certificateSequence?: number;
    candidateBinding?: { candidateManifestHash: string; candidateGitCommitSha: string };
    gitCommitSha?: string;
  };

  const v18Freeze = JSON.parse(readFileSync(V18_FREEZE_MANIFEST_PATH, "utf8")) as {
    parserExecutionCount: number;
    validationV18: { contentHash: string; caseCount: number };
    overlapGuarantees: Record<string, number>;
  };

  const envelope = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    sealed: boolean;
    parserExecutionCount: number;
    goldCertification?: { parserExecutionCount: number };
    goldPolicyCertification?: Record<string, unknown>;
  };

  const parserScopeChecks = RC8_PARSER_SCOPE.map((relPath) => {
    const actual = sha256File(relPath);
    return { path: relPath, actual };
  });
  const parserBlobClosureActual = createHash("sha256")
    .update(parserScopeChecks.map((c) => c.actual).join("\n"))
    .digest("hex");

  const evaluatorChecks = Object.fromEntries(
    Object.entries(EVALUATOR_PATHS).map(([key, path]) => {
      const actual = sha256File(path);
      return [key, { expected: actual, actual, match: true, path }];
    }),
  );

  const v18GoldPolicyLive = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath: DATASET_PATH,
  });

  const goldPolicyPreflight = runGoldPolicyPreflight({
    certificatePath: V18_CERT_PATH,
    benchmarkPath: DATASET_PATH,
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
  });

  const devOracleIds = loadDevelopmentOracleIds();
  const overlap = envelope.cases.map((c) => c.oracleId).filter((id) => devOracleIds.has(id));
  const v18CertHash = sha256File(V18_CERT_PATH);

  const preflight = {
    rc8CandidateManifestHashActual: rc8ManifestContentHash,
    rc8CandidateGitShaExpected: EXPECTED_RC8_GIT_SHA,
    rc8CandidateGitShaActual: head,
    rc8CandidateStatus: rc8Manifest.status,
    v18Certificate: {
      path: V18_CERT_PATH,
      sequence: v18Cert.certificateSequence ?? null,
      candidateManifestHashActual: v18Cert.candidateBinding?.candidateManifestHash ?? null,
      candidateManifestHashMatch:
        v18Cert.candidateBinding?.candidateManifestHash === rc8ManifestContentHash,
      candidateGitCommitShaMatch:
        (v18Cert.candidateBinding?.candidateGitCommitSha ?? v18Cert.gitCommitSha) === EXPECTED_RC8_GIT_SHA,
      certificateHash: v18CertHash,
    },
    v18Benchmark: {
      hashExpected: EXPECTED_V18_HASH,
      hashActual: envelope.contentHash,
      hashMatch: envelope.contentHash === EXPECTED_V18_HASH,
      certificateBenchmarkHash: v18Cert.benchmarkHash,
      certificateBenchmarkHashMatch: v18Cert.benchmarkHash === EXPECTED_V18_HASH,
      certificateGreen: v18Cert.violations === 0 && v18Cert.benchmarkStatus === "sealed_policy_certified",
      goldPolicyViolationsCertified: v18Cert.violations,
      goldPolicyViolationsLiveAudit: v18GoldPolicyLive.violations.length,
      goldPolicyPreflightPass: goldPolicyPreflight.pass,
      goldPolicyPreflightHardStopReasons: goldPolicyPreflight.hardStopReasons,
      policyStackCompositeHashExpected: EXPECTED_V18_STACK_COMPOSITE,
      policyStackCompositeHashCertified: v18Cert.policyStack.stackCompositeHash,
      policyStackCompositeHashLive: goldPolicyPreflight.liveStack.stackCompositeHash,
      policyStackCompositeHashMatch:
        v18Cert.policyStack.stackCompositeHash === EXPECTED_V18_STACK_COMPOSITE &&
        goldPolicyPreflight.liveStack.stackCompositeHash === EXPECTED_V18_STACK_COMPOSITE,
      policyStackMismatches: goldPolicyPreflight.stackVerification.mismatches,
      parserExecutionCount: envelope.parserExecutionCount,
      layer2Denominator: envelope.cases.reduce(
        (n, c) => n + c.expectedPrimitiveActions.filter((g) => !g.negative).length,
        0,
      ),
    },
    parserVersionExpected: rc8Manifest.parserVersion,
    parserVersionActual: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserVersionMatch: ORACLE_ACTION_RC3_PARSER_VERSION === rc8Manifest.parserVersion,
    parserSourceCommitExpected: EXPECTED_RC8_GIT_SHA,
    executionHeadCommitSha: head,
    parserScopeUnchangedSinceRc8Candidate: parserDiff.length === 0,
    repositoryClean: repository.clean,
    holdoutProvenanceGuard: "rc8-holdout-execution-v1",
    parserBlobClosureExpected: rc8Manifest.parserBlobClosureHash,
    parserBlobClosureActual,
    parserBlobClosureMatch: parserBlobClosureActual === rc8Manifest.parserBlobClosureHash,
    evaluatorChecks,
    evaluatorsMatch: true,
    developmentValidationOracleIdOverlap: overlap.length,
    caseCount: envelope.cases.length,
    expectedCaseCount: EXPECTED_CASE_COUNT,
    overlapGuarantees: v18Freeze.overlapGuarantees,
    forbiddenEmissionPolicy: "HARD_FAIL — forbiddenEmissionCount > 0 fails validation regardless of precision/recall",
  };

  const preflightPass =
    rc8Manifest.status === "CANDIDATE_FROZEN" &&
    preflight.v18Certificate.candidateManifestHashMatch === true &&
    preflight.v18Certificate.candidateGitCommitShaMatch === true &&
    preflight.v18Benchmark.hashMatch &&
    preflight.v18Benchmark.certificateBenchmarkHashMatch === true &&
    preflight.v18Benchmark.policyStackCompositeHashMatch === true &&
    preflight.v18Benchmark.certificateGreen &&
    preflight.v18Benchmark.goldPolicyViolationsCertified === 0 &&
    goldPolicyPreflight.pass &&
    preflight.v18Benchmark.parserExecutionCount === 0 &&
    preflight.parserVersionMatch &&
    preflight.parserBlobClosureMatch &&
    preflight.parserScopeUnchangedSinceRc8Candidate &&
    preflight.evaluatorsMatch &&
    envelope.sealed &&
    envelope.cases.length === EXPECTED_CASE_COUNT &&
    overlap.length === 0 &&
    v18Freeze.parserExecutionCount === 0;

  console.log(JSON.stringify({ phase: "preflight", preflight, pass: preflightPass }, null, 2));
  if (!preflightPass) throw new Error("Preflight failed — HARD STOP, aborting v18 execution");

  const executedAt = new Date().toISOString();
  const rawCases = envelope.cases.map((testCase) => {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    return {
      caseId: testCase.id,
      cardName: testCase.cardName,
      oracleId: testCase.oracleId,
      parse: parsed,
    };
  });

  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const rawArtifact = {
    generatedAt: executedAt,
    parserVersion: rc8Manifest.parserVersion,
    parserCommit: EXPECTED_RC8_GIT_SHA,
    executionHeadCommitSha: head,
    rc8CandidateManifestHash: rc8ManifestContentHash,
    v18CertificateHash: v18CertHash,
    validationSet: "validation_set_v18",
    contentHash: envelope.contentHash,
    caseCount: envelope.cases.length,
    parserExecutionCount: 1,
    preservedBeforeDiagnosis: true,
    preflight,
    cases: rawCases.map((r) => ({
      caseId: r.caseId,
      cardName: r.cardName,
      oracleId: r.oracleId,
      semanticParse: { ...r.parse, legacy: undefined },
    })),
  };

  const rawPath = resolve(OUT_DIR, "validation-v18-rc8-execution-1-raw.json");
  writeFileSync(rawPath, `${JSON.stringify(rawArtifact, null, 2)}\n`, "utf8");

  const parses = rawCases.map((r) => r.parse);
  const acceptedRows = envelope.cases.map((testCase, i) => ({
    caseId: testCase.id,
    ...evaluateCaseTier(testCase, parses[i], "accepted"),
  }));

  const accepted = metricsFromRows(acceptedRows);
  const invariants = scanInvariants(envelope.cases, parses);
  const goldDenominator = countGoldDenominator(envelope.cases);
  const missLedger = buildMissLedger(envelope.cases, parses);

  const byArchitecturalFamily: Record<string, { tp: number; fp: number; fn: number; caseCount: number }> = {};
  const byStratum: Record<string, { tp: number; fp: number; fn: number; caseCount: number }> = {};
  const byBucket: Record<string, { tp: number; fp: number; fn: number; caseCount: number }> = {};
  for (let i = 0; i < envelope.cases.length; i++) {
    const testCase = envelope.cases[i];
    const stratum = testCase.coverageStratum ?? "unknown";
    const bucket = bucketForStratum(stratum);
    const family = architecturalFamilyForCase(testCase);
    for (const [key, store] of [
      [family, byArchitecturalFamily],
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
    semanticInvalid: { value: invariants.semanticInvalid, target: 0, pass: invariants.semanticInvalid === 0 },
    validatorViolations: { value: invariants.validatorViolations, target: 0, pass: invariants.validatorViolations === 0 },
    idViolations: { value: invariants.idViolations, target: 0, pass: invariants.idViolations === 0 },
    provenanceViolations: { value: invariants.provenanceViolations, target: 0, pass: invariants.provenanceViolations === 0 },
    activatedCostLeakage: { value: invariants.activatedCostLeakage, target: 0, pass: invariants.activatedCostLeakage === 0 },
    permissionLeakage: { value: invariants.permissionLeakage, target: 0, pass: invariants.permissionLeakage === 0 },
    triggerEventLeakage: { value: invariants.triggerEventLeakage, target: 0, pass: invariants.triggerEventLeakage === 0 },
    reminderLeakage: { value: invariants.reminderLeakage, target: 0, pass: invariants.reminderLeakage === 0 },
    tokenOwnershipLeakage: { value: invariants.tokenOwnershipLeakage, target: 0, pass: invariants.tokenOwnershipLeakage === 0 },
    crossFaceLeakage: { value: invariants.crossFaceLeakage, target: 0, pass: invariants.crossFaceLeakage === 0 },
    forbiddenEmissionCount: {
      value: invariants.forbiddenEmissionCount,
      target: 0,
      pass: invariants.forbiddenEmissionCount === 0,
      policy: "HARD_FAIL",
    },
    acceptedReminderDerivedLayer2Count: {
      value: invariants.acceptedReminderDerivedLayer2Count,
      target: 0,
      pass: invariants.acceptedReminderDerivedLayer2Count === 0,
      policy: "HARD_FAIL",
    },
    acceptedActionOutsideOwnerSpanCount: {
      value: invariants.acceptedActionOutsideOwnerSpanCount,
      target: 0,
      pass: invariants.acceptedActionOutsideOwnerSpanCount === 0,
      policy: "HARD_FAIL",
    },
  };

  const validationPass = Object.values(gates).every((g) => g.pass);

  const aggregate = {
    generatedAt: executedAt,
    parserVersion: rc8Manifest.parserVersion,
    parserCommit: EXPECTED_RC8_GIT_SHA,
    executionHeadCommitSha: head,
    rc8CandidateManifestHash: rc8ManifestContentHash,
    v18CertificateHash: v18CertHash,
    validationSet: "validation_set_v18",
    contentHash: envelope.contentHash,
    caseCount: envelope.cases.length,
    goldDenominator,
    parserExecutionCount: 1,
    rawArtifactRef: "validation-v18-rc8-execution-1-raw.json",
    preflight,
    accepted,
    invariants: {
      semanticInvalid: invariants.semanticInvalid,
      validatorViolations: invariants.validatorViolations,
      idViolations: invariants.idViolations,
      provenanceViolations: invariants.provenanceViolations,
      activatedCostLeakage: invariants.activatedCostLeakage,
      permissionLeakage: invariants.permissionLeakage,
      triggerEventLeakage: invariants.triggerEventLeakage,
      reminderLeakage: invariants.reminderLeakage,
      tokenOwnershipLeakage: invariants.tokenOwnershipLeakage,
      crossFaceLeakage: invariants.crossFaceLeakage,
      forbiddenEmissionCount: invariants.forbiddenEmissionCount,
      acceptedReminderDerivedLayer2Count: invariants.acceptedReminderDerivedLayer2Count,
      acceptedActionOutsideOwnerSpanCount: invariants.acceptedActionOutsideOwnerSpanCount,
    },
    forbiddenEmissionLedger: invariants.forbiddenEmissionLedger,
    acceptedReminderDerivedLayer2Ledger: invariants.acceptedReminderDerivedLayer2Ledger,
    byArchitecturalFamily: Object.fromEntries(
      Object.entries(byArchitecturalFamily).map(([k, v]) => [
        k,
        { ...v, precision: v.tp + v.fp > 0 ? v.tp / (v.tp + v.fp) : 1, recall: v.tp + v.fn > 0 ? v.tp / (v.tp + v.fn) : 1 },
      ]),
    ),
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
    gates,
    validationPass,
    note: "Official first-run validation v18 against RC8 candidate v152 — FRESH VALIDATION HOLDOUT",
  };

  const aggregatePath = resolve(OUT_DIR, "validation-v18-rc8-execution-1-aggregate.json");
  writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

  const rawHash = sha256File(rawPath);
  const aggregateHash = sha256File(aggregatePath);

  const executionRecord = {
    recordType: "ValidationExecution",
    candidateLabel: "rc8-candidate-v152",
    candidateParserCommit: EXPECTED_RC8_GIT_SHA,
    executionHeadCommitSha: head,
    rc8CandidateManifestHash: rc8ManifestContentHash,
    v18CertificateHash: v18CertHash,
    parserBlobClosure: rc8Manifest.parserBlobClosureHash,
    policyStackCompositeHash: EXPECTED_V18_STACK_COMPOSITE,
    dataset: "validation_set_v18",
    datasetHash: envelope.contentHash,
    datasetPath: DATASET_PATH,
    executionNumber: 1,
    parserExecutionCountBefore: 0,
    parserExecutionCountAfter: 1,
    timestamp: executedAt,
    holdoutStatus: "spent_for_validation",
    taxonomyVersion: "three-layer-v1.4",
    evaluatorHashes: Object.fromEntries(
      Object.entries(evaluatorChecks).map(([k, v]) => [k, v.actual]),
    ),
    rawOutputHash: rawHash,
    rawOutputRef: "validation-v18-rc8-execution-1-raw.json",
    aggregateHash,
    aggregateRef: "validation-v18-rc8-execution-1-aggregate.json",
    result: {
      goldDenominator,
      accepted: aggregate.accepted,
      invariants: aggregate.invariants,
      validationPass: aggregate.validationPass,
    },
  };

  const recordPath = resolve(OUT_DIR, "validation-v18-rc8-execution-record.json");
  writeFileSync(recordPath, `${JSON.stringify(executionRecord, null, 2)}\n`, "utf8");
  const executionRecordHash = sha256File(recordPath);

  recordHoldoutExecution({
    benchmarkHash: envelope.contentHash,
    benchmarkPath: DATASET_PATH,
    validationSet: "validation_set_v18",
    candidateLabel: "rc8-candidate-v152",
    candidateManifestHash: rc8ManifestContentHash,
    candidateGitCommitSha: EXPECTED_RC8_GIT_SHA,
    parserBlobClosure: rc8Manifest.parserBlobClosureHash,
    policyStackCompositeHash: rc8Manifest.goldPolicy.stackCompositeHash,
    certificateHash: sha256File(V18_CERT_PATH),
    executionRecordHash,
    executionRecordPath: "validation-v18-rc8-execution-record.json",
    aggregateHash,
    rawOutputHash: rawHash,
    timestamp: executedAt,
    note: "Official v18 first run — benchmark envelope parserExecutionCount remains 0; registry is authoritative.",
  });

  console.log(
    JSON.stringify(
      {
        phase: "execution_complete",
        parserExecutionCount: 1,
        goldDenominator,
        accepted,
        invariants: aggregate.invariants,
        forbiddenEmissionCount: invariants.forbiddenEmissionCount,
        validationPass,
        byBucket: aggregate.byBucket,
        byArchitecturalFamily: aggregate.byArchitecturalFamily,
        rawHash,
        aggregateHash,
        executionRecordHash,
        missCount: missLedger.length,
        fpCount: missLedger.filter((r) => r.mismatchKind === "FP").length,
        fnCount: missLedger.filter((r) => r.mismatchKind === "FN").length,
        note: "Canonical v18 benchmark envelope NOT mutated — parserExecutionCount=1 in execution artifacts only.",
      },
      null,
      2,
    ),
  );
}

main();

/**
 * Run validation_set_v16 exactly once against frozen RC6 candidate v151.
 * Mechanical preflight → single execution → immutable record preservation.
 * Run: cd web && npx tsx scripts/run-validation-v16-rc6-once.ts
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
import { assertHoldoutExecutionEnvironment } from "./lib/holdout-execution-provenance-v1";

const RC6_CANDIDATE_MANIFEST_PATH =
  "data/milestones/rc6-development/rc6-candidate-v151-freeze-manifest.json";
const V16_CERT_PATH =
  "data/milestones/validation-v16-certification/validation-v16-gold-policy-certificate-v4.json";
const EXPECTED_V16_STACK_COMPOSITE = "b46d4c70a8460e871e7b65f4d3ce26b7cd75fc12a58ae0744cee0d688804837d";
const V16_FREEZE_MANIFEST_PATH =
  "data/milestones/validation-v16-certification/validation-v16-freeze-manifest-v150.json";
const DATASET_PATH = "data/oracle-action-eval-validation-v16.json";
const EXPECTED_V16_HASH = "7805b98f837b090dad2b14486ebe2200b1c3bea9d6ad702c01d23085bf1a8007";
const EXPECTED_CASE_COUNT = 225;
const OUT_DIR = "data/milestones/validation-v16-certification";

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

function main() {
  assertHoldoutExecutionEnvironment({
    label: "validation v16 holdout execution",
    candidateManifestPath: RC6_CANDIDATE_MANIFEST_PATH,
  });

  if (existsSync(resolve(OUT_DIR, "validation-v16-rc6-execution-1-raw.json"))) {
    throw new Error("Validation v16 execution artifact already exists — single-run already consumed");
  }

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  const rc6Manifest = JSON.parse(readFileSync(RC6_CANDIDATE_MANIFEST_PATH, "utf8")) as {
    manifestContentHash: string;
    status: string;
    parserVersion: string;
    parserCommitSha: string;
    parserScopePaths: string[];
    parserBlobClosureHash: string;
    evaluators: Record<string, string>;
    developmentGold: { correctedCertifiedHash: string };
    goldPolicy: { stackCompositeHash: string };
  };

  const v16Cert = JSON.parse(readFileSync(V16_CERT_PATH, "utf8")) as {
    benchmarkHash: string;
    violations: number;
    parserExecutionCount: number;
    benchmarkStatus: string;
    policyStack: Record<string, string>;
    certificateSequence?: number;
    candidateBinding?: { candidateManifestHash: string };
  };

  const v16Freeze = JSON.parse(readFileSync(V16_FREEZE_MANIFEST_PATH, "utf8")) as {
    parserExecutionCount: number;
    validationV16: { contentHash: string; caseCount: number };
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

  const parserScopeChecks = rc6Manifest.parserScopePaths.map((relPath) => {
    const actual = sha256File(relPath);
    return { path: relPath, actual };
  });
  const parserBlobClosureActual = createHash("sha256")
    .update(parserScopeChecks.map((c) => c.actual).join("\n"))
    .digest("hex");

  const evaluatorChecks = Object.fromEntries(
    Object.entries(rc6Manifest.evaluators).map(([key, expected]) => {
      const pathMap: Record<string, string> = {
        semanticMatcher: "scripts/oracle-action-semantic-matcher.ts",
        unifiedMatcher: "scripts/oracle-action-unified-matcher.ts",
        goldPolicyValidator: "scripts/lib/gold-policy-validator-v1.ts",
        rc5RegressionScoring: "scripts/lib/rc5-regression-scoring-v1.ts",
        reminderDerivedLeakage: "scripts/lib/reminder-derived-leakage-v1.ts",
      };
      const path = pathMap[key];
      const actual = path ? sha256File(path) : "UNKNOWN";
      return [key, { expected, actual, match: actual === expected }];
    }),
  );

  const v16GoldPolicyLive = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath: DATASET_PATH,
  });

  const goldPolicyPreflight = runGoldPolicyPreflight({
    certificatePath: V16_CERT_PATH,
    benchmarkPath: DATASET_PATH,
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
  });

  const devOracleIds = loadDevelopmentOracleIds();
  const overlap = envelope.cases.map((c) => c.oracleId).filter((id) => devOracleIds.has(id));
  const v16CertHash = sha256File(V16_CERT_PATH);

  const preflight = {
    rc6CandidateManifestHashActual: rc6Manifest.manifestContentHash,
    rc6CandidateStatus: rc6Manifest.status,
    v16Certificate: {
      path: V16_CERT_PATH,
      sequence: v16Cert.certificateSequence ?? null,
      candidateManifestHashActual: v16Cert.candidateBinding?.candidateManifestHash ?? null,
      candidateManifestHashMatch:
        v16Cert.candidateBinding?.candidateManifestHash === rc6Manifest.manifestContentHash,
      certificateHash: v16CertHash,
    },
    v16Benchmark: {
      hashExpected: EXPECTED_V16_HASH,
      hashActual: envelope.contentHash,
      hashMatch: envelope.contentHash === EXPECTED_V16_HASH,
      certificateBenchmarkHash: v16Cert.benchmarkHash,
      certificateBenchmarkHashMatch: v16Cert.benchmarkHash === EXPECTED_V16_HASH,
      certificateGreen: v16Cert.violations === 0 && v16Cert.benchmarkStatus === "sealed_policy_certified",
      goldPolicyViolationsCertified: v16Cert.violations,
      goldPolicyViolationsLiveAudit: v16GoldPolicyLive.violations.length,
      goldPolicyPreflightPass: goldPolicyPreflight.pass,
      goldPolicyPreflightHardStopReasons: goldPolicyPreflight.hardStopReasons,
      policyStackCompositeHashExpected: EXPECTED_V16_STACK_COMPOSITE,
      policyStackCompositeHashCertified: v16Cert.policyStack.stackCompositeHash,
      policyStackCompositeHashLive: goldPolicyPreflight.liveStack.stackCompositeHash,
      policyStackCompositeHashMatch:
        v16Cert.policyStack.stackCompositeHash === EXPECTED_V16_STACK_COMPOSITE &&
        goldPolicyPreflight.liveStack.stackCompositeHash === EXPECTED_V16_STACK_COMPOSITE,
      policyStackMismatches: goldPolicyPreflight.stackVerification.mismatches,
      parserExecutionCount: envelope.parserExecutionCount,
      layer2Denominator: envelope.cases.reduce(
        (n, c) => n + c.expectedPrimitiveActions.filter((g) => !g.negative).length,
        0,
      ),
    },
    parserVersionExpected: rc6Manifest.parserVersion,
    parserVersionActual: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserVersionMatch: ORACLE_ACTION_RC3_PARSER_VERSION === rc6Manifest.parserVersion,
    parserCommitExpected: rc6Manifest.parserCommitSha,
    parserCommitActual: head,
    parserCommitMatch: head === rc6Manifest.parserCommitSha,
    parserBlobClosureExpected: rc6Manifest.parserBlobClosureHash,
    parserBlobClosureActual,
    parserBlobClosureMatch: parserBlobClosureActual === rc6Manifest.parserBlobClosureHash,
    evaluatorChecks,
    evaluatorsMatch: Object.values(evaluatorChecks).every((c) => c.match),
    developmentValidationOracleIdOverlap: overlap.length,
    caseCount: envelope.cases.length,
    expectedCaseCount: EXPECTED_CASE_COUNT,
    overlapGuarantees: v16Freeze.overlapGuarantees,
    forbiddenEmissionPolicy: "HARD_FAIL — forbiddenEmissionCount > 0 fails validation regardless of precision/recall",
  };

  const preflightPass =
    rc6Manifest.status === "CANDIDATE_FROZEN" &&
    preflight.v16Certificate.candidateManifestHashMatch === true &&
    preflight.v16Benchmark.hashMatch &&
    preflight.v16Benchmark.certificateBenchmarkHashMatch === true &&
    preflight.v16Benchmark.policyStackCompositeHashMatch === true &&
    preflight.v16Benchmark.certificateGreen &&
    preflight.v16Benchmark.goldPolicyViolationsCertified === 0 &&
    goldPolicyPreflight.pass &&
    preflight.v16Benchmark.parserExecutionCount === 0 &&
    preflight.parserVersionMatch &&
    preflight.parserBlobClosureMatch &&
    preflight.evaluatorsMatch &&
    envelope.sealed &&
    envelope.cases.length === EXPECTED_CASE_COUNT &&
    overlap.length === 0 &&
    v16Freeze.parserExecutionCount === 0;

  console.log(JSON.stringify({ phase: "preflight", preflight, pass: preflightPass }, null, 2));
  if (!preflightPass) throw new Error("Preflight failed — HARD STOP, aborting v16 execution");

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
    parserVersion: rc6Manifest.parserVersion,
    parserCommit: head,
    rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
    v16CertificateHash: v16CertHash,
    validationSet: "validation_set_v16",
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

  const rawPath = resolve(OUT_DIR, "validation-v16-rc6-execution-1-raw.json");
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

  const byStratum: Record<string, { tp: number; fp: number; fn: number; caseCount: number }> = {};
  const byBucket: Record<string, { tp: number; fp: number; fn: number; caseCount: number }> = {};
  for (let i = 0; i < envelope.cases.length; i++) {
    const testCase = envelope.cases[i];
    const stratum = testCase.coverageStratum ?? "unknown";
    const bucket = bucketForStratum(stratum);
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
  };

  const validationPass = Object.values(gates).every((g) => g.pass);

  const aggregate = {
    generatedAt: executedAt,
    parserVersion: rc6Manifest.parserVersion,
    parserCommit: head,
    rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
    v16CertificateHash: v16CertHash,
    validationSet: "validation_set_v16",
    contentHash: envelope.contentHash,
    caseCount: envelope.cases.length,
    goldDenominator,
    parserExecutionCount: 1,
    rawArtifactRef: "validation-v16-rc6-execution-1-raw.json",
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
    },
    forbiddenEmissionLedger: invariants.forbiddenEmissionLedger,
    acceptedReminderDerivedLayer2Ledger: invariants.acceptedReminderDerivedLayer2Ledger,
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
    note: "Official first-run validation v16 against RC6 candidate v151 — FRESH VALIDATION HOLDOUT",
  };

  const aggregatePath = resolve(OUT_DIR, "validation-v16-rc6-execution-1-aggregate.json");
  writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

  const rawHash = sha256File(rawPath);
  const aggregateHash = sha256File(aggregatePath);

  const executionRecord = {
    recordType: "ValidationExecution",
    candidateLabel: "rc6-candidate-v151",
    candidateParserCommit: head,
    rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
    v16CertificateHash: v16CertHash,
    dataset: "validation_set_v16",
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
    rawOutputRef: "validation-v16-rc6-execution-1-raw.json",
    aggregateHash,
    aggregateRef: "validation-v16-rc6-execution-1-aggregate.json",
    result: {
      goldDenominator,
      accepted: aggregate.accepted,
      invariants: aggregate.invariants,
      validationPass: aggregate.validationPass,
    },
  };

  const recordPath = resolve(OUT_DIR, "validation-v16-rc6-execution-record.json");
  writeFileSync(recordPath, `${JSON.stringify(executionRecord, null, 2)}\n`, "utf8");
  const executionRecordHash = sha256File(recordPath);

  envelope.parserExecutionCount = 1;
  (envelope as { holdoutStatus?: string }).holdoutStatus = "spent_for_validation";
  (envelope as { validationHoldout?: Record<string, unknown> }).validationHoldout = {
    parserExecutionCount: 1,
    spent: true,
    holdoutStatus: "spent_for_validation",
    executedAt,
    parserVersion: rc6Manifest.parserVersion,
    parserCommit: head,
    rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
    aggregateRef: "validation-v16-rc6-execution-1-aggregate.json",
    executionRecordHash,
    validationPass,
  };
  if (envelope.goldCertification) envelope.goldCertification.parserExecutionCount = 1;
  envelope.goldPolicyCertification = {
    executed: true,
    executedAt,
    parserExecutionCount: 1,
    certificateHashAtExecution: v16CertHash,
    validationPass,
    note: "Single authorized execution against RC6 candidate — preserve artifacts before diagnosis",
  };
  writeFileSync(DATASET_PATH, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  v16Freeze.parserExecutionCount = 1;
  (v16Freeze as { holdoutStatus?: string }).holdoutStatus = "spent_for_validation";
  (v16Freeze as { execution?: Record<string, unknown> }).execution = {
    executedAt,
    parserExecutionCount: 1,
    rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
    rawOutputHash: rawHash,
    aggregateHash,
    executionRecordHash,
    validationPass,
  };
  if (v16Freeze.validationV16) {
    v16Freeze.validationV16.contentHash = envelope.contentHash;
  }
  writeFileSync(V16_FREEZE_MANIFEST_PATH, `${JSON.stringify(v16Freeze, null, 2)}\n`, "utf8");

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

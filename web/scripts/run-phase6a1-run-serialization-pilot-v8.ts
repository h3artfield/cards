#!/usr/bin/env npx tsx
/**
 * Spent 5/5 serialization pilot runner v8 — real Professor path, fail-closed.
 * Default: preflight only. Execution requires independent catalog-verifier PASS confirmation.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalFactsForCommanders } from "./lib/phase6a1-closure-commander-canonical-facts-v6";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  runProfessorPlanCaseV2,
  type ProfessorCaseExperimentRecordV2,
} from "./lib/phase6a1-professor-plan-agent-v2";
import { buildProfessorPlanningContextV2 } from "./lib/phase6a1-professor-plan-context-builder-v2";
import {
  PILOT_COMMANDER_SLOTS,
  AMENDED_V8_CASES_DIR,
  HARMONY_EVIDENCE_PATH,
  PILOT_SPEC_PATH,
} from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import {
  assertCatalogVerifierPassPresent,
  buildPilotStackIdentityInputs,
  computeSingleFinalStackIdentity,
  resolveImplementationExecutionTreePin,
} from "./lib/phase6a1-professor-plan-serialization-pilot-stack-v1";
import {
  runtimeInputV8ByteSha256,
  serializeProfessorPlanToRuntimeInputV8,
} from "./lib/phase6a1-professor-plan-serializer-v1";
import { verifySemanticLosslessnessV1 } from "./lib/phase6a1-professor-plan-serialization-losslessness-v1";
import { validateRuntimeInputV8SchemaV1 } from "./lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1";
import { validateFrozenHarmonyEvidenceV1 } from "./lib/phase6a1-professor-plan-serialization-harmony-v1";
import {
  assertPilotTruthSupplementsPresent,
  getPilotMechanismCatalogEntry,
  getPilotOpportunityCase,
} from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";
import { sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { PILOT_RETRY_LIMITS } from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import {
  assertPassArtifactAbsentForExecution,
  assertWritableArtifactMount,
  ensurePilotArtifactOutputDir,
  pilotCaseEvidenceDir,
  pilotPassArtifactPath,
} from "./lib/phase6a1-serialization-pilot-artifact-routing-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const RUNNER_PATH = resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts");
const CONTAINER_WRAPPER_PATH = resolve(HERE, "run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts");
const PINNED_CONTAINER_PATH = resolve(HERE, "lib/phase6a1-pinned-implementation-container-v1.ts");
const CONFIG_PATH = resolve(HERE, "lib/phase6a1-serialization-pilot-v8-config-v1.ts");
const SERIALIZER_PATH = resolve(HERE, "lib/phase6a1-professor-plan-serializer-v1.ts");
const LOSSLESSNESS_PATH = resolve(HERE, "lib/phase6a1-professor-plan-serialization-losslessness-v1.ts");
const SEMANTIC_PROJECTION_PATH = resolve(HERE, "lib/phase6a1-professor-plan-serialization-semantic-projection-v1.ts");
const RUNTIME_SCHEMA_VALIDATOR_PATH = resolve(HERE, "lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1.ts");
const ARTIFACT_ROUTING_PATH = resolve(HERE, "lib/phase6a1-serialization-pilot-artifact-routing-v1.ts");
const HARMONY_PATH = resolve(HERE, "lib/phase6a1-professor-plan-serialization-harmony-v1.ts");
const STACK_PATH = resolve(HERE, "lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts");
const TRUTH_LOADER_PATH = resolve(HERE, "lib/phase6a1-spent-pilot-truth-loader-v1.ts");
const ADJUDICATION_PATH = resolve(HERE, "lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts");

type PilotFailureClass =
  | "UPSTREAM_PROFESSOR_FAILURE"
  | "VALIDATOR_FAILURE"
  | "SERIALIZER_SCHEMA_FAILURE"
  | "SERIALIZER_SEMANTIC_LOSS"
  | "HARMONY_RULE_FAILURE"
  | "STACK_PIN_MISMATCH"
  | "CATALOG_STATE_VERIFICATION_FAILURE";

type PerCaseEvidencePin = {
  pilotCaseId: string;
  professorRecordRelativePath: string;
  professorRecordSha256: string;
  runtimeInputV8RelativePath: string;
  runtimeInputV8Sha256: string;
  requiredSemanticProjectionSha256: string;
};

type PerCommanderResult = {
  pilotCaseId: string;
  mechanismTruthCaseId: string;
  commander: string;
  pass: boolean;
  failureClass?: PilotFailureClass;
  attempts: number;
  professorCaseStatus?: string;
  runtimeInputSha256?: string;
  runtimeSchemaValidationPass?: boolean;
  losslessnessPass?: boolean;
  perCaseEvidence?: PerCaseEvidencePin;
  issues?: string[];
};

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function loadEnvLocal(): void {
  const p = resolve(HERE, "../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function executionAuthorized(): boolean {
  return process.env.PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED === "1";
}

function classifyProfessorFailure(record: ProfessorCaseExperimentRecordV2): PilotFailureClass {
  if (
    record.validationResults.some((r) => r.outcome !== "VALIDATED" && r.outcome !== "VALID_WITH_CONSTRAINT")
  ) {
    return "VALIDATOR_FAILURE";
  }
  return "UPSTREAM_PROFESSOR_FAILURE";
}


function writePerCaseEvidence(args: {
  pilotCaseId: string;
  record: ProfessorCaseExperimentRecordV2;
  runtime: ReturnType<typeof serializeProfessorPlanToRuntimeInputV8>;
  artifactRoot: string;
}): PerCaseEvidencePin {
  const caseDir = pilotCaseEvidenceDir(args.pilotCaseId);
  const professorPath = resolve(caseDir, "professor-record-v1.json");
  const runtimePath = resolve(caseDir, "runtime-input-v8.json");
  const professorBytes = JSON.stringify(args.record, null, 2);
  const runtimeBytes = JSON.stringify(args.runtime, null, 2);
  writeFileSync(professorPath, professorBytes);
  writeFileSync(runtimePath, runtimeBytes);
  return {
    pilotCaseId: args.pilotCaseId,
    professorRecordRelativePath: relative(args.artifactRoot, professorPath).replace(/\\/g, "/"),
    professorRecordSha256: sha256Text(professorBytes),
    runtimeInputV8RelativePath: relative(args.artifactRoot, runtimePath).replace(/\\/g, "/"),
    runtimeInputV8Sha256: sha256Text(runtimeBytes),
    requiredSemanticProjectionSha256: args.runtime.serializationProvenance.requiredSemanticProjectionSha256,
  };
}

async function runPilotCase(args: {
  pilotCaseId: string;
  mechanismTruthCaseId: string;
  commander: string;
  stackIdentity: string;
  artifactRoot: string;
  catalog: Awaited<ReturnType<typeof loadGoldenCatalogIndex>>;
}): Promise<PerCommanderResult> {
  const entry = getPilotMechanismCatalogEntry(args.mechanismTruthCaseId);
  const oppCase = getPilotOpportunityCase(args.mechanismTruthCaseId);
  if (!entry || !oppCase) {
    return {
      pilotCaseId: args.pilotCaseId,
      mechanismTruthCaseId: args.mechanismTruthCaseId,
      commander: args.commander,
      pass: false,
      failureClass: "UPSTREAM_PROFESSOR_FAILURE",
      attempts: 0,
      issues: ["Missing mechanism-truth or opportunity inputs"],
    };
  }

  let attempts = 0;
  let lastFailure: PerCommanderResult | null = null;

  while (attempts <= PILOT_RETRY_LIMITS.UPSTREAM_PROFESSOR_FAILURE) {
    attempts += 1;
    let record: ProfessorCaseExperimentRecordV2;
    try {
      const ctx = await buildProfessorPlanningContextV2(entry, oppCase);
      ctx.caseId = args.pilotCaseId;
      record = await runProfessorPlanCaseV2(ctx, {
        experimentPurpose: "FORMAL_EXPERIMENT",
        stackFreezeManifestSha256: args.stackIdentity,
      });
    } catch (err) {
      lastFailure = {
        pilotCaseId: args.pilotCaseId,
        mechanismTruthCaseId: args.mechanismTruthCaseId,
        commander: args.commander,
        pass: false,
        failureClass: "UPSTREAM_PROFESSOR_FAILURE",
        attempts,
        issues: [String(err instanceof Error ? err.message : err)],
      };
      if (attempts <= PILOT_RETRY_LIMITS.UPSTREAM_PROFESSOR_FAILURE + 1) continue;
      return lastFailure;
    }

    if (record.caseStatus === "PROFESSOR_CONTEXT_UNSATISFIABLE") {
      return {
        pilotCaseId: args.pilotCaseId,
        mechanismTruthCaseId: args.mechanismTruthCaseId,
        commander: args.commander,
        pass: false,
        failureClass: "UPSTREAM_PROFESSOR_FAILURE",
        attempts,
        professorCaseStatus: record.caseStatus,
        issues: (record.contextPreflightIssues ?? []).map((i) => `${i.code}: ${i.message}`),
      };
    }

    if (record.caseStatus !== "SEALED_SUCCESS") {
      const failureClass = classifyProfessorFailure(record);
      lastFailure = {
        pilotCaseId: args.pilotCaseId,
        mechanismTruthCaseId: args.mechanismTruthCaseId,
        commander: args.commander,
        pass: false,
        failureClass,
        attempts,
        professorCaseStatus: record.caseStatus,
        issues: [`Professor caseStatus=${record.caseStatus}`],
      };
      if (failureClass === "VALIDATOR_FAILURE" && attempts <= PILOT_RETRY_LIMITS.VALIDATOR_FAILURE + 1) {
        continue;
      }
      if (failureClass === "UPSTREAM_PROFESSOR_FAILURE" && attempts <= PILOT_RETRY_LIMITS.UPSTREAM_PROFESSOR_FAILURE + 1) {
        continue;
      }
      return lastFailure;
    }

    let runtime: ReturnType<typeof serializeProfessorPlanToRuntimeInputV8>;
    try {
      const frozenFacts = canonicalFactsForCommanders(args.catalog, record.commanders);
      runtime = serializeProfessorPlanToRuntimeInputV8({
        record,
        commandZoneConfiguration: entry.commandZoneConfiguration,
        frozenFacts,
        semanticOpportunities: oppCase.opportunities,
        catalog: args.catalog,
      });
    } catch (err) {
      return {
        pilotCaseId: args.pilotCaseId,
        mechanismTruthCaseId: args.mechanismTruthCaseId,
        commander: args.commander,
        pass: false,
        failureClass: "SERIALIZER_SCHEMA_FAILURE",
        attempts,
        professorCaseStatus: record.caseStatus,
        issues: [String(err instanceof Error ? err.message : err)],
      };
    }

    const schemaValidation = validateRuntimeInputV8SchemaV1(runtime);
    if (!schemaValidation.pass) {
      return {
        pilotCaseId: args.pilotCaseId,
        mechanismTruthCaseId: args.mechanismTruthCaseId,
        commander: args.commander,
        pass: false,
        failureClass: "SERIALIZER_SCHEMA_FAILURE",
        attempts,
        professorCaseStatus: record.caseStatus,
        runtimeSchemaValidationPass: false,
        issues: schemaValidation.issues.map((i) => `${i.code}: ${i.message}${i.path ? ` @ ${i.path}` : ""}`),
      };
    }

    const losslessness = verifySemanticLosslessnessV1({ record, runtime });
    if (!losslessness.pass) {
      return {
        pilotCaseId: args.pilotCaseId,
        mechanismTruthCaseId: args.mechanismTruthCaseId,
        commander: args.commander,
        pass: false,
        failureClass: "SERIALIZER_SEMANTIC_LOSS",
        attempts,
        professorCaseStatus: record.caseStatus,
        losslessnessPass: false,
        issues: losslessness.issues.map((i) => `${i.code}: ${i.message}${i.path ? ` @ ${i.path}` : ""}`),
      };
    }

    const perCaseEvidence = writePerCaseEvidence({
      pilotCaseId: args.pilotCaseId,
      record,
      runtime,
      artifactRoot: args.artifactRoot,
    });

    return {
      pilotCaseId: args.pilotCaseId,
      mechanismTruthCaseId: args.mechanismTruthCaseId,
      commander: args.commander,
      pass: true,
      attempts,
      professorCaseStatus: record.caseStatus,
      runtimeInputSha256: runtimeInputV8ByteSha256(runtime),
      runtimeSchemaValidationPass: true,
      losslessnessPass: true,
      perCaseEvidence,
    };
  }

  return (
    lastFailure ?? {
      pilotCaseId: args.pilotCaseId,
      mechanismTruthCaseId: args.mechanismTruthCaseId,
      commander: args.commander,
      pass: false,
      failureClass: "UPSTREAM_PROFESSOR_FAILURE",
      attempts,
      issues: ["Retry exhaustion"],
    }
  );
}

export async function runSerializationPilotV8(options?: { execute?: boolean }): Promise<{
  decision: string;
  execute: boolean;
  singleFinalStackIdentity: string;
  stackInputs: ReturnType<typeof buildPilotStackIdentityInputs>;
  perCommanderResults?: PerCommanderResult[];
  harmonyEvidenceResults?: ReturnType<typeof validateFrozenHarmonyEvidenceV1>;
  pass?: boolean;
}> {
  loadEnvLocal();
  assertPilotTruthSupplementsPresent();
  assertWritableArtifactMount();

  const implementationExecutionTree = resolveImplementationExecutionTreePin();
  const stackInputs = buildPilotStackIdentityInputs({
    pilotRunnerPath: RUNNER_PATH,
    pilotRunnerContainerWrapperPath: CONTAINER_WRAPPER_PATH,
    pinnedContainerHelperPath: PINNED_CONTAINER_PATH,
    configPath: CONFIG_PATH,
    serializerPath: SERIALIZER_PATH,
    losslessnessPath: LOSSLESSNESS_PATH,
    semanticProjectionPath: SEMANTIC_PROJECTION_PATH,
    runtimeInputV8SchemaValidatorPath: RUNTIME_SCHEMA_VALIDATOR_PATH,
    artifactRoutingPath: ARTIFACT_ROUTING_PATH,
    harmonyPath: HARMONY_PATH,
    stackIdentityPath: STACK_PATH,
    spentPilotTruthLoaderPath: TRUTH_LOADER_PATH,
    spentPilotAdjudicationPath: ADJUDICATION_PATH,
    implementationExecutionTree,
  });
  const singleFinalStackIdentity = computeSingleFinalStackIdentity(stackInputs);
  const execute = options?.execute === true && executionAuthorized();

  if (!execute) {
    return {
      decision: "SERIALIZATION_PILOT_PRE_EXECUTION_BLOCK_V1",
      execute: false,
      singleFinalStackIdentity,
      stackInputs,
    };
  }

  assertPassArtifactAbsentForExecution();

  let catalogVerifierSha: string;
  try {
    catalogVerifierSha = assertCatalogVerifierPassPresent().sha256;
  } catch (err) {
    throw new Error(`CATALOG_STATE_VERIFICATION_FAILURE: ${String(err instanceof Error ? err.message : err)}`);
  }
  if (stackInputs.catalogDataState.catalogDataStateVerificationByteSha256 !== catalogVerifierSha) {
    throw new Error("STACK_PIN_MISMATCH: catalog verifier SHA in stack inputs does not match artifact bytes");
  }

  const catalog = await loadGoldenCatalogIndex();
  const artifactRoot = ensurePilotArtifactOutputDir();
  const runStartedAt = new Date().toISOString();
  const runId = sha256Text(`${singleFinalStackIdentity}|${runStartedAt}|${process.pid}`);

  const perCommanderResults: PerCommanderResult[] = [];
  for (const slot of PILOT_COMMANDER_SLOTS) {
    const result = await runPilotCase({
      pilotCaseId: slot.pilotCaseId,
      mechanismTruthCaseId: slot.mechanismTruthCaseId,
      commander: slot.commander,
      stackIdentity: singleFinalStackIdentity,
      artifactRoot,
      catalog,
    });
    perCommanderResults.push(result);
    if (!result.pass) {
      return {
        decision: "SERIALIZATION_PILOT_FAIL_CLOSED",
        execute: true,
        singleFinalStackIdentity,
        stackInputs,
        perCommanderResults,
        pass: false,
      };
    }
  }

  const harmonyEvidenceResults = validateFrozenHarmonyEvidenceV1({
    catalog,
    kinnanRecordPath: resolve(AMENDED_V8_CASES_DIR, "hybrid-kinnan.json"),
    yurikoRecordPath: resolve(AMENDED_V8_CASES_DIR, "yuriko-ninja.json"),
  });
  if (!harmonyEvidenceResults.pass) {
    return {
      decision: "SERIALIZATION_PILOT_FAIL_CLOSED",
      execute: true,
      singleFinalStackIdentity,
      stackInputs,
      perCommanderResults,
      harmonyEvidenceResults,
      pass: false,
    };
  }

  const passArtifact = {
    version: "phase6a1-professor-plan-serialization-pilot-pass-v1",
    decision: "SERIALIZATION_PILOT_PASS",
    authorizedDecision: "SERIALIZATION_PILOT_IMPLEMENTATION_AUTHORIZED_NO_COMMANDER_SUBSTITUTION",
    pilotSpecVersion: JSON.parse(readFileSync(PILOT_SPEC_PATH, "utf8")).version,
    pilotSpecSha256: sha256File(PILOT_SPEC_PATH),
    runId,
    runStartedAt,
    runCompletedAt: new Date().toISOString(),
    artifactOutputRoot: artifactRoot,
    singleFinalStackIdentity,
    stackPins: stackInputs,
    catalogDataStateVerificationByteSha256: catalogVerifierSha,
    perCommanderResults,
    perCaseEvidence: perCommanderResults.map((r) => r.perCaseEvidence).filter(Boolean),
    harmonyEvidenceResults,
    harmonyEvidenceSha256: sha256File(HARMONY_EVIDENCE_PATH),
    thisRunProof: {
      singleFinalStackIdentity,
      catalogDataStateVerificationByteSha256: catalogVerifierSha,
      perCaseSha256s: perCommanderResults.map((r) => ({
        pilotCaseId: r.pilotCaseId,
        professorRecordSha256: r.perCaseEvidence?.professorRecordSha256,
        runtimeInputV8Sha256: r.perCaseEvidence?.runtimeInputV8Sha256,
        requiredSemanticProjectionSha256: r.perCaseEvidence?.requiredSemanticProjectionSha256,
      })),
    },
    independentReviewerAttestation: "PENDING",
  };

  const passPath = pilotPassArtifactPath();
  writeOnceMilestoneArtifact(passPath, passArtifact);

  return {
    decision: "SERIALIZATION_PILOT_PASS",
    execute: true,
    singleFinalStackIdentity,
    stackInputs,
    perCommanderResults,
    harmonyEvidenceResults,
    pass: true,
  };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const result = await runSerializationPilotV8({ execute });
  console.log(JSON.stringify(result, null, 2));
  if (execute && !result.pass) process.exit(1);
  if (!execute) {
    console.error(
      "\nREPORT AND WAIT — pilot execution blocked until PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED=1",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

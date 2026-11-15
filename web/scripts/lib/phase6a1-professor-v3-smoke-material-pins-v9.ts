/**
 * Yuriko executable-stack import closure pins + identity verification (v9).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLAN_MODEL_PIN_V2_PATH } from "./phase6a1-professor-plan-model-pin-v2";
import { assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1 } from "./phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import {
  PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10,
  PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
  type ProfessorV3CandidateExecutionAuthorizationV10,
} from "./phase6a1-professor-v3-smoke-execution-authorization-v10";
import {
  computeDependencyManifestSha256 as computeDependencyManifestSha256V3,
  computeProfessorV3SmokeMaterialPins as computeProfessorV3SmokeMaterialPinsV3,
  hashPinPayload as hashPinPayloadV3,
  sha256Bytes,
  type ProfessorV3SmokeMaterialPinEntryV3,
  type ProfessorV3SmokeMaterialSourceV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v3";
import { YURIKO_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH } from "./phase6a1-spent-pilot-truth-loader-v1";

export const PROFESSOR_V3_SMOKE_MATERIAL_PINS_V9_VERSION = "phase6a1-professor-v3-smoke-material-pins-v9";
export const PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-identity-v9-yuriko-executable-v1.json",
);
export const PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1.json",
);

const WEB = resolve(REPO, "web");

export type ProfessorV3ReviewedExecutionIdentityV9 = {
  version: "phase6a1-professor-v3-smoke-execution-identity-v9-yuriko-executable-v1";
  decision: string;
  stackIdentity: string;
  prospectiveCaseId: string;
  mechanismTruthCaseId: string;
  executeRunnerRelativePath: string;
  executeRunnerSha256: string;
  executionPinsArtifactRelativePath: string;
  executionPinsArtifactSha256: string;
  dependencyManifestSha256: string;
};

export type ProfessorV3SmokeExecutionPinsV9 = {
  version: "phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1";
  decision: string;
  sealedAt: string;
  stackIdentity: string;
  prospectiveCaseId: string;
  mechanismTruthCaseId: string;
  dependencyManifestSha256: string;
  fileCount: number;
  files: ProfessorV3SmokeMaterialPinEntryV3[];
  sha256: string;
};

/** Yuriko executable runtime import closure — excludes external authorization roots (v8/v9/v10). */
export const PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V9: ProfessorV3SmokeMaterialSourceV3[] = [
  { label: "run-phase6a1-execute-smoke-professor-v3-yuriko-prospective-v1", path: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-yuriko-prospective-v1.ts") },
  { label: "run-phase6a1-seal-professor-v3-smoke-execution-identity-yuriko-executable-v1", path: resolve(WEB, "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-yuriko-executable-v1.ts") },
  { label: "run-phase6a1-test-professor-v3-yuriko-executable-stack-sealing-v1", path: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-yuriko-executable-stack-sealing-v1.ts") },
  { label: "run-phase6a1-report-professor-v3-yuriko-executable-stack-sealing-v1", path: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-yuriko-executable-stack-sealing-v1.ts") },
  { label: "run-phase6a1-package-professor-v3-yuriko-executable-stack-sealing-v1", path: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-yuriko-executable-stack-sealing-v1.ts") },
  { label: "phase6a1-professor-v3-yuriko-prospective-smoke-execution-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-yuriko-prospective-smoke-execution-v1.ts") },
  { label: "phase6a1-professor-v3-yuriko-model-request-boundary-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-yuriko-model-request-boundary-v1.ts") },
  { label: "phase6a1-professor-v3-yuriko-orchestration-success-fixture-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-yuriko-orchestration-success-fixture-v1.ts") },
  { label: "phase6a1-professor-v3-yuriko-pre-model-audit-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-yuriko-pre-model-audit-v1.ts") },
  { label: "phase6a1-professor-v3-smoke-material-pins-v9", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v9.ts") },
  { label: "phase6a1-professor-v3-smoke-execution-authorization-binding-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1.ts") },
  { label: "phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1.ts") },
  { label: "phase6a1-professor-v3-smoke-failure-seal-v9", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v9.ts") },
  { label: "phase6a1-professor-v3-smoke-output-targets-v6", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v6.ts") },
  { label: "phase6a1-professor-v3-plan-output-schema-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-plan-output-schema-v3.ts") },
  { label: "phase6a1-professor-v3-model-response-boundary-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-response-boundary-v1.ts") },
  { label: "phase6a1-professor-v3-smoke-attempt-accounting-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-attempt-accounting-v1.ts") },
  { label: "phase6a1-professor-v3-successor-rag-preflight-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-successor-rag-preflight-v1.ts") },
  { label: "phase6a1-professor-v3-budget-telemetry-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-budget-telemetry-v1.ts") },
  { label: "script-env", path: resolve(WEB, "scripts/lib/script-env.ts") },
  { label: "phase6a1-professor-v3-model-caller-v4", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v4.ts") },
  { label: "phase6a1-professor-v3-model-attempt-artifacts-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-attempt-artifacts-v3.ts") },
  { label: "phase6a1-professor-v3-semantic-relationship-source-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-semantic-relationship-source-v1.ts") },
  { label: "phase6a1-professor-plan-agent-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { label: "phase6a1-professor-plan-context-builder-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts") },
  { label: "phase6a1-professor-plan-context-preflight-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-preflight-v3.ts") },
  { label: "phase6a1-professor-plan-normalizer-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts") },
  { label: "phase6a1-professor-plan-prompt-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-prompt-v3.ts") },
  { label: "phase6a1-professor-v3-prompt-payload-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts") },
  { label: "phase6a1-professor-v3-rag-environment-identity-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-rag-environment-identity-v1.ts") },
  { label: "phase6a1-professor-v3-contract-roundtrip-fixture-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-contract-roundtrip-fixture-v1.ts") },
  { label: "phase6a1-spent-pilot-truth-loader-v1", path: resolve(WEB, "scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts") },
  { label: "phase6a1-spent-pilot-mechanism-truth-adjudication-v1", path: resolve(WEB, "scripts/lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts") },
  { label: "phase6a1-implemented-mechanism-catalog-v1", path: resolve(WEB, "scripts/lib/phase6a1-implemented-mechanism-catalog-v1.ts") },
  { label: "phase6a1-semantic-opportunity-fact-family-rules-v1", path: resolve(WEB, "scripts/lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts") },
  { label: "phase6a1-frozen-semantic-opportunity-v322-loader-v1", path: resolve(WEB, "scripts/lib/phase6a1-frozen-semantic-opportunity-v322-loader-v1.ts") },
  { label: "phase6a1-bracket-constraint-v1", path: resolve(WEB, "scripts/lib/phase6a1-bracket-constraint-v1.ts") },
  { label: "phase6a1-professor-plan-model-pin-v2-loader", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-model-pin-v2.ts") },
  { label: "phase6a1-pinned-implementation-container-v1", path: resolve(WEB, "scripts/lib/phase6a1-pinned-implementation-container-v1.ts") },
  { label: "write-once-milestone-artifact-v2", path: resolve(WEB, "scripts/lib/write-once-milestone-artifact-v2.ts") },
  { label: "write-once-text-artifact-v1", path: resolve(WEB, "scripts/lib/write-once-text-artifact-v1.ts") },
  { label: "mtg-knowledge-service", path: resolve(WEB, "src/lib/deck-intelligence/mtg-knowledge-service.ts") },
  { label: "canonical-knowledge-service", path: resolve(WEB, "src/lib/deck-intelligence/canonical-knowledge-service.ts") },
  { label: "deck-intelligence-types", path: resolve(WEB, "src/lib/deck-intelligence/types.ts") },
  { label: "mtg-rag-constants", path: resolve(WEB, "src/lib/mtg-rag/constants.ts") },
  { label: "mtg-rag-corpora-for-mode", path: resolve(WEB, "src/lib/mtg-rag/corpora-for-mode.ts") },
  { label: "mtg-rag-retrieval-text-presenter", path: resolve(WEB, "src/lib/mtg-rag/retrieval-text-presenter.ts") },
  { label: "mtg-rag-retrieval-ranking", path: resolve(WEB, "src/lib/mtg-rag/retrieval-ranking.ts") },
  { label: "mtg-rag-types", path: resolve(WEB, "src/lib/mtg-rag/types.ts") },
  { label: "mtg-rag-hybrid-retrieval", path: resolve(WEB, "src/lib/mtg-rag/hybrid-retrieval.ts") },
  { label: "mtg-rag-chunk-retrieval", path: resolve(WEB, "src/lib/mtg-rag/chunk-retrieval.ts") },
  { label: "mtg-rag-lexical-candidate-retrieval", path: resolve(WEB, "src/lib/mtg-rag/lexical-candidate-retrieval.ts") },
  { label: "mtg-rag-embedded-clerk-knowledge", path: resolve(WEB, "src/lib/mtg-rag/embedded-clerk-knowledge.ts") },
  { label: "mtg-rag-corpus-for-intent", path: resolve(WEB, "src/lib/mtg-rag/corpus-for-intent.ts") },
  { label: "mtg-rag-retrieval-match-tiers", path: resolve(WEB, "src/lib/mtg-rag/retrieval-match-tiers.ts") },
  { label: "mtg-rag-retrieval-lexical-signals", path: resolve(WEB, "src/lib/mtg-rag/retrieval-lexical-signals.ts") },
  { label: "mtg-rag-alias-specificity", path: resolve(WEB, "src/lib/mtg-rag/alias-specificity.ts") },
  { label: "mtg-rag-query-facets", path: resolve(WEB, "src/lib/mtg-rag/query-facets.ts") },
  { label: "commander-primer-scope", path: resolve(WEB, "src/lib/mtg-rag/commander-primer-scope.ts") },
  { label: "professor-v3-execution-trace-v1", path: resolve(WEB, "src/lib/deck-synthesis/professor-v3-execution-trace-v1.ts") },
  { label: "professor-v3-run-ledger-v1", path: resolve(WEB, "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts") },
  { label: "professor-v3-evidence-ledger-v1", path: resolve(WEB, "src/lib/deck-synthesis/professor-v3-evidence-ledger-v1.ts") },
  { label: "professor-planning-evidence-v3", path: resolve(WEB, "src/lib/deck-synthesis/professor-planning-evidence-v3.ts") },
  { label: "professor-planning-evidence-resolver-v3", path: resolve(WEB, "src/lib/deck-synthesis/professor-planning-evidence-resolver-v3.ts") },
  { label: "strategy-package-validator-v3", path: resolve(WEB, "src/lib/deck-synthesis/strategy-package-validator-v3.ts") },
  { label: "typed-assertion-grounding-v3", path: resolve(WEB, "src/lib/deck-synthesis/typed-assertion-grounding-v3.ts") },
  { label: "mechanism-claim-grounding-v3", path: resolve(WEB, "src/lib/deck-synthesis/mechanism-claim-grounding-v3.ts") },
  { label: "professor-planning-contracts-v3", path: resolve(WEB, "src/lib/deck-synthesis/professor-planning-contracts-v3.ts") },
  { label: "professor-functional-roles-v3", path: resolve(WEB, "src/lib/deck-synthesis/professor-functional-roles-v3.ts") },
  { label: "strategic-assertion-vocabulary-v3", path: resolve(WEB, "src/lib/deck-synthesis/strategic-assertion-vocabulary-v3.ts") },
  { label: "semantic-opportunity-types-v1", path: resolve(WEB, "src/lib/deck-synthesis/semantic-opportunity-types-v1.ts") },
  { label: "independent-truth-types-v1", path: resolve(WEB, "src/lib/deck-synthesis/independent-truth-types-v1.ts") },
  { label: "phase6a1-professor-plan-model-pin-v2", path: PROFESSOR_PLAN_MODEL_PIN_V2_PATH },
  { label: "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1", path: resolve(MILESTONES, "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json") },
  { label: "phase6a1-spent-pilot-semantic-opportunity-supplement-v2", path: resolve(MILESTONES, "phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json") },
  { label: "phase6a1-professor-v3-yuriko-prospective-mechanism-truth-v1", path: YURIKO_PROSPECTIVE_MECHANISM_TRUTH_V1_PATH },
];

export function loadProfessorV3ReviewedExecutionIdentityV9(
  path: string = PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH,
): ProfessorV3ReviewedExecutionIdentityV9 {
  if (!existsSync(path)) throw new Error(`Missing reviewed prospective execution identity artifact: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as ProfessorV3ReviewedExecutionIdentityV9;
}

export function computeProfessorV3SmokeMaterialPinsV9(args?: { sources?: ProfessorV3SmokeMaterialSourceV3[] }) {
  return computeProfessorV3SmokeMaterialPinsV3({ sources: args?.sources ?? PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V9 });
}

export function sealProfessorV3SmokeExecutionPinsV9(args?: {
  decision?: string;
  stackIdentity?: string;
  prospectiveCaseId?: string;
  mechanismTruthCaseId?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionPinsV9 {
  const files = computeProfessorV3SmokeMaterialPinsV9({ sources: args?.sources });
  const dependencyManifestSha256 = computeDependencyManifestSha256V3(files);
  const payload = {
    version: "phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1" as const,
    decision: args?.decision ?? PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
    sealedAt: new Date().toISOString(),
    stackIdentity: args?.stackIdentity ?? "professor-v3-yuriko-smoke-execution-tree-v1-prospective",
    prospectiveCaseId: args?.prospectiveCaseId ?? "professor-v3-smoke-yuriko-prospective-v1",
    mechanismTruthCaseId: args?.mechanismTruthCaseId ?? "multi-yuriko",
    dependencyManifestSha256,
    fileCount: files.length,
    files,
  };
  return { ...payload, sha256: hashPinPayloadV3(payload) };
}

export function loadProfessorV3SmokeExecutionPinsV9(path: string = PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH): ProfessorV3SmokeExecutionPinsV9 {
  if (!existsSync(path)) throw new Error(`Missing prospective execution pins: ${path}`);
  const pin = JSON.parse(readFileSync(path, "utf8")) as ProfessorV3SmokeExecutionPinsV9;
  const { sha256: _ignored, ...payload } = pin;
  const expected = hashPinPayloadV3(payload);
  if (pin.sha256 !== expected) {
    throw new Error(`Prospective execution pins JSON internal SHA256 mismatch: got ${pin.sha256}, expected ${expected}`);
  }
  return pin;
}

export type ProfessorV3SmokeExecutionIdentityVerificationV9 =
  | {
      ok: true;
      identity: ProfessorV3ReviewedExecutionIdentityV9;
      pins: ProfessorV3SmokeExecutionPinsV9;
      current: ProfessorV3SmokeMaterialPinEntryV3[];
    }
  | {
      ok: false;
      reason: string;
      identity: ProfessorV3ReviewedExecutionIdentityV9;
      details?: Record<string, string>;
    };

export function verifyProfessorV3SmokeExecutionIdentityV9(args?: {
  pinsPath?: string;
  identityPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
  identity?: ProfessorV3ReviewedExecutionIdentityV9;
}): ProfessorV3SmokeExecutionIdentityVerificationV9 {
  const identity = args?.identity ?? loadProfessorV3ReviewedExecutionIdentityV9(args?.identityPath);
  const pinsPath = args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH;
  const runnerPath = resolve(REPO, identity.executeRunnerRelativePath);
  const details: Record<string, string> = {};

  if (!existsSync(runnerPath)) return { ok: false, reason: "Missing prospective execute runner", identity, details };
  if (!existsSync(pinsPath)) return { ok: false, reason: "Missing prospective execution pins artifact", identity, details };

  const runnerSha = sha256File(runnerPath);
  if (runnerSha !== identity.executeRunnerSha256) details.runner = `expected ${identity.executeRunnerSha256}, got ${runnerSha}`;

  const pinsArtifactSha = sha256File(pinsPath);
  if (pinsArtifactSha !== identity.executionPinsArtifactSha256) {
    details.executionPinsArtifact = `expected ${identity.executionPinsArtifactSha256}, got ${pinsArtifactSha}`;
  }

  let pins: ProfessorV3SmokeExecutionPinsV9;
  try {
    pins = loadProfessorV3SmokeExecutionPinsV9(pinsPath);
  } catch (err) {
    return { ok: false, reason: "Prospective execution pins JSON invalid", identity, details: { pinsJson: String(err) } };
  }

  const current = computeProfessorV3SmokeMaterialPinsV9({ sources: args?.sources });
  const currentManifestSha = computeDependencyManifestSha256V3(current);
  if (currentManifestSha !== identity.dependencyManifestSha256) {
    details.dependencyManifest = `expected ${identity.dependencyManifestSha256}, got ${currentManifestSha}`;
  }
  if (pins.dependencyManifestSha256 !== identity.dependencyManifestSha256) {
    details.pinsDependencyManifest = `pins JSON manifest ${pins.dependencyManifestSha256} != reviewed ${identity.dependencyManifestSha256}`;
  }

  const expectedByLabel = new Map(pins.files.map((f) => [f.label, f]));
  for (const file of current) {
    const expected = expectedByLabel.get(file.label);
    if (!expected) {
      details[`missingLabel:${file.label}`] = "present on disk but absent from reviewed pins JSON";
      continue;
    }
    if (expected.sha256 !== file.sha256) details[`drift:${file.label}`] = `expected ${expected.sha256}, got ${file.sha256}`;
  }
  for (const label of expectedByLabel.keys()) {
    if (!current.some((f) => f.label === label)) details[`missingSource:${label}`] = "listed in reviewed pins JSON but absent on disk";
  }

  if (Object.keys(details).length > 0) return { ok: false, reason: "Reviewed prospective execution identity mismatch", identity, details };
  return { ok: true, identity, pins, current };
}

export function assertProfessorV3SmokeExecutionIdentityV9(args?: Parameters<typeof verifyProfessorV3SmokeExecutionIdentityV9>[0]) {
  const result = verifyProfessorV3SmokeExecutionIdentityV9(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 prospective smoke execution identity mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export type ProfessorV3SmokeExecutionAuthorizationVerificationV9 =
  | { ok: true; authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 }
  | {
      ok: false;
      reason: string;
      authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
      details?: Record<string, string>;
    };

export function verifyProfessorV3SmokeExecutionAuthorizationV9(args?: {
  authorization?: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  identityPath?: string;
  pinsPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionAuthorizationVerificationV9 {
  const authorization = args?.authorization ?? PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10;
  const identityPath = args?.identityPath ?? resolve(REPO, authorization.executionIdentityArtifactRelativePath);
  const pinsPath = args?.pinsPath ?? resolve(REPO, authorization.executionPinsArtifactRelativePath);
  const runnerPath = resolve(REPO, authorization.executeRunnerRelativePath);
  const details: Record<string, string> = {};

  try {
    assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1(authorization);
  } catch (err) {
    return { ok: false, reason: "Authorization decision semantic mismatch", authorization, details: { decision: String(err) } };
  }

  if (!existsSync(identityPath)) return { ok: false, reason: "Missing prospective execution identity artifact", authorization, details };
  if (!existsSync(pinsPath)) return { ok: false, reason: "Missing prospective execution pins artifact", authorization, details };
  if (!existsSync(runnerPath)) return { ok: false, reason: "Missing prospective execute runner", authorization, details };

  const identityArtifactSha = sha256File(identityPath);
  if (identityArtifactSha !== authorization.executionIdentityArtifactSha256) {
    details.executionIdentityArtifact = `expected ${authorization.executionIdentityArtifactSha256}, got ${identityArtifactSha}`;
  }

  const runnerSha = sha256File(runnerPath);
  if (runnerSha !== authorization.executeRunnerSha256) details.runner = `expected ${authorization.executeRunnerSha256}, got ${runnerSha}`;

  const pinsArtifactSha = sha256File(pinsPath);
  if (pinsArtifactSha !== authorization.executionPinsArtifactSha256) {
    details.executionPinsArtifact = `expected ${authorization.executionPinsArtifactSha256}, got ${pinsArtifactSha}`;
  }

  const identity = loadProfessorV3ReviewedExecutionIdentityV9(identityPath);
  if (identity.decision !== authorization.decision) {
    details.identityDecision = `identity JSON decision ${identity.decision} != authorization ${authorization.decision}`;
  }
  if (identity.prospectiveCaseId !== authorization.prospectiveCaseId) {
    details.identityCaseId = `identity JSON case ${identity.prospectiveCaseId} != authorization ${authorization.prospectiveCaseId}`;
  }
  if (identity.mechanismTruthCaseId !== authorization.mechanismTruthCaseId) {
    details.identityMechanismTruth = `identity JSON mechanism ${identity.mechanismTruthCaseId} != authorization ${authorization.mechanismTruthCaseId}`;
  }
  if (identity.stackIdentity !== authorization.stackIdentity) {
    details.identityStack = `identity JSON stack ${identity.stackIdentity} != authorization ${authorization.stackIdentity}`;
  }
  if (identity.executeRunnerSha256 !== authorization.executeRunnerSha256) {
    details.identityRunner = `identity JSON runner ${identity.executeRunnerSha256} != authorization ${authorization.executeRunnerSha256}`;
  }
  if (identity.executionPinsArtifactSha256 !== authorization.executionPinsArtifactSha256) {
    details.identityPinsArtifact = `identity JSON pins ${identity.executionPinsArtifactSha256} != authorization ${authorization.executionPinsArtifactSha256}`;
  }
  if (identity.dependencyManifestSha256 !== authorization.dependencyManifestSha256) {
    details.identityDependencyManifest = `identity JSON manifest ${identity.dependencyManifestSha256} != authorization ${authorization.dependencyManifestSha256}`;
  }

  const currentManifestSha = computeDependencyManifestSha256V3(computeProfessorV3SmokeMaterialPinsV9({ sources: args?.sources }));
  if (currentManifestSha !== authorization.dependencyManifestSha256) {
    details.dependencyManifest = `expected ${authorization.dependencyManifestSha256}, got ${currentManifestSha}`;
  }

  if (Object.keys(details).length > 0) return { ok: false, reason: "Independent prospective execution authorization mismatch", authorization, details };
  return { ok: true, authorization };
}

export function assertProfessorV3SmokeExecutionAuthorizationV9(args?: Parameters<typeof verifyProfessorV3SmokeExecutionAuthorizationV9>[0]) {
  const result = verifyProfessorV3SmokeExecutionAuthorizationV9(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 prospective smoke execution authorization mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export function verifyProfessorV3CandidateExecutionAuthorizationV10(args?: {
  authorization?: ProfessorV3CandidateExecutionAuthorizationV10;
  identityPath?: string;
  pinsPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionAuthorizationVerificationV9 {
  return verifyProfessorV3SmokeExecutionAuthorizationV9({
    ...args,
    authorization: args?.authorization ?? PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10,
    identityPath: args?.identityPath ?? PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH,
    pinsPath: args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH,
  });
}

export function assertProfessorV3CandidateExecutionAuthorizationV10(
  args?: Parameters<typeof verifyProfessorV3CandidateExecutionAuthorizationV10>[0],
) {
  const result = verifyProfessorV3CandidateExecutionAuthorizationV10(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 Yuriko candidate execution authorization mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export function assertProfessorV3YurikoExecutableSmokeExecutionPreflightV10(
  args?: Parameters<typeof verifyProfessorV3SmokeExecutionIdentityV9>[0] &
    Parameters<typeof verifyProfessorV3CandidateExecutionAuthorizationV10>[0],
) {
  assertProfessorV3CandidateExecutionAuthorizationV10(args);
  return assertProfessorV3SmokeExecutionIdentityV9({
    ...args,
    identityPath: args?.identityPath ?? PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH,
    pinsPath: args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH,
  });
}

export function buildProfessorV3YurikoExecutableSmokeMaterialPinReportV1(
  identityVerification: Extract<ProfessorV3SmokeExecutionIdentityVerificationV9, { ok: true }>,
) {
  return {
    version: PROFESSOR_V3_SMOKE_MATERIAL_PINS_V9_VERSION,
    generatedAt: new Date().toISOString(),
    reviewedExecutionIdentity: identityVerification.identity,
    reviewedExecutionPinsArtifactSha256: identityVerification.identity.executionPinsArtifactSha256,
    dependencyManifestSha256: identityVerification.identity.dependencyManifestSha256,
    fileCount: identityVerification.current.length,
    files: identityVerification.current,
  };
}

export { sha256Bytes };

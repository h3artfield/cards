/**
 * Korvold prospective execution import closure pins + identity verification (v7).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLAN_MODEL_PIN_V2_PATH } from "./phase6a1-professor-plan-model-pin-v2";
import { assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1 } from "./phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import {
  PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
  PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
  type ProfessorV3IndependentlyReviewedExecutionAuthorizationV8,
} from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import {
  computeDependencyManifestSha256 as computeDependencyManifestSha256V3,
  computeProfessorV3SmokeMaterialPins as computeProfessorV3SmokeMaterialPinsV3,
  hashPinPayload as hashPinPayloadV3,
  sha256Bytes,
  type ProfessorV3SmokeMaterialPinEntryV3,
  type ProfessorV3SmokeMaterialSourceV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v3";

export const PROFESSOR_V3_SMOKE_MATERIAL_PINS_V7_VERSION = "phase6a1-professor-v3-smoke-material-pins-v7";
export const PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-identity-v7-korvold-prospective-v1.json",
);
export const PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-pins-v7-korvold-prospective-v1.json",
);

const WEB = resolve(REPO, "web");

export type ProfessorV3ReviewedExecutionIdentityV7 = {
  version: "phase6a1-professor-v3-smoke-execution-identity-v7-korvold-prospective-v1";
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

export type ProfessorV3SmokeExecutionPinsV7 = {
  version: "phase6a1-professor-v3-smoke-execution-pins-v7-korvold-prospective-v1";
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

/** Korvold prospective runtime import closure — excludes external authorization root. */
export const PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V7: ProfessorV3SmokeMaterialSourceV3[] = [
  { label: "run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1", path: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts") },
  { label: "run-phase6a1-seal-professor-v3-smoke-execution-identity-korvold-prospective-v1", path: resolve(WEB, "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-korvold-prospective-v1.ts") },
  { label: "run-phase6a1-test-professor-v3-prospective-execution-authorization-binding-repair-v1", path: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-prospective-execution-authorization-binding-repair-v1.ts") },
  { label: "run-phase6a1-report-professor-v3-prospective-execution-authorization-binding-repair-v1", path: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-prospective-execution-authorization-binding-repair-v1.ts") },
  { label: "run-phase6a1-package-professor-v3-prospective-execution-authorization-binding-repair-v1", path: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-prospective-execution-authorization-binding-repair-v1.ts") },
  { label: "phase6a1-professor-v3-smoke-material-pins-v7", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v7.ts") },
  { label: "phase6a1-professor-v3-smoke-execution-authorization-binding-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1.ts") },
  { label: "phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1.ts") },
  { label: "phase6a1-professor-v3-smoke-failure-seal-v7", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v7.ts") },
  { label: "phase6a1-professor-v3-smoke-output-targets-v6", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v6.ts") },
  { label: "phase6a1-professor-v3-plan-output-schema-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-plan-output-schema-v3.ts") },
  { label: "phase6a1-professor-v3-model-response-boundary-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-response-boundary-v1.ts") },
  { label: "phase6a1-professor-v3-smoke-attempt-accounting-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-attempt-accounting-v1.ts") },
  { label: "phase6a1-professor-v3-successor-rag-preflight-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-successor-rag-preflight-v1.ts") },
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
];

export function loadProfessorV3ReviewedExecutionIdentityV7(
  path: string = PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH,
): ProfessorV3ReviewedExecutionIdentityV7 {
  if (!existsSync(path)) throw new Error(`Missing reviewed prospective execution identity artifact: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as ProfessorV3ReviewedExecutionIdentityV7;
}

export function computeProfessorV3SmokeMaterialPinsV7(args?: { sources?: ProfessorV3SmokeMaterialSourceV3[] }) {
  return computeProfessorV3SmokeMaterialPinsV3({ sources: args?.sources ?? PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V7 });
}

export function sealProfessorV3SmokeExecutionPinsV7(args?: {
  decision?: string;
  stackIdentity?: string;
  prospectiveCaseId?: string;
  mechanismTruthCaseId?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionPinsV7 {
  const files = computeProfessorV3SmokeMaterialPinsV7({ sources: args?.sources });
  const dependencyManifestSha256 = computeDependencyManifestSha256V3(files);
  const payload = {
    version: "phase6a1-professor-v3-smoke-execution-pins-v7-korvold-prospective-v1" as const,
    decision: args?.decision ?? PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
    sealedAt: new Date().toISOString(),
    stackIdentity: args?.stackIdentity ?? "professor-v3-korvold-smoke-execution-tree-v1-prospective",
    prospectiveCaseId: args?.prospectiveCaseId ?? "professor-v3-smoke-korvold-prospective-v1",
    mechanismTruthCaseId: args?.mechanismTruthCaseId ?? "multi-korvold",
    dependencyManifestSha256,
    fileCount: files.length,
    files,
  };
  return { ...payload, sha256: hashPinPayloadV3(payload) };
}

export function loadProfessorV3SmokeExecutionPinsV7(path: string = PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH): ProfessorV3SmokeExecutionPinsV7 {
  if (!existsSync(path)) throw new Error(`Missing prospective execution pins: ${path}`);
  const pin = JSON.parse(readFileSync(path, "utf8")) as ProfessorV3SmokeExecutionPinsV7;
  const { sha256: _ignored, ...payload } = pin;
  const expected = hashPinPayloadV3(payload);
  if (pin.sha256 !== expected) {
    throw new Error(`Prospective execution pins JSON internal SHA256 mismatch: got ${pin.sha256}, expected ${expected}`);
  }
  return pin;
}

export type ProfessorV3SmokeExecutionIdentityVerificationV7 =
  | {
      ok: true;
      identity: ProfessorV3ReviewedExecutionIdentityV7;
      pins: ProfessorV3SmokeExecutionPinsV7;
      current: ProfessorV3SmokeMaterialPinEntryV3[];
    }
  | {
      ok: false;
      reason: string;
      identity: ProfessorV3ReviewedExecutionIdentityV7;
      details?: Record<string, string>;
    };

export function verifyProfessorV3SmokeExecutionIdentityV7(args?: {
  pinsPath?: string;
  identityPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
  identity?: ProfessorV3ReviewedExecutionIdentityV7;
}): ProfessorV3SmokeExecutionIdentityVerificationV7 {
  const identity = args?.identity ?? loadProfessorV3ReviewedExecutionIdentityV7(args?.identityPath);
  const pinsPath = args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH;
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

  let pins: ProfessorV3SmokeExecutionPinsV7;
  try {
    pins = loadProfessorV3SmokeExecutionPinsV7(pinsPath);
  } catch (err) {
    return { ok: false, reason: "Prospective execution pins JSON invalid", identity, details: { pinsJson: String(err) } };
  }

  const current = computeProfessorV3SmokeMaterialPinsV7({ sources: args?.sources });
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

export function assertProfessorV3SmokeExecutionIdentityV7(args?: Parameters<typeof verifyProfessorV3SmokeExecutionIdentityV7>[0]) {
  const result = verifyProfessorV3SmokeExecutionIdentityV7(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 prospective smoke execution identity mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export type ProfessorV3SmokeExecutionAuthorizationVerificationV8 =
  | { ok: true; authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 }
  | {
      ok: false;
      reason: string;
      authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
      details?: Record<string, string>;
    };

export function verifyProfessorV3SmokeExecutionAuthorizationV8(args?: {
  authorization?: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  identityPath?: string;
  pinsPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionAuthorizationVerificationV8 {
  const authorization = args?.authorization ?? PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8;
  const identityPath = args?.identityPath ?? PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH;
  const pinsPath = args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH;
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

  const identity = loadProfessorV3ReviewedExecutionIdentityV7(identityPath);
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

  const currentManifestSha = computeDependencyManifestSha256V3(computeProfessorV3SmokeMaterialPinsV7({ sources: args?.sources }));
  if (currentManifestSha !== authorization.dependencyManifestSha256) {
    details.dependencyManifest = `expected ${authorization.dependencyManifestSha256}, got ${currentManifestSha}`;
  }

  if (Object.keys(details).length > 0) return { ok: false, reason: "Independent prospective execution authorization mismatch", authorization, details };
  return { ok: true, authorization };
}

export function assertProfessorV3SmokeExecutionAuthorizationV8(args?: Parameters<typeof verifyProfessorV3SmokeExecutionAuthorizationV8>[0]) {
  const result = verifyProfessorV3SmokeExecutionAuthorizationV8(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 prospective smoke execution authorization mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export function assertProfessorV3SuccessorProspectiveSmokeExecutionPreflightV8(
  args?: Parameters<typeof verifyProfessorV3SmokeExecutionIdentityV7>[0] &
    Parameters<typeof verifyProfessorV3SmokeExecutionAuthorizationV8>[0],
) {
  assertProfessorV3SmokeExecutionAuthorizationV8(args);
  return assertProfessorV3SmokeExecutionIdentityV7(args);
}

export function buildProfessorV3ProspectiveSmokeMaterialPinReportV1(
  identityVerification: Extract<ProfessorV3SmokeExecutionIdentityVerificationV7, { ok: true }>,
) {
  return {
    version: PROFESSOR_V3_SMOKE_MATERIAL_PINS_V7_VERSION,
    generatedAt: new Date().toISOString(),
    reviewedExecutionIdentity: identityVerification.identity,
    reviewedExecutionPinsArtifactSha256: identityVerification.identity.executionPinsArtifactSha256,
    dependencyManifestSha256: identityVerification.identity.dependencyManifestSha256,
    fileCount: identityVerification.current.length,
    files: identityVerification.current,
  };
}

export { sha256Bytes };

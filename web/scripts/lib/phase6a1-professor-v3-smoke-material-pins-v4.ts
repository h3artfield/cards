/**
 * Successor execution import closure pins + identity verification (v4).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLAN_MODEL_PIN_V2_PATH } from "./phase6a1-professor-plan-model-pin-v2";
import {
  PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V5,
  type ProfessorV3IndependentlyReviewedExecutionAuthorizationV5,
} from "./phase6a1-professor-v3-smoke-execution-authorization-v5";
import {
  computeDependencyManifestSha256 as computeDependencyManifestSha256V3,
  computeProfessorV3SmokeMaterialPins as computeProfessorV3SmokeMaterialPinsV3,
  hashPinPayload as hashPinPayloadV3,
  sha256Bytes,
  type ProfessorV3SmokeMaterialPinEntryV3,
  type ProfessorV3SmokeMaterialSourceV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v3";

export const PROFESSOR_V3_SMOKE_MATERIAL_PINS_V4_VERSION = "phase6a1-professor-v3-smoke-material-pins-v4";
export const PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V4_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-identity-v4-successor.json",
);
export const PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-pins-v4-successor.json",
);

const WEB = resolve(REPO, "web");

export type ProfessorV3ReviewedExecutionIdentityV4 = {
  version: "phase6a1-professor-v3-smoke-execution-identity-v4-successor";
  decision: string;
  stackIdentity: string;
  executeRunnerRelativePath: string;
  executeRunnerSha256: string;
  executionPinsArtifactRelativePath: string;
  executionPinsArtifactSha256: string;
  dependencyManifestSha256: string;
};

export type ProfessorV3SmokeExecutionPinsV4 = {
  version: "phase6a1-professor-v3-smoke-execution-pins-v4-successor";
  decision: string;
  sealedAt: string;
  stackIdentity: string;
  dependencyManifestSha256: string;
  fileCount: number;
  files: ProfessorV3SmokeMaterialPinEntryV3[];
  sha256: string;
};

/** Successor runtime import closure — excludes external authorization root. */
export const PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V4: ProfessorV3SmokeMaterialSourceV3[] = [
  { label: "run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v1", path: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v1.ts") },
  { label: "phase6a1-professor-v3-smoke-material-pins-v4", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v4.ts") },
  { label: "phase6a1-professor-v3-smoke-failure-seal-v5", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v5.ts") },
  { label: "phase6a1-professor-v3-smoke-output-targets-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v3.ts") },
  { label: "phase6a1-professor-v3-plan-output-schema-v2", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-plan-output-schema-v2.ts") },
  { label: "phase6a1-professor-v3-successor-rag-preflight-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-successor-rag-preflight-v1.ts") },
  { label: "script-env", path: resolve(WEB, "scripts/lib/script-env.ts") },
  { label: "phase6a1-professor-v3-model-caller-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v3.ts") },
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

export function loadProfessorV3ReviewedExecutionIdentityV4(
  path: string = PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V4_PATH,
): ProfessorV3ReviewedExecutionIdentityV4 {
  if (!existsSync(path)) throw new Error(`Missing reviewed successor execution identity artifact: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as ProfessorV3ReviewedExecutionIdentityV4;
}

export function computeProfessorV3SmokeMaterialPinsV4(args?: { sources?: ProfessorV3SmokeMaterialSourceV3[] }) {
  return computeProfessorV3SmokeMaterialPinsV3({ sources: args?.sources ?? PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V4 });
}

export function sealProfessorV3SmokeExecutionPinsV4(args?: {
  decision?: string;
  stackIdentity?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionPinsV4 {
  const files = computeProfessorV3SmokeMaterialPinsV4({ sources: args?.sources });
  const dependencyManifestSha256 = computeDependencyManifestSha256V3(files);
  const payload = {
    version: "phase6a1-professor-v3-smoke-execution-pins-v4-successor" as const,
    decision:
      args?.decision ??
      "PROFESSOR_V3_SPENT_FAILURE_REPAIR_V1_BLOCK_STRUCTURED_OUTPUT_SCHEMA_API_INCOMPATIBLE_AND_SUCCESSOR_EXECUTION_DELTA_REQUIRED",
    sealedAt: new Date().toISOString(),
    stackIdentity: args?.stackIdentity ?? "professor-v3-muldrotha-smoke-execution-tree-v4-successor",
    dependencyManifestSha256,
    fileCount: files.length,
    files,
  };
  return { ...payload, sha256: hashPinPayloadV3(payload) };
}

export function loadProfessorV3SmokeExecutionPinsV4(path: string = PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH): ProfessorV3SmokeExecutionPinsV4 {
  if (!existsSync(path)) throw new Error(`Missing successor execution pins: ${path}`);
  const pin = JSON.parse(readFileSync(path, "utf8")) as ProfessorV3SmokeExecutionPinsV4;
  const { sha256: _ignored, ...payload } = pin;
  const expected = hashPinPayloadV3(payload);
  if (pin.sha256 !== expected) {
    throw new Error(`Successor execution pins JSON internal SHA256 mismatch: got ${pin.sha256}, expected ${expected}`);
  }
  return pin;
}

export type ProfessorV3SmokeExecutionIdentityVerificationV4 =
  | {
      ok: true;
      identity: ProfessorV3ReviewedExecutionIdentityV4;
      pins: ProfessorV3SmokeExecutionPinsV4;
      current: ProfessorV3SmokeMaterialPinEntryV3[];
    }
  | {
      ok: false;
      reason: string;
      identity: ProfessorV3ReviewedExecutionIdentityV4;
      details?: Record<string, string>;
    };

export function verifyProfessorV3SmokeExecutionIdentityV4(args?: {
  pinsPath?: string;
  identityPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
  identity?: ProfessorV3ReviewedExecutionIdentityV4;
}): ProfessorV3SmokeExecutionIdentityVerificationV4 {
  const identity = args?.identity ?? loadProfessorV3ReviewedExecutionIdentityV4(args?.identityPath);
  const pinsPath = args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH;
  const runnerPath = resolve(REPO, identity.executeRunnerRelativePath);
  const details: Record<string, string> = {};

  if (!existsSync(runnerPath)) return { ok: false, reason: "Missing successor execute runner", identity, details };
  if (!existsSync(pinsPath)) return { ok: false, reason: "Missing successor execution pins artifact", identity, details };

  const runnerSha = sha256File(runnerPath);
  if (runnerSha !== identity.executeRunnerSha256) details.runner = `expected ${identity.executeRunnerSha256}, got ${runnerSha}`;

  const pinsArtifactSha = sha256File(pinsPath);
  if (pinsArtifactSha !== identity.executionPinsArtifactSha256) {
    details.executionPinsArtifact = `expected ${identity.executionPinsArtifactSha256}, got ${pinsArtifactSha}`;
  }

  let pins: ProfessorV3SmokeExecutionPinsV4;
  try {
    pins = loadProfessorV3SmokeExecutionPinsV4(pinsPath);
  } catch (err) {
    return { ok: false, reason: "Successor execution pins JSON invalid", identity, details: { pinsJson: String(err) } };
  }

  const current = computeProfessorV3SmokeMaterialPinsV4({ sources: args?.sources });
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

  if (Object.keys(details).length > 0) return { ok: false, reason: "Reviewed successor execution identity mismatch", identity, details };
  return { ok: true, identity, pins, current };
}

export function assertProfessorV3SmokeExecutionIdentityV4(args?: Parameters<typeof verifyProfessorV3SmokeExecutionIdentityV4>[0]) {
  const result = verifyProfessorV3SmokeExecutionIdentityV4(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 successor smoke execution identity mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export type ProfessorV3SmokeExecutionAuthorizationVerificationV5 =
  | { ok: true; authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV5 }
  | {
      ok: false;
      reason: string;
      authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV5;
      details?: Record<string, string>;
    };

export function verifyProfessorV3SmokeExecutionAuthorizationV5(args?: {
  authorization?: ProfessorV3IndependentlyReviewedExecutionAuthorizationV5;
  identityPath?: string;
  pinsPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionAuthorizationVerificationV5 {
  const authorization = args?.authorization ?? PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V5;
  const identityPath = args?.identityPath ?? PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V4_PATH;
  const pinsPath = args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH;
  const runnerPath = resolve(REPO, authorization.executeRunnerRelativePath);
  const details: Record<string, string> = {};

  if (!existsSync(identityPath)) return { ok: false, reason: "Missing successor execution identity artifact", authorization, details };
  if (!existsSync(pinsPath)) return { ok: false, reason: "Missing successor execution pins artifact", authorization, details };
  if (!existsSync(runnerPath)) return { ok: false, reason: "Missing successor execute runner", authorization, details };

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

  const identity = loadProfessorV3ReviewedExecutionIdentityV4(identityPath);
  if (identity.executeRunnerSha256 !== authorization.executeRunnerSha256) {
    details.identityRunner = `identity JSON runner ${identity.executeRunnerSha256} != authorization ${authorization.executeRunnerSha256}`;
  }
  if (identity.executionPinsArtifactSha256 !== authorization.executionPinsArtifactSha256) {
    details.identityPinsArtifact = `identity JSON pins ${identity.executionPinsArtifactSha256} != authorization ${authorization.executionPinsArtifactSha256}`;
  }
  if (identity.dependencyManifestSha256 !== authorization.dependencyManifestSha256) {
    details.identityDependencyManifest = `identity JSON manifest ${identity.dependencyManifestSha256} != authorization ${authorization.dependencyManifestSha256}`;
  }

  const currentManifestSha = computeDependencyManifestSha256V3(computeProfessorV3SmokeMaterialPinsV4({ sources: args?.sources }));
  if (currentManifestSha !== authorization.dependencyManifestSha256) {
    details.dependencyManifest = `expected ${authorization.dependencyManifestSha256}, got ${currentManifestSha}`;
  }

  if (Object.keys(details).length > 0) return { ok: false, reason: "Independent successor execution authorization mismatch", authorization, details };
  return { ok: true, authorization };
}

export function assertProfessorV3SmokeExecutionAuthorizationV5(args?: Parameters<typeof verifyProfessorV3SmokeExecutionAuthorizationV5>[0]) {
  const result = verifyProfessorV3SmokeExecutionAuthorizationV5(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 successor smoke execution authorization mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export function assertProfessorV3SuccessorSmokeExecutionPreflightV5(args?: Parameters<typeof verifyProfessorV3SmokeExecutionIdentityV4>[0] & Parameters<typeof verifyProfessorV3SmokeExecutionAuthorizationV5>[0]) {
  assertProfessorV3SmokeExecutionAuthorizationV5(args);
  return assertProfessorV3SmokeExecutionIdentityV4(args);
}

export function buildProfessorV3SuccessorSmokeMaterialPinReportV1(
  identityVerification: Extract<ProfessorV3SmokeExecutionIdentityVerificationV4, { ok: true }>,
) {
  return {
    version: PROFESSOR_V3_SMOKE_MATERIAL_PINS_V4_VERSION,
    generatedAt: new Date().toISOString(),
    reviewedExecutionIdentity: identityVerification.identity,
    reviewedExecutionPinsArtifactSha256: identityVerification.identity.executionPinsArtifactSha256,
    dependencyManifestSha256: identityVerification.identity.dependencyManifestSha256,
    fileCount: identityVerification.current.length,
    files: identityVerification.current,
  };
}

export { sha256Bytes };

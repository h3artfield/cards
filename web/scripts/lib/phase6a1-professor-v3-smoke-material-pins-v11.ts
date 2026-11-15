/**
 * Chatterfang executable-stack import closure pins + identity verification (v11).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { assertProfessorV3MaxModelApiCallsPresentWhenAuthorizedV1 } from "./phase6a1-professor-v3-model-call-budget-v1";
import { assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1 } from "./phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import type { ProfessorV3CandidateExecutionAuthorizationV11 } from "./phase6a1-professor-v3-smoke-execution-authorization-v11";
import {
  PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
  PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_DECISION_V1,
} from "./phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1";
import {
  computeDependencyManifestSha256 as computeDependencyManifestSha256V3,
  computeProfessorV3SmokeMaterialPins as computeProfessorV3SmokeMaterialPinsV3,
  hashPinPayload as hashPinPayloadV3,
  sha256Bytes,
  type ProfessorV3SmokeMaterialPinEntryV3,
  type ProfessorV3SmokeMaterialSourceV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v3";
import {
  auditRuntimeLocalImportClosureV1,
  auditRuntimeMaterialInputBindingV1,
  buildMaterialInputSourcesV1,
  buildMaterialSourcesFromClosureV1,
  buildProfessorV3ChatterfangRequiredRuntimeMaterialInputSourcesV1,
  CHATTERFANG_EXECUTE_RUNNER_PATH,
  collectRuntimeLocalImportClosureV1,
  mergeProfessorV3SmokeMaterialSourcesV1,
  professorV3ChatterfangRequiredRuntimeMaterialInputPathSetV1,
  PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS,
  PROFESSOR_V3_CHATTERFANG_REQUIRED_RUNTIME_MATERIAL_INPUTS_V1,
} from "./phase6a1-professor-v3-runtime-local-import-closure-v1";

export const PROFESSOR_V3_SMOKE_MATERIAL_PINS_V11_VERSION = "phase6a1-professor-v3-smoke-material-pins-v11";
export const PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1.json",
);
export const PROFESSOR_V3_SMOKE_EXECUTION_PINS_V11_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1.json",
);

export type ProfessorV3ReviewedExecutionIdentityV11 = {
  version: "phase6a1-professor-v3-smoke-execution-identity-v11-chatterfang-executable-v1";
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

export type ProfessorV3SmokeExecutionPinsV11 = {
  version: "phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1";
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

const CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS = new Set(
  PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS,
);

/** Chatterfang executable runtime local import closure — module graph only; excludes external auth anchors. */
export function resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11(): ProfessorV3SmokeMaterialSourceV3[] {
  const { closure } = collectRuntimeLocalImportClosureV1(CHATTERFANG_EXECUTE_RUNNER_PATH, {
    externalAbsolutePaths: CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS,
  });
  const materialInputPaths = professorV3ChatterfangRequiredRuntimeMaterialInputPathSetV1();
  const moduleClosure = [...closure].filter((path) => !materialInputPaths.has(path));
  return buildMaterialSourcesFromClosureV1(moduleClosure);
}

/** Reviewed static local runtime inputs read from disk outside the import closure. */
export function resolveProfessorV3ChatterfangRuntimeMaterialInputSourcesV11(): ProfessorV3SmokeMaterialSourceV3[] {
  return buildProfessorV3ChatterfangRequiredRuntimeMaterialInputSourcesV1();
}

/** Final reviewed execution material set = runtime module import closure ∪ runtime material inputs. */
export function resolveProfessorV3ChatterfangExecutableMaterialSourcesV11(): ProfessorV3SmokeMaterialSourceV3[] {
  const moduleSources = resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11();
  const materialInputSources = resolveProfessorV3ChatterfangRuntimeMaterialInputSourcesV11();
  return mergeProfessorV3SmokeMaterialSourcesV1(moduleSources, materialInputSources);
}

export const PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V11: ProfessorV3SmokeMaterialSourceV3[] =
  resolveProfessorV3ChatterfangExecutableMaterialSourcesV11();

export function verifyProfessorV3ChatterfangRuntimeLocalImportClosureV11(args?: {
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}):
  | { ok: true; audit: ReturnType<typeof auditRuntimeLocalImportClosureV1> }
  | {
      ok: false;
      reason: string;
      audit: ReturnType<typeof auditRuntimeLocalImportClosureV1>;
      details?: Record<string, string>;
    } {
  const moduleSources = args?.sources ?? resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11();
  const audit = auditRuntimeLocalImportClosureV1({
    entryPath: CHATTERFANG_EXECUTE_RUNNER_PATH,
    pinnedAbsolutePaths: moduleSources.map((source) => source.path),
    externalAbsolutePaths: CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS,
  });
  if (audit.pass) return { ok: true, audit };

  const details: Record<string, string> = {};
  if (audit.unpinnedLocalImports.length > 0) {
    details.unpinnedLocalImports = audit.unpinnedLocalImports.join("; ");
  }
  if (audit.extraPinnedNotInClosure.length > 0) {
    details.extraPinnedNotInClosure = audit.extraPinnedNotInClosure.join("; ");
  }
  return {
    ok: false,
    reason: "Chatterfang executable runtime local import closure mismatch",
    audit,
    details,
  };
}

export function verifyProfessorV3ChatterfangRuntimeMaterialInputBindingV11(args?: {
  moduleSources?: ProfessorV3SmokeMaterialSourceV3[];
  materialInputSources?: ProfessorV3SmokeMaterialSourceV3[];
  fullSources?: ProfessorV3SmokeMaterialSourceV3[];
}):
  | { ok: true; audit: ReturnType<typeof auditRuntimeMaterialInputBindingV1> }
  | {
      ok: false;
      reason: string;
      audit: ReturnType<typeof auditRuntimeMaterialInputBindingV1>;
      details?: Record<string, string>;
    } {
  const moduleSources = args?.moduleSources ?? resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11();
  const materialInputSources =
    args?.materialInputSources ?? resolveProfessorV3ChatterfangRuntimeMaterialInputSourcesV11();
  const fullSources = args?.fullSources ?? mergeProfessorV3SmokeMaterialSourcesV1(moduleSources, materialInputSources);
  const audit = auditRuntimeMaterialInputBindingV1({
    moduleClosurePaths: moduleSources.map((source) => source.path),
    materialInputPaths: materialInputSources.map((source) => source.path),
    pinnedAbsolutePaths: fullSources.map((source) => source.path),
  });
  const details: Record<string, string> = {};
  if (!audit.pass) {
    if (audit.missingRequiredMaterialInputs.length > 0) {
      details.missingRequiredMaterialInputs = audit.missingRequiredMaterialInputs.join("; ");
    }
    if (audit.unpinnedMaterialInputs.length > 0) {
      details.unpinnedMaterialInputs = audit.unpinnedMaterialInputs.join("; ");
    }
    if (audit.extraMaterialInputsNotDiscovered.length > 0) {
      details.extraMaterialInputsNotDiscovered = audit.extraMaterialInputsNotDiscovered.join("; ");
    }
    return {
      ok: false,
      reason: "Chatterfang runtime material input binding mismatch",
      audit,
      details,
    };
  }

  const requiredPaths = PROFESSOR_V3_CHATTERFANG_REQUIRED_RUNTIME_MATERIAL_INPUTS_V1.map((source) => source.path);
  const pinnedPaths = new Set(fullSources.map((source) => source.path));
  for (const requiredPath of requiredPaths) {
    if (!pinnedPaths.has(requiredPath)) {
      details[`missingRequiredMaterialInput:${requiredPath}`] = "required runtime material input missing from final pins";
    }
  }

  if (Object.keys(details).length > 0) {
    return { ok: false, reason: "Chatterfang required runtime material input missing from final pins", audit, details };
  }

  return { ok: true, audit };
}

export function assertProfessorV3ChatterfangRuntimeMaterialInputBindingV11(
  args?: Parameters<typeof verifyProfessorV3ChatterfangRuntimeMaterialInputBindingV11>[0],
) {
  const result = verifyProfessorV3ChatterfangRuntimeMaterialInputBindingV11(args);
  if (!result.ok) {
    const detail = result.details
      ? Object.entries(result.details)
          .map(([key, value]) => `${key}=${value}`)
          .join("; ")
      : result.reason;
    throw new Error(
      `FAIL_CLOSED: Professor v3 Chatterfang runtime material input binding failed — ${result.reason}: ${detail}`,
    );
  }
  return result;
}

export function assertProfessorV3ChatterfangRuntimeLocalImportClosureV11(
  args?: Parameters<typeof verifyProfessorV3ChatterfangRuntimeLocalImportClosureV11>[0],
) {
  const result = verifyProfessorV3ChatterfangRuntimeLocalImportClosureV11(args);
  if (!result.ok) {
    const detail = result.details
      ? Object.entries(result.details)
          .map(([key, value]) => `${key}=${value}`)
          .join("; ")
      : result.reason;
    throw new Error(
      `FAIL_CLOSED: Professor v3 Chatterfang runtime local import closure audit failed — ${result.reason}: ${detail}`,
    );
  }
  return result;
}

export function loadProfessorV3ReviewedExecutionIdentityV11(
  path: string = PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH,
): ProfessorV3ReviewedExecutionIdentityV11 {
  if (!existsSync(path)) throw new Error(`Missing reviewed prospective execution identity artifact: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as ProfessorV3ReviewedExecutionIdentityV11;
}

export function computeProfessorV3SmokeMaterialPinsV11(args?: { sources?: ProfessorV3SmokeMaterialSourceV3[] }) {
  return computeProfessorV3SmokeMaterialPinsV3({ sources: args?.sources ?? PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V11 });
}

export function sealProfessorV3SmokeExecutionPinsV11(args?: {
  decision?: string;
  stackIdentity?: string;
  prospectiveCaseId?: string;
  mechanismTruthCaseId?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionPinsV11 {
  const files = computeProfessorV3SmokeMaterialPinsV11({ sources: args?.sources });
  const dependencyManifestSha256 = computeDependencyManifestSha256V3(files);
  const payload = {
    version: "phase6a1-professor-v3-smoke-execution-pins-v11-chatterfang-executable-v1" as const,
    decision: args?.decision ?? PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_DECISION_V1,
    sealedAt: new Date().toISOString(),
    stackIdentity: args?.stackIdentity ?? "professor-v3-chatterfang-smoke-execution-tree-v1-prospective",
    prospectiveCaseId: args?.prospectiveCaseId ?? "professor-v3-smoke-chatterfang-prospective-v1",
    mechanismTruthCaseId: args?.mechanismTruthCaseId ?? "multi-chatterfang",
    dependencyManifestSha256,
    fileCount: files.length,
    files,
  };
  return { ...payload, sha256: hashPinPayloadV3(payload) };
}

export function loadProfessorV3SmokeExecutionPinsV11(path: string = PROFESSOR_V3_SMOKE_EXECUTION_PINS_V11_PATH): ProfessorV3SmokeExecutionPinsV11 {
  if (!existsSync(path)) throw new Error(`Missing prospective execution pins: ${path}`);
  const pin = JSON.parse(readFileSync(path, "utf8")) as ProfessorV3SmokeExecutionPinsV11;
  const { sha256: _ignored, ...payload } = pin;
  const expected = hashPinPayloadV3(payload);
  if (pin.sha256 !== expected) {
    throw new Error(`Prospective execution pins JSON internal SHA256 mismatch: got ${pin.sha256}, expected ${expected}`);
  }
  return pin;
}

export type ProfessorV3SmokeExecutionIdentityVerificationV11 =
  | {
      ok: true;
      identity: ProfessorV3ReviewedExecutionIdentityV11;
      pins: ProfessorV3SmokeExecutionPinsV11;
      current: ProfessorV3SmokeMaterialPinEntryV3[];
    }
  | {
      ok: false;
      reason: string;
      identity: ProfessorV3ReviewedExecutionIdentityV11;
      details?: Record<string, string>;
    };

export function verifyProfessorV3SmokeExecutionIdentityV11(args?: {
  pinsPath?: string;
  identityPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
  identity?: ProfessorV3ReviewedExecutionIdentityV11;
}): ProfessorV3SmokeExecutionIdentityVerificationV11 {
  const identity = args?.identity ?? loadProfessorV3ReviewedExecutionIdentityV11(args?.identityPath);
  const pinsPath = args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V11_PATH;
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

  let pins: ProfessorV3SmokeExecutionPinsV11;
  try {
    pins = loadProfessorV3SmokeExecutionPinsV11(pinsPath);
  } catch (err) {
    return { ok: false, reason: "Prospective execution pins JSON invalid", identity, details: { pinsJson: String(err) } };
  }

  const moduleSources = resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11();
  const materialInputSources = resolveProfessorV3ChatterfangRuntimeMaterialInputSourcesV11();
  const resolvedSources =
    args?.sources ??
    mergeProfessorV3SmokeMaterialSourcesV1(moduleSources, materialInputSources);
  const closureVerification = verifyProfessorV3ChatterfangRuntimeLocalImportClosureV11({ sources: moduleSources });
  if (!closureVerification.ok) {
    details.runtimeLocalImportClosure = closureVerification.reason;
    if (closureVerification.details) Object.assign(details, closureVerification.details);
  }
  const materialInputVerification = verifyProfessorV3ChatterfangRuntimeMaterialInputBindingV11({
    moduleSources,
    materialInputSources,
    fullSources: resolvedSources,
  });
  if (!materialInputVerification.ok) {
    details.runtimeMaterialInputBinding = materialInputVerification.reason;
    if (materialInputVerification.details) Object.assign(details, materialInputVerification.details);
  }

  const current = computeProfessorV3SmokeMaterialPinsV11({ sources: resolvedSources });
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

export function assertProfessorV3SmokeExecutionIdentityV11(args?: Parameters<typeof verifyProfessorV3SmokeExecutionIdentityV11>[0]) {
  const result = verifyProfessorV3SmokeExecutionIdentityV11(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 prospective smoke execution identity mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export type ProfessorV3SmokeExecutionAuthorizationVerificationV10 =
  | { ok: true; authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 }
  | {
      ok: false;
      reason: string;
      authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
      details?: Record<string, string>;
    };

export function verifyProfessorV3SmokeExecutionAuthorizationV10(args?: {
  authorization?: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  identityPath?: string;
  pinsPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionAuthorizationVerificationV10 {
  const authorization = args?.authorization ?? PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1;
  const identityPath = args?.identityPath ?? resolve(REPO, authorization.executionIdentityArtifactRelativePath);
  const pinsPath = args?.pinsPath ?? resolve(REPO, authorization.executionPinsArtifactRelativePath);
  const runnerPath = resolve(REPO, authorization.executeRunnerRelativePath);
  const details: Record<string, string> = {};

  try {
    assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1(authorization);
  } catch (err) {
    return { ok: false, reason: "Authorization decision semantic mismatch", authorization, details: { decision: String(err) } };
  }

  try {
    assertProfessorV3MaxModelApiCallsPresentWhenAuthorizedV1({
      modelExecutionAuthorized: authorization.modelExecutionAuthorized,
      maxModelApiCalls: authorization.maxModelApiCalls,
      decision: authorization.decision,
    });
  } catch (err) {
    return { ok: false, reason: "Authorization maxModelApiCalls missing or invalid", authorization, details: { maxModelApiCalls: String(err) } };
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

  const identity = loadProfessorV3ReviewedExecutionIdentityV11(identityPath);
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

  const currentManifestSha = computeDependencyManifestSha256V3(
    computeProfessorV3SmokeMaterialPinsV11({
      sources: args?.sources ?? resolveProfessorV3ChatterfangExecutableMaterialSourcesV11(),
    }),
  );
  if (currentManifestSha !== authorization.dependencyManifestSha256) {
    details.dependencyManifest = `expected ${authorization.dependencyManifestSha256}, got ${currentManifestSha}`;
  }

  if (Object.keys(details).length > 0) return { ok: false, reason: "Independent prospective execution authorization mismatch", authorization, details };
  return { ok: true, authorization };
}

export function assertProfessorV3SmokeExecutionAuthorizationV10(args?: Parameters<typeof verifyProfessorV3SmokeExecutionAuthorizationV10>[0]) {
  const result = verifyProfessorV3SmokeExecutionAuthorizationV10(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 prospective smoke execution authorization mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export type ProfessorV3SmokeExecutionAuthorizationVerificationV11 =
  | { ok: true; authorization: ProfessorV3CandidateExecutionAuthorizationV11 }
  | {
      ok: false;
      reason: string;
      authorization: ProfessorV3CandidateExecutionAuthorizationV11;
      details?: Record<string, string>;
    };

export function verifyProfessorV3CandidateExecutionAuthorizationV11(args?: {
  authorization?: ProfessorV3CandidateExecutionAuthorizationV11;
  identityPath?: string;
  pinsPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV3[];
}): ProfessorV3SmokeExecutionAuthorizationVerificationV11 {
  const authorization = args?.authorization ?? PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1;
  const result = verifyProfessorV3SmokeExecutionAuthorizationV10({
    ...args,
    authorization,
    identityPath: args?.identityPath ?? PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH,
    pinsPath: args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V11_PATH,
  });
  return result as ProfessorV3SmokeExecutionAuthorizationVerificationV11;
}

export function assertProfessorV3CandidateExecutionAuthorizationV11(
  args?: Parameters<typeof verifyProfessorV3CandidateExecutionAuthorizationV11>[0],
) {
  const result = verifyProfessorV3CandidateExecutionAuthorizationV11(args);
  if (!result.ok) {
    const detail = result.details ? Object.entries(result.details).map(([k, v]) => `${k}=${v}`).join("; ") : result.reason;
    throw new Error(`FAIL_CLOSED: Professor v3 Chatterfang candidate execution authorization mismatch — ${result.reason}: ${detail}`);
  }
  return result;
}

export function assertProfessorV3ChatterfangExecutableSmokeExecutionPreflightV11(
  args?: Parameters<typeof verifyProfessorV3SmokeExecutionIdentityV11>[0] &
    Parameters<typeof verifyProfessorV3CandidateExecutionAuthorizationV11>[0],
) {
  assertProfessorV3ChatterfangRuntimeLocalImportClosureV11();
  assertProfessorV3ChatterfangRuntimeMaterialInputBindingV11();
  assertProfessorV3CandidateExecutionAuthorizationV11(args);
  return assertProfessorV3SmokeExecutionIdentityV11({
    ...args,
    identityPath: args?.identityPath ?? PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH,
    pinsPath: args?.pinsPath ?? PROFESSOR_V3_SMOKE_EXECUTION_PINS_V11_PATH,
  });
}

export function buildProfessorV3ChatterfangExecutableSmokeMaterialPinReportV1(
  identityVerification: Extract<ProfessorV3SmokeExecutionIdentityVerificationV11, { ok: true }>,
) {
  return {
    version: PROFESSOR_V3_SMOKE_MATERIAL_PINS_V11_VERSION,
    generatedAt: new Date().toISOString(),
    reviewedExecutionIdentity: identityVerification.identity,
    reviewedExecutionPinsArtifactSha256: identityVerification.identity.executionPinsArtifactSha256,
    dependencyManifestSha256: identityVerification.identity.dependencyManifestSha256,
    fileCount: identityVerification.current.length,
    files: identityVerification.current,
  };
}

export { sha256Bytes };

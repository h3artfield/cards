/**
 * Deterministic runtime-input-v8 structural/schema validation against pinned sidecar contract.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Lens } from "./phase6a1-closure-design-v3-matrix";
import { LENSES } from "./phase6a1-closure-design-v3-matrix";
import { isOracleClauseRef } from "./phase6a1-oracle-clause-evidence-v8";
import { REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import type { RuntimeInputV8 } from "./phase6a1-professor-plan-serializer-v1";

export const PROFESSOR_PLAN_RUNTIME_INPUT_V8_SCHEMA_VALIDATOR_V1_VERSION =
  "phase6a1-professor-plan-runtime-input-v8-schema-validator-v1";

const RUNTIME_SCHEMA_SIDECAR_PATH = resolve(
  REPO,
  "web/data/milestones/deck-synthesis/phase6a1-semantic-closure-runtime-input-schema-v8.json",
);

type RuntimeSchemaSidecarV8 = {
  version: string;
  schemaVersion: string;
  requiredTopLevelFields: string[];
  roleClassificationArchitecture: string;
  prohibitedRuntimeFields: string[];
  commanderEvidenceRefPattern: string;
  dependentHypothesisEvidenceRule: string;
};

export type RuntimeInputV8SchemaIssue = {
  code: string;
  message: string;
  path?: string;
};

export type RuntimeInputV8SchemaValidationResult = {
  pass: boolean;
  issues: RuntimeInputV8SchemaIssue[];
  runtimeSchemaSidecarSha256: string;
};

function issue(code: string, message: string, path?: string): RuntimeInputV8SchemaIssue {
  return { code, message, path };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function loadRuntimeSchemaSidecarV8(): RuntimeSchemaSidecarV8 {
  return JSON.parse(readFileSync(RUNTIME_SCHEMA_SIDECAR_PATH, "utf8")) as RuntimeSchemaSidecarV8;
}

function validateLensPackage(value: unknown, path: string, issues: RuntimeInputV8SchemaIssue[]): void {
  if (!value || typeof value !== "object") {
    issues.push(issue("INVALID_PACKAGE", "Package must be an object", path));
    return;
  }
  const pkg = value as Record<string, unknown>;
  if (!isNonEmptyString(pkg.packageRefId)) issues.push(issue("INVALID_PACKAGE", "packageRefId required", `${path}.packageRefId`));
  if (!isNonEmptyString(pkg.thesis)) issues.push(issue("INVALID_PACKAGE", "thesis required", `${path}.thesis`));
  if (pkg.validatorStatus !== "VALID" && pkg.validatorStatus !== "INVALID") {
    issues.push(issue("INVALID_PACKAGE", "validatorStatus must be VALID or INVALID", `${path}.validatorStatus`));
  }
  if (!isStringArray(pkg.producedResources)) issues.push(issue("INVALID_PACKAGE", "producedResources must be string[]", `${path}.producedResources`));
  if (!isStringArray(pkg.requiredResources)) issues.push(issue("INVALID_PACKAGE", "requiredResources must be string[]", `${path}.requiredResources`));
  if (!isStringArray(pkg.semanticRequirements)) {
    issues.push(issue("INVALID_PACKAGE", "semanticRequirements must be string[]", `${path}.semanticRequirements`));
  }
  if (!isStringArray(pkg.payoffs)) issues.push(issue("INVALID_PACKAGE", "payoffs must be string[]", `${path}.payoffs`));
}

function validateLensHypothesis(value: unknown, path: string, issues: RuntimeInputV8SchemaIssue[]): void {
  if (!value || typeof value !== "object") {
    issues.push(issue("INVALID_HYPOTHESIS", "Hypothesis must be an object", path));
    return;
  }
  const h = value as Record<string, unknown>;
  if (!isNonEmptyString(h.hypothesisId)) issues.push(issue("INVALID_HYPOTHESIS", "hypothesisId required", `${path}.hypothesisId`));
  if (!isNonEmptyString(h.strategyStatement)) {
    issues.push(issue("INVALID_HYPOTHESIS", "strategyStatement required", `${path}.strategyStatement`));
  }
  if (!isStringArray(h.engineInputs)) issues.push(issue("INVALID_HYPOTHESIS", "engineInputs must be string[]", `${path}.engineInputs`));
  if (!isStringArray(h.engineOutputs)) issues.push(issue("INVALID_HYPOTHESIS", "engineOutputs must be string[]", `${path}.engineOutputs`));
  if (!isStringArray(h.commanderDependencies)) {
    issues.push(issue("INVALID_HYPOTHESIS", "commanderDependencies must be string[]", `${path}.commanderDependencies`));
  }
  if (!isStringArray(h.resourceTransformations)) {
    issues.push(issue("INVALID_HYPOTHESIS", "resourceTransformations must be string[]", `${path}.resourceTransformations`));
  }
}

function validateResourceGraph(value: unknown, path: string, issues: RuntimeInputV8SchemaIssue[]): void {
  if (!value || typeof value !== "object") {
    issues.push(issue("INVALID_RESOURCE_GRAPH", "resourceGraph must be an object", path));
    return;
  }
  const graph = value as Record<string, unknown>;
  if (!Array.isArray(graph.nodes)) issues.push(issue("INVALID_RESOURCE_GRAPH", "nodes must be array", `${path}.nodes`));
  if (!Array.isArray(graph.edges)) issues.push(issue("INVALID_RESOURCE_GRAPH", "edges must be array", `${path}.edges`));
}

function validateLensFixture(value: unknown, lens: Lens, issues: RuntimeInputV8SchemaIssue[]): void {
  const path = `lenses.${lens}`;
  if (!value || typeof value !== "object") {
    issues.push(issue("INVALID_LENS", "Lens fixture must be an object", path));
    return;
  }
  const lensObj = value as Record<string, unknown>;
  if (!Array.isArray(lensObj.hypotheses)) issues.push(issue("INVALID_LENS", "hypotheses must be array", `${path}.hypotheses`));
  else lensObj.hypotheses.forEach((h, i) => validateLensHypothesis(h, `${path}.hypotheses[${i}]`, issues));
  if (!Array.isArray(lensObj.validatedPackages)) {
    issues.push(issue("INVALID_LENS", "validatedPackages must be array", `${path}.validatedPackages`));
  } else {
    lensObj.validatedPackages.forEach((p, i) => validateLensPackage(p, `${path}.validatedPackages[${i}]`, issues));
  }
  if (!Array.isArray(lensObj.rejectedPackages)) {
    issues.push(issue("INVALID_LENS", "rejectedPackages must be array", `${path}.rejectedPackages`));
  } else {
    lensObj.rejectedPackages.forEach((p, i) => validateLensPackage(p, `${path}.rejectedPackages[${i}]`, issues));
  }
  validateResourceGraph(lensObj.resourceGraph, `${path}.resourceGraph`, issues);
}

function validateSerializationProvenance(value: unknown, issues: RuntimeInputV8SchemaIssue[]): void {
  const path = "serializationProvenance";
  if (!value || typeof value !== "object") {
    issues.push(issue("MISSING_SERIALIZATION_PROVENANCE", "serializationProvenance required for pilot runtime", path));
    return;
  }
  const prov = value as Record<string, unknown>;
  const required = [
    "serializerVersion",
    "sourceProfessorRecordVersion",
    "validatedPackageIds",
    "rejectedPackageIds",
    "packageSynergyTypedEdges",
    "threeLensPortfolio",
    "requiredSemanticProjection",
    "requiredSemanticProjectionSha256",
    "planningEvidenceDigestSha256",
  ];
  for (const key of required) {
    if (!(key in prov)) issues.push(issue("MISSING_PROVENANCE_FIELD", `Missing ${key}`, `${path}.${key}`));
  }
  if (!isStringArray(prov.validatedPackageIds)) {
    issues.push(issue("INVALID_PROVENANCE_FIELD", "validatedPackageIds must be string[]", `${path}.validatedPackageIds`));
  }
  if (!isStringArray(prov.rejectedPackageIds)) {
    issues.push(issue("INVALID_PROVENANCE_FIELD", "rejectedPackageIds must be string[]", `${path}.rejectedPackageIds`));
  }
  if (typeof prov.requiredSemanticProjectionSha256 !== "string" || String(prov.requiredSemanticProjectionSha256).length !== 64) {
    issues.push(issue("INVALID_PROVENANCE_FIELD", "requiredSemanticProjectionSha256 must be 64-char hex", `${path}.requiredSemanticProjectionSha256`));
  }
}

function validateDependentHypothesisEvidenceRule(runtime: RuntimeInputV8, sidecar: RuntimeSchemaSidecarV8, issues: RuntimeInputV8SchemaIssue[]): void {
  const oracleText = runtime.frozenFacts?.commanderOracleText ?? "";
  if (oracleText.trim().length === 0) return;
  const depHypotheses = runtime.lenses.DEPENDENT_SYNERGY.hypotheses;
  for (let i = 0; i < depHypotheses.length; i++) {
    const refs = depHypotheses[i].commanderEvidenceRefs ?? [];
    if (refs.length === 0) {
      issues.push(
        issue(
          "DEPENDENT_HYPOTHESIS_EVIDENCE_RULE",
          sidecar.dependentHypothesisEvidenceRule,
          `lenses.DEPENDENT_SYNERGY.hypotheses[${i}]`,
        ),
      );
      continue;
    }
    const pattern = new RegExp(sidecar.commanderEvidenceRefPattern);
    for (const ref of refs) {
      if (!isOracleClauseRef(ref) || !pattern.test(ref)) {
        issues.push(issue("INVALID_COMMANDER_EVIDENCE_REF", `Invalid commanderEvidenceRef ${ref}`, `lenses.DEPENDENT_SYNERGY.hypotheses[${i}]`));
      }
    }
  }
}

export function validateRuntimeInputV8SchemaV1(runtime: RuntimeInputV8): RuntimeInputV8SchemaValidationResult {
  const sidecar = loadRuntimeSchemaSidecarV8();
  const runtimeSchemaSidecarSha256 = sha256File(RUNTIME_SCHEMA_SIDECAR_PATH);
  const issues: RuntimeInputV8SchemaIssue[] = [];
  const obj = runtime as unknown as Record<string, unknown>;

  for (const field of sidecar.prohibitedRuntimeFields) {
    if (field in obj) issues.push(issue("PROHIBITED_RUNTIME_FIELD", `Prohibited top-level field ${field}`, field));
  }

  for (const field of sidecar.requiredTopLevelFields) {
    if (!(field in obj) || obj[field] == null) {
      issues.push(issue("MISSING_REQUIRED_FIELD", `Missing required top-level field ${field}`, field));
    }
  }

  if (runtime.runtimeSchemaVersion !== sidecar.schemaVersion) {
    issues.push(
      issue(
        "SCHEMA_VERSION_MISMATCH",
        `runtimeSchemaVersion must be ${sidecar.schemaVersion}`,
        "runtimeSchemaVersion",
      ),
    );
  }
  if (runtime.roleClassificationArchitecture !== sidecar.roleClassificationArchitecture) {
    issues.push(
      issue(
        "ROLE_CLASSIFICATION_ARCHITECTURE_MISMATCH",
        `roleClassificationArchitecture must be ${sidecar.roleClassificationArchitecture}`,
        "roleClassificationArchitecture",
      ),
    );
  }
  if (!isNonEmptyString(runtime.caseId)) issues.push(issue("INVALID_CASE_ID", "caseId must be non-empty string", "caseId"));
  if (!Array.isArray(runtime.commanders) || runtime.commanders.length === 0 || !runtime.commanders.every(isNonEmptyString)) {
    issues.push(issue("INVALID_COMMANDERS", "commanders must be non-empty string[]", "commanders"));
  }
  const validCz = new Set(["single_commander", "partner_pair", "commander_with_background"]);
  if (!validCz.has(runtime.commandZoneConfiguration)) {
    issues.push(issue("INVALID_COMMAND_ZONE_CONFIGURATION", "invalid commandZoneConfiguration", "commandZoneConfiguration"));
  }
  if (!runtime.frozenFacts || typeof runtime.frozenFacts !== "object") {
    issues.push(issue("INVALID_FROZEN_FACTS", "frozenFacts must be object", "frozenFacts"));
  }
  if (!Array.isArray(runtime.frozenOpportunities)) {
    issues.push(issue("INVALID_FROZEN_OPPORTUNITIES", "frozenOpportunities must be array", "frozenOpportunities"));
  } else {
    runtime.frozenOpportunities.forEach((o, i) => {
      if (!isNonEmptyString(o.opportunityId)) issues.push(issue("INVALID_OPPORTUNITY", "opportunityId required", `frozenOpportunities[${i}].opportunityId`));
      if (!isNonEmptyString(o.description)) issues.push(issue("INVALID_OPPORTUNITY", "description required", `frozenOpportunities[${i}].description`));
      if (o.status !== "AVAILABLE" && o.status !== "UNAVAILABLE") {
        issues.push(issue("INVALID_OPPORTUNITY", "status must be AVAILABLE or UNAVAILABLE", `frozenOpportunities[${i}].status`));
      }
    });
  }

  if (!runtime.lenses || typeof runtime.lenses !== "object") {
    issues.push(issue("INVALID_LENSES", "lenses must be object", "lenses"));
  } else {
    for (const lens of LENSES) validateLensFixture(runtime.lenses[lens], lens, issues);
  }

  validateSerializationProvenance(runtime.serializationProvenance, issues);
  validateDependentHypothesisEvidenceRule(runtime, sidecar, issues);

  return {
    pass: issues.length === 0,
    issues,
    runtimeSchemaSidecarSha256,
  };
}

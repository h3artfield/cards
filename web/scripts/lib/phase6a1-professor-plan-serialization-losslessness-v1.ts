/**
 * Semantic losslessness gate for Professor → runtime-input-v8 serialization.
 */
import type { RuntimeInputV8 } from "./phase6a1-professor-plan-serializer-v1";
import type { ProfessorCaseExperimentRecordV2 } from "./phase6a1-professor-plan-agent-v2";
import {
  buildRequiredSemanticProjectionFromRecord,
  buildRequiredSemanticProjectionFromRuntime,
  canonicalizeRequiredSemanticProjection,
  diffRequiredSemanticProjections,
  requiredSemanticProjectionSha256,
} from "./phase6a1-professor-plan-serialization-semantic-projection-v1";

export const PROFESSOR_PLAN_SERIALIZATION_LOSSLESSNESS_V1_VERSION =
  "phase6a1-professor-plan-serialization-losslessness-v1";

export type SemanticLosslessnessIssue = {
  code: string;
  message: string;
  path?: string;
};

export type SemanticLosslessnessResult = {
  pass: boolean;
  issues: SemanticLosslessnessIssue[];
  sourceProjectionSha256: string;
  runtimeProjectionSha256: string;
};

function issue(code: string, message: string, path?: string): SemanticLosslessnessIssue {
  return { code, message, path };
}

function planningEvidenceDigestMatches(record: ProfessorCaseExperimentRecordV2, runtime: RuntimeInputV8): boolean {
  const { planningEvidenceDigestSha256 } = runtime.serializationProvenance;
  return planningEvidenceDigestSha256.length === 64;
}

export function verifySemanticLosslessnessV1(args: {
  record: ProfessorCaseExperimentRecordV2;
  runtime: RuntimeInputV8;
}): SemanticLosslessnessResult {
  const issues: SemanticLosslessnessIssue[] = [];
  const { record, runtime } = args;

  if (!planningEvidenceDigestMatches(record, runtime)) {
    issues.push(issue("MISSING_EVIDENCE_DIGEST", "serializationProvenance.planningEvidenceDigestSha256 missing"));
  }

  const validatedIds = new Set(runtime.serializationProvenance.validatedPackageIds);
  for (const pkg of record.finalValidatedPackages) {
    if (!validatedIds.has(pkg.packageId)) {
      issues.push(issue("DROPPED_PACKAGE", `Validated package ${pkg.packageId} missing from provenance`, pkg.packageId));
    }
  }

  if (runtime.runtimeSchemaVersion !== "phase6a1-semantic-closure-runtime-input-v8") {
    issues.push(issue("SCHEMA_VERSION_MISMATCH", `Unexpected runtimeSchemaVersion ${runtime.runtimeSchemaVersion}`));
  }

  const prohibited = [
    "roleClaims",
    "expectedSatisfaction",
    "roleApplicability",
    "closureStatus",
    "repairTargets",
    "postGoldDefectClassTargets",
    "adjudicationStatus",
    "structuralRoleGaps",
    "advisoryRoleGaps",
  ] as const;
  for (const key of prohibited) {
    if (key in runtime) {
      issues.push(issue("PROHIBITED_RUNTIME_FIELD", `Prohibited runtime field present: ${key}`, key));
    }
  }

  const sourceProjection = buildRequiredSemanticProjectionFromRecord(record, {
    validatedPackageIds: runtime.serializationProvenance.validatedPackageIds,
    rejectedPackageIds: runtime.serializationProvenance.rejectedPackageIds,
    packageSynergyTypedEdges: runtime.serializationProvenance.packageSynergyTypedEdges,
  });
  const sourceProjectionSha256 = requiredSemanticProjectionSha256(sourceProjection);

  let runtimeProjectionSha256 = "";
  try {
    const runtimeProjection = buildRequiredSemanticProjectionFromRuntime(runtime);
    runtimeProjectionSha256 = requiredSemanticProjectionSha256(runtimeProjection);

    const storedSha = runtime.serializationProvenance.requiredSemanticProjectionSha256;
    if (storedSha !== runtimeProjectionSha256) {
      issues.push(
        issue(
          "PROVENANCE_PROJECTION_SHA_MISMATCH",
          "serializationProvenance.requiredSemanticProjectionSha256 does not match runtime projection bytes",
        ),
      );
    }

    if (canonicalizeRequiredSemanticProjection(sourceProjection) !== canonicalizeRequiredSemanticProjection(runtimeProjection)) {
      for (const diff of diffRequiredSemanticProjections(sourceProjection, runtimeProjection).slice(0, 32)) {
        issues.push(
          issue(
            "SERIALIZER_SEMANTIC_LOSS",
            `Semantic projection mismatch at ${diff.path}`,
            diff.path,
          ),
        );
      }
    }
  } catch (err) {
    issues.push(
      issue(
        "RUNTIME_PROJECTION_REBUILD_FAILURE",
        String(err instanceof Error ? err.message : err),
      ),
    );
  }

  return {
    pass: issues.length === 0,
    issues,
    sourceProjectionSha256,
    runtimeProjectionSha256,
  };
}

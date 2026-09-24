/**
 * Authoritative semantic-relationship source identity for Professor v3 smoke/readiness.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLAN_CONTEXT_BUILDER_V3_VERSION } from "./phase6a1-professor-plan-context-builder-v3";
import {
  SPENT_PILOT_MECHANISM_TRUTH_ADJUDICATION_V1_VERSION,
  SPENT_PILOT_CATALOG_ORACLE_PINS,
} from "./phase6a1-spent-pilot-mechanism-truth-adjudication-v1";

export const PROFESSOR_V3_SEMANTIC_RELATIONSHIP_SOURCE_V1_VERSION =
  "phase6a1-professor-v3-semantic-relationship-source-v1";

const PATHS = {
  mechanismTruthSupplement: resolve(MILESTONES, "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json"),
  opportunitySupplementV2: resolve(MILESTONES, "phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json"),
  frozenSemanticOpportunityModel: resolve(MILESTONES, "phase6a1-semantic-opportunity-model-v3.2.2.json"),
  factFamilyRules: resolve(REPO, "web/scripts/lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts"),
  contextBuilder: resolve(REPO, "web/scripts/lib/phase6a1-professor-plan-context-builder-v3.ts"),
} as const;

function filePin(label: string, absPath: string) {
  if (!existsSync(absPath)) {
    return { label, path: absPath.replace(/\\/g, "/"), exists: false as const };
  }
  return {
    label,
    path: absPath.replace(/\\/g, "/"),
    exists: true as const,
    version: label,
    sha256: sha256File(absPath),
    byteSize: readFileSync(absPath).length,
  };
}

export function buildProfessorV3SemanticRelationshipSourceIdentity(args: { caseId: string }) {
  const mechanismTruth = filePin("phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1", PATHS.mechanismTruthSupplement);
  const opportunitySupplement = filePin(
    "phase6a1-spent-pilot-semantic-opportunity-supplement-v2",
    PATHS.opportunitySupplementV2,
  );
  const frozenModel = filePin("phase6a1-semantic-opportunity-model-v3.2.2", PATHS.frozenSemanticOpportunityModel);
  const factFamilyRules = filePin("phase6a1-semantic-opportunity-fact-family-rules-v1", PATHS.factFamilyRules);
  const contextBuilder = filePin(PROFESSOR_PLAN_CONTEXT_BUILDER_V3_VERSION, PATHS.contextBuilder);

  const frozenModelContainsCase =
    frozenModel.exists &&
    readFileSync(PATHS.frozenSemanticOpportunityModel, "utf8").includes(`"caseId": "${args.caseId}"`);

  const truthSuppliedCrossMemberCount =
    args.caseId === "multi-muldrotha"
      ? 0
      : null;

  return {
    version: PROFESSOR_V3_SEMANTIC_RELATIONSHIP_SOURCE_V1_VERSION,
    caseId: args.caseId,
    wiredAuthority: PROFESSOR_PLAN_CONTEXT_BUILDER_V3_VERSION,
    mergeOrder: [
      "truth.crossMemberRelationshipsAsSupplied",
      "deriveCrossFactEdgesForCase (phase6a1-semantic-opportunity-fact-family-rules-v1)",
      "optional opportunityCase.crossFactEdges hints",
    ],
    sources: {
      mechanismTruthSupplement: mechanismTruth,
      opportunitySupplementV2: opportunitySupplement,
      frozenSemanticOpportunityModelV322: frozenModel,
      factFamilyRulesDeriver: factFamilyRules,
      contextBuilder,
    },
    caseSpecific: {
      separateFrozenV322CaseExists: frozenModelContainsCase,
      truthSuppliedCrossMemberRelationshipCount: truthSuppliedCrossMemberCount,
      muldrothaNote:
        args.caseId === "multi-muldrotha"
          ? "No separate Muldrotha relationship artifact in frozen v3.2.2 model. Mechanism truth crossMemberRelationshipsAsSupplied=[]; fact-family deriveCrossFactEdgesForCase returns [] for Muldrotha's two PLAY_PERMISSION facts; spent-pilot opportunity supplement crossFactEdges=[]. Semantic relationships for smoke are expected to be empty unless runtime derivation adds edges later."
          : undefined,
      oraclePin:
        args.caseId === "multi-muldrotha" ? SPENT_PILOT_CATALOG_ORACLE_PINS["multi-muldrotha"] : undefined,
      adjudicationVersion: SPENT_PILOT_MECHANISM_TRUTH_ADJUDICATION_V1_VERSION,
    },
  };
}

/**
 * Professor validated plan → runtime-input-v8 lossless serializer.
 */
import { createHash } from "node:crypto";
import type {
  SemanticPackage as ProfessorSemanticPackage,
  StrategyHypothesis,
  ThreeLensObjective,
  ThreeLensPortfolioSelection,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type { SemanticOpportunity } from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import type { ProfessorCaseExperimentRecordV2 } from "./phase6a1-professor-plan-agent-v2";
import type { CommanderCanonicalFacts } from "./phase6a1-closure-commander-canonical-facts-v6";
import type { Lens } from "./phase6a1-closure-design-v3-matrix";
import {
  aggregateSemanticEdgesForHarmony,
  enrichPackagesWithSynergyGraphV8,
  type PackageSynergyTypedEdge,
} from "./phase6a1-package-synergy-graph-v8";
import { selectMechanicClauses } from "./phase6a1-oracle-clause-evidence-v8";
import type {
  LensSemanticFixture,
  ResourceEdge,
  ResourceNode,
  SemanticHypothesis,
  SemanticPackage as RuntimeSemanticPackage,
} from "./phase6a1-semantic-fixture-templates-v4";
import { RUNTIME_SCHEMA_V8 } from "./phase6a1-semantic-fixture-builder-v8";
import type { GoldenCatalogIndex } from "./load-golden-catalog-index";
import { lookupGoldenByName } from "./load-golden-catalog-index";
import {
  buildRequiredSemanticProjectionFromRecord,
  requiredSemanticProjectionSha256,
  type RequiredSemanticProjectionV1,
} from "./phase6a1-professor-plan-serialization-semantic-projection-v1";

export const PROFESSOR_PLAN_SERIALIZER_V1_VERSION = "phase6a1-professor-plan-serializer-v1";

export type RuntimeInputV8 = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  runtimeSchemaVersion: typeof RUNTIME_SCHEMA_V8;
  roleClassificationArchitecture: "CLOSURE_INFERS_ROLES_OPTION_A";
  frozenFacts: CommanderCanonicalFacts;
  frozenOpportunities: Array<{
    opportunityId: string;
    description: string;
    status: "AVAILABLE" | "UNAVAILABLE";
  }>;
  lenses: Record<Lens, LensSemanticFixture>;
  serializationProvenance: {
    serializerVersion: typeof PROFESSOR_PLAN_SERIALIZER_V1_VERSION;
    sourceProfessorRecordVersion: string;
    professorCaseAttemptId?: string;
    validatedPackageIds: string[];
    rejectedPackageIds: string[];
    packageSynergyTypedEdges: PackageSynergyTypedEdge[];
    threeLensPortfolio: ThreeLensPortfolioSelection;
    requiredSemanticProjection: RequiredSemanticProjectionV1;
    requiredSemanticProjectionSha256: string;
    planningEvidenceDigestSha256: string;
  };
};

const LENSES: Lens[] = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function mapRequirementSlots(pkg: ProfessorSemanticPackage): string[] {
  return pkg.semanticRequirements.map((s) => s.requirement.trim()).filter(Boolean);
}

function mapProfessorPackage(pkg: ProfessorSemanticPackage, validatorStatus: "VALID" | "INVALID"): RuntimeSemanticPackage {
  return {
    packageRefId: pkg.packageId,
    thesis: [pkg.title, pkg.purpose].filter(Boolean).join(" — "),
    validatorStatus,
    producedResources: [...pkg.producedResources],
    requiredResources: [...pkg.requiredResources],
    semanticRequirements: mapRequirementSlots(pkg),
    payoffs: [...pkg.payoffs],
    resourceTransformations: pkg.causalChain.length >= 2 ? [...pkg.causalChain] : undefined,
    commanderDependencies:
      pkg.commanderDependency === "HIGH" || pkg.commanderDependency === "MEDIUM"
        ? [pkg.commanderContribution].filter(Boolean)
        : [],
    ...(validatorStatus === "INVALID" ? { rejectionReason: "validator_v2_rejected" } : {}),
  };
}

function hypothesisForLens(
  hypothesis: StrategyHypothesis,
  lens: ThreeLensObjective,
  selectedIds: Set<string>,
  clauseRefs: string[],
): SemanticHypothesis | null {
  const lensPackages = hypothesis.packages.filter((p) => selectedIds.has(p.packageId));
  if (lensPackages.length === 0) return null;

  const required = new Set<string>();
  const produced = new Set<string>();
  for (const pkg of lensPackages) {
    for (const r of pkg.requiredResources) required.add(r);
    for (const r of pkg.producedResources) produced.add(r);
  }

  const commanderDependencies =
    lens === "INDEPENDENT_SYNERGY"
      ? []
      : lensPackages
          .flatMap((p) => (p.commanderDependency !== "LOW" ? [p.commanderContribution] : []))
          .filter(Boolean);

  return {
    hypothesisId: `${hypothesis.hypothesisId}__${lens}`,
    strategyStatement: hypothesis.thesis,
    engineInputs: [...required],
    engineOutputs: [...produced],
    commanderDependencies,
    resourceTransformations: lensPackages.flatMap((p) => p.causalChain.slice(0, 2)),
    ...(lens === "DEPENDENT_SYNERGY" ? { commanderEvidenceRefs: clauseRefs } : {}),
  };
}

function buildResourceGraph(
  packages: RuntimeSemanticPackage[],
  typedEdges: PackageSynergyTypedEdge[],
): { nodes: ResourceNode[]; edges: ResourceEdge[] } {
  const nodes = new Map<string, ResourceNode>();
  const edges: ResourceEdge[] = [];
  const nodeIds = new Set<string>();

  const ensureNode = (nodeId: string, label?: string) => {
    if (!nodeIds.has(nodeId)) {
      nodes.set(nodeId, { nodeId, kind: "resource", label: label ?? nodeId, zone: "battlefield" });
      nodeIds.add(nodeId);
    }
  };

  for (const pkg of packages) {
    ensureNode(pkg.packageRefId, pkg.thesis);
    const pkgNode = nodes.get(pkg.packageRefId);
    if (pkgNode) pkgNode.kind = "package";
    for (const r of pkg.producedResources ?? []) {
      ensureNode(r);
      edges.push({
        edgeId: `${pkg.packageRefId}->${r}:produces`,
        fromNodeId: pkg.packageRefId,
        toNodeId: r,
        relationship: "produces",
      });
    }
    for (const r of pkg.requiredResources ?? []) {
      ensureNode(r);
      edges.push({
        edgeId: `${r}->${pkg.packageRefId}:consumes`,
        fromNodeId: r,
        toNodeId: pkg.packageRefId,
        relationship: "consumes",
      });
    }
  }

  for (const edge of typedEdges) {
    if (!nodeIds.has(edge.fromPackageId) || !nodeIds.has(edge.toPackageId)) continue;
    const relationship =
      edge.kind === "BRIDGE"
        ? "bridges"
        : edge.kind === "PRODUCES_FOR"
          ? "feeds"
          : edge.kind === "REQUIRES_FROM"
            ? "consumes"
            : "feeds";
    edges.push({
      edgeId: `${edge.fromPackageId}->${edge.toPackageId}:${edge.kind}:${edge.resource}`,
      fromNodeId: edge.fromPackageId,
      toNodeId: edge.toPackageId,
      relationship,
    });
  }

  return { nodes: [...nodes.values()], edges };
}

function buildLensFixture(args: {
  lens: Lens;
  record: ProfessorCaseExperimentRecordV2;
  hypotheses: StrategyHypothesis[];
  validatedPackages: ProfessorSemanticPackage[];
  rejectedPackages: ProfessorSemanticPackage[];
  portfolio: ThreeLensPortfolioSelection;
  typedEdges: PackageSynergyTypedEdge[];
  clauseRefs: string[];
}): LensSemanticFixture {
  const objective = args.lens;
  const selectedIds = new Set(
    objective === "DEPENDENT_SYNERGY"
      ? args.portfolio.dependent.selectedPackageIds
      : objective === "INDEPENDENT_SYNERGY"
        ? args.portfolio.independent.selectedPackageIds
        : args.portfolio.harmony.selectedPackageIds,
  );

  const validated = args.validatedPackages
    .filter((p) => selectedIds.has(p.packageId))
    .map((p) => mapProfessorPackage(p, "VALID"));
  const rejected = args.rejectedPackages.map((p) => mapProfessorPackage(p, "INVALID"));

  const lensHypotheses = args.hypotheses
    .map((h) => hypothesisForLens(h, objective, selectedIds, args.clauseRefs))
    .filter((h): h is SemanticHypothesis => h != null);

  const portfolioEdges = args.typedEdges.filter(
    (e) => selectedIds.has(e.fromPackageId) && selectedIds.has(e.toPackageId),
  );

  return {
    hypotheses: lensHypotheses,
    validatedPackages: validated,
    rejectedPackages: rejected,
    resourceGraph: buildResourceGraph([...validated, ...rejected], portfolioEdges),
  };
}

function planningEvidenceDigest(record: ProfessorCaseExperimentRecordV2): string {
  const payload = {
    frozenFactIds: record.frozenFactIds,
    frozenOpportunityIds: record.frozenOpportunityIds,
    noActionableFactIds: record.noActionableFactIds,
    ragEvidenceIds: record.ragEvidenceIds,
    hypotheses: record.proposedHypotheses.map((h) => ({
      hypothesisId: h.hypothesisId,
      title: h.title,
      thesis: h.thesis,
      commanderMechanismFactIds: h.commanderMechanismFactIds,
      semanticOpportunityIds: h.semanticOpportunityIds,
      evidence: h.evidence,
      packages: h.packages.map((p) => ({
        packageId: p.packageId,
        title: p.title,
        purpose: p.purpose,
        causalChain: p.causalChain,
        semanticRequirements: p.semanticRequirements,
        requiredResources: p.requiredResources,
        producedResources: p.producedResources,
        payoffs: p.payoffs,
        commanderContribution: p.commanderContribution,
        commanderIndependentFunction: p.commanderIndependentFunction,
        commanderDependency: p.commanderDependency,
        worksWithoutCommander: p.worksWithoutCommander,
        dependsOnPackageIds: p.dependsOnPackageIds,
        overlapsWithPackageIds: p.overlapsWithPackageIds,
        vulnerabilities: p.vulnerabilities,
        evidence: p.evidence,
      })),
      strengths: h.strengths,
      vulnerabilities: h.vulnerabilities,
    })),
    validationResults: record.validationResults,
    threeLensPortfolios: record.threeLensPortfolios,
  };
  return sha256Text(stableJson(payload));
}

function clauseRefsForCommanders(catalog: GoldenCatalogIndex, commanders: string[]): string[] {
  const refs: string[] = [];
  for (const name of commanders) {
    const card = lookupGoldenByName(catalog, name);
    if (!card) continue;
    refs.push(...selectMechanicClauses(card, { minClauses: 1 }).map((c) => c.ref));
  }
  return [...new Set(refs)].slice(0, 4);
}

export function serializeProfessorPlanToRuntimeInputV8(args: {
  record: ProfessorCaseExperimentRecordV2;
  commandZoneConfiguration: string;
  frozenFacts: CommanderCanonicalFacts;
  semanticOpportunities: SemanticOpportunity[];
  catalog: GoldenCatalogIndex;
}): RuntimeInputV8 {
  const record = args.record;
  if (record.caseStatus !== "SEALED_SUCCESS") {
    throw new Error(`SERIALIZER_INPUT: Professor case ${record.caseId} is not SEALED_SUCCESS (${record.caseStatus})`);
  }

  const okHypothesisIds = new Set(
    record.validationResults
      .filter((r) => r.outcome === "VALIDATED" || r.outcome === "VALID_WITH_CONSTRAINT")
      .map((r) => r.hypothesisId),
  );
  const validatedHypotheses = record.proposedHypotheses.filter((h) => okHypothesisIds.has(h.hypothesisId));
  const validatedPackages = record.finalValidatedPackages;
  const validatedIds = new Set(validatedPackages.map((p) => p.packageId));
  const rejectedPackages = record.proposedHypotheses
    .flatMap((h) => h.packages)
    .filter((p) => !validatedIds.has(p.packageId));

  const enriched = enrichPackagesWithSynergyGraphV8(record.caseId, validatedPackages);
  const typedEdges = aggregateSemanticEdgesForHarmony(enriched.typedEdges);
  const clauseRefs = clauseRefsForCommanders(args.catalog, record.commanders);

  const lenses = {} as Record<Lens, LensSemanticFixture>;
  for (const lens of LENSES) {
    lenses[lens] = buildLensFixture({
      lens,
      record,
      hypotheses: validatedHypotheses,
      validatedPackages: enriched.packages,
      rejectedPackages,
      portfolio: record.threeLensPortfolios,
      typedEdges,
      clauseRefs,
    });
  }

  const requiredSemanticProjection = buildRequiredSemanticProjectionFromRecord(record, {
    validatedPackageIds: validatedPackages.map((p) => p.packageId),
    rejectedPackageIds: rejectedPackages.map((p) => p.packageId),
    packageSynergyTypedEdges: typedEdges,
  });

  return {
    caseId: record.caseId,
    commanders: [...record.commanders],
    commandZoneConfiguration: args.commandZoneConfiguration,
    runtimeSchemaVersion: RUNTIME_SCHEMA_V8,
    roleClassificationArchitecture: "CLOSURE_INFERS_ROLES_OPTION_A",
    frozenFacts: args.frozenFacts,
    frozenOpportunities: args.semanticOpportunities.map((o) => ({
      opportunityId: o.opportunityId,
      description: o.causalStatement,
      status: "AVAILABLE" as const,
    })),
    lenses,
    serializationProvenance: {
      serializerVersion: PROFESSOR_PLAN_SERIALIZER_V1_VERSION,
      sourceProfessorRecordVersion: record.version,
      professorCaseAttemptId: record.caseAttemptId,
      validatedPackageIds: validatedPackages.map((p) => p.packageId).sort(),
      rejectedPackageIds: rejectedPackages.map((p) => p.packageId).sort(),
      packageSynergyTypedEdges: typedEdges,
      threeLensPortfolio: record.threeLensPortfolios,
      requiredSemanticProjection,
      requiredSemanticProjectionSha256: requiredSemanticProjectionSha256(requiredSemanticProjection),
      planningEvidenceDigestSha256: planningEvidenceDigest(record),
    },
  };
}

export function runtimeInputV8ByteSha256(snapshot: RuntimeInputV8): string {
  return sha256Text(JSON.stringify(snapshot, null, 2));
}

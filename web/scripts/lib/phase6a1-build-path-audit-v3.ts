/**
 * BuildPath v3 audit — causal identity, truth coverage, routing compatibility.
 * Does NOT use 0/28 LOW_PATH_SEPARATION as primary acceptance criterion.
 */
import type { BuildPathClass } from "../../src/lib/deck-synthesis/build-path-types-v1";
import type {
  CommandZoneBuildPathBundleV3,
  PathCausalIdentityAudit,
  RoutingCompatibility,
} from "../../src/lib/deck-synthesis/build-path-types-v3";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";
import type { ImplementedStrategyCatalogEntry } from "./phase6a1-implemented-strategy-catalog-v1";
import { unreferencedFacts } from "./phase6a1-mechanism-fact-linker-v3";

export const BUILD_PATH_AUDIT_V3_VERSION = "phase6a1-build-path-audit-v3";

export type CaseBuildPathAuditV3 = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  buildPathsGenerated: number;
  pathCandidateIntentsGenerated: number;
  truthFactsReferenced: string[];
  unreferencedRelevantFacts: string[];
  strategyMechanicsRepresented: string[];
  missingStrategyMechanics: string[];
  extraStrategyMechanics: string[];
  routingCompatibility: Record<RoutingCompatibility, number>;
  routingDetails: Array<{
    intentId: string;
    pathClass: BuildPathClass;
    sourceMechanicLabel: string;
    retrievalToken: string;
    routingCompatibility: RoutingCompatibility;
    routingNote: string | null;
  }>;
  unresolvedPathsPreserved: string[];
  partnerBackgroundMemberAttribution: Array<{
    pathClass: BuildPathClass;
    intentId: string;
    membersSupported: string[];
  }>;
  causalIdentity: PathCausalIdentityAudit;
  paths: Array<{
    pathClass: BuildPathClass;
    coreIntentCount: number;
    sourceChain: string[];
    unresolvedStatus: string;
  }>;
};

export function expectedMechanicsForPath(
  strat: ImplementedStrategyCatalogEntry,
  pathClass: BuildPathClass,
): string[] {
  const lens = strat.correctedThreePathStrategy[pathClass];
  if (pathClass === "HARMONY") return lens.bridgeMechanics ?? [];
  return lens.coreMechanics ?? [];
}

function auditCausalIdentity(bundle: CommandZoneBuildPathBundleV3): PathCausalIdentityAudit {
  const dep = bundle.buildPaths.find((p) => p.pathClass === "DEPENDENT_SYNERGY")!;
  const ind = bundle.buildPaths.find((p) => p.pathClass === "INDEPENDENT_SYNERGY")!;
  const harm = bundle.buildPaths.find((p) => p.pathClass === "HARMONY")!;

  const unresolved =
    dep.pathThesis.unresolvedStatus !== "RESOLVED"
      ? dep.pathThesis.unresolvedStatus
      : ind.pathThesis.unresolvedStatus !== "RESOLVED"
        ? ind.pathThesis.unresolvedStatus
        : harm.pathThesis.unresolvedStatus;

  return {
    dependentHasCommanderDependentIdentity:
      dep.requiredCandidateIntents.length > 0 &&
      dep.pathThesis.commanderRole === "REQUIRED_ENGINE" &&
      dep.requiredCandidateIntents.some((i) => i.provenance.supportingMechanismFactIds.length > 0),
    independentHasCommanderFreeIdentity:
      ind.pathThesis.independentEngine.present &&
      ind.requiredCandidateIntents.length > 0 &&
      ind.pathThesis.sourceCoreMechanics.length > 0,
    harmonyHasDualRoleBridge:
      harm.requiredCandidateIntents.length > 0 &&
      (harm.pathThesis.sourceBridgeMechanics.length > 0 || harm.pathThesis.unresolvedStatus !== "RESOLVED"),
    unresolvedStatus: unresolved,
  };
}

export function auditCaseBuildPathV3(
  bundle: CommandZoneBuildPathBundleV3,
  mechCase: ImplementedMechanismCatalogEntry,
  stratCase: ImplementedStrategyCatalogEntry,
): CaseBuildPathAuditV3 {
  const referencedFactIds = new Set<string>();
  const representedMechanics = new Set<string>();
  const routingCompatibility: Record<RoutingCompatibility, number> = {
    EXACT_COMPATIBLE: 0,
    COMPATIBLE_WITH_CONSTRAINT: 0,
    NO_EXISTING_TOKEN: 0,
    ROUTING_MISMATCH: 0,
  };
  const routingDetails: CaseBuildPathAuditV3["routingDetails"] = [];
  const memberAttribution: CaseBuildPathAuditV3["partnerBackgroundMemberAttribution"] = [];
  const unresolvedPaths = new Set<string>();

  let intentCount = 0;
  for (const path of bundle.buildPaths) {
    if (path.pathThesis.unresolvedStatus !== "RESOLVED") {
      unresolvedPaths.add(`${path.pathClass}:${path.pathThesis.unresolvedStatus}`);
    }
    for (const intent of path.requiredCandidateIntents) {
      intentCount += 1;
      representedMechanics.add(intent.provenance.sourceMechanicLabel);
      for (const fid of intent.provenance.supportingMechanismFactIds) referencedFactIds.add(fid);
      routingCompatibility[intent.provenance.routingCompatibility] += 1;
      routingDetails.push({
        intentId: intent.intentId,
        pathClass: path.pathClass,
        sourceMechanicLabel: intent.provenance.sourceMechanicLabel,
        retrievalToken: intent.retrievalToken,
        routingCompatibility: intent.provenance.routingCompatibility,
        routingNote: intent.provenance.routingNote,
      });
      memberAttribution.push({
        pathClass: path.pathClass,
        intentId: intent.intentId,
        membersSupported: intent.provenance.commanderZoneMembersSupported,
      });
    }
  }

  const allExpected = new Set<string>();
  for (const pc of ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"] as BuildPathClass[]) {
    for (const m of expectedMechanicsForPath(stratCase, pc)) allExpected.add(m);
  }

  const missingStrategyMechanics = [...allExpected].filter((m) => !representedMechanics.has(m));
  const extraStrategyMechanics = [...representedMechanics].filter((m) => !allExpected.has(m));

  const unreferenced = unreferencedFacts(mechCase.independentMechanismFacts, referencedFactIds);

  return {
    caseId: bundle.caseId,
    commanders: bundle.commanders,
    commandZoneConfiguration: bundle.commandZoneConfiguration,
    buildPathsGenerated: bundle.buildPaths.length,
    pathCandidateIntentsGenerated: intentCount,
    truthFactsReferenced: [...referencedFactIds],
    unreferencedRelevantFacts: unreferenced.map((f) => f.mechanismId),
    strategyMechanicsRepresented: [...representedMechanics],
    missingStrategyMechanics,
    extraStrategyMechanics,
    routingCompatibility,
    routingDetails,
    unresolvedPathsPreserved: [...unresolvedPaths],
    partnerBackgroundMemberAttribution: memberAttribution,
    causalIdentity: auditCausalIdentity(bundle),
    paths: bundle.buildPaths.map((p) => ({
      pathClass: p.pathClass,
      coreIntentCount: p.requiredCandidateIntents.length,
      sourceChain: p.pathThesis.sourceStrategyChain,
      unresolvedStatus: p.pathThesis.unresolvedStatus,
    })),
  };
}

export type BuildPathAuditV3Population = {
  casesAudited: number;
  buildPathProposals: number;
  pathCandidateIntents: number;
  routingCompatibilityTotals: Record<RoutingCompatibility, number>;
  casesWithMissingStrategyMechanics: number;
  casesWithRoutingMismatch: number;
  unresolvedCases: string[];
  causalIdentitySummary: {
    dependentCommanderDependent: number;
    independentCommanderFree: number;
    harmonyDualRoleBridge: number;
  };
};

export function summarizeBuildPathAuditV3(cases: CaseBuildPathAuditV3[]): BuildPathAuditV3Population {
  const routingTotals: Record<RoutingCompatibility, number> = {
    EXACT_COMPATIBLE: 0,
    COMPATIBLE_WITH_CONSTRAINT: 0,
    NO_EXISTING_TOKEN: 0,
    ROUTING_MISMATCH: 0,
  };
  let intents = 0;
  let paths = 0;
  const unresolvedCases: string[] = [];

  for (const c of cases) {
    paths += c.buildPathsGenerated;
    intents += c.pathCandidateIntentsGenerated;
    for (const [k, v] of Object.entries(c.routingCompatibility) as [RoutingCompatibility, number][]) {
      routingTotals[k] += v;
    }
    if (c.causalIdentity.unresolvedStatus !== "RESOLVED") unresolvedCases.push(c.caseId);
  }

  return {
    casesAudited: cases.length,
    buildPathProposals: paths,
    pathCandidateIntents: intents,
    routingCompatibilityTotals: routingTotals,
    casesWithMissingStrategyMechanics: cases.filter((c) => c.missingStrategyMechanics.length > 0).length,
    casesWithRoutingMismatch: cases.filter((c) => c.routingCompatibility.ROUTING_MISMATCH > 0).length,
    unresolvedCases,
    causalIdentitySummary: {
      dependentCommanderDependent: cases.filter((c) => c.causalIdentity.dependentHasCommanderDependentIdentity).length,
      independentCommanderFree: cases.filter((c) => c.causalIdentity.independentHasCommanderFreeIdentity).length,
      harmonyDualRoleBridge: cases.filter((c) => c.causalIdentity.harmonyHasDualRoleBridge).length,
    },
  };
}

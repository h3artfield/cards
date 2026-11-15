/**
 * Structural/causal closure inference for DEV template adjudication ONLY (v6).
 * Uses typed resources, graph topology, and commander pins — no closure-role proxy tags.
 * NOT production closure. Holdout authority uses independent pre-authored oracle JSON.
 */
import {
  APPLICABILITY_MATRIX,
  FUNCTIONAL_ROLES,
  resolveClosureStatus,
  type Applicability,
  type ClosureStatus,
  type FunctionalRole,
  type Lens,
  type TriggerId,
  mergeApplicability,
  matrixRuleFor,
  TRIGGER_REGISTRY,
} from "./phase6a1-closure-design-v3-matrix";

export type SemanticSnapshot = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  frozenFacts: {
    status?: string;
    commanderOracleText?: string;
    oracleId?: string;
    scryfallId?: string;
    catalogVersion?: string;
    oracleTextSha256?: string;
    commanderRelevantAbilities?: string[];
    activationRequirements?: string[];
  };
  frozenOpportunities: Array<{ status: string }>;
  lenses: Record<
    Lens,
    {
      hypotheses: Array<{
        strategyStatement?: string;
        engineInputs?: string[];
        engineOutputs?: string[];
        commanderDependencies?: string[];
        resourceTransformations?: string[];
        secondaryLoop?: boolean;
        partnerHandoff?: boolean;
        commanderEvidenceRefs?: string[];
      }>;
      validatedPackages: Array<{
        packageRefId: string;
        thesis?: string;
        validatorStatus: string;
        producedResources?: string[];
        requiredResources?: string[];
        semanticRequirements?: string[];
        payoffs?: string[];
        resourceTransformations?: string[];
        commanderDependencies?: string[];
        hypothesisRef?: string;
      }>;
      rejectedPackages: Array<{ packageRefId: string; validatorStatus: string }>;
      resourceGraph: {
        nodes: Array<{ nodeId: string; zone?: string }>;
        edges: Array<{ fromNodeId: string; toNodeId: string; relationship?: string }>;
      };
    }
  >;
};

const PROXY_ROLE_TAGS = new Set([
  "setup_enabler",
  "stabilization_pressure",
  "zone_recovery",
  "terminal_outcome",
  "cross_engine_link",
  "combat_pressure",
  "renewable_density",
  "zone_volatility",
  "partner_handoff",
]);

function resourceMatchesDensity(resourceId: string): boolean {
  return (
    /_(tokens|token|fodder|stock|density|swarm|tribe|renewal)$/i.test(resourceId) ||
    /\b(tokens|fodder|swarm|tribe|sacrifice fodder|creature tokens|token makers)\b/i.test(resourceId)
  );
}

function resourceMatchesCombatPayoff(resourceId: string): boolean {
  return /(combat|damage|lethal|poison|attack)/i.test(resourceId);
}

function resourceMatchesProtection(resourceId: string): boolean {
  return /(protection|tax|hexproof|indestructible|counterspell|stax|shield)/i.test(resourceId);
}

function resourceMatchesRecovery(resourceId: string): boolean {
  return /(recursion|recover|return_from_graveyard|reanimate|graveyard_to_battlefield)/i.test(resourceId);
}

function hasTransformation(values: string[] | undefined, pattern: RegExp): boolean {
  return (values ?? []).some((v) => pattern.test(v));
}

export function detectTriggers(snapshot: SemanticSnapshot, lens: Lens): TriggerId[] {
  const lensData = snapshot.lenses[lens];
  const hyp = lensData.hypotheses[0];
  const fired: TriggerId[] = [];

  if (snapshot.frozenFacts.status === "UNAVAILABLE" || snapshot.frozenOpportunities.some((o) => o.status === "UNAVAILABLE")) {
    fired.push("T_EVIDENCE_PARTIAL");
  }
  if ((hyp?.engineOutputs?.length ?? 0) > 0 && lensData.validatedPackages.some((p) => p.validatorStatus === "VALID")) {
    fired.push("T_ENGINE_PRESENT");
  }
  if ((hyp?.commanderDependencies?.length ?? 0) > 0 || (snapshot.frozenFacts.activationRequirements?.length ?? 0) > 0) {
    fired.push("T_COMMANDER_OPERATIONAL");
  }
  if (hyp?.secondaryLoop === true) fired.push("T_SECONDARY_LOOP");
  if (snapshot.commandZoneConfiguration === "partner_pair" && hyp?.partnerHandoff === true) {
    fired.push("T_PARTNER_HANDOFF");
  }
  const zoneNodes = lensData.resourceGraph.nodes.some((n) => ["graveyard", "exile", "library"].includes(n.zone ?? ""));
  const zoneTransform = (hyp?.resourceTransformations ?? []).some((r) => r.startsWith("zone:"));
  if (zoneNodes || zoneTransform) fired.push("T_ZONE_VOLATILITY");
  const densityResources =
    lensData.validatedPackages.some((p) => (p.producedResources ?? []).some((r) => resourceMatchesDensity(r))) ||
    (hyp?.engineOutputs ?? []).some((r) => resourceMatchesDensity(r));
  if (densityResources) fired.push("T_CREATURE_DENSITY");
  if (
    (hyp?.resourceTransformations?.length ?? 0) > 0 ||
    lensData.validatedPackages.some((p) => (p.resourceTransformations?.length ?? 0) > 0)
  ) {
    fired.push("T_CONVERSION_OUTPUT");
  }
  if (
    (hyp?.engineOutputs ?? []).some((r) => resourceMatchesCombatPayoff(r)) ||
    lensData.validatedPackages.some(
      (p) =>
        (p.payoffs ?? []).some((r) => resourceMatchesCombatPayoff(r)) ||
        (p.producedResources ?? []).some((r) => resourceMatchesCombatPayoff(r)),
    )
  ) {
    fired.push("T_COMBAT_FINISH");
  }
  if (
    lensData.validatedPackages.some(
      (p) =>
        (p.semanticRequirements ?? []).some((r) => resourceMatchesProtection(r) || /interaction pressure|removal pressure/i.test(r)) ||
        resourceMatchesProtection(p.thesis ?? ""),
    )
  ) {
    fired.push("T_INTERACTION_PRESSURE");
  }
  return [...new Set(fired)];
}

export function classifyPackageRole(
  pkg: SemanticSnapshot["lenses"][Lens]["validatedPackages"][number],
  lens: Lens,
): FunctionalRole[] {
  const roles: FunctionalRole[] = [];
  if ((pkg.resourceTransformations?.length ?? 0) > 0) roles.push("CONVERSION");
  if ((pkg.producedResources ?? []).some((r) => resourceMatchesDensity(r))) roles.push("FUEL");
  if ((pkg.producedResources?.length ?? 0) > 0) roles.push("ENGINE");
  if ((pkg.requiredResources ?? []).some((r) => /(mana|ramp|untap|setup)/i.test(r)) && (pkg.producedResources?.length ?? 0) > 0) {
    roles.push("ENABLER");
  }
  if ((pkg.payoffs?.length ?? 0) > 0 && !(pkg.payoffs ?? []).every((p) => resourceMatchesCombatPayoff(p))) {
    roles.push("PAYOFF");
  }
  if ((pkg.payoffs ?? []).some((p) => resourceMatchesCombatPayoff(p))) roles.push("FINISHER");
  if (
    (pkg.semanticRequirements ?? []).some((r) => resourceMatchesProtection(r)) ||
    resourceMatchesProtection(pkg.thesis ?? "")
  ) {
    roles.push("PROTECTION");
  }
  if (
    (pkg.semanticRequirements ?? []).some((r) => resourceMatchesRecovery(r)) ||
    hasTransformation(pkg.resourceTransformations, /graveyard|recursion|recover/)
  ) {
    roles.push("RECOVERY");
  }
  if ((pkg.commanderDependencies?.length ?? 0) > 0) roles.push("COMMANDER_MAINTENANCE");
  if (hasTransformation(pkg.resourceTransformations, /bridge|link|handoff|cross_engine/)) {
    roles.push("CROSS_ENGINE_BRIDGE");
  }
  if (roles.length === 0 && (pkg.producedResources?.length ?? 0) > 0) roles.push("ENGINE");
  if (lens === "INDEPENDENT_SYNERGY" && (pkg.commanderDependencies?.length ?? 0) > 0) {
    return roles.filter((r) => r !== "ENABLER" && r !== "COMMANDER_MAINTENANCE");
  }
  return [...new Set(roles)];
}

export function inferSatisfiedRoles(snapshot: SemanticSnapshot, lens: Lens) {
  const applicability = mergeApplicability(detectTriggers(snapshot, lens), lens);
  const out = Object.fromEntries(
    FUNCTIONAL_ROLES.map((role) => [role, { state: "NOT_APPLICABLE" as const, evidenceBindings: [] as Array<{ packageRefId: string; bindingKind: string }> }]),
  ) as Record<FunctionalRole, { state: "SATISFIED" | "MISSING" | "NOT_APPLICABLE"; evidenceBindings: Array<{ packageRefId: string; bindingKind: string }> }>;

  for (const role of FUNCTIONAL_ROLES) {
    const app = applicability[role];
    if (app === "N/A") continue;
    const bindings: Array<{ packageRefId: string; bindingKind: string }> = [];
    for (const pkg of snapshot.lenses[lens].validatedPackages) {
      if (pkg.validatorStatus !== "VALID") continue;
      if (classifyPackageRole(pkg, lens).includes(role)) {
        bindings.push({ packageRefId: pkg.packageRefId, bindingKind: "resource_topology" });
      }
    }
    if (role === "CROSS_ENGINE_BRIDGE" && lens === "HARMONY") {
      const edges = snapshot.lenses[lens].resourceGraph.edges.filter((e) => e.relationship === "bridges");
      out[role] =
        edges.length >= 2 && bindings.length > 0
          ? { state: "SATISFIED", evidenceBindings: bindings }
          : { state: "MISSING", evidenceBindings: [] };
      continue;
    }
    out[role] = { state: bindings.length > 0 ? "SATISFIED" : "MISSING", evidenceBindings: bindings };
  }
  return out;
}

export function adjudicateLens(snapshot: SemanticSnapshot, lens: Lens) {
  const firedTriggers = detectTriggers(snapshot, lens);
  if (firedTriggers.includes("T_EVIDENCE_PARTIAL")) {
    return {
      expectedTriggerResults: Object.keys(TRIGGER_REGISTRY).map((triggerId) => ({
        triggerId,
        applies: firedTriggers.includes(triggerId as TriggerId),
        derivedFrom: TRIGGER_REGISTRY[triggerId as TriggerId].derivedFrom,
      })),
      roleApplicability: mergeApplicability(firedTriggers, lens),
      expectedSatisfaction: Object.fromEntries(FUNCTIONAL_ROLES.map((r) => [r, { state: "NOT_APPLICABLE", evidenceBindings: [] }])),
      closureStatus: "EVIDENCE_INSUFFICIENT" as ClosureStatus,
      structuralRoleGaps: [],
      advisoryRoleGaps: [],
      repairTargets: [],
    };
  }

  const roleApplicability = mergeApplicability(firedTriggers, lens);
  const expectedSatisfaction = inferSatisfiedRoles(snapshot, lens);
  const structuralRoleGaps: Array<{ role: FunctionalRole; triggerRef: TriggerId; applicabilityRule: string }> = [];
  const advisoryRoleGaps: Array<{ role: FunctionalRole; triggerRef: TriggerId; applicabilityRule: string }> = [];

  for (const role of FUNCTIONAL_ROLES) {
    const app = roleApplicability[role];
    if (app === "N/A" || expectedSatisfaction[role].state !== "MISSING") continue;
    const triggerRef = firedTriggers.find((t) => matrixRuleFor(t, lens, role));
    if (!triggerRef) continue;
    (app === "REQUIRED" ? structuralRoleGaps : advisoryRoleGaps).push({
      role,
      triggerRef,
      applicabilityRule: `${triggerRef}:${lens}:${role}=${app}`,
    });
  }

  const statusCandidates: ClosureStatus[] = ["CLOSED"];
  if (structuralRoleGaps.length > 0) statusCandidates.push("GAP_DETECTED");
  if (
    lens === "HARMONY" &&
    roleApplicability.CROSS_ENGINE_BRIDGE === "REQUIRED" &&
    expectedSatisfaction.CROSS_ENGINE_BRIDGE.state === "MISSING"
  ) {
    const edges = snapshot.lenses.HARMONY.resourceGraph.edges.filter((e) => e.relationship === "bridges");
    if (edges.length < 2) statusCandidates.push("HARMONY_UNDERDETERMINED");
  }
  const closureStatus = resolveClosureStatus(statusCandidates);

  const repairTargets =
    closureStatus === "GAP_DETECTED"
      ? structuralRoleGaps.map((gap) => ({
          lens,
          missingRole: gap.role,
          triggerRef: gap.triggerRef,
          applicabilityRule: gap.applicabilityRule,
          genericGapStatement: `Required ${gap.role} has no topology-bound validated package under structural inference rules.`,
        }))
      : [];

  return {
    expectedTriggerResults: Object.keys(TRIGGER_REGISTRY).map((triggerId) => ({
      triggerId,
      applies: firedTriggers.includes(triggerId as TriggerId),
      derivedFrom: TRIGGER_REGISTRY[triggerId as TriggerId].derivedFrom,
    })),
    roleApplicability,
    expectedSatisfaction,
    closureStatus,
    structuralRoleGaps,
    advisoryRoleGaps,
    repairTargets,
  };
}

export function validateRepairTargets(snapshot: SemanticSnapshot, lens: Lens, repairTargets: ReturnType<typeof adjudicateLens>["repairTargets"]): string[] {
  const fired = detectTriggers(snapshot, lens);
  const errors: string[] = [];
  for (const rt of repairTargets) {
    if (!fired.includes(rt.triggerRef)) errors.push(`repairTarget ${rt.missingRole} cites non-fired trigger ${rt.triggerRef}`);
    if (!matrixRuleFor(rt.triggerRef, lens, rt.missingRole)) errors.push(`repairTarget ${rt.missingRole} has no matrix rule for ${rt.triggerRef}`);
  }
  return errors;
}

export function validateSnapshotGraph(snapshot: SemanticSnapshot): string[] {
  const errors: string[] = [];
  for (const lens of Object.keys(snapshot.lenses) as Lens[]) {
    const nodeIds = new Set(snapshot.lenses[lens].resourceGraph.nodes.map((n) => n.nodeId));
    for (const pkg of snapshot.lenses[lens].validatedPackages) {
      for (const tag of pkg.semanticRequirements ?? []) {
        if (PROXY_ROLE_TAGS.has(tag)) errors.push(`${snapshot.caseId}/${lens}: proxy role tag ${tag} in semanticRequirements`);
      }
      for (const tag of pkg.payoffs ?? []) {
        if (PROXY_ROLE_TAGS.has(tag)) errors.push(`${snapshot.caseId}/${lens}: proxy role tag ${tag} in payoffs`);
      }
      for (const r of [...(pkg.producedResources ?? []), ...(pkg.requiredResources ?? [])]) {
        if (!nodeIds.has(r)) errors.push(`${snapshot.caseId}/${lens}: package ${pkg.packageRefId} references missing node ${r}`);
      }
    }
    for (const e of snapshot.lenses[lens].resourceGraph.edges) {
      if (!nodeIds.has(e.fromNodeId)) errors.push(`${snapshot.caseId}/${lens}: edge from missing node ${e.fromNodeId}`);
      if (!nodeIds.has(e.toNodeId)) errors.push(`${snapshot.caseId}/${lens}: edge to missing node ${e.toNodeId}`);
    }
  }
  return errors;
}

export function validateIndependentLensInvariants(snapshot: SemanticSnapshot): string[] {
  const errors: string[] = [];
  const ind = snapshot.lenses.INDEPENDENT_SYNERGY;
  for (const pkg of ind.validatedPackages) {
    if ((pkg.commanderDependencies?.length ?? 0) > 0) {
      errors.push(`${snapshot.caseId}/INDEPENDENT_SYNERGY: package ${pkg.packageRefId} has commanderDependencies`);
    }
  }
  if ((ind.hypotheses[0]?.commanderDependencies?.length ?? 0) > 0) {
    errors.push(`${snapshot.caseId}/INDEPENDENT_SYNERGY: hypothesis declares commanderDependencies`);
  }
  return errors;
}

export { PROXY_ROLE_TAGS };

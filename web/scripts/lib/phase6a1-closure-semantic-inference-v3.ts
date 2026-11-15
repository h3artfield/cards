/**
 * Semantic trigger detection and role satisfaction inference for closure v3.
 * Used by independent adjudication author ONLY — not by snapshot author.
 */
import {
  APPLICABILITY_MATRIX,
  FUNCTIONAL_ROLES,
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
      }>;
      rejectedPackages: Array<{ packageRefId: string; validatorStatus: string }>;
      resourceGraph: { nodes: Array<{ nodeId: string }>; edges: Array<{ fromNodeId: string; toNodeId: string; relationship?: string }> };
    }
  >;
};

function textBlob(parts: Array<string | undefined> | undefined): string {
  return (parts ?? []).filter(Boolean).join(" ").toLowerCase();
}

export function detectTriggers(snapshot: SemanticSnapshot, lens: Lens): TriggerId[] {
  const lensData = snapshot.lenses[lens];
  const hyp = lensData.hypotheses[0];
  const blob = textBlob([
    hyp?.strategyStatement,
    ...(hyp?.engineInputs ?? []),
    ...(hyp?.engineOutputs ?? []),
    ...(hyp?.commanderDependencies ?? []),
    ...(hyp?.resourceTransformations ?? []),
    snapshot.frozenFacts.commanderOracleText,
    ...(snapshot.frozenFacts.activationRequirements ?? []),
  ]);
  const pkgBlob = textBlob(
    lensData.validatedPackages.flatMap((p) => [
      p.thesis,
      ...(p.semanticRequirements ?? []),
      ...(p.payoffs ?? []),
      ...(p.resourceTransformations ?? []),
      ...(p.commanderDependencies ?? []),
    ]),
  );
  const fired: TriggerId[] = [];

  if (snapshot.frozenFacts.status === "UNAVAILABLE" || snapshot.frozenOpportunities.some((o) => o.status === "UNAVAILABLE")) {
    fired.push("T_EVIDENCE_PARTIAL");
  }
  if ((hyp?.engineOutputs?.length ?? 0) > 0 && lensData.validatedPackages.some((p) => p.validatorStatus === "VALID")) {
    fired.push("T_ENGINE_PRESENT");
  }
  if (
    textBlob(hyp?.commanderDependencies).includes("activation") ||
    textBlob(hyp?.commanderDependencies).includes("untap") ||
    textBlob(hyp?.commanderDependencies).includes("availability")
  ) {
    fired.push("T_COMMANDER_OPERATIONAL");
  }
  if (hyp?.secondaryLoop || blob.includes("secondary") || blob.includes("independent")) {
    fired.push("T_SECONDARY_LOOP");
  }
  if (snapshot.commandZoneConfiguration === "partner_pair" && (hyp?.partnerHandoff || blob.includes("partner") || blob.includes("handoff"))) {
    fired.push("T_PARTNER_HANDOFF");
  }
  if (
    lensData.resourceGraph.nodes.some((n) => ["graveyard", "exile", "library"].includes((n as { zone?: string }).zone ?? "")) ||
    blob.includes("graveyard") ||
    blob.includes("self-mill")
  ) {
    fired.push("T_ZONE_VOLATILITY");
  }
  if (blob.includes("token") || blob.includes("fodder") || blob.includes("creature")) {
    fired.push("T_CREATURE_DENSITY");
  }
  if ((hyp?.resourceTransformations?.length ?? 0) > 0 || pkgBlob.includes("convert")) {
    fired.push("T_CONVERSION_OUTPUT");
  }
  if (blob.includes("combat") || textBlob(lensData.validatedPackages.flatMap((p) => p.payoffs)).includes("combat")) {
    fired.push("T_COMBAT_FINISH");
  }
  if (blob.includes("removal") || blob.includes("stabilization") || blob.includes("protection") || blob.includes("attrition")) {
    fired.push("T_INTERACTION_PRESSURE");
  }
  return [...new Set(fired)];
}

export function classifyPackageRole(pkg: SemanticSnapshot["lenses"][Lens]["validatedPackages"][number], lens: Lens): FunctionalRole[] {
  const roles: FunctionalRole[] = [];
  const thesis = textBlob([pkg.thesis, ...(pkg.payoffs ?? []), ...(pkg.semanticRequirements ?? [])]);
  if ((pkg.producedResources?.length ?? 0) > 0) roles.push("ENGINE");
  if (thesis.includes("enabler") || thesis.includes("setup") || thesis.includes("standalone")) roles.push("ENABLER");
  if (thesis.includes("fodder") || thesis.includes("renewable") || textBlob(pkg.producedResources).includes("fodder")) roles.push("FUEL");
  if ((pkg.payoffs?.length ?? 0) > 0) roles.push("PAYOFF");
  if ((pkg.resourceTransformations?.length ?? 0) > 0 || thesis.includes("convert")) roles.push("CONVERSION");
  if (thesis.includes("protection") || thesis.includes("stabiliz")) roles.push("PROTECTION");
  if (thesis.includes("recover") || thesis.includes("restored")) roles.push("RECOVERY");
  if (textBlob(pkg.payoffs).includes("lethal") || textBlob(pkg.payoffs).includes("terminal")) roles.push("FINISHER");
  if (textBlob(pkg.commanderDependencies).includes("untap") || textBlob(pkg.commanderDependencies).includes("protect")) roles.push("COMMANDER_MAINTENANCE");
  if (thesis.includes("bridge") || (pkg.resourceTransformations ?? []).some((r) => r.includes("bridge"))) roles.push("CROSS_ENGINE_BRIDGE");
  if (roles.length === 0 && (pkg.producedResources?.length ?? 0) > 0) roles.push("ENGINE");
  if (lens === "INDEPENDENT_SYNERGY" && (pkg.commanderDependencies?.length ?? 0) > 0) {
    return roles.filter((r) => r !== "ENABLER");
  }
  return [...new Set(roles)];
}

export function inferSatisfiedRoles(snapshot: SemanticSnapshot, lens: Lens): Record<FunctionalRole, { state: "SATISFIED" | "MISSING" | "NOT_APPLICABLE"; evidenceBindings: Array<{ packageRefId: string; bindingKind: string }> }> {
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
      const roles = classifyPackageRole(pkg, lens);
      if (roles.includes(role)) bindings.push({ packageRefId: pkg.packageRefId, bindingKind: "semantic_classification" });
    }
    if (role === "CROSS_ENGINE_BRIDGE" && lens === "HARMONY") {
      const edges = snapshot.lenses[lens].resourceGraph.edges.filter((e) => e.relationship === "bridges");
      if (edges.length >= 2 && bindings.length > 0) {
        out[role] = { state: "SATISFIED", evidenceBindings: bindings };
        continue;
      }
      if (bindings.length === 0 || edges.length < 2) {
        out[role] = { state: "MISSING", evidenceBindings: [] };
        continue;
      }
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
    const target = app === "REQUIRED" ? structuralRoleGaps : advisoryRoleGaps;
    target.push({ role, triggerRef, applicabilityRule: `${triggerRef}:${lens}:${role}=${app}` });
  }

  let closureStatus: ClosureStatus = "CLOSED";
  if (lens === "HARMONY" && roleApplicability.CROSS_ENGINE_BRIDGE === "REQUIRED" && expectedSatisfaction.CROSS_ENGINE_BRIDGE.state === "MISSING") {
    const edges = snapshot.lenses.HARMONY.resourceGraph.edges.filter((e) => e.relationship === "bridges");
    if (edges.length < 2) closureStatus = "HARMONY_UNDERDETERMINED";
  }
  if (structuralRoleGaps.length > 0) closureStatus = "GAP_DETECTED";
  if (closureStatus === "CLOSED" && advisoryRoleGaps.length > 0) closureStatus = "CLOSED";

  const repairTargets = structuralRoleGaps.map((gap) => ({
    lens,
    missingRole: gap.role,
    triggerRef: gap.triggerRef,
    applicabilityRule: gap.applicabilityRule,
    genericGapStatement: `Required ${gap.role} has no evidence-bound validated package under semantic inference rules.`,
  }));

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
    for (const pkg of [...snapshot.lenses[lens].validatedPackages, ...snapshot.lenses[lens].rejectedPackages]) {
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

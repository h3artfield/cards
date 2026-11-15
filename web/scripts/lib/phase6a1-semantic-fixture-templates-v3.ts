/**
 * Upstream semantic fixtures — planning outputs only.
 * MUST NOT contain trigger IDs, roleClaims, closure statuses, or adjudication fields.
 */
import type { Lens } from "./phase6a1-closure-design-v3-matrix";

export type ResourceNode = {
  nodeId: string;
  kind: "resource" | "zone" | "commander_capability";
  label: string;
  zone?: "battlefield" | "graveyard" | "exile" | "library" | "command_zone";
};

export type ResourceEdge = {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  relationship: "produces" | "consumes" | "converts" | "feeds" | "protects" | "bridges";
};

export type SemanticPackage = {
  packageRefId: string;
  thesis: string;
  validatorStatus: "VALID" | "INVALID";
  producedResources: string[];
  requiredResources: string[];
  semanticRequirements: string[];
  payoffs: string[];
  resourceTransformations?: string[];
  commanderDependencies?: string[];
  rejectionReason?: string;
};

export type SemanticHypothesis = {
  hypothesisId: string;
  strategyStatement: string;
  engineInputs: string[];
  engineOutputs: string[];
  commanderDependencies: string[];
  resourceTransformations: string[];
  secondaryLoop?: boolean;
  partnerHandoff?: boolean;
};

export type LensSemanticFixture = {
  hypotheses: SemanticHypothesis[];
  validatedPackages: SemanticPackage[];
  rejectedPackages: SemanticPackage[];
  resourceGraph: { nodes: ResourceNode[]; edges: ResourceEdge[] };
};

export type CaseSemanticFixture = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: "single_commander" | "partner_pair" | "commander_with_background";
  frozenFacts: {
    commanderOracleText: string;
    commanderRelevantAbilities: string[];
    zoneRestrictions: string[];
    activationRequirements: string[];
    relevantRulesFacts: string[];
    status?: "AVAILABLE" | "UNAVAILABLE";
  };
  frozenOpportunities: {
    opportunityId: string;
    description: string;
    status: "AVAILABLE" | "UNAVAILABLE";
  }[];
  lenses: Record<Lens, LensSemanticFixture>;
};

function pkg(
  id: string,
  thesis: string,
  produced: string[],
  required: string[],
  payoffs: string[],
  extra: Partial<SemanticPackage> = {},
): SemanticPackage {
  return {
    packageRefId: id,
    thesis,
    validatorStatus: "VALID",
    producedResources: produced,
    requiredResources: required,
    semanticRequirements: extra.semanticRequirements ?? [],
    payoffs,
    resourceTransformations: extra.resourceTransformations,
    commanderDependencies: extra.commanderDependencies,
  };
}

function invalidPkg(id: string, thesis: string, reason: string): SemanticPackage {
  return {
    packageRefId: id,
    thesis,
    validatorStatus: "INVALID",
    producedResources: [],
    requiredResources: [],
    semanticRequirements: [],
    payoffs: [],
    rejectionReason: reason,
  };
}

function node(id: string, label: string, zone: ResourceNode["zone"] = "battlefield"): ResourceNode {
  return { nodeId: id, kind: "resource", label, zone };
}

function edge(from: string, to: string, relationship: ResourceEdge["relationship"], edgeId?: string): ResourceEdge {
  return { edgeId: edgeId ?? `${from}->${to}:${relationship}`, fromNodeId: from, toNodeId: to, relationship };
}

export function buildTokenSwarmClosed(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const dep = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-dep-hyp`,
        strategyStatement: "Commander-linked token swarm into combat payoffs",
        engineInputs: ["mana", "commander availability"],
        engineOutputs: ["creature tokens", "combat damage"],
        commanderDependencies: ["commander creates tokens when cast"],
        resourceTransformations: [],
      },
    ],
    validatedPackages: [
      pkg("dep-engine", "Token production engine", ["creature tokens"], ["mana"], [], { commanderDependencies: ["uses commander trigger"] }),
      pkg("dep-fuel", "Renewable fodder", ["sacrifice fodder"], ["creature tokens"], []),
      pkg("dep-payoff", "Combat payoff", ["combat damage"], ["creature tokens"], ["deals damage when tokens enter"]),
    ],
    rejectedPackages: [invalidPkg("dep-bad", "Broken token loop", "validator_v2_failed")],
    resourceGraph: {
      nodes: [node("mana"), node("creature tokens"), node("combat damage"), node("sacrifice fodder")],
      edges: [
        edge("dep-engine", "creature tokens", "produces"),
        edge("dep-fuel", "sacrifice fodder", "produces"),
        edge("sacrifice fodder", "creature tokens", "feeds"),
        edge("creature tokens", "combat damage", "feeds"),
        edge("dep-payoff", "combat damage", "produces"),
      ],
    },
  };
  const ind = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-ind-hyp`,
        strategyStatement: "Independent go-wide tokens without commander-only fuel",
        engineInputs: ["standalone token makers"],
        engineOutputs: ["creature tokens", "combat damage"],
        commanderDependencies: [],
        resourceTransformations: [],
      },
    ],
    validatedPackages: [
      pkg("ind-enabler", "Standalone token enabler", ["standalone token makers"], [], []),
      pkg("ind-fuel", "Renewable fodder", ["sacrifice fodder"], ["standalone token makers"], []),
      pkg("ind-payoff", "Go-wide payoff", ["combat damage"], ["creature tokens"], ["creatures deal extra damage"]),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("standalone token makers"), node("creature tokens"), node("combat damage"), node("sacrifice fodder")],
      edges: [
        edge("ind-enabler", "standalone token makers", "produces"),
        edge("ind-fuel", "sacrifice fodder", "produces"),
        edge("standalone token makers", "creature tokens", "feeds"),
        edge("creature tokens", "combat damage", "feeds"),
        edge("ind-payoff", "combat damage", "produces"),
      ],
    },
  };
  const harm = buildHarmonyBridge(dep, ind);
  return wrap(caseId, commanders, cz, dep, ind, harm);
}

export function buildTokenSwarmFuelGap(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const base = buildTokenSwarmClosed(caseId, commanders, cz);
  base.lenses.DEPENDENT_SYNERGY.validatedPackages = base.lenses.DEPENDENT_SYNERGY.validatedPackages.filter((p) => p.packageRefId !== "dep-fuel");
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.edges = base.lenses.DEPENDENT_SYNERGY.resourceGraph.edges.filter((e) => e.fromNodeId !== "dep-fuel");
  return base;
}

export function buildConversionClosed(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const dep = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-dep-hyp`,
        strategyStatement: "Convert mana rocks into explosive artifact payoffs",
        engineInputs: ["artifacts", "mana"],
        engineOutputs: ["converted advantage"],
        commanderDependencies: [],
        resourceTransformations: ["artifacts to mana to card advantage"],
      },
    ],
    validatedPackages: [
      pkg("dep-engine", "Artifact engine", ["artifacts"], ["mana"], []),
      pkg("dep-conversion", "Resource conversion", ["converted advantage"], ["artifacts"], [], {
        resourceTransformations: ["artifacts into card advantage"],
      }),
      pkg("dep-payoff", "Explosive payoff", ["card advantage"], ["converted advantage"], ["draws cards from converted resources"]),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("artifacts"), node("converted advantage"), node("card advantage"), node("mana")],
      edges: [
        edge("dep-engine", "artifacts", "produces"),
        edge("dep-conversion", "converted advantage", "produces"),
        edge("artifacts", "converted advantage", "converts"),
        edge("converted advantage", "card advantage", "feeds"),
        edge("dep-payoff", "card advantage", "produces"),
      ],
    },
  };
  const ind = { ...dep, hypotheses: [{ ...dep.hypotheses[0], hypothesisId: `${caseId}-ind-hyp`, commanderDependencies: [] }] };
  return wrap(caseId, commanders, cz, dep, ind, buildHarmonyBridge(dep, ind));
}

export function buildConversionGap(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const base = buildConversionClosed(caseId, commanders, cz);
  base.lenses.INDEPENDENT_SYNERGY.validatedPackages = base.lenses.INDEPENDENT_SYNERGY.validatedPackages.filter(
    (p) => p.packageRefId !== "dep-conversion",
  );
  return base;
}

export function buildPartnerMaintenanceGap(caseId: string, commanders: string[], cz: "partner_pair"): CaseSemanticFixture {
  const dep = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-dep-hyp`,
        strategyStatement: "Partner handoff with repeated commander activation",
        engineInputs: ["partner A output", "partner B payoff"],
        engineOutputs: ["combined advantage"],
        commanderDependencies: ["requires both partners available", "repeat activation each turn"],
        resourceTransformations: [],
        partnerHandoff: true,
      },
    ],
    validatedPackages: [
      pkg("dep-engine", "Partner A engine", ["partner A output"], ["mana"], [], { commanderDependencies: ["partner A trigger"] }),
      pkg("dep-payoff", "Partner B payoff", ["combined advantage"], ["partner A output"], ["benefits from partner handoff"]),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("partner A output"), node("combined advantage"), node("mana")],
      edges: [edge("dep-engine", "partner A output", "produces"), edge("partner A output", "combined advantage", "feeds"), edge("dep-payoff", "combined advantage", "produces")],
    },
  };
  return wrap(caseId, commanders, cz, dep, buildIndependentMinimal(caseId), buildHarmonyUnderdetermined(caseId));
}

export function buildPartnerMaintenanceClosed(caseId: string, commanders: string[], cz: "partner_pair"): CaseSemanticFixture {
  const base = buildPartnerMaintenanceGap(caseId, commanders, cz);
  base.lenses.DEPENDENT_SYNERGY.validatedPackages.push(
    pkg("dep-maint", "Commander maintenance", ["commander availability"], ["mana"], [], {
      commanderDependencies: ["untap and protect both partners"],
      semanticRequirements: ["protection against removal"],
    }),
  );
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.nodes.push(node("commander availability", "commander availability", "command_zone"));
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.edges.push(edge("dep-maint", "commander availability", "protects"));
  return base;
}

export function buildGraveyardRecoveryGap(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const dep = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-dep-hyp`,
        strategyStatement: "Graveyard value engine vulnerable to exile",
        engineInputs: ["self-mill", "graveyard creatures"],
        engineOutputs: ["recursion value"],
        commanderDependencies: [],
        resourceTransformations: [],
      },
    ],
    validatedPackages: [
      pkg("dep-engine", "Self-mill engine", ["graveyard creatures"], ["self-mill"], [], { resourceTransformations: ["mill into graveyard"] }),
      pkg("dep-payoff", "Recursion payoff", ["recursion value"], ["graveyard creatures"], ["returns creatures from graveyard"]),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [
        node("self-mill"),
        node("graveyard creatures", "graveyard creatures", "graveyard"),
        node("recursion value"),
      ],
      edges: [
        edge("dep-engine", "graveyard creatures", "produces"),
        edge("graveyard creatures", "recursion value", "feeds"),
        edge("dep-payoff", "recursion value", "produces"),
      ],
    },
  };
  return wrap(caseId, commanders, cz, dep, buildIndependentMinimal(caseId), buildHarmonyUnderdetermined(caseId));
}

export function buildGraveyardRecoveryClosed(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const base = buildGraveyardRecoveryGap(caseId, commanders, cz);
  base.lenses.DEPENDENT_SYNERGY.validatedPackages.push(
    pkg("dep-recovery", "Graveyard recovery", ["restored graveyard access"], ["graveyard creatures"], [], {
      semanticRequirements: ["recovers after exile or wipe"],
    }),
  );
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.nodes.push(node("restored graveyard access", "restored graveyard access", "graveyard"));
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.edges.push(edge("dep-recovery", "restored graveyard access", "produces"));
  return base;
}

export function buildProtectionGap(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const dep = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-dep-hyp`,
        strategyStatement: "Attrition engine facing removal pressure",
        engineInputs: ["persistent engine"],
        engineOutputs: ["attrition advantage"],
        commanderDependencies: [],
        resourceTransformations: [],
      },
    ],
    validatedPackages: [
      pkg("dep-engine", "Attrition engine", ["persistent engine"], ["mana"], [], { semanticRequirements: ["needs stabilization against removal"] }),
      pkg("dep-payoff", "Attrition payoff", ["attrition advantage"], ["persistent engine"], ["opponents lose resources"]),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("persistent engine"), node("attrition advantage"), node("mana")],
      edges: [edge("dep-engine", "persistent engine", "produces"), edge("persistent engine", "attrition advantage", "feeds"), edge("dep-payoff", "attrition advantage", "produces")],
    },
  };
  return wrap(caseId, commanders, cz, dep, buildIndependentMinimal(caseId), buildHarmonyUnderdetermined(caseId));
}

export function buildProtectionClosed(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const base = buildProtectionGap(caseId, commanders, cz);
  base.lenses.DEPENDENT_SYNERGY.validatedPackages.push(
    pkg("dep-protection", "Engine protection", ["stabilized engine"], ["persistent engine"], [], { semanticRequirements: ["protection against removal and stax"] }),
  );
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.edges.push(edge("dep-protection", "stabilized engine", "protects"), edge("stabilized engine", "persistent engine", "feeds"));
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.nodes.push(node("stabilized engine"));
  return base;
}

export function buildFinisherGap(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const dep = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-dep-hyp`,
        strategyStatement: "Combat engine without terminal pressure",
        engineInputs: ["evasive attackers"],
        engineOutputs: ["combat damage"],
        commanderDependencies: [],
        resourceTransformations: [],
      },
    ],
    validatedPackages: [
      pkg("dep-engine", "Combat setup", ["evasive attackers"], ["mana"], []),
      pkg("dep-payoff", "Incremental combat value", ["combat damage"], ["evasive attackers"], ["small combat triggers"]),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("evasive attackers"), node("combat damage"), node("mana")],
      edges: [edge("dep-engine", "evasive attackers", "produces"), edge("evasive attackers", "combat damage", "feeds"), edge("dep-payoff", "combat damage", "produces")],
    },
  };
  return wrap(caseId, commanders, cz, dep, buildIndependentMinimal(caseId), buildHarmonyUnderdetermined(caseId));
}

export function buildFinisherClosed(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const base = buildFinisherGap(caseId, commanders, cz);
  base.lenses.DEPENDENT_SYNERGY.validatedPackages.push(
    pkg("dep-finisher", "Terminal combat finisher", ["lethal combat damage"], ["combat damage"], ["deals lethal combat damage to opponents"]),
  );
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.nodes.push(node("lethal combat damage"));
  base.lenses.DEPENDENT_SYNERGY.resourceGraph.edges.push(edge("dep-finisher", "lethal combat damage", "produces"), edge("combat damage", "lethal combat damage", "feeds"));
  return base;
}

export function buildHarmonyBridgeClosed(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const dep = buildTokenSwarmClosed(caseId, commanders, cz).lenses.DEPENDENT_SYNERGY;
  const ind = buildConversionClosed(caseId, commanders, cz).lenses.INDEPENDENT_SYNERGY;
  const bridgePkg = pkg("harm-bridge", "Dual-chain bridge", ["bridge value"], ["creature tokens", "converted advantage"], ["creatures that also convert resources"], {
    resourceTransformations: ["feeds both token and conversion chains"],
  });
  const harm = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-harm-hyp`,
        strategyStatement: "Bridge token engine with conversion engine",
        engineInputs: ["creature tokens", "converted advantage"],
        engineOutputs: ["bridge value"],
        commanderDependencies: [],
        resourceTransformations: ["cross-engine bridge"],
        secondaryLoop: true,
      },
    ],
    validatedPackages: [bridgePkg],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("creature tokens"), node("converted advantage"), node("bridge value")],
      edges: [
        edge("creature tokens", "bridge value", "bridges"),
        edge("converted advantage", "bridge value", "bridges"),
        edge("harm-bridge", "bridge value", "produces"),
      ],
    },
  };
  return wrap(caseId, commanders, cz, dep, ind, harm);
}

export function buildEvidenceInsufficient(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const base = buildTokenSwarmClosed(caseId, commanders, cz);
  base.frozenFacts.status = "UNAVAILABLE";
  base.frozenOpportunities = [{ opportunityId: `${caseId}-opp`, description: "Incomplete oracle slice", status: "UNAVAILABLE" }];
  return base;
}

export function buildIndependentEnablerGap(caseId: string, commanders: string[], cz: CaseSemanticFixture["commandZoneConfiguration"]): CaseSemanticFixture {
  const ind = {
    hypotheses: [
      {
        hypothesisId: `${caseId}-ind-hyp`,
        strategyStatement: "Independent spells engine missing standalone setup",
        engineInputs: ["spell density"],
        engineOutputs: ["spell payoff"],
        commanderDependencies: [],
        resourceTransformations: [],
        secondaryLoop: true,
      },
    ],
    validatedPackages: [pkg("ind-payoff", "Spell payoff", ["spell payoff"], ["spell density"], ["benefits from casting instants and sorceries"])],
    rejectedPackages: [invalidPkg("ind-invalid", "Commander-only spell fuel", "validator_v2_failed")],
    resourceGraph: {
      nodes: [node("spell density"), node("spell payoff")],
      edges: [edge("spell payoff", "spell payoff", "feeds")],
    },
  };
  return wrap(caseId, commanders, cz, buildDependentMinimal(caseId), ind, buildHarmonyUnderdetermined(caseId));
}

function buildDependentMinimal(caseId: string): LensSemanticFixture {
  return {
    hypotheses: [
      {
        hypothesisId: `${caseId}-dep-hyp`,
        strategyStatement: "Minimal commander-linked engine",
        engineInputs: ["mana"],
        engineOutputs: ["primary advantage"],
        commanderDependencies: ["uses commander"],
        resourceTransformations: [],
      },
    ],
    validatedPackages: [
      pkg("dep-engine", "Primary engine", ["primary advantage"], ["mana"], []),
      pkg("dep-payoff", "Primary payoff", ["win pressure"], ["primary advantage"], ["converts advantage to pressure"]),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("primary advantage"), node("win pressure"), node("mana")],
      edges: [edge("dep-engine", "primary advantage", "produces"), edge("primary advantage", "win pressure", "feeds"), edge("dep-payoff", "win pressure", "produces")],
    },
  };
}

function buildIndependentMinimal(caseId: string): LensSemanticFixture {
  return {
    hypotheses: [
      {
        hypothesisId: `${caseId}-ind-hyp`,
        strategyStatement: "Standalone engine closed loop",
        engineInputs: ["setup"],
        engineOutputs: ["standalone advantage"],
        commanderDependencies: [],
        resourceTransformations: [],
      },
    ],
    validatedPackages: [
      pkg("ind-enabler", "Setup enabler", ["setup"], [], []),
      pkg("ind-engine", "Standalone engine", ["standalone advantage"], ["setup"], []),
      pkg("ind-payoff", "Standalone payoff", ["win pressure"], ["standalone advantage"], ["standalone win pressure"]),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("setup"), node("standalone advantage"), node("win pressure")],
      edges: [edge("ind-enabler", "setup", "produces"), edge("ind-engine", "standalone advantage", "produces"), edge("standalone advantage", "win pressure", "feeds"), edge("ind-payoff", "win pressure", "produces")],
    },
  };
}

function buildHarmonyBridge(dep: LensSemanticFixture, ind: LensSemanticFixture): LensSemanticFixture {
  return {
    hypotheses: [
      {
        hypothesisId: "harm-hyp",
        strategyStatement: "Connect commander-linked and independent chains",
        engineInputs: dep.hypotheses[0]?.engineOutputs ?? [],
        engineOutputs: ["bridge value"],
        commanderDependencies: [],
        resourceTransformations: ["cross-engine bridge"],
        secondaryLoop: true,
      },
    ],
    validatedPackages: [
      pkg("harm-bridge", "Bridge package", ["bridge value"], [...(dep.validatedPackages[0]?.producedResources ?? []), ...(ind.validatedPackages[0]?.producedResources ?? [])], ["serves both engines"], {
        resourceTransformations: ["bridges both chains"],
      }),
    ],
    rejectedPackages: [],
    resourceGraph: {
      nodes: [node("bridge value"), ...(dep.resourceGraph.nodes.slice(0, 1)), ...(ind.resourceGraph.nodes.slice(0, 1))],
      edges: [
        edge(dep.resourceGraph.nodes[0]?.nodeId ?? "a", "bridge value", "bridges"),
        edge(ind.resourceGraph.nodes[0]?.nodeId ?? "b", "bridge value", "bridges"),
        edge("harm-bridge", "bridge value", "produces"),
      ],
    },
  };
}

function buildHarmonyUnderdetermined(caseId: string): LensSemanticFixture {
  return {
    hypotheses: [
      {
        hypothesisId: `${caseId}-harm-hyp`,
        strategyStatement: "Potential bridge without evidence",
        engineInputs: ["chain A", "chain B"],
        engineOutputs: [],
        commanderDependencies: [],
        resourceTransformations: [],
      },
    ],
    validatedPackages: [],
    rejectedPackages: [],
    resourceGraph: { nodes: [node("chain A"), node("chain B")], edges: [] },
  };
}

function wrap(
  caseId: string,
  commanders: string[],
  commandZoneConfiguration: CaseSemanticFixture["commandZoneConfiguration"],
  dep: LensSemanticFixture,
  ind: LensSemanticFixture,
  harm: LensSemanticFixture,
): CaseSemanticFixture {
  return {
    caseId,
    commanders,
    commandZoneConfiguration,
    frozenFacts: {
      commanderOracleText: `${commanders.join(" // ")} oracle text stub`,
      commanderRelevantAbilities: ["relevant ability summary"],
      zoneRestrictions: [],
      activationRequirements: commandZoneConfiguration === "partner_pair" ? ["both partners available"] : [],
      relevantRulesFacts: ["rules context stub"],
      status: "AVAILABLE",
    },
    frozenOpportunities: [{ opportunityId: `${caseId}-core-opp`, description: "Planning opportunities", status: "AVAILABLE" }],
    lenses: { DEPENDENT_SYNERGY: dep, INDEPENDENT_SYNERGY: ind, HARMONY: harm },
  };
}

export type ScenarioKind =
  | "token_closed"
  | "token_fuel_gap"
  | "conversion_closed"
  | "conversion_gap"
  | "partner_maint_gap"
  | "partner_maint_closed"
  | "graveyard_recovery_gap"
  | "graveyard_recovery_closed"
  | "protection_gap"
  | "protection_closed"
  | "finisher_gap"
  | "finisher_closed"
  | "harmony_bridge_closed"
  | "harmony_underdetermined"
  | "evidence_insufficient"
  | "independent_enabler_gap"
  | "minimal_closed";

export function buildFixtureForScenario(
  scenario: ScenarioKind,
  caseId: string,
  commanders: string[],
  commandZoneConfiguration: CaseSemanticFixture["commandZoneConfiguration"],
): CaseSemanticFixture {
  switch (scenario) {
    case "token_closed":
      return buildTokenSwarmClosed(caseId, commanders, commandZoneConfiguration);
    case "token_fuel_gap":
      return buildTokenSwarmFuelGap(caseId, commanders, commandZoneConfiguration);
    case "conversion_closed":
      return buildConversionClosed(caseId, commanders, commandZoneConfiguration);
    case "conversion_gap":
      return buildConversionGap(caseId, commanders, commandZoneConfiguration);
    case "partner_maint_gap":
      return buildPartnerMaintenanceGap(caseId, commanders, "partner_pair");
    case "partner_maint_closed":
      return buildPartnerMaintenanceClosed(caseId, commanders, "partner_pair");
    case "graveyard_recovery_gap":
      return buildGraveyardRecoveryGap(caseId, commanders, commandZoneConfiguration);
    case "graveyard_recovery_closed":
      return buildGraveyardRecoveryClosed(caseId, commanders, commandZoneConfiguration);
    case "protection_gap":
      return buildProtectionGap(caseId, commanders, commandZoneConfiguration);
    case "protection_closed":
      return buildProtectionClosed(caseId, commanders, commandZoneConfiguration);
    case "finisher_gap":
      return buildFinisherGap(caseId, commanders, commandZoneConfiguration);
    case "finisher_closed":
      return buildFinisherClosed(caseId, commanders, commandZoneConfiguration);
    case "harmony_bridge_closed":
      return buildHarmonyBridgeClosed(caseId, commanders, commandZoneConfiguration);
    case "harmony_underdetermined": {
      const base = buildTokenSwarmClosed(caseId, commanders, commandZoneConfiguration);
      base.lenses.HARMONY = buildHarmonyUnderdetermined(caseId);
      return base;
    }
    case "evidence_insufficient":
      return buildEvidenceInsufficient(caseId, commanders, commandZoneConfiguration);
    case "independent_enabler_gap":
      return buildIndependentEnablerGap(caseId, commanders, commandZoneConfiguration);
    case "minimal_closed":
    default:
      return wrap(caseId, commanders, commandZoneConfiguration, buildDependentMinimal(caseId), buildIndependentMinimal(caseId), buildHarmonyUnderdetermined(caseId));
  }
}

/** DEV36 scenario assignments — upstream semantics only, no closure answers. */
export const DEV36_SCENARIO_ASSIGNMENTS: ScenarioKind[] = [
  "token_closed",
  "token_fuel_gap",
  "partner_maint_closed",
  "partner_maint_gap",
  "graveyard_recovery_closed",
  "graveyard_recovery_gap",
  "conversion_closed",
  "conversion_gap",
  "protection_closed",
  "protection_gap",
  "finisher_closed",
  "finisher_gap",
  "independent_enabler_gap",
  "token_closed",
  "harmony_bridge_closed",
  "harmony_underdetermined",
  "conversion_closed",
  "finisher_gap",
  "protection_gap",
  "token_fuel_gap",
  "graveyard_recovery_gap",
  "partner_maint_closed",
  "harmony_bridge_closed",
  "finisher_closed",
  "minimal_closed",
  "token_closed",
  "conversion_gap",
  "protection_closed",
  "independent_enabler_gap",
  "minimal_closed",
  "conversion_closed",
  "partner_maint_gap",
  "graveyard_recovery_closed",
  "evidence_insufficient",
  "evidence_insufficient",
  "harmony_underdetermined",
];

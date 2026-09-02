/**
 * Professor Council Orchestrator v4.5 — staged collaborative council dialogue + shared state patches.
 */
import { COMMANDER_BRACKET_META_V1 } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import {
  councilSpeakerLabel,
  emptyProfessorCouncilStateV45,
  type CouncilBrewContextV45,
  type CouncilDecisionV45,
  type CouncilTurnV45,
  type DeckCharterV45,
  type DeckSnapshotV45,
  type ProfessorCouncilStateV45,
  type StrategyPathV45,
} from "./professor-council-state-v4-5-v1";
import { bracketLabel } from "./professor-brew-bracket-v4-v1";
import {
  buildBracketBuildPlanV49,
  buildBracketStrategyCouncilTurnsV49,
} from "./professor-bracket-build-plan-v4-9-v1";
import { buildBracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import { buildBracketConstructionContractV416 } from "./professor-bracket-construction-contract-v4-16-v1";
import { buildManaPlanV416 } from "./professor-mana-plan-v4-16-v1";
import { sanitizeCharterProvenanceV4162 } from "./professor-charter-provenance-v4-16-2-v1";
import { sanitizeUnsupportedCharterConceptsV4163 } from "./professor-charter-concept-support-v4-16-3-v1";
import { buildBracketPowerDecisionCouncilV410 } from "./professor-bracket-power-decision-v4-10-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import type { CardDecisionV46, ProfessorCouncilStateV46 } from "./professor-council-assembly-v4-6-v1";

export const PROFESSOR_COUNCIL_ORCHESTRATOR_V4_5_V1_VERSION = "professor-council-orchestrator-v4-5-v1";

function turnId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

function relationshipLabel(lens: string | null): string {
  if (!lens) return "Harmony";
  if (lens.includes("DEPENDENT")) return "Commander Focus";
  if (lens.includes("INDEPENDENT")) return "Independent Engine";
  return "Harmony";
}

function playStyleFromIntent(userIntent: string[]): string {
  const style = userIntent.find((i) => !i.startsWith("Bracket") && !i.includes("SYNERGY"));
  return style ?? "Let professors decide";
}

function summarizeCriticForDialogue(loopResult: ProfessorV41ConversationLoopResultV1 | null): string {
  const annotations = loopResult?.criticAnnotations ?? [];
  const unverified = annotations.filter((a) => a.annotation !== "VERIFIED");
  const verified = annotations.filter((a) => a.annotation === "VERIFIED");
  if (unverified.length === 0 && verified.length > 0) {
    return `I've checked Creative's opening claims against oracle text and mechanism facts — ${verified.length} check out so far.`;
  }
  if (unverified.length > 0) {
    return `${unverified.length} card-specific interaction${unverified.length === 1 ? "" : "s"} still need oracle verification before we commit those packages. I'm checking them now — nothing is locked in yet.`;
  }
  return "I'll watch for cards that look synergistic individually but push the deck away from the player's requested style.";
}

function buildDeckCharter(args: {
  context: CouncilBrewContextV45;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
  relationship: string;
}): DeckCharterV45 {
  const bracketMeta = COMMANDER_BRACKET_META_V1[args.context.bracket];
  const primaryPkg = args.pass1.packages[0];
  const secondaryPkg = args.pass1.packages[1];
  const independent = args.pass1.independentEngines[0];
  const winPaths = args.pass1.winPaths.slice(0, 3).map((w) => w.description);

  const relationship = relationshipLabel(args.context.relationshipLens);
  const playStyle = playStyleFromIntent(args.context.userIntent);

  const designRules: string[] = [];
  if (relationship === "Harmony") {
    designRules.push("Establish at least one independent engine before over-investing in commander-specific payoff.");
    designRules.push("Prefer multi-role cards that support both commander scaling and independent value.");
  } else if (relationship === "Independent Engine") {
    designRules.push("The deck must function when the commander is removed.");
    designRules.push("Commander payoffs are bonus scaling, not structural requirements.");
  } else {
    designRules.push("Commander-dependent synergies are allowed when bracket and play style support them.");
  }
  designRules.push("Prefer role compression over narrow single-purpose slots.");

  return {
    commander: args.context.commanderName,
    requestedBracket: args.context.bracket,
    playStyle,
    commanderRelationship: relationship,
    deckIdentity: args.pass1.strategicThesis.split(".").slice(0, 1).join(".") || args.theory.thesis.deckIdentity,
    playerIntentSummary: args.context.userIntent.join(" · "),
    primaryStrategy: primaryPkg?.concept ?? args.pass1.strategicThesis.slice(0, 120),
    secondaryStrategy: secondaryPkg?.concept ?? args.pass1.winPaths[0]?.description ?? "Flexible backup plan",
    commanderDependentEngine: primaryPkg?.purpose ?? args.pass1.mechanicInterpretation.slice(0, 2).join(" → "),
    independentEngine: independent?.description ?? secondaryPkg?.purpose ?? "Secondary engine TBD at skeleton phase",
    harmonyPlan:
      relationship === "Harmony"
        ? "Lifegain and commander scaling should share cards where possible; legendary payoffs bridge both engines."
        : `${relationship} — commander and independent engines have distinct roles.`,
    intendedWinPaths: winPaths.length > 0 ? winPaths : ["Incremental board advantage", "Commander-led pressure"],
    expectedPlayPattern: `${bracketMeta.name} — ${bracketMeta.intentPhilosophy}`,
    bracketConstraints: `Stay within Bracket ${args.context.bracket} power patterns: ${bracketMeta.intentPhilosophy}`,
    comboPolicy: args.context.bracket <= 2 ? "Avoid deterministic infinite combos." : "Combos acceptable if bracket-appropriate.",
    tutorPolicy: args.context.bracket <= 2 ? "Minimal tutoring." : "Tutors allowed within bracket norms.",
    designRules,
    avoidPatterns: [
      "Slots that only gain life without advancing another engine",
      "Commander dependence above charter target without payoff",
      "Power patterns inconsistent with selected bracket",
    ],
    researchPriorities: [
      "Role-compressed lifegain effects",
      "Legendary creatures that benefit from shared board state",
      "Independent engines that reuse the same resources",
      "Protection and interaction at appropriate rate",
    ],
  };
}

function buildStrategyPaths(args: {
  pass1: CreativeProfessorPass1V4;
  charter: DeckCharterV45;
}): StrategyPathV45[] {
  const paths: StrategyPathV45[] = [];
  const commanderShort = args.charter.commander.split(",")[0]?.trim() ?? args.charter.commander;

  if (args.pass1.packages[0]) {
    paths.push({
      pathId: "path-a",
      label: "Path A — Primary engine first",
      summary: `${args.pass1.packages[0].concept}: ${args.pass1.packages[0].purpose}`,
      commanderDependence: args.pass1.packages[0].commanderDependence,
    });
  }
  if (args.pass1.independentEngines[0]) {
    paths.push({
      pathId: "path-b",
      label: "Path B — Independent value",
      summary: args.pass1.independentEngines[0].description,
      commanderDependence: "LOW",
    });
  }
  if (args.pass1.packages[1]) {
    paths.push({
      pathId: "path-c",
      label: "Path C — Hybrid harmony",
      summary: `Combine ${args.pass1.packages[0]?.concept ?? "primary engine"} with ${args.pass1.packages[1].concept}, using ${commanderShort} as payoff rather than sole engine.`,
      commanderDependence: "MEDIUM",
    });
  }
  if (args.pass1.openQuestions[0]) {
    paths.push({
      pathId: "path-d",
      label: "Path D — Unusual angle",
      summary: args.pass1.openQuestions[0],
      commanderDependence: "MEDIUM",
    });
  }
  return paths.slice(0, 4);
}

function buildSkeletonRoles(theory: WorkingDeckTheoryV4): string[] {
  const roles = new Set<string>(["MANA", "CARD ADVANTAGE", "INTERACTION", "PROTECTION", "RECOVERY", "FINISHER"]);
  for (const pkg of theory.packages.slice(0, 4)) {
    if (/lifegain|life gain|life/i.test(pkg.name + pkg.purpose)) roles.add("LIFEGAIN ENGINE");
    if (/legendary|legend/i.test(pkg.name + pkg.purpose)) roles.add("LEGENDARY PAYOFFS");
  }
  if (theory.independentEngines.length > 0) roles.add("INDEPENDENT ENGINE");
  roles.add("HARMONY BRIDGES");
  return [...roles];
}

export function deriveTreeGrowthLineFromTheory(theory: WorkingDeckTheoryV4 | null, step: number): string {
  if (!theory) {
    return step === 2
      ? "The engines are taking shape from what this commander actually rewards."
      : step === 3
        ? "I'm laying out the packages that implement each engine."
        : "Cards are attaching to branches. Click any card to see why it's here.";
  }

  const engines = theory.packages.slice(0, 2).map((p) => p.name).filter(Boolean);
  const mechanicChain = theory.thesis.mechanicChain.slice(0, 2).join(" → ");

  if (step === 2) {
    if (mechanicChain) {
      return `These branches follow the chain we agreed on — ${mechanicChain}.`;
    }
    if (engines.length >= 2) {
      return `Two engines are emerging: ${engines[0]} feeding ${engines[1]}.`;
    }
    if (engines.length === 1) {
      return `${engines[0]} is the spine — supporting packages branch from there.`;
    }
    return `${theory.thesis.deckIdentity.slice(0, 140)} — that's what the tree is building toward.`;
  }
  if (step === 3) {
    return "I'm laying out the packages that implement each engine we chartered.";
  }
  return "Cards are attaching to branches. Click any card to see why it's here.";
}

export function buildCollaborativeCouncilStateV45(args: {
  context: CouncilBrewContextV45;
  loopResult: ProfessorV41ConversationLoopResultV1;
  theory: WorkingDeckTheoryV4;
}): ProfessorCouncilStateV47 {
  const state = emptyProfessorCouncilStateV45();
  const conversation: CouncilTurnV45[] = [];
  const decisions: CouncilDecisionV45[] = [];
  let turnCounter = 0;

  const push = (turn: Omit<CouncilTurnV45, "turnId">) => {
    conversation.push({ ...turn, turnId: turnId("t", turnCounter++) });
  };

  const pass1 = args.loopResult.creativePass1;
  const relationship = relationshipLabel(args.context.relationshipLens);
  const playStyle = playStyleFromIntent(args.context.userIntent);
  const bracket = bracketLabel(args.context.bracket);

  // ── Phase 1: Pre-build council ──────────────────────────────────────────
  push({
    phase: "PRE_BUILD",
    speaker: "CREATIVE",
    intent: "PROPOSE",
    respondsToTurnIds: [],
    message: `Given ${bracket} and the play style you chose (${playStyle}), I think there are two realistic ways to build ${args.context.commanderName}. We can make ${pass1.packages[0]?.concept?.toLowerCase() ?? "the primary engine"} the main plan, or use it primarily to support ${pass1.packages[1]?.concept?.toLowerCase() ?? "a secondary engine"} while ${relationship === "Harmony" ? "keeping an independent win condition alive" : `staying true to your ${relationship.toLowerCase()} preference`}.`,
  });

  const tCreative1 = conversation[conversation.length - 1]!.turnId;

  push({
    phase: "PRE_BUILD",
    speaker: "RESEARCH",
    intent: "CHALLENGE",
    respondsToTurnIds: [tCreative1],
    message: `Before we choose, I want to check what ${args.context.commanderName.split(",")[0]} actually rewards most efficiently and compare that against established strategies and semantic card patterns. ${pass1.mechanicInterpretation[0] ? `Oracle suggests: ${pass1.mechanicInterpretation[0]}.` : ""} We should decide whether the primary resource is fuel for the commander or the foundation of an independent engine.`,
  });

  const tResearch1 = conversation[conversation.length - 1]!.turnId;

  push({
    phase: "PRE_BUILD",
    speaker: "CRITIC",
    intent: "CHALLENGE",
    respondsToTurnIds: [tCreative1, tResearch1],
    message: `I agree, but if we're staying inside ${bracket}, we should decide now whether we're allowing deterministic combos, heavy tutoring, and repeated protection. That changes which version of this deck we should build — especially with ${relationship} as the commander relationship target.`,
  });

  const tCritic1 = conversation[conversation.length - 1]!.turnId;

  const primaryPackage = pass1.packages[0]?.concept ?? "primary engine";

  const bracketBuildPlan = buildBracketBuildPlanV49({
    bracket: args.context.bracket,
    playStyle,
    relationship,
    commanderName: args.context.commanderName,
    pass1,
  });
  const bracketDialogue = buildBracketStrategyCouncilTurnsV49({
    bracket: args.context.bracket,
    commanderName: args.context.commanderName,
    playStyle,
    relationship,
    plan: bracketBuildPlan,
    primaryStrategy: primaryPackage,
  });

  push({
    phase: "PRE_BUILD",
    speaker: "CREATIVE",
    intent: "PROPOSE",
    respondsToTurnIds: [tCritic1],
    message: bracketDialogue.creative,
  });
  push({
    phase: "PRE_BUILD",
    speaker: "RESEARCH",
    intent: "SEARCH",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: bracketDialogue.research,
  });
  push({
    phase: "PRE_BUILD",
    speaker: "CRITIC",
    intent: "DECIDE",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: bracketDialogue.critic,
  });
  push({
    phase: "PRE_BUILD",
    speaker: "CREATIVE",
    intent: "DECIDE",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: `Good. Keep the ${playStyle.toLowerCase()} identity, but push every supporting system toward the B${args.context.bracket} ceiling.`,
  });

  decisions.push({
    decisionId: "dec-bracket-strategy",
    phase: "PRE_BUILD",
    decision: bracketDialogue.decision,
    reasoning: bracketBuildPlan.powerPlanSummary.join(" "),
    supportingTurnIds: conversation.slice(-4).map((t) => t.turnId),
    designRulesAdded: [`Build strongest B${args.context.bracket} version of chosen identity`],
    reconsiderable: false,
  });

  const bracketPowerPlanV410 = buildBracketPowerPlanV410({
    bracket: args.context.bracket,
    commanderName: args.context.commanderName,
    playStyle,
    relationship,
    pass1,
    buildPlan: bracketBuildPlan,
  });
  const powerDecisionCouncil = buildBracketPowerDecisionCouncilV410({
    plan: bracketPowerPlanV410,
    commanderShort: args.context.commanderName.split(",")[0]?.trim() ?? args.context.commanderName,
    playStyle,
  });
  for (const turn of powerDecisionCouncil.turns) {
    push({ ...turn, respondsToTurnIds: [conversation[conversation.length - 1]?.turnId ?? ""] });
  }
  decisions.push({
    decisionId: powerDecisionCouncil.powerDecision.councilDecisionId,
    ...powerDecisionCouncil.decision,
    supportingTurnIds: conversation.slice(-3).map((t) => t.turnId),
  });

  const roleCompressionExample = pass1.packages.slice(0, 2).map((p) => p.concept).join(" plus ") || primaryPackage;

  push({
    phase: "PRE_BUILD",
    speaker: "CREATIVE",
    intent: "DECIDE",
    respondsToTurnIds: [tResearch1, tCritic1],
    message: `Good point. Let's define the deck as a ${playStyle.toLowerCase()} ${primaryPackage.toLowerCase()} build rather than a combo shell. Research, find pieces that also perform another job — not narrow ${primaryPackage.toLowerCase()} for its own sake.`,
  });

  const tCreative2 = conversation[conversation.length - 1]!.turnId;

  push({
    phase: "PRE_BUILD",
    speaker: "RESEARCH",
    intent: "SEARCH",
    respondsToTurnIds: [tCreative2],
    message: `I'll search for effects that compress roles: ${roleCompressionExample}, plus interaction and card advantage that support ${args.context.commanderName.split(",")[0]}.`,
  });

  push({
    phase: "PRE_BUILD",
    speaker: "CRITIC",
    intent: "VERIFY",
    respondsToTurnIds: [tCreative2],
    message: summarizeCriticForDialogue(args.loopResult),
    developerDetail: (args.loopResult.criticAnnotations ?? [])
      .filter((a) => a.annotation !== "VERIFIED")
      .map((a) => a.claimId)
      .join(", "),
  });

  let charter = buildDeckCharter({
    context: args.context,
    pass1,
    theory: args.theory,
    relationship,
  });
  charter.bracketConstraints = `TARGET B${args.context.bracket}: ${bracketBuildPlan.expectedExperience}`;
  charter.researchPriorities = [
    ...bracketBuildPlan.bracketPowerLeversToUse.slice(0, 4),
    ...charter.researchPriorities.slice(0, 2),
  ];
  const provenance = sanitizeCharterProvenanceV4162(charter);
  charter = provenance.charter;
  const support = sanitizeUnsupportedCharterConceptsV4163(charter);
  charter = support.charter;

  const bracketConstructionContractV416 = buildBracketConstructionContractV416({
    bracket: args.context.bracket,
    charter,
    pass1,
    buildPlan: bracketBuildPlan,
    powerPlan: bracketPowerPlanV410,
  });
  const manaPlanV416 = buildManaPlanV416({
    bracket: args.context.bracket,
    contract: bracketConstructionContractV416,
    colorIdentity: [],
  });

  const preBuildDecision: CouncilDecisionV45 = {
    decisionId: "dec-prebuild-charter",
    phase: "PRE_BUILD",
    decision: "Deck Charter agreed — no individual cards until strategy and skeleton are set.",
    reasoning: charter.designRules.join(" "),
    supportingTurnIds: conversation.filter((t) => t.phase === "PRE_BUILD").map((t) => t.turnId),
    designRulesAdded: charter.designRules,
    reconsiderable: true,
  };
  decisions.push(preBuildDecision);

  push({
    phase: "PRE_BUILD",
    speaker: "SYSTEM",
    intent: "DECIDE",
    respondsToTurnIds: preBuildDecision.supportingTurnIds,
    message: `Council decision: ${charter.deckIdentity.slice(0, 160)} Design rules locked: ${charter.designRules.slice(0, 2).join("; ")}.`,
  });

  // ── Phase 2: Strategy council ───────────────────────────────────────────
  const strategyPaths = buildStrategyPaths({ pass1, charter });
  const pathSummaries = strategyPaths.map((p) => `${p.label}: ${p.summary}`).join(" ");

  push({
    phase: "STRATEGY",
    speaker: "RESEARCH",
    intent: "PROPOSE",
    respondsToTurnIds: [],
    message: `Strategy map for ${args.context.commanderName}: ${pathSummaries}`,
  });

  push({
    phase: "STRATEGY",
    speaker: "CREATIVE",
    intent: "COMPARE",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: `Path C looks closest to what the player asked for — ${relationship} between commander scaling and an independent ${charter.secondaryStrategy.toLowerCase()}.`,
  });

  push({
    phase: "STRATEGY",
    speaker: "CRITIC",
    intent: "DECIDE",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: `Agreed. We proceed with hybrid harmony unless the first card batches show commander dependence climbing too high.`,
  });

  decisions.push({
    decisionId: "dec-strategy-path",
    phase: "STRATEGY",
    decision: `Initial direction: ${strategyPaths[2]?.label ?? strategyPaths[0]?.label ?? "Primary engine"}`,
    reasoning: charter.primaryStrategy,
    supportingTurnIds: conversation.filter((t) => t.phase === "STRATEGY").map((t) => t.turnId),
    reconsiderable: true,
  });

  // ── Phase 3: Skeleton ───────────────────────────────────────────────────
  const openRoles = buildSkeletonRoles(args.theory);

  const skeletonFocus = charter.primaryStrategy.toLowerCase();
  push({
    phase: "SKELETON",
    speaker: "RESEARCH",
    intent: "PROPOSE",
    respondsToTurnIds: [],
    message: `Before individual cards: we need ${openRoles.slice(0, 6).join(", ")}, plus harmony bridges. If every card only serves one narrow role without supporting ${skeletonFocus}, we'll waste slots — role compression is a design rule.`,
  });

  push({
    phase: "SKELETON",
    speaker: "CREATIVE",
    intent: "DECIDE",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: "Agreed. Role compression should be one of the deck's design rules.",
  });

  push({
    phase: "SKELETON",
    speaker: "CRITIC",
    intent: "DECIDE",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: `Then I will penalize cards that only fill one narrow role without supporting ${charter.primaryStrategy.toLowerCase()} unless the rate is exceptional.`,
  });

  decisions.push({
    decisionId: "dec-skeleton",
    phase: "SKELETON",
    decision: "Deck skeleton established — assemble in batches with council review at checkpoints.",
    reasoning: openRoles.join(", "),
    supportingTurnIds: conversation.filter((t) => t.phase === "SKELETON").map((t) => t.turnId),
    designRulesAdded: ["Role compression over narrow effects", "Checkpoint review every ~20 cards"],
    reconsiderable: false,
  });

  push({
    phase: "ASSEMBLY",
    speaker: "SYSTEM",
    intent: "CHANGE",
    respondsToTurnIds: [decisions[decisions.length - 1]!.supportingTurnIds[0] ?? ""],
    message: "Charter complete. Card assembly begins — each batch will trigger checkpoint review against the actual selected pool.",
  });

  const baseState: ProfessorCouncilStateV45 = {
    ...state,
    phase: "ASSEMBLY",
    deckCharter: charter,
    strategyPaths,
    selectedStrategyPathId: strategyPaths[2]?.pathId ?? strategyPaths[0]?.pathId ?? null,
    workingDeckTheory: args.theory,
    openRoles,
    councilDecisions: decisions,
    conversation,
    loopResult: args.loopResult,
    revisionHistory: [{ revision: 0, summary: "Collaborative council charter established.", author: "SYSTEM" }],
  };

  return {
    ...baseState,
    version: "professor-council-assembly-v4-7-v1",
    bracketBuildPolicy: null,
    bracketBuildPlan,
    bracketPowerPlanV410,
    bracketPowerDecisionV410: powerDecisionCouncil.powerDecision,
    searchComparisonTelemetryV410: [],
    selectedCards: [],
    candidatePool: [],
    rejectedCards: [],
    cardDecisions: [],
    replacementHistory: [],
    checkpointsCompleted: [],
    assemblyRevision: 0,
    snapshots: [],
    buildPhase: "CHARTER",
    deckNeeds: [],
    candidatesByNeed: {},
    functionalProfiles: {},
    discoveryReports: [],
    legalityGate: null,
    targetTotalCards: 100,
    bracketConstructionContractV416,
    manaPlanV416,
    bracketPowerPortfolioV416: null,
    bracketPowerSearchReportsV416: [],
    bracketReadinessV416: null,
    highDeficitCheckpointStreakV416: 0,
    winArchitectureLockedV416: false,
  } as ProfessorCouncilStateV47;
}

export function appendCheckpointCouncilTurnsV45(args: {
  state: ProfessorCouncilStateV45;
  snapshot: DeckSnapshotV45;
}): ProfessorCouncilStateV45 {
  const conversation = [...args.state.conversation];
  let turnCounter = conversation.length;
  const push = (turn: Omit<CouncilTurnV45, "turnId">) => {
    conversation.push({ ...turn, turnId: turnId("t", turnCounter++) });
  };

  const charter = args.state.deckCharter;
  const depTarget = charter?.commanderRelationship === "Harmony" ? "lower" : charter?.commanderRelationship;

  push({
    phase: "CHECKPOINT",
    speaker: "RESEARCH",
    intent: "COMPARE",
    respondsToTurnIds: [],
    message: `Checkpoint at ${args.snapshot.cardCount} cards. Current engines: ${args.snapshot.engines.join(", ") || "forming"}. Commander-dependent: ${args.snapshot.commanderDependentCount}, independent: ${args.snapshot.independentCount}.${depTarget ? ` Our ${depTarget} target means we should examine whether dependence is drifting.` : ""}`,
  });

  if (args.snapshot.weaknesses.length > 0) {
    push({
      phase: "CHECKPOINT",
      speaker: "CRITIC",
      intent: "CHALLENGE",
      respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
      message: `Weak spots: ${args.snapshot.weaknesses.slice(0, 3).join("; ")}. I'll prefer replacements that fix multiple gaps.`,
    });
  }

  push({
    phase: "CHECKPOINT",
    speaker: "CREATIVE",
    intent: "SEARCH",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: `Given what's actually in the deck, what consumes the resources we're already producing? Search for payoffs connected to ${args.snapshot.packages.slice(0, 2).join(" and ") || "our packages"}.`,
  });

  return {
    ...state,
    phase: "CHECKPOINT",
    conversation,
    snapshots: [...args.state.snapshots, args.snapshot],
  };
}

export function buildDeckSnapshotV45(args: {
  theory: WorkingDeckTheoryV4 | null;
  selectedCount: number;
  targetCount?: number;
}): DeckSnapshotV45 {
  const theory = args.theory;
  const packages = theory?.packages.slice(0, 4).map((p) => p.name) ?? [];
  const engines = theory?.independentEngines.slice(0, 2).map((e) => e.description.slice(0, 60)) ?? [];
  const weaknesses = theory?.weaknesses.slice(0, 4) ?? [];

  const roleCounts: Record<string, number> = {};
  for (const pkg of theory?.packages ?? []) {
    roleCounts[pkg.name] = pkg.candidateCards.filter(Boolean).length;
  }

  return {
    snapshotId: `snap-${args.selectedCount}`,
    cardCount: args.selectedCount,
    targetCount: args.targetCount ?? 99,
    roleCounts,
    commanderDependentCount: Math.ceil(args.selectedCount * 0.45),
    independentCount: Math.floor(args.selectedCount * 0.55),
    engines,
    packages,
    weaknesses,
    charterAlignmentNotes: [],
  };
}

export type CouncilTranscriptEntryV45 = {
  id: string;
  order: number;
  kind: "TURN" | "DECISION" | "MUTATION";
  speaker: string;
  intent?: string;
  respondsToTurnIds?: string[];
  body: string;
  detail?: string;
  developerDetail?: string;
  mutationAction?: CardDecisionV46["action"];
};

function formatCardMutationV46(decision: CardDecisionV46): string {
  if (decision.action === "REPLACE") return `↻ ${decision.replacedCardName} → ${decision.cardName}`;
  if (decision.action === "CUT") return `− ${decision.cardName}`;
  if (decision.action === "ADD") return `+ ${decision.cardName}`;
  return `${decision.action} ${decision.cardName}`;
}

export function buildCouncilTranscriptFromStateV45(state: ProfessorCouncilStateV45 | null): CouncilTranscriptEntryV45[] {
  if (!state?.conversation.length) return [];

  const entries: CouncilTranscriptEntryV45[] = [];
  let order = 0;

  for (const turn of state.conversation) {
    entries.push({
      id: turn.turnId,
      order: order++,
      kind: "TURN",
      speaker: councilSpeakerLabel(turn.speaker),
      intent: turn.intent,
      respondsToTurnIds: turn.respondsToTurnIds,
      body: turn.message,
      developerDetail: turn.developerDetail,
    });

    const decision = state.councilDecisions.find((d) => d.supportingTurnIds.includes(turn.turnId) && d.phase === turn.phase);
    if (decision && turn.intent === "DECIDE" && turn.speaker === "SYSTEM") {
      entries.push({
        id: decision.decisionId,
        order: order++,
        kind: "DECISION",
        speaker: "Council decision",
        body: decision.decision,
        detail: decision.designRulesAdded?.join(" · "),
      });
    }
  }

  for (const decision of state.councilDecisions) {
    if (entries.some((e) => e.id === decision.decisionId)) continue;
    entries.push({
      id: decision.decisionId,
      order: order++,
      kind: "DECISION",
      speaker: "Council decision",
      body: decision.decision,
      detail: decision.designRulesAdded?.join(" · "),
    });
  }

  const v46 = state as ProfessorCouncilStateV46;
  for (const mutation of v46.cardDecisions ?? []) {
    entries.push({
      id: mutation.decisionId,
      order: order++,
      kind: "MUTATION",
      speaker: "Deck change",
      body: formatCardMutationV46(mutation),
      detail: mutation.reason,
      mutationAction: mutation.action,
      developerDetail: mutation.proposedBy,
    });
  }

  return entries.sort((a, b) => a.order - b.order);
}

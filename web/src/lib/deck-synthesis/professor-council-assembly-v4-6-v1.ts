/**
 * Professor Council Assembly v4.6 — incremental deck building, snapshots, checkpoint councils.
 */
import { COMMANDER_BRACKET_META_V1, type CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { WorkingDeckTheoryV4, WorkingDeckPackageV4 } from "./professor-working-deck-theory-v4";
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import type { ProfessorDeckListEntryV43 } from "./professor-brew-deck-list-v4-3-v1";
import { commitReplaceMutationV4161 } from "./professor-mutation-integrity-v4-16-1-v1";
import {
  resolveCreativeCheckpointMessageV4161,
  validateHoldCourseV4161,
} from "./professor-hold-course-validator-v4-16-1-v1";
import {
  councilSpeakerLabel,
  type CouncilBrewContextV45,
  type CouncilDecisionV45,
  type CouncilPhaseV45,
  type CouncilSpeakerV45,
  type CouncilTurnV45,
  type DeckCharterV45,
  type ProfessorCouncilStateV45,
} from "./professor-council-state-v4-5-v1";

export const PROFESSOR_COUNCIL_ASSEMBLY_V4_6_V1_VERSION = "professor-council-assembly-v4-6-v1";
export const PROFESSOR_V4_6_DECISION_V1 = "PROFESSOR_V4_6_COLLABORATIVE_DECK_ASSEMBLY_AND_CHECKPOINT_COUNCIL_V1_AUTHORIZED";

export const CHECKPOINT_THRESHOLDS_V46 = [12, 25, 40, 55, 70] as const;
export const INITIAL_BATCH_TARGET_V46 = 12;
export const ASSEMBLY_STOP_TARGET_V46 = 85;
export const CUT_REVIEW_THRESHOLD_V46 = 85;

export type CouncilCardOriginV46 =
  | "MODEL_PRIOR"
  | "COMMANDER_PRIMER"
  | "PACKAGE_RAG"
  | "GENERIC_STRATEGY_RAG"
  | "SEMANTIC_ORACLE"
  | "ORACLE_SEARCH"
  | "USER"
  | "DECK_CHECKPOINT";

export type CouncilCardStatusV46 =
  | "PROPOSED"
  | "CANDIDATE"
  | "VERIFIED"
  | "CORE"
  | "SELECTED"
  | "CUT_CANDIDATE"
  | "REJECTED";

export type CardDecisionActionV46 = "ADD" | "VERIFY" | "PROMOTE_CORE" | "KEEP" | "CUT" | "REPLACE" | "REJECT";

export type CouncilCardV46 = {
  cardId: string;
  oracleId: string | null;
  name: string;
  proposedBy: CouncilSpeakerV45;
  origin: CouncilCardOriginV46;
  proposalReason: string;
  functions: string[];
  roles: string[];
  packages: string[];
  engines: string[];
  commanderDependence: "HIGH" | "MEDIUM" | "LOW";
  worksWithoutCommander: "HIGH" | "MEDIUM" | "LOW";
  semanticConnections: string[];
  oracleVerified: boolean;
  legalityVerified: boolean;
  colorIdentityVerified: boolean;
  criticStatus: string;
  status: CouncilCardStatusV46;
  rejectionReason?: string;
  addedAtRevision: number;
  lastReviewedRevision: number;
  category: ProfessorDeckListEntryV43["category"];
};

export type CardDecisionV46 = {
  decisionId: string;
  cardId: string;
  cardName: string;
  action: CardDecisionActionV46;
  proposedBy: CouncilSpeakerV45;
  supportingCouncilTurnIds: string[];
  reason: string;
  replacedCardId?: string;
  replacedCardName?: string;
  revision: number;
};

export type BracketBuildPolicyV46 = {
  bracket: CommanderBracket;
  name: string;
  acceptablePatterns: string[];
  avoidPatterns: string[];
  comboExpectation: string;
  tutorExpectation: string;
  speedExpectation: string;
  interactionExpectation: string;
  gameChangerLimit: string;
};

export type DeckSnapshotV46 = {
  snapshotId: string;
  revision: number;
  cardCount: number;
  nonlandCount: number;
  landCount: number;
  targetCount: number;
  selectedCardsSummary: { name: string; roles: string[]; status: CouncilCardStatusV46 }[];
  roleCoverage: Record<string, number>;
  engineCoverage: Record<string, number>;
  packageCoverage: Record<string, number>;
  commanderDependenceDistribution: { high: number; medium: number; low: number };
  independentEngineCoverage: number;
  interactionCoverage: number;
  protectionCoverage: number;
  recoveryCoverage: number;
  cardAdvantageCoverage: number;
  rampCoverage: number;
  lifegainEnablerCount: number;
  lifegainPayoffCount: number;
  legendaryPayoffCount: number;
  semanticResourcesProduced: string[];
  semanticResourcesConsumed: string[];
  underusedResources: string[];
  redundancyClusters: string[];
  lowConnectionCards: string[];
  highRoleCompressionCards: string[];
  unresolvedVerification: string[];
  weaknesses: string[];
  charterAlignment: string[];
  bracketAlignment: string[];
  userIntentAlignment: string[];
  researchQuestion: string;
  bracketGapAnalysis?: import("./professor-bracket-gap-analysis-v4-9-v1").BracketGapAnalysisV49 | import("./professor-bracket-gap-analysis-v4-10-v1").BracketGapAnalysisV410 | null;
  avgManaValue?: number;
  rampNonLandCount?: number;
  tutorCount?: number;
};

export type ProfessorCouncilStateV46 = ProfessorCouncilStateV45 & {
  version: typeof PROFESSOR_COUNCIL_ASSEMBLY_V4_6_V1_VERSION;
  bracketBuildPolicy: BracketBuildPolicyV46 | null;
  selectedCards: CouncilCardV46[];
  candidatePool: CouncilCardV46[];
  rejectedCards: CouncilCardV46[];
  cardDecisions: CardDecisionV46[];
  replacementHistory: { revision: number; cut: string; added: string; reason: string }[];
  checkpointsCompleted: number[];
  assemblyRevision: number;
  snapshots: DeckSnapshotV46[];
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function looksLikeCardName(value: string): boolean {
  const v = value.trim();
  if (v.length < 4 || v.length > 48) return false;
  if (/^(ENABLER|FUEL|ENGINE|PAYOFF|PROTECTION|RECOVERY|CONVERSION|COMMANDER)/i.test(v)) return false;
  if (/produce|create|generate|payoff|drain|win|finish|scale|death|token|resource/i.test(v) && !v.includes(",")) return false;
  return /^[A-Z][A-Za-z0-9' ,\-]+$/.test(v);
}

function inferCategory(name: string): ProfessorDeckListEntryV43["category"] {
  const n = name.toLowerCase();
  if (/^(plains|island|swamp|mountain|forest|command tower|path of ancestry|exotic orchard)/.test(n)) return "land";
  if (/ring|signet|altar|clamp|greaves|boots|ornament|stone|mox|lotus/.test(n)) return "artifact";
  if (/wrath|damnation|toxic deluge|cultivate|kodama|living death|reanimate|animate dead/.test(n)) return "sorcery";
  if (/swords to|path to|counterspell|heroic intervention|beast within|putrefy|assassin/.test(n)) return "instant";
  if (/doubling season|rest in peace|rhystic|phyrexian arena|sanctuary|nest|reclamation/.test(n)) return "enchantment";
  return "creature";
}

function inferRoles(name: string, pkg: WorkingDeckPackageV4 | null, charter: DeckCharterV45 | null): string[] {
  const roles = new Set<string>();
  const n = name.toLowerCase();
  if (/sol ring|arcane signet|mind stone|talism|signet|mox|lotus/.test(n)) roles.add("ramp");
  if (/swords to|path to|beast within|putrefy|assassin|trophy|generous gift/.test(n)) roles.add("interaction");
  if (/heroic intervention|teferi|deflecting|lightning greaves|swiftfoot boots|sigarda/.test(n)) roles.add("protection");
  if (/phyrexian arena|rhystic|skullclamp|mentor|tireless tracker|guardian project|consecrated sphinx/.test(n)) roles.add("card-advantage");
  if (/soul warden|ajani's pridemate|essence warden|lifelink|authority of the consuls|suture priest/.test(n)) roles.add("lifegain-enabler");
  if (/aetherflux|felidar|trojan|well of lost dreams|vito|dawn of hope/.test(n)) roles.add("lifegain-payoff");
  if (/legendary|sigarda|teysa|yawgmoth|brago|jhoira/.test(n) || /,/.test(name)) roles.add("legendary");
  if (/cultivate|kodama|nature's lore|three visits|farseek|rampant growth|wood elves|sakura/.test(n)) roles.add("ramp");
  if (/craterhoof|triumph|overwhelming|finisher|thassa's oracle/.test(n)) roles.add("finisher");
  if (pkg) roles.add(pkg.name.toLowerCase());
  if (charter?.primaryStrategy && pkg?.name === charter.primaryStrategy) roles.add("primary-engine");
  return roles.size > 0 ? [...roles] : ["plan"];
}

function dependenceFromRoles(roles: string[], relationship: string): { cmd: CouncilCardV46["commanderDependence"]; ind: CouncilCardV46["worksWithoutCommander"] } {
  if (roles.includes("legendary") && relationship === "Harmony") {
    return { cmd: "MEDIUM", ind: "MEDIUM" };
  }
  if (roles.includes("lifegain-enabler") || roles.includes("ramp") || roles.includes("interaction")) {
    return { cmd: "LOW", ind: "HIGH" };
  }
  if (roles.includes("lifegain-payoff") && relationship === "Commander Focus") {
    return { cmd: "HIGH", ind: "LOW" };
  }
  return { cmd: "MEDIUM", ind: relationship === "Independent Engine" ? "HIGH" : "MEDIUM" };
}

export function buildBracketBuildPolicyV46(args: {
  bracket: CommanderBracket;
  playStyle: string;
  commanderRelationship: string;
}): BracketBuildPolicyV46 {
  const meta = COMMANDER_BRACKET_META_V1[args.bracket];
  return {
    bracket: args.bracket,
    name: meta.name,
    acceptablePatterns: [meta.intentPhilosophy, args.playStyle, args.commanderRelationship],
    avoidPatterns:
      args.bracket <= 2
        ? ["Deterministic infinite combos on turn 3-4", "Heavy tutor chains", "Extra turn chains"]
        : args.bracket <= 3
          ? ["Turn-2 combo wins", "Unlimited extra turns"]
          : [],
    comboExpectation: args.bracket <= 2 ? "Avoid deterministic combos" : args.bracket <= 3 ? "Finite combos ok" : "Fast combos possible",
    tutorExpectation: args.bracket <= 2 ? "Minimal tutoring" : "Bracket-appropriate tutors ok",
    speedExpectation: args.bracket <= 2 ? "Slow battlecruiser" : args.bracket <= 3 ? "Mid-speed" : "Optimized speed",
    interactionExpectation: args.bracket <= 2 ? "Light interaction" : "Solid interaction suite expected",
    gameChangerLimit: args.bracket <= 2 ? "No Game Changers" : args.bracket === 3 ? "Up to 3 Game Changers" : "Unlimited Game Changers",
  };
}

function cardFromName(args: {
  name: string;
  pkg: WorkingDeckPackageV4 | null;
  proposedBy: CouncilSpeakerV45;
  origin: CouncilCardOriginV46;
  reason: string;
  charter: DeckCharterV45 | null;
  relationship: string;
  revision: number;
  status?: CouncilCardStatusV46;
}): CouncilCardV46 {
  const roles = inferRoles(args.name, args.pkg, args.charter);
  const dep = dependenceFromRoles(roles, args.relationship);
  return {
    cardId: `card-${slugify(args.name)}`,
    oracleId: null,
    name: args.name,
    proposedBy: args.proposedBy,
    origin: args.origin,
    proposalReason: args.reason,
    functions: roles,
    roles,
    packages: args.pkg ? [args.pkg.name] : [],
    engines: args.pkg ? [args.pkg.purpose.slice(0, 60)] : [],
    commanderDependence: dep.cmd,
    worksWithoutCommander: dep.ind,
    semanticConnections: [],
    oracleVerified: false,
    legalityVerified: true,
    colorIdentityVerified: true,
    criticStatus: "PENDING",
    status: args.status ?? "PROPOSED",
    addedAtRevision: args.revision,
    lastReviewedRevision: args.revision,
    category: inferCategory(args.name),
  };
}

export function extractCandidatePoolV46(args: {
  theory: WorkingDeckTheoryV4;
  pass1: CreativeProfessorPass1V4;
  charter: DeckCharterV45 | null;
  relationship: string;
  revision: number;
}): CouncilCardV46[] {
  const seen = new Set<string>();
  const pool: CouncilCardV46[] = [];

  const add = (name: string, pkg: WorkingDeckPackageV4 | null, origin: CouncilCardOriginV46, proposedBy: CouncilSpeakerV45, reason: string) => {
    const key = name.toLowerCase();
    if (seen.has(key) || !looksLikeCardName(name)) return;
    seen.add(key);
    pool.push(cardFromName({ name, pkg, proposedBy, origin, reason, charter: args.charter, relationship: args.relationship, revision: args.revision, status: "CANDIDATE" }));
  };

  for (const pkg of args.theory.packages) {
    for (const name of pkg.candidateCards) {
      add(name, pkg, "MODEL_PRIOR", "CREATIVE", `Creative package "${pkg.name}": ${pkg.purpose.slice(0, 80)}`);
    }
  }

  for (const pkg of args.pass1.packages) {
    for (const name of pkg.likelyCardsOrEffects ?? []) {
      add(name, args.theory.packages.find((p) => p.name === pkg.concept) ?? null, "MODEL_PRIOR", "CREATIVE", `Creative pass-1: ${pkg.concept}`);
    }
  }

  return pool;
}

function scoreCardForInitialBatch(card: CouncilCardV46, charter: DeckCharterV45, relationship: string): number {
  let score = 0;
  if (card.roles.includes("primary-engine")) score += 5;
  if (card.roles.includes("legendary") && /legendary|harmony/i.test(charter.deckIdentity + charter.harmonyPlan)) score += 4;
  if (card.roles.includes("lifegain-enabler") && /lifegain|life gain/i.test(charter.deckIdentity)) score += 3;
  if (card.roles.includes("card-advantage")) score += 4;
  if (card.roles.includes("interaction")) score += 3;
  if (card.roles.includes("protection")) score += 3;
  if (card.roles.includes("ramp")) score += 2;
  if (card.roles.length >= 3) score += 3;
  if (relationship === "Harmony" && card.worksWithoutCommander === "HIGH") score += 2;
  if (relationship === "Independent Engine" && card.commanderDependence === "HIGH") score -= 3;
  if (card.origin === "GENERIC_STRATEGY_RAG" && card.roles.length <= 1) score -= 1;
  return score;
}

export function selectInitialStructuralBatchV46(args: {
  pool: CouncilCardV46[];
  charter: DeckCharterV45;
  relationship: string;
  target?: number;
}): { selected: CouncilCardV46[]; remainingPool: CouncilCardV46[] } {
  const target = args.target ?? INITIAL_BATCH_TARGET_V46;
  const ranked = [...args.pool].sort(
    (a, b) => scoreCardForInitialBatch(b, args.charter, args.relationship) - scoreCardForInitialBatch(a, args.charter, args.relationship),
  );

  const selected: CouncilCardV46[] = [];
  const usedRoles = new Set<string>();

  for (const card of ranked) {
    if (selected.length >= target) break;
    const roleKey = card.roles[0] ?? "plan";
    if (selected.length >= 6 && usedRoles.has(roleKey) && card.roles.length < 2) continue;
    selected.push({
      ...card,
      status: card.roles.length >= 3 ? "CORE" : "SELECTED",
      oracleVerified: card.origin !== "MODEL_PRIOR",
      criticStatus: "CHARTER_OK",
    });
    for (const r of card.roles) usedRoles.add(r);
  }

  const selectedIds = new Set(selected.map((c) => c.cardId));
  return { selected, remainingPool: args.pool.filter((c) => !selectedIds.has(c.cardId)) };
}

export function computeDeckSnapshotV46(state: ProfessorCouncilStateV46): DeckSnapshotV46 {
  const selected = state.selectedCards;
  const nonlands = selected.filter((c) => c.category !== "land");
  const roleCoverage: Record<string, number> = {};
  const packageCoverage: Record<string, number> = {};
  const engineCoverage: Record<string, number> = {};

  for (const card of selected) {
    for (const role of card.roles) roleCoverage[role] = (roleCoverage[role] ?? 0) + 1;
    for (const pkg of card.packages) packageCoverage[pkg] = (packageCoverage[pkg] ?? 0) + 1;
    for (const eng of card.engines) if (eng) engineCoverage[eng] = (engineCoverage[eng] ?? 0) + 1;
  }

  const dep = { high: 0, medium: 0, low: 0 };
  for (const card of nonlands) dep[card.commanderDependence === "HIGH" ? "high" : card.commanderDependence === "MEDIUM" ? "medium" : "low"]++;

  const lifegainEnablerCount = roleCoverage["lifegain-enabler"] ?? 0;
  const lifegainPayoffCount = roleCoverage["lifegain-payoff"] ?? 0;
  const cardAdvantageCoverage = roleCoverage["card-advantage"] ?? 0;
  const interactionCoverage = roleCoverage["interaction"] ?? 0;
  const protectionCoverage = roleCoverage["protection"] ?? 0;
  const rampCoverage = roleCoverage["ramp"] ?? 0;
  const legendaryPayoffCount = roleCoverage["legendary"] ?? 0;

  const produced: string[] = [];
  if (lifegainEnablerCount > 0) produced.push("life gain events");
  if (legendaryPayoffCount > 0) produced.push("legendary permanents");
  if (rampCoverage > 0) produced.push("mana acceleration");
  if (roleCoverage["lifegain-enabler"] && roleCoverage["creature"]) produced.push("creature ETB triggers");

  const weaknesses: string[] = [];
  const charter = state.deckCharter;
  const relationship = charter?.commanderRelationship ?? "Harmony";

  if (lifegainEnablerCount >= 4 && lifegainPayoffCount + cardAdvantageCoverage < 2) {
    weaknesses.push("Many lifegain enablers but few payoffs converting life into cards or durable advantage");
  }
  if (cardAdvantageCoverage < 2 && nonlands.length >= 10) {
    weaknesses.push("Card advantage coverage is thin for deck size");
  }
  if (interactionCoverage < 1 && nonlands.length >= 10) {
    weaknesses.push("Interaction suite not yet established");
  }
  if (protectionCoverage < 1 && nonlands.length >= 10) {
    weaknesses.push("Protection/recovery not yet established");
  }
  if (relationship === "Harmony" && dep.high > dep.low + dep.medium) {
    weaknesses.push("Commander dependence is high relative to Harmony target");
  }

  const redundancyClusters: string[] = [];
  for (const [role, count] of Object.entries(roleCoverage)) {
    if (role === "lifegain-enabler" && count >= 5) redundancyClusters.push(`${count} cards primarily lifegain-enabler`);
    if (role === "plan" && count >= 4) redundancyClusters.push(`${count} narrow plan slots`);
  }

  const underused: string[] = [];
  if (lifegainEnablerCount >= 3 && lifegainPayoffCount === 0) underused.push("life gain events");
  if (legendaryPayoffCount >= 2 && cardAdvantageCoverage === 0) underused.push("legendary board state");

  const highRoleCompressionCards = selected.filter((c) => c.roles.length >= 3).map((c) => c.name);
  const lowConnectionCards = selected.filter((c) => c.roles.length <= 1 && c.status !== "CORE").map((c) => c.name);

  const researchQuestion = generateDeckAwareResearchQuestion({
    snapshot: {
      cardCount: selected.length,
      lifegainEnablerCount,
      lifegainPayoffCount,
      cardAdvantageCoverage,
      interactionCoverage,
      protectionCoverage,
      depHigh: dep.high,
      depTotal: nonlands.length,
      relationship,
      weaknesses,
    },
    charter,
  });

  return {
    snapshotId: `snap-r${state.assemblyRevision}-${selected.length}`,
    revision: state.assemblyRevision,
    cardCount: selected.length,
    nonlandCount: nonlands.length,
    landCount: selected.length - nonlands.length,
    targetCount: 99,
    selectedCardsSummary: selected.map((c) => ({ name: c.name, roles: c.roles, status: c.status })),
    roleCoverage,
    engineCoverage,
    packageCoverage,
    commanderDependenceDistribution: dep,
    independentEngineCoverage: dep.low + dep.medium,
    interactionCoverage,
    protectionCoverage,
    recoveryCoverage: roleCoverage["recovery"] ?? 0,
    cardAdvantageCoverage,
    rampCoverage,
    lifegainEnablerCount,
    lifegainPayoffCount,
    legendaryPayoffCount,
    semanticResourcesProduced: produced,
    semanticResourcesConsumed: [],
    underusedResources: underused,
    redundancyClusters,
    lowConnectionCards,
    highRoleCompressionCards,
    unresolvedVerification: selected.filter((c) => !c.oracleVerified && c.origin === "MODEL_PRIOR").map((c) => c.name),
    weaknesses,
    charterAlignment: charter ? [`Building toward: ${charter.deckIdentity.slice(0, 100)}`] : [],
    bracketAlignment: state.bracketBuildPolicy ? [state.bracketBuildPolicy.comboExpectation] : [],
    userIntentAlignment: charter ? [charter.commanderRelationship, charter.playStyle] : [],
    researchQuestion,
  };
}

function generateDeckAwareResearchQuestion(args: {
  snapshot: {
    cardCount: number;
    lifegainEnablerCount: number;
    lifegainPayoffCount: number;
    cardAdvantageCoverage: number;
    interactionCoverage: number;
    protectionCoverage: number;
    depHigh: number;
    depTotal: number;
    relationship: string;
    weaknesses: string[];
  };
  charter: DeckCharterV45 | null;
}): string {
  const s = args.snapshot;
  if (s.lifegainEnablerCount >= 3 && s.cardAdvantageCoverage < 2) {
    return "The current deck creates life gain frequently but only has thin card-advantage conversion — search for lifegain payoffs that also draw cards or create durable resources.";
  }
  if (s.relationship === "Harmony" && s.depTotal > 0 && s.depHigh / s.depTotal > 0.5) {
    return "Commander dependence is climbing above our Harmony target — find independent engines that reuse the same lifegain or legendary board states.";
  }
  if (s.interactionCoverage < 1 && s.cardCount >= 10) {
    return "We have engine pieces but insufficient interaction for the selected bracket — search for removal that also advances our packages.";
  }
  if (s.protectionCoverage < 1 && s.cardCount >= 10) {
    return "Protection is below charter target — prefer candidates that provide resilience while filling another role.";
  }
  if (s.weaknesses[0]) return `Primary gap: ${s.weaknesses[0]} — search the deck's shared game states for multifunction replacements.`;
  if (args.charter) {
    return `Next search: candidates that advance ${args.charter.primaryStrategy.slice(0, 80)} for ${args.charter.deckIdentity.slice(0, 60)}.`;
  }
  return "Search for multifunction candidates that strengthen the current snapshot.";
}

function scoreCandidateForBatch(card: CouncilCardV46, snapshot: DeckSnapshotV46, charter: DeckCharterV45): number {
  let score = card.roles.length;
  if (snapshot.cardAdvantageCoverage < 3 && card.roles.includes("card-advantage")) score += 5;
  if (snapshot.lifegainEnablerCount >= 3 && snapshot.lifegainPayoffCount < 2 && card.roles.includes("lifegain-payoff")) score += 4;
  if (snapshot.lifegainEnablerCount >= 3 && card.roles.includes("card-advantage")) score += 3;
  if (snapshot.interactionCoverage < 2 && card.roles.includes("interaction")) score += 4;
  if (snapshot.protectionCoverage < 2 && card.roles.includes("protection")) score += 3;
  if (snapshot.rampCoverage < 3 && card.roles.includes("ramp")) score += 2;
  if (charter.commanderRelationship === "Harmony" && card.worksWithoutCommander === "HIGH") score += 2;
  if (snapshot.weaknesses.some((w) => w.includes("card advantage")) && card.roles.includes("card-advantage")) score += 3;
  if (snapshot.weaknesses.some((w) => w.includes("lifegain")) && (card.roles.includes("lifegain-payoff") || card.roles.includes("card-advantage"))) score += 3;
  return score;
}

export function appendResearchBatchV46(state: ProfessorCouncilStateV46, batchSize = 4): ProfessorCouncilStateV46 {
  if (state.selectedCards.length >= ASSEMBLY_STOP_TARGET_V46) return state;
  if (state.candidatePool.length === 0) return state;

  const snapshot = computeDeckSnapshotV46(state);
  const charter = state.deckCharter;
  if (!charter) return state;

  const selectedIds = new Set(state.selectedCards.map((c) => c.cardId));
  const ranked = [...state.candidatePool]
    .filter((c) => !selectedIds.has(c.cardId))
    .sort((a, b) => scoreCandidateForBatch(b, snapshot, charter) - scoreCandidateForBatch(a, snapshot, charter));

  const toAdd = ranked.slice(0, Math.min(batchSize, ASSEMBLY_STOP_TARGET_V46 - state.selectedCards.length));
  if (toAdd.length === 0) return state;

  const revision = state.assemblyRevision + 1;
  const cardDecisions = [...state.cardDecisions];
  const selectedCards = [...state.selectedCards];
  const candidatePool = state.candidatePool.filter((c) => !toAdd.some((a) => a.cardId === c.cardId));

  for (const card of toAdd) {
    selectedCards.push({
      ...card,
      status: card.roles.length >= 3 ? "CORE" : "SELECTED",
      oracleVerified: card.origin !== "MODEL_PRIOR",
      criticStatus: "CHARTER_OK",
      addedAtRevision: revision,
      lastReviewedRevision: revision,
      proposalReason: `Research batch: addresses ${snapshot.weaknesses[0] ?? snapshot.researchQuestion}`,
    });
    cardDecisions.push({
      decisionId: `dec-batch-${revision}-${slugify(card.name)}`,
      cardId: card.cardId,
      cardName: card.name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: snapshot.researchQuestion,
      revision,
    });
  }

  return {
    ...state,
    selectedCards,
    candidatePool,
    cardDecisions,
    assemblyRevision: revision,
    snapshots: [...state.snapshots, computeDeckSnapshotV46({ ...state, selectedCards, candidatePool, assemblyRevision: revision })],
  };
}

function replacementCandidatesFromPool(args: {
  pool: CouncilCardV46[];
  snapshot: DeckSnapshotV46;
  charter: DeckCharterV45;
  excludeNames: Set<string>;
}): CouncilCardV46[] {
  return args.pool
    .filter((c) => !args.excludeNames.has(c.name.toLowerCase()))
    .filter((c) => {
      if (args.snapshot.weaknesses.some((w) => w.includes("card advantage") || w.includes("payoffs converting life")) && c.roles.includes("card-advantage")) return true;
      if (args.snapshot.weaknesses.some((w) => w.includes("lifegain")) && c.roles.includes("card-advantage")) return true;
      if (args.snapshot.weaknesses.some((w) => w.includes("Interaction")) && c.roles.includes("interaction")) return true;
      if (args.snapshot.weaknesses.some((w) => w.includes("Protection")) && c.roles.includes("protection")) return true;
      return c.roles.length >= 2;
    })
    .sort((a, b) => b.roles.length - a.roles.length);
}

function findCutCandidate(selected: CouncilCardV46[], snapshot: DeckSnapshotV46): CouncilCardV46 | null {
  if (snapshot.lifegainEnablerCount >= 4 && snapshot.lifegainPayoffCount + snapshot.cardAdvantageCoverage < 3) {
    const enablers = selected.filter(
      (c) => c.roles.includes("lifegain-enabler") && !c.roles.includes("card-advantage") && c.status !== "CORE",
    );
    if (enablers.length > 0) {
      return enablers.sort((a, b) => a.roles.length - b.roles.length)[0] ?? null;
    }
  }
  const narrowLifegain = selected.filter(
    (c) => c.roles.includes("lifegain-enabler") && !c.roles.includes("card-advantage") && !c.roles.includes("interaction"),
  );
  if (narrowLifegain.length > 0 && snapshot.lifegainEnablerCount >= 4) {
    return narrowLifegain.sort((a, b) => a.roles.length - b.roles.length)[0] ?? null;
  }
  return selected.find((c) => snapshot.lowConnectionCards.includes(c.name) && c.status !== "CORE") ?? null;
}

export function runCheckpointCouncilV46(state: ProfessorCouncilStateV46, threshold: number): ProfessorCouncilStateV46 {
  if (state.checkpointsCompleted.includes(threshold)) return state;
  if (state.selectedCards.length < threshold) return state;

  const snapshot = computeDeckSnapshotV46(state);
  const conversation = [...state.conversation];
  const decisions = [...state.councilDecisions];
  const cardDecisions = [...state.cardDecisions];
  let turnCounter = conversation.length;
  let revision = state.assemblyRevision + 1;

  const push = (turn: Omit<CouncilTurnV45, "turnId">) => {
    conversation.push({ ...turn, turnId: `t-${turnCounter++}` });
  };

  const charter = state.deckCharter!;
  const commanderShort = charter.commander.split(",")[0]?.trim() ?? charter.commander;

  push({
    phase: "CHECKPOINT",
    speaker: "RESEARCH",
    intent: "COMPARE",
    respondsToTurnIds: [],
    message: `We're ${snapshot.nonlandCount} structural cards in. ${snapshot.weaknesses[0] ?? snapshot.researchQuestion} I'm searching based on what we've actually committed — not generic ${commanderShort} staples.`,
    developerDetail: JSON.stringify({ threshold, roleCoverage: snapshot.roleCoverage, researchQuestion: snapshot.researchQuestion }),
  });
  const tResearch = conversation[conversation.length - 1]!.turnId;

  if (charter.commanderRelationship === "Harmony") {
    push({
      phase: "CHECKPOINT",
      speaker: "CRITIC",
      intent: "CHALLENGE",
      respondsToTurnIds: [tResearch],
      message: `Good. For ${charter.commanderRelationship}, I want candidates that still function without ${commanderShort}. ${snapshot.weaknesses[0] ? `Priority: ${snapshot.weaknesses[0]}` : "Verify bracket fit and role compression."}`,
    });
  } else {
    push({
      phase: "CHECKPOINT",
      speaker: "CRITIC",
      intent: "CHALLENGE",
      respondsToTurnIds: [tResearch],
      message: `Verify bracket fit too — ${state.bracketBuildPolicy?.comboExpectation ?? "stay within selected bracket"}.`,
    });
  }
  const tCritic = conversation[conversation.length - 1]!.turnId;

  push({
    phase: "CHECKPOINT",
    speaker: "CREATIVE",
    intent: "DECIDE",
    respondsToTurnIds: [tResearch, tCritic],
    message: resolveCreativeCheckpointMessageV4161({
      weaknesses: snapshot.weaknesses,
      validation: validateHoldCourseV4161({
        portfolio: (state as import("./professor-council-assembly-v4-7-v1").ProfessorCouncilStateV47)
          .bracketPowerPortfolioV416 ?? null,
        gap: snapshot.bracketGapAnalysis as import("./professor-bracket-gap-analysis-v4-10-v1").BracketGapAnalysisV410 | null,
        legality: (state as import("./professor-council-assembly-v4-7-v1").ProfessorCouncilStateV47)
          .canonicalLegalityV4161 ?? null,
        utilization: (state as import("./professor-council-assembly-v4-7-v1").ProfessorCouncilStateV47)
          .bracketPowerUtilizationV4161 ?? null,
        winReadiness: (state as import("./professor-council-assembly-v4-7-v1").ProfessorCouncilStateV47)
          .b4WinReadinessV4161 ?? null,
        highDeficitCheckpointStreak: (state as import("./professor-council-assembly-v4-7-v1").ProfessorCouncilStateV47)
          .highDeficitCheckpointStreakV416,
        primaryStrategy: charter.primaryStrategy,
      }),
      deckIdentity: charter.deckIdentity,
    }),
  });
  const tCreative = conversation[conversation.length - 1]!.turnId;

  if (threshold === 55) {
    push({
      phase: "CHECKPOINT",
      speaker: "CREATIVE",
      intent: "COMPARE",
      respondsToTurnIds: [tCreative],
      message: `Midpoint review: knowing what this deck has actually become — strongest engine is ${Object.entries(snapshot.engineCoverage).sort((a, b) => b[1] - a[1])[0]?.[0] ?? charter.primaryStrategy}, and we're ${snapshot.commanderDependenceDistribution.high} cards heavily commander-dependent. Would we still build it the same way, or patch Working Deck Theory?`,
    });
  }

  let selectedCards = [...state.selectedCards];
  let candidatePool = [...state.candidatePool];
  let rejectedCards = [...state.rejectedCards];
  const replacementHistory = [...state.replacementHistory];
  const selectedNames = new Set(selectedCards.map((c) => c.name.toLowerCase()));

  const cut = findCutCandidate(selectedCards, snapshot);
  const replacements = replacementCandidatesFromPool({
    pool: candidatePool,
    snapshot,
    charter,
    excludeNames: selectedNames,
  });
  const addition = replacements[0] ?? null;

  if (cut && addition) {
    push({
      phase: "CHECKPOINT",
      speaker: "RESEARCH",
      intent: "PROPOSE",
      respondsToTurnIds: [tCreative],
      message: `I'd replace ${cut.name} with ${addition.name} — ${addition.roles.join(", ")} addresses ${snapshot.weaknesses[0] ?? "our current gap"} while fitting the charter.`,
    });
    const tReplace = conversation[conversation.length - 1]!.turnId;

    push({
      phase: "CHECKPOINT",
      speaker: "CRITIC",
      intent: "VERIFY",
      respondsToTurnIds: [tReplace],
      message: `${addition.name} covers ${addition.roles.length} charter-relevant roles${addition.worksWithoutCommander === "HIGH" ? " and works without the commander" : ""}. I support the swap.`,
    });

    const mutation = commitReplaceMutationV4161({
      selectedCards,
      cut,
      add: {
        ...addition,
        status: addition.roles.length >= 3 ? "CORE" : "SELECTED",
        oracleVerified: true,
        criticStatus: "CHARTER_OK",
        addedAtRevision: revision,
        lastReviewedRevision: revision,
        proposalReason: `Checkpoint ${threshold}: replaces ${cut.name} — ${snapshot.researchQuestion}`,
      },
      revision,
    });

    if (mutation.pass) {
      selectedCards = mutation.selectedCards as typeof selectedCards;
      rejectedCards.push({
        ...cut,
        status: "REJECTED",
        rejectionReason: snapshot.weaknesses[0] ?? "Role compression opportunity",
        lastReviewedRevision: revision,
      });
      candidatePool = candidatePool.filter((c) => c.cardId !== addition.cardId);
      selectedNames.delete(cut.name.toLowerCase());
      selectedNames.add(addition.name.toLowerCase());

      cardDecisions.push(
        {
          decisionId: `dec-cut-${revision}`,
          cardId: cut.cardId,
          cardName: cut.name,
          action: "CUT",
          proposedBy: "CRITIC",
          supportingCouncilTurnIds: [tReplace],
          reason: cut.rejectionReason ?? snapshot.weaknesses[0] ?? "Narrow slot",
          revision,
        },
        {
          decisionId: `dec-add-${revision}`,
          cardId: addition.cardId,
          cardName: addition.name,
          action: "REPLACE",
          proposedBy: "RESEARCH",
          supportingCouncilTurnIds: [tReplace],
          reason: addition.proposalReason ?? `Checkpoint ${threshold} replacement`,
          replacedCardId: cut.cardId,
          replacedCardName: cut.name,
          revision,
        },
      );
      replacementHistory.push({
        revision,
        cut: cut.name,
        added: addition.name,
        reason: snapshot.weaknesses[0] ?? snapshot.researchQuestion,
      });
    }
  } else if (addition) {
    selectedCards.push({
      ...addition,
      status: "SELECTED",
      oracleVerified: true,
      criticStatus: "CHARTER_OK",
      addedAtRevision: revision,
      lastReviewedRevision: revision,
    });
    candidatePool = candidatePool.filter((c) => c.cardId !== addition.cardId);
    cardDecisions.push({
      decisionId: `dec-add-${revision}`,
      cardId: addition.cardId,
      cardName: addition.name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [tCreative],
      reason: snapshot.researchQuestion,
      revision,
    });
    push({
      phase: "CHECKPOINT",
      speaker: "RESEARCH",
      intent: "CHANGE",
      respondsToTurnIds: [tCreative],
      message: `Adding ${addition.name} to address: ${snapshot.weaknesses[0] ?? "current deck gap"}.`,
    });
  }

  const decisionText =
    cut && addition
      ? `Replace ${cut.name} → ${addition.name} based on assembled-deck analysis.`
      : addition
        ? `Add ${addition.name} based on checkpoint research.`
        : `Hold course — continue observing assembled deck at ${snapshot.nonlandCount} cards.`;

  decisions.push({
    decisionId: `dec-checkpoint-${threshold}`,
    phase: "CHECKPOINT",
    decision: decisionText,
    reasoning: snapshot.researchQuestion,
    supportingTurnIds: [tResearch, tCritic, tCreative],
    designRulesAdded: snapshot.weaknesses.length ? [`Address: ${snapshot.weaknesses[0]}`] : undefined,
    reconsiderable: true,
  });

  push({
    phase: "CHECKPOINT",
    speaker: "SYSTEM",
    intent: "DECIDE",
    respondsToTurnIds: [tCreative],
    message: `Council decision: ${decisionText}`,
  });

  const postSnapshot = computeDeckSnapshotV46({
    ...state,
    selectedCards,
    candidatePool,
    rejectedCards,
    assemblyRevision: revision,
  });

  return {
    ...state,
    phase: threshold >= CUT_REVIEW_THRESHOLD_V46 ? "CUT_REVIEW" : "ASSEMBLY",
    conversation,
    councilDecisions: decisions,
    cardDecisions,
    selectedCards,
    candidatePool,
    rejectedCards,
    replacementHistory,
    assemblyRevision: revision,
    checkpointsCompleted: [...state.checkpointsCompleted, threshold],
    snapshots: [...state.snapshots, snapshot, postSnapshot],
  };
}

export function runCutReviewV46(state: ProfessorCouncilStateV46): ProfessorCouncilStateV46 {
  if (state.checkpointsCompleted.includes(CUT_REVIEW_THRESHOLD_V46)) return state;
  if (state.selectedCards.length < CUT_REVIEW_THRESHOLD_V46) return state;

  const snapshot = computeDeckSnapshotV46(state);
  const conversation = [...state.conversation];
  const decisions = [...state.councilDecisions];
  const cardDecisions = [...state.cardDecisions];
  let turnCounter = conversation.length;
  let revision = state.assemblyRevision + 1;

  const push = (turn: Omit<CouncilTurnV45, "turnId">) => {
    conversation.push({ ...turn, turnId: `t-${turnCounter++}` });
  };

  const charter = state.deckCharter!;
  const cutReviewFocus =
    charter.avoidPatterns[0] ?? charter.primaryStrategy ?? charter.commanderRelationship ?? "the charter";

  push({
    phase: "CUT_REVIEW",
    speaker: "CRITIC",
    intent: "CHALLENGE",
    respondsToTurnIds: [],
    message: `Cut review at ${snapshot.nonlandCount} structural cards. Which selected cards no longer deserve their slots? I'm prioritizing low-connection slots and cards that don't match ${cutReviewFocus}.`,
  });
  const tCritic = conversation[conversation.length - 1]!.turnId;

  let selectedCards = [...state.selectedCards];
  let candidatePool = [...state.candidatePool];
  let rejectedCards = [...state.rejectedCards];
  const replacementHistory = [...state.replacementHistory];
  const selectedNames = new Set(selectedCards.map((c) => c.name.toLowerCase()));

  const cut = findCutCandidate(selectedCards, snapshot);
  const replacements = replacementCandidatesFromPool({
    pool: candidatePool,
    snapshot,
    charter,
    excludeNames: selectedNames,
  });
  const addition = replacements[0] ?? null;

  if (cut && addition) {
    push({
      phase: "CUT_REVIEW",
      speaker: "RESEARCH",
      intent: "PROPOSE",
      respondsToTurnIds: [tCritic],
      message: `Replace ${cut.name} with ${addition.name} — better role compression for the deck we actually built.`,
    });

    selectedCards = selectedCards.filter((c) => c.cardId !== cut.cardId);
    rejectedCards.push({ ...cut, status: "CUT_CANDIDATE", rejectionReason: "Cut review — narrow or replaceable slot", lastReviewedRevision: revision });
    candidatePool = candidatePool.filter((c) => c.cardId !== addition.cardId);
    selectedCards.push({
      ...addition,
      status: "SELECTED",
      oracleVerified: true,
      criticStatus: "CHARTER_OK",
      addedAtRevision: revision,
      lastReviewedRevision: revision,
    });

    cardDecisions.push(
      {
        decisionId: `dec-cut-review-${revision}`,
        cardId: cut.cardId,
        cardName: cut.name,
        action: "CUT",
        proposedBy: "CRITIC",
        supportingCouncilTurnIds: [tCritic],
        reason: "Cut review — slot no longer earns its place",
        revision,
      },
      {
        decisionId: `dec-cut-add-${revision}`,
        cardId: addition.cardId,
        cardName: addition.name,
        action: "REPLACE",
        proposedBy: "RESEARCH",
        supportingCouncilTurnIds: [tCritic],
        reason: `Cut review replacement for ${cut.name}`,
        replacedCardId: cut.cardId,
        replacedCardName: cut.name,
        revision,
      },
    );
    replacementHistory.push({ revision, cut: cut.name, added: addition.name, reason: "Cut review" });
  }

  decisions.push({
    decisionId: `dec-cut-review-${CUT_REVIEW_THRESHOLD_V46}`,
    phase: "CUT_REVIEW",
    decision: cut && addition ? `Cut review: ${cut.name} → ${addition.name}` : "Cut review complete — deck held at assembly target",
    reasoning: snapshot.researchQuestion,
    supportingTurnIds: [tCritic],
    reconsiderable: true,
  });

  return {
    ...state,
    phase: "CUT_REVIEW",
    conversation,
    councilDecisions: decisions,
    cardDecisions,
    selectedCards,
    candidatePool,
    rejectedCards,
    replacementHistory,
    assemblyRevision: revision,
    checkpointsCompleted: [...state.checkpointsCompleted, CUT_REVIEW_THRESHOLD_V46],
    snapshots: [...state.snapshots, snapshot, computeDeckSnapshotV46({ ...state, selectedCards, candidatePool, rejectedCards, assemblyRevision: revision })],
  };
}

export function advanceCouncilAssemblyV46(state: ProfessorCouncilStateV46, batchSize = 4): ProfessorCouncilStateV46 {
  let next = appendResearchBatchV46(state, batchSize);
  next = maybeRunCheckpointV46(next);
  if (next.selectedCards.length >= CUT_REVIEW_THRESHOLD_V46) {
    next = runCutReviewV46(next);
  }
  return next;
}

export function upgradeCouncilStateToV46(state: ProfessorCouncilStateV45): ProfessorCouncilStateV46 {
  const migrate = (c: { name: string; cardId?: string; [key: string]: unknown }): CouncilCardV46 => ({
    cardId: (c.cardId as string) ?? `card-${slugify(c.name)}`,
    oracleId: null,
    name: c.name,
    proposedBy: (c.proposedBy as CouncilSpeakerV45) ?? "RESEARCH",
    origin: (c.origin as CouncilCardOriginV46) ?? "MODEL_PRIOR",
    proposalReason: (c.proposalReason as string) ?? "",
    functions: (c.functions as string[]) ?? ["plan"],
    roles: (c.roles as string[]) ?? (c.functions as string[]) ?? ["plan"],
    packages: (c.packages as string[]) ?? [],
    engines: (c.engines as string[]) ?? [],
    commanderDependence: (c.commanderDependence as CouncilCardV46["commanderDependence"]) ?? "MEDIUM",
    worksWithoutCommander: (c.worksWithoutCommander as CouncilCardV46["worksWithoutCommander"]) ?? "MEDIUM",
    semanticConnections: [],
    oracleVerified: Boolean(c.oracleVerified),
    legalityVerified: Boolean(c.legalityVerified ?? true),
    colorIdentityVerified: true,
    criticStatus: (c.criticStatus as string) ?? "PENDING",
    status: (c.status as CouncilCardStatusV46) ?? "CANDIDATE",
    rejectionReason: c.rejectionReason as string | undefined,
    addedAtRevision: 0,
    lastReviewedRevision: 0,
    category: inferCategory(c.name),
  });

  return {
    ...state,
    version: PROFESSOR_COUNCIL_ASSEMBLY_V4_6_V1_VERSION,
    bracketBuildPolicy: null,
    selectedCards: (state.selectedCards as unknown as { name: string }[]).map(migrate),
    candidatePool: (state.candidatePool as unknown as { name: string }[]).map(migrate),
    rejectedCards: (state.rejectedCards as unknown as { name: string }[]).map(migrate),
    cardDecisions: [],
    replacementHistory: [],
    checkpointsCompleted: [],
    assemblyRevision: 0,
    snapshots: [],
  };
}

export function runInitialAssemblyV46(args: {
  state: ProfessorCouncilStateV45;
  context: CouncilBrewContextV45;
  loopResult: ProfessorV41ConversationLoopResultV1;
  theory: WorkingDeckTheoryV4;
}): ProfessorCouncilStateV46 {
  let state = upgradeCouncilStateToV46(args.state);
  const charter = state.deckCharter!;
  const relationship = charter.commanderRelationship;
  const pass1 = args.loopResult.creativePass1;

  state.bracketBuildPolicy = buildBracketBuildPolicyV46({
    bracket: args.context.bracket,
    playStyle: charter.playStyle,
    commanderRelationship: relationship,
  });

  const pool = extractCandidatePoolV46({
    theory: args.theory,
    pass1,
    charter,
    relationship,
    revision: 0,
  });

  const { selected, remainingPool } = selectInitialStructuralBatchV46({ pool, charter, relationship });
  state = {
    ...state,
    selectedCards: selected,
    candidatePool: remainingPool,
    assemblyRevision: 1,
    phase: "ASSEMBLY",
  };

  const conversation = [...state.conversation];
  let turnCounter = conversation.length;
  const push = (turn: Omit<CouncilTurnV45, "turnId">) => {
    conversation.push({ ...turn, turnId: `t-${turnCounter++}` });
  };

  push({
    phase: "ASSEMBLY",
    speaker: "CREATIVE",
    intent: "PROPOSE",
    respondsToTurnIds: [],
    message: `First structural batch: ${selected.slice(0, 5).map((c) => c.name).join(", ")}${selected.length > 5 ? ` and ${selected.length - 5} more` : ""}. These establish ${charter.primaryStrategy.toLowerCase()} without filling every role yet.`,
  });
  push({
    phase: "ASSEMBLY",
    speaker: "RESEARCH",
    intent: "VERIFY",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: `Selected ${selected.length} cards from ${pool.length} candidates — leaving room for deck-aware discovery at checkpoints.`,
    developerDetail: selected.map((c) => `${c.name}:${c.roles.join("+")}`).join("; "),
  });

  state.conversation = conversation;
  state.snapshots = [computeDeckSnapshotV46(state)];

  const firstThreshold = CHECKPOINT_THRESHOLDS_V46[0]!;
  if (selected.length >= firstThreshold) {
    state = runCheckpointCouncilV46(state, firstThreshold);
  }

  return state;
}

export function maybeRunCheckpointV46(state: ProfessorCouncilStateV46): ProfessorCouncilStateV46 {
  let next = state;
  for (const threshold of CHECKPOINT_THRESHOLDS_V46) {
    if (next.selectedCards.length >= threshold && !next.checkpointsCompleted.includes(threshold)) {
      next = runCheckpointCouncilV46(next, threshold);
    }
  }
  return next;
}

export function deckListFromCouncilStateV46(args: {
  state: ProfessorCouncilStateV46;
  commanderName: string;
  colorIdentity: string[];
}): ProfessorDeckListEntryV43[] {
  const list: ProfessorDeckListEntryV43[] = [{ name: args.commanderName, category: "commander" }];
  for (const card of args.state.selectedCards) {
    list.push({ name: card.name, category: card.category === "plan" ? "creature" : card.category });
  }
  return list;
}

export function councilStateToTranscriptMutations(state: ProfessorCouncilStateV46): string[] {
  return state.cardDecisions.map((d) => {
    if (d.action === "REPLACE") return `↻ ${d.replacedCardName} → ${d.cardName}`;
    if (d.action === "CUT") return `− ${d.cardName}`;
    if (d.action === "ADD") return `+ ${d.cardName}`;
    return `${d.action} ${d.cardName}`;
  });
}

export { councilSpeakerLabel };

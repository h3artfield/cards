/**
 * Sol-directed deck Critic — post-construction refinement via candidate-pool swaps.
 */
import { PROFESSOR_PREDICTIVE_LAYER_PROMPT_CLAUSE } from "./professor-predictive-layer-boundary-v1";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { SolDirectedAgentFeedV111 } from "./professor-sol-directed-build-activity-v1-1-1";
import {
  formatAgentPromptOutForFeed,
  formatAgentSystemOutForFeed,
  formatCriticResponseInForFeed,
} from "./professor-sol-directed-build-activity-v1-1-1";
import { solDirectedModelCallOptions } from "./professor-sol-directed-model-config-v1-1-1";
import { createModelTelemetryCollector } from "./professor-model-telemetry-v4-15-1-v1";
import { normalizeCardNameForMatch } from "./professor-card-name-match-client-v4-15-1-v1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { SolDirectedModelCallRecordV1 } from "./professor-sol-directed-types-v1";
import type {
  ArchitectRawPlanV11,
  CanonicalCardFactsV11,
  LandPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
  SolDirectedSelectedNonlandV11,
} from "./professor-sol-directed-types-v1-1";
import type { SemanticRoleAuditFlagV111 } from "./professor-semantic-role-audit-v1-1-1";
import {
  userSemanticPreferencesForPromptV111,
  type UserSemanticPreferencesV111,
} from "./professor-user-semantic-preferences-v1-1-1";

export const PROFESSOR_SOL_DIRECTED_CRITIC_V1_1_1_VERSION = "professor-sol-directed-critic-v1-1-1";

const MAX_PRIMARY_CRITIC_SWAPS = 12;
const MAX_REPAIR_CRITIC_SWAPS = 16;

export type SolDirectedCriticSwapV111 = {
  cut: string;
  add: string;
  reason: string;
};

export type SolDirectedCriticVerdictV111 = {
  summary: string;
  proposedSwaps: SolDirectedCriticSwapV111[];
  appliedSwaps: SolDirectedCriticSwapV111[];
  rejectedSwaps: Array<{ swap: SolDirectedCriticSwapV111; reason: string }>;
};

const CRITIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    swaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cut: { type: "string" },
          add: { type: "string" },
          reason: { type: "string" },
        },
        required: ["cut", "add", "reason"],
      },
    },
  },
  required: ["summary", "swaps"],
} as const;

const CRITIC_SYSTEM_V111 = `You are GPT-5.6 Luna Deck Critic for Commander — the final optimization pass BEFORE a Head Professor grades this deck for a paying customer.

You receive a legally valid 99-card deck from Constructor plus the Architect's strategic contract. Your job is to MAXIMIZE the list within Bracket and guardrails so the customer gets an awesome, ready-to-play deck — not a rough draft that still needs a long fix-it list.

Think like a senior Commander brewer doing a pre-ship audit. The next step is grading; your swaps are the last chance to make the deck great.

MANDATORY AUDIT — fix via swaps when gaps exist:
1. Requirement-slot honesty: Each card's primaryArchitectRequirement must match what the card ACTUALLY does (Oracle-level function). Cut misallocated engines/payoffs labeled as protection, ramp, donation, interaction, etc. Add in-pool cards that genuinely fill that slot.
2. Package density: Architect cardRequirements must be met with REAL fulfillers, not cards that only tangentially relate or were mis-tagged by Constructor.
3. Commander + thesis fit: Cut cards that don't advance the commander, strategicThesis, or winLines even if they are generically powerful.
4. Bracket maximization: Use the full allowed power for this Bracket — no prohibited combos/packages — but do not leave obvious in-pool upgrades on the table.
5. Structural holes: Ramp, draw, interaction, protection, recursion, win-con density — fill clear gaps from allowedCandidates.
6. Player intent: Honor deckPreferences, playstyle, deckTheme, winPreference, commanderStyle, comboAndPowerGuardrails, and optional userSemanticPreferences (soft prefer/avoid — not hard requirements).
7. Semantic Oracle audit: Review semanticRoleAuditFlags first. Those are suspected functional misallocations (the assigned role does not match what Semantic Oracle says the card does). Confirm against Oracle text and Semantic Oracle, then swap if the card does not actually perform the assigned function. A flag is not automatic proof and must not auto-replace a card.

SWAP DISCIPLINE:
- Every ADD must be an exact card name from allowedCandidates
- Every CUT must be a nonland currently in the deck
- Do not swap lands in this pass
- Use up to 12 swaps when the audit finds multiple fixes — customer-ready beats conservative tuning
- Preserve the Architect's core win architecture and winLines; optimize execution, do not pivot strategy
- Prioritize misallocation fixes and package gaps over minor lateral upgrades

Success criterion: After your swaps, a Head Professor should grade CONSTRUCTION_SUCCESS or OPTIONAL_REFINEMENT with no required package corrections — only optional tweaks at most.

${PROFESSOR_PREDICTIVE_LAYER_PROMPT_CLAUSE}`;

const OPTIMIZE_EXISTING_CRITIC_SYSTEM_V111 = `You are GPT-5.6 Luna Deck Critic for Commander — optimizing a customer's ALREADY BUILT list.

This is not a Constructor draft. The customer imported a finished deck they want improved, not replaced. Keep the deck recognizable.

Your job:
1. Honor Bracket, playstyle, deckTheme, winPreference, commanderStyle, and deckPreferences.
2. Cut obvious misses: off-strategy cards, underpowered stand-ins, or holes in ramp / draw / interaction / protection.
3. Add only exact names from allowedCandidates.
4. Use at most 12 swaps. Prefer 6–10 high-confidence upgrades over a rewrite.
5. Do not pivot the archetype or invent a new win condition unless the current one is illegal for the Bracket.
6. Lands are out of scope in this pass unless a repair context explicitly requires a land fix.

Success: the customer should still recognize their deck, with a tighter, better-executing version of the same plan.

${PROFESSOR_PREDICTIVE_LAYER_PROMPT_CLAUSE}`;

const REPAIR_CRITIC_SYSTEM_V111 = `You are GPT-5.6 Luna Deck Repair Critic for Commander.

The Head Professor graded this deck and listed REQUIRED fixes. Your job is to apply those fixes as concrete cut/add swaps — not describe them in prose.

This applies for CONSTRUCTION_DEFECT and for OPTIONAL_REFINEMENT when requiredChanges call out package misallocations, missing ETB creatures, missing ramp, wrong role tags, or similar structural gaps.

Prioritize in order:
1. Every requiredChange from Head Professor (translate each into one or more cut/add swaps)
2. Replace or cut offPlanCards when a better in-pool alternative exists
3. Fix strategic gaps called out in the Professor summary (mana, interaction, win paths, package density)

Rules:
- Every ADD must be an exact card name from allowedCandidates OR allowedLandNames
- Every CUT must be a card currently in the deck (nonland list OR lands list)
- Land swaps: cut/add one land copy at a time; ADD land must be in allowedLandNames
- Propose up to 16 swaps focused on required fixes (nonland and land combined). Use the full budget when Professor listed multiple package repairs.
- Preserve the architect's core win architecture unless a requiredChange explicitly demands otherwise
- Do not leave required package gaps unfixed when an in-pool card satisfies the requirement`;

export type SolDirectedCriticRepairContextV111 = {
  requiredChanges: string[];
  offPlanCards: string[];
  professorSummary: string;
  priorGrade: string;
  classification: string;
};

function findCandidateByName(
  name: string,
  dictionary: Record<string, CanonicalCardFactsV11>,
): CanonicalCardFactsV11 | null {
  const key = normalizeCardNameForMatch(name);
  return (
    Object.values(dictionary).find((facts) => normalizeCardNameForMatch(facts.name) === key) ?? null
  );
}

function cloneDeck(deck: SolDirectedConstructedDeckV11): SolDirectedConstructedDeckV11 {
  return {
    ...deck,
    lands: deck.lands.map((land) => ({ ...land })),
    nonlands: deck.nonlands.map((card) => ({ ...card })),
    primaryWinPaths: [...deck.primaryWinPaths],
    secondaryWinPaths: [...deck.secondaryWinPaths],
    structuralNecessities: [...deck.structuralNecessities],
    replaceableFlex: [...deck.replaceableFlex],
  };
}

function applySingleLandSwap(args: {
  deck: SolDirectedConstructedDeckV11;
  swap: SolDirectedCriticSwapV111;
  landPool: LandPoolV11;
}): { ok: true; deck: SolDirectedConstructedDeckV11 } | { ok: false; reason: string } {
  const cutKey = normalizeCardNameForMatch(args.swap.cut);
  const landRow = args.deck.lands.find((land) => normalizeCardNameForMatch(land.name) === cutKey);
  if (!landRow || landRow.copies <= 0) return { ok: false, reason: `CUT_LAND_NOT_IN_DECK:${args.swap.cut}` };

  const addEntry = args.landPool.entries.find(
    (entry) => normalizeCardNameForMatch(entry.name) === normalizeCardNameForMatch(args.swap.add),
  );
  if (!addEntry) return { ok: false, reason: `ADD_NOT_IN_LAND_POOL:${args.swap.add}` };

  const addRow = args.deck.lands.find(
    (land) => normalizeCardNameForMatch(land.name) === normalizeCardNameForMatch(addEntry.name),
  );
  const currentAddCopies = addRow?.copies ?? 0;
  if (currentAddCopies >= addEntry.maxCopies) {
    return { ok: false, reason: `ADD_LAND_AT_MAX_COPIES:${args.swap.add}` };
  }

  const next = cloneDeck(args.deck);
  const cutTarget = next.lands.find((land) => normalizeCardNameForMatch(land.name) === cutKey)!;
  cutTarget.copies -= 1;
  next.lands = next.lands.filter((land) => land.copies > 0);

  const addTarget = next.lands.find(
    (land) => normalizeCardNameForMatch(land.name) === normalizeCardNameForMatch(addEntry.name),
  );
  if (addTarget) addTarget.copies += 1;
  else next.lands.push({ name: addEntry.name, copies: 1 });

  next.landCount = next.lands.reduce((sum, land) => sum + land.copies, 0);
  return { ok: true, deck: next };
}

function applySingleSwap(args: {
  deck: SolDirectedConstructedDeckV11;
  swap: SolDirectedCriticSwapV111;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  landPool?: LandPoolV11;
  allowLandSwaps?: boolean;
}): { ok: true; deck: SolDirectedConstructedDeckV11 } | { ok: false; reason: string } {
  const cutKey = normalizeCardNameForMatch(args.swap.cut);
  const cutIndex = args.deck.nonlands.findIndex(
    (card) => normalizeCardNameForMatch(card.name) === cutKey,
  );
  if (cutIndex < 0) {
    if (args.allowLandSwaps && args.landPool) {
      return applySingleLandSwap({ deck: args.deck, swap: args.swap, landPool: args.landPool });
    }
    return { ok: false, reason: `CUT_NOT_IN_DECK:${args.swap.cut}` };
  }

  const addFacts = findCandidateByName(args.swap.add, args.candidateDictionary);
  if (!addFacts) return { ok: false, reason: `ADD_NOT_IN_CANDIDATE_POOL:${args.swap.add}` };
  if (addFacts.isLand) return { ok: false, reason: `ADD_IS_LAND:${args.swap.add}` };

  const alreadyPresent = args.deck.nonlands.some(
    (card) => normalizeCardNameForMatch(card.name) === normalizeCardNameForMatch(addFacts.name),
  );
  if (alreadyPresent) return { ok: false, reason: `ADD_ALREADY_IN_DECK:${args.swap.add}` };

  const cutCard = args.deck.nonlands[cutIndex]!;
  const replacement: SolDirectedSelectedNonlandV11 = {
    oracleId: addFacts.oracleId,
    name: addFacts.name,
    typeLine: addFacts.typeLine,
    primaryArchitectRequirement: cutCard.primaryArchitectRequirement,
    primaryRole: cutCard.primaryRole || addFacts.typeLine,
    secondaryRoles: cutCard.secondaryRoles,
    packageMembership: cutCard.packageMembership,
    whyInThisDeck: args.swap.reason,
    structuralNecessity: cutCard.structuralNecessity,
  };

  const next = cloneDeck(args.deck);
  next.nonlands[cutIndex] = replacement;
  return { ok: true, deck: next };
}

export function applySolDirectedCriticSwapsV111(args: {
  deck: SolDirectedConstructedDeckV11;
  swaps: SolDirectedCriticSwapV111[];
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  landPool?: LandPoolV11;
  allowLandSwaps?: boolean;
  maxSwaps?: number;
}): {
  deck: SolDirectedConstructedDeckV11;
  appliedSwaps: SolDirectedCriticSwapV111[];
  rejectedSwaps: Array<{ swap: SolDirectedCriticSwapV111; reason: string }>;
} {
  let deck = cloneDeck(args.deck);
  const appliedSwaps: SolDirectedCriticSwapV111[] = [];
  const rejectedSwaps: Array<{ swap: SolDirectedCriticSwapV111; reason: string }> = [];

  for (const swap of args.swaps.slice(0, args.maxSwaps ?? MAX_PRIMARY_CRITIC_SWAPS)) {
    const result = applySingleSwap({
      deck,
      swap,
      candidateDictionary: args.candidateDictionary,
      landPool: args.landPool,
      allowLandSwaps: args.allowLandSwaps,
    });
    if (result.ok) {
      deck = result.deck;
      appliedSwaps.push(swap);
    } else {
      rejectedSwaps.push({ swap, reason: result.reason });
    }
  }

  return { deck, appliedSwaps, rejectedSwaps };
}

export async function runSolDirectedCriticV111(args: {
  deck: SolDirectedConstructedDeckV11;
  architectRawPlan: ArchitectRawPlanV11;
  retrievalContract: RetrievalContractV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  commander: CommanderBlueprintV417;
  bracket: number;
  playstyle: string;
  deckTheme?: string;
  winPreference?: string;
  commanderStyle: string;
  deckPreferences?: string;
  userSemanticPreferences?: UserSemanticPreferencesV111 | null;
  semanticRoleAuditFlags?: SemanticRoleAuditFlagV111[];
  repairContext?: SolDirectedCriticRepairContextV111;
  landPool?: LandPoolV11;
  maxSwaps?: number;
  optimizeExistingList?: boolean;
  onFeed?: SolDirectedAgentFeedV111;
}): Promise<{
  verdict: SolDirectedCriticVerdictV111;
  refinedDeck: SolDirectedConstructedDeckV11;
  record: SolDirectedModelCallRecordV1;
}> {
  const allowedCandidates = Object.values(args.candidateDictionary)
    .filter((facts) => !facts.isLand)
    .map((facts) => facts.name)
    .sort((a, b) => a.localeCompare(b));

  const isRepair = Boolean(args.repairContext);
  const systemPrompt = isRepair
    ? REPAIR_CRITIC_SYSTEM_V111
    : args.optimizeExistingList
      ? OPTIMIZE_EXISTING_CRITIC_SYSTEM_V111
      : CRITIC_SYSTEM_V111;
  const maxSwaps =
    args.maxSwaps ?? (isRepair ? MAX_REPAIR_CRITIC_SWAPS : MAX_PRIMARY_CRITIC_SWAPS);

  const allowedLandNames = (args.landPool?.entries ?? [])
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const userPrompt = JSON.stringify(
    {
      purpose: isRepair
        ? "SOL_DIRECTED_DECK_REPAIR_CRITIC_V1_1_1"
        : args.optimizeExistingList
          ? "SOL_DIRECTED_IMPORTED_DECK_OPTIMIZE_CRITIC_V1_1_1"
          : "SOL_DIRECTED_DECK_CRITIC_V1_1_1",
      commander: args.commander,
      bracket: args.bracket,
      playstyle: args.playstyle,
      deckTheme: args.deckTheme?.trim() || null,
      winPreference: args.winPreference?.trim() || null,
      commanderStyle: args.commanderStyle,
      deckPreferences: args.deckPreferences?.trim() || null,
      userSemanticPreferences: userSemanticPreferencesForPromptV111(args.userSemanticPreferences),
      semanticRoleAuditFlags: args.semanticRoleAuditFlags ?? [],
      architectThesis: args.architectRawPlan.strategicThesis,
      architectGamePlan: args.architectRawPlan.gamePlan ?? null,
      architectCardRequirements: args.retrievalContract.cardRequirements,
      architectWinLines: args.architectRawPlan.winLines,
      comboAndPowerGuardrails: args.retrievalContract.comboAndPowerGuardrails,
      tutorPolicy: args.retrievalContract.tutorPolicy ?? null,
      headProfessorRepair: args.repairContext ?? null,
      primaryWinPaths: args.deck.primaryWinPaths,
      secondaryWinPaths: args.deck.secondaryWinPaths,
      currentNonlands: args.deck.nonlands.map((card) => ({
        name: card.name,
        primaryArchitectRequirement: card.primaryArchitectRequirement,
        primaryRole: card.primaryRole,
        packageMembership: card.packageMembership,
        whyInThisDeck: card.whyInThisDeck,
      })),
      lands: args.deck.lands,
      allowedCandidates,
      allowedLandNames: isRepair ? allowedLandNames : [],
      maxSwaps,
      instructions: isRepair
        ? "Apply Head Professor requiredChanges as cut/add swaps (nonlands AND lands when the fix is mana-base related). CUT off-plan cards when required. ADD nonlands must match allowedCandidates; ADD lands must match allowedLandNames."
        : args.optimizeExistingList
          ? `This list is customer-imported. Preserve its identity. Propose up to ${maxSwaps} high-confidence cut/add upgrades for the requested bracket and playstyle. Do not rewrite the archetype. ADD names must match allowedCandidates exactly.`
          : `Pre-ship optimization pass. Audit every nonland against architectCardRequirements and Oracle-level function. Fix misallocated slots, package gaps, and bracket-legal upgrades. Propose up to ${maxSwaps} cut/add swaps — use the full budget when multiple fixes are needed. ADD names must match allowedCandidates exactly. Goal: customer-ready deck before Head Professor grading.`,
    },
    null,
    2,
  );

  const { collector } = createModelTelemetryCollector({ plannedCalls: 1 });
  const startedAt = Date.now();
  const modelOpts = solDirectedModelCallOptions("CRITIC");
  await args.onFeed?.status(
    isRepair
      ? "Applying Professor's required fixes…"
      : `Optimizing ${args.deck.nonlands.length} nonlands for bracket-max quality…`,
  );
  await args.onFeed?.out(formatAgentSystemOutForFeed(systemPrompt));
  await args.onFeed?.out(formatAgentPromptOutForFeed(userPrompt));
  const { parsed, model, usage, callId } = await callHeadProfessorJsonV48<{
    summary: string;
    swaps: SolDirectedCriticSwapV111[];
  }>({
    system: systemPrompt,
    userContent: userPrompt,
    jsonSchema: CRITIC_SCHEMA,
    schemaName: isRepair ? "sol_directed_repair_critic_v1_1_1" : "sol_directed_critic_v1_1_1",
    useJsonSchema: true,
    ...modelOpts,
    onProgress: args.onFeed?.progress,
    telemetry: { collector, purpose: "OTHER", planned: true },
  });

  await args.onFeed?.in(formatCriticResponseInForFeed(parsed));

  const proposedSwaps = parsed.swaps.slice(0, maxSwaps);
  const applied = applySolDirectedCriticSwapsV111({
    deck: args.deck,
    swaps: proposedSwaps,
    candidateDictionary: args.candidateDictionary,
    landPool: args.landPool,
    allowLandSwaps: isRepair,
    maxSwaps,
  });

  return {
    verdict: {
      summary: parsed.summary,
      proposedSwaps: proposedSwaps,
      appliedSwaps: applied.appliedSwaps,
      rejectedSwaps: applied.rejectedSwaps,
    },
    refinedDeck: applied.deck,
    record: {
      purpose: isRepair ? "REPAIR" : "CRITIC",
      systemPrompt,
      userPrompt,
      rawResponse: parsed,
      model,
      callId,
      latencyMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? null,
      outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
  };
}

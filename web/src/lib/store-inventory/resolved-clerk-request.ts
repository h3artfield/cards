import { randomUUID } from "crypto";
import type { CardCatalogHit } from "./clerk-types";
import { cardCatalogLookupByOracleId } from "./clerk-tools/card-catalog";
import {
  isConcreteCommanderName,
  parseCommanderFromMessage,
} from "./clerk-tools/commander-context";
import {
  deckBuildQuestionForPlanning,
  parseCommanderMaxPriceFromConversation,
  wantsPowerfulCommander,
} from "./clerk-tools/deck-build-context";
import { planCommanderForDeckBuild } from "./clerk-tools/deck-build-planner";
import {
  offStockCommanderStrategyNote,
  primaryRequestedCardName,
} from "./clerk-tools/deck-build-intent-guards";
import { translateDeckBuildIntent } from "./clerk-tools/deck-build-intent-translator";
import { resolveNamedCommanderInStock } from "./clerk-tools/commander-theme-match";
import { normalizeCardNameForMatch } from "./clerk-tools/magic-commander-inventory";
import {
  extractCommanderResolutionPhrase,
  formatAmbiguousCommanderClarification,
  resolveCommanderEntity,
  type CommanderEntityCandidate,
  type CommanderEntityResolution,
} from "./entity-candidate-resolution";
import {
  inferDeckBuildMode,
  previewTheorycraftNote,
  type CommanderStatus,
  type DeckBuildMode,
} from "./commander-status";
import { assessMultiCommanderSupport } from "./multi-commander";
import { isDeckThemePhrase } from "./clerk-tools/deck-theme-phrases";

export type CommanderSelectionPolicy =
  | "exact_commander_required"
  | "user_must_choose"
  | "automatic_selection_allowed"
  | "recommend_a_commander";

export type ResolvedClerkTask =
  | "inventory_lookup"
  | "card_fact"
  | "rules_question"
  | "recommend_cards"
  | "recommend_commander"
  | "build_deck"
  | "explain_strategy";

export type ResolutionStatus =
  | "resolved"
  | "partially_resolved"
  | "needs_clarification"
  | "unsupported";

export interface ResolvedClerkRequest {
  requestId: string;
  game: "magic" | "pokemon" | "lorcana" | "other";
  format?: "commander" | "standard" | "modern" | "limited" | "unknown";
  task: ResolvedClerkTask;
  requestedText: string;
  entities: {
    cardOracleIds: string[];
    requestedCardNames: string[];
    commanderOracleId?: string;
    requestedCommanderName?: string;
    archetypes: string[];
    mechanics: string[];
    colors: string[];
  };
  commanderSelectionPolicy: CommanderSelectionPolicy;
  deckBuildMode?: DeckBuildMode;
  constraints: {
    inventoryOnly: boolean;
    budgetTotal?: number;
    maxCardPrice?: number;
    colorsExact?: string[];
    colorsAllowed?: string[];
  };
  resolutionStatus: ResolutionStatus;
  strategySummary?: string;
}

export type DeckBuildFailureCode =
  | "requested_commander_unresolved"
  | "commander_ambiguous"
  | "multi_commander_unsupported"
  | "alternatives_required";

export interface DeckBuildResolution {
  resolved: ResolvedClerkRequest;
  commanderName?: string;
  commanderOracleId?: string;
  commanderScryfallId?: string;
  commanderColorIdentity?: string[];
  commanderStatus?: CommanderStatus;
  entityResolution?: CommanderEntityResolution;
  commanderCandidates?: CommanderEntityCandidate[];
  deckBuildMode?: DeckBuildMode;
  strategySummary?: string;
  failureMessage?: string;
  failureCode?: DeckBuildFailureCode;
}

function buildFailureResolution(input: {
  question: string;
  failureMessage: string;
  failureCode: DeckBuildFailureCode;
  policy?: CommanderSelectionPolicy;
  task?: ResolvedClerkTask;
  themeKeywords?: string[];
  commanderCandidates?: CommanderEntityCandidate[];
  entityResolution?: CommanderEntityResolution;
}): DeckBuildResolution {
  return {
    resolved: {
      requestId: randomUUID(),
      game: "magic",
      format: "commander",
      task: input.task ?? "build_deck",
      requestedText: input.question,
      entities: {
        cardOracleIds: [],
        requestedCardNames: [],
        archetypes: input.themeKeywords ?? [],
        mechanics: [],
        colors: [],
      },
      commanderSelectionPolicy: input.policy ?? "exact_commander_required",
      constraints: { inventoryOnly: true },
      resolutionStatus: "needs_clarification",
    },
    failureMessage: input.failureMessage,
    failureCode: input.failureCode,
    commanderCandidates: input.commanderCandidates,
    entityResolution: input.entityResolution,
  };
}

function allowsAutomaticSelection(text: string): boolean {
  return (
    /\b(best|strongest|most powerful|whichever|whatever|choose for me|pick for me|you pick|you choose)\b/i.test(
      text,
    ) && /\bcommander\b/i.test(text)
  );
}

function isRecommendCommandersQuestion(text: string): boolean {
  return (
    /\b(what|which)\s+commanders?\b/i.test(text) &&
    !/\bbuild\b/i.test(text)
  );
}

export function inferCommanderSelectionPolicy(input: {
  namedCommander?: string;
  featuredCard?: string;
  parsedCommander?: string;
  themeKeywords: string[];
  question?: string;
  conversationSummary?: string;
}): CommanderSelectionPolicy {
  const combined = `${input.conversationSummary ?? ""} ${input.question ?? ""}`;

  if (isRecommendCommandersQuestion(combined)) {
    return "recommend_a_commander";
  }

  if (allowsAutomaticSelection(combined)) {
    return "automatic_selection_allowed";
  }

  const concreteParsed =
    input.parsedCommander &&
    isConcreteCommanderName(input.parsedCommander) &&
    !isDeckThemePhrase(input.parsedCommander);

  const concreteNamed =
    input.namedCommander &&
    isConcreteCommanderName(input.namedCommander) &&
    !isDeckThemePhrase(input.namedCommander);

  const concreteFeatured =
    input.featuredCard &&
    isConcreteCommanderName(input.featuredCard) &&
    !isDeckThemePhrase(input.featuredCard);

  if (concreteNamed || concreteFeatured || concreteParsed) {
    return "exact_commander_required";
  }

  if (input.themeKeywords.length > 0) {
    return "user_must_choose";
  }

  return "recommend_a_commander";
}

function catalogIdentityId(catalog: CardCatalogHit | null): string | undefined {
  return catalog?.oracleId?.trim() || undefined;
}

function uniqueNames(names: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name?.trim();
    if (!trimmed) continue;
    const key = normalizeCardNameForMatch(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}


async function resolveEntityOutcome(input: {
  entity: CommanderEntityResolution;
  commanderSelectionPolicy: CommanderSelectionPolicy;
  intent: Awaited<ReturnType<typeof translateDeckBuildIntent>>;
  question: string;
  conversationSummary: string;
  storeId: string;
  storeSlug: string;
  commanderMaxPrice?: number;
  budget?: number;
}): Promise<DeckBuildResolution> {
  const {
    entity,
    commanderSelectionPolicy,
    intent,
    question,
    conversationSummary,
    storeId,
    storeSlug,
    commanderMaxPrice,
    budget,
  } = input;

  if (entity.entityResolutionStatus === "ambiguous") {
    return buildFailureResolution({
      question,
      failureMessage: formatAmbiguousCommanderClarification(entity),
      failureCode: "commander_ambiguous",
      policy: commanderSelectionPolicy,
      commanderCandidates: entity.candidates,
      entityResolution: entity,
    });
  }

  if (entity.entityResolutionStatus === "unresolved") {
    if (commanderSelectionPolicy === "exact_commander_required") {
      return buildFailureResolution({
        question,
        failureMessage: `I couldn't identify a unique commander matching "${entity.queryPhrase}". Please provide the exact card name.`,
        failureCode: "requested_commander_unresolved",
        policy: commanderSelectionPolicy,
      });
    }
  }

  const selected = entity.selected;
  if (!selected) {
    return buildFailureResolution({
      question,
      failureMessage: `I couldn't identify a commander matching "${entity.queryPhrase}".`,
      failureCode: "requested_commander_unresolved",
      policy: commanderSelectionPolicy,
    });
  }

  const multi = assessMultiCommanderSupport({
    commanderStatus: selected.commanderStatus,
    typeLine: selected.typeLine,
    oracleText: undefined,
  });
  if (!multi.supported) {
    return buildFailureResolution({
      question,
      failureMessage: multi.message,
      failureCode: "multi_commander_unsupported",
      policy: commanderSelectionPolicy,
    });
  }

  const deckBuildMode = inferDeckBuildMode({
    commanderStatus: selected.commanderStatus,
    message: question,
    conversationSummary,
  });

  let strategySummary = intent.strategySummary;
  if (deckBuildMode === "preview_theorycraft") {
    strategySummary = `${previewTheorycraftNote(selected.canonicalName, selected.releaseDate)}\n\n${strategySummary}`;
  }

  const inStock = await resolveNamedCommanderInStock({
    name: selected.canonicalName,
    storeId,
    storeSlug,
    maxPrice: commanderMaxPrice,
  });
  if (!inStock && commanderSelectionPolicy === "exact_commander_required") {
    strategySummary = `${strategySummary}\n\n${offStockCommanderStrategyNote(selected.canonicalName)}`;
  }

  const resolutionStatus: ResolutionStatus = "resolved";

  const resolved: ResolvedClerkRequest = {
    requestId: randomUUID(),
    game: "magic",
    format: "commander",
    task: "build_deck",
    requestedText: question,
    entities: {
      cardOracleIds: [selected.oracleId],
      requestedCardNames: uniqueNames([
        entity.queryPhrase,
        selected.canonicalName,
      ]),
      commanderOracleId: selected.oracleId,
      requestedCommanderName: selected.canonicalName,
      archetypes: intent.themeKeywords,
      mechanics: [],
      colors: selected.colorIdentity,
    },
    commanderSelectionPolicy,
    deckBuildMode,
    constraints: {
      inventoryOnly: deckBuildMode !== "preview_theorycraft",
      budgetTotal: budget,
      maxCardPrice: commanderMaxPrice,
      colorsExact:
        intent.colorHints.length > 0 ? intent.colorHints : undefined,
    },
    resolutionStatus,
    strategySummary,
  };

  return {
    resolved,
    commanderName: selected.canonicalName,
    commanderOracleId: selected.oracleId,
    commanderScryfallId: selected.scryfallId,
    commanderColorIdentity: selected.colorIdentity,
    commanderStatus: selected.commanderStatus,
    entityResolution: entity,
    deckBuildMode,
    strategySummary,
  };
}

/** Single authoritative resolution for Commander deck builds — locks commander when exact. */
export async function resolveDeckBuildRequest(input: {
  question: string;
  conversationSummary: string;
  storeId: string;
  storeSlug: string;
  budget?: number;
}): Promise<DeckBuildResolution> {
  const conversationSummary = input.conversationSummary;
  const planningQuestion = deckBuildQuestionForPlanning({
    question: input.question,
    conversationSummary,
  });

  const intent = await translateDeckBuildIntent({
    question: planningQuestion,
    conversationSummary,
  });

  const parsedCommander = parseCommanderFromMessage({
    question: input.question,
    conversationSummary,
    deckBuildOnly: true,
  });

  const commanderSelectionPolicy = inferCommanderSelectionPolicy({
    namedCommander: intent.namedCommander,
    featuredCard: intent.featuredCard,
    parsedCommander,
    themeKeywords: intent.themeKeywords,
    question: input.question,
    conversationSummary,
  });

  const commanderMaxPrice = parseCommanderMaxPriceFromConversation({
    question: input.question,
    conversationSummary,
  });

  if (commanderSelectionPolicy === "user_must_choose") {
    const resolved: ResolvedClerkRequest = {
      requestId: randomUUID(),
      game: "magic",
      format: "commander",
      task: "build_deck",
      requestedText: input.question,
      entities: {
        cardOracleIds: [],
        requestedCardNames: [],
        archetypes: intent.themeKeywords,
        mechanics: [],
        colors: intent.colorHints,
      },
      commanderSelectionPolicy,
      constraints: {
        inventoryOnly: true,
        budgetTotal: input.budget,
        maxCardPrice: commanderMaxPrice,
        colorsExact:
          intent.colorHints.length > 0 ? intent.colorHints : undefined,
      },
      resolutionStatus: "needs_clarification",
      strategySummary: intent.strategySummary,
    };

    return {
      resolved,
      strategySummary: intent.strategySummary,
      failureCode: "alternatives_required",
      failureMessage: undefined,
    };
  }

  if (commanderSelectionPolicy === "recommend_a_commander") {
    const resolved: ResolvedClerkRequest = {
      requestId: randomUUID(),
      game: "magic",
      format: "commander",
      task: "recommend_commander",
      requestedText: input.question,
      entities: {
        cardOracleIds: [],
        requestedCardNames: [],
        archetypes: intent.themeKeywords,
        mechanics: [],
        colors: intent.colorHints,
      },
      commanderSelectionPolicy,
      constraints: {
        inventoryOnly: true,
        budgetTotal: input.budget,
        maxCardPrice: commanderMaxPrice,
      },
      resolutionStatus: "needs_clarification",
      strategySummary: intent.strategySummary,
    };
    return {
      resolved,
      failureCode: "alternatives_required",
    };
  }

  const resolutionPhrase =
    extractCommanderResolutionPhrase({
      namedCommander: intent.namedCommander,
      featuredCard: intent.featuredCard,
      parsedCommander,
      question: input.question,
    }) ?? primaryRequestedCardName(intent);

  if (
    commanderSelectionPolicy === "exact_commander_required" &&
    resolutionPhrase
  ) {
    const entity = await resolveCommanderEntity({
      phrase: resolutionPhrase,
      conversationContext: `${conversationSummary}\n${input.question}`,
    });

    const outcome = await resolveEntityOutcome({
      entity,
      commanderSelectionPolicy,
      intent,
      question: input.question,
      conversationSummary,
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      commanderMaxPrice,
      budget: input.budget,
    });

    if (outcome.failureCode === "commander_ambiguous") {
      return outcome;
    }

    if (outcome.failureMessage && !outcome.commanderOracleId) return outcome;
    return outcome;
  }

  const preferPowerful = wantsPowerfulCommander(input.question);
  const outcome = await planCommanderForDeckBuild({
    question: planningQuestion,
    conversationSummary,
    commanderMaxPrice,
    preferPowerful,
    storeId: input.storeId,
    storeSlug: input.storeSlug,
  });

  if (!outcome.plan) {
    return buildFailureResolution({
      question: input.question,
      failureMessage:
        outcome.failureMessage ??
        "I couldn't determine a commander for this deck request.",
      failureCode: "requested_commander_unresolved",
      policy: commanderSelectionPolicy,
      themeKeywords: intent.themeKeywords,
    });
  }

  const commanderName = outcome.plan.commanderName;
  let strategySummary = outcome.plan.strategySummary;
  const entity = await resolveCommanderEntity({
    phrase: commanderName,
    conversationContext: `${conversationSummary}\n${input.question}`,
  });

  if (entity.selected) {
    return resolveEntityOutcome({
      entity,
      commanderSelectionPolicy:
        commanderSelectionPolicy === "automatic_selection_allowed"
          ? "automatic_selection_allowed"
          : "exact_commander_required",
      intent,
      question: input.question,
      conversationSummary,
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      commanderMaxPrice,
      budget: input.budget,
    });
  }

  const catalog = await cardCatalogLookupByOracleId(
    entity.candidates[0]?.oracleId ?? "",
  );
  const commanderOracleId = entity.candidates[0]?.oracleId ?? catalogIdentityId(catalog ?? null);

  if (!commanderOracleId) {
    return buildFailureResolution({
      question: input.question,
      failureMessage: `I couldn't canonically verify "${commanderName}" as a commander. Please choose a specific commander.`,
      failureCode: "requested_commander_unresolved",
      policy: commanderSelectionPolicy,
      themeKeywords: intent.themeKeywords,
    });
  }

  const resolved: ResolvedClerkRequest = {
    requestId: randomUUID(),
    game: "magic",
    format: "commander",
    task: "build_deck",
    requestedText: input.question,
    entities: {
      cardOracleIds: [commanderOracleId],
      requestedCardNames: [commanderName],
      commanderOracleId,
      requestedCommanderName: commanderName,
      archetypes: intent.themeKeywords,
      mechanics: [],
      colors: intent.colorHints,
    },
    commanderSelectionPolicy,
    constraints: {
      inventoryOnly: true,
      budgetTotal: input.budget,
      maxCardPrice: commanderMaxPrice,
    },
    resolutionStatus: "resolved",
    strategySummary,
  };

  return {
    resolved,
    commanderName,
    commanderOracleId,
    commanderScryfallId: catalog?.scryfallId,
    commanderColorIdentity: catalog?.colorIdentity,
    strategySummary,
  };
}

/** Names the customer explicitly asked to build around (for verifier consistency). */
export function explicitRequestedCommanderNames(input: {
  routeEntities?: {
    commander?: string;
    featured_card?: string;
  };
  question: string;
  conversationSummary?: string;
}): string[] {
  const parsed = parseCommanderFromMessage({
    question: input.question,
    conversationSummary: input.conversationSummary ?? "",
    deckBuildOnly: true,
  });
  return uniqueNames([
    input.routeEntities?.commander,
    input.routeEntities?.featured_card,
    parsed && isConcreteCommanderName(parsed) ? parsed : undefined,
  ]);
}

export function commanderNamesMatch(a: string, b: string): boolean {
  const na = normalizeCardNameForMatch(a);
  const nb = normalizeCardNameForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function inferPolicyFromRoute(input: {
  routeEntities?: { commander?: string; featured_card?: string };
  question: string;
  conversationSummary?: string;
  themeKeywords?: string[];
}): CommanderSelectionPolicy {
  const names = explicitRequestedCommanderNames(input);
  if (names.length > 0) return "exact_commander_required";
  if (input.themeKeywords?.length) return "user_must_choose";
  if (isRecommendCommandersQuestion(input.question)) return "recommend_a_commander";
  return "user_must_choose";
}

/** Reject commander name changes after session lock (exact policy). */
export function assertCommanderImmutable(input: {
  sessionCommanderName: string;
  sessionCommanderOracleId?: string;
  candidateName: string;
  policy?: CommanderSelectionPolicy;
}): void {
  if (input.policy !== "exact_commander_required") return;
  if (!commanderNamesMatch(input.sessionCommanderName, input.candidateName)) {
    throw new Error(
      `Commander substitution blocked: locked ${input.sessionCommanderName}, attempted ${input.candidateName}.`,
    );
  }
}

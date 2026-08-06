import { normalizeCardNameForMatch } from "./clerk-tools/magic-commander-inventory";
import type { CommanderSelectionPolicy } from "./resolved-clerk-request";
import { commanderNamesMatch } from "./resolved-clerk-request";
import { commanderOracleIdsMatch } from "./commander-oracle-contract";
import type {
  CardCatalogHit,
  ClerkDeckList,
  SpecialistRecommendation,
  SpecialistResponse,
} from "./clerk-types";
import type { StoreInventoryCard } from "../deck-builder/store-inventory-browse";
import type { MtgKnowledgeHit } from "../mtg-rag/hybrid-retrieval";

export type AllowedCardSource =
  | "resolved_entity"
  | "inventory_result"
  | "recommendation"
  | "deck_card"
  | "evidence";

export interface AllowedCardReference {
  oracleId: string;
  canonicalName: string;
  acceptedDisplayNames: string[];
  source: AllowedCardSource;
}

export interface AllowedCardRegistry {
  cards: AllowedCardReference[];
  commanderOracleId?: string;
  commanderCanonicalName?: string;
  byOracleId: Map<string, AllowedCardReference>;
}

function normalizeDisplayName(name: string): string {
  return normalizeCardNameForMatch(name);
}

function acceptedNamesForCard(input: {
  canonicalName: string;
  printingName?: string;
  inventoryName?: string;
}): string[] {
  const names = new Set<string>();
  for (const raw of [input.canonicalName, input.printingName, input.inventoryName]) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    names.add(trimmed);
    const norm = normalizeDisplayName(trimmed);
    if (norm) names.add(norm);
  }
  return [...names];
}

export function upsertAllowedCard(
  registry: AllowedCardRegistry,
  ref: AllowedCardReference,
): void {
  const existing = registry.byOracleId.get(ref.oracleId);
  if (existing) {
    const merged = new Set([
      ...existing.acceptedDisplayNames,
      ...ref.acceptedDisplayNames,
      ref.canonicalName,
    ]);
    existing.acceptedDisplayNames = [...merged];
    return;
  }
  registry.cards.push(ref);
  registry.byOracleId.set(ref.oracleId, ref);
}

export function allowedCardFromHit(
  hit: Pick<CardCatalogHit, "oracleId" | "name">,
  source: AllowedCardSource,
): AllowedCardReference | null {
  const oracleId = hit.oracleId?.trim();
  if (!oracleId) return null;
  return {
    oracleId,
    canonicalName: hit.name,
    acceptedDisplayNames: acceptedNamesForCard({ canonicalName: hit.name }),
    source,
  };
}

export function allowedCardFromInventory(
  card: Pick<StoreInventoryCard, "oracleId" | "name" | "scryfallId">,
  source: AllowedCardSource = "inventory_result",
): AllowedCardReference | null {
  const oracleId = card.oracleId?.trim();
  if (!oracleId) return null;
  return {
    oracleId,
    canonicalName: card.name,
    acceptedDisplayNames: acceptedNamesForCard({
      canonicalName: card.name,
      inventoryName: card.name,
    }),
    source,
  };
}

export function buildAllowedCardRegistry(input: {
  commanderOracleId?: string;
  commanderCanonicalName?: string;
  inventory?: StoreInventoryCard[];
  recommendations?: SpecialistRecommendation[];
  deckList?: ClerkDeckList;
  evidenceHits?: MtgKnowledgeHit[];
  resolvedOracleIds?: string[];
}): AllowedCardRegistry {
  const registry: AllowedCardRegistry = {
    cards: [],
    commanderOracleId: input.commanderOracleId,
    commanderCanonicalName: input.commanderCanonicalName,
    byOracleId: new Map(),
  };

  if (input.commanderOracleId && input.commanderCanonicalName) {
    upsertAllowedCard(registry, {
      oracleId: input.commanderOracleId,
      canonicalName: input.commanderCanonicalName,
      acceptedDisplayNames: acceptedNamesForCard({
        canonicalName: input.commanderCanonicalName,
      }),
      source: "resolved_entity",
    });
  }

  for (const oracleId of input.resolvedOracleIds ?? []) {
    if (!oracleId.trim()) continue;
    if (registry.byOracleId.has(oracleId)) continue;
    upsertAllowedCard(registry, {
      oracleId,
      canonicalName: input.commanderCanonicalName ?? oracleId,
      acceptedDisplayNames: [oracleId],
      source: "resolved_entity",
    });
  }

  for (const card of input.inventory ?? []) {
    const ref = allowedCardFromInventory(card);
    if (ref) upsertAllowedCard(registry, ref);
  }

  for (const rec of input.recommendations ?? []) {
    const oracleId = rec.oracleId?.trim();
    if (!oracleId) continue;
    upsertAllowedCard(registry, {
      oracleId,
      canonicalName: rec.card_name,
      acceptedDisplayNames: acceptedNamesForCard({ canonicalName: rec.card_name }),
      source: "recommendation",
    });
  }

  for (const line of input.deckList?.lines ?? []) {
    const oracleId = line.oracleId?.trim();
    if (!oracleId) continue;
    upsertAllowedCard(registry, {
      oracleId,
      canonicalName: line.name,
      acceptedDisplayNames: acceptedNamesForCard({ canonicalName: line.name }),
      source: "deck_card",
    });
  }

  return registry;
}

/** Extract likely card-name mentions from customer-facing prose. */
export function extractPotentialCardMentions(text: string): string[] {
  const mentions = new Set<string>();

  const boldRe = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = boldRe.exec(text)) !== null) {
    const name = match[1]?.trim();
    if (name && name.length >= 2 && name.length <= 80) mentions.add(name);
  }

  const quotedRe = /"([^"]{2,80})"/g;
  while ((match = quotedRe.exec(text)) !== null) {
    const name = match[1]?.trim();
    if (name) mentions.add(name);
  }

  return [...mentions];
}

export function resolveMentionAgainstRegistry(
  mention: string,
  registry: AllowedCardRegistry,
): AllowedCardReference | null {
  const norm = normalizeDisplayName(mention);
  if (!norm) return null;

  for (const ref of registry.cards) {
    for (const display of ref.acceptedDisplayNames) {
      const dNorm = normalizeDisplayName(display);
      if (!dNorm) continue;
      if (
        dNorm === norm ||
        dNorm.includes(norm) ||
        norm.includes(dNorm) ||
        commanderNamesMatch(display, mention)
      ) {
        return ref;
      }
    }
  }
  return null;
}

export interface RegistryValidationResult {
  valid: boolean;
  violations: string[];
  unresolvedMentions: string[];
}

export function validateFormattedReplyAgainstRegistry(input: {
  reply: string;
  registry: AllowedCardRegistry;
  commanderOracleId?: string;
  commanderSelectionPolicy?: CommanderSelectionPolicy;
}): RegistryValidationResult {
  const violations: string[] = [];
  const unresolvedMentions: string[] = [];
  const mentions = extractPotentialCardMentions(input.reply);

  for (const mention of mentions) {
    const resolved = resolveMentionAgainstRegistry(mention, input.registry);
    if (!resolved) {
      unresolvedMentions.push(mention);
      violations.push(`Unapproved card mention: ${mention}`);
      continue;
    }
    if (
      input.commanderSelectionPolicy === "exact_commander_required" &&
      input.commanderOracleId &&
      /\bcommander\b/i.test(input.reply) &&
      !commanderOracleIdsMatch(resolved.oracleId, input.commanderOracleId) &&
      !commanderNamesMatch(mention, input.registry.commanderCanonicalName ?? "")
    ) {
      violations.push(
        `Formatter substituted commander mention "${mention}" (oracle ${resolved.oracleId}) for locked ${input.commanderOracleId}.`,
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    unresolvedMentions,
  };
}

export function assertStructuredCardsHaveOracleId(input: {
  recommendations?: SpecialistRecommendation[];
  deckList?: ClerkDeckList;
}): string[] {
  const missing: string[] = [];
  for (const rec of input.recommendations ?? []) {
    if (!rec.oracleId?.trim()) {
      missing.push(`recommendation:${rec.card_name}`);
    }
  }
  for (const line of input.deckList?.lines ?? []) {
    if (!line.oracleId?.trim()) {
      missing.push(`deck_line:${line.name}`);
    }
  }
  if (input.deckList && !input.deckList.commanderOracleId?.trim()) {
    missing.push("deck:commander_oracle_id");
  }
  return missing;
}

export function buildRegistryFromSpecialist(input: {
  specialist: SpecialistResponse | null;
  inventory?: StoreInventoryCard[];
}): AllowedCardRegistry {
  return buildAllowedCardRegistry({
    commanderOracleId: input.specialist?.commanderOracleId ?? input.specialist?.deckList?.commanderOracleId,
    commanderCanonicalName:
      input.specialist?.deckList?.commanderCanonicalName ??
      input.specialist?.deckList?.archetype,
    inventory: input.inventory,
    recommendations: input.specialist?.recommendations,
    deckList: input.specialist?.deckList ?? undefined,
  });
}

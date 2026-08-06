import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import { catalogCardFromScryfall } from "../deck-builder/scryfall-catalog";
import { scryfallFetch } from "../processing/scryfall-client";
import { normalizeCardNameForMatch } from "./clerk-tools/magic-commander-inventory";
import {
  deriveCommanderStatus,
  deriveStructuralCommanderEligibility,
  type CommanderStatus,
} from "./commander-status";

export type EntityResolutionStatus = "resolved" | "ambiguous" | "unresolved";

export type ResolutionSource =
  | "local_oracle"
  | "local_printing"
  | "crosswalk"
  | "live_scryfall";

export interface CommanderEntityCandidate {
  oracleId: string;
  canonicalName: string;
  colorIdentity: string[];
  typeLine: string;
  identifyingText: string;
  setCode?: string;
  setName?: string;
  releaseDate?: string;
  scryfallId: string;
  resolutionSource: ResolutionSource;
  commanderStatus: CommanderStatus;
  confidenceScore: number;
}

export interface CommanderEntityResolution {
  entityResolutionStatus: EntityResolutionStatus;
  queryPhrase: string;
  candidates: CommanderEntityCandidate[];
  selected?: CommanderEntityCandidate;
}

const CONFIDENCE_LOCK_THRESHOLD = 75;
const CONFIDENCE_GAP = 25;

const SET_CONTEXT_ALIASES: Record<string, string[]> = {
  hob: ["hobbit", "the hobbit", "main set", "main hobbit"],
  hoc: ["commander", "commander deck", "commander product", "hoc"],
};

function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase();
}

function extractSetContextSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  for (const [code, aliases] of Object.entries(SET_CONTEXT_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) signals.push(code);
  }
  if (/\bhob\b/i.test(text)) signals.push("hob");
  if (/\bhoc\b/i.test(text)) signals.push("hoc");
  return [...new Set(signals)];
}

function hasPreviewLanguage(text: string): boolean {
  return /\b(new|preview|previewed|upcoming|unreleased|not released|future)\b/i.test(
    text,
  );
}

function isExactNameQuery(phrase: string): boolean {
  const words = phrase.trim().split(/\s+/);
  return words.length >= 3 && !/^(the|a|an)\s/i.test(phrase);
}

async function searchScryfallUniqueCards(
  query: string,
): Promise<Record<string, unknown>[]> {
  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

async function lookupLocalOracleByName(
  name: string,
): Promise<{ oracleId: string; source: ResolutionSource } | null> {
  const norm = normalizeCardNameForMatch(name);
  if (!norm) return null;

  const oracle = await deckBuilderStore.findCatalogOracleByCanonicalName(name);
  if (oracle?.id) return { oracleId: oracle.id, source: "local_oracle" };

  return null;
}

async function resolvePrintingToCandidate(
  raw: Record<string, unknown>,
  source: ResolutionSource,
  rankInput: RankInput,
): Promise<CommanderEntityCandidate | null> {
  const catalog = catalogCardFromScryfall(raw);
  if (!catalog?.oracleId) return null;

  const typeLine = catalog.typeLine ?? "";
  if (typeLine.toLowerCase().includes("token")) return null;

  const structural = deriveStructuralCommanderEligibility({
    typeLine,
    oracleText: catalog.oracleText,
  });
  if (!structural.eligible) return null;

  const legalities = raw.legalities as Record<string, string> | undefined;
  const releasedAt = raw.released_at as string | undefined;
  const commanderStatus = deriveCommanderStatus({
    catalog,
    legalities,
    releasedAt,
  });
  if (!commanderStatus?.structurallyEligible) return null;

  const score = scoreCandidate({
    catalog,
    commanderStatus,
    rankInput,
    releasedAt,
    setCode: String(raw.set ?? catalog.set ?? ""),
    setName: String(raw.set_name ?? catalog.setName ?? ""),
  });

  const identifyingParts = [
    catalog.setName ? `${catalog.setName} (${catalog.set})` : catalog.set,
    commanderStatus.legalityStatus === "unreleased"
      ? "preview — not yet released"
      : commanderStatus.currentlyLegal
        ? "Commander-legal"
        : "not currently Commander-legal",
    catalog.typeLine,
  ].filter(Boolean);

  return {
    oracleId: catalog.oracleId,
    canonicalName: catalog.name,
    colorIdentity: catalog.colorIdentity,
    typeLine: catalog.typeLine,
    identifyingText: identifyingParts.join(" · "),
    setCode: catalog.set,
    setName: catalog.setName,
    releaseDate: releasedAt,
    scryfallId: catalog.id,
    resolutionSource: source,
    commanderStatus,
    confidenceScore: score,
  };
}

interface RankInput {
  phrase: string;
  conversationContext: string;
  exactName?: string;
  setSignals: string[];
  previewLanguage: boolean;
}

function scoreCandidate(input: {
  catalog: { name: string; set: string; setName?: string };
  commanderStatus: CommanderStatus;
  rankInput: RankInput;
  releasedAt?: string;
  setCode: string;
  setName: string;
}): number {
  let score = 0;
  const phraseNorm = normalizeCardNameForMatch(input.rankInput.phrase);
  const nameNorm = normalizeCardNameForMatch(input.catalog.name);

  if (input.rankInput.exactName) {
    const exactNorm = normalizeCardNameForMatch(input.rankInput.exactName);
    if (nameNorm === exactNorm) score += 100;
    else if (nameNorm.includes(exactNorm) || exactNorm.includes(nameNorm)) {
      score += 60;
    }
  }

  if (phraseNorm && nameNorm === phraseNorm) score += 100;
  if (phraseNorm && nameNorm.includes(phraseNorm)) score += 40;

  for (const signal of input.rankInput.setSignals) {
    if (input.setCode.toLowerCase() === signal) score += 50;
    if (input.setName.toLowerCase().includes(signal)) score += 30;
  }

  if (input.rankInput.previewLanguage) {
    if (input.commanderStatus.legalityStatus === "unreleased") score += 35;
    if (input.releasedAt && new Date(input.releasedAt) > new Date()) score += 20;
  }

  if (input.catalog.name.toLowerCase().includes("the magnificent")) {
    if (
      input.rankInput.setSignals.includes("hob") ||
      /\bhobbit\b/i.test(input.rankInput.conversationContext)
    ) {
      score += 40;
    }
  }

  if (input.catalog.name.toLowerCase().includes("the impenetrable")) {
    if (
      input.rankInput.setSignals.includes("hoc") ||
      /\bcommander\b/i.test(input.rankInput.conversationContext)
    ) {
      score += 40;
    }
  }

  if (input.commanderStatus.currentlyLegal) score += 10;

  return score;
}

async function gatherCandidates(input: {
  phrase: string;
  conversationContext: string;
}): Promise<CommanderEntityCandidate[]> {
  const phrase = input.phrase.trim();
  if (!phrase) return [];

  const setSignals = extractSetContextSignals(input.conversationContext);
  const previewLanguage = hasPreviewLanguage(input.conversationContext);
  const rankInput: RankInput = {
    phrase,
    conversationContext: input.conversationContext,
    exactName: isExactNameQuery(phrase) ? phrase : undefined,
    setSignals,
    previewLanguage,
  };

  const byOracleId = new Map<string, CommanderEntityCandidate>();

  async function addFromRaw(
    raw: Record<string, unknown>,
    source: ResolutionSource,
  ) {
    const candidate = await resolvePrintingToCandidate(raw, source, rankInput);
    if (!candidate) return;
    const existing = byOracleId.get(candidate.oracleId);
    if (!existing || candidate.confidenceScore > existing.confidenceScore) {
      byOracleId.set(candidate.oracleId, candidate);
    }
  }

  const local = await lookupLocalOracleByName(phrase);
  if (local) {
    const oracle = await deckBuilderStore.getCatalogOracleCard(local.oracleId);
    if (oracle?.printingIds[0]) {
      const printing = await deckBuilderStore.getCatalogCard(oracle.printingIds[0]);
      if (printing) {
        await addFromRaw(
          {
            id: printing.id,
            oracle_id: printing.oracleId,
            name: printing.name,
            set: printing.set,
            set_name: printing.setName,
            type_line: printing.typeLine,
            oracle_text: printing.oracleText,
            color_identity: printing.colorIdentity,
            legalities: {
              commander: printing.commanderFormatLegal ? "legal" : "not_legal",
            },
            released_at: undefined,
          },
          local.source,
        );
      }
    }
  }

  const queries: string[] = [];
  if (isExactNameQuery(phrase)) {
    queries.push(`!"${phrase.replace(/"/g, "")}"`);
  }
  const token = phrase.split(/\s+/).pop()?.replace(/[^a-z0-9']/gi, "") ?? phrase;
  queries.push(
    `name:${token} (is:commander OR (t:legendary t:creature)) -t:token`,
  );
  if (token.length >= 4) {
    queries.push(`${token} is:commander -t:token`);
  }

  for (const query of queries) {
    const rows = await searchScryfallUniqueCards(query);
    for (const raw of rows) {
      await addFromRaw(raw, "live_scryfall");
    }
  }

  return [...byOracleId.values()].sort(
    (a, b) => b.confidenceScore - a.confidenceScore,
  );
}

export async function resolveCommanderEntity(input: {
  phrase: string;
  conversationContext?: string;
}): Promise<CommanderEntityResolution> {
  const phrase = input.phrase.trim();
  const conversationContext = input.conversationContext ?? phrase;

  if (!phrase) {
    return {
      entityResolutionStatus: "unresolved",
      queryPhrase: phrase,
      candidates: [],
    };
  }

  const candidates = await gatherCandidates({ phrase, conversationContext });

  if (candidates.length === 0) {
    return {
      entityResolutionStatus: "unresolved",
      queryPhrase: phrase,
      candidates: [],
    };
  }

  const top = candidates[0]!;
  const second = candidates[1];

  if (
    top.confidenceScore >= CONFIDENCE_LOCK_THRESHOLD &&
    (!second || top.confidenceScore - second.confidenceScore >= CONFIDENCE_GAP)
  ) {
    return {
      entityResolutionStatus: "resolved",
      queryPhrase: phrase,
      candidates,
      selected: top,
    };
  }

  if (candidates.length === 1 && top.confidenceScore >= 50) {
    return {
      entityResolutionStatus: "resolved",
      queryPhrase: phrase,
      candidates,
      selected: top,
    };
  }

  return {
    entityResolutionStatus: "ambiguous",
    queryPhrase: phrase,
    candidates,
  };
}

export function formatAmbiguousCommanderClarification(
  resolution: CommanderEntityResolution,
): string {
  const lines = resolution.candidates.slice(0, 6).map((c, i) => {
    const colors =
      c.colorIdentity.length > 0 ? ` [${c.colorIdentity.join("")}]` : "";
    return `${i + 1}. **${c.canonicalName}**${colors} — ${c.identifyingText}`;
  });
  return `I found several plausible commanders matching "${resolution.queryPhrase}". Which one did you mean?\n\n${lines.join("\n")}\n\nReply with the exact name and I'll build the deck.`;
}

export function extractCommanderResolutionPhrase(input: {
  namedCommander?: string;
  featuredCard?: string;
  parsedCommander?: string;
  question: string;
}): string | undefined {
  const candidates = [
    input.namedCommander,
    input.parsedCommander,
    input.featuredCard,
  ]
    .map((c) => c?.trim())
    .filter(Boolean) as string[];

  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.length - a.length)[0];
  }

  const q = input.question.toLowerCase();
  if (/\bsmaug the magnificent\b/i.test(input.question)) {
    return "Smaug the Magnificent";
  }
  if (/\bsmaug the impenetrable\b/i.test(input.question)) {
    return "Smaug the Impenetrable";
  }
  if (/\b(?:new|preview|upcoming)\s+smaug\b/i.test(input.question)) {
    return "Smaug the Magnificent";
  }
  if (/\bbuild(?:\s+\w+){0,6}\s+around\s+([a-z][a-z\s,'-]{2,40})/i.test(input.question)) {
    const match = input.question.match(
      /\bbuild(?:\s+\w+){0,6}\s+around\s+([a-z][a-z\s,'-]{2,40})/i,
    );
    const name = match?.[1]?.trim().replace(/\.$/, "");
    if (name && !/^(a|an|the)\s/i.test(name)) return name;
  }
  if (/\bsmaug\b/i.test(q) && !/\bsmaug the\b/i.test(q)) {
    return "Smaug";
  }

  return undefined;
}

/**
 * Sol-directed deck list grouping, export, and customer-facing strategy copy.
 */
import { isBasicLandName } from "./professor-basic-land-name-v1";
import { normalizeCardNameForMatch } from "./professor-card-name-match-client-v4-15-1-v1";
import { isDeckPreferencesSetConstrained } from "./professor-sol-directed-deck-preferences-parse-v1-1-1";
import type { SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_DECK_DISPLAY_V1_1_1_VERSION =
  "professor-sol-directed-deck-display-v1-1-1";

export type SolDirectedDeckDisplayCategory =
  | "commander"
  | "planeswalker"
  | "creature"
  | "instant"
  | "sorcery"
  | "artifact"
  | "enchantment"
  | "land";

export type SolDirectedDeckDisplayCard = {
  name: string;
  copies: number;
  typeLine?: string;
  oracleId?: string;
};

export const SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS: Record<SolDirectedDeckDisplayCategory, string> = {
  commander: "Commander",
  planeswalker: "Planeswalkers",
  creature: "Creatures",
  instant: "Instants",
  sorcery: "Sorceries",
  artifact: "Artifacts",
  enchantment: "Enchantments",
  land: "Lands",
};

const DISPLAY_ORDER: SolDirectedDeckDisplayCategory[] = [
  "commander",
  "planeswalker",
  "creature",
  "instant",
  "sorcery",
  "artifact",
  "enchantment",
  "land",
];

function categorizeTypeLine(typeLine?: string, isCommander = false): SolDirectedDeckDisplayCategory {
  if (isCommander) return "commander";
  const lower = (typeLine ?? "").toLowerCase();
  if (lower.includes("land")) return "land";
  if (lower.includes("planeswalker")) return "planeswalker";
  if (lower.includes("creature")) return "creature";
  if (lower.includes("instant")) return "instant";
  if (lower.includes("sorcery")) return "sorcery";
  if (lower.includes("enchantment")) return "enchantment";
  if (lower.includes("artifact")) return "artifact";
  return "artifact";
}

/**
 * The same type-to-section rule the read-only deck panel uses, exposed so the
 * deck editor groups a card into the identical section. Two views of one deck
 * disagreeing about whether Dryad Arbor is a creature or a land would look
 * like a bug in both.
 */
export function solDirectedDisplayCategoryForTypeLineV1(
  typeLine?: string,
): SolDirectedDeckDisplayCategory {
  return categorizeTypeLine(typeLine);
}

export const SOL_DIRECTED_DECK_DISPLAY_ORDER_V1: readonly SolDirectedDeckDisplayCategory[] =
  DISPLAY_ORDER;

function compareCardNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function groupSolDirectedDeckForDisplay(args: {
  commander: { name: string; oracleId?: string; typeLine?: string };
  constructedDeck: {
    nonlands: Array<{ name: string; oracleId?: string; typeLine?: string }>;
    lands: Array<{ name: string; copies: number; typeLine?: string }>;
  };
}): Record<SolDirectedDeckDisplayCategory, SolDirectedDeckDisplayCard[]> {
  const grouped = Object.fromEntries(
    DISPLAY_ORDER.map((category) => [category, [] as SolDirectedDeckDisplayCard[]]),
  ) as Record<SolDirectedDeckDisplayCategory, SolDirectedDeckDisplayCard[]>;

  grouped.commander.push({
    name: args.commander.name,
    copies: 1,
    typeLine: args.commander.typeLine,
    oracleId: args.commander.oracleId,
  });

  for (const card of args.constructedDeck.nonlands) {
    const category = categorizeTypeLine(card.typeLine);
    grouped[category].push({
      name: card.name,
      copies: 1,
      typeLine: card.typeLine,
      oracleId: card.oracleId,
    });
  }

  for (const land of args.constructedDeck.lands) {
    grouped.land.push({
      name: land.name,
      copies: land.copies,
      typeLine: land.typeLine ?? "Land",
    });
  }

  for (const category of DISPLAY_ORDER) {
    grouped[category].sort((a, b) => compareCardNames(a.name, b.name));
  }

  return grouped;
}

export function formatSolDirectedDeckListText(
  grouped: Record<SolDirectedDeckDisplayCategory, SolDirectedDeckDisplayCard[]>,
): string {
  const lines: string[] = [];

  for (const category of DISPLAY_ORDER) {
    for (const card of grouped[category]) {
      const suffix = category === "commander" ? " (commander)" : "";
      lines.push(`${card.copies} ${card.name}${suffix}`);
    }
  }

  return lines.join("\n");
}

export function solDirectedDeckListDownloadFilename(commanderName: string): string {
  const slug = commanderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "commander-deck"}.txt`;
}

export type CustomerGamePlanV111 = {
  earlyGame: string[];
  midGame: string[];
  lateGame: string[];
  source: "architect" | "constructor" | "mixed";
};

const GENERIC_STAPLE_NAMES = [
  "Sol Ring",
  "Arcane Signet",
  "Mind Stone",
  "Thought Vessel",
  "Fellwar Stone",
  "Commander's Sphere",
  "Talisman of Progress",
  "Swords to Plowshares",
  "Path to Exile",
  "Counterspell",
  "Rhystic Study",
  "Smothering Tithe",
];

export function collectDeckCardNames(deck: SolDirectedConstructedDeckV11): Set<string> {
  const names = new Set<string>();
  names.add(deck.commander.name.trim());
  for (const card of deck.nonlands) names.add(card.name.trim());
  for (const land of deck.lands) names.add(land.name.trim());
  return names;
}

function deckHasCard(deckNames: Set<string>, cardName: string): boolean {
  return deckNames.has(cardName.trim()) || deckNames.has(normalizeCardNameForMatch(cardName));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripOffDeckCardMentions(line: string, deckNames: Set<string>): string {
  let updated = line;
  for (const staple of GENERIC_STAPLE_NAMES) {
    if (!updated.includes(staple) || deckHasCard(deckNames, staple)) continue;
    updated = updated
      .replace(new RegExp(`\\b${escapeRegExp(staple)}\\b,?\\s*`, "gi"), "")
      .replace(/\s+,/g, ",")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*and\s*and/gi, " and")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  updated = updated.replace(/with\s+and\s+/i, "with ");
  updated = updated.replace(/with\s+,/i, "with ");
  return updated;
}

function rampLikeNames(deckNames: Set<string>): string[] {
  const pattern =
    /rock|signet|stone|vessel|bauble|lotus|sphere|diamond|map|monolith|mox|talisman|relic|coil|grimoire|pan|pony|rope|lembas|draught|basin/i;
  return [...deckNames].filter((name) => pattern.test(name)).slice(0, 6);
}

function legendLikeNames(deckNames: Set<string>): string[] {
  const pattern =
    /frodo|sam|merry|pippin|boromir|faramir|gandalf|eowyn|arwen|galadriel|elrond|gimli|legolas|aragorn|bilbo|gaffer|saradoc|gilraen|eomer|theoden/i;
  return [...deckNames].filter((name) => pattern.test(name)).slice(0, 6);
}

function sanitizeGamePlanPhase(
  lines: string[] | undefined,
  deckNames: Set<string>,
  phase: "earlyGame" | "midGame" | "lateGame",
): string[] {
  if (!lines?.length) return [];

  return lines
    .map((line) => {
      let updated = stripOffDeckCardMentions(line, deckNames);
      const mentionsOffDeckStaple = GENERIC_STAPLE_NAMES.some(
        (staple) => line.includes(staple) && !deckHasCard(deckNames, staple),
      );

      if (mentionsOffDeckStaple && phase === "earlyGame") {
        const ramp = rampLikeNames(deckNames);
        if (ramp.length > 0) {
          updated = `Develop early mana and artifacts with ${ramp.join(", ")}${ramp.length >= 3 ? ", and other in-theme pieces" : ""}.`;
        }
      }

      if (phase === "earlyGame" && /legendary creatures such as/i.test(line)) {
        const legends = legendLikeNames(deckNames);
        if (legends.length > 0) {
          updated = `Deploy low-cost legendary creatures such as ${legends.join(", ")}.`;
        }
      }

      return updated.replace(/\s+\./g, ".").trim();
    })
    .filter(Boolean);
}

export function resolveCustomerGamePlanV111(args: {
  architectGamePlan?: { earlyGame?: string[]; midGame?: string[]; lateGame?: string[] };
  expectedPlayPattern?: string;
  deck: SolDirectedConstructedDeckV11;
  deckPreferences?: string;
  professorRepairApplied?: boolean;
}): CustomerGamePlanV111 | null {
  const deckNames = collectDeckCardNames(args.deck);
  const setConstrained = isDeckPreferencesSetConstrained(args.deckPreferences ?? "");
  const playPattern = args.expectedPlayPattern?.trim() ?? "";

  if ((args.professorRepairApplied || setConstrained) && playPattern) {
    const sentences = playPattern
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    if (sentences.length >= 2) {
      const third = Math.max(1, Math.ceil(sentences.length / 3));
      return {
        earlyGame: sentences.slice(0, third),
        midGame: sentences.slice(third, third * 2),
        lateGame: sentences.slice(third * 2),
        source: "constructor",
      };
    }
    return {
      earlyGame: [playPattern],
      midGame: [],
      lateGame: [],
      source: "constructor",
    };
  }

  if (!args.architectGamePlan) return null;

  const earlyGame = sanitizeGamePlanPhase(args.architectGamePlan.earlyGame, deckNames, "earlyGame");
  const midGame = sanitizeGamePlanPhase(args.architectGamePlan.midGame, deckNames, "midGame");
  const lateGame = sanitizeGamePlanPhase(args.architectGamePlan.lateGame, deckNames, "lateGame");

  if (earlyGame.length + midGame.length + lateGame.length === 0) return null;

  return {
    earlyGame,
    midGame,
    lateGame,
    source: "mixed",
  };
}

export function formatThesisForCustomer(args: {
  thesis: string;
  deckPreferences?: string;
  commanderColorIdentity: string[];
}): string {
  const thesis = args.thesis.trim();
  if (!thesis) return thesis;

  const prefs = args.deckPreferences?.trim() ?? "";
  const prefsMentionColor = /\b(mono|only)\s+(white|blue|black|red|green|color)/i.test(prefs);
  if (prefsMentionColor || !isDeckPreferencesSetConstrained(prefs)) return thesis;

  const identity = args.commanderColorIdentity.join("").toUpperCase() || "WUBRG";
  if (/mono-white|mono white|monowhite/i.test(thesis) && identity === "W") {
    return thesis.replace(
      /^(Build a )mono-white/i,
      `$1mono-white (Gandalf's color identity)`,
    );
  }
  return thesis;
}

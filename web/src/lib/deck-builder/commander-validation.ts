import type { CatalogCard, DeckValidationIssue, DeckValidationResult, StoreDeckCard } from "./types";

const BASIC_LAND_NAMES = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
]);

function isBasicLand(name: string): boolean {
  return BASIC_LAND_NAMES.has(name.trim().toLowerCase());
}

export function validateCommanderDeck(input: {
  commanderId: string;
  cards: StoreDeckCard[];
  catalogById: Map<string, CatalogCard>;
  targetBracket?: number;
}): DeckValidationResult {
  const issues: DeckValidationIssue[] = [];
  const commander = input.catalogById.get(input.commanderId);
  if (!commander) {
    issues.push({
      code: "commander_missing",
      message: "Commander not found in catalog.",
      scryfallId: input.commanderId,
    });
    return {
      valid: false,
      issues,
      mainCount: 0,
      commanderCount: 0,
      gameChangerCount: 0,
    };
  }

  if (!commander.commanderFormatLegal) {
    issues.push({
      code: "not_legal_commander",
      message: `${commander.name} is not a legal commander.`,
      scryfallId: input.commanderId,
    });
  }

  const identity = new Set(commander.colorIdentity);
  let mainCount = 0;
  let commanderCount = 0;
  let gameChangerCount = 0;
  const nameCounts = new Map<string, number>();

  for (const row of input.cards) {
    const card = input.catalogById.get(row.scryfallId);
    if (!card) {
      issues.push({
        code: "unknown_card",
        message: `Unknown card: ${row.scryfallId}`,
        scryfallId: row.scryfallId,
      });
      continue;
    }

    if (row.board === "commander") {
      commanderCount += row.qty;
      continue;
    }

    mainCount += row.qty;

    for (const c of card.colorIdentity) {
      if (!identity.has(c)) {
        issues.push({
          code: "color_identity",
          message: `${card.name} is outside the commander's color identity.`,
          scryfallId: row.scryfallId,
        });
        break;
      }
    }

    if (!card.commanderFormatLegal && card.typeLine.includes("Creature")) {
      /* non-issue for non-commander slots */
    }

    const key = card.name.toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + row.qty);
    if (!isBasicLand(card.name) && (nameCounts.get(key) ?? 0) > 1) {
      issues.push({
        code: "singleton",
        message: `${card.name} appears more than once (singleton format).`,
        scryfallId: row.scryfallId,
      });
    }

    if (card.gameChanger) {
      gameChangerCount += row.qty;
    }
  }

  if (commanderCount !== 1) {
    issues.push({
      code: "commander_count",
      message: `Deck must have exactly 1 commander (found ${commanderCount}).`,
    });
  }

  if (mainCount !== 99) {
    issues.push({
      code: "deck_size",
      message: `Main deck must have 99 cards (found ${mainCount}).`,
    });
  }

  const bracket = input.targetBracket ?? 0;
  if (bracket > 0 && bracket <= 3 && gameChangerCount > 3) {
    issues.push({
      code: "game_changers",
      message: `Bracket ${bracket} allows at most 3 Game Changers (found ${gameChangerCount}).`,
    });
  }

  const uniqueIssues = issues.filter(
    (issue, idx, arr) =>
      arr.findIndex(
        (o) => o.code === issue.code && o.scryfallId === issue.scryfallId,
      ) === idx,
  );

  return {
    valid: uniqueIssues.length === 0,
    issues: uniqueIssues,
    mainCount,
    commanderCount,
    gameChangerCount,
  };
}

export function deckToMoxfieldExport(input: {
  commanderName: string;
  cards: StoreDeckCard[];
  catalogById: Map<string, CatalogCard>;
}): string {
  const lines: string[] = [`CMDR: 1 ${input.commanderName}`];
  const main = input.cards.filter((c) => c.board === "main");
  for (const row of main) {
    const card = input.catalogById.get(row.scryfallId);
    if (card) lines.push(`${row.qty} ${card.name}`);
  }
  return lines.join("\n");
}

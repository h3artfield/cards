/**
 * Professor strategy, rules check, and four-digit score for a deck that was just built.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { SolDirectedConstructedDeckV11 } from "@/lib/deck-synthesis/professor-sol-directed-types-v1-1";
import { runPlanChecker, type PlanCheckResultV1 } from "./plan-checker-v1";
import { measurePlanBracket } from "./plan-bracket-v1";
import { deckScoreFromPlan, type DeckScoreV1 } from "./plan-score-v1";
import type { PlanCardV1 } from "./plan-schema-v1";
import { requestProfessorStrategy } from "./professor-strategy-request-v1";
import type { ProfessorStrategyV1 } from "./professor-strategy-v1";
import { verifyProfessorStrategy } from "./professor-strategy-verify-v1";

type Catalog = {
  byOracleId: Map<string, GoldenCatalogOracleCard>;
  byNormalizedName: Map<string, GoldenCatalogOracleCard[]>;
};

function powerOf(card: GoldenCatalogOracleCard): number {
  const raw = card.cardFaces?.[0]?.power ?? "";
  const n = Number(raw);
  return Number.isFinite(n) && raw !== "" ? n : 0;
}

function toPlanCard(card: GoldenCatalogOracleCard, quantity: number): PlanCardV1 {
  return {
    oracleId: card.oracleId,
    name: card.canonicalName,
    cmc: card.manaValue ?? card.cmc ?? 0,
    power: powerOf(card),
    typeLine: card.typeLine ?? "",
    text: card.oracleText ?? card.cardFaces?.map((face) => face.oracleText ?? "").join("\n") ?? "",
    quantity,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const POWER_CACHE_PATH = "data/milestones/deck-rating/v1/plan-factory/creature-power.json";

function readPowerCache(): Map<string, number> {
  try {
    const saved = JSON.parse(readFileSync(POWER_CACHE_PATH, "utf8")) as Record<string, number>;
    return new Map(Object.entries(saved).filter((entry) => Number.isFinite(entry[1])));
  } catch {
    return new Map();
  }
}

function writePowerCache(cache: Map<string, number>) {
  mkdirSync(dirname(POWER_CACHE_PATH), { recursive: true });
  writeFileSync(POWER_CACHE_PATH, JSON.stringify(Object.fromEntries(cache)));
}

function powerFromScryfall(row: { power?: string | null; card_faces?: Array<{ power?: string | null }> }): string | null {
  if (row.power) return row.power;
  return row.card_faces?.find((face) => face.power)?.power ?? null;
}

async function fillMissingPower(cards: PlanCardV1[]): Promise<void> {
  const cache = readPowerCache();
  const missing = cards.filter((card) => /\bcreature\b/i.test(card.typeLine) && card.power <= 0);
  for (const card of missing) {
    const saved = cache.get(card.oracleId);
    if (saved != null && saved > 0) card.power = saved;
  }
  const unresolved = missing.filter((card) => card.power <= 0);
  let wrote = false;
  for (let i = 0; i < unresolved.length; i += 75) {
    const batch = unresolved.slice(i, i + 75);
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const response = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "cards-plan-score/1.0" },
        body: JSON.stringify({ identifiers: batch.map((card) => ({ oracle_id: card.oracleId })) }),
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 2000);
        continue;
      }
      if (!response.ok) break;
      const body = (await response.json()) as {
        data?: Array<{ oracle_id?: string; power?: string | null; card_faces?: Array<{ power?: string | null }> }>;
      };
      const byId = new Map((body.data ?? []).map((row) => [row.oracle_id, powerFromScryfall(row)]));
      for (const card of batch) {
        const raw = byId.get(card.oracleId);
        const n = Number(raw);
        if (raw && Number.isFinite(n) && n > 0) {
          card.power = n;
          cache.set(card.oracleId, n);
          wrote = true;
        }
      }
      break;
    }
    if (i + 75 < unresolved.length) await sleep(250);
  }
  if (wrote) writePowerCache(cache);
}

export type MeasuredConstructedDeckV1 = {
  commander: PlanCardV1;
  cards: PlanCardV1[];
  strategy: ProfessorStrategyV1 | null;
  gaps: string[];
  score: DeckScoreV1;
  played: PlanCheckResultV1 | null;
};

export async function measureConstructedDeck(args: {
  catalog: Catalog;
  deck: SolDirectedConstructedDeckV11;
}): Promise<MeasuredConstructedDeckV1> {
  const commanderRow = args.catalog.byOracleId.get(args.deck.commander.oracleId);
  const commander: PlanCardV1 = commanderRow
    ? toPlanCard(commanderRow, 1)
    : {
        oracleId: args.deck.commander.oracleId,
        name: args.deck.commander.name,
        cmc: args.deck.commander.manaValue ?? 0,
        power: 0,
        typeLine: "Legendary Creature",
        text: args.deck.commander.oracleText ?? "",
        quantity: 1,
      };
  const cards: PlanCardV1[] = [];
  for (const land of args.deck.lands) {
    const row = args.catalog.byNormalizedName.get(normalizeOracleName(land.name))?.[0];
    if (row) cards.push(toPlanCard(row, land.copies));
  }
  for (const card of args.deck.nonlands) {
    const row = args.catalog.byOracleId.get(card.oracleId);
    if (row) cards.push(toPlanCard(row, 1));
  }
  await fillMissingPower([commander, ...cards]);
  const bracket = await measurePlanBracket([commander], cards);
  const requested = await requestProfessorStrategy({ commander, cards });
  const verified = verifyProfessorStrategy({ strategy: requested.strategy, commander, cards });
  if (!verified.accepted || !verified.plan) {
    return {
      commander,
      cards,
      strategy: requested.strategy,
      gaps: verified.gaps,
      played: null,
      score: deckScoreFromPlan({
        bracket,
        accepted: false,
        gap: verified.gaps.join(" "),
      }),
    };
  }
  const played = runPlanChecker({
    cards,
    commanders: [commander],
    plan: verified.plan,
    comboDb: "none",
  });
  return {
    commander,
    cards,
    strategy: requested.strategy,
    gaps: verified.gaps,
    played,
    score: deckScoreFromPlan({
      bracket,
      accepted: true,
      trials: played.trialsDetail,
      requiredNames: requested.strategy.win.requiredCards,
      commanderName: commander.name,
    }),
  };
}

export async function scoreConstructedDeck(args: {
  catalog: Catalog;
  deck: SolDirectedConstructedDeckV11;
}): Promise<DeckScoreV1> {
  const measured = await measureConstructedDeck(args);
  return measured.score;
}

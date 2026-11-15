import type { InventoryItem } from "../types";
import { isPokemonInventoryItem } from "./image-cache-trust";
import {
  pokemonImageLocalId,
  pokemonShelfCatalogName,
  pokemonShelfSetId,
} from "./pokemon-shelf-set";

export type PokemonShelfRules = {
  typeLine?: string;
  oracleText?: string;
  flavorText?: string;
  artist?: string;
  rarity?: string;
};

type PokemonCardJson = {
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  attacks?: Array<{ name?: string; damage?: string; text?: string; cost?: string[] }>;
  abilities?: Array<{ name?: string; text?: string; type?: string }>;
  weaknesses?: Array<{ type?: string; value?: string }>;
  resistances?: Array<{ type?: string; value?: string }>;
  retreatCost?: string[];
  flavorText?: string;
  artist?: string;
  rarity?: string;
  rules?: string[];
};

const TEXT_TIMEOUT_MS = 8_000;

function apiHeaders(): HeadersInit {
  const apiKey = process.env.POKEMON_TCG_API_KEY?.trim();
  return {
    Accept: "application/json",
    ...(apiKey ? { "X-Api-Key": apiKey } : {}),
  };
}

function joinBits(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" ");
}

/** Map one pokemontcg.io card into the fields the detail panel already renders. */
export function formatPokemonShelfText(card: PokemonCardJson): PokemonShelfRules | null {
  const subtypes = (card.subtypes ?? []).map((part) => part.trim()).filter(Boolean);
  const types = (card.types ?? []).map((part) => part.trim()).filter(Boolean);
  const supertype = card.supertype?.trim() || "Pokémon";
  const typeLine = [
    [...subtypes, supertype].join(" "),
    types.length ? types.join(" / ") : "",
    card.hp?.trim() ? `HP ${card.hp.trim()}` : "",
    card.evolvesFrom?.trim() ? `Evolves from ${card.evolvesFrom.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const blocks: string[] = [];
  for (const ability of card.abilities ?? []) {
    const title = [ability.type?.trim() || "Ability", ability.name?.trim()]
      .filter(Boolean)
      .join(": ");
    const body = [title, ability.text?.trim()].filter(Boolean).join("\n");
    if (body) blocks.push(body);
  }
  for (const attack of card.attacks ?? []) {
    const cost = (attack.cost ?? []).map((part) => part.trim()).filter(Boolean).join(", ");
    const title = [attack.name?.trim(), attack.damage?.trim()].filter(Boolean).join(" — ");
    const withCost = cost && title ? `${title} (${cost})` : title || cost;
    const body = [withCost, attack.text?.trim()].filter(Boolean).join("\n");
    if (body) blocks.push(body);
  }
  for (const rule of card.rules ?? []) {
    const text = rule.trim();
    if (text) blocks.push(text);
  }
  const weakness = (card.weaknesses ?? [])
    .map((row) => joinBits([row.type, row.value]))
    .filter(Boolean);
  if (weakness.length) blocks.push(`Weakness: ${weakness.join(", ")}`);
  const resistance = (card.resistances ?? [])
    .map((row) => joinBits([row.type, row.value]))
    .filter(Boolean);
  if (resistance.length) blocks.push(`Resistance: ${resistance.join(", ")}`);
  if (card.retreatCost?.length) blocks.push(`Retreat: ${card.retreatCost.length}`);

  const oracleText = blocks.join("\n\n").trim();
  const flavorText = card.flavorText?.trim() || undefined;
  const artist = card.artist?.trim() || undefined;
  const rarity = card.rarity?.trim() || undefined;
  if (!typeLine && !oracleText && !flavorText) return null;
  return {
    typeLine: typeLine || undefined,
    oracleText: oracleText || undefined,
    flavorText,
    artist,
    rarity,
  };
}

async function fetchPokemonCard(id: string): Promise<PokemonCardJson | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(id)}`,
        { headers: apiHeaders(), signal: AbortSignal.timeout(TEXT_TIMEOUT_MS) },
      );
      if (res.ok) {
        const body = (await res.json()) as { data?: PokemonCardJson };
        return body.data ?? null;
      }
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

async function searchOnePokemonCard(query: string): Promise<PokemonCardJson | null> {
  try {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=5&select=id,name,number,supertype,subtypes,hp,types,evolvesFrom,attacks,abilities,weaknesses,resistances,retreatCost,flavorText,artist,rarity,rules`,
      { headers: apiHeaders(), signal: AbortSignal.timeout(TEXT_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: PokemonCardJson[] };
    const rows = body.data ?? [];
    return rows.length === 1 ? rows[0]! : null;
  } catch {
    return null;
  }
}

function sealedProductText(item: InventoryItem): PokemonShelfRules | null {
  if (pokemonImageLocalId(item.cardNumber)) return null;
  const name = `${item.productName ?? ""} ${item.displayName ?? ""}`;
  if (!/\b(?:deck|booster|elite trainer|collection|bundle|tin|box|blister|upc|etb)\b/i.test(name)) {
    return null;
  }
  return { typeLine: "Sealed product", oracleText: "Unopened product." };
}

/** Attacks, HP, and illustrator for the printing on the shelf. English singles only. */
export async function lookupPokemonShelfRules(
  item: InventoryItem,
): Promise<PokemonShelfRules | null> {
  if (!isPokemonInventoryItem(item)) return null;

  const productName = item.productName || item.displayName;
  const setId = pokemonShelfSetId(item.setName, item.cardNumber, productName);
  const localId = pokemonImageLocalId(item.cardNumber);
  if (setId && localId) {
    const ids = [`${setId}-${localId}`];
    if (/^\d+$/.test(localId)) ids.push(`${setId}-${localId}_A`);
    for (const id of ids) {
      const card = await fetchPokemonCard(id);
      const text = card ? formatPokemonShelfText(card) : null;
      if (text) return text;
    }
  }

  const name = pokemonShelfCatalogName(productName).replace(/"/g, "");
  if (name && localId) {
    const setClause = setId ? ` set.id:${setId}` : "";
    const card = await searchOnePokemonCard(
      `name:"${name}" number:${localId}${setClause}`,
    );
    const text = card ? formatPokemonShelfText(card) : null;
    if (text) return text;
  }

  return sealedProductText(item);
}

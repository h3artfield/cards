import {
  POKEMON_CARD_FILTERS,
  POKEMON_STAGE_FILTERS,
  POKEMON_TRAINER_FILTERS,
  POKEMON_TYPE_FILTERS,
} from "./pokemon-browse-filters";
import { POKEMON_CARD_TRAITS } from "./pokemon-card-traits";
import { pokemonImageLocalId, pokemonShelfSetId } from "./pokemon-shelf-set";

export type PokemonShelfTraits = {
  supertype: string;
  types: string[];
  subtypes: string[];
};

export type PokemonShelfFilter = {
  types: string[];
  cards: string[];
  stages: string[];
  trainers: string[];
};

type ShelfItem = {
  setName?: string | null;
  cardNumber?: string | null;
  productName?: string | null;
};

function unpack(packed: string): PokemonShelfTraits {
  const [supertype, types, subtypes] = packed.split("|");
  return {
    supertype: supertype ?? "",
    types: types ? types.split("+") : [],
    subtypes: subtypes ? subtypes.split("+") : [],
  };
}

export function pokemonTraitsFromCatalogId(cardId: string): PokemonShelfTraits | null {
  const packed = POKEMON_CARD_TRAITS[cardId];
  return packed ? unpack(packed) : null;
}

/** English catalog traits for one shelf row. Pokémon Japan is a different game and must not use this. */
export function pokemonShelfTraits(item: ShelfItem): PokemonShelfTraits | null {
  const setId = pokemonShelfSetId(
    item.setName ?? undefined,
    item.cardNumber ?? undefined,
    item.productName ?? undefined,
  );
  const localId = pokemonImageLocalId(item.cardNumber ?? undefined);
  if (!setId || !localId) return null;
  return (
    pokemonTraitsFromCatalogId(`${setId}-${localId}`) ??
    pokemonTraitsFromCatalogId(`${setId}-${localId}_A`)
  );
}

function catalogValues(ids: string[], chips: readonly { id: string; catalog: string }[]): string[] {
  const byId = new Map(chips.map((chip) => [chip.id, chip.catalog]));
  return ids.map((id) => byId.get(id)).filter((value): value is string => Boolean(value));
}

export function pokemonShelfFilterActive(filter: PokemonShelfFilter): boolean {
  return (
    filter.types.length > 0 ||
    filter.cards.length > 0 ||
    filter.stages.length > 0 ||
    filter.trainers.length > 0
  );
}

/**
 * OR inside a group, AND across groups.
 * A printing we cannot place in the English catalog drops out only while a filter is on.
 * Stage applies to Pokémon. Trainer kind applies to Trainers.
 */
export function matchesPokemonShelfFilters(item: ShelfItem, filter: PokemonShelfFilter): boolean {
  if (!pokemonShelfFilterActive(filter)) return true;
  const traits = pokemonShelfTraits(item);
  if (!traits) return false;

  const types = catalogValues(filter.types, POKEMON_TYPE_FILTERS);
  if (filter.types.length > 0 && !types.some((type) => traits.types.includes(type))) return false;

  const cards = catalogValues(filter.cards, POKEMON_CARD_FILTERS);
  if (filter.cards.length > 0 && !cards.includes(traits.supertype)) return false;

  const stages = catalogValues(filter.stages, POKEMON_STAGE_FILTERS);
  if (filter.stages.length > 0) {
    if (traits.supertype !== "Pokémon") return false;
    if (!stages.some((stage) => traits.subtypes.includes(stage))) return false;
  }

  const trainers = catalogValues(filter.trainers, POKEMON_TRAINER_FILTERS);
  if (filter.trainers.length > 0) {
    if (traits.supertype !== "Trainer") return false;
    if (!trainers.some((kind) => traits.subtypes.includes(kind))) return false;
  }

  return true;
}

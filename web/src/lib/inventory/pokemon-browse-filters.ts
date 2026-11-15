/** English Pokémon browse chips. Ids stay ASCII so they can travel in the query string. */

export type PokemonBrowseChip = {
  id: string;
  label: string;
  catalog: string;
  color?: string;
};

export const POKEMON_TYPE_FILTERS: readonly PokemonBrowseChip[] = [
  { id: "grass", label: "Grass", catalog: "Grass", color: "#3d9a4a" },
  { id: "fire", label: "Fire", catalog: "Fire", color: "#ee8130" },
  { id: "water", label: "Water", catalog: "Water", color: "#6390f0" },
  { id: "lightning", label: "Lightning", catalog: "Lightning", color: "#e3c000" },
  { id: "psychic", label: "Psychic", catalog: "Psychic", color: "#f95587" },
  { id: "fighting", label: "Fighting", catalog: "Fighting", color: "#c22e28" },
  { id: "darkness", label: "Darkness", catalog: "Darkness", color: "#705746" },
  { id: "metal", label: "Metal", catalog: "Metal", color: "#b7b7ce" },
  { id: "dragon", label: "Dragon", catalog: "Dragon", color: "#6f35fc" },
  { id: "fairy", label: "Fairy", catalog: "Fairy", color: "#d685ad" },
  { id: "colorless", label: "Colorless", catalog: "Colorless", color: "#a8a77a" },
];

export const POKEMON_CARD_FILTERS: readonly PokemonBrowseChip[] = [
  { id: "pokemon", label: "Pokémon", catalog: "Pokémon" },
  { id: "trainer", label: "Trainer", catalog: "Trainer" },
  { id: "energy", label: "Energy", catalog: "Energy" },
];

export const POKEMON_STAGE_FILTERS: readonly PokemonBrowseChip[] = [
  { id: "basic", label: "Basic", catalog: "Basic" },
  { id: "stage1", label: "Stage 1", catalog: "Stage 1" },
  { id: "stage2", label: "Stage 2", catalog: "Stage 2" },
];

export const POKEMON_TRAINER_FILTERS: readonly PokemonBrowseChip[] = [
  { id: "supporter", label: "Supporter", catalog: "Supporter" },
  { id: "item", label: "Item", catalog: "Item" },
  { id: "stadium", label: "Stadium", catalog: "Stadium" },
  { id: "tool", label: "Tool", catalog: "Pokémon Tool" },
];

const ALLOWED: Record<"type" | "card" | "stage" | "trainer", ReadonlySet<string>> = {
  type: new Set(POKEMON_TYPE_FILTERS.map((chip) => chip.id)),
  card: new Set(POKEMON_CARD_FILTERS.map((chip) => chip.id)),
  stage: new Set(POKEMON_STAGE_FILTERS.map((chip) => chip.id)),
  trainer: new Set(POKEMON_TRAINER_FILTERS.map((chip) => chip.id)),
};

export function parsePokemonFilterIds(
  raw: string | null,
  kind: keyof typeof ALLOWED,
): string[] {
  if (!raw) return [];
  const allowed = ALLOWED[kind];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (allowed.has(id)) seen.add(id);
  }
  return [...seen];
}

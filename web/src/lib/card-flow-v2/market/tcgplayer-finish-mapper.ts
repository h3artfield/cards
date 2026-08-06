/** Maps V2 identity finish → Pokémon TCG API / TCGplayer price tier keys. */
const FINISH_TO_TCGPLAYER_KEYS: Record<string, string[]> = {
  reverse_holo: ["reverseHolofoil"],
  reverse_holofoil: ["reverseHolofoil"],
  reverseholofoil: ["reverseHolofoil"],
  normal: ["normal"],
  holofoil: ["holofoil"],
  holo: ["holofoil"],
  foil: ["holofoil"],
  nonfoil: ["normal"],
  "1st_edition_holo": ["1stEditionHolofoil"],
  "1st_edition_normal": ["1stEditionNormal"],
};

export function finishToTcgplayerVariantKeys(finish?: string): string[] {
  if (!finish?.trim()) return [];
  const key = finish.trim().toLowerCase().replace(/\s+/g, "_");
  if (FINISH_TO_TCGPLAYER_KEYS[key]) return FINISH_TO_TCGPLAYER_KEYS[key];
  if (key.includes("reverse")) return ["reverseHolofoil"];
  if (key.includes("normal") || key === "nonfoil") return ["normal"];
  if (key.includes("foil") || key.includes("holo")) return ["holofoil"];
  return [];
}

export function tcgplayerVariantMatchesFinish(
  finish: string | undefined,
  variantKey: string,
): boolean {
  const keys = finishToTcgplayerVariantKeys(finish);
  if (!keys.length) return true;
  return keys.includes(variantKey);
}

export function describeTcgplayerFinishRequested(finish?: string): string | undefined {
  if (!finish) return undefined;
  const keys = finishToTcgplayerVariantKeys(finish);
  if (!keys.length) return finish;
  return `${finish} → ${keys.join(", ")}`;
}

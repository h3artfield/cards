import type { GatheringCard } from "@/components/store-inventory/clerk-gathering";

export type GatheringDeckBuildPrefill = {
  commanderName?: string;
  deckPreferences: string;
  cardNames: string[];
};

function isLikelyCommander(card: GatheringCard): boolean {
  if (card.isCommander) return true;
  const typeLine = (card as GatheringCard & { typeLine?: string }).typeLine ?? "";
  return /legendary/i.test(typeLine) && /creature|planeswalker/i.test(typeLine);
}

export function buildGatheringDeckPrefill(cards: GatheringCard[]): GatheringDeckBuildPrefill {
  const uniqueByName = new Map<string, GatheringCard>();
  for (const card of cards) {
    const key = card.name.trim().toLowerCase();
    if (!uniqueByName.has(key)) uniqueByName.set(key, card);
  }

  const commanders = [...uniqueByName.values()].filter(isLikelyCommander);
  const commander = commanders[0] ?? null;

  const requiredNames = [...uniqueByName.values()]
    .map((c) => c.name.trim())
    .filter((name) => !commander || name.toLowerCase() !== commander.name.trim().toLowerCase());

  const deckPreferences =
    requiredNames.length > 0
      ? `Deck must contain these cards: ${requiredNames.join(", ")}`
      : "";

  return {
    commanderName: commander?.name.trim() || undefined,
    deckPreferences,
    cardNames: [...uniqueByName.values()].map((c) => c.name.trim()),
  };
}

export const PROFESSOR_SETUP_PREFILL_STORAGE_KEY = (slug: string) =>
  `professor-setup-prefill-${slug}`;

export function saveProfessorSetupPrefill(
  slug: string,
  prefill: GatheringDeckBuildPrefill,
): void {
  sessionStorage.setItem(
    PROFESSOR_SETUP_PREFILL_STORAGE_KEY(slug),
    JSON.stringify(prefill),
  );
}

export function readProfessorSetupPrefill(slug: string): GatheringDeckBuildPrefill | null {
  const raw = sessionStorage.getItem(PROFESSOR_SETUP_PREFILL_STORAGE_KEY(slug));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GatheringDeckBuildPrefill;
  } catch {
    return null;
  }
}

export function clearProfessorSetupPrefill(slug: string): void {
  sessionStorage.removeItem(PROFESSOR_SETUP_PREFILL_STORAGE_KEY(slug));
}

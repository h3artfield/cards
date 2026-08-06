import type { ScannedCard, VisionResult } from "../types";
import { enrichSportsCardIdentity } from "./enrich-sports-vision";
import { normalizeSportsVisionFields } from "./pricing/sports-search-queries";

/** Player label for sports cards — never a sentence fragment. */
export function sportsDisplayName(vision: VisionResult): string {
  const player = vision.playerName?.trim();
  if (player && !looksLikeBadSportsName(player)) return player;

  const cardName = vision.cardName?.trim();
  if (cardName && !looksLikeBadSportsName(cardName)) return cardName;

  return player ?? cardName ?? "";
}

export function looksLikeBadSportsName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length > 60) return true;
  if (/^(a|an|the)\s+/i.test(n)) return true;
  if (/\b(quarterback|running back|pitcher|for the)\b/i.test(n)) return true;
  return false;
}

/** Sync enriched sports vision onto card top-level fields used by identity + pricing. */
export function applySportsVisionToCard(
  card: ScannedCard,
  vision: VisionResult,
): ScannedCard {
  const displayName = sportsDisplayName(vision);
  const cardName = displayName || vision.cardName;

  return {
    ...card,
    category: vision.category,
    detectedName: displayName || card.detectedName,
    playerName: vision.playerName ?? card.playerName,
    brand: vision.brand ?? card.brand,
    setName: vision.setName ?? card.setName,
    year: vision.year ?? card.year,
    cardNumber: vision.cardNumber ?? card.cardNumber,
    team: vision.team ?? card.team,
    visionJson: {
      ...vision,
      playerName: vision.playerName ?? displayName,
      cardName: cardName ?? displayName,
    } as unknown as Record<string, unknown>,
  };
}

/** Re-read photos and persist year, set, card # before identity verification or pricing. */
export async function prepareSportsCardForAnalysis(
  card: ScannedCard,
): Promise<ScannedCard> {
  const vision = card.visionJson as VisionResult | undefined;
  if (!vision || vision.category !== "sports") return card;

  const enriched = normalizeSportsVisionFields(
    await enrichSportsCardIdentity(vision, {
      frontImageUrl: card.frontImageUrl,
      backImageUrl: card.backImageUrl,
    }),
  );

  return applySportsVisionToCard(card, enriched);
}

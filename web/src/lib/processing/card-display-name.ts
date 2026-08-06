import type { ScannedCard, VisionResult } from "../types";
import {
  looksLikeBadSportsName,
  sportsDisplayName,
} from "./sports-card-fields";
import {
  parseCardNameFromIdentitySummary,
} from "./identity-summary-parse";

function isSportsCard(card: ScannedCard, vision?: VisionResult): boolean {
  return (
    card.category === "sports" || vision?.category === "sports"
  );
}

/** Extract a player name from identity verification prose. */
function playerNameFromIdentitySummary(summary: string): string | null {
  const featuring = summary.match(
    /\bfeaturing\s+([A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){0,3})\b/,
  );
  if (featuring?.[1] && !looksLikeBadSportsName(featuring[1])) {
    return featuring[1].trim();
  }

  const confirmed = summary.match(
    /\b(?:confirmed as|identified as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){0,3})\b/,
  );
  if (confirmed?.[1] && !looksLikeBadSportsName(confirmed[1])) {
    return confirmed[1].trim();
  }

  return null;
}

/** Best available display name for a scanned card. */
export function cardDisplayName(card: ScannedCard): string {
  const vision = card.visionJson as VisionResult | undefined;

  if (isSportsCard(card, vision)) {
    if (card.playerName?.trim() && !looksLikeBadSportsName(card.playerName)) {
      return card.playerName.trim();
    }
    const fromVision = sportsDisplayName(vision ?? ({} as VisionResult));
    if (fromVision) return fromVision;
  }

  if (card.detectedName?.trim() && !looksLikeBadSportsName(card.detectedName)) {
    return card.detectedName.trim();
  }

  if (vision?.cardName?.trim() && !looksLikeBadSportsName(vision.cardName)) {
    return vision.cardName.trim();
  }

  const raw = (card.pricingJson as { raw?: Record<string, unknown> } | undefined)
    ?.raw;
  if (raw) {
    const productName = raw["product-name"];
    if (productName && String(productName).trim()) {
      return String(productName).trim();
    }
    if (raw.name && String(raw.name).trim()) return String(raw.name).trim();
  }

  const fromSummary = playerNameFromIdentitySummary(
    card.identityVerification?.summary ?? "",
  );
  if (fromSummary) return fromSummary;

  const fromCardSummary = parseCardNameFromIdentitySummary(
    card.identityVerification?.summary ?? "",
  );
  if (fromCardSummary) return fromCardSummary;

  return "Unidentified";
}

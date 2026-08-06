import type { CardCandidateBundle } from "../card-flow-v2/types";
import type { ScannedCard } from "../types";
import { getStaffSelectedSuspect } from "../card-flow-v2/staff-suspect-selection";
import {
  buildIdentityKey,
  identityKeyFromLocked,
  identityKeyFromSuspect,
} from "./identity-key";
import type { CardPriceSnapshotCategory } from "./types";

export function resolveCardPriceIdentityKey(input: {
  card: ScannedCard;
  identity?: CardCandidateBundle;
}): { identityKey: string | null; cardName?: string; reason?: string } {
  const idn = input.identity ?? input.card.cardFlowV2Identity;
  if (!idn) {
    return { identityKey: null, reason: "no_identity_bundle" };
  }

  if (idn.lockedIdentity?.locked) {
    const key = identityKeyFromLocked(idn.lockedIdentity);
    return {
      identityKey: key,
      cardName:
        idn.lockedIdentity.canonicalName ??
        idn.lockedIdentity.marketProductName,
      reason: key ? "locked_identity" : "locked_identity_incomplete",
    };
  }

  const suspect = getStaffSelectedSuspect(idn) ?? idn.suspects[0];
  if (suspect) {
    const key = identityKeyFromSuspect(suspect);
    return {
      identityKey: key,
      cardName: suspect.canonicalName ?? suspect.label,
      reason: key ? "staff_or_primary_suspect" : "suspect_identity_incomplete",
    };
  }

  const cat = (input.card.category ?? idn.category) as CardPriceSnapshotCategory;
  const key = buildIdentityKey({
    category: cat,
    setName: input.card.setName,
    collectorNumber: input.card.cardNumber,
    cardName: input.card.detectedName ?? input.card.playerName,
  });

  return {
    identityKey: key,
    cardName: input.card.detectedName ?? input.card.playerName,
    reason: key ? "card_fields_fallback" : "card_fields_incomplete",
  };
}

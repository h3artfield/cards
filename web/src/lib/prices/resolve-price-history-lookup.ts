import type { CardCandidateBundle, LockedCardIdentity } from "../card-flow-v2/types";
import type { ScannedCard } from "../types";
import { getStaffSelectedSuspect } from "../card-flow-v2/staff-suspect-selection";
import { resolveCardPriceIdentityKey } from "./resolve-card-price-identity";
import {
  resolvePriceHistoryLookupKeys,
  type PriceHistoryEmptyReason,
} from "./price-identity-aliases";

export function resolveCardPriceHistoryLookup(input: {
  card: ScannedCard;
  identity?: CardCandidateBundle;
}): {
  requestedIdentityKey: string | null;
  lookupKeys: string[];
  cardName?: string;
  identityReason?: string;
  locked?: LockedCardIdentity;
} {
  const resolved = resolveCardPriceIdentityKey(input);
  const idn = input.identity ?? input.card.cardFlowV2Identity;
  const locked = idn?.lockedIdentity?.locked ? idn.lockedIdentity : undefined;
  const suspect = idn ? (getStaffSelectedSuspect(idn) ?? idn.suspects?.[0]) : undefined;

  const lookupKeys = resolvePriceHistoryLookupKeys({
    identityKey: resolved.identityKey,
    category: (locked?.category ?? suspect?.category ?? input.card.category) as
      | "pokemon"
      | "mtg"
      | "yugioh"
      | "onepiece"
      | undefined,
    setCode: locked?.setCode ?? suspect?.setCode,
    setName: locked?.setName ?? suspect?.setName ?? input.card.setName,
    collectorNumber:
      locked?.collectorNumber ??
      suspect?.collectorNumber ??
      suspect?.cardNumber ??
      input.card.cardNumber,
    finish: locked?.finish ?? suspect?.finish,
    language: locked?.language ?? suspect?.language,
  });

  return {
    requestedIdentityKey: resolved.identityKey,
    lookupKeys,
    cardName: resolved.cardName,
    identityReason: resolved.reason,
    locked,
  };
}

export type { PriceHistoryEmptyReason };

import type { ScannedCard, StoreRule, StoreSettings } from "../../types";
import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "../types";
import type { CardFlowV2MarketBundle } from "../market/types";
import { isCardFlowV2OfferPreviewEnabled } from "../feature-flag";
import { effectiveCardCondition } from "../../processing/apply-market-pricing";
import { buildMarketValueDecision } from "./market-value-decision";
import { buildV2OfferPreview } from "./v2-offer-preview";
import type { V2OfferPreview } from "./types";

export function computeCardOfferPreviewV2(input: {
  card: ScannedCard;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  evidence?: CardFlowV2EvidenceBundle;
  settings: StoreSettings;
  rules: StoreRule[];
}): V2OfferPreview {
  const vision = input.card.visionJson as import("../../types").VisionResult | undefined;
  const condition = effectiveCardCondition(input.card, vision);

  const decision = buildMarketValueDecision({
    identity: input.identity ?? input.card.cardFlowV2Identity,
    market: input.market ?? input.card.cardFlowV2Market,
    evidence: input.evidence ?? input.card.cardFlowV2Evidence,
    itemType: input.card.itemType,
    condition,
  });

  return buildV2OfferPreview({
    card: input.card,
    decision,
    settings: input.settings,
    rules: input.rules,
    identity: input.identity ?? input.card.cardFlowV2Identity,
    market: input.market ?? input.card.cardFlowV2Market,
    evidence: input.evidence ?? input.card.cardFlowV2Evidence,
  });
}

export function runCardOfferPreviewV2(input: {
  card: ScannedCard;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  evidence?: CardFlowV2EvidenceBundle;
  settings: StoreSettings;
  rules: StoreRule[];
}): V2OfferPreview | undefined {
  if (!isCardFlowV2OfferPreviewEnabled()) {
    return undefined;
  }

  return computeCardOfferPreviewV2(input);
}

export function canRunCardOfferPreviewV2(): boolean {
  return isCardFlowV2OfferPreviewEnabled();
}

/** Observational V2 evidence extraction — does not change offers or statuses. */
export function isCardFlowV2EvidenceEnabled(): boolean {
  return process.env.CARD_FLOW_V2_EVIDENCE_ENABLED === "true";
}

/** Phase 2 identity candidates + lock gate — observational only. */
export function isCardFlowV2IdentityEnabled(): boolean {
  return process.env.CARD_FLOW_V2_IDENTITY_ENABLED === "true";
}

/** Phase 3 shadow market — requires evidence + identity flags. */
export function isCardFlowV2MarketEnabled(): boolean {
  return (
    process.env.CARD_FLOW_V2_MARKET_ENABLED === "true" &&
    isCardFlowV2EvidenceEnabled() &&
    isCardFlowV2IdentityEnabled()
  );
}

export function getCardFlowV2MarketMaxSuspects(): number {
  const n = parseInt(process.env.CARD_FLOW_V2_MARKET_MAX_SUSPECTS ?? "3", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 6) : 3;
}

export function isCardFlowV2MarketEnableEbay(): boolean {
  return process.env.CARD_FLOW_V2_MARKET_ENABLE_EBAY !== "false";
}

export function isCardFlowV2MarketEnablePriceCharting(): boolean {
  return process.env.CARD_FLOW_V2_MARKET_ENABLE_PRICECHARTING !== "false";
}

export function isCardFlowV2MarketEnableTcgplayer(): boolean {
  return process.env.CARD_FLOW_V2_MARKET_ENABLE_TCGPLAYER !== "false";
}

/** Phase 4 shadow audit — requires evidence + identity + market flags. */
export function isCardFlowV2AuditEnabled(): boolean {
  return (
    process.env.CARD_FLOW_V2_AUDIT_ENABLED === "true" &&
    isCardFlowV2EvidenceEnabled() &&
    isCardFlowV2IdentityEnabled() &&
    isCardFlowV2MarketEnabled()
  );
}

/** Directive 005 — staff suspect confirmation + snapshot promotion (shadow only). */
export function isCardFlowV2StaffConfirmationEnabled(): boolean {
  return (
    process.env.CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED === "true" &&
    isCardFlowV2IdentityEnabled() &&
    isCardFlowV2MarketEnabled()
  );
}

/** Directive 006 — shadow offer preview only; never writes production offers. */
export function isCardFlowV2OfferPreviewEnabled(): boolean {
  return (
    process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED === "true" &&
    isCardFlowV2AuditEnabled()
  );
}

/** Directive 007 — V2 preview may write production market/cash/trade when guarded policy allows. */
export function isCardFlowV2OfferInfluenceEnabled(): boolean {
  return (
    process.env.CARD_FLOW_V2_OFFER_INFLUENCE === "true" &&
    isCardFlowV2OfferPreviewEnabled()
  );
}

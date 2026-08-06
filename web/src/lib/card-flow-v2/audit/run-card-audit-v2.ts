import type { ScannedCard } from "../../types";
import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "../types";
import type { CardFlowV2MarketBundle } from "../market/types";
import { buildCardFlowV2AuditRecord } from "./audit-record";
import type { CardFlowV2AuditRecord, V2StaffCorrection } from "./types";

export function runCardAuditV2(input: {
  card: ScannedCard;
  evidence?: CardFlowV2EvidenceBundle;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
}): CardFlowV2AuditRecord {
  return buildCardFlowV2AuditRecord({
    card: input.card,
    evidence: input.evidence ?? input.card.cardFlowV2Evidence,
    identity: input.identity ?? input.card.cardFlowV2Identity,
    market: input.market ?? input.card.cardFlowV2Market,
    existingStaffCorrection: input.card.cardFlowV2Audit?.staffCorrection,
  });
}

export function applyStaffCorrection(
  audit: CardFlowV2AuditRecord,
  correction: V2StaffCorrection,
): CardFlowV2AuditRecord {
  return {
    ...audit,
    staffCorrection: {
      ...correction,
      reviewedAt: correction.reviewedAt ?? new Date().toISOString(),
    },
  };
}

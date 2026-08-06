import type { ScannedCard } from "../types";
import type { MtgListMarkInspection, LockedCardIdentity } from "./types";
import type { ProductionFieldSnapshot } from "./shadow-v2-reprocess";
import { snapshotProductionFields } from "./shadow-v2-reprocess";

export type V2ReprocessSummary = {
  cardName?: string;
  cardId: string;
  evidenceSlots: Array<{
    field: string;
    value?: string;
    status?: string;
    note?: string;
  }>;
  mtgListMarkInspection?: MtgListMarkInspection;
  topSuspects: Array<{ suspectId: string; label: string }>;
  topSuspectScores: Array<{
    suspectId: string;
    score: number;
    reasoning?: string;
  }>;
  lockedIdentity?: LockedCardIdentity;
  listRelatedNotes: string[];
  productionUnchanged: boolean;
  productionBefore: ProductionFieldSnapshot;
  productionAfter: ProductionFieldSnapshot;
};

const EVIDENCE_SLOT_FIELDS = new Set([
  "set_code",
  "collector_number",
  "the_list_mark",
]);

export function buildV2ReprocessSummary(
  card: ScannedCard,
  productionBefore: ProductionFieldSnapshot,
): V2ReprocessSummary {
  const identity = card.cardFlowV2Identity;
  const slots =
    card.cardFlowV2Evidence?.imageEvidence?.evidenceSlots
      ?.filter((s) => EVIDENCE_SLOT_FIELDS.has(s.field))
      .map((s) => ({
        field: s.field,
        value: s.value ?? undefined,
        status: s.status,
        note: s.note,
      })) ?? [];

  const productionAfter = snapshotProductionFields(card);
  const productionUnchanged =
    productionBefore.marketPrice === productionAfter.marketPrice &&
    productionBefore.cashOffer === productionAfter.cashOffer &&
    productionBefore.tradeOffer === productionAfter.tradeOffer &&
    productionBefore.status === productionAfter.status;

  const listRelatedNotes =
    identity?.candidateGenerationNotes?.filter((n) =>
      /list|plst|origin|trap|fork|the_list/i.test(n),
    ) ?? [];

  return {
    cardName: card.detectedName,
    cardId: card.id,
    evidenceSlots: slots,
    mtgListMarkInspection: identity?.mtgListMarkInspection,
    topSuspects:
      identity?.suspects?.slice(0, 5).map((s) => ({
        suspectId: s.suspectId,
        label: s.label,
      })) ?? [],
    topSuspectScores:
      identity?.suspectAssessments?.slice(0, 5).map((a) => ({
        suspectId: a.suspectId,
        score: a.matchScore,
        reasoning: a.reasoning?.slice(0, 200),
      })) ?? [],
    lockedIdentity: identity?.lockedIdentity,
    listRelatedNotes,
    productionUnchanged,
    productionBefore,
    productionAfter,
  };
}

/** Merge only V2 shadow bundles — production offer fields stay on `original`. */
export function mergeV2ShadowBundlesOnly(
  original: ScannedCard,
  refreshed: ScannedCard,
): ScannedCard {
  return {
    ...original,
    cardFlowV2VersionMetadata: refreshed.cardFlowV2VersionMetadata,
    cardFlowV2Evidence: refreshed.cardFlowV2Evidence,
    cardFlowV2Identity: refreshed.cardFlowV2Identity,
    cardFlowV2Market: refreshed.cardFlowV2Market,
    cardFlowV2Audit: refreshed.cardFlowV2Audit,
    cardFlowV2OfferPreview: refreshed.cardFlowV2OfferPreview,
  };
}

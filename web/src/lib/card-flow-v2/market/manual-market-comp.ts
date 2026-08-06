import { v4 as uuidv4 } from "uuid";
import type { CompMatchAssessment, RawMarketComp } from "./types";

export type ManualMarketCompSource =
  | "ebay_sold_manual"
  | "tcgplayer_manual"
  | "pricecharting_manual"
  | "other";

export type ManualMarketComp = {
  id: string;
  suspectId?: string;
  source: ManualMarketCompSource;
  url?: string;
  title: string;
  soldPrice: number;
  shipping?: number;
  soldDate?: string;
  condition?: string;
  gradeCompany?: string;
  grade?: string;
  accepted: boolean;
  rejectionReason?: string;
  reviewedBy: string;
  reviewedAt: string;
  notes?: string;
};

export function createManualMarketComp(
  input: Omit<ManualMarketComp, "id" | "reviewedAt"> & { reviewedAt?: string },
): ManualMarketComp {
  return {
    ...input,
    id: uuidv4(),
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
  };
}

export function manualCompToRawComp(comp: ManualMarketComp): RawMarketComp {
  const total =
    comp.shipping != null ? comp.soldPrice + comp.shipping : comp.soldPrice;
  return {
    source: "manual",
    title: comp.title,
    price: comp.soldPrice,
    shipping: comp.shipping,
    totalPrice: total,
    soldDate: comp.soldDate,
    conditionText: comp.condition,
    url: comp.url,
    queryUsed: `manual:${comp.source}`,
    rawData: {
      humanReviewed: true,
      manualCompId: comp.id,
      manualSource: comp.source,
      gradeCompany: comp.gradeCompany,
      grade: comp.grade,
      reviewedBy: comp.reviewedBy,
      reviewedAt: comp.reviewedAt,
      notes: comp.notes,
    },
  };
}

export function manualCompToAssessment(
  comp: ManualMarketComp,
): CompMatchAssessment {
  const raw = manualCompToRawComp(comp);
  if (comp.accepted) {
    return {
      comp: raw,
      status: "accepted",
      matchScore: 0.95,
      acceptedReasons: ["human_reviewed_manual_comp"],
      rejectionReasons: [],
      notes: [
        "human-reviewed",
        comp.notes ?? `Reviewed by ${comp.reviewedBy}`,
      ].filter(Boolean),
    };
  }
  return {
    comp: raw,
    status: "rejected",
    matchScore: 0,
    acceptedReasons: [],
    rejectionReasons: ["unknown"],
    notes: [
      "human-reviewed — rejected",
      comp.rejectionReason ?? "Staff rejected this comp",
    ],
  };
}

export function filterManualCompsForSuspect(
  comps: ManualMarketComp[] | undefined,
  suspectId?: string,
): ManualMarketComp[] {
  if (!comps?.length) return [];
  if (!suspectId) return comps;
  return comps.filter((c) => !c.suspectId || c.suspectId === suspectId);
}

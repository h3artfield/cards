import type { CardFlowV2AuditRecord } from "./types";
import type { PriceChartingMappingAudit } from "../market/source-health-types";

export type ProductionPriceWarning = {
  title: string;
  detail: string;
  footer: string;
};

export function hasProductionPriceWarning(audit?: CardFlowV2AuditRecord): boolean {
  return Boolean(audit?.issues.includes("v1_possible_wrong_pricecharting_mapping"));
}

export function buildProductionPriceWarning(input: {
  audit: CardFlowV2AuditRecord;
  priceChartingMapping?: PriceChartingMappingAudit;
}): ProductionPriceWarning | null {
  if (!hasProductionPriceWarning(input.audit)) return null;

  const mismatch = input.priceChartingMapping?.identityMismatch;
  let detail =
    "V2 rejected the market source that appears to support the production price.";
  if (mismatch) {
    const expected = [
      mismatch.expectedSetCode,
      mismatch.expectedCollectorNumber
        ? `#${mismatch.expectedCollectorNumber}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    detail = `V2 rejected the market source that appears to support the production price: expected ${expected || "confirmed print"}, got ${mismatch.priceChartingTitle}.`;
  }

  return {
    title: "Production price may be wrong.",
    detail,
    footer:
      "Production offer was not changed automatically. Staff review recommended.",
  };
}

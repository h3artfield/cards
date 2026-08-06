"use client";

import type { CardFlowV2AuditRecord } from "@/lib/card-flow-v2/audit/types";
import type { PriceChartingMappingAudit } from "@/lib/card-flow-v2/market/source-health-types";
import { buildProductionPriceWarning } from "@/lib/card-flow-v2/audit/production-price-warning";

export function CardFlowV2ProductionPriceWarningBanner({
  audit,
  priceChartingMapping,
}: {
  audit?: CardFlowV2AuditRecord;
  priceChartingMapping?: PriceChartingMappingAudit;
}) {
  if (!audit) return null;

  const warning = buildProductionPriceWarning({ audit, priceChartingMapping });
  if (!warning) return null;

  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
    >
      <p className="font-semibold">{warning.title}</p>
      <p className="mt-1">{warning.detail}</p>
      <p className="mt-2 text-xs font-medium text-red-800">{warning.footer}</p>
    </div>
  );
}

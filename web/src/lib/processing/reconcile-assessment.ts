import type { ScannedCard, StoreRule, StoreSettings, VisionResult } from "../types";
import { applyStoreRules } from "./rules-engine";
import { needsManualReview } from "./condition-ladder";

/** Align warnings with OpenCV subgrades and re-check store rules after full analysis. */
export function reconcileCardAssessment(
  card: ScannedCard,
  rules: StoreRule[],
  settings: StoreSettings,
  pricingEstimated?: boolean,
): Pick<ScannedCard, "warnings" | "ruleMatches" | "status"> {
  const vision = card.visionJson as VisionResult | undefined;
  if (!vision) {
    return {
      warnings: card.warnings ?? [],
      ruleMatches: card.ruleMatches ?? [],
      status: card.status,
    };
  }

  const warnings: string[] = [];
  const marketPrice = card.marketPrice ?? 0;
  const pricingSource = (card.pricingJson as { source?: string } | undefined)?.source;
  if (vision.confidence < 0.6) warnings.push("Low identification confidence");
  if (pricingSource === "vision_estimate" && marketPrice > 0) {
    warnings.push("AI market estimate from photos — verify on eBay before offer");
  } else if (pricingEstimated && marketPrice <= 0) {
    warnings.push("No market comp found — verify price before making an offer");
  }

  const report = card.conditionReport;
  const visionDamage = vision.visibleDamage?.trim();
  const cvEdges = report?.serviceAvailable ? report.edges : undefined;
  const cvCorners = report?.serviceAvailable ? report.corners : undefined;
  const cvSaysClean =
    cvEdges != null && cvCorners != null && cvEdges >= 8.5 && cvCorners >= 8.5;

  if (visionDamage) {
    if (cvSaysClean) {
      warnings.push(
        `Vision noted: ${visionDamage} (OpenCV edges/corners ${cvCorners.toFixed(1)}/${cvEdges.toFixed(1)} — verify in hand)`,
      );
    } else if (report?.serviceAvailable) {
      warnings.push(`Damage (vision): ${visionDamage}`);
    } else {
      warnings.push(`Damage: ${visionDamage}`);
    }
  }

  const ruleResult = applyStoreRules(rules, vision, marketPrice);
  warnings.push(...ruleResult.notes);

  let status: ScannedCard["status"] = card.status;
  if (ruleResult.doNotBuy) {
    status = "do_not_buy";
    warnings.push("Store policy: do not buy");
  } else if (
    ruleResult.manualReview ||
    needsManualReview(
      vision,
      marketPrice,
      settings,
      Boolean(pricingEstimated && marketPrice <= 0),
    )
  ) {
    if (status !== "do_not_buy") status = "manual_review";
    const ruleNote = ruleResult.matchedRules.length
      ? `Flagged for manual review (${ruleResult.matchedRules.join(", ")})`
      : "Flagged for manual review";
    if (!warnings.some((w) => w.includes("manual review"))) {
      warnings.push(ruleNote);
    }
  }

  if (card.identityVerification?.verdict === "mismatch") {
    if (
      !card.identityVerification.correctedMatch &&
      card.identityVerification.matchScore < 0.55
    ) {
      warnings.push("Identity mismatch — manual review required");
      status = "manual_review";
    }
  }

  return {
    warnings: [...new Set(warnings)],
    ruleMatches: ruleResult.matchedRules,
    status,
  };
}

"use client";

import type { ScannedCard, VisionResult } from "@/lib/types";
import type { CardCandidateBundle } from "@/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle } from "@/lib/card-flow-v2/market/types";
import { buildMarketResearchAssist } from "@/lib/card-flow-v2/market/market-research-queries";
import { getPrimarySnapshotWithManualComps } from "@/lib/card-flow-v2/market/manual-comp-snapshot";
import { getStaffSelectedSuspect } from "@/lib/card-flow-v2/staff-suspect-selection";
import { cardDisplayName } from "@/lib/processing/card-display-name";
import { primaryCompSearchQuery } from "@/lib/processing/pricing/build-search-query";
import {
  normalizeSportsVisionFields,
  sportsMarketplaceSearchUrls,
} from "@/lib/processing/pricing/sports-search-queries";
import { visionForPricing, isVisionGradedSlab } from "@/lib/processing/slab-pricing";
import { normalizeVisionCardNumber } from "@/lib/processing/pokemon-utils";

function legacyListingUrls(query: string) {
  const q = query.trim() || "trading card";
  const encoded = encodeURIComponent(q);
  return {
    ebayActive: `https://www.ebay.com/sch/i.html?_nkw=${encoded}`,
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Sold=1&LH_Complete=1`,
    google: `https://www.google.com/search?q=${encodeURIComponent(`${q} price`)}`,
  };
}

function LinkItem({ href, label }: { href?: string; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-indigo-700 hover:underline"
    >
      {label}
    </a>
  );
}

/** Marketplace links — V2 cards use exact MRA search URLs; legacy cards use vision-based queries. */
export function SportsMarketplaceLinks({
  card,
  identity,
  market,
}: {
  card: ScannedCard;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
}) {
  const idn = identity ?? card.cardFlowV2Identity;
  const suspect =
    (idn ? getStaffSelectedSuspect(idn) : undefined) ?? idn?.suspects[0];
  const suspectId =
    suspect?.suspectId ??
    market?.selectedSuspectId ??
    idn?.staffSelection?.suspectId;

  let links: ReturnType<typeof buildMarketResearchAssist>["links"] | null = null;

  if (idn) {
    const primarySnap = getPrimarySnapshotWithManualComps({
      market,
      manualComps: card.cardFlowV2ManualComps,
      suspectId,
    });
    links = buildMarketResearchAssist({
      card,
      suspect,
      snapshot: primarySnap,
    }).links;
  }

  if (!links) {
    const vision = normalizeVisionCardNumber(
      visionForPricing(
        (card.visionJson ?? {}) as unknown as VisionResult,
        card,
      ),
      (card.pricingJson as { raw?: Record<string, unknown> } | undefined)?.raw,
    );
    links =
      vision.category === "sports" && !isVisionGradedSlab(vision)
        ? sportsMarketplaceSearchUrls(normalizeSportsVisionFields(vision))
        : legacyListingUrls(
            primaryCompSearchQuery(vision) || cardDisplayName(card),
          );
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-2.5 text-xs">
      <p className="font-semibold text-sky-900">Check live listings</p>
      <p className="mt-2 flex flex-wrap gap-3">
        <LinkItem href={links.tcgplayer} label="TCGplayer" />
        <LinkItem href={links.ebayActive} label="eBay active" />
        <LinkItem href={links.ebaySold} label="eBay sold (manual)" />
        <LinkItem href={links.google} label="Google price" />
        <LinkItem href={links.pricecharting} label="PriceCharting" />
        <LinkItem href={links.scryfall} label="Scryfall print" />
      </p>
    </div>
  );
}

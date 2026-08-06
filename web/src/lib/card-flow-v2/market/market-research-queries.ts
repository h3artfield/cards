import type { ScannedCard } from "../../types";
import type { CardSuspect } from "../types";
import type { CandidateMarketSnapshot } from "./types";
import { appendEbayQueryExclusions } from "./query-exclusions";
import { buildTcgplayerProductUrl } from "./tcgplayer-product-url";

export type MarketResearchLinks = {
  ebayActive: string;
  ebaySold: string;
  google: string;
  tcgplayer?: string;
  pricecharting?: string;
  scryfall?: string;
};

export type MarketResearchAssistBundle = {
  positiveQuery: string;
  negativeTerms: string[];
  appliedExclusions: string[];
  droppedExclusions: string[];
  links: MarketResearchLinks;
  suspectLabel?: string;
  suspectId?: string;
};

function quotedTerms(terms: string[]): string {
  return terms.filter(Boolean).map((t) => `"${t}"`).join(" ");
}

function buildPositiveFromSuspect(suspect: CardSuspect): string {
  const parts: string[] = [];
  if (suspect.canonicalName) parts.push(suspect.canonicalName);
  if (suspect.setCode) parts.push(suspect.setCode);
  else if (suspect.setName) parts.push(suspect.setName);
  const num = suspect.collectorNumber ?? suspect.cardNumber;
  if (num) parts.push(num.replace(/^#/, ""));
  if (
    suspect.finish &&
    !["unknown", "unknown_finish", "normal", "nonfoil"].includes(suspect.finish)
  ) {
    parts.push(suspect.finish.replace(/_/g, " "));
  }
  return quotedTerms(parts) || suspect.label;
}

function listingUrls(query: string): MarketResearchLinks {
  const q = query.trim() || "trading card";
  const encoded = encodeURIComponent(q);
  return {
    ebayActive: `https://www.ebay.com/sch/i.html?_nkw=${encoded}`,
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Sold=1&LH_Complete=1`,
    google: `https://www.google.com/search?q=${encodeURIComponent(`${q} sold price`)}`,
  };
}

function scryfallPrintUrl(suspect: CardSuspect): string | undefined {
  if (suspect.category !== "mtg") return undefined;
  const set = suspect.setCode?.toLowerCase();
  const cn = suspect.collectorNumber?.replace(/^#/, "");
  if (set && cn) {
    return `https://scryfall.com/card/${set}/${cn}`;
  }
  if (suspect.canonicalName) {
    return `https://scryfall.com/search?q=${encodeURIComponent(`!"${suspect.canonicalName}"`)}`;
  }
  return undefined;
}

function tcgplayerUrl(
  snap?: CandidateMarketSnapshot,
  suspect?: CardSuspect,
): string | undefined {
  return buildTcgplayerProductUrl({ snapshot: snap, suspect });
}

function pricechartingUrl(
  snap?: CandidateMarketSnapshot,
  suspect?: CardSuspect,
): string | undefined {
  const pc = snap?.priceChartingMapping;
  if (pc?.productId) {
    return `https://www.pricecharting.com/game/${pc.productId}`;
  }
  const q =
    pc?.productName ??
    suspect?.canonicalName ??
    snap?.marketProductName ??
    "";
  if (!q.trim()) return undefined;
  return `https://www.pricecharting.com/search-products?q=${encodeURIComponent(q.trim())}&type=prices`;
}

/** Exact positive/negative queries + marketplace links for staff research. */
export function buildMarketResearchAssist(input: {
  card: ScannedCard;
  suspect?: CardSuspect;
  snapshot?: CandidateMarketSnapshot;
}): MarketResearchAssistBundle {
  const { suspect, snapshot } = input;
  const plan = snapshot?.searchPlan;

  const positiveTerms = plan?.requiredTerms?.length
    ? plan.requiredTerms
    : suspect
      ? [
          suspect.canonicalName,
          suspect.setCode ?? suspect.setName,
          suspect.collectorNumber ?? suspect.cardNumber,
        ].filter(Boolean) as string[]
      : [input.card.detectedName ?? "trading card"].filter(Boolean) as string[];

  const negativeTerms = [
    ...(plan?.forbiddenTerms ?? []),
    ...(plan?.queryExclusionTerms ?? []),
  ];
  const uniqueNegative = [...new Set(negativeTerms.map((t) => t.trim()).filter(Boolean))];

  const basePositive =
    plan?.exactQueries[0]?.query ??
    plan?.narrowQueries[0]?.query ??
    (suspect ? buildPositiveFromSuspect(suspect) : quotedTerms(positiveTerms));

  const { query, appliedExclusions, droppedExclusions } = appendEbayQueryExclusions(
    basePositive,
    uniqueNegative,
  );

  const links = listingUrls(query);
  links.tcgplayer = tcgplayerUrl(snapshot, suspect);
  links.pricecharting = pricechartingUrl(snapshot, suspect);
  links.scryfall = suspect ? scryfallPrintUrl(suspect) : undefined;

  return {
    positiveQuery: basePositive,
    negativeTerms: uniqueNegative,
    appliedExclusions,
    droppedExclusions,
    links,
    suspectLabel: suspect?.label,
    suspectId: suspect?.suspectId ?? snapshot?.suspectId,
  };
}

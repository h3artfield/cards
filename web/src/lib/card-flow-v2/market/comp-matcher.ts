import { isLikelyLotListing } from "../../processing/pricing/build-search-query";
import {
  assessRiftboundCompVariant,
  riftboundVariantContextFromPlan,
} from "./riftbound-comp-rules";
import { assessMtgPriceChartingProductIdentity } from "./mtg-pricecharting-match";
import type {
  CompMatchAssessment,
  CompRejectionReason,
  MarketSearchPlan,
  RawMarketComp,
} from "./types";

function titleLower(title: string): string {
  return title.toLowerCase();
}

function containsTerm(title: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  if (!t) return true;
  const lower = titleLower(title);
  if (t.startsWith('"') && t.endsWith('"')) {
    return lower.includes(t.slice(1, -1).toLowerCase());
  }
  if (/^reverse[_\s-]*holo$/i.test(t)) {
    return /reverse\s*holo|reverseholo/i.test(lower);
  }
  if (t === "normal") {
    return /\bnormal\b/.test(lower);
  }
  if (t === "holofoil") {
    return /\bholofoil\b/.test(lower) && !/reverse/i.test(lower);
  }
  return lower.includes(t);
}

function containsForbiddenTerm(title: string, term: string): boolean {
  const lower = titleLower(title);
  const t = term.toLowerCase().trim();
  if (!t) return false;
  if (t === "graded") {
    if (/\bungraded\b/.test(lower)) return false;
    return /\bgraded\b/.test(lower);
  }
  if (t === "raw" || t === "ungraded") {
    return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(
      lower,
    );
  }
  return lower.includes(t);
}

function forbiddenHit(
  title: string,
  forbidden: string[],
): CompRejectionReason | null {
  const lower = titleLower(title);
  const map: Array<[string[], CompRejectionReason]> = [
    [["lot of", " bulk ", "lot ", "bundle", "break"], "lot_or_bundle"],
    [["sealed", "booster box", "booster pack", "etb", "elite trainer"], "sealed_product"],
    [["proxy", "custom card", "orica"], "proxy_or_custom"],
    [["digital", "code card", "online code"], "digital_or_code_card"],
  ];

  for (const [terms, reason] of map) {
    if (terms.some((t) => lower.includes(t))) return reason;
  }

  for (const term of forbidden) {
    if (!containsForbiddenTerm(title, term)) continue;
    if (["psa", "cgc", "bgs", "sgc", "tag", "slab", "graded"].some((g) => term.includes(g))) {
      return "raw_vs_graded_mismatch";
    }
    if (term === "raw" || term === "ungraded") return "raw_vs_graded_mismatch";
    if (["foil", "nonfoil", "reverse", "holo"].some((f) => term.includes(f))) {
      return "wrong_finish";
    }
    if (term.includes("prizm") || term.includes("parallel")) return "wrong_parallel";
  }

  if (isLikelyLotListing(title)) return "lot_or_bundle";
  return null;
}

function titleCollectorNumbers(title: string): string[] {
  const lower = titleLower(title);
  const found: string[] = [];
  const setSizeTotals = new Set<string>();

  for (const m of lower.matchAll(/#(\d{1,4})\b/g)) {
    found.push(String(parseInt(m[1]!, 10)));
  }
  for (const m of lower.matchAll(/\b(\d{1,4})\/(\d{2,4})\b/g)) {
    found.push(String(parseInt(m[1]!, 10)));
    setSizeTotals.add(String(parseInt(m[2]!, 10)));
  }
  for (const m of lower.matchAll(/\b(\d{1,4})\b/g)) {
    const n = parseInt(m[1]!, 10);
    if (n >= 1900 && n <= 2100) continue;
    if (n <= 0) continue;
    const s = String(n);
    if (setSizeTotals.has(s)) continue;
    found.push(s);
  }
  return [...new Set(found)];
}

function normalizeCollectorNumber(raw: string): string {
  const base = raw.split("/")[0]?.replace(/^#/, "").trim() ?? raw;
  const n = parseInt(base, 10);
  return Number.isFinite(n) ? String(n) : base;
}

function findCollectorNumberTerm(required: string[]): string | undefined {
  return required.find((t) => /^\d{1,4}$/.test(t.trim()) || /^\d{1,4}\/\d{1,4}$/.test(t.trim()));
}

function titleHasConflictingCollectorNumber(title: string, expectedNum: string): boolean {
  const expected = normalizeCollectorNumber(expectedNum);
  const inTitle = titleCollectorNumbers(title);
  if (!inTitle.length) return false;
  return inTitle.some((n) => n !== expected);
}

function isTcgCatalogCategory(category: MarketSearchPlan["category"]): boolean {
  return category === "pokemon" || category === "mtg" || category === "yugioh" || category === "riftbound";
}

function getExpectedFinish(plan: MarketSearchPlan): string | undefined {
  const fromIdentity = plan.identityFinish?.toLowerCase().trim();
  if (fromIdentity && !["unknown_finish", "unknown"].includes(fromIdentity)) {
    return fromIdentity;
  }
  return plan.requiredTerms
    .find((t) => /foil|holo|reverse|nonfoil|normal/i.test(t))
    ?.toLowerCase();
}

function titleStatesFinish(title: string): boolean {
  const lower = titleLower(title);
  return /reverse\s*holo|reverseholo|reverseholofoil|holofoil|\bnormal\b|\bnonfoil\b|\bholo rare\b|\bholographic\b/i.test(
    lower,
  );
}

function finishExplicitlyMatches(plan: MarketSearchPlan, title: string): boolean {
  const finish = getExpectedFinish(plan);
  if (!finish) return true;
  const lower = titleLower(title);

  if (finish.includes("reverse")) {
    return /reverse\s*holo|reverseholo/i.test(lower);
  }
  if (finish === "normal" || finish.includes("nonfoil")) {
    if (/\bnormal\b/.test(lower)) return true;
    if (/reverse\s*holo|reverseholo/i.test(lower)) return false;
    if (/\b(holofoil|holographic|holo rare)\b/.test(lower)) return false;
    return !titleStatesFinish(title);
  }
  if (finish.includes("foil") && !finish.includes("non")) {
    if (/\bnonfoil\b|\bnon-foil\b/.test(lower)) return false;
    return /\bfoil\b/.test(lower);
  }
  return true;
}

function finishMatchesTitle(plan: MarketSearchPlan, title: string): boolean {
  return !finishConflict(plan, title).reject;
}

function requiredCoverage(
  title: string,
  required: string[],
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const term of required) {
    if (containsTerm(title, term)) matched.push(term);
    else missing.push(term);
  }
  return { matched, missing };
}

function finishConflict(
  plan: MarketSearchPlan,
  title: string,
): { reject?: CompRejectionReason; maybe?: boolean } {
  const lower = titleLower(title);
  const finish = getExpectedFinish(plan);

  if (!finish) return {};

  if (finish.includes("foil") || finish.includes("holo")) {
    if (lower.includes("nonfoil") || lower.includes("non-foil")) {
      return { reject: "wrong_finish" };
    }
  }
  if (finish.includes("nonfoil") || finish === "normal") {
    if (/reverse\s*holo|reverseholo/i.test(lower)) {
      return { reject: "wrong_finish" };
    }
    if (/\b(holofoil|holographic|holo rare)\b/.test(lower) && !/reverse/i.test(lower)) {
      return { reject: "wrong_finish" };
    }
    if (lower.includes("foil") && !lower.includes("nonfoil")) {
      return { reject: "wrong_finish" };
    }
  }
  if (finish.includes("reverse")) {
    if (/reverse\s*holo|reverseholo/i.test(lower)) return {};
    if (/\b(holofoil|holographic|holo rare)\b/.test(lower) && !/reverse/i.test(lower)) {
      return { reject: "wrong_finish" };
    }
    if (/\bnormal\b/.test(lower) && !/reverse/i.test(lower)) {
      return { reject: "wrong_finish" };
    }
    return { maybe: true };
  }
  return {};
}

function hasGradedListingSignal(title: string): boolean {
  const lower = titleLower(title);
  if (/\bungraded\b/.test(lower)) return false;
  return /\b(psa|cgc|bgs|sgc|tag|slab|graded)\b/.test(lower);
}

function gradedConflict(plan: MarketSearchPlan, title: string): CompRejectionReason | null {
  const lower = titleLower(title);
  const gradedInTitle = hasGradedListingSignal(title);

  if (plan.gradeContext === "raw" && gradedInTitle) {
    return "raw_vs_graded_mismatch";
  }
  if (plan.gradeContext === "graded" && !gradedInTitle) {
    return "raw_vs_graded_mismatch";
  }

  if (plan.gradeContext === "graded" && plan.gradingCompany) {
    const co = plan.gradingCompany.toLowerCase();
    if (co.includes("psa") && /cgc|bgs|sgc/.test(lower) && !lower.includes("psa")) {
      return "wrong_grading_company";
    }
    if (co.includes("cgc") && /psa|bgs|sgc/.test(lower) && !lower.includes("cgc")) {
      return "wrong_grading_company";
    }
  }

  return null;
}

function editionConflict(plan: MarketSearchPlan, title: string): CompRejectionReason | null {
  const edition = plan.exactQueries.flatMap((q) => q.requiredTerms).find((t) =>
    /1st edition|unlimited|first edition/i.test(t),
  );
  if (!edition) return null;
  const lower = titleLower(title);
  if (edition.toLowerCase().includes("1st") && lower.includes("unlimited")) {
    return "wrong_edition";
  }
  return null;
}

export function assessMarketComp(
  comp: RawMarketComp,
  plan: MarketSearchPlan,
): CompMatchAssessment {
  const acceptedReasons: string[] = [];
  const rejectionReasons: CompRejectionReason[] = [];
  const notes: string[] = [];

  if (comp.source === "ebay_active") {
    rejectionReasons.push("active_listing_not_sold");
    notes.push("Active listing — sanity check only, not sold market value.");
    return {
      comp,
      status: "maybe",
      matchScore: 0.35,
      acceptedReasons,
      rejectionReasons,
      notes,
    };
  }

  const rawMeta = comp.rawData as
    | { pricingSignal?: boolean; product?: Record<string, unknown> }
    | undefined;

  if (rawMeta?.pricingSignal && comp.source === "scryfall_print_price") {
    return {
      comp,
      status: "accepted",
      matchScore: 1,
      acceptedReasons: ["scryfall_print_price"],
      rejectionReasons: [],
      notes: ["Scryfall exact-print price — pricing signal, not a sold comp."],
    };
  }

  if (
    rawMeta?.pricingSignal &&
    (comp.source === "tcgplayer" || comp.source === "pricecharting")
  ) {
    if (comp.source === "pricecharting" && plan.category === "mtg") {
      const productName =
        (rawMeta.product?.["product-name"] as string | undefined) ??
        comp.title.replace(/\s*\([^)]+\)\s*$/, "");
      const identity = assessMtgPriceChartingProductIdentity(plan, productName);
      if (!identity.accepted) {
        return {
          comp,
          status: "rejected",
          matchScore: 0,
          acceptedReasons: [],
          rejectionReasons: ["pricecharting_product_identity_mismatch"],
          notes: [
            `PriceCharting product rejected: ${identity.details.reason} — expected #${identity.details.expectedCollectorNumber ?? "?"} (${identity.details.expectedSetCode ?? "?"})`,
            JSON.stringify(identity.details),
          ],
        };
      }
    }
    return {
      comp,
      status: "accepted",
      matchScore: 1,
      acceptedReasons: [`${comp.source}_pricing_signal`],
      rejectionReasons: [],
      notes: [`${comp.source} pricing signal — not a sold comp`],
    };
  }

  const forbidden = forbiddenHit(comp.title, plan.forbiddenTerms);
  if (forbidden) {
    rejectionReasons.push(forbidden);
  }

  const graded = gradedConflict(plan, comp.title);
  if (graded) rejectionReasons.push(graded);

  const finish = finishConflict(plan, comp.title);
  if (finish.reject) rejectionReasons.push(finish.reject);
  let finishMaybe = finish.maybe ?? false;

  const edition = editionConflict(plan, comp.title);
  if (edition) rejectionReasons.push(edition);

  if (plan.category === "riftbound") {
    const rbReject = assessRiftboundCompVariant(
      comp.title,
      riftboundVariantContextFromPlan(plan),
    );
    if (rbReject) rejectionReasons.push(rbReject);
  }

  const { matched, missing } = requiredCoverage(comp.title, plan.requiredTerms);
  if (matched.length) {
    acceptedReasons.push(`Matched required: ${matched.join(", ")}`);
  }

  const nameTerm = plan.requiredTerms[0];
  if (nameTerm && !containsTerm(comp.title, nameTerm)) {
    rejectionReasons.push("wrong_card");
  }

  const numTerm = findCollectorNumberTerm(plan.requiredTerms);
  if (numTerm && titleHasConflictingCollectorNumber(comp.title, numTerm)) {
    rejectionReasons.push("wrong_number");
  }

  const collectorNumMissing =
    numTerm &&
    !containsTerm(comp.title, numTerm.replace("/", "")) &&
    !containsTerm(comp.title, numTerm.split("/")[0] ?? numTerm) &&
    titleCollectorNumbers(comp.title).length === 0;

  const tcgNameFinishMatch =
    isTcgCatalogCategory(plan.category) &&
    nameTerm &&
    containsTerm(comp.title, nameTerm) &&
    finishMatchesTitle(plan, comp.title) &&
    !rejectionReasons.includes("wrong_card") &&
    !rejectionReasons.includes("wrong_finish") &&
    !rejectionReasons.includes("wrong_number");

  if (tcgNameFinishMatch && collectorNumMissing) {
    notes.push("Collector number not in listing title — TCG name/finish match.");
    acceptedReasons.push("Name and finish match (collector # omitted in title)");
  }

  const parallelTerm = plan.requiredTerms.find(
    (t) =>
      /^(silver|green|gold|purple|red|blue|orange|pink|black|white)\s/i.test(t) ||
      /\bparallel\b/i.test(t) ||
      /^reverse holo$/i.test(t) ||
      (/\bprizm\b/i.test(t) && /^(silver|green|gold|purple|red|blue|orange|pink|black|white)\s/i.test(t)),
  );
  if (
    parallelTerm &&
    !containsTerm(comp.title, parallelTerm) &&
    nameTerm &&
    containsTerm(comp.title, nameTerm)
  ) {
    rejectionReasons.push("wrong_parallel");
    notes.push(`parallel mismatch. V2 search plan expected ${parallelTerm}.`);
  }

  let matchScore = matched.length / Math.max(1, plan.requiredTerms.length);
  if (tcgNameFinishMatch && collectorNumMissing) {
    matchScore = Math.max(matchScore, 0.72);
  }
  if (rejectionReasons.length) matchScore *= 0.3;

  let status: CompMatchAssessment["status"] = "rejected";
  if (rejectionReasons.length === 0 && matchScore >= 0.65) {
    status = "accepted";
  } else if (
    rejectionReasons.length === 0 &&
    tcgNameFinishMatch &&
    collectorNumMissing
  ) {
    status = finishMaybe ? "maybe" : "accepted";
  } else if (rejectionReasons.length === 0 && (finishMaybe || missing.length > 0)) {
    if (missing.length > 0 && matchScore >= 0.45) {
      status = "maybe";
      notes.push(
        `Partial match — ${missing.join(", ")} not stated in listing title.`,
      );
    }
  }

  if (
    missing.length > plan.requiredTerms.length / 2 &&
    rejectionReasons.length === 0
  ) {
    status = "maybe";
    notes.push("Title too ambiguous — many required terms missing.");
  }

  if (rejectionReasons.length > 0) status = "rejected";

  // Post-check: widened TCG acceptance must state finish explicitly; demote sneaky mismatches.
  if (status === "accepted" && isTcgCatalogCategory(plan.category)) {
    const expectedFinish = getExpectedFinish(plan);
    if (expectedFinish) {
      if (collectorNumMissing && !titleStatesFinish(comp.title)) {
        status = "maybe";
        notes.push("Finish not stated in title — demoted from accepted.");
      } else if (!finishExplicitlyMatches(plan, comp.title)) {
        if (!titleStatesFinish(comp.title)) {
          status = "maybe";
          notes.push(`Finish not confirmed for expected ${expectedFinish}.`);
        } else {
          status = "rejected";
          if (!rejectionReasons.includes("wrong_finish")) {
            rejectionReasons.push("wrong_finish");
          }
          notes.push(`Finish mismatch for expected ${expectedFinish}.`);
        }
      }
    }
  }

  return {
    comp,
    status,
    matchScore,
    acceptedReasons,
    rejectionReasons: [...new Set(rejectionReasons)],
    notes,
  };
}

export function assessMarketComps(
  comps: RawMarketComp[],
  plan: MarketSearchPlan,
): CompMatchAssessment[] {
  return comps.map((c) => assessMarketComp(c, plan));
}

export function partitionCompAssessments(assessments: CompMatchAssessment[]): {
  accepted: CompMatchAssessment[];
  rejected: CompMatchAssessment[];
  maybe: CompMatchAssessment[];
} {
  return {
    accepted: assessments.filter((a) => a.status === "accepted"),
    rejected: assessments.filter((a) => a.status === "rejected"),
    maybe: assessments.filter((a) => a.status === "maybe"),
  };
}

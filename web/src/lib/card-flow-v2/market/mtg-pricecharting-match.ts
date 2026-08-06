import type { MarketIdentityFields, MarketSearchPlan } from "./types";

export type MtgPcIdentityMismatchReason =
  | "collector_number_mismatch"
  | "set_mismatch"
  | "finish_mismatch"
  | "graded_mismatch"
  | "name_only_no_identity";

export type MtgPriceChartingIdentityResult =
  | { accepted: true }
  | {
      accepted: false;
      reason: "pricecharting_product_identity_mismatch";
      details: {
        expectedSetCode?: string;
        expectedCollectorNumber?: string;
        priceChartingTitle: string;
        parsedCollectorNumber?: string;
        reason: MtgPcIdentityMismatchReason;
      };
    };

function titleLower(title: string): string {
  return title.toLowerCase();
}

export function normalizeMtgCollectorNumber(raw: string): string {
  const base = raw.split("/")[0]?.replace(/^#/, "").trim() ?? raw;
  const n = parseInt(base, 10);
  return Number.isFinite(n) ? String(n) : base;
}

export function parseCollectorNumbersFromTitle(title: string): string[] {
  const lower = titleLower(title);
  const found: string[] = [];
  const setSizeTotals = new Set<string>();

  for (const m of lower.matchAll(/#(\d{1,4})\b/g)) {
    found.push(normalizeMtgCollectorNumber(m[1]!));
  }
  for (const m of lower.matchAll(/\b(\d{1,4})\/(\d{2,4})\b/g)) {
    found.push(normalizeMtgCollectorNumber(m[1]!));
    setSizeTotals.add(normalizeMtgCollectorNumber(m[2]!));
  }
  for (const m of lower.matchAll(/\bm\s*0*(\d{1,4})\b/gi)) {
    found.push(normalizeMtgCollectorNumber(m[1]!));
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

function findExpectedCollectorNumber(plan: MarketSearchPlan): string | undefined {
  const term = plan.requiredTerms.find(
    (t) =>
      /^\d{1,4}$/.test(t.trim()) ||
      /^\d{1,4}\/\d{1,4}$/.test(t.trim()) ||
      /^[a-z]{2,5}-\d{1,4}$/i.test(t.trim()),
  );
  return term ? normalizeMtgCollectorNumber(term) : undefined;
}

function expectedSetCode(plan: MarketSearchPlan): string | undefined {
  const fromTerms = plan.requiredTerms.find((t) => /^[a-z]{2,5}$/i.test(t.trim()));
  if (fromTerms) return fromTerms.toUpperCase();
  return undefined;
}

function expectedSetName(plan: MarketSearchPlan): string | undefined {
  const nameTerm = plan.requiredTerms[0]?.toLowerCase();
  return plan.requiredTerms.find(
    (t) =>
      t.toLowerCase() !== nameTerm &&
      t.length > 4 &&
      !/^\d/.test(t) &&
      !/foil|nonfoil|holo|reverse/i.test(t) &&
      !/^[a-z]{2,5}$/i.test(t),
  );
}

function titleHasConflictingSet(
  title: string,
  setCode?: string,
  setName?: string,
): boolean {
  const lower = titleLower(title);
  const code = setCode?.toLowerCase();
  const name = setName?.toLowerCase();

  if (code === "mar" || name?.includes("marvel universe")) {
    if (/jurassic|rex\b|jurassic world collection/i.test(lower)) return true;
  }
  if (code === "rex" || name?.includes("jurassic")) {
    if (/\bmar\b|marvel universe/i.test(lower)) return true;
  }

  if (code && code.length >= 2) {
    const hasOtherSetCode = /\b[a-z]{3,5}\b/i.test(lower) && !lower.includes(code.toLowerCase());
    if (hasOtherSetCode && /jurassic|marvel universe|rex\b/i.test(lower)) {
      if (code === "mar" && /rex\b|jurassic/i.test(lower)) return true;
      if (code === "rex" && /marvel universe|\bmar\b/i.test(lower)) return true;
    }
  }

  return false;
}

function finishMismatch(title: string, finish?: string): boolean {
  const f = (finish ?? "").toLowerCase();
  if (!f || ["unknown", "unknown_finish"].includes(f)) return false;
  const lower = titleLower(title);
  if (f.includes("nonfoil") || f === "normal") {
    if (/\bfoil\b/.test(lower) && !/\bnonfoil\b|\bnon-foil\b/.test(lower)) return true;
  }
  if (f.includes("foil") && !f.includes("non")) {
    if (/\bnonfoil\b|\bnon-foil\b/.test(lower)) return true;
  }
  return false;
}

function gradedMismatch(title: string, gradeContext: MarketSearchPlan["gradeContext"]): boolean {
  if (gradeContext !== "raw") return false;
  const lower = titleLower(title);
  if (/\bungraded\b/.test(lower)) return false;
  return /\b(psa|cgc|bgs|sgc|tag)\s*\d|\bgraded\b|\bslab\b/i.test(lower);
}

function titleReferencesSet(title: string, setCode?: string, setName?: string): boolean {
  const lower = titleLower(title);
  if (setCode && setCode.length >= 2) {
    const escaped = setCode.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) return true;
  }
  if (setName) {
    const words = setName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length >= 2 && words.every((w) => lower.includes(w))) return true;
    if (setName.length > 5 && lower.includes(setName.toLowerCase())) return true;
  }
  return false;
}

export function assessMtgPriceChartingProductIdentity(
  plan: MarketSearchPlan,
  productTitle: string,
  options?: { explicitMapping?: boolean },
): MtgPriceChartingIdentityResult {
  if (plan.category !== "mtg") return { accepted: true };
  if (options?.explicitMapping) return { accepted: true };

  const expectedNum = findExpectedCollectorNumber(plan);
  const setCode = expectedSetCode(plan);
  const setName = expectedSetName(plan);
  const parsed = parseCollectorNumbersFromTitle(productTitle);

  if (titleHasConflictingSet(productTitle, setCode, setName)) {
    return {
      accepted: false,
      reason: "pricecharting_product_identity_mismatch",
      details: {
        expectedSetCode: setCode,
        expectedCollectorNumber: expectedNum,
        priceChartingTitle: productTitle,
        parsedCollectorNumber: parsed[0],
        reason: "set_mismatch",
      },
    };
  }

  if (expectedNum && parsed.length > 0 && parsed.some((n) => n !== expectedNum)) {
    return {
      accepted: false,
      reason: "pricecharting_product_identity_mismatch",
      details: {
        expectedSetCode: setCode,
        expectedCollectorNumber: expectedNum,
        priceChartingTitle: productTitle,
        parsedCollectorNumber: parsed.find((n) => n !== expectedNum),
        reason: "collector_number_mismatch",
      },
    };
  }

  if (expectedNum && parsed.length === 0 && !titleReferencesSet(productTitle, setCode, setName)) {
    return {
      accepted: false,
      reason: "pricecharting_product_identity_mismatch",
      details: {
        expectedSetCode: setCode,
        expectedCollectorNumber: expectedNum,
        priceChartingTitle: productTitle,
        reason: "name_only_no_identity",
      },
    };
  }

  if (finishMismatch(productTitle, plan.identityFinish)) {
    return {
      accepted: false,
      reason: "pricecharting_product_identity_mismatch",
      details: {
        expectedSetCode: setCode,
        expectedCollectorNumber: expectedNum,
        priceChartingTitle: productTitle,
        reason: "finish_mismatch",
      },
    };
  }

  if (gradedMismatch(productTitle, plan.gradeContext)) {
    return {
      accepted: false,
      reason: "pricecharting_product_identity_mismatch",
      details: {
        expectedSetCode: setCode,
        expectedCollectorNumber: expectedNum,
        priceChartingTitle: productTitle,
        reason: "graded_mismatch",
      },
    };
  }

  return { accepted: true };
}

export function buildMtgCrossPrintForbiddenTerms(
  fields: MarketIdentityFields,
): string[] {
  const terms = [
    "foil",
    "surge foil",
    "jurassic",
    "rex",
    "psa",
    "cgc",
    "bgs",
    "graded",
    "slab",
    "lot",
    "proxy",
    "custom",
  ];
  const finish = (fields.finish ?? "").toLowerCase();
  if (finish.includes("nonfoil") || finish === "normal") {
    terms.push("foil");
  }

  const num = fields.collectorNumber ?? fields.cardNumber;
  if (num) {
    const expected = normalizeMtgCollectorNumber(num);
    for (const wrong of ["18", "43"]) {
      if (wrong !== expected) terms.push(`#${wrong}`);
    }
  }

  return [...new Set(terms)];
}

function quoted(parts: string[]): string {
  return parts.filter(Boolean).map((p) => `"${p}"`).join(" ");
}

export function buildMtgActiveSanityQueries(
  fields: MarketIdentityFields,
): Array<{ query: string; purpose: string; notes: string[] }> {
  if (fields.category !== "mtg") return [];

  const name = fields.canonicalName?.trim();
  const setCode = fields.setCode?.trim();
  const setName = fields.setName?.trim();
  const rawNum = fields.collectorNumber ?? fields.cardNumber;
  if (!name || !rawNum) return [];

  const numPlain = normalizeMtgCollectorNumber(rawNum);
  const queries: Array<{ query: string; purpose: string; notes: string[] }> = [];

  if (setCode) {
    queries.push({
      query: quoted([name, numPlain, setCode]),
      purpose: "active_sanity_check",
      notes: ["MTG active sanity — name/set code/collector (no finish term)"],
    });
  }
  if (setName) {
    queries.push({
      query: quoted([name, setName, numPlain]),
      purpose: "active_sanity_check",
      notes: ["MTG active sanity — name/set name/collector"],
    });
  }
  if (setCode?.toUpperCase() === "MAR") {
    queries.push({
      query: quoted([name, `M ${numPlain.padStart(4, "0")}`]),
      purpose: "active_sanity_check",
      notes: ["MTG active sanity — MAR M-number format"],
    });
  }

  return queries;
}

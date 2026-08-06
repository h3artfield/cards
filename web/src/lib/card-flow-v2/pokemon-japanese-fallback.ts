import { findCatalogCandidates } from "../processing/pricing";
import {
  isNonLatinPokemonName,
  japanesePokemonSetMatchHints,
  normalizePokemonSetCode,
  pokemonCollectorQuery,
  pokemonJapaneseNameToEnglish,
  pokemonCatalogNamesMatch,
  pokemonNumbersMatch,
  textMatchesPokemonSetHints,
} from "../processing/pokemon-utils";
import {
  fetchPriceChartingProductsRaw,
  searchPriceChartingProducts,
} from "../processing/pricing/pricecharting-pricing";
import type { VisionResult } from "../types";
import type {
  CardSuspect,
  ImageEvidenceReport,
  ScanDerivedSuspectMeta,
  SuspectAssessment,
} from "./types";
import { catalogMatchToSuspects } from "./catalog-normalizers";
import {
  evidenceToVisionHint,
  getSlotValue,
  mergeVisionHintFallback,
} from "./evidence-utils";

const MAX_SUSPECTS = 12;

export type PokemonScanIdentity = {
  detectedName: string;
  displayName: string;
  nativeName?: string;
  setName?: string;
  setCode?: string;
  collectorNumber?: string;
  language: string;
  finish?: string;
};

function normLang(raw?: string | null): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "en";
  if (v === "jp" || v === "ja" || v.includes("japanese")) return "jp";
  return v;
}

function isJapaneseLanguage(lang: string): boolean {
  return lang === "jp" || lang === "ja";
}

/** True when scan evidence indicates a Japanese printing. */
export function isJapanesePokemonEvidence(
  imageEvidence: ImageEvidenceReport,
): boolean {
  const scan = extractPokemonScanIdentity(imageEvidence);
  if (scan && isJapaneseLanguage(scan.language)) return true;
  const lang = normLang(getSlotValue(imageEvidence, "language"));
  return isJapaneseLanguage(lang);
}

/** When to merge scan-derived suspect — JP always; English only when catalog is empty. */
export function shouldInjectScanDerivedPokemon(input: {
  scanIdentity: PokemonScanIdentity;
  suspects: CardSuspect[];
}): { inject: boolean; prioritize: boolean } {
  const isJp = isJapaneseLanguage(input.scanIdentity.language);
  if (isJp) {
    return { inject: true, prioritize: true };
  }

  const catalogSuspects = input.suspects.filter(
    (s) => s.catalogSource !== "scan_derived_fallback",
  );
  if (catalogSuspects.length === 0) {
    return { inject: true, prioritize: true };
  }

  const nameMatches = catalogSuspects.some((s) =>
    pokemonCatalogNamesMatch(
      input.scanIdentity.displayName,
      s.canonicalName ?? "",
    ),
  );
  if (nameMatches) {
    return { inject: false, prioritize: false };
  }

  return { inject: true, prioritize: false };
}

/** Minimum evidence for evidence-to-picker guarantee (name + set/number). */
export function hasMinimumPokemonPickerEvidence(
  imageEvidence: ImageEvidenceReport,
): boolean {
  const name =
    getSlotValue(imageEvidence, "card_name") ??
    getSlotValue(imageEvidence, "name");
  const setRef =
    getSlotValue(imageEvidence, "set_code") ??
    getSlotValue(imageEvidence, "set_name");
  const number =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number");
  return Boolean(name?.trim() && setRef?.trim() && number?.trim());
}

export function extractPokemonScanIdentity(
  imageEvidence: ImageEvidenceReport,
): PokemonScanIdentity | null {
  const detectedName =
    getSlotValue(imageEvidence, "card_name") ??
    getSlotValue(imageEvidence, "name");
  if (!detectedName?.trim()) return null;

  const setName = getSlotValue(imageEvidence, "set_name") ?? undefined;
  const setCode = getSlotValue(imageEvidence, "set_code") ?? undefined;
  const collectorNumber =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number") ??
    undefined;
  const languageRaw = getSlotValue(imageEvidence, "language");
  let language = normLang(languageRaw);
  const finish =
    getSlotValue(imageEvidence, "foil_pattern") ??
    getSlotValue(imageEvidence, "finish") ??
    undefined;

  const english = pokemonJapaneseNameToEnglish(detectedName);
  const nativeName =
    isNonLatinPokemonName(detectedName) && english ? detectedName.trim() : undefined;
  const displayName = english ?? detectedName.trim();

  if (!languageRaw?.trim() && (nativeName || isNonLatinPokemonName(detectedName))) {
    language = "jp";
  }

  if (!setName?.trim() && !setCode?.trim()) return null;
  if (!collectorNumber?.trim()) return null;

  return {
    detectedName: detectedName.trim(),
    displayName,
    nativeName,
    setName: setName?.trim(),
    setCode: setCode?.trim()?.toUpperCase(),
    collectorNumber: collectorNumber.trim(),
    language,
    finish: finish?.trim() || undefined,
  };
}

export function scanDerivedMetaFromSuspect(
  suspect: CardSuspect,
): ScanDerivedSuspectMeta | undefined {
  if (suspect.catalogSource !== "scan_derived_fallback") return undefined;
  const raw = suspect.rawCatalogData as ScanDerivedSuspectMeta | undefined;
  if (raw?.identitySource === "scan_derived_fallback") return raw;
  return undefined;
}

export function scanIdentityFromSuspect(
  suspect: CardSuspect,
): PokemonScanIdentity | null {
  const meta = scanDerivedMetaFromSuspect(suspect);
  if (!meta) return null;
  if (!suspect.collectorNumber?.trim()) return null;
  const displayName = meta.displayName ?? suspect.canonicalName ?? "Unknown";
  return {
    detectedName: meta.nativeName ?? displayName,
    displayName,
    nativeName: meta.nativeName,
    setName: suspect.setName,
    setCode: suspect.setCode,
    collectorNumber: suspect.collectorNumber,
    language: suspect.language ?? "jp",
    finish: suspect.finish,
  };
}

export function scanDerivedPricingStatus(
  suspect: CardSuspect,
): ScanDerivedSuspectMeta["pricingStatus"] | undefined {
  return scanDerivedMetaFromSuspect(suspect)?.pricingStatus;
}

/** Japanese / scan-derived printings must not use English Pokémon TCG API → TCGplayer pricing. */
export function suspectBlocksTcgplayerPricing(
  suspect: CardSuspect | undefined,
): boolean {
  if (!suspect) return false;

  const meta = scanDerivedMetaFromSuspect(suspect);
  if (meta?.tcgplayerJapanProduct?.productId) {
    return false;
  }

  if (
    suspect.catalogSource === "scan_derived_fallback" &&
    scanDerivedPricingStatus(suspect) !== "pricecharting_exact"
  ) {
    return true;
  }
  if (suspect.category === "pokemon") {
    const isJp =
      isJapaneseLanguage(suspect.language ?? "") ||
      suspect.variantTags?.includes("japanese");
    if (isJp && suspect.catalogSource !== "pokemon_tcg") {
      return true;
    }
  }
  return false;
}

/** Staff-confirmed scan-derived row has a verified TCGplayer Japan catalog product. */
export function staffSuspectUsesTcgplayerJapanCatalog(
  suspect: CardSuspect | undefined,
): boolean {
  if (!suspect) return false;
  const meta = scanDerivedMetaFromSuspect(suspect);
  return Boolean(
    meta?.tcgplayerJapanProduct?.productId ||
      meta?.pricingStatus === "tcgplayer_japan_exact",
  );
}

function stableScanDerivedId(identity: PokemonScanIdentity): string {
  const parts = [
    normalizePokemonSetCode(identity.setCode) ?? identity.setName?.toLowerCase(),
    identity.collectorNumber?.replace(/\s+/g, "") ?? "",
    identity.displayName.toLowerCase().replace(/\s+/g, "-"),
    identity.language,
  ].filter(Boolean);
  return `scan_derived:pokemon:${parts.join(":")}`;
}

function labelFromScanIdentity(identity: PokemonScanIdentity): string {
  const namePart = identity.nativeName
    ? `${identity.displayName} / ${identity.nativeName}`
    : identity.displayName;
  const setPart = [identity.setName, identity.setCode?.toUpperCase()]
    .filter(Boolean)
    .join(" · ");
  return [namePart, setPart, identity.collectorNumber].filter(Boolean).join(" · ");
}

function buildScanDerivedAssessment(suspectId: string): SuspectAssessment {
  return {
    suspectId,
    matchScore: 0.55,
    canConfirm: true,
    canEliminate: false,
    supportingEvidence: ["scan_derived_fallback", "front_scan_identity"],
    contradictingEvidence: [],
    missingEvidence: ["catalog_verification"],
    variantRisks: ["catalog_not_found"],
    reasoning:
      "Generated from scan — catalog source missing. Staff confirmation required.",
  };
}

export function buildScanDerivedPokemonSuspect(
  identity: PokemonScanIdentity,
  pricingStatus: ScanDerivedSuspectMeta["pricingStatus"],
  priceChartingProduct?: Record<string, unknown>,
  tcgplayerJapanProduct?: import("./types").TcgplayerJapanProductMeta,
): { suspect: CardSuspect; assessment: SuspectAssessment } {
  const suspectId = stableScanDerivedId(identity);
  const meta: ScanDerivedSuspectMeta = {
    identitySource: "scan_derived_fallback",
    catalogVerified: false,
    catalogSource: null,
    displayName: identity.displayName,
    nativeName: identity.nativeName,
    pricingStatus,
    priceChartingProduct,
    tcgplayerJapanProduct,
  };

  const pcImageUrl =
    priceChartingProduct &&
    ((priceChartingProduct["image-url"] as string | undefined) ??
      (priceChartingProduct.imageUrl as string | undefined));

  const suspect: CardSuspect = {
    suspectId,
    category: "pokemon",
    label: labelFromScanIdentity(identity),
    canonicalName: identity.displayName,
    catalogSource: "scan_derived_fallback",
    setName: identity.setName,
    setCode: identity.setCode,
    collectorNumber: identity.collectorNumber,
    cardNumber: identity.collectorNumber,
    language: identity.language,
    finish: identity.finish,
    variantTags: [
      "scan_derived",
      ...(isJapaneseLanguage(identity.language) ? ["japanese"] : []),
    ],
    expectedEvidence: [],
    referenceImageUrls: tcgplayerJapanProduct?.imageUrl
      ? [tcgplayerJapanProduct.imageUrl]
      : pcImageUrl?.trim()
        ? [pcImageUrl.trim()]
        : undefined,
    rawCatalogData: meta,
  };

  return { suspect, assessment: buildScanDerivedAssessment(suspectId) };
}

function visionForJapaneseRecovery(
  imageEvidence: ImageEvidenceReport,
  visionFallback?: Partial<VisionResult>,
): VisionResult {
  const base = mergeVisionHintFallback(
    evidenceToVisionHint(imageEvidence, "pokemon"),
    visionFallback,
  );
  const scan = extractPokemonScanIdentity(imageEvidence);
  if (!scan) return base;

  return {
    ...base,
    category: "pokemon",
    cardName: scan.displayName,
    setName: scan.setName ?? base.setName,
    setCode: scan.setCode ?? base.setCode,
    cardNumber: scan.collectorNumber ?? base.cardNumber,
  };
}

/** Strict PriceCharting match for Japanese Pokémon — rejects name-only hits. */
export function isExactJapanesePokemonPriceChartingMatch(
  product: Record<string, unknown>,
  identity: PokemonScanIdentity,
): boolean {
  const title = String(product["product-name"] ?? "").toLowerCase();
  const consoleName = String(product["console-name"] ?? "").toLowerCase();
  if (!title.includes("pokemon") && !consoleName.includes("pokemon")) {
    return false;
  }

  const display = identity.displayName.toLowerCase();
  if (!title.includes(display)) return false;

  const setHints = japanesePokemonSetMatchHints(identity.setName, identity.setCode);
  if (
    !textMatchesPokemonSetHints([title, consoleName], setHints)
  ) {
    return false;
  }

  const collector = pokemonCollectorQuery(identity.collectorNumber);
  const numberMatch =
    pokemonNumbersMatch(identity.collectorNumber, title) ||
    (collector != null && new RegExp(`\\b#?0*${collector}\\b`).test(title));
  if (!numberMatch) return false;

  if (isJapaneseLanguage(identity.language)) {
    const jpHint =
      /japanese|\[jp\]|\(jp\)|\bjp\b/.test(title) ||
      /japanese|\bjp\b/.test(consoleName) ||
      Boolean(identity.nativeName && title.includes(identity.nativeName));
    if (!jpHint) return false;
  }

  return true;
}

export async function tryPriceChartingExactJapanesePokemon(
  identity: PokemonScanIdentity,
): Promise<Record<string, unknown> | null> {
  const vision: VisionResult = {
    category: "pokemon",
    confidence: 0.6,
    itemType: "raw",
    conditionEstimate: "NM",
    cardName: identity.displayName,
    setName: identity.setName,
    setCode: identity.setCode,
    cardNumber: identity.collectorNumber,
  };

  const queries = [
    `${identity.displayName} ${identity.setName ?? ""} ${identity.collectorNumber} japanese pokemon`.trim(),
    `${identity.displayName} ${identity.setCode ?? ""} #${pokemonCollectorQuery(identity.collectorNumber) ?? identity.collectorNumber} japanese`.trim(),
    `${identity.setName ?? identity.setCode} ${identity.collectorNumber} ${identity.displayName} japanese`.trim(),
  ].filter(Boolean);

  for (const query of queries) {
    const hits = await searchPriceChartingProducts(query, vision, 8);
    for (const hit of hits) {
      const product = hit.product as Record<string, unknown>;
      if (isExactJapanesePokemonPriceChartingMatch(product, identity)) {
        return product;
      }
    }

    // Vision scoring can drop valid JP rows (e.g. set_code-only SV5A scans).
    const rawHits = await fetchPriceChartingProductsRaw(query, 12);
    for (const product of rawHits) {
      const row = product as Record<string, unknown>;
      if (isExactJapanesePokemonPriceChartingMatch(row, identity)) {
        return row;
      }
    }
  }

  return null;
}

function dedupeSuspects(suspects: CardSuspect[]): CardSuspect[] {
  const seen = new Set<string>();
  const out: CardSuspect[] = [];
  for (const s of suspects) {
    if (seen.has(s.suspectId)) continue;
    seen.add(s.suspectId);
    out.push(s);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Catalog recovery + scan-derived fallback when Pokémon TCG API returns zero suspects. */
export async function recoverPokemonCatalogSuspects(input: {
  imageEvidence: ImageEvidenceReport;
  visionFallback?: Partial<VisionResult>;
}): Promise<{
  suspects: CardSuspect[];
  assessments: SuspectAssessment[];
  notes: string[];
}> {
  const notes: string[] = [];
  const scanIdentity = extractPokemonScanIdentity(input.imageEvidence);
  if (!scanIdentity) {
    return { suspects: [], assessments: [], notes: ["No scan identity for Pokémon recovery."] };
  }

  const vision = visionForJapaneseRecovery(
    input.imageEvidence,
    input.visionFallback,
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    const matches = await findCatalogCandidates(vision, MAX_SUSPECTS);
    if (matches.length) {
      const suspects: CardSuspect[] = [];
      for (const match of matches) {
        suspects.push(
          ...catalogMatchToSuspects(match.raw, match.source, "pokemon", {
            graded: false,
          }),
        );
      }
      notes.push(
        `Pokémon catalog recovery attempt ${attempt + 1} returned ${suspects.length} suspect(s).`,
      );
      return {
        suspects: dedupeSuspects(suspects).slice(0, MAX_SUSPECTS),
        assessments: [],
        notes,
      };
    }
    if (attempt < 2) await sleep(400 * (attempt + 1));
  }

  notes.push("Pokémon TCG API returned no matches — trying PriceCharting.");

  let pricingStatus: ScanDerivedSuspectMeta["pricingStatus"] =
    "manual_price_required";
  let pcProduct: Record<string, unknown> | undefined;

  try {
    const exact = await tryPriceChartingExactJapanesePokemon(scanIdentity);
    if (exact) {
      pcProduct = exact;
      pricingStatus = "pricecharting_exact";
      notes.push("PriceCharting exact Japanese match attached as market evidence.");
    } else {
      notes.push(
        "PriceCharting had no exact Japanese match — manual price required.",
      );
      pricingStatus = isJapaneseLanguage(scanIdentity.language)
        ? "manual_price_required"
        : "market_data_missing";
    }
  } catch {
    notes.push("PriceCharting lookup failed — scan-derived fallback only.");
    pricingStatus = "manual_price_required";
  }

  const built = buildScanDerivedPokemonSuspect(
    scanIdentity,
    pricingStatus,
    pcProduct,
  );
  notes.push("Created scan-derived fallback candidate from front-scan evidence.");

  return {
    suspects: [built.suspect],
    assessments: [built.assessment],
    notes,
  };
}

/** Drop English catalog printings that contradict a high-confidence Japanese scan. */
export function filterJapaneseCatalogSuspects(input: {
  suspects: CardSuspect[];
  assessments: SuspectAssessment[];
  imageEvidence: ImageEvidenceReport;
}): {
  suspects: CardSuspect[];
  assessments: SuspectAssessment[];
  notes: string[];
} {
  const scan = extractPokemonScanIdentity(input.imageEvidence);
  if (!scan || !isJapaneseLanguage(scan.language)) {
    return {
      suspects: input.suspects,
      assessments: input.assessments,
      notes: [],
    };
  }

  const scanSetCode = normalizePokemonSetCode(scan.setCode);
  const scanSetName = scan.setName?.trim().toLowerCase();
  if (!scanSetCode && !scanSetName) {
    return {
      suspects: input.suspects,
      assessments: input.assessments,
      notes: [],
    };
  }

  const kept = input.suspects.filter((s) => {
    if (s.catalogSource === "scan_derived_fallback") return true;
    const suspectCode = normalizePokemonSetCode(s.setCode);
    if (scanSetCode && suspectCode) {
      return suspectCode === scanSetCode;
    }
    if (scanSetName && s.setName) {
      return s.setName.trim().toLowerCase() === scanSetName;
    }
    return false;
  });

  if (kept.length === input.suspects.length) {
    return {
      suspects: input.suspects,
      assessments: input.assessments,
      notes: [],
    };
  }

  const keptIds = new Set(kept.map((s) => s.suspectId));
  return {
    suspects: kept,
    assessments: input.assessments.filter((a) => keptIds.has(a.suspectId)),
    notes: [
      `Japanese scan set ${scanSetCode ?? scanSetName} — removed ${input.suspects.length - kept.length} non-matching catalog printing(s).`,
    ],
  };
}

function priorTcgJapanForIdentity(
  suspects: CardSuspect[],
  identity: PokemonScanIdentity,
): import("./types").TcgplayerJapanProductMeta | undefined {
  const scanCode = normalizePokemonSetCode(identity.setCode);
  for (const suspect of suspects) {
    const meta = scanDerivedMetaFromSuspect(suspect);
    const tcg = meta?.tcgplayerJapanProduct;
    if (!tcg) continue;
    const suspectCode = normalizePokemonSetCode(suspect.setCode);
    if (scanCode && suspectCode && scanCode !== suspectCode) continue;
    if (
      identity.collectorNumber &&
      suspect.collectorNumber &&
      !pokemonNumbersMatch(identity.collectorNumber, suspect.collectorNumber)
    ) {
      continue;
    }
    if (
      suspect.canonicalName &&
      suspect.canonicalName.toLowerCase() !== identity.displayName.toLowerCase()
    ) {
      continue;
    }
    return tcg;
  }
  return undefined;
}

function priorPriceChartingForIdentity(
  suspects: CardSuspect[],
  identity: PokemonScanIdentity,
): Record<string, unknown> | undefined {
  const scanCode = normalizePokemonSetCode(identity.setCode);
  for (const suspect of suspects) {
    const meta = scanDerivedMetaFromSuspect(suspect);
    const pc = meta?.priceChartingProduct as Record<string, unknown> | undefined;
    if (!pc) continue;
    const suspectCode = normalizePokemonSetCode(suspect.setCode);
    if (scanCode && suspectCode && scanCode !== suspectCode) continue;
    if (
      identity.collectorNumber &&
      suspect.collectorNumber &&
      !pokemonNumbersMatch(identity.collectorNumber, suspect.collectorNumber)
    ) {
      continue;
    }
    if (
      suspect.canonicalName &&
      suspect.canonicalName.toLowerCase() !== identity.displayName.toLowerCase()
    ) {
      continue;
    }
    return pc;
  }
  return undefined;
}

export function ensurePokemonScanDerivedFallback(input: {
  suspects: CardSuspect[];
  assessments: SuspectAssessment[];
  imageEvidence: ImageEvidenceReport;
}): {
  suspects: CardSuspect[];
  assessments: SuspectAssessment[];
  notes: string[];
} {
  if (!hasMinimumPokemonPickerEvidence(input.imageEvidence)) {
    return { suspects: input.suspects, assessments: input.assessments, notes: [] };
  }

  const scanIdentity = extractPokemonScanIdentity(input.imageEvidence);
  if (!scanIdentity) {
    return { suspects: input.suspects, assessments: input.assessments, notes: [] };
  }

  const policy = shouldInjectScanDerivedPokemon({
    scanIdentity,
    suspects: input.suspects,
  });
  if (!policy.inject) {
    return { suspects: input.suspects, assessments: input.assessments, notes: [] };
  }

  const priorTcg = priorTcgJapanForIdentity(input.suspects, scanIdentity);
  const priorPc = priorPriceChartingForIdentity(input.suspects, scanIdentity);

  const built = buildScanDerivedPokemonSuspect(
    scanIdentity,
    priorTcg
      ? "tcgplayer_japan_exact"
      : priorPc
        ? "pricecharting_exact"
        : "manual_price_required",
    priorPc,
    priorTcg,
  );
  const suspectId = built.suspect.suspectId;
  const isJp = isJapaneseLanguage(scanIdentity.language);

  const suspects = policy.prioritize
    ? [built.suspect, ...input.suspects.filter((s) => s.suspectId !== suspectId)]
    : [...input.suspects.filter((s) => s.suspectId !== suspectId), built.suspect];

  const priorTop = input.assessments.reduce(
    (max, a) => Math.max(max, a.matchScore),
    0,
  );
  const scanScore = policy.prioritize
    ? Math.max(isJp ? 0.96 : 0.9, priorTop + 0.02)
    : Math.min(0.72, priorTop);

  const scanAssessment: SuspectAssessment = {
    ...built.assessment,
    matchScore: Math.min(1, scanScore),
    canConfirm: Boolean(scanIdentity.setCode && scanIdentity.collectorNumber),
    canEliminate: false,
    reasoning: isJp
      ? `Scan identity: ${built.suspect.label} — Japanese printing; confirm against customer photos.`
      : built.assessment.reasoning,
  };

  const assessments = policy.prioritize
    ? [
        scanAssessment,
        ...input.assessments
          .filter((a) => a.suspectId !== suspectId)
          .sort((a, b) => b.matchScore - a.matchScore),
      ]
    : [
        ...input.assessments
          .filter((a) => a.suspectId !== suspectId)
          .sort((a, b) => b.matchScore - a.matchScore),
        scanAssessment,
      ];

  const notes = [
    isJp
      ? "Japanese scan-derived candidate prioritized alongside catalog options."
      : policy.prioritize
        ? "Scan-derived candidate prioritized — no catalog matches found."
        : "Scan-derived candidate added as fallback — catalog name matches kept.",
  ];

  return { suspects, assessments, notes };
}

/** Prefill manual entry fields from front-scan evidence. */
export function evidenceToManualEntryDefaults(
  imageEvidence: ImageEvidenceReport,
): {
  name: string;
  setName?: string;
  setCode?: string;
  cardNumber?: string;
  finish?: string;
  language?: string;
} {
  const scan = extractPokemonScanIdentity(imageEvidence);
  if (!scan) {
    const name =
      getSlotValue(imageEvidence, "card_name") ??
      getSlotValue(imageEvidence, "name") ??
      "";
    return {
      name,
      setName: getSlotValue(imageEvidence, "set_name") ?? undefined,
      setCode: getSlotValue(imageEvidence, "set_code") ?? undefined,
      cardNumber:
        getSlotValue(imageEvidence, "collector_number") ??
        getSlotValue(imageEvidence, "card_number") ??
        undefined,
      finish: getSlotValue(imageEvidence, "foil_pattern") ?? undefined,
      language: normLang(getSlotValue(imageEvidence, "language")),
    };
  }

  return {
    name: scan.nativeName
      ? `${scan.displayName} / ${scan.nativeName}`
      : scan.displayName,
    setName: scan.setName,
    setCode: scan.setCode,
    cardNumber: scan.collectorNumber,
    finish: scan.finish,
    language: scan.language,
  };
}

import type { CardCategory, CardSuspect, LockedCardIdentity } from "../types";
import { tcgplayerJapanProductFromSuspect } from "../tcgplayer-japan-catalog";
import type {
  MarketIdentityFields,
  MarketSearchPlan,
  MarketSearchQuery,
} from "./types";
import {
  appendEbayQueryExclusions,
  buildForbiddenTerms,
  buildQueryExclusionTerms,
  EBAY_Q_MAX_LENGTH,
} from "./query-exclusions";
import {
  buildRiftboundForbiddenTerms,
  buildRiftboundRequiredTerms,
  riftboundVariantContextFromFields,
} from "./riftbound-comp-rules";
import {
  buildMtgActiveSanityQueries,
  buildMtgCrossPrintForbiddenTerms,
} from "./mtg-pricecharting-match";

function quoted(parts: string[]): string {
  return parts.filter(Boolean).map((p) => `"${p}"`).join(" ");
}

function gradeContext(fields: MarketIdentityFields): "raw" | "graded" | "unknown" {
  if (fields.gradingCompany && fields.grade) return "graded";
  const finish = (fields.finish ?? "").toLowerCase();
  if (finish === "raw" || finish === "normal" || finish === "nonfoil") return "raw";
  if (fields.gradingCompany || fields.grade) return "graded";
  return "raw";
}

function categoryForbidden(
  category: CardCategory,
  gradeCtx: "raw" | "graded" | "unknown",
  fields?: MarketIdentityFields,
): string[] {
  if (category === "riftbound" && fields) {
    const ctx = riftboundVariantContextFromFields(fields);
    return buildRiftboundForbiddenTerms(ctx, gradeCtx === "graded" ? "graded" : "raw");
  }
  return buildForbiddenTerms(category, gradeCtx);
}

function categoryRequired(
  fields: MarketIdentityFields,
  gradeCtx: "raw" | "graded" | "unknown",
): string[] {
  const req: string[] = [];
  const name = fields.canonicalName?.trim();
  if (name) req.push(name);

  if (fields.category === "sports") {
    if (fields.setName) req.push(fields.setName.split(" ").slice(0, 3).join(" "));
    if (fields.cardNumber) req.push(fields.cardNumber.replace(/^#/, ""));
    const parallel =
      fields.finish ??
      fields.variantTags?.find((t) =>
        /prizm|parallel|silver|green|gold|purple/i.test(t),
      );
    if (parallel && parallel !== "raw") req.push(parallel);
  } else if (fields.category === "mtg") {
    if (fields.setCode) req.push(fields.setCode);
    else if (fields.setName) req.push(fields.setName);
    const num = fields.collectorNumber ?? fields.cardNumber;
    if (num) req.push(num);
    if (fields.finish && !["unknown_finish", "unknown"].includes(fields.finish)) {
      req.push(fields.finish);
    }
  } else if (fields.category === "yugioh") {
    if (fields.setCode) req.push(fields.setCode);
    if (fields.edition) req.push(fields.edition);
    if (fields.rarity) req.push(fields.rarity);
  } else if (fields.category === "riftbound") {
    const ctx = riftboundVariantContextFromFields(fields);
    return buildRiftboundRequiredTerms({
      name: fields.canonicalName,
      setCode: fields.setCode,
      collectorNumber: fields.collectorNumber ?? fields.cardNumber,
      ctx,
    });
  } else {
    if (fields.setName) req.push(fields.setName);
    const num = fields.collectorNumber ?? fields.cardNumber;
    if (num) req.push(num.split("/")[0] ?? num);
    if (
      fields.finish &&
      !["unknown_finish", "unknown"].includes(fields.finish)
    ) {
      req.push(fields.finish);
    }
  }

  if (gradeCtx === "graded" && fields.gradingCompany) {
    req.push(fields.gradingCompany);
    if (fields.grade) req.push(fields.grade);
  }

  return [...new Set(req.filter(Boolean))];
}

function buildQueries(
  fields: MarketIdentityFields,
  gradeCtx: "raw" | "graded" | "unknown",
  forbidden: string[],
  required: string[],
  queryExclusionTerms: string[],
): {
  exact: MarketSearchQuery[];
  narrow: MarketSearchQuery[];
  broad: MarketSearchQuery[];
} {
  const name = fields.canonicalName ?? "";
  const set = fields.setName ?? "";
  const setCode = fields.setCode ?? "";
  const num = fields.collectorNumber ?? fields.cardNumber ?? "";
  const finish = fields.finish ?? "";
  const parallel = fields.variantTags?.find((t) =>
    /prizm|parallel|silver|green|holo|foil|reverse/i.test(t),
  );

  const exact: MarketSearchQuery[] = [];
  const narrow: MarketSearchQuery[] = [];
  const broad: MarketSearchQuery[] = [];

  const mk = (
    positiveQuery: string,
    purpose: MarketSearchQuery["purpose"],
    notes: string[],
  ): MarketSearchQuery => {
    const skipExclusions = purpose === "broad_candidate_discovery";
    const { query, appliedExclusions, droppedExclusions } = skipExclusions
      ? {
          query: positiveQuery,
          appliedExclusions: [] as string[],
          droppedExclusions: queryExclusionTerms,
        }
      : appendEbayQueryExclusions(positiveQuery, queryExclusionTerms);

    const queryNotes = [...notes];
    if (appliedExclusions.length) {
      queryNotes.push(
        `eBay exclusions: ${appliedExclusions.map((t) => `-${t}`).join(" ")}`,
      );
    }
    if (droppedExclusions.length) {
      queryNotes.push(
        `${droppedExclusions.length} exclusion(s) omitted — q max ${EBAY_Q_MAX_LENGTH} chars`,
      );
    }

    return {
      query,
      purpose,
      requiredTerms: required,
      forbiddenTerms: forbidden,
      queryExclusionTerms: appliedExclusions,
      notes: queryNotes,
    };
  };

  if (fields.category === "sports") {
    const base = [fields.setName, name, num ? `#${num.replace(/^#/, "")}` : ""]
      .filter(Boolean)
      .join(" ");
    if (parallel) {
      exact.push(
        mk(`${base} ${parallel}`, "exact", ["Sports parallel-specific exact query"]),
      );
    }
    exact.push(mk(base, "exact", ["Sports exact player/set/number query"]));
    narrow.push(mk(`${set} ${name} ${num}`.trim(), "narrow", ["Sports narrow query"]));
  } else if (fields.category === "mtg") {
    const foilTag =
      finish === "foil" || finish === "holofoil" ? "foil" : finish === "nonfoil" ? "nonfoil" : "";
    exact.push(
      mk(
        quoted([name, setCode || set, num, foilTag].filter(Boolean) as string[]),
        "exact",
        ["MTG exact name/set code/collector query"],
      ),
    );
    narrow.push(
      mk([name, set, num, foilTag].filter(Boolean).join(" "), "narrow", ["MTG narrow query"]),
    );
  } else if (fields.category === "yugioh") {
    exact.push(
      mk(
        [name, setCode, fields.edition, fields.rarity].filter(Boolean).join(" "),
        "exact",
        ["Yu-Gi-Oh exact set/edition query"],
      ),
    );
  } else if (fields.category === "riftbound") {
    const ctx = riftboundVariantContextFromFields(fields);
    const num = fields.collectorNumber ?? fields.cardNumber ?? "";
    const variantLabel = ctx.isSignature
      ? "Signature"
      : ctx.isOvernumbered
        ? "Overnumbered"
        : ctx.isAltArt
          ? "Alternate Art"
          : ctx.isUltimate
            ? "Ultimate"
            : "";
    exact.push(
      mk(
        quoted(["Riftbound", name, setCode || set, num ? `#${num}` : "", variantLabel].filter(Boolean) as string[]),
        "exact",
        ["Riftbound exact set/collector/variant query"],
      ),
    );
    if (ctx.isAltArt) {
      exact.push(
        mk(`Riftbound ${name} #${num} Alternate Art`.trim(), "exact", [
          "Riftbound alternate art exact query",
        ]),
      );
    }
    if (ctx.isOvernumbered && !ctx.isSignature) {
      exact.push(
        mk(`Riftbound ${name} #${num} Overnumbered`.trim(), "exact", [
          "Riftbound overnumbered exact query",
        ]),
      );
    }
    if (ctx.isSignature) {
      exact.push(
        mk(`Riftbound ${name} #${num} Signature`.trim(), "exact", [
          "Riftbound signature overnumbered exact query",
        ]),
      );
    }
    narrow.push(
      mk(`${name} ${setCode} ${num}`.trim(), "narrow", ["Riftbound narrow query"]),
    );
  } else {
    exact.push(
      mk(quoted([name, set, num].filter(Boolean) as string[]), "exact", [
        "Pokémon exact name/set/number query",
      ]),
    );
    narrow.push(
      mk(`${name} ${num} ${set}`.trim(), "narrow", ["Pokémon narrow query"]),
    );
    exact.push(
      mk(`${name} ${num} ${set} Pokemon`.trim(), "exact", ["Pokémon marketplace query"]),
    );
  }

  if (gradeCtx === "graded" && fields.gradingCompany && fields.grade) {
    exact.push(
      mk(
        `${fields.gradingCompany} ${fields.grade} ${name} ${set} ${num}`.trim(),
        "graded_exact",
        ["Graded slab exact query"],
      ),
    );
  } else if (gradeCtx === "raw") {
    exact.push(
      mk(`${name} ${set} ${num}`.trim(), "raw_exact", ["Raw card exact query"]),
    );
  }

  broad.push(
    mk(name, "broad_candidate_discovery", [
      "Broad discovery only — not for valuation",
    ]),
  );

  return { exact, narrow, broad };
}

export function identityFieldsFromLocked(
  locked: LockedCardIdentity,
): MarketIdentityFields {
  return {
    category: locked.category,
    canonicalName: locked.canonicalName,
    marketProductName: locked.marketProductName,
    setName: locked.setName,
    setCode: locked.setCode,
    cardNumber: locked.cardNumber,
    collectorNumber: locked.collectorNumber,
    language: locked.language,
    rarity: locked.rarity,
    finish: locked.finish,
    edition: locked.edition,
    variantTags: locked.variantTags,
    gradingCompany: locked.gradingCompany,
    grade: locked.grade,
  };
}

export function identityFieldsFromSuspect(suspect: CardSuspect): MarketIdentityFields {
  const tcgJapan = tcgplayerJapanProductFromSuspect(suspect);
  return {
    category: suspect.category,
    canonicalName: suspect.canonicalName,
    marketProductName: suspect.label,
    setName: suspect.setName,
    setCode: suspect.setCode,
    cardNumber: suspect.cardNumber,
    collectorNumber: suspect.collectorNumber,
    language: suspect.language,
    rarity: suspect.rarity,
    finish: suspect.finish,
    edition: suspect.edition,
    variantTags: suspect.variantTags,
    gradingCompany: suspect.gradingCompany,
    grade: suspect.grade,
    suspectId: suspect.suspectId,
    catalogSource: suspect.catalogSource,
    tcgplayerJapanProductId: tcgJapan?.productId,
    scryfallCatalogData:
      suspect.catalogSource === "scryfall"
        ? (suspect.rawCatalogData as Record<string, unknown> | undefined)
        : undefined,
  };
}

export function buildMarketSearchPlan(
  fields: MarketIdentityFields,
  options: {
    lockedIdentityUsed: boolean;
    suspectId?: string;
  },
): MarketSearchPlan {
  const gradeCtx = gradeContext(fields);
  const forbidden = categoryForbidden(fields.category, gradeCtx, fields);
  if (fields.category === "mtg") {
    forbidden.push(...buildMtgCrossPrintForbiddenTerms(fields));
  }
  const queryExclusionTerms = buildQueryExclusionTerms(
    fields.category,
    gradeCtx,
    fields,
  );
  const required = categoryRequired(fields, gradeCtx);
  const { exact, narrow, broad } = buildQueries(
    fields,
    gradeCtx,
    forbidden,
    required,
    queryExclusionTerms,
  );

  const warnings: string[] = [];
  if (!fields.canonicalName) {
    warnings.push("Missing card name — search plan may be too broad.");
  }
  if (gradeCtx === "graded" && !fields.gradingCompany) {
    warnings.push("Graded context but grading company unknown.");
  }
  if (
    fields.finish &&
    ["unknown", "unknown_finish"].includes(fields.finish.toLowerCase())
  ) {
    warnings.push("Finish unknown — comps may mix foil/nonfoil variants.");
  }

  const allQueries = [...exact, ...narrow];
  const droppedCount = allQueries.reduce(
    (n, q) =>
      n +
      (q.notes.some((note) => note.includes("exclusion(s) omitted")) ? 1 : 0),
    0,
  );
  if (droppedCount > 0) {
    warnings.push(
      "Some eBay query exclusions dropped due to q length limit — comp matcher still applies full forbiddenTerms.",
    );
  }

  const planId = options.suspectId
    ? `suspect:${options.suspectId}`
    : options.lockedIdentityUsed
      ? "locked:identity"
      : `plan:${fields.canonicalName ?? "unknown"}`;

  const activeSanityQueries =
    fields.category === "mtg"
      ? buildMtgActiveSanityQueries(fields).map((q) => ({
          query: q.query,
          purpose: "active_sanity_check" as const,
          requiredTerms: required,
          forbiddenTerms: forbidden,
          queryExclusionTerms,
          notes: q.notes,
        }))
      : undefined;

  return {
    planId,
    suspectId: options.suspectId,
    lockedIdentityUsed: options.lockedIdentityUsed,
    category: fields.category,
    marketProductName:
      fields.marketProductName ??
      [fields.canonicalName, fields.setName, fields.collectorNumber]
        .filter(Boolean)
        .join(" · "),
    gradeContext: gradeCtx,
    gradingCompany: fields.gradingCompany,
    grade: fields.grade,
    exactQueries: exact,
    narrowQueries: narrow,
    broadQueries: broad,
    requiredTerms: required,
    forbiddenTerms: [...new Set(forbidden)],
    queryExclusionTerms,
    identityFinish: fields.finish,
    identitySetCode: fields.setCode,
    identityCollectorNumber: fields.collectorNumber ?? fields.cardNumber,
    identityLanguage: fields.language,
    catalogSource: fields.catalogSource,
    tcgplayerJapanProductId: fields.tcgplayerJapanProductId,
    activeSanityQueries,
    scryfallCatalogData: fields.scryfallCatalogData,
    warnings,
  };
}

export function buildLockedIdentitySearchPlan(
  locked: LockedCardIdentity,
): MarketSearchPlan {
  return buildMarketSearchPlan(identityFieldsFromLocked(locked), {
    lockedIdentityUsed: true,
  });
}

export function buildSuspectSearchPlan(suspect: CardSuspect): MarketSearchPlan {
  return buildMarketSearchPlan(identityFieldsFromSuspect(suspect), {
    lockedIdentityUsed: false,
    suspectId: suspect.suspectId,
  });
}

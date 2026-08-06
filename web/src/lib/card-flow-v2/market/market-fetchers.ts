import type { VisionResult } from "../../types";
import {
  fetchEbayActiveByQueryWithHealth,
  fetchEbaySoldByQueriesWithHealth,
} from "../../processing/pricing/ebay-comps";
import { fetchPriceChartingComps } from "../../processing/pricing/pricecharting-pricing";
import { lookupCatalogPrice } from "../../processing/catalog-pricing";
import { tcgPlayerAnyPrice, tcgPlayerMarketForRarity } from "../../processing/pokemon-utils";
import { v2CategoryToLegacy } from "../evidence-utils";
import type { MarketSearchPlan, RawMarketComp } from "./types";
import {
  pickPriceChartingTiersForPlan,
  priceChartingCompsFromPlan,
} from "./pricecharting-tier";
import {
  isCardFlowV2MarketEnableEbay,
  isCardFlowV2MarketEnablePriceCharting,
  isCardFlowV2MarketEnableTcgplayer,
} from "../feature-flag";
import type {
  MarketSourceHealth,
  PriceChartingMappingAudit,
  QueryStrategyAudit,
  TcgplayerMappingAudit,
} from "./source-health-types";
import { enrichTcgplayerMappingConditionLows } from "./tcgplayer-condition-lows";
import { suspectBlocksTcgplayerPricingFromPlan } from "./tcgplayer-japanese-guard";
import {
  describeTcgplayerFinishRequested,
  finishToTcgplayerVariantKeys,
  tcgplayerVariantMatchesFinish,
} from "./tcgplayer-finish-mapper";
import { emptySourceHealth } from "./source-health";
import { assessMtgPriceChartingProductIdentity } from "./mtg-pricecharting-match";
import { buildScryfallPrintPriceComps } from "./scryfall-print-price";
import {
  fetchTcgplayerProductDetails,
  tcgplayerProductPageUrl,
} from "../tcgplayer-japan-catalog";

export type MarketFetchResult = {
  comps: RawMarketComp[];
  warnings: string[];
  sourceHealth: MarketSourceHealth[];
  queryFetchMeta: Array<{
    source: RawMarketComp["source"];
    query: string;
    purpose: string;
    rawResults: number;
    httpStatus?: number;
    fatalError?: string;
  }>;
  tcgplayerMapping?: TcgplayerMappingAudit;
  priceChartingMapping?: PriceChartingMappingAudit;
};

function planToVision(plan: MarketSearchPlan): VisionResult {
  const name =
    plan.requiredTerms.find((t) => t.length > 1 && !/\d/.test(t) && !t.includes("_")) ??
    plan.marketProductName.split("·")[0]?.trim() ??
    plan.requiredTerms[0] ??
    "";
  const isGraded = plan.gradeContext === "graded";
  const setName =
    plan.requiredTerms.find(
      (t) => t.length > 3 && t !== name && !/\d/.test(t) && !t.includes("_"),
    ) ?? undefined;
  const cardNumber =
    plan.identityCollectorNumber ??
    plan.requiredTerms.find((t) => /\d/.test(t) && !t.includes("_")) ??
    undefined;
  const variant = plan.identityFinish?.replace(/_/g, " ");
  return {
    category: v2CategoryToLegacy(plan.category),
    itemType: isGraded ? "graded" : "raw",
    cardName: name,
    setName,
    setCode: plan.identitySetCode,
    cardNumber,
    language: plan.identityLanguage,
    variant,
    slabCompany: plan.gradingCompany,
    slabGrade: plan.grade,
    conditionEstimate: "LP",
    confidence: 0.7,
  };
}

function queriesToRun(plan: MarketSearchPlan): Array<{ query: string; purpose: string }> {
  const exact = plan.exactQueries.map((q) => ({
    query: q.query,
    purpose: q.purpose,
  }));
  const narrow = plan.narrowQueries.map((q) => ({
    query: q.query,
    purpose: q.purpose,
  }));
  const seen = new Set<string>();
  return [...exact, ...narrow].filter((q) => {
    if (!q.query || seen.has(q.query)) return false;
    seen.add(q.query);
    return true;
  });
}

export async function fetchMarketCompsForPlan(
  plan: MarketSearchPlan,
): Promise<MarketFetchResult> {
  const warnings = [...plan.warnings];
  const comps: RawMarketComp[] = [];
  const sourceHealth: MarketSourceHealth[] = [];
  const queryFetchMeta: MarketFetchResult["queryFetchMeta"] = [];

  let ebaySoldHealth: MarketSourceHealth = emptySourceHealth(
    "ebay_sold",
    "eBay sold disabled by flag",
  );
  let ebayActiveHealth: MarketSourceHealth = emptySourceHealth(
    "ebay_active",
    "eBay active disabled by flag",
  );
  let tcgHealth: MarketSourceHealth = emptySourceHealth(
    "tcgplayer",
    "TCGplayer disabled by flag",
  );
  let pcHealth: MarketSourceHealth = emptySourceHealth(
    "pricecharting",
    "PriceCharting disabled by flag",
  );

  let tcgplayerMapping: TcgplayerMappingAudit | undefined;
  let priceChartingMapping: PriceChartingMappingAudit | undefined;

  if (isCardFlowV2MarketEnableEbay()) {
    const queryEntries = queriesToRun(plan);
    const queries = queryEntries.map((q) => q.query);

    ebaySoldHealth = {
      source: "ebay_sold",
      attempted: true,
      apiPath: "buy/marketplace_insights/v1_beta/item_sales/search",
      rawResultCount: 0,
      normalizedResultCount: 0,
      acceptedCount: 0,
      maybeCount: 0,
      rejectedCount: 0,
      priceSignalsFound: 0,
      warnings: [],
    };

    const soldResults = await fetchEbaySoldByQueriesWithHealth(queries, 20);
    for (const batch of soldResults) {
      const purpose =
        queryEntries.find((q) => q.query === batch.query)?.purpose ?? "exact";
      queryFetchMeta.push({
        source: "ebay_sold",
        query: batch.query,
        purpose,
        rawResults: batch.rawCount,
        httpStatus: batch.httpStatus,
        fatalError: batch.fatalError,
      });

      ebaySoldHealth.rawResultCount += batch.rawCount;
      ebaySoldHealth.normalizedResultCount += batch.normalizedCount;
      if (batch.httpStatus) ebaySoldHealth.httpStatus = batch.httpStatus;
      if (batch.fatalError) {
        ebaySoldHealth.fatalError = batch.fatalError;
        if (batch.errorBody) {
          ebaySoldHealth.warnings.push(batch.errorBody.slice(0, 120));
        }
      }
      if (batch.query && !ebaySoldHealth.query) {
        ebaySoldHealth.query = batch.query;
      }

      for (const c of batch.candidates) {
        comps.push({
          source: "ebay_sold",
          title: c.title ?? "",
          price: c.price,
          soldDate: c.date,
          queryUsed: batch.query,
          conditionText: c.condition,
          rawData: c,
        });
      }
    }

    if (soldResults.every((r) => r.fatalError === "credentials_missing")) {
      ebaySoldHealth.fatalError = "credentials_missing";
      ebaySoldHealth.reasonIfSkipped = "EBAY_CLIENT_ID/SECRET not configured";
    }

    const sanityQueryCandidates = [
      ...(plan.activeSanityQueries?.map((q) => q.query) ?? []),
      plan.exactQueries[0]?.query,
      plan.narrowQueries[0]?.query,
    ].filter((q): q is string => Boolean(q));

    const seenSanity = new Set<string>();
    const sanityQueries = sanityQueryCandidates.filter((q) => {
      if (seenSanity.has(q)) return false;
      seenSanity.add(q);
      return true;
    });

    if (sanityQueries.length) {
      let activeResult: Awaited<
        ReturnType<typeof fetchEbayActiveByQueryWithHealth>
      > | null = null;
      let sanityQuery = sanityQueries[0]!;

      for (const q of sanityQueries) {
        const result = await fetchEbayActiveByQueryWithHealth(q, 10);
        sanityQuery = q;
        activeResult = result;
        if (result.normalizedCount > 0) break;
      }

      if (activeResult) {
        ebayActiveHealth = {
          source: "ebay_active",
          attempted: true,
          apiPath: "buy/browse/v1/item_summary/search",
          query: sanityQuery,
          httpStatus: activeResult.httpStatus,
          rawResultCount: activeResult.rawCount,
          normalizedResultCount: activeResult.normalizedCount,
          acceptedCount: 0,
          maybeCount: 0,
          rejectedCount: 0,
          priceSignalsFound: 0,
          fatalError: activeResult.fatalError,
          warnings: [
            "Active listings are sanity-check only — not counted as sold comps",
          ],
        };

        queryFetchMeta.push({
          source: "ebay_active",
          query: sanityQuery,
          purpose: "active_sanity_check",
          rawResults: activeResult.rawCount,
          httpStatus: activeResult.httpStatus,
          fatalError: activeResult.fatalError,
        });

        for (const c of activeResult.candidates) {
          comps.push({
            source: "ebay_active",
            title: c.title ?? "",
            price: c.price,
            listingDate: c.date,
            queryUsed: sanityQuery,
            conditionText: c.condition,
            rawData: c,
          });
        }
      }
    } else {
      ebayActiveHealth.reasonIfSkipped = "no query available";
    }

    sourceHealth.push(ebaySoldHealth, ebayActiveHealth);
  } else {
    sourceHealth.push(ebaySoldHealth, ebayActiveHealth);
  }

  if (isCardFlowV2MarketEnablePriceCharting()) {
    priceChartingMapping = { attempted: true, tiersExcluded: [], warnings: [] };
    pcHealth = {
      source: "pricecharting",
      attempted: true,
      apiPath: "pricecharting product lookup",
      rawResultCount: 0,
      normalizedResultCount: 0,
      acceptedCount: 0,
      maybeCount: 0,
      rejectedCount: 0,
      priceSignalsFound: 0,
      warnings: [],
    };

    try {
      const vision = planToVision(plan);
      const lookup = await fetchPriceChartingComps(vision);
      priceChartingMapping.queryUsed =
        plan.exactQueries[0]?.query ?? vision.cardName;

      if (lookup?.product) {
        const productId = String(lookup.product.id ?? "");
        pcHealth.catalogId = productId;
        priceChartingMapping.productId = productId;

        const productName = String(lookup.product["product-name"] ?? "");
        priceChartingMapping.productName = productName;
        const pcIdentity = assessMtgPriceChartingProductIdentity(plan, productName);

        if (!pcIdentity.accepted) {
          const detailMsg = `PriceCharting rejected (${pcIdentity.details.reason}): expected ${pcIdentity.details.expectedSetCode ?? "?"} #${pcIdentity.details.expectedCollectorNumber ?? "?"}, got "${productName}"`;
          priceChartingMapping.reasonIfSkipped = "pricecharting_product_identity_mismatch";
          priceChartingMapping.identityMismatch = pcIdentity.details;
          priceChartingMapping.warnings.push(detailMsg);
          pcHealth.warnings.push(detailMsg);
          warnings.push(detailMsg);
        } else {
          const tiers = pickPriceChartingTiersForPlan(lookup.product, plan);
          const excluded = tiers.filter((t) => !t.accepted && t.cents).map((t) => t.label);
          priceChartingMapping.tiersExcluded = excluded;

          const selected = tiers.find((t) => t.accepted && t.cents);
          if (selected) {
            priceChartingMapping.tierSelected = selected.label;
            pcHealth.warnings.push(`Selected tier: ${selected.label}`);
          }

          priceChartingMapping.loosePrice = lookup.product["loose-price"]
            ? lookup.product["loose-price"] / 100
            : undefined;
          priceChartingMapping.gradedPrice = lookup.product["graded-price"]
            ? lookup.product["graded-price"] / 100
            : undefined;
          priceChartingMapping.manualOnlyPrice = lookup.product["manual-only-price"]
            ? lookup.product["manual-only-price"] / 100
            : undefined;

          const pc = priceChartingCompsFromPlan(lookup.product, plan);
          warnings.push(...pc.warnings);
          priceChartingMapping.warnings = pc.warnings;
          pcHealth.warnings.push(...pc.warnings);

          for (const tier of pc.comps) {
            pcHealth.priceSignalsFound += 1;
            pcHealth.normalizedResultCount += 1;
            comps.push({
              source: "pricecharting",
              title: `${productName} (${tier.label})`,
              price: tier.price,
              conditionText: tier.label,
              url: lookup.sourceUrl,
              queryUsed: priceChartingMapping.queryUsed,
              rawData: {
                tier: tier.label,
                product: lookup.product,
                pricingSignal: true,
              },
            });
          }
          pcHealth.rawResultCount = tiers.filter((t) => t.cents).length;
        }
      } else {
        priceChartingMapping.reasonIfSkipped = "no product match";
        pcHealth.reasonIfSkipped = "no product match";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      warnings.push(`PriceCharting fetch failed: ${msg}`);
      priceChartingMapping.error = msg;
      pcHealth.fatalError = msg;
    }
    sourceHealth.push(pcHealth);
  } else {
    sourceHealth.push(pcHealth);
  }

  const tcgCategories = new Set([
    "pokemon",
    "mtg",
    "yugioh",
    "lorcana",
    "onepiece",
    "riftbound",
  ]);

  if (
    isCardFlowV2MarketEnableTcgplayer() &&
    tcgCategories.has(plan.category) &&
    plan.tcgplayerJapanProductId &&
    plan.category === "pokemon"
  ) {
    tcgplayerMapping = {
      attempted: true,
      variantsFound: [],
      availableVariantNames: [],
      finishRequested: describeTcgplayerFinishRequested(plan.identityFinish),
      productId: plan.tcgplayerJapanProductId,
      productUrl: tcgplayerProductPageUrl(plan.tcgplayerJapanProductId),
    };
    tcgHealth = {
      source: "tcgplayer",
      attempted: true,
      apiPath: "tcgplayer_japan_product_details",
      productId: plan.tcgplayerJapanProductId,
      rawResultCount: 0,
      normalizedResultCount: 0,
      acceptedCount: 0,
      maybeCount: 0,
      rejectedCount: 0,
      priceSignalsFound: 0,
      warnings: ["TCGplayer Japan catalog prices are pricing signals, not sold comps"],
    };

    try {
      const details = await fetchTcgplayerProductDetails(plan.tcgplayerJapanProductId);
      const marketPrice =
        details?.marketPrice ?? details?.medianPrice ?? details?.lowestPrice;
      if (marketPrice != null && marketPrice > 0) {
        tcgHealth.rawResultCount += 1;
        tcgHealth.normalizedResultCount += 1;
        tcgHealth.priceSignalsFound += 1;
        tcgplayerMapping.selectedVariantName = "pokemon_japan_catalog";
        tcgplayerMapping.marketPrice = marketPrice;
        tcgplayerMapping.midPrice = details?.medianPrice;
        tcgplayerMapping.lowPrice = details?.lowestPrice ?? marketPrice;
        comps.push({
          source: "tcgplayer",
          title: `${plan.marketProductName} (TCGplayer Japan)`,
          price: marketPrice,
          conditionText: "market",
          url: tcgplayerMapping.productUrl,
          queryUsed: "tcgplayer_japan_product_details",
          rawData: {
            pricingSignal: true,
            productId: plan.tcgplayerJapanProductId,
            productLineName: details?.productLineName,
          },
        });
      } else {
        tcgplayerMapping.reasonIfSkipped =
          "TCGplayer Japan product found but no market price on catalog row";
        tcgHealth.reasonIfSkipped = tcgplayerMapping.reasonIfSkipped;
      }

      await enrichTcgplayerMappingConditionLows(tcgplayerMapping);
      if (tcgplayerMapping.conditionLowPrices?.NM != null) {
        tcgplayerMapping.lowPrice = tcgplayerMapping.conditionLowPrices.NM;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      warnings.push(`TCGplayer Japan catalog fetch failed: ${msg}`);
      tcgplayerMapping.error = msg;
      tcgHealth.fatalError = msg;
    }
    sourceHealth.push(tcgHealth);
  } else if (
    isCardFlowV2MarketEnableTcgplayer() &&
    tcgCategories.has(plan.category) &&
    !suspectBlocksTcgplayerPricingFromPlan(plan)
  ) {
    tcgplayerMapping = {
      attempted: true,
      variantsFound: [],
      availableVariantNames: [],
      finishRequested: describeTcgplayerFinishRequested(plan.identityFinish),
    };
    tcgHealth = {
      source: "tcgplayer",
      attempted: true,
      apiPath: "catalog_tcgplayer via lookupCatalogPrice",
      rawResultCount: 0,
      normalizedResultCount: 0,
      acceptedCount: 0,
      maybeCount: 0,
      rejectedCount: 0,
      priceSignalsFound: 0,
      warnings: ["TCGplayer prices are pricing signals, not sold comps"],
    };

    try {
      const vision = planToVision(plan);
      const catalog = await lookupCatalogPrice(vision);
      const raw = catalog.raw as Record<string, unknown> | undefined;
      const tcg = raw?.tcgplayer as
        | {
            url?: string;
            productId?: number | string;
            prices?: Record<
              string,
              { market?: number; mid?: number; low?: number; high?: number }
            >;
          }
        | undefined;
      const setInfo = raw?.set as { id?: string } | undefined;

      if (setInfo?.id) {
        tcgplayerMapping.groupId = setInfo.id;
      }

      if (tcg?.url?.trim()) {
        tcgplayerMapping.productUrl = tcg.url.trim();
      }

      if (tcg?.productId) {
        tcgHealth.productId = String(tcg.productId);
        tcgplayerMapping.productId = String(tcg.productId);
      }

      const prices = tcg?.prices ?? {};
      const variantKeys = Object.keys(prices);
      tcgplayerMapping.priceVariantCount = variantKeys.length;
      tcgplayerMapping.availableVariantNames = variantKeys;

      if (!variantKeys.length) {
        const rarity = String(raw?.rarity ?? "");
        const fallbackMarket = tcgPlayerMarketForRarity(
          prices,
          rarity,
          plan.identityFinish,
        );
        const anyMarket = fallbackMarket > 0 ? fallbackMarket : tcgPlayerAnyPrice(prices);
        if (anyMarket > 0) {
          tcgHealth.rawResultCount += 1;
          tcgHealth.normalizedResultCount += 1;
          tcgHealth.priceSignalsFound += 1;
          tcgplayerMapping.selectedVariantName = "group_price_fallback";
          tcgplayerMapping.marketPrice = anyMarket;
          tcgplayerMapping.reasonIfSkipped = undefined;
          comps.push({
            source: "tcgplayer",
            title: `${vision.cardName} (TCGplayer group fallback)`,
            price: anyMarket,
            conditionText: "group_fallback",
            url: tcg?.url,
            queryUsed: catalog.matchQuery ?? "catalog_tcgplayer",
            rawData: { pricingSignal: true, groupPriceFallback: true },
          });
        } else if (catalog.matchQuery) {
          tcgplayerMapping.reasonIfSkipped =
            "Pokémon catalog matched but tcgplayer.prices empty in API response";
        } else if (!catalog.estimated && raw) {
          tcgplayerMapping.reasonIfSkipped =
            "catalog card found but no TCGplayer price variants in response";
        } else {
          tcgplayerMapping.reasonIfSkipped =
            "no catalog match — cannot resolve TCGplayer product";
        }
        if (!tcgHealth.priceSignalsFound) {
          tcgHealth.reasonIfSkipped = tcgplayerMapping.reasonIfSkipped;
        }
      }

      const finishHint = plan.identityFinish;
      const preferredKeys = finishToTcgplayerVariantKeys(finishHint);

      for (const [variant, tier] of Object.entries(prices)) {
        tcgplayerMapping.variantsFound.push(variant);
        const signalPrice = tier.low ?? tier.market ?? tier.mid;
        if (!signalPrice || signalPrice <= 0) continue;

        if (
          finishHint &&
          !tcgplayerVariantMatchesFinish(finishHint, variant) &&
          variantKeys.length > 1
        ) {
          continue;
        }

        tcgHealth.rawResultCount += 1;
        tcgHealth.normalizedResultCount += 1;
        tcgHealth.priceSignalsFound += 1;
        tcgplayerMapping.subtype = variant;
        tcgplayerMapping.selectedVariantName = variant;
        tcgplayerMapping.finishMatched = variant;
        tcgplayerMapping.marketPrice = tier.market ?? tier.mid;
        tcgplayerMapping.midPrice = tier.mid;
        tcgplayerMapping.lowPrice = tier.low;
        tcgplayerMapping.highPrice = tier.high;

        comps.push({
          source: "tcgplayer",
          title: `${vision.cardName} (${variant})`,
          price: signalPrice,
          conditionText: variant,
          url: tcg?.url,
          queryUsed: catalog.matchQuery ?? "catalog_tcgplayer",
          rawData: { ...tier, pricingSignal: true, productId: tcg?.productId },
        });
        break;
      }

      if (variantKeys.length && !tcgHealth.priceSignalsFound) {
        for (const key of preferredKeys) {
          const tier = prices[key];
          const market = tier?.market ?? tier?.mid ?? tier?.low;
          if (market && market > 0) {
            tcgHealth.rawResultCount += 1;
            tcgHealth.normalizedResultCount += 1;
            tcgHealth.priceSignalsFound += 1;
            tcgplayerMapping.subtype = key;
            tcgplayerMapping.selectedVariantName = key;
            tcgplayerMapping.finishMatched = key;
            tcgplayerMapping.marketPrice = market;
            comps.push({
              source: "tcgplayer",
              title: `${vision.cardName} (${key})`,
              price: market,
              conditionText: key,
              url: tcg?.url,
              queryUsed: catalog.matchQuery ?? "catalog_tcgplayer",
              rawData: { ...tier, pricingSignal: true, finishFallback: true },
            });
            break;
          }
        }
      }

      if (variantKeys.length && !tcgHealth.priceSignalsFound) {
        for (const [variant, tier] of Object.entries(prices)) {
          const market = tier.market ?? tier.mid ?? tier.low;
          if (!market || market <= 0) continue;
          tcgHealth.rawResultCount += 1;
          tcgHealth.normalizedResultCount += 1;
          tcgHealth.priceSignalsFound += 1;
          tcgplayerMapping.subtype = variant;
          tcgplayerMapping.selectedVariantName = variant;
          tcgplayerMapping.marketPrice = market;
          tcgplayerMapping.reasonIfSkipped = `finish fallback used: ${variant}`;
          comps.push({
            source: "tcgplayer",
            title: `${vision.cardName} (${variant})`,
            price: market,
            conditionText: variant,
            url: tcg?.url,
            queryUsed: catalog.matchQuery ?? "catalog_tcgplayer",
            rawData: { ...tier, pricingSignal: true, skuFallback: true },
          });
          break;
        }
      }

      if (variantKeys.length && !tcgHealth.priceSignalsFound) {
        if (preferredKeys.length) {
          tcgplayerMapping.reasonIfSkipped =
            `TCGplayer price variants exist (${variantKeys.join(", ")}) but no exact finish match for ${finishHint ?? "unknown"}`;
        } else {
          tcgplayerMapping.reasonIfSkipped =
            "variants found but none matched plan finish";
        }
        tcgHealth.reasonIfSkipped = tcgplayerMapping.reasonIfSkipped;
      }

      if (tcgplayerMapping.productId) {
        await enrichTcgplayerMappingConditionLows(tcgplayerMapping);
        if (tcgplayerMapping.conditionLowPrices?.NM != null) {
          tcgplayerMapping.lowPrice = tcgplayerMapping.conditionLowPrices.NM;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      warnings.push(`TCGPlayer catalog fetch failed: ${msg}`);
      tcgplayerMapping.error = msg;
      tcgHealth.fatalError = msg;
    }
    sourceHealth.push(tcgHealth);
  } else if (!isCardFlowV2MarketEnableTcgplayer()) {
    sourceHealth.push(tcgHealth);
  } else if (suspectBlocksTcgplayerPricingFromPlan(plan)) {
    const skipReason =
      "Japanese or scan-derived printing — English Pokémon TCG catalog does not map to TCGplayer Japan.";
    tcgplayerMapping = {
      attempted: false,
      variantsFound: [],
      availableVariantNames: [],
      reasonIfSkipped: skipReason,
    };
    tcgHealth = emptySourceHealth("tcgplayer", skipReason);
    tcgHealth.reasonIfSkipped = skipReason;
    sourceHealth.push(tcgHealth);
  } else {
    tcgplayerMapping = {
      attempted: false,
      variantsFound: [],
      availableVariantNames: [],
      reasonIfSkipped: `category ${plan.category} not supported for TCGplayer catalog`,
    };
    tcgHealth.reasonIfSkipped = tcgplayerMapping.reasonIfSkipped;
    sourceHealth.push(tcgHealth);
  }

  if (plan.category === "mtg" && plan.scryfallCatalogData) {
    const scryfallComps = buildScryfallPrintPriceComps({
      category: plan.category,
      canonicalName: plan.requiredTerms[0],
      setCode: plan.requiredTerms.find((t) => /^[a-z]{2,5}$/i.test(t)),
      setName: plan.requiredTerms.find(
        (t) => t.length > 4 && !/^\d/.test(t) && !/foil|nonfoil/i.test(t),
      ),
      collectorNumber: plan.requiredTerms.find(
        (t) => /^\d{1,4}$/.test(t.trim()) || /^\d{1,4}\/\d{1,4}$/.test(t.trim()),
      ),
      finish: plan.identityFinish,
      scryfallCatalogData: plan.scryfallCatalogData,
    });
    comps.push(...scryfallComps);
  }

  return {
    comps,
    warnings,
    sourceHealth,
    queryFetchMeta,
    tcgplayerMapping,
    priceChartingMapping,
  };
}

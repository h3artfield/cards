/**
 * Directive 012 — Shopify inventory export.
 * Run: npm run test:directive-012-shopify-export
 */
import { encryptSecret, decryptSecret } from "../src/lib/crypto/secret-encryption";
import { maskShopifyAccessToken } from "../src/lib/shopify/mask-token";
import {
  shopifyExportEligibility,
  shopifyInventoryExportEligibility,
  isShopifyAlreadyExported,
  requiresManualShopifyPrice,
  shopifyExportStatusDisplay,
} from "../src/lib/shopify/eligibility";
import { formatShopifyApiErrorMessage, ShopifyApiError } from "../src/lib/shopify/client";
import {
  buildShopifyDescriptionHtml,
  buildShopifyProductTitle,
  buildShopifySku,
  buildShopifyTags,
  formatShopifyStoreCondition,
  resolveDefaultShopifyExportPrice,
  resolveShopifyListingMarketPrice,
  shopifyProductImageUrls,
} from "../src/lib/shopify/product-builder";
import type { BuybackOrder, InventoryItem, ScannedCard } from "../src/lib/types";
import type { ShopifyIntegration } from "../src/lib/shopify/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const integration: ShopifyIntegration = {
  enabled: true,
  shopDomain: "the-game-lodge.myshopify.com",
  defaultProductStatus: "DRAFT",
  publishOnlineStore: false,
  publishShopChannel: false,
  defaultVendor: "The Game Lodge",
  defaultProductType: "Trading Card",
  defaultTags: ["cardscanner9000", "buyback"],
  priceStrategy: "marketPrice",
};

const order: BuybackOrder = {
  id: "o1",
  orderNumber: "BB-000006",
  storeId: "default",
  customerId: "c1",
  status: "ready",
  offerType: "cash",
  createdAt: new Date().toISOString(),
};

function approvedCard(overrides: Partial<ScannedCard> = {}): ScannedCard {
  return {
    id: "card-abc-123",
    orderId: "o1",
    frontImageUrl: "https://example.com/customer-front.jpg",
    backImageUrl: "https://example.com/customer-back.jpg",
    itemType: "raw",
    status: "approved",
    staffDecision: "yes",
    detectedName: "Torkoal",
    setName: "Crimson Haze",
    cardNumber: "069/066",
    category: "pokemon",
    marketPrice: 4.5,
    cashOffer: 2.25,
    tradeOffer: 2.93,
    conditionEstimate: "LP",
    conditionReport: {
      estimatedGrade: "5.1",
      gradeRange: "4-6",
    } as never,
    cardFlowV2Identity: {
      category: "pokemon",
      suspects: [
        {
          suspectId: "s1",
          category: "pokemon",
          label: "Torkoal · Crimson Haze · 069/066",
          canonicalName: "Torkoal",
          catalogSource: "pokemon_tcg",
          referenceImageUrls: [
            "https://example.com/catalog-torkoal.jpg",
          ],
          variantTags: [],
          expectedEvidence: [],
        },
      ],
      suspectAssessments: [],
      lockedIdentity: {
        locked: true,
        lockStatus: "locked",
        confidence: 0.9,
        category: "pokemon",
        variantTags: [],
        requiredEvidenceSatisfied: true,
        missingRequiredEvidence: [],
        unresolvedVariantRisks: [],
        staffMessage: "Staff confirmed",
      },
      candidateGenerationNotes: [],
      createdAt: new Date().toISOString(),
      staffSelection: {
        suspectId: "s1",
        confirmedAt: new Date().toISOString(),
      },
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

console.log("\nDirective 012 — Shopify export\n");

console.log("Token encryption");
const token = "shpat_test_secret_token_1234";
const enc = encryptSecret(token);
const dec = decryptSecret(enc);
assert(dec === token, "encrypt/decrypt round-trip");
assert(
  maskShopifyAccessToken(token) === "shpat_****1234",
  "token masking",
);
assert(!enc.includes("shpat"), "ciphertext does not contain raw token");

console.log("\nEligibility");
const yes = approvedCard();
const el = shopifyExportEligibility(yes, order, integration);
assert(el.eligible, "approved card is eligible");

const noBuy = approvedCard({ status: "do_not_buy", staffDecision: "no" });
assert(
  !shopifyExportEligibility(noBuy, order, integration).eligible,
  "do_not_buy rejected",
);

const exported = approvedCard({
  shopifyExport: {
    status: "exported",
    productId: "gid://shopify/Product/1",
  },
});
assert(isShopifyAlreadyExported(exported), "detects already exported");
assert(
  !shopifyExportEligibility(exported, order, integration).eligible,
  "already exported not eligible",
);

console.log("\nInventory eligibility");
const inventoryItem: InventoryItem = {
  id: "inv-1",
  storeId: "default",
  cardId: "card-abc-123",
  orderId: "o1",
  orderNumber: "BB-000006",
  displayName: "Torkoal",
  purchasePrice: 2.25,
  purchaseType: "cash",
  acquiredAt: new Date().toISOString(),
  marketPrice: 4.5,
};
const invEl = shopifyInventoryExportEligibility(yes, inventoryItem, integration);
assert(invEl.eligible, "on-hand purchased card is eligible");

assert(
  !shopifyInventoryExportEligibility(null, inventoryItem, integration).eligible,
  "missing card rejected",
);

assert(
  !shopifyInventoryExportEligibility(
    exported,
    inventoryItem,
    integration,
  ).eligible,
  "already exported on-hand not eligible",
);

console.log("\nProduct builder");
const title = buildShopifyProductTitle(yes, order);
assert(title.includes("Torkoal"), "title includes card name");
assert(title.includes("069/066") || title.includes("#069/066"), "title includes number");

const sku = buildShopifySku(order, yes, 2);
assert(sku.startsWith("CS9K-BB-000006"), "SKU order prefix");

const tags = buildShopifyTags(yes, order, integration);
assert(tags.includes("pokemon"), "tags include pokemon");
assert(tags.includes("cardscanner9000"), "tags include cardscanner9000");

const price = resolveDefaultShopifyExportPrice(yes, integration);
assert(price.price === 4.5, "default export price uses marketPrice");

const wigglyCard = approvedCard({
  detectedName: "Wigglytuff ex",
  setName: "151",
  cardNumber: "187/165",
  marketPrice: 1.2,
  cardFlowV2OfferPreview: {
    previewMarketValue: 8.17,
    marketDecision: {
      usableForOfferPreview: true,
      basis: "tcgplayer_lowest_listing",
      confidence: "medium",
      marketValue: 8.17,
      blockers: [],
      warnings: [],
      sourceValues: [],
      explanation: "TCGplayer lowest listing",
    },
    createdAt: new Date().toISOString(),
  } as never,
});
assert(
  resolveShopifyListingMarketPrice(wigglyCard) === 8.17,
  "listing price prefers V2 preview over stale card.marketPrice",
);
assert(
  resolveDefaultShopifyExportPrice(wigglyCard, integration).price === 8.17,
  "default export price uses V2 preview market",
);

assert(
  formatShopifyStoreCondition(yes) === "LP",
  "Shopify condition omits scan grade",
);
const titleWithCond = buildShopifyProductTitle(yes, order);
assert(!titleWithCond.toLowerCase().includes("scan"), "title omits scan grade");

const description = buildShopifyDescriptionHtml(yes, order);
assert(!description.includes("Source order"), "description omits source order");
assert(!description.includes("Identity:"), "description omits identity line");
assert(!description.includes("scan"), "description omits scan grade");

const images = shopifyProductImageUrls(yes);
assert(images.length === 1, "uses catalog reference image");
assert(
  images[0] === "https://example.com/catalog-torkoal.jpg",
  "reference image not customer scan",
);
assert(
  !images.includes("https://example.com/customer-front.jpg"),
  "customer scan not used",
);

const manualCard = approvedCard({
  marketPrice: 0,
  cardFlowV2OfferPreview: {
    eligible: false,
    recommendedAction: "manual_price_required",
  } as never,
});
assert(
  requiresManualShopifyPrice(manualCard),
  "manual price required for low confidence",
);

console.log("\nRe-export eligibility");
assert(
  shopifyInventoryExportEligibility(exported, inventoryItem, integration, {
    allowReexport: true,
  }).eligible,
  "previously exported card can re-export when allowReexport",
);
assert(
  !shopifyInventoryExportEligibility(exported, inventoryItem, integration)
    .eligible,
  "previously exported card blocked without allowReexport",
);

console.log("\nExport status display");
const failedDisplay = shopifyExportStatusDisplay({
  status: "failed",
  error: "Media download failed: image URL not reachable",
  lastAttemptAt: "2026-07-08T19:05:48.000Z",
});
assert(failedDisplay.tone === "error", "failed export uses error tone");
assert(
  failedDisplay.error === "Media download failed: image URL not reachable",
  "failed export surfaces stored error",
);

const apiError = new ShopifyApiError("Product create failed", [
  { field: ["variants", "0", "price"], message: "Price is invalid" },
]);
assert(
  formatShopifyApiErrorMessage(apiError).includes("variants.0.price"),
  "Shopify API error includes field path",
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

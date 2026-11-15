/**
 * Token Creator settings. Every value can be changed per environment without a
 * code change; the defaults are what staging runs with.
 */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

export function tokenCreatorConfigV1() {
  return {
    /** Routine generation. */
    model: process.env.TOKEN_CREATOR_IMAGE_MODEL?.trim() || "gpt-image-2.5-flare",
    /** The higher-quality option. */
    modelHq: process.env.TOKEN_CREATOR_IMAGE_MODEL_HQ?.trim() || "gpt-image-2.5-sunburst",
    /** Tried in order when the configured model is unavailable to this API key. */
    fallbackModels: [process.env.OPENAI_IMAGE_MODEL?.trim(), "gpt-image-1"].filter(
      (m): m is string => Boolean(m),
    ),
    quality: process.env.TOKEN_CREATOR_IMAGE_QUALITY?.trim() || "medium",
    size: process.env.TOKEN_CREATOR_IMAGE_SIZE?.trim() || "1024x1536",
    requestTimeoutMs: intEnv("TOKEN_CREATOR_IMAGE_TIMEOUT_MS", 180_000),
    /** Images per customer per UTC day (generations use 4 each). */
    customerDailyImages: intEnv("TOKEN_CREATOR_CUSTOMER_DAILY_IMAGES", 30),
    /** Images per store per UTC day across all customers. */
    storeDailyImages: intEnv("TOKEN_CREATOR_STORE_DAILY_IMAGES", 400),
    /** Verified customer emails with no daily limit (comma-separated). */
    unlimitedEmails: (process.env.TOKEN_CREATOR_UNLIMITED_EMAILS ?? "h3artfield@gmail.com,beeers93@gmail.com")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    /** Internal cost estimate per image, for reporting. */
    imageCostCents: intEnv("TOKEN_CREATOR_IMAGE_COST_CENTS", 6),
    unitPriceCents: intEnv("TOKEN_CREATOR_UNIT_PRICE_CENTS", 500),
    maxQuantityPerDesign: intEnv("TOKEN_CREATOR_MAX_QTY_PER_DESIGN", 99),
    shopifyProductTitle: process.env.TOKEN_CREATOR_SHOPIFY_PRODUCT_TITLE?.trim() || "Custom Printed Token Card",
    /** A slot still "running" after this long is treated as lost and retried. */
    staleSlotMs: intEnv("TOKEN_CREATOR_STALE_SLOT_MS", 6 * 60_000),
  };
}

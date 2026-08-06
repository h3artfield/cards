export const STRIPE_STORE_PLAN_NAME = "Card Scanner 9000 Store Plan";
export const STRIPE_STORE_PLAN_PRICE_DISPLAY = "$100/month";
/** Stripe account / platform billing contact (forwards to Gmail via Cloudflare Email Routing) */
export const STRIPE_BILLING_CONTACT_EMAIL = "billing@cardscanner9000.com";
export const SUPPORT_CONTACT_EMAIL = "support@cardscanner9000.com";

export function getStripeSecretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY?.trim() || undefined;
}

export function getStripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
}

export function getStripeStorePriceId(): string | undefined {
  return process.env.STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY?.trim() || undefined;
}

export function getAppBaseUrl(): string {
  const url =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export function stripeConfigured(): boolean {
  return Boolean(getStripeSecretKey() && getStripeStorePriceId());
}

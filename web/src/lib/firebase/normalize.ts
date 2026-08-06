import type { ConditionEstimate, StoreRule, StoreSettings, StoreSubscription } from "../types";
import { DEFAULT_CONDITION_MULTIPLIERS, DEFAULT_STORE_SETTINGS } from "../constants";
import { normalizeStoreSlug } from "../store-slug";
import { normalizeShopifyIntegration } from "../shopify/normalize-integration";
import { normalizeCalendarSettings } from "../store-calendar/normalize";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function conditionMultipliers(
  raw: Record<string, unknown>,
): Record<ConditionEstimate, number> {
  const source =
    (raw.conditionMultipliers as Record<string, number> | undefined) ??
    (raw.condition_multipliers as Record<string, number> | undefined);

  if (!source) return { ...DEFAULT_CONDITION_MULTIPLIERS };

  return {
    NM: num(source.NM, DEFAULT_CONDITION_MULTIPLIERS.NM),
    LP: num(source.LP, DEFAULT_CONDITION_MULTIPLIERS.LP),
    MP: num(source.MP, DEFAULT_CONDITION_MULTIPLIERS.MP),
    HP: num(source.HP, DEFAULT_CONDITION_MULTIPLIERS.HP),
    DMG: num(source.DMG, DEFAULT_CONDITION_MULTIPLIERS.DMG),
  };
}

function normalizeStoreSubscription(
  raw: Record<string, unknown> | undefined,
): StoreSubscription | undefined {
  if (!raw) return undefined;
  const status = raw.status;
  if (typeof status !== "string") return undefined;
  const valid = ["active", "trialing", "past_due", "canceled", "incomplete"] as const;
  if (!valid.includes(status as (typeof valid)[number])) return undefined;
  return {
    provider: "stripe",
    status: status as StoreSubscription["status"],
    stripeCustomerId:
      raw.stripeCustomerId != null
        ? String(raw.stripeCustomerId)
        : raw.stripe_customer_id != null
          ? String(raw.stripe_customer_id)
          : undefined,
    stripeSubscriptionId:
      raw.stripeSubscriptionId != null
        ? String(raw.stripeSubscriptionId)
        : raw.stripe_subscription_id != null
          ? String(raw.stripe_subscription_id)
          : undefined,
    currentPeriodEnd:
      raw.currentPeriodEnd != null
        ? String(raw.currentPeriodEnd)
        : raw.current_period_end != null
          ? String(raw.current_period_end)
          : undefined,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()),
  };
}

/** Merge Firestore store doc with app defaults (never overwrites Firestore on read). */
export function normalizeStoreSettings(
  raw: Record<string, unknown> | undefined,
  docId?: string,
): StoreSettings {
  const base: StoreSettings = {
    id: docId ?? "default",
    ...DEFAULT_STORE_SETTINGS,
  };
  if (!raw) return base;

  const storeName = String(raw.storeName ?? raw.store_name ?? base.storeName);
  const id = docId ?? String(raw.id ?? "default");

  return {
    id,
    storeName,
    storeSlug: normalizeStoreSlug(
      raw.storeSlug != null
        ? String(raw.storeSlug)
        : raw.store_slug != null
          ? String(raw.store_slug)
          : undefined,
      storeName,
    ),
    storeLogoUrl:
      raw.storeLogoUrl != null
        ? String(raw.storeLogoUrl)
        : raw.store_logo_url != null
          ? String(raw.store_logo_url)
          : undefined,
    ownerEmail: String(raw.ownerEmail ?? raw.owner_email ?? base.ownerEmail),
    ownerName:
      raw.ownerName != null
        ? String(raw.ownerName)
        : raw.owner_name != null
          ? String(raw.owner_name)
          : undefined,
    phone: raw.phone != null ? String(raw.phone) : undefined,
    address: raw.address != null ? String(raw.address) : undefined,
    website: raw.website != null ? String(raw.website) : undefined,
    subscription: normalizeStoreSubscription(
      (raw.subscription as Record<string, unknown> | undefined) ??
        (raw.store_subscription as Record<string, unknown> | undefined),
    ),
    defaultCashPercent: num(
      raw.defaultCashPercent ?? raw.default_cash_percent ?? raw.cashPercent,
      base.defaultCashPercent,
    ),
    defaultTradePercent: num(
      raw.defaultTradePercent ?? raw.default_trade_percent ?? raw.tradePercent,
      base.defaultTradePercent,
    ),
    slabCashPercent: num(
      raw.slabCashPercent ?? raw.slab_cash_percent,
      base.slabCashPercent,
    ),
    slabTradePercent: num(
      raw.slabTradePercent ?? raw.slab_trade_percent,
      base.slabTradePercent,
    ),
    manualReviewThreshold: num(
      raw.manualReviewThreshold ?? raw.manual_review_threshold,
      base.manualReviewThreshold,
    ),
    minimumOffer: num(raw.minimumOffer ?? raw.minimum_offer, base.minimumOffer),
    conditionMultipliers: conditionMultipliers(raw),
    emailNotificationsEnabled: bool(
      raw.emailNotificationsEnabled ?? raw.email_notifications_enabled,
      base.emailNotificationsEnabled,
    ),
    smsNotificationsEnabled: bool(
      raw.smsNotificationsEnabled ?? raw.sms_notifications_enabled,
      base.smsNotificationsEnabled,
    ),
    shopifyIntegration: normalizeShopifyIntegration(
      (raw.shopifyIntegration as Record<string, unknown> | undefined) ??
        (raw.shopify_integration as Record<string, unknown> | undefined),
    ),
    calendarSettings: normalizeCalendarSettings(
      (raw.calendarSettings as Record<string, unknown> | undefined) ??
        (raw.calendar_settings as Record<string, unknown> | undefined),
    ),
  };
}

export function normalizeStoreRule(
  id: string,
  raw: Record<string, unknown>,
): StoreRule {
  const now = new Date().toISOString();
  return {
    id,
    storeId:
      raw.storeId != null
        ? String(raw.storeId)
        : raw.store_id != null
          ? String(raw.store_id)
          : undefined,
    title: String(raw.title ?? "Untitled rule"),
    active: raw.active !== false,
    priority: num(raw.priority, 0),
    appliesToCategories: Array.isArray(raw.appliesToCategories)
      ? (raw.appliesToCategories as StoreRule["appliesToCategories"])
      : Array.isArray(raw.applies_to_categories)
        ? (raw.applies_to_categories as StoreRule["appliesToCategories"])
        : [],
    ruleType: (raw.ruleType ?? raw.rule_type ?? "note_only") as StoreRule["ruleType"],
    ruleText: String(raw.ruleText ?? raw.rule_text ?? ""),
    structuredFilters:
      (raw.structuredFilters as Record<string, unknown> | undefined) ??
      (raw.structured_filters as Record<string, unknown> | undefined),
    cashPercentOverride:
      raw.cashPercentOverride != null
        ? num(raw.cashPercentOverride, 0)
        : raw.cash_percent_override != null
          ? num(raw.cash_percent_override, 0)
          : undefined,
    tradePercentOverride:
      raw.tradePercentOverride != null
        ? num(raw.tradePercentOverride, 0)
        : raw.trade_percent_override != null
          ? num(raw.trade_percent_override, 0)
          : undefined,
    ownerNote:
      raw.ownerNote != null
        ? String(raw.ownerNote)
        : raw.owner_note != null
          ? String(raw.owner_note)
          : undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? now),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? now),
  };
}

export function activeRules(rules: StoreRule[]): StoreRule[] {
  return rules.filter((r) => r.active);
}

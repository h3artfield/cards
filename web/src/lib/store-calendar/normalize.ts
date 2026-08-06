import type {
  CalendarCustomCategory,
  CalendarSettings,
  DisplayGalleryFlyer,
  StoreEvent,
  StoreEventFlyer,
  StoreEventFlyers,
  StoreEventSignup,
} from "./types";
import { DEFAULT_CALENDAR_SETTINGS } from "./types";
import {
  BUILTIN_CATEGORY_IDS,
  normalizeHexColor,
  slugifyCategoryId,
} from "./categories";
import { parseFlyerOrientation } from "./flyer-orientation";

function parseCategory(raw: unknown): string {
  const v = String(raw ?? "other").toLowerCase().trim();
  const cleaned = v.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "other";
}

function normalizeCustomCategories(raw: unknown): CalendarCustomCategory[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: CalendarCustomCategory[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = String(rec.label ?? "").trim();
    if (!label) continue;

    const id = slugifyCategoryId(String(rec.id ?? label));
    if (!id || BUILTIN_CATEGORY_IDS.has(id) || seen.has(id)) continue;

    const color = normalizeHexColor(rec.color) ?? "#6366f1";
    seen.add(id);
    result.push({ id, label, color });
  }

  return result;
}

function normalizeDisplayGalleryFlyer(raw: unknown): DisplayGalleryFlyer | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = String(rec.id ?? "").trim();
  const imageUrl = String(rec.imageUrl ?? rec.image_url ?? "").trim();
  const title = String(rec.title ?? "Custom flyer").trim() || "Custom flyer";
  if (!id || !imageUrl) return null;
  const now = new Date().toISOString();
  const mediaTypeRaw = String(rec.mediaType ?? rec.media_type ?? "image")
    .trim()
    .toLowerCase();
  const mediaType: DisplayGalleryFlyer["mediaType"] =
    mediaTypeRaw === "video" ? "video" : "image";
  return {
    id,
    title,
    imageUrl,
    mediaType,
    caption:
      rec.caption != null ? String(rec.caption).trim() || undefined : undefined,
    orientation: parseFlyerOrientation(rec.orientation),
    createdAt: String(rec.createdAt ?? rec.created_at ?? now),
    updatedAt: String(rec.updatedAt ?? rec.updated_at ?? now),
  };
}

function normalizeDisplayGallery(raw: unknown): DisplayGalleryFlyer[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: DisplayGalleryFlyer[] = [];
  for (const item of raw) {
    const flyer = normalizeDisplayGalleryFlyer(item);
    if (!flyer || seen.has(flyer.id)) continue;
    seen.add(flyer.id);
    result.push(flyer);
  }
  return result;
}

export function normalizeCalendarSettings(
  raw: Record<string, unknown> | undefined,
): CalendarSettings {
  if (!raw) return { ...DEFAULT_CALENDAR_SETTINGS };
  return {
    enabled: raw.enabled !== false,
    published: raw.published === true,
    timezone: String(raw.timezone ?? DEFAULT_CALENDAR_SETTINGS.timezone),
    embedEnabled: raw.embedEnabled !== false,
    headline:
      raw.headline != null
        ? String(raw.headline)
        : DEFAULT_CALENDAR_SETTINGS.headline,
    customCategories: normalizeCustomCategories(
      raw.customCategories ?? raw.custom_categories,
    ),
    displayGallery: normalizeDisplayGallery(
      raw.displayGallery ?? raw.display_gallery,
    ),
  };
}

function parseCapacity(raw: unknown): number | null | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.floor(n);
}

function normalizeStoreEventFlyer(raw: unknown): StoreEventFlyer | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const imageUrl = String(rec.imageUrl ?? rec.image_url ?? "").trim();
  const prompt = String(rec.prompt ?? "").trim();
  const eventInfo = String(rec.eventInfo ?? rec.event_info ?? "").trim();
  if (!imageUrl || !prompt) return undefined;
  const now = new Date().toISOString();
  return {
    imageUrl,
    prompt,
    eventInfo,
    revisedPrompt:
      rec.revisedPrompt != null
        ? String(rec.revisedPrompt)
        : rec.revised_prompt != null
          ? String(rec.revised_prompt)
          : undefined,
    createdAt: String(rec.createdAt ?? rec.created_at ?? now),
    updatedAt: String(rec.updatedAt ?? rec.updated_at ?? now),
  };
}

function normalizeStoreEventFlyers(
  raw: unknown,
  legacyFlyer?: StoreEventFlyer,
): StoreEventFlyers | undefined {
  const flyers: StoreEventFlyers = {};
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    flyers.portrait = normalizeStoreEventFlyer(rec.portrait);
    flyers.landscape = normalizeStoreEventFlyer(rec.landscape);
  }
  if (!flyers.portrait && legacyFlyer) {
    flyers.portrait = legacyFlyer;
  }
  if (!flyers.portrait && !flyers.landscape) return undefined;
  return flyers;
}

export function normalizeStoreEvent(
  id: string,
  raw: Record<string, unknown>,
  storeId: string,
): StoreEvent {
  const now = new Date().toISOString();
  return {
    id,
    storeId,
    title: String(raw.title ?? "Untitled event"),
    description:
      raw.description != null ? String(raw.description) : undefined,
    category: parseCategory(raw.category),
    color: raw.color != null ? String(raw.color) : undefined,
    startAt: String(raw.startAt ?? raw.start_at ?? now),
    endAt: String(raw.endAt ?? raw.end_at ?? raw.startAt ?? now),
    allDay: raw.allDay === true || raw.all_day === true,
    capacity: parseCapacity(raw.capacity ?? raw.max_slots ?? raw.maxSlots),
    signupUrl:
      raw.signupUrl != null
        ? String(raw.signupUrl)
        : raw.signup_url != null
          ? String(raw.signup_url)
          : undefined,
    published: raw.published !== false,
    seriesId:
      raw.seriesId != null
        ? String(raw.seriesId)
        : raw.series_id != null
          ? String(raw.series_id)
          : undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? now),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? now),
    flyer: normalizeStoreEventFlyer(raw.flyer),
    flyers: normalizeStoreEventFlyers(raw.flyers, normalizeStoreEventFlyer(raw.flyer)),
  };
}

export function normalizeStoreEventInput(
  raw: Record<string, unknown>,
  context: { storeId: string; id?: string; createdAt?: string },
): StoreEvent {
  const now = new Date().toISOString();
  const id = context.id ?? String(raw.id ?? crypto.randomUUID());
  const startAt = String(raw.startAt ?? raw.start_at ?? now);
  const endAt = String(raw.endAt ?? raw.end_at ?? startAt);
  return {
    id,
    storeId: context.storeId,
    title: String(raw.title ?? "Untitled event"),
    description:
      raw.description != null ? String(raw.description) : undefined,
    category: parseCategory(raw.category),
    color: raw.color != null ? String(raw.color) : undefined,
    startAt,
    endAt,
    allDay: raw.allDay === true || raw.all_day === true,
    capacity: parseCapacity(raw.capacity ?? raw.max_slots ?? raw.maxSlots),
    signupUrl:
      raw.signupUrl != null
        ? String(raw.signupUrl)
        : raw.signup_url != null
          ? String(raw.signup_url)
          : undefined,
    published: raw.published !== false,
    seriesId:
      raw.seriesId != null
        ? String(raw.seriesId)
        : raw.series_id != null
          ? String(raw.series_id)
          : undefined,
    createdAt: context.createdAt ?? String(raw.createdAt ?? raw.created_at ?? now),
    updatedAt: now,
  };
}

export function normalizeStoreEventSignup(
  id: string,
  raw: Record<string, unknown>,
  storeId: string,
  eventId: string,
): StoreEventSignup {
  const now = new Date().toISOString();
  const email = String(raw.email ?? "").trim().toLowerCase();
  return {
    id,
    storeId,
    eventId,
    customerId:
      raw.customerId != null
        ? String(raw.customerId)
        : raw.customer_id != null
          ? String(raw.customer_id)
          : undefined,
    firstName: String(raw.firstName ?? raw.first_name ?? "").trim(),
    lastName: String(raw.lastName ?? raw.last_name ?? "").trim(),
    email,
    phone:
      raw.phone != null
        ? String(raw.phone).trim()
        : undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? now),
  };
}

export function normalizeStoreEventSignupInput(
  raw: Record<string, unknown>,
  context: { storeId: string; eventId: string; customerId?: string },
): StoreEventSignup {
  const id = String(raw.id ?? crypto.randomUUID());
  return normalizeStoreEventSignup(id, raw, context.storeId, context.eventId);
}

export function buildCustomCategoryInput(
  label: string,
  color: string,
  existing?: CalendarCustomCategory[],
): CalendarCustomCategory | null {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) return null;

  const id = slugifyCategoryId(trimmedLabel);
  if (!id || BUILTIN_CATEGORY_IDS.has(id)) return null;

  const taken = new Set([
    ...BUILTIN_CATEGORY_IDS,
    ...(existing ?? []).map((c) => c.id),
  ]);
  if (taken.has(id)) return null;

  return {
    id,
    label: trimmedLabel,
    color: normalizeHexColor(color) ?? "#6366f1",
  };
}

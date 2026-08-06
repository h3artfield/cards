import { dataStore } from "@/lib/storage/data-store";
import { normalizeStoreEventInput } from "@/lib/store-calendar/normalize";
import {
  endOfMonth,
  expandWeeklyOccurrences,
  parseWeekday,
  weekdayFromDate,
  type WeekdayIndex,
} from "@/lib/store-calendar/recurrence";
import {
  buildMonthSeedEvents,
  tglScheduleForMonth,
} from "@/lib/store-calendar/tgl-schedule";
import type { StoreEvent } from "@/lib/store-calendar/types";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";
import { startOfMonthDate } from "@/lib/store-calendar/recurrence";

export async function createRecurringStoreEvents(
  storeId: string,
  body: Record<string, unknown>,
): Promise<StoreEvent[]> {
  const seriesId = crypto.randomUUID();
  const anchorStartAt = String(body.startAt ?? body.start_at ?? "");
  const anchorEndAt = String(body.endAt ?? body.end_at ?? anchorStartAt);
  const weekday =
    parseWeekday(body.repeatWeekday ?? body.repeat_weekday) ??
    weekdayFromDate(anchorStartAt);
  const untilRaw = String(
    body.repeatUntil ?? body.repeat_until ?? endOfMonth(
      new Date(anchorStartAt).getFullYear(),
      new Date(anchorStartAt).getMonth(),
    ).toISOString(),
  );
  const until = new Date(untilRaw);
  if (Number.isNaN(until.getTime())) {
    throw new Error("repeatUntil must be a valid date");
  }

  const occurrences = expandWeeklyOccurrences({
    anchorStartAt,
    anchorEndAt,
    weekday: weekday as WeekdayIndex,
    until,
    skipDates: Array.isArray(body.skipDates)
      ? body.skipDates.map(String)
      : undefined,
    startTime:
      body.repeatStartTime != null
        ? String(body.repeatStartTime)
        : body.repeat_start_time != null
          ? String(body.repeat_start_time)
          : undefined,
    endTime:
      body.repeatEndTime != null
        ? String(body.repeatEndTime)
        : body.repeat_end_time != null
          ? String(body.repeat_end_time)
          : undefined,
  });

  if (occurrences.length === 0) {
    throw new Error("No occurrences in the selected repeat range");
  }

  const created: StoreEvent[] = [];
  for (const occ of occurrences) {
    const event = normalizeStoreEventInput(
      {
        ...body,
        startAt: occ.startAt,
        endAt: occ.endAt,
        seriesId,
      },
      { storeId },
    );
    await dataStore.saveStoreEvent(event);
    created.push(event);
  }

  return created;
}

export async function seedTglMonthSchedule(
  storeId: string,
  year: number,
  month: number,
): Promise<{ created: number; skipped: boolean; reason?: string }> {
  const from = startOfMonthDate(year, month - 1).toISOString();
  const to = endOfMonth(year, month - 1).toISOString();
  const existing = await dataStore.listStoreEvents(storeId, { from, to });
  if (existing.length >= 10) {
    return {
      created: 0,
      skipped: true,
      reason: `Calendar already has ${existing.length} events this month`,
    };
  }

  const schedule = tglScheduleForMonth(year, month);
  const settings = await dataStore.getSettings(storeId);
  const currentCustom = settings.calendarSettings?.customCategories ?? [];
  const mergedCustom = [...currentCustom];
  const seen = new Set(currentCustom.map((c) => c.id));
  for (const cat of schedule.customCategories) {
    if (!seen.has(cat.id)) {
      mergedCustom.push(cat);
      seen.add(cat.id);
    }
  }

  await dataStore.saveSettings({
    ...settings,
    calendarSettings: {
      ...(settings.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS),
      enabled: true,
      published: true,
      customCategories: mergedCustom,
    },
  });

  const payloads = buildMonthSeedEvents(storeId, year, month);
  for (const raw of payloads) {
    const event = normalizeStoreEventInput(
      {
        title: raw.title,
        category: raw.category,
        color: raw.color,
        startAt: raw.startAt,
        endAt: raw.endAt,
        published: raw.published,
        seriesId: raw.seriesKey,
      },
      { storeId },
    );
    await dataStore.saveStoreEvent(event);
  }

  return { created: payloads.length, skipped: false };
}

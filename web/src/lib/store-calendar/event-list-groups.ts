import { formatEventTimeRange } from "./date-utils";
import { categoryMeta, type StoreEventCategoryMeta } from "./categories";
import { WEEKDAY_LABELS, type WeekdayIndex } from "./recurrence";
import type { StoreEvent } from "./types";
import { calendarGridDays } from "./date-utils";

export type EventListGroup = {
  key: string;
  title: string;
  representativeEvent: StoreEvent;
  eventIds: string[];
  isRepeating: boolean;
  /** Sorted weekday indices 0–6 when repeating. */
  weekdays: WeekdayIndex[];
  repeatLabel: string;
  scheduleLabel: string;
  occurrenceCount: number;
  category: string;
};

function timeKey(startAt: string, endAt: string, allDay?: boolean): string {
  if (allDay) return "all-day";
  const s = new Date(startAt);
  const e = new Date(endAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(s.getHours())}:${pad(s.getMinutes())}-${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

function formatWeekdayList(weekdays: WeekdayIndex[]): string {
  const names = weekdays.map((d) => WEEKDAY_LABELS[d]!.toUpperCase());
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} AND ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} AND ${names[names.length - 1]}`;
}

function formatWeekdayListReadable(weekdays: WeekdayIndex[]): string {
  const names = weekdays.map((d) => WEEKDAY_LABELS[d]!);
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function spansMultipleWeeks(events: StoreEvent[]): boolean {
  if (events.length < 2) return false;
  const times = events.map((e) => new Date(e.startAt).getTime()).sort((a, b) => a - b);
  const first = times[0]!;
  const last = times[times.length - 1]!;
  return last - first >= 6 * 24 * 60 * 60 * 1000;
}

function groupKeyForEvent(event: StoreEvent): string {
  if (event.seriesId?.trim()) {
    return `series:${event.seriesId}`;
  }
  return `slot:${event.title.trim().toLowerCase()}|${timeKey(event.startAt, event.endAt, event.allDay)}`;
}

export type GroupStoreEventsOptions = {
  /** Store calendar timezone — required on servers (UTC) so times match the admin UI. */
  timeZone?: string;
};

export function groupStoreEvents(
  events: StoreEvent[],
  options?: GroupStoreEventsOptions,
): EventListGroup[] {
  const buckets = new Map<string, StoreEvent[]>();

  for (const event of events) {
    const key = groupKeyForEvent(event);
    const list = buckets.get(key) ?? [];
    list.push(event);
    buckets.set(key, list);
  }

  const groups: EventListGroup[] = [];

  for (const [key, bucket] of buckets) {
    bucket.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
    const representative = bucket[0]!;
    const weekdaySet = new Set<WeekdayIndex>();
    for (const e of bucket) {
      weekdaySet.add(new Date(e.startAt).getDay() as WeekdayIndex);
    }
    const weekdays = [...weekdaySet].sort((a, b) => a - b) as WeekdayIndex[];

    const isRepeating =
      bucket.length >= 2 &&
      (Boolean(representative.seriesId) ||
        spansMultipleWeeks(bucket) ||
        weekdays.length >= 2);

    const timeRange = formatEventTimeRange(
      representative.startAt,
      representative.endAt,
      representative.allDay,
      options?.timeZone,
    );

    let repeatLabel: string;
    let scheduleLabel: string;

    if (isRepeating) {
      const daysReadable = formatWeekdayListReadable(weekdays);
      repeatLabel = `Weekly · ${daysReadable}`;
      scheduleLabel = `JOIN US EVERY ${formatWeekdayList(weekdays)} AT ${timeRange.toUpperCase()}`;
    } else {
      const d = new Date(representative.startAt);
      const dateStr = d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      repeatLabel = `One-time · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      scheduleLabel = `${dateStr}. ${timeRange}`;
    }

    groups.push({
      key,
      title: representative.title,
      representativeEvent: representative,
      eventIds: bucket.map((e) => e.id),
      isRepeating,
      weekdays,
      repeatLabel,
      scheduleLabel,
      occurrenceCount: bucket.length,
      category: representative.category,
    });
  }

  return mergeMultiWeekdayGroups(
    groups.sort(
      (a, b) =>
        new Date(a.representativeEvent.startAt).getTime() -
        new Date(b.representativeEvent.startAt).getTime(),
    ),
    options,
  );
}

function mergeKey(group: EventListGroup): string {
  const e = group.representativeEvent;
  return `${group.title.trim().toLowerCase()}|${timeKey(e.startAt, e.endAt, e.allDay)}`;
}

/** Combine e.g. Pokemon League on Monday + Thursday into one row/flyer. */
function mergeMultiWeekdayGroups(
  groups: EventListGroup[],
  options?: GroupStoreEventsOptions,
): EventListGroup[] {
  const buckets = new Map<string, EventListGroup[]>();
  for (const g of groups) {
    const mk = mergeKey(g);
    const list = buckets.get(mk) ?? [];
    list.push(g);
    buckets.set(mk, list);
  }

  const merged: EventListGroup[] = [];

  for (const [, bucket] of buckets) {
    if (bucket.length === 1) {
      merged.push(bucket[0]!);
      continue;
    }

    const allIds = bucket.flatMap((g) => g.eventIds);
    const weekdaySet = new Set<WeekdayIndex>();
    for (const g of bucket) {
      for (const d of g.weekdays) weekdaySet.add(d);
    }
    const weekdays = [...weekdaySet].sort((a, b) => a - b) as WeekdayIndex[];
    const representative = bucket[0]!.representativeEvent;
    const isRepeating =
      bucket.some((g) => g.isRepeating) ||
      allIds.length >= 2 ||
      weekdays.length >= 2;

    const timeRange = formatEventTimeRange(
      representative.startAt,
      representative.endAt,
      representative.allDay,
      options?.timeZone,
    );

    let repeatLabel: string;
    let scheduleLabel: string;

    if (isRepeating) {
      const daysReadable = formatWeekdayListReadable(weekdays);
      repeatLabel = `Weekly · ${daysReadable}`;
      scheduleLabel = `JOIN US EVERY ${formatWeekdayList(weekdays)} AT ${timeRange.toUpperCase()}`;
    } else {
      repeatLabel = bucket[0]!.repeatLabel;
      scheduleLabel = bucket[0]!.scheduleLabel;
    }

    merged.push({
      key: bucket.map((g) => g.key).join("+"),
      title: bucket[0]!.title,
      representativeEvent: representative,
      eventIds: allIds,
      isRepeating,
      weekdays,
      repeatLabel,
      scheduleLabel,
      occurrenceCount: allIds.length,
      category: bucket[0]!.category,
    });
  }

  return merged.sort(
    (a, b) =>
      new Date(a.representativeEvent.startAt).getTime() -
      new Date(b.representativeEvent.startAt).getTime(),
  );
}

/** Groups with at least one occurrence in the visible month grid. */
export function groupStoreEventsForMonth(
  events: StoreEvent[],
  month: Date,
  options?: GroupStoreEventsOptions,
): EventListGroup[] {
  const days = calendarGridDays(month);
  const start = days[0]!;
  const end = new Date(days[days.length - 1]!);
  end.setHours(23, 59, 59, 999);

  const eventIdsInMonth = new Set(
    events
      .filter((e) => {
        const s = new Date(e.startAt);
        const en = new Date(e.endAt);
        return s <= end && en >= start;
      })
      .map((e) => e.id),
  );

  return groupStoreEvents(events, options).filter((g) =>
    g.eventIds.some((id) => eventIdsInMonth.has(id)),
  );
}

export function findEventListGroup(
  events: StoreEvent[],
  eventId: string,
  options?: GroupStoreEventsOptions,
): EventListGroup | null {
  const groups = groupStoreEvents(events, options);
  return groups.find((g) => g.eventIds.includes(eventId)) ?? null;
}

export function buildFlyerEventInfo(
  group: EventListGroup,
  storeName: string,
  categories?: StoreEventCategoryMeta[],
): string {
  const meta = categoryMeta(group.category, categories);
  const desc = group.representativeEvent.description?.trim();
  const descPart = desc ? ` ${desc}` : "";

  if (group.isRepeating) {
    return `${group.scheduleLabel}. Event: ${group.title} (${meta.label}) at ${storeName}.${descPart}`;
  }

  return `Event: ${group.title} (${meta.label}) at ${storeName}. ${group.scheduleLabel}.${descPart}`;
}

import type { FlyerOrientation } from "./flyer-orientation";

export const FLYER_IMAGE_PROMPT_PREFIX_PORTRAIT =
  "Create a minimalist 3d portrait-orientation flyer for a vertical TV display (9:16). Use simple bold 3d text only — no extra dates or times beyond what is provided. Display the schedule text exactly as written. Low-opacity 3d background related to the event category.";

export const FLYER_IMAGE_PROMPT_PREFIX_LANDSCAPE =
  "Create a minimalist 3d landscape-orientation flyer for a horizontal TV display (16:9). Use simple bold 3d text only — no extra dates or times beyond what is provided. Display the schedule text exactly as written. Low-opacity 3d background related to the event category.";

/** @deprecated Use FLYER_IMAGE_PROMPT_PREFIX_PORTRAIT */
export const FLYER_IMAGE_PROMPT_PREFIX = FLYER_IMAGE_PROMPT_PREFIX_PORTRAIT;

function flyerPromptPrefix(orientation: FlyerOrientation): string {
  return orientation === "landscape"
    ? FLYER_IMAGE_PROMPT_PREFIX_LANDSCAPE
    : FLYER_IMAGE_PROMPT_PREFIX_PORTRAIT;
}

export function buildFlyerImagePrompt(
  eventInfo: string,
  orientation: FlyerOrientation = "portrait",
): string {
  return `${flyerPromptPrefix(orientation)} Event details (use this text verbatim for date and time): ${eventInfo}`;
}

export function buildFlyerEditPrompt(input: {
  changePrompt: string;
  eventInfo: string;
  originalPrompt: string;
}): string {
  return `Edit this event flyer image. Keep the same overall layout, style, and correct event schedule unless a change requires otherwise. Event context: ${input.eventInfo}. Original generation brief: ${input.originalPrompt}. Apply these changes exactly: ${input.changePrompt.trim()}`;
}

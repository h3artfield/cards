import type { CalendarCustomCategory } from "./types";
import {
  endOfMonth,
  expandWeeklyOccurrences,
  startOfMonthDate,
  type WeekdayIndex,
} from "./recurrence";

export type ScheduleOccurrence = {
  startAt: string;
  endAt: string;
};

export type RecurringScheduleItem = {
  title: string;
  category: string;
  color?: string;
  weekday: WeekdayIndex;
  /** 24h HH:mm in store local time — applied per occurrence date. */
  startTime: string;
  endTime: string;
  skipDates?: string[];
};

export type OneOffScheduleItem = {
  title: string;
  category: string;
  color?: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build ISO datetime for America/Chicago (CDT/CST). July uses CDT (-05:00). */
export function storeLocalIso(
  year: number,
  month: number,
  day: number,
  time: string,
): string {
  const [hh, mm] = time.split(":").map(Number);
  const offset = month >= 3 && month <= 10 ? "-05:00" : "-06:00";
  return `${year}-${pad(month)}-${pad(day)}T${pad(hh ?? 0)}:${pad(mm ?? 0)}:00${offset}`;
}

function anchorPair(
  year: number,
  month: number,
  weekday: WeekdayIndex,
  startTime: string,
  endTime: string,
): { startAt: string; endAt: string } {
  const monthStart = startOfMonthDate(year, month - 1);
  let day = monthStart.getDate();
  while (new Date(year, month - 1, day).getDay() !== weekday) {
    day += 1;
  }
  return {
    startAt: storeLocalIso(year, month, day, startTime),
    endAt: storeLocalIso(year, month, day, endTime),
  };
}

export function buildRecurringOccurrences(
  item: RecurringScheduleItem,
  year: number,
  month: number,
): ScheduleOccurrence[] {
  const anchor = anchorPair(
    year,
    month,
    item.weekday,
    item.startTime,
    item.endTime,
  );
  const until = endOfMonth(year, month - 1);
  return expandWeeklyOccurrences({
    anchorStartAt: anchor.startAt,
    anchorEndAt: anchor.endAt,
    weekday: item.weekday,
    until,
    skipDates: item.skipDates,
  });
}

export function buildOneOffOccurrence(
  item: OneOffScheduleItem,
): ScheduleOccurrence {
  const [year, month, day] = item.date.split("-").map(Number);
  return {
    startAt: storeLocalIso(year!, month!, day!, item.startTime),
    endAt: storeLocalIso(year!, month!, day!, item.endTime),
  };
}

/** The Game Lodge schedule — matches the reference July 2026 calendar. */
export function tglScheduleForMonth(
  year: number,
  month: number,
): {
  customCategories: CalendarCustomCategory[];
  recurring: RecurringScheduleItem[];
  oneOffs: OneOffScheduleItem[];
} {
  const monthKey = `${year}-${pad(month)}`;

  return {
    customCategories: [
      {
        id: "flesh-and-blood",
        label: "Flesh and Blood",
        color: "#7f1d1d",
      },
    ],
    recurring: [
      {
        title: "Flesh and Blood Armory",
        category: "flesh-and-blood",
        weekday: 0,
        startTime: "13:00",
        endTime: "17:00",
      },
      {
        title: "Pokemon League Night",
        category: "pokemon",
        weekday: 1,
        startTime: "18:00",
        endTime: "22:00",
      },
      {
        title: "Prize Supported Open Play CEDH Commander",
        category: "commander",
        color: "#16a34a",
        weekday: 2,
        startTime: "17:00",
        endTime: "21:00",
      },
      {
        title: "Magic The Gathering Pauper Night",
        category: "magic",
        weekday: 2,
        startTime: "18:00",
        endTime: "21:00",
      },
      {
        title: "Learn to Paint Warhammer/Learn to Play Kill Team",
        category: "warhammer",
        weekday: 3,
        startTime: "17:00",
        endTime: "21:00",
      },
      {
        title: "Pokemon League Night",
        category: "pokemon",
        weekday: 4,
        startTime: "18:00",
        endTime: "22:00",
      },
      {
        title: "Riftbound Open Play Night",
        category: "riftbound",
        weekday: 4,
        startTime: "18:00",
        endTime: "22:00",
      },
      {
        title: "Prize Supported Commander",
        category: "commander",
        weekday: 5,
        startTime: "11:00",
        endTime: "22:00",
      },
      {
        title: "Friday Night Magic",
        category: "magic",
        weekday: 5,
        startTime: "17:30",
        endTime: "22:30",
        skipDates: [`${monthKey}-24`],
      },
      {
        title: "Prize Supported Commander",
        category: "commander",
        weekday: 6,
        startTime: "11:00",
        endTime: "22:00",
      },
    ],
    oneOffs: [
      {
        title: "TGL July Bracket [3 or 4] Commander Tournament",
        category: "commander",
        color: "#475569",
        date: `${monthKey}-11`,
        startTime: "14:00",
        endTime: "22:00",
      },
      {
        title: "TGL July Bracket [3 or 4] Commander Tournament",
        category: "commander",
        color: "#475569",
        date: `${monthKey}-25`,
        startTime: "14:00",
        endTime: "22:00",
      },
      {
        title: "Lorcana Pre-Release Attack of the Vine",
        category: "lorcana",
        date: `${monthKey}-19`,
        startTime: "14:00",
        endTime: "18:00",
      },
      {
        title: "Riftbound Vendetta Pre-release Event",
        category: "prerelease",
        color: "#16a34a",
        date: `${monthKey}-24`,
        startTime: "18:00",
        endTime: "22:00",
      },
    ],
  };
}

export function buildMonthSeedEvents(
  storeId: string,
  year: number,
  month: number,
): Array<{
  storeId: string;
  title: string;
  category: string;
  color?: string;
  startAt: string;
  endAt: string;
  published: boolean;
  seriesKey: string;
}> {
  const schedule = tglScheduleForMonth(year, month);
  const events: Array<{
    storeId: string;
    title: string;
    category: string;
    color?: string;
    startAt: string;
    endAt: string;
    published: boolean;
    seriesKey: string;
  }> = [];

  for (const item of schedule.recurring) {
    const seriesKey = `recurring:${item.title}:${item.weekday}`;
    for (const occ of buildRecurringOccurrences(item, year, month)) {
      events.push({
        storeId,
        title: item.title,
        category: item.category,
        color: item.color,
        startAt: occ.startAt,
        endAt: occ.endAt,
        published: true,
        seriesKey,
      });
    }
  }

  for (const item of schedule.oneOffs) {
    const occ = buildOneOffOccurrence(item);
    events.push({
      storeId,
      title: item.title,
      category: item.category,
      color: item.color,
      startAt: occ.startAt,
      endAt: occ.endAt,
      published: true,
      seriesKey: `oneoff:${item.title}:${item.date}`,
    });
  }

  return events.map((e) => ({ ...e, storeId }));
}

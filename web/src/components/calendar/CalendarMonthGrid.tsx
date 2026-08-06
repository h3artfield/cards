"use client";

import { useMemo } from "react";
import {
  addMonths,
  calendarGridDays,
  eventOverlapsDay,
  formatEventTimeRange,
  formatMonthYear,
  startOfMonth,
} from "@/lib/store-calendar/date-utils";
import {
  categoryMeta,
  eventBlockColor,
  type StoreEventCategoryMeta,
} from "@/lib/store-calendar/categories";
import type { StoreEvent } from "@/lib/store-calendar/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type CalendarMonthGridProps = {
  month: Date;
  events: StoreEvent[];
  categories: StoreEventCategoryMeta[];
  timeZone?: string;
  onMonthChange: (month: Date) => void;
  onDayClick: (day: Date) => void;
  onEventClick: (event: StoreEvent) => void;
  /** Admin grid shows draft events slightly faded. */
  showDrafts?: boolean;
};

export function CalendarMonthGrid({
  month,
  events,
  categories,
  timeZone,
  onMonthChange,
  onDayClick,
  onEventClick,
  showDrafts = false,
}: CalendarMonthGridProps) {
  const gridDays = useMemo(() => calendarGridDays(month), [month]);
  const visibleEvents = useMemo(() => {
    const days = calendarGridDays(month);
    const start = days[0]!;
    const end = new Date(days[days.length - 1]!);
    end.setHours(23, 59, 59, 999);
    return events.filter((e) => {
      const s = new Date(e.startAt);
      const en = new Date(e.endAt);
      return s <= end && en >= start;
    });
  }, [events, month]);

  const today = new Date();

  return (
    <div className="flex h-full min-h-[640px] flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(startOfMonth(new Date()))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, -1))}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            aria-label="Next month"
          >
            ›
          </button>
          <h2 className="ml-2 text-lg font-semibold text-gray-900">
            {formatMonthYear(month)}
          </h2>
        </div>
        <p className="text-xs text-gray-500">
          Click a day to add an event · Click an event to edit
        </p>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="border-r border-gray-200 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-600 last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {gridDays.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isToday =
            day.getDate() === today.getDate() &&
            day.getMonth() === today.getMonth() &&
            day.getFullYear() === today.getFullYear();
          const dayEvents = visibleEvents.filter((e) => eventOverlapsDay(e, day));

          return (
            <div
              key={day.toISOString()}
              className={`group relative min-h-[100px] border-b border-r border-gray-200 p-1 last:border-r-0 ${
                inMonth ? "bg-white" : "bg-gray-50/70"
              }`}
            >
              <button
                type="button"
                onClick={() => onDayClick(day)}
                className="absolute inset-0 z-0 rounded-sm hover:bg-indigo-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                aria-label={`Add event on ${day.toLocaleDateString()}`}
              />
              <div className="relative z-10 flex items-start justify-between gap-1 pointer-events-none">
                <span
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? "bg-indigo-600 text-white"
                      : inMonth
                        ? "text-gray-800"
                        : "text-gray-400"
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className="rounded p-0.5 text-gray-400 opacity-0 transition group-hover:opacity-100">
                  +
                </span>
              </div>
              <div className="relative z-10 mt-0.5 space-y-0.5">
                {dayEvents.map((event) => (
                  <button
                    key={`${event.id}-${day.toISOString()}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className={`pointer-events-auto block w-full rounded px-1 py-0.5 text-left text-[10px] leading-tight text-white shadow-sm transition hover:brightness-110 ${
                      showDrafts && !event.published ? "opacity-60 ring-1 ring-white/40" : ""
                    }`}
                    style={{
                      backgroundColor: eventBlockColor(
                        event.category,
                        event.color,
                        categories,
                      ),
                    }}
                  >
                    <span className="block truncate font-medium">
                      {formatEventTimeRange(
                        event.startAt,
                        event.endAt,
                        event.allDay,
                        timeZone,
                      )}{" "}
                      {event.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { categoryMeta };

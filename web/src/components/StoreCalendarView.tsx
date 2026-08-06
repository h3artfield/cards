"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarSettings, StoreEvent, StoreEventPublic } from "@/lib/store-calendar/types";
import { useCustomer } from "@/context/CustomerContext";
import {
  addMonths,
  calendarGridDays,
  eventOverlapsDay,
  formatEventTimeRange,
  formatMonthYear,
  monthKey,
  startOfMonth,
} from "@/lib/store-calendar/date-utils";
import {
  STORE_EVENT_CATEGORIES,
  categoryMeta,
  eventBlockColor,
  resolveStoreEventCategories,
  type StoreEventCategoryMeta,
} from "@/lib/store-calendar/categories";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";

type Props = {
  slug: string;
  embed?: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function StoreCalendarView({ slug, embed = false }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<StoreEventPublic[]>([]);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(
    DEFAULT_CALENDAR_SETTINGS,
  );
  const [storeName, setStoreName] = useState("");
  const [published, setPublished] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categories, setCategories] = useState<StoreEventCategoryMeta[]>(
    STORE_EVENT_CATEGORIES,
  );
  const [selected, setSelected] = useState<StoreEventPublic | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/events?month=${monthKey(month)}${embed ? "&embed=1" : ""}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load calendar");
      setEvents(data.events ?? []);
      setCalendarSettings(data.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS);
      setCategories(
        data.categories ??
          resolveStoreEventCategories(
            data.calendarSettings?.customCategories ??
              DEFAULT_CALENDAR_SETTINGS.customCategories,
          ),
      );
      setPublished(data.published !== false);
      setStoreName(data.storeName ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load calendar");
    } finally {
      setLoading(false);
    }
  }, [slug, month]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => {
    if (categoryFilter === "all") return events;
    return events.filter((e) => e.category === categoryFilter);
  }, [events, categoryFilter]);

  const gridDays = useMemo(() => calendarGridDays(month), [month]);

  const headline =
    calendarSettings.headline?.trim() ||
    DEFAULT_CALENDAR_SETTINGS.headline!;

  if (!published && !loading) {
    return (
      <div className={embed ? "p-4" : "mx-auto max-w-6xl px-4 py-10"}>
        <p className="text-center text-sm text-gray-600">
          This store&apos;s event calendar is not published yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        embed
          ? "min-h-[480px] bg-white p-3 sm:p-4"
          : "min-h-screen bg-white"
      }
    >
      <div className={embed ? "" : "mx-auto max-w-6xl px-4 py-8"}>
        {!embed && storeName ? (
          <p className="mb-2 text-center text-sm font-medium text-gray-500">
            {storeName}
          </p>
        ) : null}

        <h1 className="text-center text-xl font-semibold text-gray-900 sm:text-2xl">
          {headline}
        </h1>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {formatMonthYear(month)}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              today
            </button>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              aria-label="Previous month"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip
            active={categoryFilter === "all"}
            label="All"
            onClick={() => setCategoryFilter("all")}
          />
          {categories.map((category) => (
            <FilterChip
              key={category.id}
              active={categoryFilter === category.id}
              label={category.label}
              color={category.color}
              onClick={() => setCategoryFilter(category.id)}
            />
          ))}
        </div>

        {error ? (
          <p className="mt-6 text-center text-sm text-red-600">{error}</p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[720px] border border-gray-200">
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

            <div className="grid grid-cols-7">
              {gridDays.map((day) => {
                const inMonth = day.getMonth() === month.getMonth();
                const dayEvents = filteredEvents.filter((e) =>
                  eventOverlapsDay(e, day),
                );
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[110px] border-b border-r border-gray-200 p-1 last:border-r-0 ${
                      inMonth ? "bg-white" : "bg-gray-50/80"
                    }`}
                  >
                    <div
                      className={`mb-1 text-right text-xs ${
                        inMonth ? "text-gray-700" : "text-gray-400"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((event) => (
                        <button
                          key={`${event.id}-${day.toISOString()}`}
                          type="button"
                          onClick={() => setSelected(event)}
                          className="block w-full rounded px-1.5 py-1 text-left text-[11px] leading-tight text-white shadow-sm transition hover:brightness-110"
                          style={{
                            backgroundColor: eventBlockColor(
                              event.category,
                              event.color,
                              categories,
                            ),
                          }}
                        >
                          <span className="block font-medium opacity-95">
                            {formatEventTimeRange(
                              event.startAt,
                              event.endAt,
                              event.allDay,
                              calendarSettings.timezone,
                            )}
                          </span>
                          <span className="block truncate">{event.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-center text-xs text-gray-500">Loading events…</p>
        ) : null}

        {!loading && filteredEvents.length === 0 ? (
          <p className="mt-4 text-center text-sm text-gray-500">
            No events scheduled this month.
          </p>
        ) : null}
      </div>

      {selected ? (
        <EventModal
          slug={slug}
          event={selected}
          categories={categories}
          timeZone={calendarSettings.timezone}
          onClose={() => setSelected(null)}
          onSignedUp={() => void loadEvents()}
        />
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
        active
          ? "bg-gray-800 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {color ? (
        <span
          className="h-2 w-2 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : null}
      {label}
    </button>
  );
}

function EventModal({
  slug,
  event,
  categories,
  timeZone,
  onClose,
  onSignedUp,
}: {
  slug: string;
  event: StoreEventPublic;
  categories: StoreEventCategoryMeta[];
  timeZone?: string;
  onClose: () => void;
  onSignedUp: () => void;
}) {
  const { customer } = useCustomer();
  const meta = categoryMeta(event.category, categories);
  const [firstName, setFirstName] = useState(customer?.firstName ?? "");
  const [lastName, setLastName] = useState(customer?.lastName ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (customer) {
      setFirstName(customer.firstName ?? "");
      setLastName(customer.lastName ?? "");
      setEmail(customer.email ?? "");
      setPhone(customer.phone ?? "");
    }
  }, [customer]);

  const isFull = event.spotsRemaining === 0;

  async function submitSignup(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/events/${encodeURIComponent(event.id)}/signup`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, email, phone }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sign up");
      setSuccess(true);
      onSignedUp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign up");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {meta.label}
            </p>
            <h3 id="event-modal-title" className="mt-1 text-lg font-bold text-gray-900">
              {event.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-700">
          {formatEventTimeRange(event.startAt, event.endAt, event.allDay, timeZone)}
        </p>

        {event.capacity != null ? (
          <p className="mt-2 text-xs text-gray-600">
            {isFull
              ? "This event is full."
              : event.spotsRemaining != null
                ? `${event.spotsRemaining} spot${event.spotsRemaining === 1 ? "" : "s"} remaining (${event.signupCount} / ${event.capacity})`
                : null}
          </p>
        ) : null}

        {event.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">
            {event.description}
          </p>
        ) : null}

        {success ? (
          <p className="mt-5 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            You&apos;re signed up! A confirmation email is on its way.
          </p>
        ) : isFull ? null : (
          <form onSubmit={submitSignup} className="mt-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Sign up
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">First name</span>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Last name</span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="font-medium">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Phone (optional)</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? "Signing up…" : "Sign up"}
            </button>
          </form>
        )}

        {event.signupUrl ? (
          <a
            href={event.signupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${success || isFull ? "mt-3" : "mt-2"} inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50`}
          >
            External signup
          </a>
        ) : null}

        {!success && !event.signupUrl && isFull ? (
          <p className="mt-5 text-sm text-gray-500">
            Contact the store to join the waitlist.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { STORE_EVENT_CATEGORIES };

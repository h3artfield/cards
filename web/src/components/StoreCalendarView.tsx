"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { EventDeckPickerV1 } from "@/components/calendar/EventDeckPickerV1";
import { CustomerStoreNavV1 } from "@/components/CustomerStoreNavV1";
import { eventRequiredBracketV1 } from "@/lib/store-calendar/event-required-bracket-v1";
import { eventWantsDeckRegistrationV1 } from "@/lib/store-calendar/event-wants-deck-registration-v1";
import { formatEventCostV1 } from "@/lib/store-calendar/format-event-cost-v1";
import type { StoreEventSignupDeck } from "@/lib/store-calendar/types";
import {
  authButton,
  authButtonSecondary,
  authError,
  authInput,
  authLabel,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";

type Props = {
  slug: string;
  embed?: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function StoreCalendarView({ slug, embed = false }: Props) {
  const { customer } = useCustomer();
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

  const pageClass = embed
    ? "storefront-theme min-h-[480px] bg-[var(--ink-850)] p-3 text-[var(--text)] sm:p-4"
    : "storefront-theme min-h-screen bg-[var(--ink-850)] text-[var(--text)]";

  if (!published && !loading) {
    return (
      <div className={pageClass}>
        <div className={embed ? "" : "mx-auto max-w-6xl px-4 py-8"}>
          {!embed ? (
            <CustomerStoreNavV1
              slug={slug}
              active="events"
              loggedIn={Boolean(customer)}
            />
          ) : null}
          <p className={`mt-10 text-center ${authSubtext}`}>
            This store&apos;s event calendar is not published yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <div className={embed ? "" : "mx-auto max-w-6xl px-4 py-8"}>
        {!embed ? (
          <div className="mb-6">
            <CustomerStoreNavV1
              slug={slug}
              active="events"
              loggedIn={Boolean(customer)}
            />
            {storeName ? (
              <p className={`mt-3 text-center font-medium ${authSubtext}`}>{storeName}</p>
            ) : null}
          </div>
        ) : null}

        <h1 className="text-center text-xl font-semibold text-[var(--text-hi)] sm:text-2xl">
          {headline}
        </h1>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-hi)]">
            {formatMonthYear(month)}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="rounded-md border border-[var(--line)] bg-[var(--ink-750)] px-3 py-1.5 text-sm font-medium text-[var(--text-hi)] hover:border-[var(--line-strong)]"
            >
              today
            </button>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="rounded-md border border-[var(--line)] bg-[var(--ink-750)] px-2.5 py-1.5 text-sm text-[var(--text-hi)] hover:border-[var(--line-strong)]"
              aria-label="Previous month"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="rounded-md border border-[var(--line)] bg-[var(--ink-750)] px-2.5 py-1.5 text-sm text-[var(--text-hi)] hover:border-[var(--line-strong)]"
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
          <p className={`mt-6 text-center ${authError}`}>{error}</p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[720px] border border-[var(--line-subtle)] bg-[var(--ink-900)]">
            <div className="grid grid-cols-7 border-b border-[var(--line-subtle)] bg-[var(--ink-800)]">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="border-r border-[var(--line-subtle)] px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--text-lo)] last:border-r-0"
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
                    className={`min-h-[110px] border-b border-r border-[var(--line-subtle)] p-1 last:border-r-0 ${
                      inMonth ? "bg-[var(--ink-900)]" : "bg-[var(--ink-850)]"
                    }`}
                  >
                    <div
                      className={`mb-1 text-right text-xs ${
                        inMonth ? "text-[var(--text)]" : "text-[var(--text-lo)]"
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
          <p className={`mt-4 text-center text-xs ${authSubtext}`}>Loading events…</p>
        ) : null}

        {!loading && filteredEvents.length === 0 ? (
          <p className={`mt-4 text-center ${authSubtext}`}>
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
          ? "bg-[var(--accent)] text-[var(--ink-900)]"
          : "border border-[var(--line-subtle)] bg-[var(--ink-750)] text-[var(--text)] hover:border-[var(--line-strong)] hover:text-[var(--text-hi)]"
      }`}
    >
      {color ? (
        <span
          className="h-2 w-2 rounded-full ring-1 ring-white/20"
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
  const wantsDeck = eventWantsDeckRegistrationV1(event);
  const requiredBracket = eventRequiredBracketV1(event);
  const [firstName, setFirstName] = useState(customer?.firstName ?? "");
  const [lastName, setLastName] = useState(customer?.lastName ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  /** The deck being registered, for Commander events. */
  const [deckId, setDeckId] = useState<string | null>(null);
  const [registeredDeck, setRegisteredDeck] = useState<StoreEventSignupDeck | null>(null);
  const [addingDeck, setAddingDeck] = useState(false);

  useEffect(() => {
    if (customer) {
      setFirstName(customer.firstName ?? "");
      setLastName(customer.lastName ?? "");
      setEmail(customer.email ?? "");
      setPhone(customer.phone ?? "");
    }
  }, [customer]);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    void fetch(
      `/api/store/${encodeURIComponent(slug)}/events/${encodeURIComponent(event.id)}/signup`,
      { credentials: "include" },
    )
      .then(async (res) => (res.ok ? await res.json() : null))
      .then((data: { signup?: { deck?: StoreEventSignupDeck | null } | null } | null) => {
        if (cancelled || !data?.signup) return;
        setSuccess(true);
        const deck = data.signup.deck ?? null;
        setRegisteredDeck(deck);
        if (deck) setDeckId(deck.deckId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customer, slug, event.id]);

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
          body: JSON.stringify({ firstName, lastName, email, phone, deckId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sign up");
      setRegisteredDeck((data.signup?.deck as StoreEventSignupDeck | undefined) ?? null);
      setSuccess(true);
      onSignedUp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign up");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveDeckForSignup() {
    if (!deckId) return;
    setAddingDeck(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/events/${encodeURIComponent(event.id)}/signup`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deckId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your deck");
      const saved = (data.signup?.deck as StoreEventSignupDeck | undefined) ?? null;
      setRegisteredDeck(saved);
      if (saved) setDeckId(saved.deckId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your deck");
    } finally {
      setAddingDeck(false);
    }
  }

  const selectedDeckId = deckId ?? registeredDeck?.deckId ?? null;
  const deckChanged =
    registeredDeck != null && selectedDeckId != null && selectedDeckId !== registeredDeck.deckId;
  const canSaveDeck = selectedDeckId != null && (registeredDeck == null || deckChanged);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--line-subtle)] bg-[var(--ink-850)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-lo)]">
              {meta.label}
            </p>
            <h3 id="event-modal-title" className="mt-1 text-lg font-bold text-[var(--text-hi)]">
              {event.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[var(--text-lo)] hover:bg-[var(--ink-750)] hover:text-[var(--text-hi)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm text-[var(--text)]">
          {formatEventTimeRange(event.startAt, event.endAt, event.allDay, timeZone)}
        </p>

        {requiredBracket != null ? (
          <p className="mt-2 text-sm font-semibold text-[var(--accent-hi)]">
            Bracket {requiredBracket} event — only B{requiredBracket} decks can register.
          </p>
        ) : null}

        {formatEventCostV1(event.cost) ? (
          <p className="mt-2 text-sm font-semibold text-[var(--text-hi)]">
            Entry: {formatEventCostV1(event.cost)}
          </p>
        ) : null}

        {event.capacity != null ? (
          <p className="mt-2 text-xs text-[var(--text-lo)]">
            {isFull
              ? "This event is full."
              : event.spotsRemaining != null
                ? `${event.spotsRemaining} spot${event.spotsRemaining === 1 ? "" : "s"} remaining (${event.signupCount} / ${event.capacity})`
                : null}
          </p>
        ) : null}

        {event.description ? (
          <p className={`mt-3 whitespace-pre-wrap ${authSubtext}`}>
            {event.description}
          </p>
        ) : null}

        {success ? (
          <div className="mt-5 space-y-3">
            <p className="rounded-lg border border-[var(--ok-line)] bg-[var(--ok-wash)] px-3 py-2 text-sm text-[var(--ok)]">
              You&apos;re signed up! A confirmation email is on its way.
            </p>
            {wantsDeck && customer ? (
              <div
                className={`space-y-2 rounded-lg border px-3 py-3 ${
                  registeredDeck
                    ? "border-[var(--line-subtle)] bg-[var(--ink-800)]"
                    : "border-[var(--warn)]/40 bg-[var(--accent-wash)]"
                }`}
              >
                {registeredDeck ? (
                  <p className="text-sm text-[var(--text-hi)]">
                    Registered deck:{" "}
                    <span className="font-semibold">{registeredDeck.commanderName}</span> · bracket{" "}
                    {registeredDeck.bracket}
                  </p>
                ) : (
                  <p className="text-sm text-[var(--accent-hi)]">
                    You did not register a deck yet. The shop uses this to seat balanced pods.
                  </p>
                )}
                <EventDeckPickerV1
                  slug={slug}
                  requiredBracket={requiredBracket}
                  value={selectedDeckId}
                  onChange={setDeckId}
                />
                {error ? <p className={authError}>{error}</p> : null}
                {canSaveDeck ? (
                  <button
                    type="button"
                    disabled={addingDeck}
                    onClick={() => void saveDeckForSignup()}
                    className={authButton}
                  >
                    {addingDeck
                      ? "Saving…"
                      : registeredDeck
                        ? "Update deck for this event"
                        : "Save deck for this event"}
                  </button>
                ) : null}
              </div>
            ) : wantsDeck && !customer ? (
              <p className={authSubtext}>
                <Link
                  href={`/sign-in?store=${encodeURIComponent(slug)}&return=${encodeURIComponent(`/s/${slug}/calendar`)}`}
                  className={authLink}
                >
                  Sign in
                </Link>{" "}
                to register which deck you are bringing.
              </p>
            ) : null}
          </div>
        ) : isFull ? null : (
          <form onSubmit={submitSignup} className="mt-5 space-y-3">
            <p className={authLabel}>Sign up</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={authLabel}>First name</span>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={authInput}
                />
              </label>
              <label className="block">
                <span className={authLabel}>Last name</span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={authInput}
                />
              </label>
            </div>
            <label className="block">
              <span className={authLabel}>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={authInput}
              />
            </label>
            <label className="block">
              <span className={authLabel}>Phone (optional)</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={authInput}
              />
            </label>
            {wantsDeck && !customer ? (
              <p className={`rounded-md border border-[var(--line-subtle)] bg-[var(--ink-800)] px-3 py-2 ${authSubtext}`}>
                <Link
                  href={`/sign-in?store=${encodeURIComponent(slug)}&return=${encodeURIComponent(`/s/${slug}/calendar`)}`}
                  className={authLink}
                >
                  Sign in
                </Link>{" "}
                to tell the shop which deck you are bringing and its bracket.
              </p>
            ) : null}
            {wantsDeck && customer ? (
              <EventDeckPickerV1
                slug={slug}
                requiredBracket={requiredBracket}
                value={deckId}
                onChange={setDeckId}
              />
            ) : null}
            {error ? <p className={authError}>{error}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className={authButton}
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
            className={`${success || isFull ? "mt-3" : "mt-2"} ${authButtonSecondary} no-underline`}
          >
            External signup
          </a>
        ) : null}

        {!success && !event.signupUrl && isFull ? (
          <p className={`mt-5 ${authSubtext}`}>
            Contact the store to join the waitlist.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { STORE_EVENT_CATEGORIES };

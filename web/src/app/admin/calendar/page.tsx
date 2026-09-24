"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/Button";
import { StoreCalendarEmbedPanel } from "@/components/StoreCalendarEmbedPanel";
import { CalendarCategoryManager } from "@/components/CalendarCategoryManager";
import { CalendarMonthGrid } from "@/components/calendar/CalendarMonthGrid";
import { AdminEventList } from "@/components/calendar/AdminEventList";
import { FlyerDisplayPanel } from "@/components/calendar/FlyerDisplayPanel";
import {
  AdminEventEditorDialog,
  emptyEventForm,
  formFromEvent,
  fromLocalInput,
  type EventEditorFormState,
} from "@/components/calendar/AdminEventEditorDialog";
import { resolveStoreEventCategories } from "@/lib/store-calendar/categories";
import { eventsInSameSeries } from "@/lib/store-calendar/event-list-groups";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import { startOfMonth } from "@/lib/store-calendar/date-utils";
import type { CalendarSettings, StoreEvent } from "@/lib/store-calendar/types";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";
import type { StoreSettings } from "@/lib/types";

type CalendarTab = "calendar" | "display";

export default function AdminCalendarPage() {
  const { loading: authLoading, activeStore } = useAdmin();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [events, setEvents] = useState<StoreEvent[]>([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CalendarTab>("calendar");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingEvent, setEditingEvent] = useState<StoreEvent | null>(null);
  const [editorForm, setEditorForm] = useState<EventEditorFormState>(
    emptyEventForm(),
  );

  const load = useCallback(async () => {
    const [settingsRes, eventsRes] = await Promise.all([
      adminFetch("/api/admin/settings"),
      adminFetch("/api/admin/store-events"),
    ]);
    const settingsData = await settingsRes.json();
    const eventsData = await eventsRes.json();
    if (settingsData.settings) setSettings(settingsData.settings);
    if (eventsData.events) setEvents(eventsData.events);
  }, []);

  useEffect(() => {
    if (authLoading || !activeStore) return;
    void load();
  }, [authLoading, activeStore, load]);

  function openCreate(day: Date) {
    setEditorMode("create");
    setEditingEvent(null);
    setEditorForm(emptyEventForm(day));
    setEditorOpen(true);
  }

  function openEdit(event: StoreEvent) {
    setEditorMode("edit");
    setEditingEvent(event);
    setEditorForm(formFromEvent(event));
    setMonth(startOfMonth(new Date(event.startAt)));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingEvent(null);
  }

  async function saveCalendarSettings(patch: Partial<CalendarSettings>) {
    setMessage(null);
    const res = await adminFetch("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        calendarSettings: {
          ...(settings?.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS),
          ...patch,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Could not save calendar settings");
      return;
    }
    setSettings(data.settings);
    setMessage("Calendar settings saved.");
  }

  async function submitEvent(form: EventEditorFormState) {
    setSaving(true);
    setMessage(null);
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      color: form.color.trim() || undefined,
      startAt: fromLocalInput(form.startAt),
      endAt: fromLocalInput(form.endAt || form.startAt),
      allDay: form.allDay,
      signupUrl: form.signupUrl.trim() || undefined,
      capacity: form.capacity.trim() ? Number(form.capacity) : undefined,
      cost: form.cost.trim() ? Number(form.cost) : undefined,
      requiredBracket: form.requiredBracket.trim()
        ? Number(form.requiredBracket)
        : undefined,
      published: form.published,
    };

    if (editorMode === "create" && form.repeatWeekly) {
      payload.repeatWeekly = true;
      payload.repeatWeekday = Number(form.repeatWeekday);
      payload.repeatUntil = form.repeatUntil
        ? `${form.repeatUntil}T23:59:59`
        : undefined;
      payload.repeatStartTime = form.startAt.split("T")[1]?.slice(0, 5);
      payload.repeatEndTime = (form.endAt || form.startAt)
        .split("T")[1]
        ?.slice(0, 5);
    }

    const res = await adminFetch(
      editorMode === "edit" && editingEvent
        ? `/api/admin/store-events/${encodeURIComponent(editingEvent.id)}`
        : "/api/admin/store-events",
      {
        method: editorMode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error ?? "Could not save event");
      return;
    }
    closeEditor();
    await load();
    if (data.count && data.count > 1) {
      setMessage(`Created ${data.count} weekly events.`);
      return;
    }
    setMessage(editorMode === "edit" ? "Event updated." : "Event saved.");
  }

  async function deleteEditingEvent() {
    if (!editingEvent) return;

    const siblings = eventsInSameSeries(editingEvent, events);
    let deleteSeries = false;

    if (siblings.length > 1) {
      deleteSeries = window.confirm(
        `Delete all ${siblings.length} events in this recurring series?\n\nOK deletes every date in the series.\nCancel lets you delete only this one date.`,
      );
      if (!deleteSeries) {
        const dateLabel = new Date(editingEvent.startAt).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        if (!window.confirm(`Delete only ${dateLabel}?`)) return;
      }
    } else if (!window.confirm("Delete this event?")) {
      return;
    }

    const url =
      `/api/admin/store-events/${encodeURIComponent(editingEvent.id)}` +
      (deleteSeries ? "?scope=series" : "");

    const res = await adminFetch(url, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error ?? "Could not delete event");
      return;
    }
    const data = (await res.json()) as { deletedCount?: number };
    closeEditor();
    await load();
    setMessage(
      data.deletedCount && data.deletedCount > 1
        ? `Deleted ${data.deletedCount} events in the series.`
        : "Event deleted.",
    );
  }

  async function seedSchedule() {
    if (
      !window.confirm(
        "Load the full recurring store schedule for this month? Skips if events already exist.",
      )
    ) {
      return;
    }
    setSeeding(true);
    const now = new Date();
    const res = await adminFetch("/api/admin/calendar/seed", {
      method: "POST",
      body: JSON.stringify({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      }),
    });
    const data = await res.json();
    setSeeding(false);
    if (!res.ok) {
      setMessage(data.error ?? "Could not load schedule");
      return;
    }
    await load();
    setMessage(data.message ?? "Schedule loaded.");
  }

  const calendar = settings?.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS;
  const eventCategories = useMemo(
    () => resolveStoreEventCategories(calendar.customCategories),
    [calendar.customCategories],
  );

  if (!settings) {
    return (
      <AdminLayout>
        <p>Loading…</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Event calendar</h2>
          <p className="mt-1 text-sm text-slate-600">
            Click any day to add an event. Open an event and choose the Signups tab to see
            who registered and which Commander decks they are bringing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "calendar" ? (
            <>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  calendar.published
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                {calendar.published ? "Published" : "Draft"}
              </span>
              <Button
                type="button"
                variant="secondary"
                className="!py-2 !text-xs"
                onClick={() => setSettingsOpen((v) => !v)}
              >
                {settingsOpen ? "Hide settings" : "Settings & embed"}
              </Button>
              <Button
                type="button"
                variant="primary"
                className="!py-2 !text-xs"
                onClick={() => openCreate(new Date())}
              >
                + Create
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
            activeTab === "calendar"
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Calendar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("display")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
            activeTab === "display"
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Display
        </button>
      </div>

      {activeTab === "display" ? (
        <div className="mt-6">
          <FlyerDisplayPanel storeSlug={settings.storeSlug} />
        </div>
      ) : (
        <>
      <div className="mt-4">
        <CalendarMonthGrid
          month={month}
          events={events}
          categories={eventCategories}
          timeZone={calendar.timezone}
          onMonthChange={setMonth}
          onDayClick={openCreate}
          onEventClick={openEdit}
          showDrafts
        />
      </div>

      <AdminEventList
        events={events}
        month={month}
        categories={eventCategories}
        timeZone={calendar.timezone}
        onEdit={openEdit}
        onEventsChanged={load}
      />

      <AdminEventEditorDialog
        open={editorOpen}
        mode={editorMode}
        editingEvent={editingEvent}
        categories={eventCategories}
        initialForm={editorForm}
        saving={saving}
        onClose={closeEditor}
        onSubmit={submitEvent}
        onDelete={editorMode === "edit" ? deleteEditingEvent : undefined}
        onSignupsChanged={() => void load()}
      />

      {settingsOpen ? (
        <div className="mt-8 space-y-4 border-t pt-8">
          <div className="max-w-2xl rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Publish</h3>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={calendar.enabled !== false}
                  onChange={(e) =>
                    void saveCalendarSettings({ enabled: e.target.checked })
                  }
                />
                Enabled
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={calendar.published === true}
                  onChange={(e) =>
                    void saveCalendarSettings({ published: e.target.checked })
                  }
                />
                Published
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={calendar.embedEnabled !== false}
                  onChange={(e) =>
                    void saveCalendarSettings({ embedEnabled: e.target.checked })
                  }
                />
                Embed allowed
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="font-medium">Public headline</span>
              <input
                type="text"
                defaultValue={calendar.headline ?? DEFAULT_CALENDAR_SETTINGS.headline}
                key={calendar.headline}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                onBlur={(e) =>
                  void saveCalendarSettings({ headline: e.target.value.trim() })
                }
              />
            </label>
          </div>

          <div className="max-w-2xl">
            <CalendarCategoryManager
              calendarSettings={calendar}
              eventCategoryIds={events.map((e) => e.category)}
              onSave={saveCalendarSettings}
            />
          </div>

          <div className="max-w-2xl">
            <StoreCalendarEmbedPanel
              storeSlug={settings.storeSlug}
              storeName={settings.storeName}
              calendarPublished={calendar.published}
              embedEnabled={calendar.embedEnabled}
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            disabled={seeding}
            onClick={() => void seedSchedule()}
          >
            {seeding ? "Loading…" : "Import sample month schedule"}
          </Button>
        </div>
      ) : null}
        </>
      )}

      {message ? (
        <p
          className={`mt-4 text-sm ${
            message.includes("Could not") ? "text-red-600" : "text-green-700"
          }`}
        >
          {message}
        </p>
      ) : null}
    </AdminLayout>
  );
}

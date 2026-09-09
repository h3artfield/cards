"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { EventSignupsPanel } from "@/components/EventSignupsPanel";
import { adminFetch } from "@/lib/api-client";
import type { StoreEventCategoryMeta } from "@/lib/store-calendar/categories";
import { WEEKDAY_LABELS } from "@/lib/store-calendar/recurrence";
import type { StoreEvent } from "@/lib/store-calendar/types";

export type EventEditorFormState = {
  title: string;
  description: string;
  category: string;
  color: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  signupUrl: string;
  capacity: string;
  published: boolean;
  repeatWeekly: boolean;
  repeatWeekday: string;
  repeatUntil: string;
};

export function endOfMonthInputValue(isoOrLocal: string): string {
  if (!isoOrLocal) return "";
  const d = new Date(isoOrLocal);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
}

export function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultSlotForDay(day: Date): { startAt: string; endAt: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  return { startAt: `${date}T18:00`, endAt: `${date}T22:00` };
}

export function emptyEventForm(day?: Date): EventEditorFormState {
  const slot = day ? defaultSlotForDay(day) : { startAt: "", endAt: "" };
  const weekday = day ? String(day.getDay()) : "1";
  return {
    title: "",
    description: "",
    category: "other",
    color: "",
    startAt: slot.startAt,
    endAt: slot.endAt,
    allDay: false,
    signupUrl: "",
    capacity: "",
    published: true,
    repeatWeekly: false,
    repeatWeekday: weekday,
    repeatUntil: day ? endOfMonthInputValue(slot.startAt) : "",
  };
}

export function formFromEvent(event: StoreEvent): EventEditorFormState {
  return {
    title: event.title,
    description: event.description ?? "",
    category: event.category,
    color: event.color ?? "",
    startAt: toLocalInput(event.startAt),
    endAt: toLocalInput(event.endAt),
    allDay: event.allDay ?? false,
    signupUrl: event.signupUrl ?? "",
    capacity: event.capacity != null ? String(event.capacity) : "",
    published: event.published,
    repeatWeekly: false,
    repeatWeekday: String(new Date(event.startAt).getDay()),
    repeatUntil: endOfMonthInputValue(event.startAt),
  };
}

type Props = {
  open: boolean;
  mode: "create" | "edit";
  editingEvent: StoreEvent | null;
  categories: StoreEventCategoryMeta[];
  initialForm: EventEditorFormState;
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: EventEditorFormState) => Promise<void>;
  onDelete?: () => Promise<void>;
  onSignupsChanged?: () => void;
};

export function AdminEventEditorDialog({
  open,
  mode,
  editingEvent,
  categories,
  initialForm,
  saving,
  onClose,
  onSubmit,
  onDelete,
  onSignupsChanged,
}: Props) {
  const [form, setForm] = useState(initialForm);
  const [tab, setTab] = useState<"details" | "signups">("details");
  const [signupCount, setSignupCount] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setTab("details");
      setSignupCount(null);
    }
  }, [open, initialForm]);

  useEffect(() => {
    if (!open || mode !== "edit" || !editingEvent) return;
    let cancelled = false;
    void adminFetch(`/api/admin/store-events/${encodeURIComponent(editingEvent.id)}/signups`)
      .then(async (res) => (res.ok ? await res.json() : null))
      .then((data: { signupCount?: number } | null) => {
        if (!cancelled && data) setSignupCount(data.signupCount ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, mode, editingEvent]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit(form);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="my-4 w-full max-w-lg rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-editor-title"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="event-editor-title" className="text-lg font-semibold text-gray-900">
            {mode === "create" ? "Add event" : "Edit event"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {mode === "edit" && editingEvent ? (
          <div className="flex border-b px-5">
            <button
              type="button"
              onClick={() => setTab("details")}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                tab === "details"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-600"
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setTab("signups")}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                tab === "signups"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-600"
              }`}
            >
              Signups{signupCount != null ? ` (${signupCount})` : ""}
            </button>
          </div>
        ) : null}

        {tab === "signups" && editingEvent ? (
          <div className="max-h-[70vh] overflow-y-auto p-5">
            <EventSignupsPanel
              event={editingEvent}
              onChanged={onSignupsChanged}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
            <label className="block text-sm">
              <span className="font-medium">Title</span>
              <input
                required
                autoFocus
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="Event name"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Start</span>
                <input
                  type="datetime-local"
                  required
                  value={form.startAt}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      startAt: e.target.value,
                      repeatWeekday: String(new Date(e.target.value).getDay()),
                      repeatUntil:
                        f.repeatUntil || endOfMonthInputValue(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">End</span>
                <input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endAt: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="font-medium">Repeat</span>
              <select
                value={form.repeatWeekly ? "weekly" : "none"}
                disabled={mode === "edit"}
                onChange={(e) => {
                  const weekly = e.target.value === "weekly";
                  setForm((f) => ({
                    ...f,
                    repeatWeekly: weekly,
                    repeatUntil:
                      f.repeatUntil || endOfMonthInputValue(f.startAt),
                    repeatWeekday: f.startAt
                      ? String(new Date(f.startAt).getDay())
                      : f.repeatWeekday,
                  }));
                }}
                className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-gray-50"
              >
                <option value="none">Does not repeat</option>
                <option value="weekly">
                  Weekly on{" "}
                  {WEEKDAY_LABELS[Number(form.repeatWeekday)] ?? "…"}
                </option>
              </select>
              {mode === "edit" ? (
                <span className="mt-1 block text-xs text-gray-500">
                  To change a recurring series, edit individual occurrences or
                  delete and recreate.
                </span>
              ) : null}
            </label>

            {form.repeatWeekly && mode === "create" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium">Every</span>
                  <select
                    value={form.repeatWeekday}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, repeatWeekday: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  >
                    {WEEKDAY_LABELS.map((label, index) => (
                      <option key={label} value={String(index)}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Until</span>
                  <input
                    type="date"
                    required
                    value={form.repeatUntil || endOfMonthInputValue(form.startAt)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, repeatUntil: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
              </div>
            ) : null}

            <label className="block text-sm">
              <span className="font-medium">Category</span>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Capacity</span>
                <input
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, capacity: e.target.value }))
                  }
                  placeholder="Unlimited"
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, published: e.target.checked }))
                  }
                />
                Published
              </label>
            </div>

            <label className="block text-sm">
              <span className="font-medium">Description</span>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>

            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-gray-700">
                More options
              </summary>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="font-medium">External signup URL</span>
                  <input
                    type="url"
                    value={form.signupUrl}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, signupUrl: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="font-medium">Color override</span>
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, color: e.target.value }))
                    }
                    placeholder="#c026d3"
                    className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.allDay}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, allDay: e.target.checked }))
                    }
                  />
                  All day
                </label>
              </div>
            </details>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : mode === "create" ? "Save" : "Update"}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              {mode === "edit" && onDelete ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="!text-red-700"
                  disabled={saving}
                  onClick={() => void onDelete()}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function fromLocalInput(value: string): string {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}

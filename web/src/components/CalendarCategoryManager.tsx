"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import {
  BUILTIN_CATEGORY_IDS,
  resolveStoreEventCategories,
  slugifyCategoryId,
} from "@/lib/store-calendar/categories";
import { buildCustomCategoryInput } from "@/lib/store-calendar/normalize";
import type { CalendarCustomCategory, CalendarSettings } from "@/lib/store-calendar/types";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";

type Props = {
  calendarSettings: CalendarSettings;
  eventCategoryIds: string[];
  onSave: (patch: Partial<CalendarSettings>) => Promise<void>;
};

export function CalendarCategoryManager({
  calendarSettings,
  eventCategoryIds,
  onSave,
}: Props) {
  const calendar = calendarSettings ?? DEFAULT_CALENDAR_SETTINGS;
  const allCategories = resolveStoreEventCategories(calendar.customCategories);
  const customCategories = calendar.customCategories ?? [];

  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    setLocalMessage(null);
    const next = buildCustomCategoryInput(label, color, customCategories);
    if (!next) {
      const id = slugifyCategoryId(label);
      if (BUILTIN_CATEGORY_IDS.has(id) || customCategories.some((c) => c.id === id)) {
        setLocalMessage("A category with that name already exists.");
      } else {
        setLocalMessage("Enter a category name.");
      }
      return;
    }

    setSaving(true);
    await onSave({
      customCategories: [...customCategories, next],
    });
    setSaving(false);
    setLabel("");
    setLocalMessage("Category added.");
  }

  async function removeCategory(id: string) {
    setLocalMessage(null);
    if (eventCategoryIds.includes(id)) {
      setLocalMessage("Remove or reassign events using this category before deleting it.");
      return;
    }
    if (!window.confirm("Delete this custom category?")) return;

    setSaving(true);
    await onSave({
      customCategories: customCategories.filter((c) => c.id !== id),
    });
    setSaving(false);
    setLocalMessage("Category removed.");
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Event categories</h3>
      <p className="mt-1 text-xs text-gray-600">
        Built-in categories appear as filter chips on your public calendar. Add
        custom categories for games or event types specific to your store.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {allCategories.map((category) => (
          <span
            key={category.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-800"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: category.color }}
              aria-hidden
            />
            {category.label}
            {category.builtin ? (
              <span className="text-[10px] text-gray-400">built-in</span>
            ) : null}
          </span>
        ))}
      </div>

      {customCategories.length > 0 ? (
        <ul className="mt-4 divide-y rounded-lg border">
          {customCategories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: category.color }}
                  aria-hidden
                />
                <span className="font-medium text-gray-900">{category.label}</span>
                <span className="font-mono text-[10px] text-gray-400">
                  {category.id}
                </span>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void removeCategory(category.id)}
                className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-gray-500">No custom categories yet.</p>
      )}

      <form onSubmit={addCategory} className="mt-4 space-y-3 border-t pt-4">
        <p className="text-xs font-medium text-gray-700">Add custom category</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Flesh and Blood"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border px-1 py-1"
            />
          </label>
          <Button type="submit" disabled={saving} className="!py-2">
            {saving ? "Saving…" : "Add"}
          </Button>
        </div>
      </form>

      {localMessage ? (
        <p
          className={`mt-3 text-xs ${
            localMessage.includes("exists") ||
            localMessage.includes("before deleting") ||
            localMessage.includes("Enter")
              ? "text-red-600"
              : "text-green-700"
          }`}
        >
          {localMessage}
        </p>
      ) : null}
    </div>
  );
}

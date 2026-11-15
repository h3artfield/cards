"use client";

import { useMemo, useState } from "react";
import {
  MAGIC_TYPE_LINE_GROUPS,
  parseMagicTypeLineSelection,
  toggleMagicTypeLineSelection,
} from "@/lib/inventory/magic-type-line-options";

export function TypeLineFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (typeLine: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => parseMagicTypeLineSelection(value), [value]);
  const selectedLower = useMemo(
    () => new Set(selected.map((item) => item.toLowerCase())),
    [selected],
  );
  const needle = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      MAGIC_TYPE_LINE_GROUPS.map((group) => ({
        ...group,
        options: needle
          ? group.options.filter((option) => option.toLowerCase().includes(needle))
          : group.options,
      })).filter((group) => group.options.length > 0),
    [needle],
  );
  const summary =
    selected.length === 0
      ? "Any type"
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label="Type line"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white"
      >
        <span className={`min-w-0 truncate ${selected.length ? "" : "text-neutral-500"}`}>
          {summary}
        </span>
        <span className="shrink-0 text-xs text-neutral-400" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {selected.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {selected.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(toggleMagicTypeLineSelection(value, option))}
              className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-200 hover:bg-neutral-700"
            >
              {option} ×
            </button>
          ))}
        </div>
      ) : null}
      {open ? (
        <div
          className="mt-1 max-h-72 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search types"
            aria-label="Search types"
            className="sticky top-0 z-10 w-full border-b border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500"
          />
          {groups.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-500">No types match.</p>
          ) : (
            groups.map((group) => (
              <div key={group.id}>
                <p className="sticky top-9 bg-neutral-900 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  {group.label}
                </p>
                <ul>
                  {group.options.map((option) => {
                    const checked = selectedLower.has(option.toLowerCase());
                    return (
                      <li key={`${group.id}-${option}`}>
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-sm text-neutral-100 hover:bg-neutral-900">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onChange(toggleMagicTypeLineSelection(value, option))}
                          />
                          <span className="min-w-0">{option}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

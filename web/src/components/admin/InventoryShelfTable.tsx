"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import {
  SHELF_CONDITIONS,
  shelfConditionLabel,
  describeShelfChange,
  shelfConditionShort,
  shelfCustomerName,
  type ShelfRowEdit,
} from "@/lib/inventory/shelf-row-edit";
import { inventoryEffectiveQuantity, inventoryOnlineQuantity } from "@/lib/inventory/status";
import {
  inferInventoryFinish,
  inventoryFinishBadgeLabel,
} from "@/lib/inventory/inventory-finish-v1";
import {
  SHELF_BINDERS_V1,
  SHELF_CABINETS_V1,
  SHELF_CONTENTS_V1,
} from "@/lib/inventory/shelf-location";
import type { InventoryItem } from "@/lib/types";

const COLUMNS = [
  { id: "image", label: "Image" },
  { id: "name", label: "Name" },
  { id: "location", label: "Location" },
  { id: "set", label: "Set" },
  { id: "number", label: "Number" },
  { id: "finish", label: "Finish" },
  { id: "condition", label: "Condition" },
  { id: "qty", label: "Qty" },
  { id: "online", label: "Online" },
  { id: "price", label: "Price" },
  { id: "notes", label: "Notes" },
] as const;

const LOCATION_GROUPS = [
  { label: "Cases", spots: [...SHELF_CABINETS_V1] as string[] },
  { label: "Binders", spots: [...SHELF_BINDERS_V1] as string[] },
  { label: "Other", spots: ["Bulk"] },
];

function locationOptionLabel(spot: string): string {
  const contents = SHELF_CONTENTS_V1[spot]?.label;
  const bare = spot.replace(/^Binder /, "").replace(/ Binder$/, "");
  return contents && contents !== bare ? `${spot} · ${contents}` : spot;
}

function changeDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type ColumnId = (typeof COLUMNS)[number]["id"];

export function InventoryShelfTable({
  items,
  thumbSrc,
  onSaved,
}: {
  items: InventoryItem[];
  thumbSrc: (item: InventoryItem) => string | undefined;
  onSaved: (item: InventoryItem) => void;
}) {
  const [visible, setVisible] = useState<Set<ColumnId>>(
    () => new Set(COLUMNS.map((column) => column.id)),
  );
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  function toggleColumn(id: ColumnId) {
    if (id === "name") return;
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(item: InventoryItem, edit: ShelfRowEdit) {
    setSaving(item.id);
    setRowError((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      const res = await adminFetch(`/api/admin/inventory/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify(edit),
      });
      const body = (await res.json()) as { item?: InventoryItem; error?: string };
      if (!res.ok || !body.item) throw new Error(body.error ?? "Could not save");
      onSaved(body.item);
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [item.id]: err instanceof Error ? err.message : "Could not save",
      }));
    } finally {
      setSaving(null);
    }
  }

  const show = (id: ColumnId) => visible.has(id);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs font-medium text-slate-600">Columns</p>
        {COLUMNS.map((column) => (
          <label key={column.id} className="flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={visible.has(column.id)}
              disabled={column.id === "name"}
              onChange={() => toggleColumn(column.id)}
            />
            {column.label}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Name, location, condition, quantity, online copies, price, and notes save on this
        inventory, and every change is kept in the card&apos;s history. Search finds cards by
        name, location, or note. Shopify checkout still charges the last exported price.
        Online is how many copies can ship; the rest are in-store only.
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {show("image") ? <th className="px-2 py-2 font-medium"> </th> : null}
              {show("name") ? <th className="px-2 py-2 font-medium">Name</th> : null}
              {show("location") ? <th className="px-2 py-2 font-medium">Location</th> : null}
              {show("set") ? <th className="px-2 py-2 font-medium">Set</th> : null}
              {show("number") ? <th className="px-2 py-2 font-medium">Number</th> : null}
              {show("finish") ? <th className="px-2 py-2 font-medium">Finish</th> : null}
              {show("condition") ? <th className="px-2 py-2 font-medium">Condition</th> : null}
              {show("qty") ? <th className="px-2 py-2 font-medium">Qty</th> : null}
              {show("online") ? (
                <th className="px-2 py-2 font-medium" title="Copies that can be bought online; the rest are in-store only">
                  Online
                </th>
              ) : null}
              {show("price") ? <th className="px-2 py-2 font-medium">Price</th> : null}
              {show("notes") ? <th className="px-2 py-2 font-medium">Notes</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const qty = inventoryEffectiveQuantity(item);
              const online = inventoryOnlineQuantity(item);
              const condition = shelfConditionLabel(item);
              const finish = inventoryFinishBadgeLabel(inferInventoryFinish(item));
              const src = thumbSrc(item);
              const busy = saving === item.id;
              const location = item.shelfLocation?.trim() ?? "";
              const knownLocation = LOCATION_GROUPS.some((g) => g.spots.includes(location));
              const changes = item.changeLog ?? [];
              const lastChange = changes[changes.length - 1];
              const historyOpen = openHistory === item.id;
              return (
                <Fragment key={item.id}>
                <tr className="border-t border-slate-100 align-middle">
                  {show("image") ? (
                    <td className="px-2 py-1.5">
                      {src && !broken.has(item.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          className="h-12 w-9 rounded object-cover ring-1 ring-slate-200"
                          onError={() => setBroken((current) => new Set(current).add(item.id))}
                        />
                      ) : (
                        <div className="flex h-12 w-9 items-center justify-center rounded bg-slate-100 text-[9px] text-slate-400">
                          No img
                        </div>
                      )}
                    </td>
                  ) : null}
                  {show("name") ? (
                    <td className="min-w-56 px-2 py-1.5">
                      <DraftInput
                        ariaLabel={`Name for ${shelfCustomerName(item)}`}
                        value={shelfCustomerName(item)}
                        disabled={busy}
                        onCommit={(displayName) => void save(item, { displayName })}
                      />
                      {rowError[item.id] ? (
                        <p className="mt-0.5 text-[11px] text-red-600">{rowError[item.id]}</p>
                      ) : null}
                    </td>
                  ) : null}
                  {show("location") ? (
                    <td className="min-w-40 px-2 py-1.5">
                      <select
                        aria-label={`Location for ${shelfCustomerName(item)}`}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 font-medium hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
                        value={location}
                        disabled={busy}
                        onChange={(event) => void save(item, { shelfLocation: event.target.value })}
                      >
                        {!location ? <option value="">No location</option> : null}
                        {location && !knownLocation ? <option value={location}>{location}</option> : null}
                        {LOCATION_GROUPS.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.spots.map((spot) => (
                              <option key={spot} value={spot}>
                                {locationOptionLabel(spot)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {item.suggestedLocation && item.suggestedLocation !== location ? (
                        <p className="mt-0.5 text-[11px] text-amber-500">
                          Price says {item.suggestedLocation}
                        </p>
                      ) : null}
                    </td>
                  ) : null}
                  {show("set") ? (
                    <td className="max-w-48 truncate px-2 py-1.5 text-slate-600">
                      {item.setName ?? item.productLine ?? "—"}
                    </td>
                  ) : null}
                  {show("number") ? (
                    <td className="px-2 py-1.5 tabular-nums text-slate-600">
                      {item.cardNumber ?? "—"}
                    </td>
                  ) : null}
                  {show("finish") ? (
                    <td className="px-2 py-1.5 text-slate-600">{finish ?? "—"}</td>
                  ) : null}
                  {show("condition") ? (
                    <td className="px-2 py-1.5">
                      <select
                        aria-label={`Condition for ${shelfCustomerName(item)}`}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
                        title={condition}
                        value={condition}
                        disabled={busy}
                        onChange={(event) => void save(item, { condition: event.target.value })}
                      >
                        {condition &&
                        !SHELF_CONDITIONS.some((row) => row.label === condition) ? (
                          <option value={condition}>{shelfConditionShort(condition)}</option>
                        ) : null}
                        {SHELF_CONDITIONS.map((row) => (
                          <option key={row.condition} value={row.label}>
                            {row.condition}
                          </option>
                        ))}
                      </select>
                    </td>
                  ) : null}
                  {show("qty") ? (
                    <td className="w-20 px-2 py-1.5">
                      <DraftInput
                        ariaLabel={`Quantity for ${shelfCustomerName(item)}`}
                        value={String(qty)}
                        inputMode="numeric"
                        disabled={busy}
                        onCommit={(raw) => {
                          const quantity = Number(raw);
                          if (!raw.trim() || !Number.isInteger(quantity)) return;
                          void save(item, { quantity });
                        }}
                      />
                    </td>
                  ) : null}
                  {show("online") ? (
                    <td className="w-28 px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12">
                          <DraftInput
                            ariaLabel={`Online copies of ${shelfCustomerName(item)}`}
                            value={String(online)}
                            inputMode="numeric"
                            disabled={busy}
                            onCommit={(raw) => {
                              const onlineQuantity = Number(raw);
                              if (!raw.trim() || !Number.isInteger(onlineQuantity)) return;
                              void save(item, { onlineQuantity });
                            }}
                          />
                        </div>
                        {qty > 0 && online === 0 ? (
                          <span className="whitespace-nowrap rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-300">
                            In-store
                          </span>
                        ) : online > 0 ? (
                          <span
                            className="whitespace-nowrap rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300"
                            title="Can ship or be picked up in store"
                          >
                            Online
                          </span>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  {show("price") ? (
                    <td className="w-24 px-2 py-1.5">
                      <DraftInput
                        ariaLabel={`Price for ${shelfCustomerName(item)}`}
                        value={item.listPrice != null ? item.listPrice.toFixed(2) : ""}
                        inputMode="decimal"
                        disabled={busy}
                        onCommit={(raw) => {
                          const listPrice = Number(raw);
                          if (!raw.trim() || !Number.isFinite(listPrice)) return;
                          void save(item, { listPrice });
                        }}
                      />
                    </td>
                  ) : null}
                  {show("notes") ? (
                    <td className="min-w-56 px-2 py-1.5">
                      <DraftInput
                        ariaLabel={`Notes for ${shelfCustomerName(item)}`}
                        value={item.staffNote ?? ""}
                        placeholder="Add a note…"
                        disabled={busy}
                        onCommit={(staffNote) => void save(item, { staffNote })}
                      />
                      {lastChange ? (
                        <button
                          type="button"
                          onClick={() => setOpenHistory(historyOpen ? null : item.id)}
                          className="mt-0.5 block max-w-64 truncate text-left text-[11px] text-slate-500 hover:text-slate-800"
                          title="Show every change"
                        >
                          {changeDate(lastChange.at)} · {describeShelfChange(lastChange)}
                          {changes.length > 1 ? ` (+${changes.length - 1})` : ""}
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
                {historyOpen ? (
                  <tr className="bg-slate-50">
                    <td colSpan={COLUMNS.length} className="px-4 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Change history · {shelfCustomerName(item)}
                      </p>
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                        {[...changes].reverse().map((c, idx) => (
                          <li key={`${c.at}-${c.field}-${idx}`}>
                            <span className="tabular-nums text-slate-500">{changeDate(c.at)}</span> ·{" "}
                            {describeShelfChange(c)}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DraftInput({
  value,
  ariaLabel,
  disabled,
  inputMode,
  placeholder,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  inputMode?: "text" | "numeric" | "decimal";
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const skip = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-slate-200 focus:border-indigo-400 focus:outline-none disabled:opacity-60"
      value={draft}
      inputMode={inputMode}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (skip.current) {
          skip.current = false;
          return;
        }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          skip.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

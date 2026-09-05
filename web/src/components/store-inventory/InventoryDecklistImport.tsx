"use client";

import { useRef, useState } from "react";
import { useCustomer } from "@/context/CustomerContext";
import type { GatheringCard } from "./clerk-gathering";
import {
  deckBuildSignInHref,
  deckBuildReturnPath,
} from "@/lib/store-inventory/deck-build-auth";

type MatchResult = {
  inStock: GatheringCard[];
  outOfStock: Array<{ name: string; quantity: number }>;
  unmatched: string[];
};

export function InventoryDecklistImport({
  slug,
  onAddMany,
  open: openProp,
  onOpenChange,
}: {
  slug: string;
  onAddMany: (cards: GatheringCard[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { customer } = useCustomer();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
  }
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [notifySent, setNotifySent] = useState(false);

  async function runMatch(decklistText: string) {
    setLoading(true);
    setError(null);
    setNotifySent(false);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/inventory/decklist-match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decklistText }),
        },
      );
      const data = (await res.json()) as MatchResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      if (data.inStock.length > 0) {
        onAddMany(
          data.inStock.map((card) => ({
            ...card,
            qty: card.qty ?? 1,
            colorIdentity: card.colorIdentity ?? [],
          })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file: File) {
    const decklistText = await file.text();
    setText(decklistText);
    await runMatch(decklistText);
  }

  async function requestNotify() {
    if (!result) return;
    const names = [
      ...result.outOfStock.map((r) => r.name),
      ...result.unmatched,
    ];
    if (names.length === 0) return;
    if (!customer) {
      window.location.assign(
        deckBuildSignInHref(slug, deckBuildReturnPath(slug, "inventory")),
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/inventory/stock-notify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ cardNames: names }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save notification");
      setNotifySent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notify request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="inventory-paste-list" className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white">Paste a card list</p>
          <p className="text-[11px] text-neutral-400">
            Copy and paste names (or upload a .txt) to see which are in stock
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500"
        >
          {open ? "Hide" : "Paste list"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"1 Sol Ring\n1 Command Tower\n1 Lightning Bolt\n..."}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder:text-neutral-600"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || !text.trim()}
              onClick={() => void runMatch(text)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-[var(--ink-900)] hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Checking…" : "Check stock"}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500"
            >
              Upload file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.deck,.txt,.text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}

          {result ? (
            <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 text-xs">
              <p className="text-emerald-400">
                {result.inStock.length} in stock
                {result.inStock.length > 0 ? " — added to your pile" : ""}
              </p>
              {result.inStock.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-emerald-200/90">
                  {result.inStock.slice(0, 20).map((card) => (
                    <li key={card.inventoryItemId ?? card.name} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{card.name}</span>
                      {card.listPrice != null ? (
                        <span className="shrink-0 tabular-nums">${card.listPrice.toFixed(2)}</span>
                      ) : null}
                    </li>
                  ))}
                  {result.inStock.length > 20 ? (
                    <li className="text-neutral-500">…and {result.inStock.length - 20} more</li>
                  ) : null}
                </ul>
              ) : null}
              {result.outOfStock.length > 0 ? (
                <div>
                  <p className="font-medium text-amber-300/90">
                    {result.outOfStock.length} out of stock at this store
                  </p>
                  <ul className="mt-1 list-inside list-disc text-neutral-400">
                    {result.outOfStock.slice(0, 12).map((row) => (
                      <li key={row.name}>{row.name}</li>
                    ))}
                    {result.outOfStock.length > 12 ? (
                      <li>…and {result.outOfStock.length - 12} more</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
              {result.unmatched.length > 0 ? (
                <div>
                  <p className="font-medium text-neutral-300">
                    {result.unmatched.length} not found in inventory
                  </p>
                  <ul className="mt-1 list-inside list-disc text-neutral-500">
                    {result.unmatched.slice(0, 8).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {result.outOfStock.length + result.unmatched.length > 0 ? (
                <button
                  type="button"
                  disabled={loading || notifySent}
                  onClick={() => void requestNotify()}
                  className="mt-2 rounded-lg border border-indigo-500/50 px-3 py-1.5 text-[11px] text-indigo-200 hover:bg-indigo-950/40 disabled:opacity-50"
                >
                  {notifySent
                    ? "We’ll email you when these are in stock"
                    : customer
                      ? "Notify me when these are in stock"
                      : "Sign in to get stock alerts"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

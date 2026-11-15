"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { CardToMoveV1 } from "@/app/api/admin/inventory/cards-to-move/route";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Cards the overnight price refresh says now belong in another cabinet, binder or bulk. */
export function CardsToMovePanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [cards, setCards] = useState<CardToMoveV1[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/inventory/cards-to-move");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load cards to move");
      setCards(data.cards ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load cards to move");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / refresh
    void load();
  }, [load, refreshKey]);

  async function act(ids: string[], action: "moved" | "keep") {
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/inventory/cards-to-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Cards to move{cards.length ? ` (${cards.length})` : ""}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            A price change put these cards over a line ($6 for cabinets, 60¢ for bulk). Their location stays as is until
            you mark them moved.
          </p>
        </div>
        {cards.length ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void act(cards.map((c) => c.id), "moved")}
          >
            Mark all moved
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      {cards.length ? (
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2">Card</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2">TCG market</th>
                <th className="px-2 py-2">Move</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-2 py-2">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    <p className="text-slate-500">
                      {[c.setName, c.condition].filter(Boolean).join(" · ")}
                    </p>
                  </td>
                  <td className="px-2 py-2">{c.quantity}</td>
                  <td className="px-2 py-2 text-slate-500">{c.market != null ? money(c.market) : "—"}</td>
                  <td className="px-2 py-2">
                    {c.from} → <strong>{c.to}</strong>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      className="text-xs font-medium text-sky-700 hover:underline"
                      onClick={() => void act([c.id], "moved")}
                    >
                      Moved
                    </button>
                    <span className="px-1 text-slate-300">|</span>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-xs font-medium text-slate-600 hover:underline"
                      onClick={() => void act([c.id], "keep")}
                    >
                      Keep here
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No cards to move.</p>
      )}
    </div>
  );
}

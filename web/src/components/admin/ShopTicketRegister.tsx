"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import { computeTicketTotals } from "@/lib/shop-tickets/ticket-math";
import type { InventoryItem, ShopTicket, ShopTicketLine } from "@/lib/types";

type CustomerOption = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function customerLabel(customer: CustomerOption): string {
  const name = `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim();
  if (name && customer.email) return `${name} · ${customer.email}`;
  return name || customer.email || customer.id;
}

type Receipt = {
  ticket: ShopTicket;
  creditApplied: number;
  creditRemaining: number;
};

function sellPrice(item: InventoryItem): number {
  return (
    item.listPrice ??
    item.shopifyListing?.exportPrice ??
    item.tcgMarketPrice ??
    item.marketPrice ??
    0
  );
}

async function fetchRecentTickets(): Promise<ShopTicket[]> {
  const res = await adminFetch("/api/admin/shop-tickets");
  if (!res.ok) return [];
  const data = (await res.json()) as { tickets?: ShopTicket[] };
  return data.tickets ?? [];
}

function availableUnits(item: InventoryItem): number {
  return (
    item.quantityAvailable ??
    item.quantityOnHand ??
    item.quantity ??
    (item.status === "sold" ? 0 : 1)
  );
}

/**
 * The in-store register. This is the only place trade credit can be spent —
 * online checkout runs through Shopify, which takes card only.
 */
export function ShopTicketRegister() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InventoryItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [lines, setLines] = useState<ShopTicketLine[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [creditByCustomer, setCreditByCustomer] = useState<
    Record<string, number>
  >({});
  const [creditInput, setCreditInput] = useState("");

  const [ringingUp, setRingingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [recent, setRecent] = useState<ShopTicket[]>([]);

  const creditBalance = customerId ? (creditByCustomer[customerId] ?? 0) : 0;
  const visibleResults = query.trim().length >= 2 ? results : [];

  const totals = useMemo(
    () =>
      computeTicketTotals({
        lines,
        creditRequested: Number(creditInput) || 0,
        creditBalance,
      }),
    [lines, creditInput, creditBalance],
  );

  useEffect(() => {
    let active = true;

    adminFetch("/api/admin/customers")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { customers?: CustomerOption[] };
        if (active) setCustomers(data.customers ?? []);
      })
      .catch(() => {});

    fetchRecentTickets()
      .then((tickets) => {
        if (active) setRecent(tickets);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!customerId) return;

    let active = true;
    adminFetch(
      `/api/admin/customers/${encodeURIComponent(customerId)}/trade-credit`,
    )
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { balance?: { balance?: number } };
        if (active) {
          setCreditByCustomer((prev) => ({
            ...prev,
            [customerId]: data.balance?.balance ?? 0,
          }));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [customerId]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      adminFetch(
        `/api/admin/inventory/browse?source=all&stock=in_stock&limit=10&q=${encodeURIComponent(term)}`,
      )
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as { items?: InventoryItem[] };
          if (active) setResults(data.items ?? []);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  function addItem(item: InventoryItem) {
    setReceipt(null);
    setError(null);
    setLines((prev) => {
      const existing = prev.find((l) => l.inventoryItemId === item.id);
      const cap = Math.max(1, availableUnits(item));
      if (existing) {
        return prev.map((l) =>
          l.inventoryItemId === item.id
            ? { ...l, quantity: Math.min(cap, l.quantity + 1) }
            : l,
        );
      }
      return [
        ...prev,
        {
          inventoryItemId: item.id,
          displayName: item.displayName,
          setName: item.setName,
          quantity: 1,
          unitPrice: sellPrice(item),
        },
      ];
    });
  }

  function setLineQuantity(inventoryItemId: string, quantity: number) {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.inventoryItemId !== inventoryItemId)
        : prev.map((l) =>
            l.inventoryItemId === inventoryItemId ? { ...l, quantity } : l,
          ),
    );
  }

  async function ringUp() {
    if (!lines.length) return;
    setRingingUp(true);
    setError(null);
    setReceipt(null);

    try {
      const createRes = await adminFetch("/api/admin/shop-tickets", {
        method: "POST",
        body: JSON.stringify({
          customerId: customerId || undefined,
          items: lines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            quantity: l.quantity,
          })),
        }),
      });
      const created = (await createRes.json()) as {
        error?: string;
        ticket?: ShopTicket;
      };
      if (!createRes.ok || !created.ticket) {
        throw new Error(created.error ?? "Could not open the ticket");
      }

      const completeRes = await adminFetch(
        `/api/admin/shop-tickets/${encodeURIComponent(created.ticket.id)}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ tradeCredit: totals.tradeCreditApplied }),
        },
      );
      const completed = (await completeRes.json()) as {
        error?: string;
        ticket?: ShopTicket;
        creditApplied?: number;
        creditRemaining?: number;
        problems?: Array<{ displayName: string; reason: string }>;
      };

      if (!completeRes.ok || !completed.ticket) {
        const detail = completed.problems?.length
          ? ` (${completed.problems.map((p) => p.displayName).join(", ")})`
          : "";
        throw new Error(`${completed.error ?? "Could not ring up"}${detail}`);
      }

      setReceipt({
        ticket: completed.ticket,
        creditApplied: completed.creditApplied ?? 0,
        creditRemaining: completed.creditRemaining ?? 0,
      });
      if (customerId) {
        setCreditByCustomer((prev) => ({
          ...prev,
          [customerId]: completed.creditRemaining ?? 0,
        }));
      }
      setLines([]);
      setCreditInput("");
      setQuery("");
      setResults([]);
      setRecent(await fetchRecentTickets());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ring up");
    } finally {
      setRingingUp(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Ring up a sale</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sells from store inventory, marks it sold, and pushes the new quantity
          to Shopify. Add a customer to spend their trade credit.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="ticket-search"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Find a card
            </label>
            <input
              id="ticket-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Card name, set, or SKU"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
            {searching ? (
              <p className="mt-1 text-xs text-slate-400">Searching…</p>
            ) : null}
            {visibleResults.length > 0 ? (
              <ul className="mt-2 max-h-64 divide-y overflow-y-auto rounded-lg border">
                {visibleResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => addItem(item)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-slate-900">
                          {item.displayName}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {[item.setName, item.tcgplayerCondition]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-slate-600">
                        ${sellPrice(item).toFixed(2)}
                        <span className="block text-slate-400">
                          {availableUnits(item)} on hand
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="ticket-customer"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Customer (optional)
            </label>
            <select
              id="ticket-customer"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setCreditInput("");
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Walk-in — cash or card</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerLabel(c)}
                </option>
              ))}
            </select>

            {customerId ? (
              <div className="mt-3">
                <label
                  htmlFor="ticket-credit"
                  className="block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Trade credit to apply
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="ticket-credit"
                    type="number"
                    min={0}
                    step="0.01"
                    value={creditInput}
                    onChange={(e) => setCreditInput(e.target.value)}
                    className="w-32 rounded-lg border px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCreditInput(
                        Math.min(creditBalance, totals.subtotal).toFixed(2),
                      )
                    }
                    className="text-xs text-indigo-600 underline"
                  >
                    Use max
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  ${creditBalance.toFixed(2)} available. Anything left over
                  stays on the account.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {lines.length > 0 ? (
          <div className="mt-5 rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Card</th>
                  <th className="px-3 py-2 w-24">Qty</th>
                  <th className="px-3 py-2 w-24 text-right">Price</th>
                  <th className="px-3 py-2 w-24 text-right">Line</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => (
                  <tr key={l.inventoryItemId}>
                    <td className="px-3 py-2">
                      <span className="block text-slate-900">
                        {l.displayName}
                      </span>
                      {l.setName ? (
                        <span className="block text-xs text-slate-500">
                          {l.setName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) =>
                          setLineQuantity(
                            l.inventoryItemId,
                            Number(e.target.value),
                          )
                        }
                        aria-label={`Quantity for ${l.displayName}`}
                        className="w-16 rounded border px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${l.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${(l.unitPrice * l.quantity).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${l.displayName}`}
                        onClick={() => setLineQuantity(l.inventoryItemId, 0)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-col items-end gap-1 border-t bg-slate-50 px-3 py-3 text-sm">
              <p className="text-slate-600">
                Subtotal{" "}
                <span className="ml-2 font-medium text-slate-900">
                  ${totals.subtotal.toFixed(2)}
                </span>
              </p>
              {totals.tradeCreditApplied > 0 ? (
                <p className="text-emerald-700">
                  Trade credit{" "}
                  <span className="ml-2 font-medium">
                    −${totals.tradeCreditApplied.toFixed(2)}
                  </span>
                </p>
              ) : null}
              <p className="text-base font-semibold text-slate-900">
                Due now ${totals.cashDue.toFixed(2)}
              </p>
              <Button
                onClick={() => void ringUp()}
                disabled={ringingUp}
                className="mt-2"
              >
                {ringingUp ? "Ringing up…" : "Complete sale"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-lg border border-dashed p-6 text-center text-sm text-slate-400">
            Search for a card to start a ticket.
          </p>
        )}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {receipt ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-medium">
              Ticket {receipt.ticket.ticketNumber} completed — $
              {receipt.ticket.cashDue.toFixed(2)} collected.
            </p>
            {receipt.creditApplied > 0 ? (
              <p className="mt-1">
                ${receipt.creditApplied.toFixed(2)} trade credit applied. $
                {receipt.creditRemaining.toFixed(2)} left on the account.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Recent tickets</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No tickets yet.</p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {recent.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-slate-900">
                    {ticket.ticketNumber}
                    {ticket.customerName ? ` · ${ticket.customerName}` : ""}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {new Date(ticket.createdAt).toLocaleString()} ·{" "}
                    {ticket.lines.length} card
                    {ticket.lines.length === 1 ? "" : "s"} · {ticket.status}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-slate-900">
                    ${ticket.cashDue.toFixed(2)}
                  </span>
                  {ticket.tradeCreditApplied > 0 ? (
                    <span className="block text-xs text-emerald-700">
                      −${ticket.tradeCreditApplied.toFixed(2)} credit
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCustomer } from "@/context/CustomerContext";
import { useCart } from "@/hooks/useCart";
import type { RejectedCheckoutLine } from "@/lib/store-inventory/validate-cart";
import type { TradeCreditBalance } from "@/lib/types";

export function CartPanel({ slug }: { slug: string }) {
  const { lines, count, subtotal, setQuantity, remove, prune, clear } =
    useCart(slug);
  const { customer } = useCustomer();

  const [credit, setCredit] = useState<TradeCreditBalance | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedCheckoutLine[]>([]);

  useEffect(() => {
    if (!customer) return;

    let active = true;
    fetch(`/api/store/${encodeURIComponent(slug)}/trade-credit`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (active) setCredit(data.balance ?? null);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [customer, slug]);

  async function checkout() {
    setCheckingOut(true);
    setError(null);
    setRejected([]);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/cart/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            items: lines.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              quantity: l.quantity,
            })),
          }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        checkoutUrl?: string | null;
        rejected?: RejectedCheckoutLine[];
      };
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");

      if (data.rejected?.length) {
        setRejected(data.rejected);
        prune(data.rejected.map((r) => r.inventoryItemId));
      }

      if (!data.checkoutUrl) {
        setError(
          data.error ?? "None of these cards can be bought online right now.",
        );
        return;
      }

      window.location.assign(data.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-neutral-700 bg-neutral-900/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Cart</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {count === 0
              ? "Add cards from your pile or the grid"
              : `${count} card${count === 1 ? "" : "s"} · $${subtotal.toFixed(2)}`}
          </p>
        </div>
        {lines.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 text-[10px] text-neutral-500 underline hover:text-neutral-300"
          >
            Empty
          </button>
        ) : null}
      </div>

      {rejected.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-900/60 bg-amber-950/30 p-2 text-[11px] text-amber-200">
          {rejected.map((r) => (
            <li key={r.inventoryItemId}>
              {r.displayName ? `${r.displayName}: ` : ""}
              {r.message}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 p-2 text-[11px] text-red-300">
          {error}
        </p>
      ) : null}

      {lines.length > 0 ? (
        <>
          <ul className="mt-3 space-y-2">
            {lines.map((line) => (
              <li
                key={line.inventoryItemId}
                className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-2"
              >
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.imageUrl}
                    alt={line.name}
                    className="h-12 w-9 shrink-0 rounded object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-white">{line.name}</p>
                  <p className="truncate text-[10px] text-neutral-500">
                    ${line.unitPrice.toFixed(2)}
                    {line.setName ? ` · ${line.setName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`One fewer ${line.name}`}
                    className="rounded border border-neutral-700 px-1.5 text-[11px] text-neutral-300"
                    onClick={() =>
                      setQuantity(line.inventoryItemId, line.quantity - 1)
                    }
                  >
                    −
                  </button>
                  <span className="w-4 text-center text-[11px] text-white">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`One more ${line.name}`}
                    disabled={line.quantity >= line.maxQuantity}
                    className="rounded border border-neutral-700 px-1.5 text-[11px] text-neutral-300 disabled:opacity-30"
                    onClick={() =>
                      setQuantity(line.inventoryItemId, line.quantity + 1)
                    }
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${line.name}`}
                    className="ml-1 rounded px-1 text-[11px] text-neutral-500 hover:text-neutral-300"
                    onClick={() => remove(line.inventoryItemId)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={checkingOut}
            onClick={() => void checkout()}
            className="mt-3 w-full rounded-lg bg-[var(--ink-800)] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-black transition hover:bg-neutral-200 disabled:opacity-50"
          >
            {checkingOut ? "Opening checkout…" : "Check out"}
          </button>

          {credit && credit.balance > 0 ? (
            <p className="mt-2 text-[10px] leading-relaxed text-neutral-400">
              You have ${credit.balance.toFixed(2)} in trade credit here. Online
              checkout takes card only — ask staff to apply your credit when you
              buy in the shop.
            </p>
          ) : !customer ? (
            <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
              No account needed to buy.{" "}
              <Link
                href={`/sign-in?store=${encodeURIComponent(slug)}&return=1`}
                className="underline hover:text-neutral-300"
              >
                Sign in
              </Link>{" "}
              to use trade credit in store.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

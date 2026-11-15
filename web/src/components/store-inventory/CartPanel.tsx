"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCustomer } from "@/context/CustomerContext";
import { useCart } from "@/hooks/useCart";
import { cartCanBuildMagicDeck, cartNeedsPickup } from "@/lib/store-inventory/cart";
import type { GatheringCard } from "./clerk-gathering";
import {
  buildGatheringDeckPrefill,
  saveProfessorSetupPrefill,
} from "@/lib/store-inventory/gathering-deck-build";
import {
  deckBuildSignInHref,
  professorPathFromPile,
} from "@/lib/store-inventory/deck-build-auth";
import type { RejectedCheckoutLine } from "@/lib/store-inventory/validate-cart";
import type { TradeCreditBalance } from "@/lib/types";

export function CartPanel({
  slug,
  game = "magic",
  /** Keep Check out pinned; scroll the line list inside the sticky shop column. */
  fillViewport = false,
}: {
  slug: string;
  /** Browse game currently on screen. Deck building is Magic only. */
  game?: string;
  fillViewport?: boolean;
}) {
  const { lines, count, subtotal, setQuantity, remove, prune, clear } =
    useCart(slug);
  const { customer, loading: customerLoading } = useCustomer();
  const router = useRouter();
  const hasTokens = lines.some((l) => l.inventoryItemId.startsWith("token:"));

  const [credit, setCredit] = useState<TradeCreditBalance | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedCheckoutLine[]>([]);
  const [reserving, setReserving] = useState(false);
  const [reserved, setReserved] = useState<{
    draftOrderName: string;
    reserveUntil: string;
    subtotal: number;
  } | null>(null);

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

  async function reserveForPickup() {
    setReserving(true);
    setError(null);
    setRejected([]);
    setReserved(null);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/cart/reserve`,
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
        rejected?: RejectedCheckoutLine[];
        reservation?: {
          draftOrderName: string;
          reserveUntil: string;
          subtotal: number;
          lines: Array<{ inventoryItemId: string }>;
        } | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not reserve");

      if (data.rejected?.length) {
        setRejected(data.rejected);
        prune(data.rejected.map((r) => r.inventoryItemId));
      }
      if (!data.reservation) {
        setError(data.error ?? "None of these cards can be reserved right now.");
        return;
      }
      for (const line of data.reservation.lines) remove(line.inventoryItemId);
      setReserved(data.reservation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reserve");
    } finally {
      setReserving(false);
    }
  }

  function handleBuildDeck() {
    if (!cartCanBuildMagicDeck(game, lines) || customerLoading) return;
    const target = professorPathFromPile(slug);
    if (!customer) {
      router.push(deckBuildSignInHref(slug, target));
      return;
    }
    const cards: GatheringCard[] = lines.map((line) => ({
      inventoryItemId: line.inventoryItemId,
      name: line.name,
      qty: line.quantity,
      listPrice: line.unitPrice,
      setName: line.setName,
      imageUrl: line.imageUrl,
      colorIdentity: line.colorIdentity ?? [],
      isCommander: line.isCommander,
      typeLine: line.typeLine,
    }));
    saveProfessorSetupPrefill(slug, buildGatheringDeckPrefill(cards));
    router.push(target);
  }

  async function checkout() {
    setCheckingOut(true);
    setError(null);
    setRejected([]);
    setReserved(null);
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
    <div
      className={
        fillViewport ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""
      }
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Cart</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {count === 0
              ? game === "magic"
                ? "Tap a card to add it. Then build a deck or check out."
                : "Tap a card to add it. Then check out."
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
        <ul className="mt-3 shrink-0 space-y-1 rounded-lg border border-amber-900/60 bg-amber-950/30 p-2 text-[11px] text-amber-200">
          {rejected.map((r) => (
            <li key={r.inventoryItemId}>
              {r.displayName ? `${r.displayName}: ` : ""}
              {r.message}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-3 shrink-0 rounded-lg border border-red-900/60 bg-red-950/30 p-2 text-[11px] text-red-300">
          {error}
        </p>
      ) : null}

      {reserved ? (
        <div className="mt-3 shrink-0 rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-3 text-[12px] text-emerald-100">
          <p className="font-semibold">
            Reserved for pickup — order {reserved.draftOrderName}
          </p>
          <p className="mt-1 text-emerald-200/90">
            ${reserved.subtotal.toFixed(2)}, held until{" "}
            {new Date(reserved.reserveUntil).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            . Give staff your name or order number at the counter and pay there —
            you can add anything else from the shop to the same order.
          </p>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <>
          <ul
            className={`mt-3 space-y-2 ${
              fillViewport
                ? "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5"
                : "max-h-[min(50vh,28rem)] overflow-y-auto overscroll-contain"
            }`}
          >
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

          <div className="mt-3 shrink-0 space-y-2 border-t border-neutral-800 pt-3">
            {cartCanBuildMagicDeck(game, lines) ? (
              <button
                type="button"
                disabled={customerLoading}
                onClick={handleBuildDeck}
                className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-semibold text-[var(--ink-900)] hover:bg-indigo-500 disabled:opacity-50"
              >
                Build deck
              </button>
            ) : null}
            <button
              type="button"
              disabled={checkingOut || reserving}
              onClick={() => void checkout()}
              className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-900)] transition hover:bg-[var(--accent-hi)] disabled:opacity-50"
            >
              {checkingOut ? "Opening checkout…" : "Pay now"}
            </button>
            <p className="text-[10px] leading-relaxed text-neutral-500">
              {cartNeedsPickup(lines)
                ? "Your cart has in-store-only cards, so this order is in-store pickup — pay now and collect it at the shop."
                : "Shipping or in-store pickup — choose at checkout."}
            </p>

            {hasTokens ? (
              <p className="text-[10px] leading-relaxed text-neutral-400">
                Custom tokens are printed once your payment goes through, so they
                are paid online{customer ? "" : " and need you to sign in"}.
              </p>
            ) : customer ? (
              <button
                type="button"
                disabled={checkingOut || reserving}
                onClick={() => void reserveForPickup()}
                className="w-full rounded-lg border border-neutral-600 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-white transition hover:border-[var(--accent)] hover:text-[var(--accent-hi)] disabled:opacity-50"
              >
                {reserving ? "Reserving…" : "Reserve — pay in store"}
              </button>
            ) : (
              <Link
                href={`/sign-in?store=${encodeURIComponent(slug)}&return=1`}
                className="block w-full rounded-lg border border-neutral-600 px-3 py-2 text-center text-[12px] font-semibold uppercase tracking-wide text-white transition hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
              >
                Sign in to reserve — pay in store
              </Link>
            )}

            {credit && credit.balance > 0 ? (
              <p className="text-[10px] leading-relaxed text-neutral-400">
                You have ${credit.balance.toFixed(2)} in trade credit here. Online
                checkout takes card only — reserve for pickup and staff can apply
                your credit at the counter.
              </p>
            ) : !customer && !hasTokens ? (
              <p className="text-[10px] leading-relaxed text-neutral-500">
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
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Tap a card to add it to your cart.
        </p>
      )}
    </div>
  );
}

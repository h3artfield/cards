"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CustomerAuthShell } from "@/components/CustomerAuthShell";
import { useCustomer } from "@/context/CustomerContext";
import { apiFetch } from "@/lib/api-client";
import {
  authButton,
  authButtonSecondary,
  authError,
  authHeading,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";
import { CollectionBinderImport } from "@/components/collection/CollectionBinderImport";
import { CollectionCardSearch } from "@/components/collection/CollectionCardSearch";
import { importCandidatesFromCard } from "@/lib/collection/collection-import-parse";
import type { BuybackOrder, CollectionCard } from "@/lib/types";

function cardSubtitle(card: CollectionCard): string {
  const parts = [
    card.setName,
    card.cardNumber ? `#${card.cardNumber}` : null,
    card.quantity && card.quantity > 1 ? `×${card.quantity}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (parts) return parts;
  return card.needsReview ? "Not identified" : "In your binder";
}

export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { customer, loading: customerLoading } = useCustomer();

  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await apiFetch<{ cards: CollectionCard[] }>(
      `/api/store/${encodeURIComponent(slug)}/collection`,
    );
    setCards(data.cards);
  }, [slug]);

  useEffect(() => {
    if (customerLoading || !customer) return;

    let active = true;
    apiFetch<{ cards: CollectionCard[] }>(
      `/api/store/${encodeURIComponent(slug)}/collection`,
    )
      .then((data) => {
        if (active) setCards(data.cards);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Could not load your collection",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, customer, customerLoading]);

  const owned = useMemo(
    () =>
      cards.filter(
        (c) =>
          c.status === "owned" &&
          !(c.needsReview && importCandidatesFromCard(c).length > 0),
      ),
    [cards],
  );
  const sent = useMemo(
    () => cards.filter((c) => c.status !== "owned"),
    [cards],
  );
  const allSelected = owned.length > 0 && selected.size === owned.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(owned.map((c) => c.id)));
  }

  async function sendSelected() {
    if (!selected.size) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { order } = await apiFetch<{ order: BuybackOrder }>(
        `/api/store/${encodeURIComponent(slug)}/collection/send-to-buyback`,
        {
          method: "POST",
          body: JSON.stringify({ cardIds: [...selected] }),
        },
      );
      window.location.assign(`/order/${order.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send those cards",
      );
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selected.size) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      for (const id of selected) {
        await apiFetch(
          `/api/store/${encodeURIComponent(slug)}/collection/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
      }
      setNotice(
        `Removed ${selected.size} card${selected.size === 1 ? "" : "s"}.`,
      );
      setSelected(new Set());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove cards");
    } finally {
      setBusy(false);
    }
  }

  if (customerLoading) {
    return (
      <CustomerAuthShell>
        <p className={authSubtext}>Loading…</p>
      </CustomerAuthShell>
    );
  }

  if (!customer) {
    return (
      <CustomerAuthShell>
        <h1 className={authHeading}>Sign in to see your collection</h1>
        <p className={`mt-3 ${authSubtext}`}>
          Your binder is tied to your account at this store.
        </p>
        <Link
          href={`/sign-in?store=${encodeURIComponent(slug)}&return=1`}
          className={`mt-6 block ${authButton} no-underline`}
        >
          Sign in
        </Link>
      </CustomerAuthShell>
    );
  }

  return (
    <CustomerAuthShell>
      <h1 className={authHeading}>Collection</h1>
      <p className={`mt-3 ${authSubtext}`}>
        This is your binder — cards you already own. The shop pile on the
        store page is only a maybe-buy list and is not this binder.
      </p>
      <p className={`mt-2 ${authSubtext}`}>
        Scan a card, add it by name, or upload a list. Then select what you
        want to sell to the store.
      </p>
      <p className={`mt-2 ${authSubtext}`}>
        {owned.length} card{owned.length === 1 ? "" : "s"} in your binder at
        this store.
      </p>

      {error && <p className={`mt-6 ${authError}`}>{error}</p>}
      {notice && (
        <p className="mt-6 border border-neutral-700 px-4 py-3 text-sm text-neutral-300">
          {notice}
        </p>
      )}

      <div className="mt-8 space-y-3">
        <Link
          href={`/s/${slug}/collection/scan`}
          className={`block ${authButton} no-underline`}
        >
          Scan cards
        </Link>
        <CollectionCardSearch
          slug={slug}
          onAdded={(card) => {
            setCards((current) => [card, ...current.filter((row) => row.id !== card.id)]);
            setNotice(`${card.displayName} added to your collection.`);
            setError(null);
          }}
        />
        <CollectionBinderImport
          slug={slug}
          cards={cards}
          onCards={(incoming) => {
            if (!incoming.length) {
              void reload();
              return;
            }
            setCards((current) => {
              const byId = new Map(current.map((row) => [row.id, row]));
              for (const card of incoming) byId.set(card.id, card);
              return [...byId.values()];
            });
            setError(null);
          }}
          onNotice={setNotice}
          onError={setError}
        />
      </div>

      {loading ? (
        <p className={`mt-8 ${authSubtext}`}>Loading your cards…</p>
      ) : owned.length === 0 ? (
        <p className={`mt-8 ${authSubtext}`}>
          Nothing in your binder yet. Scan a card, add one by name, or upload a
          list.
        </p>
      ) : (
        <>
          <div className="mt-8 flex items-center justify-between border-b border-neutral-800 pb-3">
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4"
              />
              Select all
            </label>
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              {selected.size} selected
            </span>
          </div>

          <ul className="divide-y divide-neutral-800">
            {owned.map((card) => (
              <li key={card.id} className="flex items-center gap-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(card.id)}
                  onChange={() => toggle(card.id)}
                  className="h-4 w-4 shrink-0"
                  aria-label={`Select ${card.displayName}`}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.frontImageUrl}
                  alt={card.displayName}
                  className="h-16 w-12 shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    {card.displayName}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {cardSubtitle(card)}
                  </p>
                </div>
                {card.scryfallId && (
                  <span className="shrink-0 border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                    Deck ready
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              className={authButton}
              disabled={busy || selected.size === 0}
              onClick={() => void sendSelected()}
            >
              {busy ? "Working…" : "Sell selected to the store"}
            </button>
            <button
              type="button"
              className={authButtonSecondary}
              disabled={busy || selected.size === 0}
              onClick={() => void removeSelected()}
            >
              Remove selected
            </button>
          </div>
        </>
      )}

      {sent.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Sent to the store
          </h2>
          <ul className="mt-3 divide-y divide-neutral-900">
            {sent.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="truncate text-neutral-400">
                  {card.displayName}
                </span>
                {card.buybackOrderId && (
                  <Link
                    href={`/order/${card.buybackOrderId}`}
                    className="shrink-0 text-xs text-neutral-400 underline underline-offset-4"
                  >
                    View order
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href={`/s/${slug}`} className={`mt-10 block text-center ${authLink}`}>
        Back to store
      </Link>
    </CustomerAuthShell>
  );
}

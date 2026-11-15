"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import {
  LiveCardScanner,
  type LiveScanMatchPayload,
} from "@/components/LiveCardScanner";
import { CustomerAuthShell } from "@/components/CustomerAuthShell";
import { useCustomer } from "@/context/CustomerContext";
import { apiFetch } from "@/lib/api-client";
import {
  authButton,
  authHeading,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";
import type { CollectionCard } from "@/lib/types";
import { collectionScannerAppHref } from "@/lib/collection/collection-scanner-app";

export default function CollectionScanPage() {
  const { slug } = useParams<{ slug: string }>();
  const { customer, loading: customerLoading } = useCustomer();

  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<CollectionCard[]>([]);
  const [savingCount, setSavingCount] = useState(0);

  const handleCardDetected = useCallback(
    async (payload: LiveScanMatchPayload) => {
      setError(null);
      setSavingCount((n) => n + 1);
      try {
        const body = payload.card
          ? {
              category:
                payload.card.catalogSource === "pokemon_tcg"
                  ? "pokemon"
                  : payload.card.catalogSource === "ygoprodeck"
                    ? "yugioh"
                    : "magic",
              catalogSource: payload.card.catalogSource,
              catalogId: payload.card.catalogId,
              displayName: payload.card.name,
              setName: payload.card.setName,
              cardNumber: payload.card.cardNumber,
            }
          : { frontImageUrl: payload.frontImageUrl };

        const { card } = await apiFetch<{ card: CollectionCard }>(
          `/api/store/${encodeURIComponent(slug)}/collection`,
          {
            method: "POST",
            body: JSON.stringify(body),
          },
        );
        setAdded((prev) => [
          card,
          ...prev.filter((c) => c.id !== card.id),
        ]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not add that card.",
        );
      } finally {
        setSavingCount((n) => Math.max(0, n - 1));
      }
    },
    [slug],
  );

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
        <h1 className={authHeading}>Sign in to scan</h1>
        <p className={`mt-3 ${authSubtext}`}>
          Your collection is tied to your account at this store.
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

  if (!customer.emailVerified) {
    return (
      <CustomerAuthShell>
        <h1 className={authHeading}>Verify your email</h1>
        <p className={`mt-3 ${authSubtext}`}>
          Check your inbox for the verification link before scanning cards
          into your collection.
        </p>
        <Link
          href={`/s/${slug}/collection`}
          className={`mt-6 block text-center ${authLink}`}
        >
          Back to collection
        </Link>
      </CustomerAuthShell>
    );
  }

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-neutral-950 text-white pb-[env(safe-area-inset-bottom)] pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex shrink-0 items-center justify-between px-3 pb-2">
        <div>
          <p className="text-[11px] font-medium text-neutral-400">
            My Collection · Instant Live Scanner
          </p>
          <h1 className="text-base font-bold text-white">Scan Cards</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/40">
            {added.length} added{savingCount > 0 ? " (saving…)" : ""}
          </span>
          <a
            href={collectionScannerAppHref(slug)}
            className="rounded-xl bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white no-underline hover:bg-neutral-700"
          >
            Scanner app
          </a>
          <Link
            href={`/s/${slug}/collection`}
            className="rounded-xl bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white no-underline hover:bg-neutral-700"
          >
            Done
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mx-3 mb-2 rounded-lg border border-red-500/40 bg-red-950/80 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 px-2">
        <LiveCardScanner
          onCardDetected={handleCardDetected}
          autoAdd
        />
      </div>

      <div className="shrink-0 border-t border-neutral-800 bg-neutral-900/95 px-3 py-2.5">
        {added.length === 0 ? (
          <p className="text-xs text-neutral-400">
            Point your camera at a card to add it to your binder immediately.
          </p>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {added.slice(0, 12).map((card) => (
              <div
                key={card.id}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.frontImageUrl}
                  alt={card.displayName}
                  className="h-9 w-7 rounded object-cover"
                />
                <div className="max-w-[9rem] min-w-0">
                  <p className="truncate text-xs font-semibold text-white">
                    {card.quantity && card.quantity > 1 ? `${card.quantity}× ` : ""}
                    {card.displayName}
                  </p>
                  <p className="truncate text-[10px] text-neutral-400">
                    {[card.setName, card.cardNumber && `#${card.cardNumber}`]
                      .filter(Boolean)
                      .join(" · ") || "In binder"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

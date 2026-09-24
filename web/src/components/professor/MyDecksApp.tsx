"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import { CustomerStoreNavV1 } from "@/components/CustomerStoreNavV1";
import { DeckDeleteConfirmDialog } from "./DeckDeleteConfirmDialog";
import { MyDeckShelf } from "./MyDeckShelf";
import { ProfessorMtgPageShell } from "./ProfessorMtgPageShell";

/**
 * Every deck a customer has at this store.
 *
 * A failed load says so. The saved-deck list used to swallow its errors and
 * render the empty state, which meant a missing Firestore index looked exactly
 * like having never built a deck — and the customer had eleven.
 */
export function MyDecksApp({ slug }: { slug: string }) {
  const [decks, setDecks] = useState<CustomerDeckListEntryV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Set when one of the two deck collections loaded and the other did not. */
  const [partial, setPartial] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomerDeckListEntryV1 | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/store/${encodeURIComponent(slug)}/decks`);
        const data = (await res.json().catch(() => null)) as
          | {
              decks?: CustomerDeckListEntryV1[];
              error?: string;
              partialFailure?: string | null;
            }
          | null;
        if (cancelled) return;
        if (!res.ok || !data?.decks) {
          setError(data?.error ?? "We couldn't load your decks just now. Please try again.");
          return;
        }
        setDecks(data.decks);
        setPartial(data.partialFailure ?? null);
      } catch {
        if (!cancelled) setError("We couldn't reach the server. Check your connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/decks/${encodeURIComponent(pendingDelete.deckId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: pendingDelete.origin,
            listKey: pendingDelete.key,
          }),
        },
      );
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setDeleteError(data?.error ?? "We could not delete that deck just now.");
        return;
      }
      setDecks((current) => current.filter((deck) => deck.key !== pendingDelete.key));
      setPendingDelete(null);
    } catch {
      setDeleteError("We could not reach the server. Check your connection.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <ProfessorMtgPageShell>
      <div className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-10 sm:px-6 lg:px-10">
        <CustomerStoreNavV1 slug={slug} active="decks" />

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="professor-mtg-title text-3xl">My decks</h1>
            <p className="professor-mtg-muted mt-2 text-sm">
              Decks the Professor built for you, and decks you built yourself.
            </p>
          </div>
          <Link
            href={`/s/${encodeURIComponent(slug)}/decks/new`}
            className="professor-mtg-btn shrink-0 px-4 py-2 text-xs no-underline"
          >
            Create new deck
          </Link>
        </div>

        {partial ? (
          <p className="mt-6 text-sm text-[var(--bad)]">
            {partial} Some of your decks may be missing from this list.
          </p>
        ) : null}

        {loading ? (
          <p className="professor-mtg-muted mt-8 text-sm italic">Loading your decks…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-[var(--bad)]">{error}</p>
        ) : decks.length === 0 ? (
          <div className="professor-mtg-card mt-8 px-5 py-6">
            <p className="professor-mtg-body text-sm">You have not made a deck here yet.</p>
            <p className="professor-mtg-muted mt-2 text-[12px] leading-snug">
              Have the Professor build one from a commander, or start an empty list and search for
              the cards yourself.
            </p>
            <Link
              href={`/s/${encodeURIComponent(slug)}/decks/new`}
              className="professor-mtg-btn mt-4 inline-block px-4 py-2 text-xs no-underline"
            >
              Create new deck
            </Link>
          </div>
        ) : (
          <MyDeckShelf slug={slug} decks={decks} onRequestDelete={setPendingDelete} />
        )}

        {pendingDelete ? (
          <DeckDeleteConfirmDialog
            deck={pendingDelete}
            busy={deleteBusy}
            error={deleteError}
            onCancel={() => {
              if (deleteBusy) return;
              setPendingDelete(null);
              setDeleteError(null);
            }}
            onConfirm={() => void confirmDelete()}
          />
        ) : null}
      </div>
    </ProfessorMtgPageShell>
  );
}

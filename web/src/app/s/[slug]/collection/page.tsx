"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CollectionBinderGallery } from "@/components/collection/CollectionBinderGallery";
import { CollectionBinderValue } from "@/components/collection/CollectionBinderValue";
import { CollectionBinderImport } from "@/components/collection/CollectionBinderImport";
import { CollectionCardSearch } from "@/components/collection/CollectionCardSearch";
import { CustomerAuthShell } from "@/components/CustomerAuthShell";
import { useCustomer } from "@/context/CustomerContext";
import { apiFetch } from "@/lib/api-client";
import {
  cardNeedsPrintingPick,
  cardMatchesCollectionGame,
  collectionDecklistText,
  defaultBinderMode,
  isVerifiedBinderCard,
  pickDeckCommander,
  type CollectionBinderMode,
} from "@/lib/collection/collection-binder";
import {
  COLLECTION_GAME_LABELS,
  COLLECTION_GAMES,
  parseCollectionGame,
  readCollectionGame,
  writeCollectionGame,
  type CollectionGame,
} from "@/lib/collection/collection-game";
import {
  authButton,
  authError,
  authHeading,
  authInput,
  authLabel,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";
import type { BuybackOrder, CollectionCard } from "@/lib/types";

export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { customer, loading: customerLoading } = useCustomer();

  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [game, setGame] = useState<CollectionGame>("magic");
  const [mode, setMode] = useState<CollectionBinderMode | null>(null);
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
    setGame(readCollectionGame(slug));
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

  const inGame = useMemo(
    () => cards.filter((card) => cardMatchesCollectionGame(card, game)),
    [cards, game],
  );
  const owned = useMemo(
    () => inGame.filter(isVerifiedBinderCard),
    [inGame],
  );
  const reviewCount = useMemo(
    () => inGame.filter(cardNeedsPrintingPick).length,
    [inGame],
  );
  const sent = useMemo(
    () => cards.filter((c) => c.status !== "owned"),
    [cards],
  );
  const resolvedMode = mode ?? defaultBinderMode(inGame);

  function changeGame(next: CollectionGame) {
    const parsed = parseCollectionGame(next);
    setGame(parsed);
    writeCollectionGame(slug, parsed);
    setSelected(new Set());
    setMode(null);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => {
      const allOn = ids.length > 0 && ids.every((id) => prev.has(id));
      return allOn ? new Set() : new Set(ids);
    });
  }

  function mergeCards(incoming: CollectionCard[]) {
    if (!incoming.length) {
      void reload();
      return;
    }
    setCards((current) => {
      const byId = new Map(current.map((row) => [row.id, row]));
      for (const card of incoming) byId.set(card.id, card);
      return [...byId.values()];
    });
  }

  async function startDeck(seed: CollectionCard[]) {
    const commander = pickDeckCommander(seed);
    if (!commander) {
      setError("Pick a commander in your binder, or include one in the selection.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const decklist = collectionDecklistText(seed, commander.id);
      const data = await apiFetch<{ deck: { deckId: string } }>(
        `/api/store/${encodeURIComponent(slug)}/professor/deck-editor`,
        {
          method: "POST",
          body: JSON.stringify({
            commanderName: commander.displayName,
            decklist: decklist || undefined,
          }),
        },
      );
      router.push(
        `/s/${encodeURIComponent(slug)}/decks/${encodeURIComponent(data.deck.deckId)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start that deck");
      setBusy(false);
    }
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
    <CustomerAuthShell roomy>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={authHeading}>Collection</h1>
        <Link href={`/s/${slug}/decks`} className={authLink}>
          My decks
        </Link>
      </div>
      <p className={`mt-3 ${authSubtext}`}>
        This is your binder — cards you already own. The shop pile on the
        store page is only a maybe-buy list and is not this binder.
      </p>

      <label className={`mt-6 block ${authLabel}`} htmlFor="collection-game">
        Game
      </label>
      <select
        id="collection-game"
        value={game}
        onChange={(event) => changeGame(parseCollectionGame(event.target.value))}
        className={authInput}
      >
        {COLLECTION_GAMES.map((value) => (
          <option key={value} value={value}>
            {COLLECTION_GAME_LABELS[value]}
          </option>
        ))}
      </select>
      <p className={`mt-2 ${authSubtext}`}>
        Imports and the binder below are for {COLLECTION_GAME_LABELS[game]}
        {game === "magic"
          ? " — lists are matched to paper printings, not another game."
          : " — lists stay in this game and are not looked up in Magic."}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-md px-4 py-3 text-sm font-semibold uppercase tracking-wide ${
            resolvedMode === "view"
              ? "bg-[var(--accent)] text-[var(--ink-900)]"
              : "border border-neutral-700 text-neutral-300"
          }`}
          onClick={() => setMode("view")}
        >
          View binder
        </button>
        <button
          type="button"
          className={`rounded-md px-4 py-3 text-sm font-semibold uppercase tracking-wide ${
            resolvedMode === "import"
              ? "bg-[var(--accent)] text-[var(--ink-900)]"
              : "border border-neutral-700 text-neutral-300"
          }`}
          onClick={() => setMode("import")}
        >
          Import{reviewCount ? ` · ${reviewCount}` : ""}
        </button>
      </div>

      <p className={`mt-4 ${authSubtext}`}>
        {owned.length} card{owned.length === 1 ? "" : "s"} in your{" "}
        {COLLECTION_GAME_LABELS[game]} binder
        {reviewCount
          ? ` · ${reviewCount} still need a printing`
          : owned.length > 0
            ? " — printings are locked in"
            : ""}
        .
      </p>

      {error && <p className={`mt-6 ${authError}`}>{error}</p>}
      {notice && (
        <p className="mt-6 border border-neutral-700 px-4 py-3 text-sm text-neutral-300">
          {notice}
        </p>
      )}

      {resolvedMode === "import" ? (
        <div className="mt-8 space-y-3">
          <Link
            href={`/s/${slug}/collection/scan`}
            className={`block ${authButton} no-underline`}
          >
            Scan cards
          </Link>
          {game === "magic" ? (
            <CollectionCardSearch
              slug={slug}
              onAdded={(card) => {
                setCards((current) => [card, ...current.filter((row) => row.id !== card.id)]);
                setNotice(`${card.displayName} added to your collection.`);
                setError(null);
              }}
            />
          ) : (
            <p className={authSubtext}>
              Add-by-name printing search is Magic-only. Scan a card or paste a
              list for this game.
            </p>
          )}
          <CollectionBinderImport
            slug={slug}
            game={game}
            cards={inGame}
            onCards={(incoming, options) => {
              mergeCards(incoming);
              setError(null);
              if (options?.leaveImport) setMode("view");
            }}
            onNotice={setNotice}
            onError={setError}
          />
        </div>
      ) : loading ? (
        <p className={`mt-8 ${authSubtext}`}>Loading your cards…</p>
      ) : owned.length === 0 ? (
        <p className={`mt-8 ${authSubtext}`}>
          Nothing in this binder yet. Switch to Import to scan, add by name, or
          upload a list.
        </p>
      ) : (
        <>
        <CollectionBinderValue slug={slug} game={game} />
        <CollectionBinderGallery
          slug={slug}
          game={game}
          cards={inGame}
          selected={selected}
          busy={busy}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onChanged={(next) => {
            setCards((current) =>
              current.map((row) => (row.id === next.id ? next : row)),
            );
            setNotice(
              `${next.displayName} updated to ${next.setName ?? "that printing"}.`,
            );
            setError(null);
          }}
          onBuildCard={(card) => void startDeck([card])}
          onBuildSelected={() =>
            void startDeck(inGame.filter((card) => selected.has(card.id)))
          }
          onSellSelected={() => void sendSelected()}
          onRemoveSelected={() => void removeSelected()}
        />
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
                <span className="min-w-0 text-neutral-400">
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

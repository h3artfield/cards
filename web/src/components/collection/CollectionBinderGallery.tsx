"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CollectionCardPriceSheet } from "@/components/collection/CollectionCardPriceSheet";
import { CollectionChangePrinting } from "@/components/collection/CollectionChangePrinting";
import {
  filterBinderCards,
  isCollectionCommander,
  type CollectionBinderFilter,
  type CollectionBinderSort,
} from "@/lib/collection/collection-binder";
import type { CollectionGame } from "@/lib/collection/collection-game";
import {
  prefillProfessorCommander,
  professorSetupPath,
} from "@/lib/collection/collection-professor-build";
import { authButton, authButtonSecondary, authInput, authSubtext } from "@/lib/customer-auth-ui";
import type { CollectionCard } from "@/lib/types";

function cardSubtitle(card: CollectionCard): string {
  return [
    card.setName,
    card.cardNumber ? `#${card.cardNumber}` : null,
    card.finish === "foil" ? "Foil" : card.finish === "etched" ? "Etched" : null,
    card.quantity && card.quantity > 1 ? `×${card.quantity}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function hasCardFace(card: CollectionCard): boolean {
  return Boolean(card.frontImageUrl) && !card.frontImageUrl.includes("00000000-0000-0000-0000-000000000000");
}

export function CollectionBinderGallery({
  slug,
  game,
  cards,
  selected,
  busy,
  onToggle,
  onToggleAll,
  onChanged,
  onBuildCard,
  onBuildSelected,
  onSellSelected,
  onRemoveSelected,
}: {
  slug: string;
  game: CollectionGame;
  cards: CollectionCard[];
  selected: Set<string>;
  busy: boolean;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onChanged: (card: CollectionCard) => void;
  onBuildCard: (card: CollectionCard) => void;
  onBuildSelected: () => void;
  onSellSelected: () => void;
  onRemoveSelected: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CollectionBinderFilter>("all");
  const [sort, setSort] = useState<CollectionBinderSort>("newest");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(
    () => filterBinderCards(cards, { game, query, filter, sort }),
    [cards, filter, game, query, sort],
  );
  const commanderCount = useMemo(
    () =>
      filterBinderCards(cards, { game, filter: "commanders" }).length,
    [cards, game],
  );
  const visibleIds = visible.map((card) => card.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedVisible = visible.filter((card) => selected.has(card.id));
  const selectedHasCommander = selectedVisible.some(isCollectionCommander);
  const openCard = visible.find((card) => card.id === openId) ?? null;

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search collection</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your binder"
            className={`${authInput} mt-0`}
          />
        </label>
        <label className="text-xs text-neutral-400">
          Filter
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as CollectionBinderFilter)}
            className={`${authInput} mt-1`}
          >
            <option value="all">All cards</option>
            {game === "magic" ? (
              <option value="commanders">Commanders ({commanderCount})</option>
            ) : null}
            <option value="needs_printing">Needs a printing</option>
          </select>
        </label>
        <label className="text-xs text-neutral-400">
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as CollectionBinderSort)}
            className={`${authInput} mt-1`}
          >
            <option value="newest">Newest</option>
            <option value="name">Name</option>
            <option value="set">Set</option>
            <option value="quantity">Quantity</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p className={`mt-8 ${authSubtext}`}>
          Nothing matches that filter in this game.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(visibleIds)}
                className="h-4 w-4"
              />
              Select all shown
            </label>
            <span className="text-xs text-neutral-500">
              {visible.length} shown · {selected.size} selected
            </span>
          </div>

          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((card) => {
              const commander = isCollectionCommander(card);
              return (
                <li
                  key={card.id}
                  className={`rounded-lg border bg-[var(--ink-900)] p-2.5 ${
                    commander
                      ? "border-[var(--accent)]/70 shadow-[0_0_0_1px_var(--accent-wash)]"
                      : "border-neutral-800"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(card.id)}
                      onChange={() => onToggle(card.id)}
                      className="mt-1 h-4 w-4 shrink-0"
                      aria-label={`Select ${card.displayName}`}
                    />
                    {commander ? (
                      <span className="rounded-sm bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-900)]">
                        Commander
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="mt-2 block w-full text-left"
                    onClick={() => setOpenId(card.id)}
                    aria-label={`View price for ${card.displayName}`}
                  >
                    {hasCardFace(card) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.frontImageUrl}
                        alt={card.displayName}
                        className="mx-auto h-48 w-[8.6rem] object-cover sm:h-52 sm:w-[9.3rem]"
                      />
                    ) : (
                      <div className="mx-auto flex h-48 w-[8.6rem] items-center justify-center border border-neutral-800 bg-neutral-950 px-2 text-center text-xs leading-snug text-neutral-500 sm:h-52 sm:w-[9.3rem]">
                        {card.displayName}
                      </div>
                    )}
                    <p className="mt-2 text-sm leading-snug text-white">
                      {card.displayName}
                    </p>
                    {cardSubtitle(card) ? (
                      <p className="mt-1 text-xs leading-snug text-neutral-500">
                        {cardSubtitle(card)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-neutral-500">Tap for price</p>
                  </button>
                  {commander ? (
                    <div className="mt-2 space-y-2">
                      <button
                        type="button"
                        className="w-full rounded-md border border-[var(--accent)]/40 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-hi)]"
                        disabled={busy}
                        onClick={() => {
                          prefillProfessorCommander(slug, card.displayName);
                          router.push(professorSetupPath(slug));
                        }}
                      >
                        Professor build
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-md border border-neutral-700 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300"
                        disabled={busy}
                        onClick={() => onBuildCard(card)}
                      >
                        Build it myself
                      </button>
                    </div>
                  ) : null}
                  {game === "magic" && card.scryfallId ? (
                    <CollectionChangePrinting
                      slug={slug}
                      card={card}
                      onChanged={onChanged}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              className={authButton}
              disabled={busy || selected.size === 0 || !selectedHasCommander}
              onClick={onBuildSelected}
            >
              {busy ? "Working…" : "Build a deck from selected"}
            </button>
            <button
              type="button"
              className={authButtonSecondary}
              disabled={busy || selected.size === 0}
              onClick={onSellSelected}
            >
              Sell selected to the store
            </button>
            <button
              type="button"
              className={authButtonSecondary}
              disabled={busy || selected.size === 0}
              onClick={onRemoveSelected}
            >
              Remove selected
            </button>
            {selected.size > 0 && !selectedHasCommander && game === "magic" ? (
              <p className={authSubtext}>
                Include a highlighted commander in the selection to start a deck.
                Tap a card to see its price.
              </p>
            ) : null}
          </div>
        </>
      )}

      {openCard ? (
        <CollectionCardPriceSheet
          slug={slug}
          card={openCard}
          busy={busy}
          onClose={() => setOpenId(null)}
          onBuild={onBuildCard}
        />
      ) : null}
    </div>
  );
}

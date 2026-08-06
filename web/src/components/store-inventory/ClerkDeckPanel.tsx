"use client";

import type { ClerkDeckList } from "@/lib/store-inventory/clerk-types";
import {
  clerkDragPayload,
  CLERK_DRAG_MIME,
  type GatheringCard,
} from "./clerk-gathering";

export function ClerkDeckPanel({
  deck,
  onAddToGathering,
}: {
  deck: ClerkDeckList;
  onAddToGathering?: (card: GatheringCard) => void;
}) {
  if (deck.game === "magic") {
    return (
      <MagicDeckPanel deck={deck} onAddToGathering={onAddToGathering} />
    );
  }

  const byCategory = {
    pokemon: deck.lines.filter((l) => l.category === "pokemon"),
    trainer: deck.lines.filter((l) => l.category === "trainer"),
    energy: deck.lines.filter((l) => l.category === "energy"),
  };

  return (
    <div className="mt-4 rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {deck.archetype} · {deck.format}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {deck.inStockCards}/{deck.targetCards} cards from our shelves · $
            {deck.deckTotal.toFixed(2)}
            {deck.budget != null ? ` · budget $${deck.budget}` : ""}
          </p>
        </div>
        {!deck.withinBudget && deck.budget != null ? (
          <span className="rounded bg-amber-950/60 px-2 py-1 text-[10px] text-amber-300">
            Over budget — ask clerk to swap printings
          </span>
        ) : null}
      </div>

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-300">
        {deck.strategy.split("\n").slice(0, 4).join("\n")}
      </p>

      {deck.missingSlots.length > 0 ? (
        <p className="mt-2 text-xs text-amber-400/90">
          Missing from stock: {deck.missingSlots.slice(0, 6).join(", ")}
          {deck.missingSlots.length > 6 ? "…" : ""}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <DeckSection title="Pokémon" lines={byCategory.pokemon} onAddToGathering={onAddToGathering} />
        <DeckSection title="Trainer" lines={byCategory.trainer} onAddToGathering={onAddToGathering} />
        <DeckSection title="Energy" lines={byCategory.energy} onAddToGathering={onAddToGathering} />
      </div>
    </div>
  );
}

function MagicDeckPanel({
  deck,
  onAddToGathering,
}: {
  deck: ClerkDeckList;
  onAddToGathering?: (card: GatheringCard) => void;
}) {
  const sections: Array<{ title: string; categories: ClerkDeckList["lines"][0]["category"][] }> = [
    { title: "Commander", categories: ["commander"] },
    { title: "Lands", categories: ["land"] },
    { title: "Ramp", categories: ["ramp"] },
    { title: "Card draw", categories: ["draw"] },
    { title: "Interaction", categories: ["interaction"] },
    { title: "Protection", categories: ["protection"] },
    { title: "Synergy", categories: ["synergy", "other"] },
    { title: "Finishers", categories: ["finisher"] },
  ];

  return (
    <div className="mt-4 rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {deck.archetype} · {deck.format}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {deck.mainDeckCount ?? deck.inStockCards}/{deck.targetCards - 1} maindeck ·{" "}
            {deck.inStockCards} cards in stock · ${deck.deckTotal.toFixed(2)}
            {deck.budget != null ? ` · budget $${deck.budget}` : ""}
          </p>
        </div>
        {deck.complete ? (
          <span className="rounded bg-emerald-950/60 px-2 py-1 text-[10px] text-emerald-300">
            Validated 100-card list
          </span>
        ) : deck.buildProgress?.building ? (
          <span className="rounded bg-indigo-950/60 px-2 py-1 text-[10px] text-indigo-300">
            Building {deck.buildProgress.stageLabel} ({deck.buildProgress.stageIndex + 1}/
            {deck.buildProgress.totalStages})
          </span>
        ) : (
          <span className="rounded bg-amber-950/60 px-2 py-1 text-[10px] text-amber-300">
            Partial list — gaps marked
          </span>
        )}
      </div>

      {deck.buildProgress?.building ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-500"
            style={{
              width: `${Math.min(
                100,
                Math.round(
                  ((deck.buildProgress.stageIndex + 1) / deck.buildProgress.totalStages) *
                    100,
                ),
              )}%`,
            }}
          />
        </div>
      ) : null}

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-300">
        {deck.strategy.split("\n").slice(0, 3).join("\n")}
      </p>

      {deck.missingSlots.length > 0 ? (
        <p className="mt-2 text-xs text-amber-400/90">
          Missing: {deck.missingSlots.slice(0, 5).join("; ")}
          {deck.missingSlots.length > 5 ? "…" : ""}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map(({ title, categories }) => (
          <DeckSection
            key={title}
            title={title}
            lines={deck.lines.filter((l) => categories.includes(l.category))}
            onAddToGathering={onAddToGathering}
          />
        ))}
      </div>
    </div>
  );
}

function DeckSection({
  title,
  lines,
  onAddToGathering,
}: {
  title: string;
  lines: ClerkDeckList["lines"];
  onAddToGathering?: (card: GatheringCard) => void;
}) {
  const count = lines.reduce((s, l) => s + l.qty, 0);
  if (!count) return null;

  function lineToCard(line: ClerkDeckList["lines"][0]): GatheringCard | null {
    if (!line.inventoryItemId || !line.inStock) return null;
    return {
      inventoryItemId: line.inventoryItemId,
      name: line.name,
      imageProxyUrl: line.imageProxyUrl,
      imageUrl: line.imageUrl,
      qty: line.qty,
      listPrice: line.listPrice,
      colorIdentity: [],
    };
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">
        {title} ({count})
      </p>
      <ul className="space-y-2">
        {lines.map((line, i) => {
          const gatherCard = lineToCard(line);
          return (
          <li
            key={`${line.slot}-${line.inventoryItemId ?? i}`}
            draggable={Boolean(gatherCard)}
            onDragStart={
              gatherCard
                ? (e) => {
                    e.dataTransfer.setData(
                      CLERK_DRAG_MIME,
                      clerkDragPayload(gatherCard),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }
                : undefined
            }
            onClick={() => {
              if (gatherCard) onAddToGathering?.(gatherCard);
            }}
            className={`flex gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2 ${
              gatherCard
                ? "cursor-grab hover:border-indigo-600 active:cursor-grabbing"
                : ""
            }`}
          >
            {line.imageProxyUrl || line.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={line.imageUrl ?? line.imageProxyUrl}
                alt=""
                className="h-14 w-10 shrink-0 rounded object-cover ring-1 ring-neutral-700"
              />
            ) : (
              <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-neutral-800 text-[9px] text-neutral-500">
                —
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white">
                {line.qty}× {line.name}
              </p>
              {line.substituteNote ? (
                <p className="text-[10px] text-neutral-500">{line.substituteNote}</p>
              ) : null}
              {line.inStock && line.listPrice != null ? (
                <p className="text-[10px] text-emerald-400">
                  ${line.listPrice.toFixed(2)} each
                  {line.lineTotal != null
                    ? ` · $${line.lineTotal.toFixed(2)}`
                    : ""}
                </p>
              ) : (
                <p className="text-[10px] text-amber-400">Not in stock</p>
              )}
            </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

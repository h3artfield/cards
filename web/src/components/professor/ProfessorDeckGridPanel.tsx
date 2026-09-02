"use client";

import { useState } from "react";
import { COMMANDER_DECK_TOTAL_CARDS_V47 } from "@/lib/deck-synthesis/professor-deck-completion-v4-7-v1";
import type { DeckBuildPhaseV47 } from "@/lib/deck-synthesis/professor-deck-completion-v4-7-v1";
import { scryfallNamedImageUrl } from "@/lib/deck-synthesis/professor-brew-scryfall-images-v1";
import type { ProfessorDeckGradeV4 } from "@/lib/deck-synthesis/professor-deck-grade-v4-v1";
import { ProfessorDeckGradeSummaryBar } from "./ProfessorDeckGradeSummaryBar";

function DeckCardImage({ name, imageUrl, building }: { name: string; imageUrl: string; building: boolean }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-900 p-2">
        <p className="text-center text-[10px] font-bold uppercase leading-tight text-neutral-400">{name}</p>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={name}
      className={`h-full w-full object-cover ${building ? "animate-pulse" : ""}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function ProfessorDeckGridPanel({
  deckList,
  revealCount,
  cardImageUrls,
  inStockNames,
  inventoryMatchStatus,
  building,
  built,
  grade,
  buildPhase,
  draftReady = false,
  finalReportReady = false,
  finalReviewFailed = false,
  finalReviewError = null,
  onViewReport,
  onRetryFinalReview,
  onCardClick,
}: {
  deckList: { name: string; category: string }[];
  revealCount: number;
  cardImageUrls: Record<string, string>;
  inStockNames: Set<string>;
  inventoryMatchStatus: "idle" | "loading" | "done" | "error";
  building: boolean;
  built: boolean;
  grade: ProfessorDeckGradeV4 | null;
  buildPhase?: DeckBuildPhaseV47;
  draftReady?: boolean;
  finalReportReady?: boolean;
  finalReviewFailed?: boolean;
  finalReviewError?: string | null;
  onViewReport: () => void;
  onRetryFinalReview?: () => void;
  onCardClick?: (card: { name: string; category: string }) => void;
}) {
  const total = deckList.length;
  const revealed = deckList.slice(0, revealCount);
  const slots = COMMANDER_DECK_TOTAL_CARDS_V47;
  const inStockCount = revealed.filter((card) => inStockNames.has(card.name)).length;
  const inStockLabel =
    inventoryMatchStatus === "loading"
      ? "Checking shop stock…"
      : inventoryMatchStatus === "error"
        ? "Stock check failed"
        : `${inStockCount} in shop stock`;

  return (
    <div className="flex h-full min-h-[480px] flex-col bg-[#0a0a0a] p-4">
      <ProfessorDeckGradeSummaryBar
        revealCount={revealCount}
        total={total}
        targetTotal={COMMANDER_DECK_TOTAL_CARDS_V47}
        buildPhase={buildPhase}
        draftReady={Boolean(draftReady)}
        built={built}
        building={building}
        inStockLabel={inStockLabel}
        grade={grade}
        finalReportReady={finalReportReady}
        finalReviewFailed={finalReviewFailed}
        finalReviewError={finalReviewError}
        onViewReport={onViewReport}
        onRetryFinalReview={onRetryFinalReview}
      />

      <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: slots }).map((_, i) => {
          const card = revealed[i];
          if (!card) {
            return (
              <div
                key={`slot-${i}`}
                className="aspect-[5/7] border-2 border-dashed border-neutral-800 bg-neutral-950/40"
              />
            );
          }
          const imageUrl = cardImageUrls[card.name] ?? scryfallNamedImageUrl(card.name);
          const isCommander = card.category === "commander";
          const inStock = inStockNames.has(card.name);
          const cardShell = (
            <>
              <DeckCardImage name={card.name} imageUrl={imageUrl} building={building} />
              <div className="absolute inset-x-0 bottom-0 border-t-2 border-[#111] bg-[#f3efe4]/95 px-1 py-1">
                <p className="truncate text-[9px] font-black uppercase leading-tight text-[#111]">{card.name}</p>
              </div>
              {inStock ? (
                <div className="absolute left-1 top-1 rounded-sm border-2 border-[#111] bg-[#34d399] px-1 py-0.5 text-[8px] font-black uppercase leading-none text-[#111] shadow-[0_0_10px_rgba(52,211,153,0.9)]">
                  In stock
                </div>
              ) : null}
            </>
          );

          const cardBody = (
            <div
              className={`professor-brew-brutal-card relative aspect-[5/7] overflow-hidden ${
                isCommander ? "ring-4 ring-[#ffe14d]" : ""
              } ${onCardClick ? "cursor-pointer" : ""}`}
            >
              {cardShell}
            </div>
          );

          if (inStock) {
            return (
              <button
                key={`${card.name}-${i}`}
                type="button"
                onClick={() => onCardClick?.(card)}
                className="rounded-md p-1 text-left shadow-[0_0_0_3px_#34d399,0_0_18px_4px_rgba(52,211,153,0.65)]"
              >
                {cardBody}
              </button>
            );
          }

          return (
            <button
              key={`${card.name}-${i}`}
              type="button"
              onClick={() => onCardClick?.(card)}
              className={`text-left ${onCardClick ? "cursor-pointer" : "cursor-default"}`}
            >
              {cardBody}
            </button>
          );
        })}
      </div>
    </div>
  );
}

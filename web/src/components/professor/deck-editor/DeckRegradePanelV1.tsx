"use client";

import { useEffect, useMemo, useState } from "react";
import type { CosV1Score } from "@/lib/commander-optimization-score/v1/types";
import { ordinalPercentile } from "@/lib/commander-optimization-score/v1/player-report";
import { CosV1PlayerReportView } from "../CosV1PlayerReportView";
import { ProfessorDeckBracketPanel } from "../ProfessorDeckBracketPanel";
import type { DeckEditorCard } from "./types";

/**
 * What the deck on screen measures, as opposed to what it measured when it was
 * built.
 *
 * Both numbers here are recomputed from the current mainboard. That is the
 * whole point: the "your edits" notice exists because the grade and the score
 * beside it describe the original build, and the honest fix for a stale number
 * is a fresh one rather than a warning about it.
 *
 * The Head Professor's letter grade is deliberately not here. It is written by
 * a model and cannot be recomputed for free, so re-earning it is an explicit,
 * separately-labelled request rather than something that happens because a
 * panel was opened.
 */
export function DeckRegradePanelV1({
  slug,
  commanderName,
  commanderOracleId,
  cards,
  requestedBracket,
}: {
  slug: string;
  commanderName: string;
  commanderOracleId: string;
  /** The mainboard, as the deck currently stands. */
  cards: readonly DeckEditorCard[];
  requestedBracket: number | null;
}) {
  const bracketCards = useMemo(
    () => cards.map((card) => ({ name: card.name, copies: card.copies })),
    [cards],
  );

  const cosPayload = useMemo(
    () =>
      JSON.stringify({
        commanderOracleIds: [commanderOracleId].filter(Boolean),
        mainboard: cards.map((card) => ({
          oracleId: card.oracleId ?? undefined,
          name: card.name,
          quantity: card.copies,
        })),
      }),
    [cards, commanderOracleId],
  );

  /**
   * The score is stored beside the list it describes, so that "still working"
   * is derived from a payload mismatch rather than set at the top of the
   * effect. Editing the deck while the panel is open therefore shows the
   * pending state without a synchronous setState during the effect.
   */
  const [scored, setScored] = useState<{ payload: string; cos: CosV1Score | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/commander-optimization-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cosPayload,
      signal: controller.signal,
    })
      .then(async (res) => (res.ok ? ((await res.json()) as CosV1Score) : null))
      .then((cos) => setScored({ payload: cosPayload, cos }))
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setScored({ payload: cosPayload, cos: null });
      });

    return () => controller.abort();
  }, [cosPayload]);

  const settled = scored?.payload === cosPayload ? scored : null;
  const cos = settled?.cos ?? null;
  const cosState = settled === null ? "loading" : settled.cos === null ? "error" : "ready";

  return (
    <div>
      <ProfessorDeckBracketPanel
        storeSlug={slug}
        commanderName={commanderName}
        cards={bracketCards}
        requestedBracket={requestedBracket}
      />

      <div className="mt-6 border-t border-[var(--mtg-stone-border)] pt-6">
        <p className="professor-mtg-label">Commander Optimization Score</p>

        {cosState === "loading" ? (
          <p className="professor-mtg-muted mt-1 text-xs">Scoring this list…</p>
        ) : cosState === "error" ? (
          <p className="professor-mtg-muted mt-1 text-xs">
            The score could not be worked out for this list just now.
          </p>
        ) : (
          <>
            {cos?.competitiveStrength != null ? (
              <p className="professor-mtg-body mt-1 text-sm tabular-nums">
                Competitive Strength {Math.round(cos.competitiveStrength)} / 100
              </p>
            ) : cos?.commanderBaselineStatus === "COMMANDER_BASELINE_UNCALIBRATED" ? (
              <p className="professor-mtg-muted mt-1 text-xs">
                Competitive Strength is uncalibrated — this commander has no baseline yet.
              </p>
            ) : cos?.failure ? (
              <p className="professor-mtg-muted mt-1 text-xs">
                {cos.failure.unresolvedNames?.length
                  ? `Could not resolve: ${cos.failure.unresolvedNames.slice(0, 6).join(", ")}`
                  : cos.failure.message}
              </p>
            ) : null}

            {cos?.buildOptimization != null ? (
              <p className="professor-mtg-body text-sm tabular-nums">
                Build Optimization {ordinalPercentile(cos.buildOptimization)} percentile
              </p>
            ) : null}

            {cos?.playerReport ? (
              <CosV1PlayerReportView report={cos.playerReport} storeSlug={slug} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

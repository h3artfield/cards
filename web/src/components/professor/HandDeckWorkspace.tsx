"use client";

import { useCallback, useEffect, useState } from "react";
import type { SolDirectedBuildStatusV111 } from "@/lib/deck-synthesis/professor-sol-directed-build-types-v1-1-1";
import type { DeckProfessorReviewV1 } from "@/lib/professor-deck-editor/types-v1";
import { normalizeDeckCardNameV1 } from "@/lib/professor-deck-editor/types-v1";
import { ProfessorDeckEditorPanel } from "./deck-editor/ProfessorDeckEditorPanel";
import type { BuildView } from "./ProfessorSolDirectedBuildApp";
import { ProfessorSolDirectedBuildProgressPanel } from "./ProfessorSolDirectedBuildProgressPanel";
import { ProfessorSolDirectedDeckListPanel } from "./ProfessorSolDirectedDeckListPanel";

type ReviewState = {
  review: DeckProfessorReviewV1 | null;
  revision: number;
  stale: boolean;
  mainboardNames: string[];
  view: BuildView | null;
};

const POLL_MS = 2000;

/**
 * A hand-built or imported deck. Before a review it is the plain editor with an
 * offer to have the Professor look at it; after one it reads like a Professor
 * build, with the swaps offered rather than made.
 */
export function HandDeckWorkspace({ slug, deckId }: { slug: string; deckId: string }) {
  const endpoint = `/api/store/${slug}/professor/deck-review`;
  const [state, setState] = useState<ReviewState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`${endpoint}?deckId=${encodeURIComponent(deckId)}`);
    const data = (await res.json().catch(() => null)) as (ReviewState & { error?: string }) | null;
    if (!res.ok || !data) throw new Error(data?.error ?? "Could not load the review");
    setState(data);
    return data;
  }, [deckId, endpoint]);

  useEffect(() => {
    load().catch(() => setState(null));
  }, [load]);

  const running =
    state?.review?.status === "running" &&
    !["COMPLETE", "FAILED"].includes(state.view?.job.status ?? "");

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      load().catch(() => undefined);
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [load, running, state]);

  const startReview = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId }),
      });
      const data = (await res.json().catch(() => null)) as (ReviewState & { error?: string }) | null;
      if (!res.ok || !data) throw new Error(data?.error ?? "Could not start the review");
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the review");
    } finally {
      setStarting(false);
    }
  };

  const applySwap = async (swap: { cut: string; add: string }) => {
    const res = await fetch(`${endpoint}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId, cut: swap.cut, add: swap.add }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(data?.error ?? "Could not apply that swap");
    await load();
    setEditorKey((k) => k + 1);
  };

  const inMainboard = new Set((state?.mainboardNames ?? []).map(normalizeDeckCardNameV1));
  const isApplied = (swap: { cut: string; add: string }) =>
    inMainboard.has(normalizeDeckCardNameV1(swap.add)) && !inMainboard.has(normalizeDeckCardNameV1(swap.cut));

  const result = state?.view?.result;
  // The job can finish a moment before the deck's review stamp catches up.
  const reviewed = state?.review != null && state.review.status !== "failed" && result?.status === "COMPLETE";

  if (reviewed && result) {
    return (
      <>
        {result.deckScore ? (
          <div className="professor-mtg-card mx-auto my-4 max-w-2xl p-5">
            <p className="professor-mtg-label">Deck rating</p>
            <p className="mt-1 text-3xl font-semibold tracking-wide">{result.deckScore.display}</p>
            {result.deckScore.reason ? (
              <p className="mt-1 text-sm text-[var(--mtg-parchment-muted)]">{result.deckScore.reason}</p>
            ) : null}
          </div>
        ) : null}
        <ProfessorSolDirectedDeckListPanel
          key={editorKey}
          slug={slug}
          deckId={deckId}
          commander={result.commander}
          constructedDeck={result.constructedDeck}
          userInputs={result.userInputs}
          architectPlan={result.architectPlan}
          critic={result.critic}
          headProfessor={result.headProfessor}
          validation={result.validation}
          retrievalSummary={result.retrievalSummary}
          telemetry={result.telemetry}
          validationPass={result.validation?.pass ?? false}
          deckEnrichment={result.deckEnrichment}
          professorRepairApplied={false}
          review={{
            suggestedSwaps: result.suggestedSwaps ?? [],
            isApplied,
            onApply: applySwap,
            notice: (
              <ReviewNotice
                stale={state.stale}
                completedAt={state.review?.completedAt}
                starting={starting}
                error={error}
                onReview={() => void startReview()}
              />
            ),
          }}
        />
      </>
    );
  }

  const job = state?.view?.job;
  const failed = state?.review?.status === "failed" || job?.status === "FAILED";

  return (
    <>
      {running && job ? (
        <ProfessorSolDirectedBuildProgressPanel
          status={job.status as SolDirectedBuildStatusV111}
          statusLabel={job.statusLabel}
          commanderName={job.commanderName}
          buildId={job.buildId}
          mode="optimize"
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mtg-stone-border)] px-4 py-3 sm:px-5 lg:px-8">
          <div className="min-w-0 text-sm">
            <p className="professor-mtg-label text-xs">
              {failed ? "The Professor couldn't finish the review" : "Want a second opinion?"}
            </p>
            <p className="professor-mtg-muted mt-0.5 text-xs">
              {failed
                ? (state?.review?.failureMessage ?? result?.failureMessage ?? "Something went wrong. Try again.")
                : "The Professor will grade this deck, write a full report, and suggest swaps. Nothing changes unless you apply a swap."}
            </p>
            {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
          </div>
          <button
            type="button"
            className="professor-mtg-btn shrink-0 px-4 py-2 text-[12px]"
            disabled={starting}
            onClick={() => void startReview()}
          >
            {starting ? "Starting…" : failed ? "Try the review again" : "Have the Professor review this deck"}
          </button>
        </div>
      )}
      <ProfessorDeckEditorPanel key={editorKey} slug={slug} deckId={deckId} />
    </>
  );
}

function ReviewNotice({
  stale,
  completedAt,
  starting,
  error,
  onReview,
}: {
  stale: boolean;
  completedAt?: string;
  starting: boolean;
  error: string | null;
  onReview: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--mtg-stone-border)] px-4 py-2 text-xs sm:px-5">
      <span className="professor-mtg-muted">
        {stale
          ? "You've changed the deck since this review, so the grade and report describe the earlier list."
          : `Professor review${completedAt ? ` · ${new Date(completedAt).toLocaleDateString()}` : ""}`}
        {error ? <span className="ml-2 text-red-300">{error}</span> : null}
      </span>
      <button type="button" className="professor-mtg-link text-xs" disabled={starting} onClick={onReview}>
        {starting ? "Starting…" : "Review again"}
      </button>
    </div>
  );
}

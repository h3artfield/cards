"use client";

import type { ProfessorDeckGradeV4 } from "@/lib/deck-synthesis/professor-deck-grade-v4-v1";
import type { DeckBuildPhaseV47 } from "@/lib/deck-synthesis/professor-deck-completion-v4-7-v1";

function isFinalReviewPhase(phase?: DeckBuildPhaseV47): boolean {
  return phase === "FINAL_REVIEW" || phase === "DRAFT_READY" || phase === "CUT_AND_BALANCE";
}

function formatFinalReviewError(error: string | null): string {
  if (!error) return "GPT-5.6 Sol review did not complete";
  if (/fetch failed/i.test(error)) {
    return "OpenAI connection dropped during review — retry after server restart";
  }
  if (/timed out|aborted due to timeout/i.test(error)) {
    return error;
  }
  return error;
}

export function ProfessorDeckGradeSummaryBar({
  revealCount,
  total,
  targetTotal,
  buildPhase,
  draftReady,
  built,
  building,
  inStockLabel,
  grade,
  finalReportReady,
  finalReviewFailed = false,
  finalReviewError = null,
  onViewReport,
  onRetryFinalReview,
}: {
  revealCount: number;
  total: number;
  targetTotal: number;
  buildPhase?: DeckBuildPhaseV47;
  draftReady: boolean;
  built: boolean;
  building: boolean;
  inStockLabel: string;
  grade: ProfessorDeckGradeV4 | null;
  finalReportReady?: boolean;
  finalReviewFailed?: boolean;
  finalReviewError?: string | null;
  onViewReport: () => void;
  onRetryFinalReview?: () => void;
}) {
  const progressTotal = draftReady ? targetTotal : targetTotal;
  const header = finalReviewFailed
    ? "Final review failed"
    : draftReady
      ? finalReportReady
        ? "Draft ready"
        : "Full deck"
      : buildPhase === "RESEARCHING"
        ? "Researching"
        : buildPhase === "HEAD_PROFESSOR_REVIEW" || buildPhase === "FINAL_REFINEMENT" || buildPhase === "PROFESSOR_GRADE"
          ? "Head Professor review"
          : buildPhase === "FINAL_REVIEW" || buildPhase === "DRAFT_READY"
            ? "Final review"
            : "Building deck";
  const statusLine = finalReviewFailed
    ? formatFinalReviewError(finalReviewError)
    : draftReady
      ? finalReportReady
        ? "Report ready ✓"
        : "Draft ready ✓"
      : building
        ? buildPhase === "RESEARCHING"
          ? "Searching catalog…"
          : buildPhase === "HEAD_PROFESSOR_REVIEW" || buildPhase === "FINAL_REFINEMENT"
            ? "GPT-5.6 Sol reviewing deck…"
            : isFinalReviewPhase(buildPhase)
              ? "Writing defense report…"
              : "Building…"
        : buildPhase === "NEEDS_ATTENTION"
          ? "Needs attention"
          : buildPhase === "HEAD_PROFESSOR_REVIEW" || buildPhase === "FINAL_REFINEMENT" || buildPhase === "PROFESSOR_GRADE"
            ? "GPT-5.6 Sol reviewing deck…"
            : revealCount >= targetTotal - 1 && !draftReady
              ? "Completing deck to 100…"
              : "Starting…";

  return (
    <div className="mb-4 grid gap-3 border-b-4 border-[#111] bg-[#f3efe4] px-4 py-3 text-[#111] sm:grid-cols-[1fr_auto_1fr] sm:items-end">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-600">{header}</p>
        <p className="text-2xl font-black uppercase tracking-tight">
          {revealCount} <span className="text-neutral-500">/ {progressTotal}</span>
        </p>
      </div>

      <div className="text-center">
        {grade && draftReady ? (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-600">
              {finalReportReady ? "Deck report" : "Professor grade"}
            </p>
            <p className="text-3xl font-black leading-none">{grade.overallLetter}</p>
            <p className="text-sm font-black text-neutral-700">
              {grade.cos?.competitiveStrength != null
                ? `Competitive Strength ${Math.round(grade.cos.competitiveStrength)} / 100`
                : "COS not scored"}
            </p>
            <button
              type="button"
              onClick={onViewReport}
              className="professor-brew-brutal-btn mt-2 px-3 py-1.5 text-[10px]"
            >
              {finalReportReady ? "View full report" : "View deck report"}
            </button>
          </>
        ) : draftReady && finalReportReady ? (
          <button
            type="button"
            onClick={onViewReport}
            className="professor-brew-brutal-btn px-3 py-1.5 text-[10px]"
          >
            View full report
          </button>
        ) : finalReviewFailed ? (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-red-400">No grade issued</p>
            {onRetryFinalReview ? (
              <button
                type="button"
                onClick={onRetryFinalReview}
                disabled={building}
                className="professor-brew-brutal-btn px-3 py-1.5 text-[10px] disabled:opacity-50"
              >
                Retry GPT-5.6 Sol review
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">
            {building ? "Grading after build…" : "Grade pending"}
          </p>
        )}
      </div>

      <div className="text-right text-xs font-bold uppercase tracking-wider sm:justify-self-end">
        <p>{statusLine}</p>
        <p className="mt-1 flex items-center justify-end gap-2 text-[10px] text-neutral-700">
          <span className="inline-block h-3 w-3 rounded-sm border-2 border-[#34d399] bg-[#34d399]/30 shadow-[0_0_8px_2px_rgba(52,211,153,0.75)]" />
          {inStockLabel}
        </p>
      </div>
    </div>
  );
}

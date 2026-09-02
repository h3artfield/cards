"use client";

import { useState } from "react";
import type { CouncilTranscriptEntryV4, CouncilSpeakerV4 } from "@/lib/deck-synthesis/professor-council-transcript-v4-v1";

function speakerStyles(speaker: CouncilSpeakerV4, brutal: boolean, isDecision?: boolean, isMutation?: boolean): { badge: string; border: string } {
  if (isMutation) {
    return brutal
      ? { badge: "bg-[#111] text-white", border: "border-[#111]" }
      : { badge: "bg-neutral-800 text-neutral-100", border: "border-neutral-500" };
  }
  if (isDecision) {
    return brutal
      ? { badge: "bg-[#34d399] text-[#111]", border: "border-[#34d399]" }
      : { badge: "bg-emerald-950/60 text-emerald-200", border: "border-emerald-700/50" };
  }

  if (brutal) {
    switch (speaker) {
      case "CREATIVE":
        return { badge: "bg-[#ffe14d] text-[#111]", border: "border-[#ffe14d]" };
      case "RESEARCH":
        return { badge: "bg-[#7dd3fc] text-[#111]", border: "border-[#7dd3fc]" };
      case "CRITIC":
        return { badge: "bg-[#ff6b3d] text-[#111]", border: "border-[#ff6b3d]" };
      case "SYSTEM":
        return { badge: "bg-neutral-300 text-[#111]", border: "border-neutral-400" };
      case "TO_PLAYER":
        return { badge: "bg-white text-[#111]", border: "border-[#111]" };
    }
  }

  switch (speaker) {
    case "CREATIVE":
      return { badge: "bg-violet-950/60 text-violet-200", border: "border-violet-800/50" };
    case "RESEARCH":
      return { badge: "bg-sky-950/60 text-sky-200", border: "border-sky-800/50" };
    case "CRITIC":
      return { badge: "bg-amber-950/60 text-amber-200", border: "border-amber-800/50" };
    case "SYSTEM":
      return { badge: "bg-neutral-900 text-neutral-400", border: "border-neutral-700" };
    case "TO_PLAYER":
      return { badge: "bg-amber-950/40 text-amber-100", border: "border-amber-900/40" };
  }
}

function TranscriptEntry({
  entry,
  brutal,
  showDeveloperDetails,
}: {
  entry: CouncilTranscriptEntryV4;
  brutal: boolean;
  showDeveloperDetails: boolean;
}) {
  const isDecision = entry.kind === "DECISION" || entry.badge === "DECISION";
  const isMutation = entry.kind === "MUTATION";
  const styles = speakerStyles(entry.speaker, brutal, isDecision, isMutation);

  return (
    <article className={`border-l-4 pl-3 ${styles.border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${styles.badge}`}>
          {entry.label}
        </span>
        {entry.badge && entry.badge !== "DECISION" ? (
          <span className={`text-[10px] font-bold uppercase tracking-wider ${brutal ? "text-neutral-700" : "text-neutral-400"}`}>
            {entry.badge}
          </span>
        ) : null}
      </div>
      <p className={`mt-2 text-sm leading-relaxed ${brutal ? "text-neutral-900" : isMutation ? "font-mono text-neutral-100" : "text-neutral-100"}`}>{entry.body}</p>
      {entry.detail ? (
        <p className={`mt-1 text-xs ${brutal ? "text-neutral-700" : "text-neutral-300"}`}>{entry.detail}</p>
      ) : null}
      {showDeveloperDetails && entry.developerDetail ? (
        <p className={`mt-1 font-mono text-[10px] ${brutal ? "text-neutral-600" : "text-neutral-500"}`}>
          dev: {entry.developerDetail}
        </p>
      ) : null}
    </article>
  );
}

export function ProfessorCouncilTranscriptPanel({
  open,
  onClose,
  entries,
  brutal = false,
}: {
  open: boolean;
  onClose: () => void;
  entries: CouncilTranscriptEntryV4[];
  brutal?: boolean;
}) {
  const [showDeveloperDetails, setShowDeveloperDetails] = useState(false);
  if (!open) return null;

  const councilEntries = entries.filter((entry) => entry.speaker !== "TO_PLAYER");
  const playerEntries = entries.filter((entry) => entry.speaker === "TO_PLAYER");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        className={`flex h-full w-full max-w-xl flex-col shadow-2xl ${
          brutal
            ? "professor-brew-brutal-on-paper"
            : "border-l border-neutral-800 bg-[#0a0a0f] text-neutral-100"
        }`}
      >
        <header
          className={`flex items-start justify-between gap-4 px-5 py-4 ${
            brutal ? "border-b-4 border-[#111]" : "border-b border-neutral-800"
          }`}
        >
          <div>
            <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${brutal ? "text-neutral-700" : "text-neutral-400"}`}>
              The Professor Council
            </p>
            <h2 className={`mt-1 text-lg font-black uppercase tracking-tight ${brutal ? "text-neutral-950" : "text-white"}`}>
              Agent conversation
            </h2>
            <p className={`mt-1 text-xs ${brutal ? "text-neutral-800" : "text-neutral-400"}`}>
              Creative, Research, and Critic build one shared deck — debating charter, strategy, and cards together.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowDeveloperDetails((v) => !v)}
              className={
                brutal
                  ? "text-[10px] font-bold uppercase tracking-wider text-neutral-700 underline underline-offset-2"
                  : "text-[10px] uppercase tracking-wider text-neutral-500 underline underline-offset-2"
              }
            >
              {showDeveloperDetails ? "Hide dev details" : "Dev details"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={brutal ? "professor-brew-brutal-btn px-3 py-1.5 text-xs" : "rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300"}
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {councilEntries.length === 0 ? (
            <p className={`text-sm ${brutal ? "text-neutral-800" : "text-neutral-400"}`}>
              Council conversation will appear after the professors agree on a Deck Charter.
            </p>
          ) : (
            <div className="space-y-5">
              {councilEntries.map((entry) => (
                <TranscriptEntry
                  key={entry.id}
                  entry={entry}
                  brutal={brutal}
                  showDeveloperDetails={showDeveloperDetails}
                />
              ))}
            </div>
          )}

          {playerEntries.length > 0 ? (
            <section className={`mt-8 border-t pt-6 ${brutal ? "border-[#111]" : "border-neutral-800"}`}>
              <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${brutal ? "text-neutral-700" : "text-neutral-400"}`}>
                Spoken to you
              </p>
              <div className="mt-4 space-y-4">
                {playerEntries.map((entry) => (
                  <TranscriptEntry key={entry.id} entry={entry} brutal={brutal} showDeveloperDetails={false} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

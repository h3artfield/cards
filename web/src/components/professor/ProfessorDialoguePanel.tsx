"use client";

import type { BrewDialogueChoiceV42, BrewDiscoveryInterruptV42, BrewProfessorLineV42 } from "@/lib/deck-synthesis/professor-brew-session-client-v4-2-v1";

export function ProfessorDialoguePanel({
  lines,
  choices,
  discoveryInterrupt,
  loading,
  completePlaceholder,
  brutal = false,
  onViewCouncil,
  showViewCouncil = false,
  onChoice,
}: {
  lines: BrewProfessorLineV42[];
  choices: BrewDialogueChoiceV42[];
  discoveryInterrupt: BrewDiscoveryInterruptV42 | null;
  loading: boolean;
  completePlaceholder?: string;
  brutal?: boolean;
  onViewCouncil?: () => void;
  showViewCouncil?: boolean;
  onChoice: (choice: BrewDialogueChoiceV42) => void;
}) {
  const latest = lines[lines.length - 1];

  if (brutal) {
    return (
      <div className="border-t-4 border-[#111] bg-[#f3efe4] text-[#111]">
        <div className="mx-auto max-w-[1600px] px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-600">Professor says</p>
          {discoveryInterrupt ? (
            <p className="mt-1 text-sm font-black uppercase tracking-wide text-[#ff6b3d]">{discoveryInterrupt.headline}</p>
          ) : null}
          <p className="mt-2 text-sm font-semibold leading-relaxed">{latest?.body ?? "…"}</p>
          {showViewCouncil && onViewCouncil ? (
            <button
              type="button"
              onClick={onViewCouncil}
              className="mt-3 text-[10px] font-black uppercase tracking-wider text-neutral-600 underline underline-offset-2"
            >
              View council conversation
            </button>
          ) : null}
          {completePlaceholder ? (
            <p className="mt-3 border-2 border-[#111] bg-[#ffe14d] px-3 py-2 text-xs font-bold uppercase tracking-wide">
              {completePlaceholder}
            </p>
          ) : null}
          {choices.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {choices.map((choice) => (
                <li key={choice.choiceId}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onChoice(choice)}
                    className="professor-brew-brutal-btn px-4 py-2.5 text-left text-xs disabled:opacity-50"
                  >
                    {choice.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-amber-900/30 bg-[linear-gradient(180deg,_#12100a_0%,_#0a0a0f_100%)]">
      <div className="mx-auto max-w-[1600px] px-4 py-4">
        <div className="flex gap-4">
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-full border border-amber-800/40 bg-amber-950/30 sm:flex">
            <span className="text-lg text-amber-500">P</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-amber-600/80">Professor</p>
            {discoveryInterrupt ? (
              <p className="mt-1 text-sm font-medium text-violet-300">{discoveryInterrupt.headline}</p>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-neutral-100">{latest?.body ?? "…"}</p>
            {showViewCouncil && onViewCouncil ? (
              <button
                type="button"
                onClick={onViewCouncil}
                className="mt-3 text-[10px] uppercase tracking-wider text-amber-600/90 underline underline-offset-2 hover:text-amber-500"
              >
                View council conversation
              </button>
            ) : null}
            {completePlaceholder ? <p className="mt-3 text-xs italic text-neutral-500">{completePlaceholder}</p> : null}

            {choices.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {choices.map((choice) => (
                  <li key={choice.choiceId}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onChoice(choice)}
                      className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-2.5 text-left text-sm text-amber-50 transition hover:border-amber-600/50 hover:bg-amber-900/30 disabled:opacity-50"
                    >
                      <span className="font-medium">{choice.label}</span>
                      {choice.description ? (
                        <span className="mt-0.5 block text-xs text-neutral-400">{choice.description}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

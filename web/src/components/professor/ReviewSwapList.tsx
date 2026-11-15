"use client";

import { useState } from "react";
import { CardMentionV1 } from "./CardNameHoverPreview";

type Swap = { cut: string; add: string; reason: string };

const swapKey = (swap: { cut: string; add: string }) => `${swap.cut}->${swap.add}`;

/** The Professor's suggested swaps for a reviewed deck, each applied only on request. */
export function ReviewSwapList({
  summary,
  requiredChanges,
  swaps,
  isApplied,
  onApply,
}: {
  summary?: string;
  requiredChanges: readonly string[];
  swaps: readonly Swap[];
  isApplied: (swap: Swap) => boolean;
  onApply: (swap: Swap) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  return (
    <div className="space-y-4 px-4 py-5 sm:px-6">
      {requiredChanges.length > 0 ? (
        <div>
          <p className="professor-mtg-label text-xs">What the Professor would fix</p>
          <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
            {requiredChanges.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="professor-mtg-label text-xs">Suggested swaps</p>
        {summary ? <p className="professor-mtg-muted mt-1 text-xs leading-relaxed">{summary}</p> : null}
        {swaps.length === 0 ? (
          <p className="professor-mtg-muted mt-2 text-sm">
            No swaps to suggest. The Professor thinks this list is tight for its plan.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {swaps.map((swap) => {
              const key = swapKey(swap);
              const applied = isApplied(swap);
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--mtg-stone-border)] p-2.5"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <p>
                      <span className="text-[var(--text-lo)] line-through decoration-1">
                        <CardMentionV1 name={swap.cut} />
                      </span>
                      {" → "}
                      <span className="text-[var(--accent-hi)]">
                        <CardMentionV1 name={swap.add} />
                      </span>
                    </p>
                    {swap.reason ? (
                      <p className="professor-mtg-muted mt-0.5 text-xs leading-relaxed">{swap.reason}</p>
                    ) : null}
                    {error?.key === key ? <p className="mt-1 text-xs text-red-300">{error.message}</p> : null}
                  </div>
                  {applied ? (
                    <span className="professor-mtg-tag professor-mtg-tag--ok shrink-0">Applied</span>
                  ) : (
                    <button
                      type="button"
                      className="professor-mtg-btn shrink-0 px-3 py-1 text-[11px]"
                      disabled={busy != null}
                      onClick={() => {
                        setBusy(key);
                        setError(null);
                        onApply(swap)
                          .catch((err: unknown) =>
                            setError({ key, message: err instanceof Error ? err.message : "Could not apply" }),
                          )
                          .finally(() => setBusy(null));
                      }}
                    >
                      {busy === key ? "Applying…" : "Apply"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="professor-mtg-muted mt-3 text-[11px]">
          Applying a swap moves the old card to Cut, so you can bring it back from the deck view.
        </p>
      </div>
    </div>
  );
}

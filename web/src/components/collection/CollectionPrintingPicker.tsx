"use client";

import type { CollectionImportCandidate } from "@/lib/collection/collection-import-parse";
import {
  COLLECTION_FINISH_LABELS,
  finishesFromUnknown,
  type CollectionFinish,
} from "@/lib/collection/collection-finish";

export function printingMeta(hit: CollectionImportCandidate): string {
  const set = hit.setName ?? hit.setCode.toUpperCase();
  return `${set} #${hit.collectorNumber}${hit.rarity ? ` · ${hit.rarity}` : ""}`;
}

export function CollectionPrintingPicker({
  candidates,
  busyId,
  onPick,
}: {
  candidates: CollectionImportCandidate[];
  busyId?: string | null;
  onPick: (scryfallId: string, finish: CollectionFinish) => void;
}) {
  if (!candidates.length) {
    return <p className="mt-3 text-sm text-neutral-500">No printings found.</p>;
  }

  return (
    <ul className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto">
      {candidates.map((hit) => {
        const finishes = finishesFromUnknown(hit.finishes);
        return (
          <li
            key={hit.scryfallId}
            className="flex items-start gap-3 border border-neutral-800 px-2 py-2"
          >
            {hit.imageNormal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hit.imageNormal}
                alt=""
                className="h-40 w-[7.15rem] shrink-0 object-cover"
              />
            ) : (
              <span className="h-40 w-[7.15rem] shrink-0 bg-neutral-900" />
            )}
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm leading-snug text-white">{hit.name}</span>
              <span className="mt-1 block text-xs leading-snug text-neutral-500">
                {printingMeta(hit)}
              </span>
              <span className="mt-3 flex flex-wrap gap-2">
                {finishes.map((finish) => (
                  <button
                    key={finish}
                    type="button"
                    disabled={busyId != null}
                    onClick={() => onPick(hit.scryfallId, finish)}
                    className="border border-neutral-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:border-[var(--accent)] disabled:opacity-60"
                  >
                    {busyId === `${hit.scryfallId}:${finish}`
                      ? "Saving…"
                      : COLLECTION_FINISH_LABELS[finish]}
                  </button>
                ))}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

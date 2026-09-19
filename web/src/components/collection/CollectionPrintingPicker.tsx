"use client";

import type { CollectionImportCandidate } from "@/lib/collection/collection-import-parse";

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
  onPick: (scryfallId: string) => void;
}) {
  if (!candidates.length) {
    return <p className="mt-3 text-sm text-neutral-500">No printings found.</p>;
  }

  return (
    <ul className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto">
      {candidates.map((hit) => (
        <li key={hit.scryfallId}>
          <button
            type="button"
            disabled={busyId != null}
            onClick={() => onPick(hit.scryfallId)}
            className="flex w-full items-start gap-3 border border-neutral-800 px-2 py-2 text-left hover:border-neutral-600 disabled:opacity-60"
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
            <span className="min-w-0 text-left">
              <span className="block text-sm leading-snug text-white">{hit.name}</span>
              <span className="mt-1 block text-xs leading-snug text-neutral-500">
                {printingMeta(hit)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

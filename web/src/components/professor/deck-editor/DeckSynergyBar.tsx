"use client";

import { CardNameHoverPreview } from "../CardNameHoverPreview";
import type { SynergyKindV1, SynergyLinkV1 } from "@/lib/professor-deck-editor/synergy-v1";

/**
 * What the selected card works with.
 *
 * The three kinds are shown as three labelled groups rather than one ranked
 * list, because they carry very different weight: a verified combo is a fact
 * about the cards, a shared package is the Professor's intent, and a shared
 * role is only an observation that two cards do a similar job. Flattening them
 * into one list would invite reading the weakest as the strongest.
 */

const KIND_COPY_V1: Record<SynergyKindV1, { label: string; hint: string; tone: string }> = {
  combo: {
    label: "Combos with",
    hint: "A verified line these cards both appear in",
    tone: "text-[var(--accent-hi)]",
  },
  package: {
    label: "Built to work with",
    hint: "The Professor chose these together for the same job",
    tone: "text-[var(--text-hi)]",
  },
  role: {
    label: "Does a similar job to",
    hint: "Derived from oracle text — similar function, not a combo",
    tone: "text-[var(--text)]",
  },
};

const KIND_ORDER_V1: SynergyKindV1[] = ["combo", "package", "role"];

export function DeckSynergyBar({
  cardName,
  links,
  loading,
  error,
  semanticUnavailable,
  imageUrls,
  onClear,
  onSelectCard,
}: {
  cardName: string;
  links: SynergyLinkV1[] | null;
  loading: boolean;
  error: string | null;
  semanticUnavailable: boolean;
  imageUrls: Record<string, string>;
  onClear: () => void;
  onSelectCard: (cardKey: string) => void;
}) {
  const byKind = new Map<SynergyKindV1, SynergyLinkV1[]>();
  for (const link of links ?? []) {
    const bucket = byKind.get(link.kind) ?? [];
    bucket.push(link);
    byKind.set(link.kind, bucket);
  }

  return (
    <div className="professor-mtg-panel-status border-b border-[var(--mtg-stone-border)] px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="professor-mtg-label text-[10px]">Synergy</span>
        <span className="text-sm text-[var(--text-hi)]">{cardName}</span>
        <button type="button" className="professor-mtg-link ml-auto text-[11px]" onClick={onClear}>
          Clear
        </button>
      </div>

      {loading ? (
        <p className="professor-mtg-muted mt-2 text-xs italic">Working out the connections…</p>
      ) : error ? (
        <p className="mt-2 text-xs text-[var(--bad)]">{error}</p>
      ) : !links || links.length === 0 ? (
        <p className="professor-mtg-muted mt-2 text-xs">
          No verified combo, shared package or shared role connects this card to the rest of the
          deck. That is not a criticism of the card — plenty of good cards stand on their own.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {KIND_ORDER_V1.filter((kind) => byKind.has(kind)).map((kind) => {
            const copy = KIND_COPY_V1[kind];
            const group = byKind.get(kind)!;
            return (
              <div key={kind}>
                <p className="professor-mtg-muted text-[10px]" title={copy.hint}>
                  {copy.label} · {group.length}
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {group.map((link) => (
                    <li key={`${kind}:${link.cardKey}`} className={`text-xs ${copy.tone}`}>
                      <span title={link.detail}>
                        <CardNameHoverPreview
                          name={link.name}
                          imageUrl={imageUrls[link.name]}
                          onClick={() => onSelectCard(link.cardKey)}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {semanticUnavailable ? (
            <p className="professor-mtg-muted text-[10px]">
              Oracle-text roles are unavailable in this deployment, so only combos and packages are
              shown.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

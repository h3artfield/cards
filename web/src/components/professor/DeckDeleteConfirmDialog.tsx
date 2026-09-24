"use client";

import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";

export function DeckDeleteConfirmDialog({
  deck,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  deck: CustomerDeckListEntryV1;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-delete-title"
    >
      <div className="professor-mtg-card w-full max-w-md px-5 py-6 shadow-2xl">
        <h2 id="deck-delete-title" className="professor-mtg-title text-xl">
          Delete this deck?
        </h2>
        <p className="professor-mtg-body mt-3 text-sm leading-relaxed">
          <span className="font-semibold text-[var(--mtg-parchment-bright)]">{deck.deckName}</span>
          {" · "}
          {deck.commanderName}
        </p>
        <p className="professor-mtg-muted mt-2 text-xs leading-relaxed">
          This removes the deck from your shelf at this store. It cannot be undone.
          {deck.origin === "professor"
            ? " If you opened it in the editor, your edits go with it."
            : null}
        </p>
        {error ? <p className="mt-3 text-sm text-[var(--bad)]">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="professor-mtg-btn px-4 py-2 text-xs"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="professor-mtg-btn professor-mtg-btn--danger px-4 py-2 text-xs"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Deleting…" : "Yes, delete deck"}
          </button>
        </div>
      </div>
    </div>
  );
}

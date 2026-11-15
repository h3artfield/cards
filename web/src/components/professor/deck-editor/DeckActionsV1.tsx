"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CommanderPickerV1, type CommanderPickResultV1 } from "../CommanderPickerV1";
import { deckEditorKeyQueryV1, type DeckEditorKeyV1 } from "./deck-key-v1";

type DialogV1 = "clone" | "swap" | "delete" | null;

/**
 * Clone, swap commander and delete, stacked beside the commander.
 *
 * Each opens its own dialog, because all three are a step away from the deck
 * rather than an edit inside it: a clone needs a name before it exists, a swap
 * needs a commander chosen, and a delete needs to be meant.
 */
export function DeckActionsV1({
  slug,
  deckKey,
  deckName,
}: {
  slug: string;
  deckKey: DeckEditorKeyV1;
  deckName: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogV1>(null);
  const [cloneName, setCloneName] = useState("");
  const [commander, setCommander] = useState<CommanderPickResultV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = deckEditorKeyQueryV1(deckKey);
  const base = `/api/store/${slug}/professor/deck-editor`;

  const open = (next: DialogV1) => {
    setError(null);
    setBusy(false);
    if (next === "clone") setCloneName(`${deckName} (copy)`);
    if (next === "swap") setCommander(null);
    setDialog(next);
  };
  const close = () => {
    if (!busy) setDialog(null);
  };

  const send = async (url: string, method: "POST" | "DELETE", body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; deckId?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
      return null;
    }
  };

  const clone = async () => {
    const name = cloneName.trim();
    if (!name) return setError("Give the copy a name.");
    const data = await send(`${base}/clone?${query}`, "POST", { deckName: name });
    if (data?.deckId) router.push(`/s/${slug}/decks/${encodeURIComponent(data.deckId)}`);
  };

  const swap = async () => {
    if (!commander) return setError("Pick a commander first.");
    const data = await send(`${base}/commander?${query}`, "POST", { commanderName: commander.name });
    if (!data?.deckId) return;
    // A Professor build's own page shows the build's commander, so the swapped
    // deck is opened where the editable copy is the source of truth.
    const deckPath = `/s/${slug}/decks/${encodeURIComponent(data.deckId)}`;
    if (window.location.pathname === deckPath) window.location.reload();
    else window.location.assign(deckPath);
  };

  const remove = async () => {
    const data = await send(`${base}?${query}`, "DELETE");
    if (data) router.push(`/s/${slug}/decks`);
  };

  return (
    <>
      <div className="deck-actions">
        <button type="button" className="professor-mtg-btn deck-actions__btn" onClick={() => open("clone")}>
          Clone deck
        </button>
        <button type="button" className="professor-mtg-btn deck-actions__btn" onClick={() => open("swap")}>
          Swap commander
        </button>
        <button
          type="button"
          className="professor-mtg-btn deck-actions__btn deck-actions__btn--danger"
          onClick={() => open("delete")}
        >
          Delete deck
        </button>
      </div>

      {dialog ? (
        <div className="deck-actions__overlay" onClick={close}>
          <div
            className="deck-actions__dialog"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog === "clone" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void clone();
                }}
              >
                <h3>Clone deck</h3>
                <p>The copy is a separate deck. Changes to it won&apos;t touch {deckName}.</p>
                <label className="sr-only" htmlFor="deck-clone-name">
                  New deck name
                </label>
                <input
                  id="deck-clone-name"
                  className="deck-actions__input"
                  value={cloneName}
                  maxLength={120}
                  autoFocus
                  onChange={(e) => setCloneName(e.target.value)}
                />
                {error ? <p className="deck-actions__error">{error}</p> : null}
                <div className="deck-actions__row">
                  <button type="button" className="professor-mtg-btn px-3 py-1.5 text-[11px]" onClick={close} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="professor-mtg-btn px-3 py-1.5 text-[11px]" disabled={busy}>
                    {busy ? "Cloning…" : "Clone and open"}
                  </button>
                </div>
              </form>
            ) : null}

            {dialog === "swap" ? (
              <div>
                <h3>Swap commander</h3>
                <p>
                  The 99 stay as they are. Cards outside the new commander&apos;s colors will show up
                  in the legality check so you can swap them out.
                </p>
                <CommanderPickerV1
                  slug={slug}
                  value={commander}
                  onChange={setCommander}
                  inputId="deck-swap-commander"
                />
                {error ? <p className="deck-actions__error">{error}</p> : null}
                <div className="deck-actions__row">
                  <button type="button" className="professor-mtg-btn px-3 py-1.5 text-[11px]" onClick={close} disabled={busy}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="professor-mtg-btn px-3 py-1.5 text-[11px]"
                    onClick={() => void swap()}
                    disabled={busy || !commander}
                  >
                    {busy ? "Swapping…" : commander ? `Make ${commander.name} the commander` : "Swap"}
                  </button>
                </div>
              </div>
            ) : null}

            {dialog === "delete" ? (
              <div>
                <h3>Are you sure?</h3>
                <p>This deletes {deckName} for good. It can&apos;t be undone.</p>
                {error ? <p className="deck-actions__error">{error}</p> : null}
                <div className="deck-actions__row">
                  <button type="button" className="professor-mtg-btn px-3 py-1.5 text-[11px]" onClick={close} disabled={busy}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="professor-mtg-btn deck-actions__btn--danger px-3 py-1.5 text-[11px]"
                    onClick={() => void remove()}
                    disabled={busy}
                  >
                    {busy ? "Deleting…" : "Yes, delete it"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

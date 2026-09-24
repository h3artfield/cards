"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyDeckEditOpsV1 } from "@/lib/professor-deck-editor/ops-v1";
import type { DeckEditOpV1, DeckEditRejectionV1 } from "@/lib/professor-deck-editor/ops-v1";
import type { EditableDeckV1 } from "@/lib/professor-deck-editor/types-v1";
import { deckEditorKeyQueryV1 } from "./deck-key-v1";
import type { DeckEditorDeck, DeckEditorPayload } from "./types";

export type DeckEditorNotice = {
  kind: "error" | "info";
  message: string;
  /** Operations that put the deck back, when the change is safely reversible. */
  undo?: DeckEditOpV1[];
};

export type DeckEditorState = {
  payload: DeckEditorPayload | null;
  loading: boolean;
  /** Set only when the deck could not be opened at all. */
  error: string | null;
  /**
   * True while an edit is in flight. The legality report on screen still
   * describes the deck as it was a moment ago, so the UI dims it rather than
   * asserting a verdict it cannot yet stand behind.
   */
  saving: boolean;
  notice: DeckEditorNotice | null;
  dismissNotice: () => void;
  applyOps: (
    ops: DeckEditOpV1[],
    /** `message` replaces the bare "Saved." when the caller can say more. */
    options?: { undo?: DeckEditOpV1[]; message?: string },
  ) => void;
  reload: () => void;
};

/**
 * Carries the read-time enrichment across an optimistic edit.
 *
 * The reducer only knows about stored fields, so cards it rebuilds come back
 * without their type line or markers — most visibly on a revert, which is
 * rebuilt entirely from `baselineCards`, a list the server never enriches.
 * Without this the deck would jump into an "unrecognised" section for the
 * moment between the click and the response.
 */
function reattachEnrichment(next: DeckEditorDeck, previous: DeckEditorDeck): DeckEditorDeck {
  const before = new Map(previous.cards.map((card) => [card.cardKey, card]));
  return {
    ...next,
    cards: next.cards.map((card) => {
      if (card.display && card.derivedMarkers) return card;
      const known = before.get(card.cardKey);
      if (!known) return card;
      return {
        ...card,
        display: card.display ?? known.display,
        derivedMarkers: card.derivedMarkers ?? known.derivedMarkers,
      };
    }),
  };
}

function rejectionMessage(rejected: readonly DeckEditRejectionV1[]): string {
  const first = rejected[0];
  if (!first) return "That change could not be applied.";
  return rejected.length === 1 ? first.reason : `${first.reason} (+${rejected.length - 1} more)`;
}

/**
 * Loads a deck and applies edits to it.
 *
 * Edits are shown immediately and confirmed afterwards. The optimistic result
 * is produced by running the server's own reducer on the client, so the two
 * cannot disagree about what an operation means — a second implementation of
 * "move this card" written in the component is how the copies count and the
 * board end up out of step.
 *
 * When the server does disagree, its answer wins outright and the local deck is
 * replaced. Rolling back one failed operation would mean unwinding every edit
 * made after it, and being briefly wrong is much better than being quietly
 * wrong.
 */
export function useDeckEditor(args: {
  slug: string;
  /** A deck handed over by the Professor. */
  buildId?: string;
  /** A deck started by hand, which has no build to be keyed by. */
  deckId?: string;
}): DeckEditorState {
  const { slug, buildId, deckId } = args;
  const [payload, setPayload] = useState<DeckEditorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const [notice, setNotice] = useState<DeckEditorNotice | null>(null);

  const endpoint = `/api/store/${slug}/professor/deck-editor`;
  const query = deckEditorKeyQueryV1({ buildId, deckId });

  // The deck an edit is computed against, held in a ref so `applyOps` can read
  // it without being rebuilt on every keystroke elsewhere in the tree.
  const payloadRef = useRef<DeckEditorPayload | null>(null);
  // Only ever set from a server response, so a queued request sends the
  // revision the server actually holds and not one an optimistic edit invented.
  const serverRevision = useRef<number | null>(null);
  // Serialises writes. Two PATCHes sent together carrying the same expected
  // revision would make the second a conflict against our own first edit.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const acceptPayload = useCallback((next: DeckEditorPayload) => {
    payloadRef.current = next;
    serverRevision.current = next.deck.revision;
    if (mounted.current) setPayload(next);
  }, []);

  const load = useCallback(async () => {
    const hadDeck = Boolean(payloadRef.current);
    if (!hadDeck) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`${endpoint}?${query}`);
      const data = (await res.json().catch(() => null)) as
        | (DeckEditorPayload & { error?: string })
        | null;
      if (!res.ok || !data?.deck) {
        const message = data?.error ?? "Could not open this deck for editing.";
        // A later fetch must not take down a list that already rendered.
        // Imported 99s do a heavy second read (React Strict Mode, param
        // refresh, enrichment). When that one fails, hiding the deck looks
        // like it vanished half a second after it appeared.
        if (payloadRef.current) {
          setNotice({ kind: "error", message });
        } else {
          setError(message);
        }
        return;
      }
      setError(null);
      acceptPayload(data);
    } catch {
      const message = "Could not reach the server. Check your connection and try again.";
      if (payloadRef.current) {
        setNotice({ kind: "error", message });
      } else {
        setError(message);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [acceptPayload, endpoint, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyOps = useCallback(
    (ops: DeckEditOpV1[], options?: { undo?: DeckEditOpV1[]; message?: string }) => {
      const current = payloadRef.current;
      if (!current || ops.length === 0) return;

      // Optimistic pass. Anything the reducer rejects here the server would
      // reject identically, so it is reported now and never sent.
      const outcome = applyDeckEditOpsV1({
        deck: current.deck as unknown as EditableDeckV1,
        ops,
        now: new Date().toISOString(),
      });
      if (!outcome.changed) {
        setNotice({ kind: "error", message: rejectionMessage(outcome.rejected) });
        return;
      }

      const optimistic: DeckEditorPayload = {
        ...current,
        deck: reattachEnrichment(outcome.deck as unknown as DeckEditorDeck, current.deck),
      };
      payloadRef.current = optimistic;
      setPayload(optimistic);
      setNotice(null);

      setInFlight((n) => n + 1);
      queue.current = queue.current.then(async () => {
        try {
          const res = await fetch(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(deckId ? { deckId } : { buildId }),
              expectedRevision: serverRevision.current ?? undefined,
              ops,
            }),
          });
          const data = (await res.json().catch(() => null)) as
            | (Partial<DeckEditorPayload> & {
                error?: string;
                conflict?: boolean;
                rejected?: DeckEditRejectionV1[];
              })
            | null;

          if (data?.conflict && data.deck) {
            acceptPayload(data as DeckEditorPayload);
            setNotice({
              kind: "error",
              message: "This deck was changed somewhere else, so your view has been refreshed.",
            });
            return;
          }

          if (!res.ok || !data?.deck) {
            const message = data?.rejected?.length
              ? rejectionMessage(data.rejected)
              : (data?.error ?? "That change could not be saved.");
            setNotice({ kind: "error", message });
            await load();
            return;
          }

          acceptPayload(data as DeckEditorPayload);
          if (data.rejected?.length) {
            setNotice({ kind: "error", message: rejectionMessage(data.rejected) });
          } else if (options?.undo?.length) {
            setNotice({ kind: "info", message: options.message ?? "Saved.", undo: options.undo });
          }
        } catch {
          setNotice({
            kind: "error",
            message: "That change could not be saved, so your deck has been reloaded.",
          });
          await load();
        } finally {
          if (mounted.current) setInFlight((n) => Math.max(0, n - 1));
        }
      });
    },
    [acceptPayload, buildId, deckId, endpoint, load],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);
  const reload = useCallback(() => void load(), [load]);

  return useMemo(
    () => ({
      payload,
      loading,
      error,
      saving: inFlight > 0,
      notice,
      dismissNotice,
      applyOps,
      reload,
    }),
    [payload, loading, error, inFlight, notice, dismissNotice, applyOps, reload],
  );
}

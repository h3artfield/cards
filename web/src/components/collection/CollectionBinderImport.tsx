"use client";

import { useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  authButton,
  authButtonSecondary,
  authError,
  authSubtext,
} from "@/lib/customer-auth-ui";
import { importCandidatesFromCard } from "@/lib/collection/collection-import-parse";
import type { CollectionCard } from "@/lib/types";

type ImportSummary = {
  locked: number;
  needsReview: number;
  unmatched: string[];
  cards: CollectionCard[];
};

function recapLine(summary: ImportSummary): string {
  const unmatched = summary.unmatched.length;
  const parts = [
    `${summary.locked} locked in your binder`,
    `${summary.needsReview} need a printing pick`,
  ];
  if (unmatched) {
    const sample = summary.unmatched.slice(0, 3).join(", ");
    parts.push(
      `${unmatched} unmatched${sample ? ` (${sample}${unmatched > 3 ? "…" : ""})` : ""}`,
    );
  }
  return parts.join(" · ");
}

export function CollectionBinderImport({
  slug,
  cards,
  onCards,
  onNotice,
  onError,
}: {
  slug: string;
  cards: CollectionCard[];
  onCards: (cards: CollectionCard[]) => void;
  onNotice: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const queue = useMemo(
    () =>
      cards.filter(
        (card) =>
          card.status === "owned" &&
          card.needsReview &&
          importCandidatesFromCard(card).length > 0,
      ),
    [cards],
  );
  const current = queue[0] ?? null;
  const candidates = current ? importCandidatesFromCard(current) : [];

  async function importText(raw: string) {
    const next = raw.trim();
    if (!next) {
      onError("Paste a list or choose a collection file");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const summary = await apiFetch<ImportSummary>(
        `/api/store/${encodeURIComponent(slug)}/collection/import`,
        {
          method: "POST",
          body: JSON.stringify({ text: next }),
        },
      );
      onCards(summary.cards);
      onNotice(recapLine(summary));
      setText("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not import that list");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const raw = await file.text();
    await importText(raw);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function pickPrinting(scryfallId: string) {
    if (!current) return;
    setResolvingId(scryfallId);
    onError(null);
    try {
      const data = await apiFetch<{ card: CollectionCard }>(
        `/api/store/${encodeURIComponent(slug)}/collection/${encodeURIComponent(current.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ scryfallId }),
        },
      );
      onCards([data.card]);
      onNotice(`${data.card.displayName} locked in your binder.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save that printing");
    } finally {
      setResolvingId(null);
    }
  }

  async function skipCurrent() {
    if (!current) return;
    setResolvingId(current.id);
    onError(null);
    try {
      await apiFetch(
        `/api/store/${encodeURIComponent(slug)}/collection/${encodeURIComponent(current.id)}`,
        { method: "DELETE" },
      );
      onCards([]);
      onNotice(`Removed ${current.displayName} from the review queue.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not skip that line");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className={authSubtext}>
          Upload a Moxfield, Archidekt, CSV, or text list into this binder — not
          the shop pile.
        </p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder={"1 Sol Ring\n1 Lightning Bolt (lea) 161"}
          className="w-full resize-y border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={authButton}
            disabled={busy || !text.trim()}
            onClick={() => void importText(text)}
          >
            {busy ? "Importing…" : "Import list"}
          </button>
          <button
            type="button"
            className={authButtonSecondary}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Upload file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.dek,text/plain,text/csv"
            className="hidden"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </div>
      </div>

      {current ? (
        <div className="border border-neutral-800 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Needs a printing · {queue.length} left
          </p>
          <p className="mt-1 text-sm text-white">
            {current.displayName}
            {current.quantity && current.quantity > 1 ? ` · ×${current.quantity}` : ""}
          </p>
          <p className={`mt-1 ${authSubtext}`}>
            This line is not owned on decks until you pick a printing.
          </p>
          <ul className="mt-3 space-y-2">
            {candidates.map((hit) => (
              <li key={hit.scryfallId}>
                <button
                  type="button"
                  disabled={resolvingId !== null}
                  onClick={() => void pickPrinting(hit.scryfallId)}
                  className="flex w-full items-center gap-3 border border-neutral-800 px-2 py-2 text-left hover:border-neutral-600 disabled:opacity-60"
                >
                  {hit.imageNormal ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hit.imageNormal}
                      alt=""
                      className="h-14 w-10 shrink-0 object-cover"
                    />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{hit.name}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {(hit.setName ?? hit.setCode.toUpperCase()) +
                        (hit.collectorNumber ? ` #${hit.collectorNumber}` : "")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`mt-3 ${authButtonSecondary}`}
            disabled={resolvingId !== null}
            onClick={() => void skipCurrent()}
          >
            Skip this line
          </button>
        </div>
      ) : null}
    </div>
  );
}

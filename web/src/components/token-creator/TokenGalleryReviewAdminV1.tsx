"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { TokenGalleryStatusV1 } from "@/lib/token-creator/types-v1";

type Entry = {
  entryId: string;
  title: string;
  authorName: string;
  prompt: string;
  status: TokenGalleryStatusV1;
  copies: number;
  createdAt: string;
  reviewedBy: string | null;
  previewUrl: string;
};

const STATUS_LABEL: Record<TokenGalleryStatusV1, string> = {
  pending: "Waiting for review",
  approved: "In the gallery",
  hidden: "Hidden",
};

/** Customers' shared token designs; nothing shows in the store gallery until staff approve it. */
export function TokenGalleryReviewAdminV1({ storeKey }: { storeKey: string | null }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const res = await adminFetch("/api/admin/token-gallery");
    const data = (await res.json()) as { entries?: Entry[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not load the gallery");
    setEntries(data.entries ?? []);
  }, []);

  useEffect(() => {
    if (!storeKey) return;
    Promise.resolve()
      .then(load)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the gallery"))
      .finally(() => setLoading(false));
  }, [storeKey, load]);

  async function act(entry: Entry, action: TokenGalleryStatusV1 | "delete") {
    if (action === "delete" && !window.confirm(`Delete “${entry.title}” from the gallery for good?`)) return;
    setBusy(entry.entryId);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/token-gallery/${encodeURIComponent(entry.entryId)}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        ...(action === "delete" ? {} : { body: JSON.stringify({ status: action }) }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      setEntries((prev) =>
        action === "delete" ? prev.filter((e) => e.entryId !== entry.entryId) : prev.map((e) => (e.entryId === entry.entryId ? { ...e, status: action } : e)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(null);
    }
  }

  const pending = entries.filter((e) => e.status === "pending");
  const shown = showAll ? entries : pending;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-gray-900">Token gallery review</h2>
      <p className="mt-1 text-sm text-gray-700">
        Designs customers shared. Approve one to show it in your store&apos;s gallery, where other customers can copy the look and
        prompt (not the artwork itself). Hide or delete anything that shouldn&apos;t be there.
      </p>
      {error ? <p className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
      {loading ? (
        <p className="mt-4 text-sm text-gray-600">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
          {showAll ? "Nobody has shared a design yet." : "Nothing waiting for review."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => (
            <li key={e.entryId} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.previewUrl} alt={e.title} className="h-36 w-26 shrink-0 rounded object-cover" loading="lazy" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold text-gray-900">{e.title}</p>
                <p className="text-gray-700">
                  by {e.authorName} · {STATUS_LABEL[e.status]}
                  {e.copies ? ` · ${e.copies} cop${e.copies === 1 ? "y" : "ies"}` : ""}
                </p>
                {e.prompt ? <p className="mt-1 line-clamp-3 text-xs text-gray-600">“{e.prompt}”</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.status !== "approved" ? (
                    <Button disabled={busy === e.entryId} onClick={() => void act(e, "approved")}>
                      Approve
                    </Button>
                  ) : null}
                  {e.status !== "hidden" ? (
                    <Button variant="secondary" disabled={busy === e.entryId} onClick={() => void act(e, "hidden")}>
                      Hide
                    </Button>
                  ) : null}
                  <Button variant="ghost" disabled={busy === e.entryId} onClick={() => void act(e, "delete")}>
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {entries.length > pending.length ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm text-gray-700 underline hover:text-gray-900">
          {showAll ? "Show only waiting" : `Show all ${entries.length} shared designs`}
        </button>
      ) : null}
    </section>
  );
}

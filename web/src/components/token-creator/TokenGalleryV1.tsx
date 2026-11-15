"use client";

import type { TokenGalleryViewV1 } from "@/lib/token-creator/gallery-v1";
import { tokenStyleLabelV1 } from "@/lib/token-creator/styles-v1";

const STATUS: Record<TokenGalleryViewV1["status"], string> = {
  pending: "Waiting for the shop to approve",
  approved: "In the gallery",
  hidden: "Hidden by the shop",
};

/**
 * Designs other customers at this store shared. "Use this design" starts a
 * new design with the same look, words and art prompt; new artwork is
 * generated from it, the author's own art is never copied.
 */
export function TokenGalleryV1({
  entries,
  loading,
  busyId,
  onUse,
  onRemove,
}: {
  entries: TokenGalleryViewV1[];
  loading: boolean;
  busyId: string | null;
  onUse: (entry: TokenGalleryViewV1) => void;
  onRemove: (entry: TokenGalleryViewV1) => void;
}) {
  const mine = entries.filter((e) => e.mine);
  const others = entries.filter((e) => !e.mine);

  const tile = (e: TokenGalleryViewV1) => (
    <li key={e.entryId} className="token-gallery__item">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={e.previewUrl} alt={e.title} loading="lazy" className="token-gallery__img" />
      <div className="token-gallery__meta">
        <p className="token-gallery__title">{e.title}</p>
        <p className="professor-mtg-muted text-[11px]">
          {e.mine ? STATUS[e.status] : `by ${e.authorName}`}
          {tokenStyleLabelV1(e.styleId, e.blendStyleId) ? ` · ${tokenStyleLabelV1(e.styleId, e.blendStyleId)}` : ""}
          {e.copies ? ` · used ${e.copies}×` : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="button" className="token-link" disabled={busyId === e.entryId} onClick={() => onUse(e)}>
            {busyId === e.entryId ? "Opening…" : "Use this design"}
          </button>
          {e.mine ? (
            <button type="button" className="token-link" disabled={busyId === e.entryId} onClick={() => onRemove(e)}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );

  return (
    <div className="professor-mtg-card mt-4 p-4">
      <h2 className="token-section-title">Store gallery</h2>
      <p className="professor-mtg-muted mb-3 text-[12px]">
        Tokens other customers made here. Use one to start from its look, words and art prompt; you get your own new artwork.
        Share yours from any finished card with &ldquo;Share to gallery&rdquo;.
      </p>
      {loading ? (
        <p className="professor-mtg-muted text-sm italic">Loading the gallery…</p>
      ) : !entries.length ? (
        <p className="professor-mtg-muted text-sm">Nobody has shared a design here yet. Yours could be the first.</p>
      ) : (
        <>
          {others.length ? <ul className="token-gallery">{others.map(tile)}</ul> : null}
          {mine.length ? (
            <>
              <p className="token-subhead mt-4">You shared</p>
              <ul className="token-gallery">{mine.map(tile)}</ul>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { readClerkDragPayload } from "./clerk-gathering";
import { CartPanel } from "./CartPanel";
import type { GatheringCard } from "./clerk-gathering";

export function GatheringDesk({
  onAdd,
  slug,
  game = "magic",
  /** Desktop column: keep the cart inside the viewport with internal scroll. */
  fillViewport = false,
}: {
  onAdd: (card: GatheringCard) => void;
  slug: string;
  game?: string;
  fillViewport?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const payload = readClerkDragPayload(e.dataTransfer);
    if (payload) onAdd(payload);
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-3 transition ${
        fillViewport ? "flex h-full min-h-0 flex-col overflow-hidden" : ""
      } ${
        dragOver
          ? "border-indigo-400 bg-indigo-950/40"
          : "border-neutral-600 bg-neutral-900/40"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <CartPanel slug={slug} game={game} fillViewport={fillViewport} />
    </div>
  );
}

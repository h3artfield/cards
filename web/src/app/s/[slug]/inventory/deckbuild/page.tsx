"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { DeckBuildApp } from "@/components/deck-build/DeckBuildApp";

function DeckBuildLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-neutral-500">
      Loading deck build workspace…
    </div>
  );
}

function DeckBuildContent() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-red-400">
        Store not found
      </div>
    );
  }
  return <DeckBuildApp slug={slug} />;
}

export default function DeckBuildPage() {
  return (
    <Suspense fallback={<DeckBuildLoading />}>
      <DeckBuildContent />
    </Suspense>
  );
}

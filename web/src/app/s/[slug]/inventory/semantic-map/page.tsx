"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { SemanticMapApp } from "@/components/semantic-map/SemanticMapApp";

function SemanticMapLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
      Loading semantic map…
    </div>
  );
}

function SemanticMapContent() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-red-400">
        Store not found
      </div>
    );
  }
  return <SemanticMapApp slug={slug} />;
}

export default function SemanticMapPage() {
  return (
    <Suspense fallback={<SemanticMapLoading />}>
      <SemanticMapContent />
    </Suspense>
  );
}

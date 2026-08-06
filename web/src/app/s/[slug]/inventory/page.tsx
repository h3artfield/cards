"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { StoreInventoryApp } from "@/components/store-inventory/StoreInventoryApp";

function InventoryLoadingShell() {
  return (
    <div
      className="min-h-screen bg-neutral-950 text-neutral-300"
      style={{ backgroundColor: "#0a0a0a", color: "#d4d4d4" }}
    >
      <header className="border-b border-neutral-800 px-4 py-4">
        <div className="mx-auto max-w-7xl">
          <p className="text-lg font-semibold text-white">Inventory</p>
          <p className="mt-2 text-sm text-neutral-500">Loading inventory…</p>
        </div>
      </header>
    </div>
  );
}

function StoreInventoryContent() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");

  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-red-400">
        Store not found
      </div>
    );
  }

  return (
    <StoreInventoryApp
      slug={slug}
      initialTab={mode === "deck-builder" ? "deck-builder" : "browse"}
    />
  );
}

export default function StoreInventoryPage() {
  return (
    <Suspense fallback={<InventoryLoadingShell />}>
      <StoreInventoryContent />
    </Suspense>
  );
}

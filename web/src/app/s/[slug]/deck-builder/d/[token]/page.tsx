"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DeckBuilderApp } from "@/components/deck-builder/DeckBuilderApp";

export default function SharedDeckPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const [storeName, setStoreName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/store/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Store not found");
        setStoreName(data.store.name);
        setLogoUrl(data.store.logoUrl);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Store not found"),
      )
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        Loading shared deck…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-red-400">
        {error}
      </div>
    );
  }

  return (
    <DeckBuilderApp
      slug={slug}
      storeName={storeName}
      logoUrl={logoUrl}
      initialShareToken={token}
    />
  );
}

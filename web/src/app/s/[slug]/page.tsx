"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StoreHomePage } from "@/components/StoreHomePage";

export default function StoreEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <StoreHomePage
      slug={slug}
      storeName={storeName ?? ""}
      logoUrl={logoUrl}
      loading={loading || !storeName}
      error={error}
    />
  );
}

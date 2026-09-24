"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StoreCalendarView } from "@/components/StoreCalendarView";

export default function StoreCalendarPage() {
  const { slug } = useParams<{ slug: string }>();
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/store/${encodeURIComponent(slug)}`)
      .then((r) => setValid(r.ok))
      .catch(() => setValid(false));
  }, [slug]);

  if (valid === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ink-850)] px-4">
        <p className="text-sm text-[var(--text-lo)]">Store not found.</p>
      </div>
    );
  }

  return <StoreCalendarView slug={slug} />;
}

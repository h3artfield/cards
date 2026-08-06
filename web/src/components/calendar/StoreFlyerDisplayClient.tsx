"use client";

import { useCallback, useEffect, useState } from "react";
import { FlyerDisplaySlideshow } from "@/components/calendar/FlyerDisplaySlideshow";
import type { FlyerOrientation } from "@/lib/store-calendar/flyer-orientation";

type Props = {
  slug: string;
  orientation?: FlyerOrientation;
};

export function StoreFlyerDisplayClient({
  slug,
  orientation = "portrait",
}: Props) {
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/store/${encodeURIComponent(slug)}`)
      .then((r) => setValid(r.ok))
      .catch(() => setValid(false));
  }, [slug]);

  const fetchFlyers = useCallback(async () => {
    const params = new URLSearchParams({ orientation });
    const res = await fetch(
      `/api/store/${encodeURIComponent(slug)}/flyers?${params.toString()}`,
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Could not load flyers");
    }
    return {
      flyers: (data.flyers ?? []).map(
        (
          f: {
            id?: string;
            title: string;
            imageUrl: string;
            scheduleLabel: string;
            mediaType?: "image" | "video";
          },
          i: number,
        ) => ({
          id: f.id ?? `${slug}-${orientation}-${i}`,
          title: f.title,
          imageUrl: f.imageUrl,
          mediaType: f.mediaType ?? "image",
          scheduleLabel: f.scheduleLabel,
          updatedAt: "",
        }),
      ),
      storeName: data.storeName as string | undefined,
    };
  }, [slug, orientation]);

  if (valid === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm text-white/70">Store not found.</p>
      </div>
    );
  }

  if (valid === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-lg">Loading…</p>
      </div>
    );
  }

  return (
    <FlyerDisplaySlideshow
      fetchFlyers={fetchFlyers}
      orientation={orientation}
    />
  );
}

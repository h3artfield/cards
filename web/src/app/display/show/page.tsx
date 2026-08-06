"use client";

import { useCallback, useEffect, useState } from "react";
import { FlyerDisplaySlideshow } from "@/components/calendar/FlyerDisplaySlideshow";
import {
  captureDisplayTokenFromUrl,
  displayAuthHeaders,
  getDisplayToken,
} from "@/lib/display-auth";
import { flyerDisplayLoginPath, flyerDisplayShowPath } from "@/lib/store-slug";

export default function DisplayShowPage() {
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    captureDisplayTokenFromUrl();

    void (async () => {
      const headers = displayAuthHeaders();
      const res = await fetch("/api/admin/me", {
        credentials: "include",
        headers,
      });
      if (res.ok) {
        setSessionReady(true);
        return;
      }
      if (getDisplayToken()) {
        const retry = await fetch("/api/admin/store-flyers", {
          credentials: "include",
          headers: displayAuthHeaders(),
        });
        if (retry.ok) {
          setSessionReady(true);
          return;
        }
      }
      window.location.assign(flyerDisplayLoginPath());
    })();
  }, []);

  const fetchFlyers = useCallback(async () => {
    const res = await fetch("/api/admin/store-flyers", {
      credentials: "include",
      headers: displayAuthHeaders(),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Unauthorized");
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Could not load flyers");
    }
    return {
      flyers: data.flyers ?? [],
      storeName: data.storeName as string | undefined,
    };
  }, []);

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-lg">Starting display…</p>
      </div>
    );
  }

  return (
    <FlyerDisplaySlideshow
      fetchFlyers={fetchFlyers}
      onUnauthorized={() => {
        window.location.assign(flyerDisplayLoginPath());
      }}
    />
  );
}

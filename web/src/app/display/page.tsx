"use client";

import { useEffect } from "react";
import {
  captureDisplayTokenFromUrl,
  displayAuthHeaders,
  getDisplayToken,
} from "@/lib/display-auth";
import { flyerDisplayLoginPath, flyerDisplayShowPath } from "@/lib/store-slug";

export default function DisplayIndexPage() {
  useEffect(() => {
    captureDisplayTokenFromUrl();
    let cancelled = false;

    const fallback = window.setTimeout(() => {
      if (!cancelled) {
        window.location.replace(flyerDisplayLoginPath());
      }
    }, 8000);

    void (async () => {
      try {
        const res = await fetch("/api/admin/me", {
          credentials: "include",
          headers: displayAuthHeaders(),
        });
        if (cancelled) return;
        window.clearTimeout(fallback);
        if (res.ok) {
          window.location.replace(flyerDisplayShowPath());
          return;
        }
        if (getDisplayToken()) {
          const flyers = await fetch("/api/admin/store-flyers", {
            credentials: "include",
            headers: displayAuthHeaders(),
          });
          if (flyers.ok) {
            window.location.replace(flyerDisplayShowPath());
            return;
          }
        }
        window.location.replace(flyerDisplayLoginPath());
      } catch {
        if (cancelled) return;
        window.clearTimeout(fallback);
        window.location.replace(flyerDisplayLoginPath());
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-white/70">Loading…</p>
    </div>
  );
}

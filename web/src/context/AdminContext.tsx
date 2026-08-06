"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AdminSession, StoreSettings } from "@/lib/types";

type ActiveStore = Pick<
  StoreSettings,
  "id" | "storeName" | "storeSlug" | "storeLogoUrl"
>;

interface AdminContextValue {
  session: AdminSession | null;
  activeStore: ActiveStore | null;
  loading: boolean;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
  enterStore: (storeId: string) => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [activeStore, setActiveStore] = useState<ActiveStore | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/me", { credentials: "include" });
    if (!res.ok) {
      setSession(null);
      setActiveStore(null);
      return false;
    }
    const data = await res.json();
    setSession(data.session ?? null);
    setActiveStore(data.activeStore ?? null);
    return true;
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    const isPublicPath =
      pathname === "/" ||
      pathname === "/login" ||
      pathname === "/signup" ||
      pathname === "/pricing" ||
      pathname === "/billing" ||
      pathname === "/checkout" ||
      pathname.startsWith("/checkout/") ||
      pathname === "/admin/login" ||
      pathname === "/store/login" ||
      pathname === "/stores" ||
      pathname.startsWith("/display") ||
      pathname.startsWith("/embed") ||
      pathname.startsWith("/s/");
    if (isPublicPath) return;
    if (!session) {
      router.replace("/login");
      return;
    }

    if (
      session.role === "store" &&
      pathname.startsWith("/admin")
    ) {
      fetch("/api/admin/me", { credentials: "include" })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          if (data.session?.role === "store" && data.subscriptionActive === false) {
            router.replace("/billing");
          }
        })
        .catch(() => {});
    }

    const platformDashboardPaths = [
      "/admin/stores",
      "/admin/account",
      "/admin/feedback",
      "/admin/reports",
    ];
    if (
      session.role === "platform" &&
      !activeStore &&
      pathname !== "/admin/login" &&
      !platformDashboardPaths.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      )
    ) {
      router.replace("/admin/stores");
    }
  }, [loading, session, activeStore, pathname, router]);

  const logout = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setSession(null);
    setActiveStore(null);
    const dest = session?.role === "platform" ? "/admin/login" : "/login";
    router.replace(dest);
  }, [router, session?.role]);

  const enterStore = useCallback(
    async (storeId: string) => {
      const res = await fetch("/api/admin/session/store", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) throw new Error("Could not enter store");
      const ok = await refresh();
      if (!ok) throw new Error("Could not enter store");
      router.push("/admin");
    },
    [refresh, router],
  );

  const value = useMemo(
    () => ({
      session,
      activeStore,
      loading,
      refresh,
      logout,
      enterStore,
    }),
    [session, activeStore, loading, refresh, logout, enterStore],
  );

  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdmin must be used within AdminProvider");
  }
  return ctx;
}

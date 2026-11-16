"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StaffAssistant } from "@/components/admin/StaffAssistant";
import { StaffGate } from "@/components/admin/StaffGate";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import { useAdmin } from "@/context/AdminContext";

const STORE_TABS = [
  { href: "/admin", label: "Orders", exact: true },
  {
    href: "/admin/pricing",
    label: "Pricing",
    match: [
      "/admin/pricing",
      "/admin/rules",
      "/admin/percentages",
      "/admin/conditions",
      "/admin/providers",
      "/admin/v2/staff-confirmation",
      "/admin/v2/knowledge",
    ],
  },
  { href: "/admin/pickups", label: "Pickups", match: ["/admin/pickups"] },
  { href: "/admin/tokens", label: "Tokens", match: ["/admin/tokens"] },
  { href: "/admin/tickets", label: "Register", match: ["/admin/tickets"] },
  {
    href: "/admin/reports",
    label: "Reports",
    match: [
      "/admin/reports",
      "/admin/customers",
      "/admin/inventory",
      "/admin/purchases",
    ],
  },
  { href: "/admin/settings", label: "Settings", match: ["/admin/settings", "/admin/calendar"] },
];

const CLERK_TABS = STORE_TABS.map((tab) =>
  tab.href === "/admin/settings"
    ? { href: "/admin/calendar", label: "Calendar", match: ["/admin/calendar"] }
    : tab,
);

const IDLE_LOCK_MS = 30 * 60 * 1000;

/** Locks the counter back to "Who's working?" after a stretch with no taps or keys. */
function useIdleStaffLock(active: boolean, lock: () => Promise<void>) {
  const lastActivity = useRef(0);
  useEffect(() => {
    if (!active) return;
    lastActivity.current = Date.now();
    const touch = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_LOCK_MS) void lock();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [active, lock]);
}

function isTabActive(
  pathname: string,
  tab: { href: string; exact?: boolean; match?: string[] },
): boolean {
  if (tab.match) {
    return tab.match.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  }
  if (tab.exact) return pathname === tab.href;
  return pathname.startsWith(tab.href);
}

export function AdminLayout({
  children,
  showStoreTabs = true,
}: {
  children: React.ReactNode;
  showStoreTabs?: boolean;
}) {
  const pathname = usePathname();
  const { session, activeStore, staff, isOwner, loading, logout, signOutStaff } = useAdmin();

  const storeName = activeStore?.storeName ?? "Buyback Admin";
  const logoUrl = activeStore?.storeLogoUrl;

  const inStoreContext = Boolean(activeStore);
  const isPlatformInStore = session?.role === "platform" && inStoreContext;
  const needsStaff = session?.role === "store" && inStoreContext && !staff;
  const tabs = isOwner ? STORE_TABS : CLERK_TABS;

  useIdleStaffLock(Boolean(staff), signOutStaff);

  return (
    <div className="storefront-theme admin-theme min-h-screen bg-[var(--ink-850)] text-[var(--text)]">
      <header className="border-b border-[var(--line-subtle)] bg-[var(--ink-800)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <Link
            href={session?.role === "platform" ? "/admin/stores" : "/admin"}
            className="flex min-w-0 items-center gap-3"
          >
            <StoreBrandMark
              storeName={storeName}
              logoUrl={logoUrl}
              variant="header"
              subtitle={
                session?.role === "platform" && !activeStore
                  ? "Platform Admin"
                  : inStoreContext
                    ? "Store Admin"
                    : "Buyback Admin"
              }
            />
          </Link>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            {session?.role === "platform" && activeStore && (
              <Link
                href="/admin/stores"
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[var(--text)] hover:border-[var(--line-strong)] hover:text-[var(--text-hi)]"
              >
                All stores
              </Link>
            )}
            {session?.role === "platform" && !activeStore && (
              <>
                <Link
                  href="/admin/account"
                  className="text-[var(--text)] hover:text-[var(--text-hi)]"
                >
                  Account
                </Link>
                <Link
                  href="/admin/feedback"
                  className="text-[var(--accent)] hover:text-[var(--accent-hi)] hover:underline"
                >
                  Feedback
                </Link>
              </>
            )}
            {session?.role === "store" && isOwner && !needsStaff && (
              <Link
                href="/billing"
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[var(--text)] hover:border-[var(--line-strong)] hover:text-[var(--text-hi)]"
              >
                Manage subscription
              </Link>
            )}
            {staff ? (
              <>
                <span className="text-[var(--text-hi)]">
                  {staff.name}
                  <span className="text-[var(--text-lo)]">{staff.role === "owner" ? " · owner" : " · clerk"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void signOutStaff()}
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[var(--text)] hover:border-[var(--line-strong)] hover:text-[var(--text-hi)]"
                >
                  Switch user
                </button>
              </>
            ) : (
              !isPlatformInStore && (
                <span className="hidden text-[var(--text-lo)] sm:inline">{session?.email}</span>
              )
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="text-[var(--text)] hover:text-[var(--text-hi)]"
            >
              Sign out
            </button>
          </div>
        </div>
        {activeStore && !needsStaff ? <StaffAssistant /> : null}
        {showStoreTabs && activeStore && !needsStaff && (
          <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3">
            {tabs.map((tab) => {
              const active = isTabActive(pathname, tab);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold uppercase tracking-wide transition ${
                    active
                      ? "bg-[var(--accent)] text-[var(--ink-900)]"
                      : "text-[var(--text-lo)] hover:bg-[var(--ink-750)] hover:text-[var(--text-hi)]"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        {loading ? null : needsStaff ? <StaffGate /> : children}
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const { session, activeStore, logout } = useAdmin();

  const storeName = activeStore?.storeName ?? "Buyback Admin";
  const logoUrl = activeStore?.storeLogoUrl;

  const inStoreContext = Boolean(activeStore);
  const isPlatformInStore = session?.role === "platform" && inStoreContext;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
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
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
              >
                All stores
              </Link>
            )}
            {session?.role === "platform" && !activeStore && (
              <>
                <Link
                  href="/admin/account"
                  className="text-slate-600 hover:text-slate-900"
                >
                  Account
                </Link>
                <Link
                  href="/admin/feedback"
                  className="text-indigo-600 hover:underline"
                >
                  Feedback
                </Link>
              </>
            )}
            {session?.role === "store" && (
              <Link
                href="/billing"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
              >
                Manage subscription
              </Link>
            )}
            {!isPlatformInStore && (
              <span className="hidden text-slate-500 sm:inline">{session?.email}</span>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="text-slate-600 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
        {showStoreTabs && activeStore && (
          <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
            {STORE_TABS.map((tab) => {
              const active = isTabActive(pathname, tab);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

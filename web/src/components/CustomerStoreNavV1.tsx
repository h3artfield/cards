"use client";

import Link from "next/link";

export type CustomerStoreNavTab = "dashboard" | "shop" | "events" | "decks";

/**
 * The four places a customer at a store actually goes.
 *
 * One tab strip on the dashboard, the shop, the calendar and the deck list so
 * Events is not a link you only find if you already know the calendar exists.
 * Events is always shown: if the store has not published a calendar yet, the
 * calendar page says so rather than hiding the tab and pretending events do
 * not exist.
 */
export function CustomerStoreNavV1({
  slug,
  active,
  loggedIn = true,
  variant = "dark",
}: {
  slug: string;
  active: CustomerStoreNavTab;
  loggedIn?: boolean;
  variant?: "dark" | "light";
}) {
  const store = encodeURIComponent(slug);
  const decksHref = loggedIn
    ? `/s/${store}/decks`
    : `/sign-in?store=${store}&return=${encodeURIComponent(`/s/${store}/decks`)}`;

  const tabs: { id: CustomerStoreNavTab; label: string; href: string }[] = [
    { id: "dashboard", label: "Dashboard", href: `/s/${store}` },
    { id: "shop", label: "Shop", href: `/s/${store}/inventory` },
    { id: "events", label: "Events", href: `/s/${store}/calendar` },
    { id: "decks", label: "My decks", href: decksHref },
  ];

  const activeClass =
    variant === "light"
      ? "border-indigo-600 text-indigo-700"
      : "border-[var(--accent)] text-[var(--accent-hi)]";
  const inactiveClass =
    variant === "light"
      ? "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
      : "border-transparent text-[var(--text-lo)] hover:border-[var(--line)] hover:text-[var(--text-hi)]";

  return (
    <nav
      className={`flex flex-wrap justify-center gap-x-2 gap-y-1 border-b pb-1 ${
        variant === "light" ? "border-gray-200" : "border-[var(--line-subtle)]"
      }`}
      aria-label="Store"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-3 text-xs font-semibold uppercase tracking-wide transition sm:px-4 sm:text-sm ${
            tab.id === active ? activeClass : inactiveClass
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

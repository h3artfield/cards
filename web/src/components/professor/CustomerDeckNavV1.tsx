"use client";

import Link from "next/link";

/**
 * The way out.
 *
 * The Professor screens had no link back to anywhere: once a customer entered
 * the setup screen or a build, the only exits were the browser's back button
 * and the address bar. One component rather than a link pasted into each page,
 * so the wording and the placement cannot drift.
 */
export function CustomerDeckNavV1({
  slug,
  /** Suppressed on the decks list itself, where it would point at the page. */
  showDecks = true,
}: {
  slug: string;
  showDecks?: boolean;
}) {
  const store = encodeURIComponent(slug);
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Link href={`/s/${store}`} className="professor-mtg-link text-xs">
        ← Dashboard
      </Link>
      {showDecks ? (
        <Link href={`/s/${store}/decks`} className="professor-mtg-link text-xs">
          My decks
        </Link>
      ) : null}
      <Link href={`/s/${store}/inventory`} className="professor-mtg-link text-xs">
        Shop
      </Link>
    </nav>
  );
}

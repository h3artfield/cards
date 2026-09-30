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
  const linkClass =
    "professor-mtg-link inline-flex min-h-11 items-center text-xs";

  return (
    <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link href={`/s/${store}`} className={linkClass}>
        ← Dashboard
      </Link>
      {showDecks ? (
        <Link href={`/s/${store}/decks`} className={linkClass}>
          My decks
        </Link>
      ) : null}
      <Link href={`/s/${store}/inventory`} className={linkClass}>
        Shop
      </Link>
      <Link href={`/s/${store}/calendar`} className={linkClass}>
        Events
      </Link>
      <Link href={`/s/${store}/collection`} className={linkClass}>
        My collection
      </Link>
    </nav>
  );
}

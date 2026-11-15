"use client";

import { pickDistinctRoleHeadlinesV1 } from "@/lib/professor-deck-editor/semantic-labels-v1";
import { useState } from "react";
import type { DeckDistributionV1 } from "./distribution-v1";

/**
 * The board's shape along the current grouping axis.
 *
 * Two layouts, because the axis decides which reading is useful. A mana curve
 * has to be vertical — the shape across the columns *is* the information, and
 * you judge it the way you judge a skyline. The ranked axes carry labels like
 * "Card advantage" that no vertical column can caption, so those lie down and
 * put the label where there is room for it.
 *
 * Clicking a bar focuses that group, which is what makes this a control rather
 * than a readout: read the curve, spot the clog, click it, cut from exactly
 * those cards.
 */

export function DeckDistributionStrip({
  distribution,
  axisLabel,
  focused,
  onFocus,
  embedded = false,
  compact = false,
}: {
  distribution: DeckDistributionV1;
  axisLabel: string;
  focused: string | null;
  onFocus: (key: string | null) => void;
  /** Compact layout for the deck hero header. */
  embedded?: boolean;
  /** Five headline numbers; the full chart waits behind a button. */
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(embedded && !compact);
  const { bars, measures, total, foldedGroups, ordered } = distribution;
  const peak = Math.max(...bars.map((bar) => bar.count), 1);

  // "Other" is a fold of many groups, so focusing it would mean nothing.
  const focusable = (key: string) => key !== "__other__";

  const counted = (count: number) => {
    if (count !== 1) return `${count} ${measures}`;
    return measures === "cards" ? "1 card" : "1 entry";
  };

  const headline = pickDistinctRoleHeadlinesV1(
    bars.filter((bar) => bar.key !== "__other__"),
    (bar) => bar.label,
    5,
  );

  if (compact && !expanded) {
    return (
      <div className="deck-editor-hero__distribution-strip deck-editor-hero__distribution-strip--compact">
        <div className="flex items-center gap-2">
          <span className="professor-mtg-label text-[10px]">Deck profile</span>
          <span className="flex-1" />
          <button
            type="button"
            className="professor-mtg-link text-[10px]"
            onClick={() => setExpanded(true)}
          >
            See full breakdown
          </button>
        </div>
        <ul className="deck-profile-compact">
          {headline.map((bar) => (
            <li key={bar.key}>
              <button
                type="button"
                disabled={!focusable(bar.key)}
                className={`deck-profile-compact__item${focused === bar.key ? " deck-profile-compact__item--on" : ""}`}
                onClick={() => onFocus(focused === bar.key ? null : bar.key)}
              >
                <span>{bar.label}</span>
                <span className="tabular-nums">{bar.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "deck-editor-hero__distribution-strip"
          : "border-b border-[var(--mtg-stone-border)] bg-[var(--ink-800)] px-4 py-2 sm:px-5"
      }
    >
      <div className="flex items-center gap-2">
        <span className="professor-mtg-label text-[10px]">{axisLabel} shape</span>
        <span className="professor-mtg-muted text-[10px] tabular-nums">
          {counted(total)}
          {foldedGroups > 0 ? ` · ${foldedGroups} more folded into Other` : ""}
        </span>
        <span className="flex-1" />
        {focused ? (
          <button
            type="button"
            className="professor-mtg-icon-btn text-[10px]"
            onClick={() => onFocus(null)}
          >
            Clear focus
          </button>
        ) : null}
        {compact || !embedded ? (
          <button
            type="button"
            className="professor-mtg-icon-btn text-[10px]"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        ) : null}
      </div>

      {ordered ? (
        <ul
          className={`mt-1.5 flex min-h-0 flex-1 items-end gap-1 ${embedded ? "deck-editor-hero__distribution-bars" : ""}`}
          style={{ height: embedded ? undefined : expanded ? "7rem" : "2.5rem" }}
        >
          {bars.map((bar) => {
            const on = focused === bar.key;
            return (
              <li key={bar.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <button
                  type="button"
                  disabled={!focusable(bar.key)}
                  aria-pressed={on}
                  title={`${bar.label} — ${counted(bar.count)}`}
                  onClick={() => onFocus(on ? null : bar.key)}
                  className="flex h-full w-full flex-col justify-end"
                >
                  {expanded ? (
                    <span className="professor-mtg-muted mb-0.5 text-center text-[10px] tabular-nums">
                      {bar.count}
                    </span>
                  ) : null}
                  <span
                    className={`block w-full rounded-t transition ${
                      on ? "bg-[var(--accent)]" : "bg-[var(--accent-lo)] hover:bg-[var(--accent)]"
                    }`}
                    // Percentage of the peak, with a visible floor so a group
                    // of one is still a target you can hit with a pointer.
                    style={{ height: `${Math.max((bar.count / peak) * 100, 6)}%` }}
                  />
                </button>
                <span
                  className={`mt-1 block truncate text-center text-[9px] leading-tight ${
                    on ? "text-[var(--accent-hi)]" : "text-[var(--text-lo)]"
                  }`}
                  title={bar.label}
                >
                  {shortLabel(bar.label)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul
          className={`mt-1.5 min-h-0 flex-1 ${
            embedded
              ? "deck-editor-hero__distribution-rows overflow-y-auto pr-0.5"
              : "space-y-0.5"
          }`}
        >
          {(expanded || embedded ? bars : bars.slice(0, 4)).map((bar) => {
            const on = focused === bar.key;
            return (
              <li key={bar.key}>
                <button
                  type="button"
                  disabled={!focusable(bar.key)}
                  aria-pressed={on}
                  title={`${bar.label} — ${counted(bar.count)}`}
                  onClick={() => onFocus(on ? null : bar.key)}
                  className="flex w-full items-center gap-2"
                >
                  <span
                    className={`shrink-0 truncate text-left text-[10px] ${
                      embedded ? "w-36 sm:w-44" : "w-28"
                    } ${
                      on ? "text-[var(--accent-hi)]" : "text-[var(--text-lo)]"
                    }`}
                  >
                    {bar.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block rounded-sm transition ${
                        embedded ? "h-3" : "h-2"
                      } ${
                        on ? "bg-[var(--accent)]" : "bg-[var(--accent-lo)] hover:bg-[var(--accent)]"
                      }`}
                      style={{ width: `${Math.max((bar.count / peak) * 100, 2)}%` }}
                    />
                  </span>
                  <span className="professor-mtg-muted w-6 shrink-0 text-right text-[10px] tabular-nums">
                    {bar.count}
                  </span>
                </button>
              </li>
            );
          })}
          {!expanded && bars.length > 4 ? (
            <li className="professor-mtg-muted pl-1 text-[10px]">
              +{bars.length - 4} more — expand to see them
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

/**
 * Section labels are written for headings, which are wider than a bar.
 *
 * Trimming the shared prefix keeps a mana curve reading "0 1 2 3" instead of
 * four columns all captioned "Mana val…".
 */
function shortLabel(label: string): string {
  return label
    .replace(/^Mana value\s*/i, "")
    .replace(/^Colour\s*/i, "")
    .replace(/^Untagged\s*[—-]\s*/i, "");
}

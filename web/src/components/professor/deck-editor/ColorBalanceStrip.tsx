"use client";

import type { DeckColorBalanceV1 } from "@/lib/professor-deck-editor/color-balance-v1";

export function ColorBalanceStrip({
  balance,
  compact = false,
}: {
  balance: DeckColorBalanceV1;
  compact?: boolean;
}) {
  if (!balance.rows.length) return null;
  return (
    <div className={`deck-color-balance${compact ? " deck-color-balance--compact" : ""}`}>
      {!compact ? <p className="professor-mtg-label text-[10px]">Color balance</p> : null}
      <ul className="deck-color-balance__rows">
        {balance.rows.map((row) => (
          <li
            key={row.color}
            className={row.thin ? "deck-color-balance__row deck-color-balance__row--thin" : "deck-color-balance__row"}
            title={`${row.label}: ${row.demand} demand / ${row.sources} sources`}
          >
            <span className="deck-color-balance__pip">{row.color}</span>
            <span className="tabular-nums">
              {row.demand}/{row.sources}
            </span>
          </li>
        ))}
      </ul>
      {balance.warning ? <p className="deck-color-balance__warn">{balance.warning}</p> : null}
    </div>
  );
}

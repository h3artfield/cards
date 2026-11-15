"use client";

import { useMemo, useState } from "react";
import type { TokenCardV1 } from "@/lib/token-creator/design-v1";
import { TOKEN_SET_INDEX_V1 } from "@/lib/token-creator/set-index-v1";
import { applyTokenSetTemplateV1, type TokenSetIndexEntryV1 } from "@/lib/token-creator/set-templates-v1";
import { TokenCardCanvasV1 } from "./TokenCardCanvasV1";
import { TokenSetBlankV1 } from "./TokenSetBlankV1";
import { useTokenSetSampleV1 } from "./useTokenSetSampleV1";

const ERA_LABEL: Record<string, string> = {
  "2015": "Modern token frame",
  "2003": "2003-era token frame",
  "1997": "Classic frame",
  "1993": "Classic frame",
};

const FIRST_ROWS = 12;

function SetTile({
  set,
  card,
  on,
  onChange,
}: {
  set: TokenSetIndexEntryV1;
  card: TokenCardV1;
  on: boolean;
  onChange: (card: TokenCardV1) => void;
}) {
  const sample = useTokenSetSampleV1(set.code, card);
  const styled = applyTokenSetTemplateV1({ ...card, frameColors: sample?.colors ?? null }, set);
  return (
    <button
      type="button"
      className={`token-set${on ? " token-set--on" : ""}`}
      aria-pressed={on}
      onClick={() => onChange(styled)}
      title={set.setting ? `${set.name}: ${set.setting}` : set.name}
    >
      <span className="token-set__preview" title={sample?.name ? `A real ${set.name} ${sample.name}, art removed` : undefined}>
        {sample ? (
          <TokenSetBlankV1 set={set} sample={sample} width={104} />
        ) : (
          <TokenCardCanvasV1 card={styled} width={104} label={`Your token in the ${set.name} template`} />
        )}
      </span>
      <span className="token-set__name">{set.name}</span>
      <span className="token-set__meta">
        {set.released.slice(0, 4)} · {set.effect === "fullart" ? "Full-art tokens" : ERA_LABEL[set.era]}
      </span>
    </button>
  );
}

/**
 * Styles the card after a Magic set's tokens, so a custom token can sit next to
 * the cards that make it: the set's frame era, layout and art direction.
 */
export function TokenSetPickerV1({ card, onChange }: { card: TokenCardV1; onChange: (card: TokenCardV1) => void }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const current = card.setCode ? TOKEN_SET_INDEX_V1.find((s) => s.code === card.setCode) : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOKEN_SET_INDEX_V1;
    return TOKEN_SET_INDEX_V1.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.includes(q) ||
        s.code.slice(1) === q ||
        s.released.startsWith(q) ||
        (s.setting ?? "").toLowerCase().includes(q),
    );
  }, [query]);
  const shown = all || query.trim() ? matches : matches.slice(0, FIRST_ROWS);

  return (
    <section>
      <h3 className="token-section-title">Pick a set&apos;s design</h3>
      <p className="professor-mtg-muted mb-3 text-[12px]">
        Any set works for any token. Each tile shows a real token from that set with its art removed, so you can see
        its frame: the name bar, type line, rules box and P/T. Pick one and your token is built in that design.
        {current ? (
          <>
            {" "}
            Using the <strong>{current.name}</strong> design.
          </>
        ) : null}
      </p>
      <input
        className="token-input token-input--sm mb-3"
        type="search"
        placeholder="Search sets: Bloomburrow, Duskmourn, 2019, FDN…"
        aria-label="Search Magic sets"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="token-set-grid">
        {shown.map((set) => (
          <SetTile key={set.code} set={set} card={card} on={card.setCode === set.code} onChange={onChange} />
        ))}
      </div>
      {matches.length === 0 ? <p className="professor-mtg-muted text-[12px]">No set matches “{query}”.</p> : null}
      {!query.trim() && !all && matches.length > FIRST_ROWS ? (
        <button type="button" className="token-link mt-2" onClick={() => setAll(true)}>
          Show all {matches.length} sets
        </button>
      ) : null}
      <p className="professor-mtg-muted mt-2 text-[10px]">
        Real tokens from Scryfall, shown for reference only. Your printed card is drawn by us in the same layout; no
        Wizards of the Coast artwork, set symbols or logos are printed.
      </p>
    </section>
  );
}

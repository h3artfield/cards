"use client";

import { useMemo, useState } from "react";

type DeckCard = {
  name: string;
  copies?: number;
  oracleId?: string;
  primaryRole?: string;
  primaryArchitectRequirement?: string;
  secondaryRoles?: string[];
  whyInThisDeck?: string;
  structuralNecessity?: string;
};

type ConstructedDeck = {
  commander?: { name: string };
  lands?: DeckCard[];
  nonlands?: DeckCard[];
  primaryWinPaths?: string[];
  secondaryWinPaths?: string[];
  expectedPlayPattern?: string;
};

const TYPE_ORDER = [
  "Nonlands",
  "Lands",
] as const;

export function ProfessorSolDirectedDeckPanel({
  constructedDeck,
  architectPlan,
  headProfessor,
}: {
  constructedDeck: Record<string, unknown> | null;
  architectPlan: Record<string, unknown> | null;
  headProfessor: {
    requiredChanges: string[];
    optionalChanges: string[];
    reasoningSummary: string;
  } | null;
}) {
  const deck = constructedDeck as ConstructedDeck | null;
  const [expanded, setExpanded] = useState<string | null>(null);

  const gamePlan = architectPlan?.gamePlan as
    | { earlyGame?: string[]; midGame?: string[]; lateGame?: string[] }
    | undefined;

  const sections = useMemo(() => {
    if (!deck) return [];
    const nonlands = [...(deck.nonlands ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const lands = [...(deck.lands ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const out: Array<{ title: string; cards: DeckCard[] }> = [];
    if (nonlands.length) out.push({ title: "Nonlands", cards: nonlands });
    if (lands.length) out.push({ title: "Lands", cards: lands });
    return out;
  }, [deck]);

  if (!deck) return null;

  return (
    <div className="space-y-8">
      {(gamePlan || deck.primaryWinPaths?.length) && (
        <div className="professor-brew-brutal-card p-6 sm:p-8">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">Strategy</h2>
          {gamePlan?.earlyGame?.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-neutral-600">Early game</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                {gamePlan.earlyGame.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {gamePlan?.midGame?.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-neutral-600">Mid game</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                {gamePlan.midGame.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {gamePlan?.lateGame?.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-neutral-600">Late game</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                {gamePlan.lateGame.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {deck.primaryWinPaths?.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-neutral-600">Primary win paths</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                {deck.primaryWinPaths.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {deck.secondaryWinPaths?.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-neutral-600">Secondary win paths</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                {deck.secondaryWinPaths.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {deck.commander?.name ? (
        <div className="professor-brew-brutal-card p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-neutral-600">Commander</p>
          <p className="mt-1 text-base font-bold text-[#f3efe4]">{deck.commander.name}</p>
        </div>
      ) : null}

      {sections.map((section) => (
        <div key={section.title} className="professor-brew-brutal-card p-6">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
            {section.title} ({section.cards.length})
          </h2>
          <ul className="mt-4 space-y-2">
            {section.cards.map((card) => {
              const key = `${section.title}-${card.name}-${card.copies ?? 1}`;
              const open = expanded === key;
              return (
                <li key={key} className="border-b border-neutral-800/80 pb-2 last:border-0">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                    onClick={() => setExpanded(open ? null : key)}
                  >
                    <span className="font-semibold text-[#f3efe4]">
                      {card.name}
                      {(card.copies ?? 1) > 1 ? ` ×${card.copies}` : ""}
                    </span>
                    <span className="text-xs text-neutral-600">{open ? "−" : "+"}</span>
                  </button>
                  {open ? (
                    <div className="mt-2 space-y-1 text-xs text-neutral-400">
                      {card.primaryRole ? <p>Primary role: {card.primaryRole}</p> : null}
                      {card.primaryArchitectRequirement ? (
                        <p>Architect requirement: {card.primaryArchitectRequirement}</p>
                      ) : null}
                      {card.secondaryRoles?.length ? (
                        <p>Secondary roles: {card.secondaryRoles.join(", ")}</p>
                      ) : null}
                      {card.whyInThisDeck ? <p className="text-neutral-300">{card.whyInThisDeck}</p> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {headProfessor &&
      (headProfessor.requiredChanges.length > 0 || headProfessor.optionalChanges.length > 0) ? (
        <div className="professor-brew-brutal-card p-6">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">Professor suggestions</h2>
          {headProfessor.requiredChanges.length > 0 ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase text-red-400">Required changes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                {headProfessor.requiredChanges.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {headProfessor.optionalChanges.length > 0 ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase text-neutral-500">Optional changes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                {headProfessor.optionalChanges.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { formatPlanCheckSummary } from "@/lib/deck-rating/v1/goldfish-engine-v1";

type Row = {
  id: string;
  name: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  speed: number | null;
  planRate: number | null;
  resilience: number | null;
  synergy: number | null;
  planValid: boolean | null;
  namedLineRate: number | null;
  namedLineSpeed: number | null;
  score: string | null;
  legacyNamedLineScore: string | null;
  executionScore: string | null;
  pendingReason: string | null;
  scoreDigitsPublished: boolean;
};

const BRACKETS = [1, 2, 3, 4, 5] as const;

function ownTurn(value: number | null): string {
  return value == null ? "—" : `T${value}`;
}

export function CalculatedDecksApp() {
  const [decks, setDecks] = useState<Row[]>([]);
  const [bracket, setBracket] = useState<number | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function pull() {
      try {
        const res = await fetch("/api/experimental/calculated-decks", { cache: "no-store" });
        const body = (await res.json()) as { decks?: Row[] };
        if (!stopped) {
          setDecks(body.decks ?? []);
          setError(null);
        }
      } catch {
        if (!stopped) setError("The calculated deck list could not be read.");
      }
    }
    void pull();
    const timer = setInterval(() => void pull(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const shown = useMemo(() => {
    const rows = bracket === "all" ? decks : decks.filter((row) => row.bracket === bracket);
    return [...rows].sort((a, b) => {
      if (a.bracket !== b.bracket) return a.bracket - b.bracket;
      const aRate = a.namedLineRate ?? a.planRate ?? -1;
      const bRate = b.namedLineRate ?? b.planRate ?? -1;
      if (bRate !== aRate) return bRate - aRate;
      const aSpeed = a.namedLineSpeed ?? a.speed ?? 99;
      const bSpeed = b.namedLineSpeed ?? b.speed ?? 99;
      if (aSpeed !== bSpeed) return aSpeed - bSpeed;
      return a.name.localeCompare(b.name);
    });
  }, [bracket, decks]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="text-xs uppercase tracking-widest text-amber-400">Calculated decks</div>
        <h1 className="text-2xl font-semibold">Deck scores</h1>
        <p className="max-w-3xl text-sm text-neutral-400">
          Bracket digit is live. Last three digits stay as <span className="text-neutral-200">B···</span> until
          the threat-by-clock statistic is frozen and that band passes its gate. Side columns are not part of the
          score.{" "}
          <Link href="/experimental/grading" className="text-amber-400 hover:text-amber-300">
            How grading works
          </Link>
        </p>
      </header>
      <main className="px-6 py-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <BracketButton active={bracket === "all"} onClick={() => setBracket("all")} label="All brackets" />
          {BRACKETS.map((value) => (
            <BracketButton key={value} active={bracket === value} onClick={() => setBracket(value)} label={`Bracket ${value}`} />
          ))}
        </div>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        {shown.length === 0 ? (
          <p className="text-sm text-neutral-400">No calculated decks in this bracket yet.</p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-xs uppercase tracking-widest text-neutral-500">
                <th className="py-2 pr-4 font-medium">Score</th>
                <th className="py-2 pr-4 font-medium">Commander</th>
                <th className="py-2 pr-4 font-medium">Bracket</th>
                <th className="py-2 pr-4 font-medium">Speed</th>
                <th className="py-2 pr-4 font-medium">Plan check</th>
                <th className="py-2 pr-4 font-medium">Resilience</th>
                <th className="py-2 font-medium">Synergy</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const rate = row.namedLineRate ?? row.planRate;
                const lineSpeed = row.namedLineSpeed ?? row.speed;
                const planSummary = formatPlanCheckSummary({
                  planValid: row.planValid,
                  namedLineRate: rate,
                  namedLineSpeed: lineSpeed,
                });
                const open = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="cursor-pointer border-b border-neutral-900 hover:bg-neutral-900/60"
                      onClick={() => setExpanded(open ? null : row.id)}
                    >
                      <td className="py-3 pr-4 font-semibold tracking-wide text-amber-200/90">
                        {row.score ?? `${row.bracket}···`}
                      </td>
                      <td className="py-3 pr-4">{row.name}</td>
                      <td className="py-3 pr-4">{row.bracket}</td>
                      <td className="py-3 pr-4">{ownTurn(row.speed)}</td>
                      <td className="py-3 pr-4">{planSummary}</td>
                      <td className="py-3 pr-4">{row.resilience == null ? "—" : `${Math.round(row.resilience * 100)}%`}</td>
                      <td className="py-3 text-neutral-500">—</td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-neutral-900 bg-neutral-900/40">
                        <td colSpan={7} className="px-3 py-3 text-xs leading-5 text-neutral-400">
                          <p className="text-neutral-300">Plan check evidence (not the four-digit score)</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            <li>
                              Valid:{" "}
                              {row.planValid == null ? "—" : row.planValid ? "yes" : "no"}
                            </li>
                            <li>
                              Named-line rate:{" "}
                              {rate == null ? "—" : `${Math.round(rate * 100)}%`}
                            </li>
                            <li>
                              Named-line speed (own turns): {ownTurn(lineSpeed)}
                            </li>
                            <li>
                              Connectivity (legacy field):{" "}
                              {row.synergy == null ? "—" : row.synergy.toFixed(2)}
                            </li>
                            {row.legacyNamedLineScore ? (
                              <li className="text-neutral-500">
                                Legacy named-line stamp (withheld from Score): {row.legacyNamedLineScore}
                              </li>
                            ) : null}
                          </ul>
                          <p className="mt-2 text-neutral-500">
                            Synergy (EDHREC) and Theme fit (RC8) columns land in a later phase. Resilience is reserved.
                          </p>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {shown[0]?.pendingReason ? (
          <p className="mt-4 max-w-3xl text-xs text-neutral-500">{shown[0].pendingReason}</p>
        ) : null}
      </main>
    </div>
  );
}

function BracketButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        props.active
          ? "rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-black"
          : "rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700"
      }
    >
      {props.label}
    </button>
  );
}

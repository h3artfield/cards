"use client";

import { useEffect, useMemo, useState } from "react";
import { PLAN_FIXTURES, type PlanFixtureV1 } from "@/lib/deck-rating/v1/plan-checker-fixtures-v1";
import { planTypeLabel, runPlanChecker, type PlanCheckResultV1, type PlanTrialV1 } from "@/lib/deck-rating/v1/plan-checker-v1";
import {
  PLAN_PILOT_NOTES,
  PLAN_RESILIENCE_SCENARIOS,
  PLAN_SCHEMA_VERSION,
  type PlanCardV1,
  type WinPlanV1,
} from "@/lib/deck-rating/v1/plan-schema-v1";

type LoadedDeck = {
  title: string;
  note: string;
  cards: PlanCardV1[];
  commanders: PlanCardV1[];
  plan: WinPlanV1;
  result: PlanCheckResultV1;
};

const WIN_TYPES = ["poison-combat", "hasty-creatures", "loop-plus-outlet", "combat-damage"] as const;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function turnLabel(trial: PlanTrialV1): string {
  return trial.winTurn == null ? "fail" : `T${trial.winTurn}`;
}

function watcherFresh(watcher: { running?: boolean; beatAt?: string } | undefined): boolean {
  if (!watcher?.running || !watcher.beatAt) return false;
  const beat = Date.parse(watcher.beatAt);
  return Number.isFinite(beat) && Date.now() - beat < 20_000;
}

function collapseActivity(lines: string[]): string[] {
  const collapsed: string[] = [];
  for (const line of lines) {
    if (collapsed[collapsed.length - 1] === line) continue;
    collapsed.push(line);
  }
  return collapsed;
}

function isCard(value: unknown): value is PlanCardV1 {
  if (!value || typeof value !== "object") return false;
  const card = value as PlanCardV1;
  return (
    typeof card.oracleId === "string" &&
    typeof card.name === "string" &&
    typeof card.cmc === "number" &&
    typeof card.power === "number" &&
    typeof card.typeLine === "string" &&
    typeof card.text === "string" &&
    typeof card.quantity === "number"
  );
}

function isPlan(value: unknown): value is WinPlanV1 {
  if (!value || typeof value !== "object") return false;
  const plan = value as WinPlanV1;
  const line = plan.primary;
  return (
    plan.schema === PLAN_SCHEMA_VERSION &&
    line != null &&
    (WIN_TYPES as readonly string[]).includes(line.type) &&
    Array.isArray(line.requiredCards) &&
    Array.isArray(line.tutors) &&
    Array.isArray(line.enablers) &&
    Array.isArray(line.outletCards) &&
    Array.isArray(line.hasteSources)
  );
}

function runFixture(fixture: PlanFixtureV1): LoadedDeck {
  return {
    title: fixture.title,
    note: fixture.note,
    cards: fixture.cards,
    commanders: fixture.commanders,
    plan: fixture.plan,
    result: runPlanChecker({
      cards: fixture.cards,
      commanders: fixture.commanders,
      plan: fixture.plan,
      comboMatches: fixture.comboMatches,
      comboDb: fixture.comboDb ?? "none",
    }),
  };
}

export function PlanCheckerApp() {
  const [deck, setDeck] = useState<LoadedDeck | null>(null);
  const [selectedSeed, setSelectedSeed] = useState(0);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [verifyCombo, setVerifyCombo] = useState(false);
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  const [factory, setFactory] = useState<{
    stage?: string;
    buildStatus?: string | null;
    activity?: string[];
    failure?: string | null;
    note?: string;
    deck?: LoadedDeck | null;
    watcher?: { running?: boolean; beatAt?: string; speed?: number | null; deckTitle?: string | null };
    score?: { display?: string; w?: number | null; reason?: string | null; namedLineWins?: number | null; trials?: number | null; planRate?: number | null } | null;
    factoryLoop?: {
      measured?: number;
      building?: string | null;
      recent?: Array<{ name: string; display: string; speed: number | null; consistency: number | null; synergy: number | null }>;
      next?: string[];
    } | null;
    shown?: {
      name: string;
      winType?: string | null;
      gaps?: string[];
      score?: { display?: string; w?: number | null; reason?: string | null; namedLineWins?: number | null; trials?: number | null } | null;
      scris?: { speed?: number | null; consistency?: number | null; synergy?: number | null } | null;
      explanation?: { mulligans?: string; earlySetup?: string; sequencing?: string; interactions?: string; recovery?: string } | null;
      claim?: { type?: string; summary?: string; howTheyWorkTogether?: string; howTheyWin?: string; requiredCards?: string[]; tutors?: string[]; enablers?: string[] };
    } | null;
    execution?: {
      accepted?: boolean;
      gaps?: string[];
      limits?: string[];
      explanation?: { mulligans?: string; earlySetup?: string; sequencing?: string; interactions?: string; recovery?: string };
      claim?: { type?: string; summary?: string; howTheyWorkTogether?: string; howTheyWin?: string; requiredCards?: string[]; tutors?: string[]; enablers?: string[] };
      played?: null | {
        histogram?: string;
        successes?: number;
        trials?: number;
        speed?: number | null;
        successfulLines?: Array<{ count: number; turn: number; seed: number; line: string }>;
        failedSetups?: Array<{ count: number; reason: string; seed: number; detail: string }>;
        decisions?: string[];
      };
    } | null;
  } | null>(null);

  useEffect(() => {
    let stopped = false;
    async function pull() {
      try {
        const res = await fetch("/api/experimental/plan-factory", { cache: "no-store" });
        const data = await res.json();
        if (stopped) return;
        setFactory(data);
        if (data.deck?.result && data.deck?.plan) {
          setDeck((current) => {
            if (
              current?.title === data.deck.title &&
              current.result.pilot === data.deck.result.pilot &&
              current.result.speed === data.deck.result.speed &&
              current.result.successes === data.deck.result.successes &&
              current.result.synergy.score === data.deck.result.synergy.score &&
              current.note === data.deck.note &&
              current.plan.primary.requiredCards.join() === data.deck.plan.primary.requiredCards.join()
            ) {
              return current;
            }
            return data.deck;
          });
          setSelectedSeed((seed) => {
            const first = data.deck.result.trialsDetail?.find((row: PlanTrialV1) => row.winTurn != null);
            return seed === 0 && first ? first.seed : seed;
          });
        }
      } catch {
        if (!stopped) setFactory({ stage: "unreachable", activity: ["The factory status could not be read."] });
      }
    }
    void pull();
    const timer = setInterval(() => void pull(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const trial = deck?.result.trialsDetail[selectedSeed] ?? null;
  const queueLeft = queueIndex == null ? 0 : PLAN_FIXTURES.length - queueIndex - 1;

  const libraryCount = useMemo(() => {
    if (!deck) return 0;
    return deck.cards.reduce((sum, card) => sum + card.quantity, 0);
  }, [deck]);
  const latest = factory?.shown;
  const latestReplacesDeck = latest != null && latest.name !== deck?.title;

  function show(next: LoadedDeck, seed = 0) {
    setDeck(next);
    const firstWin = next.result.trialsDetail.find((row) => row.winTurn != null);
    setSelectedSeed(firstWin?.seed ?? seed);
  }

  function openFixture(fixture: PlanFixtureV1) {
    setQueueIndex(null);
    show(runFixture(fixture));
  }

  function startQueue() {
    setQueueIndex(0);
    show(runFixture(PLAN_FIXTURES[0]!));
  }

  function advanceQueue() {
    if (queueIndex == null || queueIndex >= PLAN_FIXTURES.length - 1) {
      setQueueIndex(null);
      return;
    }
    const next = queueIndex + 1;
    setQueueIndex(next);
    show(runFixture(PLAN_FIXTURES[next]!));
  }

  function runPaste() {
    setPasteError(null);
    setQueueIndex(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(paste);
    } catch {
      setPasteError("That text is not JSON.");
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      setPasteError("Paste an object with cards, commanders, and plan.");
      return;
    }
    const body = parsed as { title?: string; cards?: unknown; commanders?: unknown; plan?: unknown };
    if (!Array.isArray(body.cards) || !body.cards.every(isCard)) {
      setPasteError("cards must be a list of { oracleId, name, cmc, power, typeLine, text, quantity }.");
      return;
    }
    if (!Array.isArray(body.commanders) || !body.commanders.every(isCard)) {
      setPasteError("commanders must be a list of the same card shape.");
      return;
    }
    if (!isPlan(body.plan)) {
      setPasteError(`plan.schema must be ${PLAN_SCHEMA_VERSION} and primary.type must be one of the four win types.`);
      return;
    }
    show({
      title: body.title?.trim() || "Pasted plan",
      note: "Pasted plan. Checker 1.0.0 plays the primary line only. This page does not read a PDF.",
      cards: body.cards,
      commanders: body.commanders,
      plan: body.plan,
      result: runPlanChecker({
        cards: body.cards,
        commanders: body.commanders,
        plan: body.plan,
        comboMatches: verifyCombo ? () => true : undefined,
        comboDb: verifyCombo ? "pasted-verified" : "none",
      }),
    });
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="text-xs uppercase tracking-widest text-amber-400">Experimental · local only</div>
        <h1 className="text-2xl font-semibold">Plan checker</h1>
        <a href="/experimental/calculated-decks" className="mt-2 inline-block text-sm text-amber-400 hover:text-amber-300">
          Calculated decks
        </a>
        <p className="max-w-3xl text-sm text-neutral-400">
          One deck at a time. The checker plays the primary plan across seeds 0–99 and stamps the pilot, checker, and seed set on the result. Speed is the median winning turn. Fewer than 10 wins leaves speed empty.
        </p>
      </header>

      <main className="grid gap-6 px-6 py-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-widest text-neutral-500">Fixtures</h2>
            <div className="flex flex-col gap-2">
              {PLAN_FIXTURES.map((fixture) => (
                <button
                  key={fixture.id}
                  type="button"
                  onClick={() => openFixture(fixture)}
                  className="rounded bg-neutral-800 px-3 py-2 text-left text-sm hover:bg-neutral-700"
                >
                  {fixture.title}
                </button>
              ))}
              <button type="button" onClick={startQueue} className="rounded bg-amber-500 px-3 py-2 text-sm font-medium text-black">
                Run fixtures one by one
              </button>
            </div>
          </section>

          <label className="flex items-start gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={verifyCombo} onChange={(e) => setVerifyCombo(e.target.checked)} className="mt-1" />
            <span>For a pasted plan only: treat the required cards as a verified combo. Fixtures keep the matcher they already name.</span>
          </label>

          <section>
            <h2 className="mb-2 text-xs uppercase tracking-widest text-neutral-500">Paste plan JSON</h2>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={8}
              placeholder='{"title":"...","cards":[],"commanders":[],"plan":{...}}'
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-xs"
            />
            <button type="button" onClick={runPaste} className="mt-2 rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700">
              Run pasted plan
            </button>
            {pasteError && <p className="mt-2 text-sm text-red-400">{pasteError}</p>}
          </section>
        </aside>

        <section className="space-y-5">
          <div className="rounded border border-neutral-800 px-4 py-3">
            <div className="text-xs uppercase tracking-widest text-amber-400">Factory</div>
            {factory?.factoryLoop?.building ? (
              <>
                <p className="mt-1 text-lg font-semibold">Building {factory.factoryLoop.building}</p>
                <p className="mt-1 text-sm text-neutral-300">
                  {factory.activity?.at(-1) ?? factory.stage ?? "in progress"}
                  {watcherFresh(factory.watcher) ? " · checker is waiting on this build" : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm">
                {watcherFresh(factory?.watcher)
                  ? `Plan checker is running${factory?.watcher?.deckTitle ? ` · ${factory.watcher.deckTitle}` : ""}${factory?.stage ? ` · ${factory.stage}` : ""}`
                  : "Plan checker is not running."}
              </p>
            )}
            {factory?.factoryLoop && (
              <p className="mt-2 text-sm text-neutral-300">
                Field {factory.factoryLoop.measured ?? 0} measured
                {factory.factoryLoop.next?.length
                  ? ` · next ${factory.factoryLoop.next.filter((name) => name !== factory.factoryLoop?.building).slice(0, 3).join(", ")}`
                  : ""}
              </p>
            )}
            {!!factory?.factoryLoop?.recent?.length && (
              <ul className="mt-2 space-y-1 font-mono text-xs text-neutral-400">
                {factory.factoryLoop.recent.map((row) => {
                  const withheld = row.consistency == null && row.speed == null;
                  return (
                    <li key={`${row.name}-${row.display}`}>
                      {withheld ? `not scored · ${row.name}` : `${row.display} ${row.name}`}
                      {row.speed != null ? ` · speed ${row.speed}` : ""}
                      {row.consistency != null ? ` · line ${Math.round(row.consistency * 100)}%` : ""}
                      {row.synergy != null ? ` · synergy ${row.synergy.toFixed(2)}` : ""}
                    </li>
                  );
                })}
              </ul>
            )}
            {!factory?.factoryLoop?.building && factory?.score?.display && (
              <p className="mt-2 text-2xl font-semibold tracking-wide">{factory.score.display}</p>
            )}
            {!factory?.factoryLoop?.building && factory?.score?.reason && (
              <p className="mt-1 text-xs text-neutral-500">{factory.score.reason}</p>
            )}
            {!factory?.factoryLoop?.building && factory?.score?.w != null && (
              <p className="mt-1 text-xs text-neutral-400">
                Named line {factory.score.namedLineWins} of {factory.score.trials} seeds.
              </p>
            )}
            {factory?.failure && <p className="mt-1 text-sm text-red-400">{factory.failure}</p>}
            {!factory?.factoryLoop?.building && factory?.note && (
              <p className="mt-1 text-xs text-neutral-500">{factory.note}</p>
            )}
            {!!factory?.activity?.length && (
              <ol className="mt-2 max-h-32 space-y-1 overflow-auto font-mono text-xs text-neutral-400">
                {collapseActivity(factory.activity).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            )}
          </div>
          {latestReplacesDeck && latest && (
            <div className="rounded border border-neutral-800 p-4 text-sm">
              <h3 className="text-xs uppercase tracking-widest text-amber-400">{latest.name}</h3>
              {latest.score?.display && (
                <p className="mt-2 text-2xl font-semibold tracking-wide">{latest.score.display}</p>
              )}
              <p className="mt-1 text-xs text-neutral-400">
                {latest.winType ?? latest.claim?.type ?? "plan"}
                {latest.scris?.speed != null ? ` · speed ${latest.scris.speed}` : ""}
                {latest.scris?.consistency != null ? ` · line ${Math.round(latest.scris.consistency * 100)}%` : ""}
                {latest.scris?.synergy != null ? ` · synergy ${latest.scris.synergy.toFixed(2)}` : ""}
              </p>
              {latest.score?.reason && !latest.gaps?.length && (
                <p className="mt-1 text-xs text-neutral-500">{latest.score.reason}</p>
              )}
              <p className="mt-2 text-neutral-200">{latest.claim?.summary}</p>
              <p className="mt-1 text-neutral-400">{latest.claim?.howTheyWorkTogether}</p>
              <p className="mt-1 text-neutral-400">{latest.claim?.howTheyWin}</p>
              <dl className="mt-3 space-y-2 text-neutral-300">
                <div><dt className="text-xs uppercase text-neutral-500">Mulligans</dt><dd>{latest.explanation?.mulligans}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Early setup</dt><dd>{latest.explanation?.earlySetup}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Sequencing</dt><dd>{latest.explanation?.sequencing}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Interactions</dt><dd>{latest.explanation?.interactions}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Recovery</dt><dd>{latest.explanation?.recovery}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-neutral-500">
                Required: {latest.claim?.requiredCards?.join(", ") || "none"}. Tutors: {latest.claim?.tutors?.join(", ") || "none"}. Enablers: {latest.claim?.enablers?.join(", ") || "none"}.
              </p>
              {!!latest.gaps?.length && (
                <ul className="mt-3 space-y-1 text-red-300">
                  {latest.gaps.map((gap) => <li key={gap}>{gap}</li>)}
                </ul>
              )}
            </div>
          )}
          {factory?.execution && !latestReplacesDeck && (
            <div className="rounded border border-neutral-800 p-4 text-sm">
              <h3 className="text-xs uppercase tracking-widest text-amber-400">Professor strategy</h3>
              <p className="mt-2 text-neutral-200">{factory.execution.claim?.summary}</p>
              <p className="mt-1 text-neutral-400">{factory.execution.claim?.howTheyWorkTogether}</p>
              <p className="mt-1 text-neutral-400">{factory.execution.claim?.howTheyWin}</p>
              <dl className="mt-3 space-y-2 text-neutral-300">
                <div><dt className="text-xs uppercase text-neutral-500">Mulligans</dt><dd>{factory.execution.explanation?.mulligans}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Early setup</dt><dd>{factory.execution.explanation?.earlySetup}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Sequencing</dt><dd>{factory.execution.explanation?.sequencing}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Interactions</dt><dd>{factory.execution.explanation?.interactions}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Recovery</dt><dd>{factory.execution.explanation?.recovery}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-neutral-500">
                Required: {factory.execution.claim?.requiredCards?.join(", ") || "none"}. Tutors: {factory.execution.claim?.tutors?.join(", ") || "none"}. Enablers: {factory.execution.claim?.enablers?.join(", ") || "none"}.
              </p>
              {!!factory.execution.gaps?.length && (
                <ul className="mt-3 space-y-1 text-red-300">
                  {factory.execution.gaps.map((gap) => <li key={gap}>{gap}</li>)}
                </ul>
              )}
              {!!factory.execution.limits?.length && (
                <ul className="mt-3 space-y-1 text-xs text-neutral-500">
                  {factory.execution.limits.map((limit) => <li key={limit}>{limit}</li>)}
                </ul>
              )}
              {factory.execution.accepted && factory.execution.played && (
                <div className="mt-4 space-y-3">
                  <p>
                    {factory.execution.played.successes} of {factory.execution.played.trials} seeds won.
                    Median turn {factory.execution.played.speed ?? "—"}. Timing {factory.execution.played.histogram}.
                  </p>
                  <div>
                    <h4 className="text-xs uppercase text-neutral-500">Successful lines</h4>
                    <ul className="mt-1 space-y-2 font-mono text-xs text-neutral-300">
                      {factory.execution.played.successfulLines?.map((row) => (
                        <li key={`${row.seed}-${row.line}`}>{row.count} games, example seed {row.seed} turn {row.turn}: {row.line}</li>
                      ))}
                    </ul>
                  </div>
                  {!!factory.execution.played.failedSetups?.length && (
                    <div>
                      <h4 className="text-xs uppercase text-neutral-500">Failed setups</h4>
                      <ul className="mt-1 space-y-1 text-xs text-neutral-300">
                        {factory.execution.played.failedSetups.map((row) => (
                          <li key={row.reason}>{row.count} games: {row.reason}. Seed {row.seed}: {row.detail}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!factory.execution.played.decisions?.length && (
                    <ul className="space-y-1 text-xs text-neutral-500">
                      {factory.execution.played.decisions.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {factory.execution.accepted === false && (
                <p className="mt-3 text-red-300">This claim was not simulated. The numbers below are the previous run, not this strategy.</p>
              )}
            </div>
          )}
          {queueIndex != null && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-700 bg-amber-950/40 px-4 py-3">
              <p className="text-sm">
                Queue {queueIndex + 1} of {PLAN_FIXTURES.length}: {PLAN_FIXTURES[queueIndex]!.title}.{" "}
                {queueLeft > 0 ? `${queueLeft} still waiting, so this run stays on screen.` : "This is the last fixture."}
              </p>
              <button type="button" onClick={advanceQueue} className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-black">
                {queueLeft > 0 ? "Seen — run next" : "Close queue"}
              </button>
            </div>
          )}

          {!deck && (
            <p className="text-neutral-400">
              {watcherFresh(factory?.watcher)
                ? "The checker is running. The score shows up here when a deck is on file."
                : "The checker is not running."}
            </p>
          )}

          {deck && !latestReplacesDeck && (
            <>
              <div>
                {factory?.factoryLoop?.building && factory.factoryLoop.building !== deck.title && (
                  <p className="mb-1 text-xs uppercase tracking-widest text-neutral-500">Last scored deck</p>
                )}
                <h2 className="text-xl font-semibold">{deck.title}</h2>
                <p className="mt-1 max-w-3xl text-sm text-neutral-400">{deck.note}</p>
                <p className="mt-2 text-sm text-neutral-300">
                  {planTypeLabel(deck.plan.primary.type)} · {libraryCount} library cards · commander{" "}
                  {deck.commanders.map((c) => c.name).join(" / ") || "none"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Score
                  label="Speed"
                  value={deck.result.speed == null ? "—" : String(deck.result.speed)}
                  detail={deck.result.speedReason ?? "Median winning turn"}
                />
                <Score
                  label="Consistency"
                  value={pct(deck.result.consistency)}
                  detail={`${deck.result.successes} of ${deck.result.trials} wins`}
                />
                <Score
                  label="Synergy"
                  value={deck.result.synergy.score.toFixed(3)}
                  detail={deck.result.synergy.reason ?? "Equal-weight plan connectivity"}
                />
              </div>

              <div className="rounded border border-neutral-800 p-4">
                <h3 className="text-sm font-medium">Synergy parts</h3>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <Part name="Direct" value={deck.result.synergy.direct} />
                  <Part name="Access" value={deck.result.synergy.access} />
                  <Part name="Enablers" value={deck.result.synergy.enablers} />
                  <Part name="Redundancy" value={deck.result.synergy.redundancy} />
                  <Part name="Verified combo" value={deck.result.synergy.verifiedCombo} />
                </dl>
                <p className="mt-3 text-xs text-neutral-500">
                  Poison and combat drop the verified-combo part and split its weight across the other four. A missing required card, a missing outlet, or an outlet that cannot convert the loop scores 0.
                </p>
              </div>

              <div className="rounded border border-neutral-800 p-4 text-sm">
                <h3 className="font-medium">Stamps</h3>
                <ul className="mt-2 space-y-1 font-mono text-xs text-neutral-300">
                  <li>checker {deck.result.checker}</li>
                  <li>pilot {deck.result.pilot}</li>
                  <li>plan {deck.result.planSchema}</li>
                  <li>seeds {deck.result.seedSet}</li>
                  <li>combo db {deck.result.comboDb}</li>
                </ul>
                <p className="mt-3 text-xs text-neutral-500">
                  Legacy RMST15 (failures counted as turn 15): {deck.result.legacyRmst15.toFixed(3)}. Validation bar only. This is not Speed.
                </p>
                <p className="mt-1 text-xs text-neutral-500">Pilot {deck.result.pilot} plays the primary plan only. Secondary is stored and shown, not simulated.</p>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">100 trials</h3>
                <div className="grid grid-cols-10 gap-1">
                  {deck.result.trialsDetail.map((row) => (
                    <button
                      key={row.seed}
                      type="button"
                      onClick={() => setSelectedSeed(row.seed)}
                      className={`rounded px-1 py-2 text-center text-[11px] ${
                        row.seed === selectedSeed
                          ? "ring-2 ring-white"
                          : ""
                      } ${row.winTurn == null ? "bg-red-950 text-red-200" : "bg-emerald-900 text-emerald-100"}`}
                      title={`Seed ${row.seed}: ${turnLabel(row)}`}
                    >
                      {row.winTurn == null ? "·" : row.winTurn}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-neutral-500">Green cells are the winning turn. Red cells failed. Click a cell for the log.</p>
              </div>

              {trial && (
                <div className="rounded border border-neutral-800 p-4">
                  <h3 className="text-sm font-medium">
                    Seed {trial.seed} · {trial.winTurn == null ? `failed (${trial.failureReason})` : `won on turn ${trial.winTurn}`}
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    Mulligans {trial.mulligans}
                    {trial.mulliganDecisions.length ? ` · ${trial.mulliganDecisions.join(" · ")}` : ""}
                    {" · "}poison {trial.poison} · combat {trial.combatDamage} · commander {trial.commanderDamage}
                  </p>
                  <ol className="mt-3 max-h-64 space-y-1 overflow-auto font-mono text-xs text-neutral-300">
                    {trial.log.map((line, i) => (
                      <li key={`${trial.seed}-${i}`}>{line}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <pre className="overflow-auto rounded border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-300">
                  {JSON.stringify(
                    {
                      primary: deck.plan.primary,
                      secondary: deck.plan.secondary,
                      recovery: deck.plan.recovery,
                      secondaryStatus: "stored, not simulated",
                      recoveryStatus: "never the win",
                    },
                    null,
                    2,
                  )}
                </pre>
                <div className="rounded border border-neutral-800 p-4 text-sm">
                  <h3 className="font-medium">Resilience</h3>
                  <p className="mt-1 text-neutral-400">Locked. Not run in checker 1.0.0. R0 is the speed and consistency run above, and it is not part of a resilience average.</p>
                  <ul className="mt-3 space-y-1 text-xs text-neutral-400">
                    {PLAN_RESILIENCE_SCENARIOS.map((row) => (
                      <li key={row.id}>
                        <span className="font-mono text-neutral-200">{row.id}</span> {row.intervention}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <ul className="space-y-1 text-xs text-neutral-500">
                {PLAN_PILOT_NOTES.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Score({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="text-xs uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-neutral-400">{detail}</div>
    </div>
  );
}

function Part({ name, value }: { name: string; value: number | null }) {
  return (
    <div>
      <dt className="text-neutral-500">{name}</dt>
      <dd className="font-mono">{value == null ? "n/a" : value.toFixed(2)}</dd>
    </div>
  );
}

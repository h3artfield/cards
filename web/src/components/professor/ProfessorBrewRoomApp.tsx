"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  professorBrewCommittedCardCountV47,
  professorBrewIsDraftReadyV47,
  professorBrewIsFinalReviewRunningV48,
  professorBrewNeedsDeckCompletionV416,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
  professorBrewShouldContinueAutoBuildV47,
} from "@/lib/deck-synthesis/professor-brew-progress-v4-7-v1";
import {
  BREW_TREE_MAX_REVEAL_STEP_V42,
  getBrewDialogueChoicesV42,
  type BrewSessionViewV42,
} from "@/lib/deck-synthesis/professor-brew-session-client-v4-2-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "@/lib/deck-synthesis/professor-deck-completion-v4-7-v1";
import {
  formatProfessorDeckListText,
  professorDeckListDownloadFilename,
  type ProfessorDeckListEntryV43,
} from "@/lib/deck-synthesis/professor-brew-deck-list-v4-3-v1";
import {
  computeCardGradeV4,
  computeProfessorDeckGradeV4,
  type ProfessorDeckGradeV4,
  type ProfessorImprovementOptionV4,
} from "@/lib/deck-synthesis/professor-deck-grade-v4-v1";
import { buildProfessorCouncilTranscriptV4 } from "@/lib/deck-synthesis/professor-council-transcript-v4-v1";
import { bracketLabel } from "@/lib/deck-synthesis/professor-brew-bracket-v4-v1";
import { CardInspectorPanel } from "./CardInspectorPanel";
import { ProfessorCouncilTranscriptPanel } from "./ProfessorCouncilTranscriptPanel";
import { ProfessorDeckGridPanel } from "./ProfessorDeckGridPanel";
import { ProfessorDeckReportPanel } from "./ProfessorDeckReportPanel";
import { ProfessorDialoguePanel } from "./ProfessorDialoguePanel";

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultForkId(session: BrewSessionViewV42["session"]): string {
  return session.workingDeckTheory?.userDirectionForks?.[0]?.forkId ?? "fork-a";
}

export function ProfessorBrewRoomApp({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const apiBase = `/api/store/${slug}/professor/brew`;

  const [view, setView] = useState<BrewSessionViewV42 | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [councilOpen, setCouncilOpen] = useState(false);
  const [selectedCardName, setSelectedCardName] = useState<string | null>(null);
  const autoBuildStarted = useRef(false);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setError(null);
      try {
        const res = await fetch(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Request failed");
        setView(data as BrewSessionViewV42);
        return data as BrewSessionViewV42;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        setError(message);
        return null;
      }
    },
    [apiBase],
  );

  const pollUntilFinalReviewComplete = useCallback(
    async (sid: string, initial?: BrewSessionViewV42): Promise<BrewSessionViewV42 | null> => {
      let current = initial ?? null;
      for (let i = 0; i < 240; i++) {
        await sleep(3000);
        try {
          const res = await fetch(`${apiBase}?sessionId=${encodeURIComponent(sid)}`);
          if (res.status === 404) {
            setError("Brew session expired — restart the dev server wiped in-memory state. Start a new brew.");
            return current;
          }
          const data = (await res.json()) as BrewSessionViewV42;
          if (!res.ok) continue;
          current = data;
          setView(data);
          const status = data.session.finalDeckDoctor?.status;
          if (status === "COMPLETE" || status === "FAILED") {
            if (status === "FAILED") {
              setError(data.session.finalDeckDoctor?.headProfessorError ?? "Final review failed");
            }
            return data;
          }
        } catch {
          // Server may still be running the Head Professor job — keep polling.
        }
      }
      setError("Final review is still running — refresh in a minute to check status.");
      return current;
    },
    [apiBase],
  );

  const runAutoBuild = useCallback(
    async (sid: string, initial: BrewSessionViewV42) => {
      setBuilding(true);
      let current = initial;

      await post({ sessionId: sid, action: { type: "SET_LIVE_STATUS", status: "Building your full deck list…" } });
      await sleep(500);

      const MAX_AUTO_BUILD_PASSES = 80;
      for (let pass = 0; pass < MAX_AUTO_BUILD_PASSES; pass++) {
        const session = current.session;
        if (session.autoBuildComplete) break;

        if (session.discoveryInterrupt) {
          const next = await post({ sessionId: sid, action: { type: "DISCOVERY_CHOICE", choiceId: "explore" } });
          if (!next) break;
          current = next;
          await sleep(700);
          continue;
        }

        if (session.phase === "USER_FORK") {
          const next = await post({ sessionId: sid, action: { type: "USER_FORK", forkId: defaultForkId(session) } });
          if (!next) break;
          current = next;
          await sleep(700);
          continue;
        }

        const deckDone = session.fixtureCase
          ? session.deckListRevealCount >= session.deckList.length
          : !professorBrewShouldContinueAutoBuildV47(session);
        const treeDone = session.fixtureCase
          ? session.treeRevealStep >= BREW_TREE_MAX_REVEAL_STEP_V42 || session.phase === "COMPLETE"
          : (session.councilState?.selectedCards.length ?? 0) >= COMMANDER_DECK_LIBRARY_SIZE_V47;
        if (deckDone && treeDone) break;
        if (!session.workingDeckTheory) break;

        const next = await post({ sessionId: sid, action: { type: "ADVANCE_TREE" } });
        if (!next) break;
        current = next;
        await sleep(650);
      }

      await post({ sessionId: sid, action: { type: "SET_LIVE_STATUS", status: null } });

      if (
        professorBrewNeedsManaBaseV48(current.session) ||
        professorBrewNeedsDeckCompletionV416(current.session)
      ) {
        const mana = await post({ sessionId: sid, action: { type: "RUN_MANA_BASE" } });
        if (mana) current = mana;
      }

      if (professorBrewNeedsFinalReviewV48(current.session)) {
        const started = await post({ sessionId: sid, action: { type: "RUN_FINAL_REVIEW" } });
        if (started) current = started;
        const finished = await pollUntilFinalReviewComplete(sid, current);
        if (finished) current = finished;
      } else if (
        (current.session.councilState?.selectedCards.length ?? 0) >= COMMANDER_DECK_LIBRARY_SIZE_V47 &&
        !current.session.deckGrade &&
        current.session.finalDeckDoctor?.status !== "RUNNING"
      ) {
        const started = await post({ sessionId: sid, action: { type: "RUN_FINAL_REVIEW" } });
        if (started) current = started;
        const finished = await pollUntilFinalReviewComplete(sid, started ?? current);
        if (finished) current = finished;
      } else if (professorBrewIsFinalReviewRunningV48(current.session)) {
        const finished = await pollUntilFinalReviewComplete(sid, current);
        if (finished) current = finished;
      }

      if (professorBrewIsDraftReadyV47(current.session)) {
        await post({ sessionId: sid, action: { type: "SET_AUTO_BUILD_COMPLETE" } });
      } else if (current.session.finalDeckDoctor?.status === "FAILED") {
        setError(current.session.finalDeckDoctor.headProfessorError ?? "Final review failed");
      }
      setBuilding(false);
    },
    [post, pollUntilFinalReviewComplete],
  );

  useEffect(() => {
    const sid = sessionId;
    if (!sid) {
      router.replace(`/s/${slug}/inventory/professor`);
      return;
    }

    async function init() {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}?sessionId=${encodeURIComponent(sid)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Session not found");
        setView(data as BrewSessionViewV42);

        if (!data.session.autoBuildComplete && !autoBuildStarted.current) {
          autoBuildStarted.current = true;
          void runAutoBuild(sid, data as BrewSessionViewV42);
        } else if (
          !data.session.autoBuildComplete &&
          !data.session.deckGrade &&
          (professorBrewNeedsDeckCompletionV416(data.session) ||
            professorBrewNeedsFinalReviewV48(data.session))
        ) {
          autoBuildStarted.current = true;
          void runAutoBuild(sid, data as BrewSessionViewV42);
        } else if (professorBrewIsFinalReviewRunningV48(data.session)) {
          setBuilding(true);
          void pollUntilFinalReviewComplete(sid, data as BrewSessionViewV42).finally(() => setBuilding(false));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, [sessionId, slug, router, apiBase, runAutoBuild, pollUntilFinalReviewComplete]);

  const session = view?.session;
  const draftReady = session ? professorBrewIsDraftReadyV47(session) : false;
  const built = Boolean(session?.autoBuildComplete) || draftReady;
  const finalReport = session?.finalReport ?? null;
  const finalReviewFailed = session?.finalDeckDoctor?.status === "FAILED";
  const finalReviewError = session?.finalDeckDoctor?.headProfessorError ?? null;
  const cardImageUrls = session?.cardImageUrls ?? {};
  const inStockNames = new Set(session?.inStockNames ?? []);
  const inventoryMatchStatus: "idle" | "loading" | "done" | "error" =
    !session?.deckList.length ? "idle" : session.inStockNames.length > 0 || built ? "done" : "loading";
  const canDownloadList = Boolean(session && session.deckList.length > 0 && (built || session.deckListRevealCount >= session.deckList.length));

  const grade: ProfessorDeckGradeV4 | null = useMemo(() => {
    if (session?.deckGrade) return session.deckGrade;
    if (draftReady || built) return null;
    if (!session?.workingDeckTheory) return null;
    return computeProfessorDeckGradeV4({
      theory: session.workingDeckTheory,
      loopResult: session.loopResult,
      deckList: session.deckList,
      cardStatusOverrides: session.cardStatusOverrides,
      userIntent: session.userIntent,
    });
  }, [session, draftReady, built]);

  const councilTranscript = useMemo(
    () =>
      buildProfessorCouncilTranscriptV4({
        councilState: session?.councilState ?? null,
        loopResult: session?.loopResult ?? null,
        theory: session?.workingDeckTheory ?? null,
        professorLines: session?.professorLines ?? [],
      }),
    [session?.councilState, session?.loopResult, session?.workingDeckTheory, session?.professorLines],
  );

  const dialogueChoices = useMemo(
    () => (session ? getBrewDialogueChoicesV42(session) : []),
    [session],
  );

  const selectedCardGrade = useMemo(() => {
    if (!selectedCardName || !session?.workingDeckTheory) return null;
    const pkg = session.workingDeckTheory.packages.find((p) => p.candidateCards.includes(selectedCardName));
    return computeCardGradeV4({
      cardName: selectedCardName,
      theory: session.workingDeckTheory,
      roles: pkg?.roles ?? [],
      packageName: pkg?.name,
      commanderDependence: pkg?.commanderDependence,
    });
  }, [selectedCardName, session?.workingDeckTheory]);

  const handleRetryFinalReview = useCallback(() => {
    if (!sessionId || building) return;
    setBuilding(true);
    setError(null);
    void (async () => {
      const started = await post({ sessionId, action: { type: "RUN_FINAL_REVIEW" } });
      if (!started) {
        setBuilding(false);
        return;
      }
      const finished = await pollUntilFinalReviewComplete(sessionId, started);
      const latest = finished?.session ?? started?.session ?? session;
      if (latest && professorBrewIsDraftReadyV47(latest)) {
        await post({ sessionId, action: { type: "SET_AUTO_BUILD_COMPLETE" } });
      } else if (latest?.finalDeckDoctor?.status === "FAILED") {
        setError(latest.finalDeckDoctor.headProfessorError ?? "Final review failed");
      }
      setBuilding(false);
    })();
  }, [sessionId, building, post, pollUntilFinalReviewComplete, session]);

  const handleDownloadList = () => {
    if (!session?.deckList.length) return;
    const text = formatProfessorDeckListText(session.deckList as ProfessorDeckListEntryV43[]);
    const filename = professorDeckListDownloadFilename(session.commanderName ?? "professor-deck");
    downloadTextFile(filename, text);
  };

  const handleShowImprovements = (option: ProfessorImprovementOptionV4) => {
    if (!sessionId || !grade) return;
    setReportOpen(false);
    void post({
      sessionId,
      action: {
        type: "START_GRADE_IMPROVEMENT",
        optionId: option.id,
        categoryId: option.categoryId,
        label: option.label,
        description: option.description,
        professorLine: grade.improvementProfessorLine,
      },
    });
  };

  if (!sessionId) return null;

  if (!session && loading) {
    return (
      <div className="professor-brew-brutal flex min-h-screen items-center justify-center text-neutral-400">
        Opening brew room…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="professor-brew-brutal flex min-h-screen flex-col items-center justify-center gap-3 text-neutral-400">
        <p>{error ?? "Session not found"}</p>
        <button type="button" onClick={() => router.push(`/s/${slug}/inventory/professor`)} className="professor-brew-brutal-btn px-4 py-2 text-xs">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="professor-brew-brutal flex min-h-screen flex-col">
      <header className="border-b-4 border-[#111] bg-[#f3efe4] px-4 py-3 text-[#111]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Professor · Brew Room</p>
            <h1 className="text-lg font-black uppercase tracking-tight">{session.commanderName}</h1>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
              {bracketLabel(session.bracket)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right text-[10px] font-bold uppercase tracking-wider">
            {session.liveStatus ? <p className="text-[#ff6b3d]">{session.liveStatus}</p> : null}
            {councilTranscript.some((entry) => entry.speaker !== "TO_PLAYER") ? (
              <button
                type="button"
                onClick={() => setCouncilOpen(true)}
                className="professor-brew-brutal-btn px-3 py-1.5 text-[10px]"
              >
                View council log
              </button>
            ) : null}
            {canDownloadList ? (
              <button
                type="button"
                onClick={handleDownloadList}
                className="professor-brew-brutal-btn mt-1 px-3 py-1.5 text-[10px]"
              >
                Download text list
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative flex-1">
        <ProfessorDeckGridPanel
          deckList={session.deckList}
          revealCount={session.deckListRevealCount}
          cardImageUrls={cardImageUrls}
          inStockNames={inStockNames}
          inventoryMatchStatus={inventoryMatchStatus}
          building={building}
          built={built}
          grade={grade}
          buildPhase={session.councilState?.buildPhase}
          draftReady={draftReady}
          finalReportReady={finalReport?.status === "COMPLETE"}
          finalReviewFailed={finalReviewFailed}
          finalReviewError={finalReviewError}
          onViewReport={() => setReportOpen(true)}
          onRetryFinalReview={handleRetryFinalReview}
          onCardClick={(card) => setSelectedCardName(card.name)}
        />

        {selectedCardName && selectedCardGrade ? (
          <div className="absolute bottom-4 right-4 z-20 w-full max-w-sm border-4 border-[#111] bg-[#0a0a0a] shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Card inspector</p>
              <button type="button" onClick={() => setSelectedCardName(null)} className="text-xs text-neutral-400">
                Close
              </button>
            </div>
            <CardInspectorPanel
              node={{
                nodeId: `inspect-${selectedCardName}`,
                kind: "CARD",
                label: selectedCardName,
                cardName: selectedCardName,
                x: 0,
                y: 0,
                roles: selectedCardGrade.roles,
                commanderDependence: session.workingDeckTheory?.packages.find((p) =>
                  p.candidateCards.includes(selectedCardName),
                )?.commanderDependence,
                provenanceNote: selectedCardGrade.explanation,
              }}
              cardGrade={selectedCardGrade}
              onAction={() => setSelectedCardName(null)}
            />
          </div>
        ) : null}
      </main>

      <ProfessorDialoguePanel
        lines={session.professorLines}
        choices={dialogueChoices}
        discoveryInterrupt={session.discoveryInterrupt}
        loading={building}
        brutal
        showViewCouncil={councilTranscript.some((entry) => entry.speaker !== "TO_PLAYER")}
        onViewCouncil={() => setCouncilOpen(true)}
        completePlaceholder={
          built
            ? finalReport?.status === "COMPLETE"
              ? `"${finalReport.deckName}" — open the deck report for strategy, win condition, and frontier review.`
              : "Structural draft ready. Open the deck report or click any card for Professor grades."
            : session?.liveStatus?.includes("mana base")
              ? "Building mana base to 100 cards…"
              : session?.finalReport?.status === "RUNNING" || session?.liveStatus?.includes("frontier")
                ? "Professors are writing the final defense report…"
                : "Watch the full list fill in — professors are building together."
        }
        onChoice={(choice) => {
          if (!sessionId) return;
          if (choice.action === "CONTINUE") void post({ sessionId, action: { type: "CONTINUE" } });
          else if (choice.action === "ADVANCE_TREE") void post({ sessionId, action: { type: "ADVANCE_TREE" } });
          else if (choice.action === "USER_FORK")
            void post({ sessionId, action: { type: "USER_FORK", forkId: choice.meta?.forkId ?? "weird" } });
        }}
      />

      {reportOpen && grade ? (
        <ProfessorDeckReportPanel
          grade={grade}
          commanderName={session.commanderName ?? "Commander"}
          finalReport={finalReport}
          onClose={() => setReportOpen(false)}
          onShowImprovements={handleShowImprovements}
        />
      ) : null}

      <ProfessorCouncilTranscriptPanel
        open={councilOpen}
        onClose={() => setCouncilOpen(false)}
        entries={councilTranscript}
        brutal
      />

      {error ? (
        <p className="border-t-4 border-[#111] bg-[#ff6b3d] px-4 py-2 text-center text-sm font-bold uppercase text-[#111]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

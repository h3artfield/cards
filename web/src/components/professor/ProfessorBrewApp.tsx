"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BrewSessionViewV42 } from "@/lib/deck-synthesis/professor-brew-session-client-v4-2-v1";
import { getBrewDialogueChoicesV42 } from "@/lib/deck-synthesis/professor-brew-session-client-v4-2-v1";
import { computeCardGradeV4 } from "@/lib/deck-synthesis/professor-deck-grade-v4-v1";
import { buildProfessorCouncilTranscriptV4 } from "@/lib/deck-synthesis/professor-council-transcript-v4-v1";
import { bracketLabel } from "@/lib/deck-synthesis/professor-brew-bracket-v4-v1";
import type { BrewTreeNodeV42 } from "@/lib/deck-synthesis/professor-brew-tree-v4-2-v1";
import { BrewTreeCanvas } from "./BrewTreeCanvas";
import { CommanderSelectScreen } from "./CommanderSelectScreen";
import { IdeaBoardPanel } from "./IdeaBoardPanel";
import { ProfessorCouncilTranscriptPanel } from "./ProfessorCouncilTranscriptPanel";
import { ProfessorDialoguePanel } from "./ProfessorDialoguePanel";
import { CardInspectorPanel } from "./CardInspectorPanel";

export function ProfessorBrewApp({ slug }: { slug: string }) {
  const [view, setView] = useState<BrewSessionViewV42 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"offline_replay" | "live">("live");
  const [councilOpen, setCouncilOpen] = useState(false);

  const apiBase = `/api/store/${slug}/professor/brew`;

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setLoading(true);
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
        setError(e instanceof Error ? e.message : "Unknown error");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    void post({ create: { mode } });
  }, [mode, post]);

  const session = view?.session;
  const tree = view?.tree;

  const dialogueChoices = useMemo(
    () => (session ? getBrewDialogueChoicesV42(session) : []),
    [session],
  );

  const selectedNode: BrewTreeNodeV42 | null = useMemo(() => {
    if (!tree || !session?.selectedTreeNodeId) return null;
    return tree.nodes.find((n) => n.nodeId === session.selectedTreeNodeId) ?? null;
  }, [tree, session?.selectedTreeNodeId]);

  const selectedCardGrade = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== "CARD" || !selectedNode.cardName || !session?.workingDeckTheory) {
      return null;
    }
    const pkg = session.workingDeckTheory.packages.find((p) => p.packageId === selectedNode.packageId);
    return computeCardGradeV4({
      cardName: selectedNode.cardName,
      theory: session.workingDeckTheory,
      roles: selectedNode.roles ?? pkg?.roles ?? [],
      packageName: pkg?.name,
      cardStatus: selectedNode.cardStatus,
      commanderDependence: selectedNode.commanderDependence ?? pkg?.commanderDependence,
    });
  }, [selectedNode, session?.workingDeckTheory]);

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

  const dispatch = useCallback(
    (action: Record<string, unknown>) => {
      if (!session?.sessionId) return;
      void post({ sessionId: session.sessionId, action });
    },
    [post, session?.sessionId],
  );

  const onSelectCommander = useCallback(
    (commander: { name: string; slug: string; bracket: number }) => {
      if (!session?.sessionId) return;
      void post({ sessionId: session.sessionId, selectCommander: commander });
    },
    [post, session?.sessionId],
  );

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070a] text-neutral-500">
        Opening brewing room…
      </div>
    );
  }

  if (session.phase === "COMMANDER_SELECT") {
    return (
      <CommanderSelectScreen
        slug={slug}
        mode={mode}
        onModeChange={setMode}
        loading={loading}
        error={error}
        onSelect={onSelectCommander}
        onStartOffline={() => post({ create: { mode: "offline_replay" } })}
        onStartLive={() => post({ create: { mode: "live" } })}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#07070a] text-neutral-200">
      <header className="border-b border-neutral-800/80 bg-[#0a0a0f]/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-700/80">Professor · Brewing Room</p>
            <h1 className="text-lg font-medium text-white">{session.commanderName}</h1>
            <p className="text-xs text-neutral-500">
              {session.mode === "offline_replay" ? "Offline replay" : "Live"} · {session.phase.replace(/_/g, " ").toLowerCase()} · {bracketLabel(session.bracket)}
            </p>
          </div>
          <div className="text-right text-[10px] text-neutral-600">
            <p>
              Creative {session.costBudget.creativePass1Used}/{session.costBudget.creativePass1Max} · Research{" "}
              {session.costBudget.researchCallsUsed}/{session.costBudget.researchCallsMax}
            </p>
            {councilTranscript.some((entry) => entry.speaker !== "TO_PLAYER") ? (
              <button
                type="button"
                onClick={() => setCouncilOpen(true)}
                className="mt-2 rounded border border-amber-900/40 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-500 hover:bg-amber-950/30"
              >
                View council log
              </button>
            ) : null}
            {session.warrantCreativeRevisit ? (
              <p className="text-amber-600">Material discovery — creative revisit warranted</p>
            ) : null}
            {session.liveStatus ? <p className="text-violet-400">{session.liveStatus}</p> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden lg:flex-row">
        <section className="relative order-2 min-h-[420px] flex-1 lg:order-1 lg:min-h-0 lg:h-auto">
          {tree ? (
            <BrewTreeCanvas
              tree={tree}
              selectedNodeId={session.selectedTreeNodeId}
              onSelectNode={(nodeId) => dispatch({ type: "SELECT_TREE_NODE", nodeId })}
            />
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center text-neutral-600">
              Theory seeding…
            </div>
          )}
        </section>

        <aside className="order-1 flex max-h-[38vh] w-full flex-col gap-0 overflow-y-auto border-b border-neutral-800/60 lg:order-2 lg:max-h-none lg:w-[340px] lg:border-b-0">
          <IdeaBoardPanel theory={session.workingDeckTheory} onReconsider={(ideaId) => dispatch({ type: "RECONSIDER_IDEA", ideaId })} />
          {selectedNode?.kind === "CARD" ? (
            <CardInspectorPanel
              node={selectedNode}
              cardGrade={selectedCardGrade}
              onAction={(cardAction) =>
                dispatch({ type: "CARD_ACTION", nodeId: selectedNode.nodeId, action: cardAction })
              }
            />
          ) : null}
        </aside>
      </main>

      <ProfessorDialoguePanel
        lines={session.professorLines}
        choices={dialogueChoices}
        discoveryInterrupt={session.discoveryInterrupt}
        loading={loading}
        showViewCouncil={councilTranscript.some((entry) => entry.speaker !== "TO_PLAYER")}
        onViewCouncil={() => setCouncilOpen(true)}
        completePlaceholder={
          session.phase === "COMPLETE"
            ? "The core engine is taking shape. Keep brewing or start completing the deck?"
            : undefined
        }
        onChoice={(choice) => {
          if (choice.action === "CONTINUE") dispatch({ type: "CONTINUE" });
          else if (choice.action === "CHOOSE_ARCHETYPE")
            dispatch({
              type: "CHOOSE_ARCHETYPE",
              choiceId: choice.choiceId,
              userIntentPatch: choice.meta?.userIntentPatch ?? choice.label,
            });
          else if (choice.action === "CHOOSE_RELATIONSHIP")
            dispatch({
              type: "CHOOSE_RELATIONSHIP",
              choiceId: choice.choiceId,
              lens: choice.meta?.lens ?? choice.choiceId,
              userIntentPatch: choice.meta?.userIntentPatch ?? choice.label,
            });
          else if (choice.action === "ADVANCE_TREE") dispatch({ type: "ADVANCE_TREE" });
          else if (choice.action === "DISCOVERY_CHOICE") dispatch({ type: "DISCOVERY_CHOICE", choiceId: choice.choiceId });
          else if (choice.action === "USER_FORK") dispatch({ type: "USER_FORK", forkId: choice.meta?.forkId ?? choice.choiceId });
        }}
      />

      <ProfessorCouncilTranscriptPanel
        open={councilOpen}
        onClose={() => setCouncilOpen(false)}
        entries={councilTranscript}
      />

      {error ? <p className="border-t border-red-900/40 bg-red-950/20 px-4 py-2 text-center text-sm text-red-400">{error}</p> : null}
    </div>
  );
}

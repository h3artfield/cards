"use client";

import { useMemo, useState } from "react";
import type { BuildPathClass } from "@/lib/deck-synthesis/build-path-types-v1";
import type { DeckBuildGraph } from "@/lib/deck-synthesis/deck-build-graph-v1";
import { buildKenrithDeckBuildGraphFixture } from "@/lib/deck-synthesis/deck-build-graph-fixture-v1";
import { DeckBuildGraph2D } from "./DeckBuildGraph2D";
import { DeckBuildPathSwitcher } from "./DeckBuildPathSwitcher";

export function DeckBuildApp({ slug }: { slug: string }) {
  const [selectedPath, setSelectedPath] = useState<BuildPathClass>("HARMONY");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const graph: DeckBuildGraph = useMemo(
    () => buildKenrithDeckBuildGraphFixture(selectedPath),
    [selectedPath],
  );

  const selectedNode = graph.nodes.find((n) => n.nodeId === selectedNodeId) ?? null;
  const connectedEdges = graph.edges.filter(
    (e) => e.sourceNodeId === selectedNodeId || e.targetNodeId === selectedNodeId,
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] text-neutral-300">
      <header className="border-b border-neutral-800 px-4 py-4 lg:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-600">Deck synthesis workspace</p>
            <h1 className="mt-1 text-xl font-medium text-white">{graph.deckTitle}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {graph.commandZone.members.map((m) => m.name).join(" · ")} · Bracket {graph.commandZone.bracket}
            </p>
            <p className="mt-2 text-xs text-neutral-600">
              {graph.stats.deckCount}/{graph.stats.maxDeckSize} cards
              {graph.stats.averageManaValue != null ? ` · Avg MV ${graph.stats.averageManaValue}` : ""}
              {slug ? ` · ${slug}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Discover your deck with Professor"
              onClick={() => {
                window.location.href = `/s/${slug}/inventory/professor`;
              }}
              className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-900/40"
            >
              Ask Professor
            </button>
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-[1400px]">
          <DeckBuildPathSwitcher selected={selectedPath} onSelect={setSelectedPath} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-4 lg:flex-row lg:px-6">
        <section className="min-h-[480px] flex-1">
          <DeckBuildGraph2D graph={graph} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
        </section>

        <aside className="flex w-full flex-col gap-4 lg:w-80">
          <Panel title="Selection">
            {selectedNode ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium text-white">{selectedNode.label}</p>
                <p className="text-neutral-500">{selectedNode.nodeType.replace(/_/g, " ")}</p>
                {selectedNode.subtitle ? <p className="text-neutral-500">{selectedNode.subtitle}</p> : null}
                {connectedEdges.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-neutral-500">
                    {connectedEdges.map((e) => (
                      <li key={e.edgeId}>
                        {e.edgeType.replace(/_/g, " ")} — {e.provenance.slice(0, 80)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button type="button" className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400">
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Swap — future synthesis"
                    className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-600"
                  >
                    Swap
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-600">Click a node in the graph to inspect semantic relationships.</p>
            )}
          </Panel>

          <Panel title="Considering">
            <ul className="space-y-2">
              {graph.considering.map((c) => (
                <li key={c.oracleId} className="rounded border border-neutral-800 px-2 py-2 text-sm">
                  <p className="text-neutral-200">{c.name}</p>
                  <p className="text-xs text-neutral-600">{c.manaCost}</p>
                  <p className="mt-1 text-xs text-neutral-500">{c.whyThisCard}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={`Deck ${graph.stats.deckCount} / ${graph.stats.maxDeckSize}`}>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {graph.selectedDeckCards.map((c) => (
                <li key={c.oracleId} className="flex justify-between gap-2 border-b border-neutral-900 py-1">
                  <span className={c.slot === "commander" ? "text-neutral-300" : "text-neutral-400"}>{c.name}</span>
                  <span className="text-xs text-neutral-600">{c.manaCost ?? (c.slot === "commander" ? "CMD" : "")}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <p className="text-[10px] text-neutral-700">
            Fixture graph · semantic map remains separate infrastructure · retrieval evaluation unchanged
          </p>
        </aside>
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">{title}</h2>
      {children}
    </div>
  );
}

"use client";

import type { WorkingDeckTheoryV4 } from "@/lib/deck-synthesis/professor-working-deck-theory-v4";
import { ideasInLaneV4 } from "@/lib/deck-synthesis/professor-idea-board-v4";

export function IdeaBoardPanel({
  theory,
  onReconsider,
}: {
  theory: WorkingDeckTheoryV4 | null;
  onReconsider: (ideaId: string) => void;
}) {
  if (!theory) {
    return (
      <div className="border-b border-neutral-800/60 p-4 lg:border-b-0">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500">Professor&apos;s Notebook</h2>
        <p className="mt-2 text-sm text-neutral-600">Ideas appear as research explores.</p>
      </div>
    );
  }

  const coreFromBoard = ideasInLaneV4(theory.ideaBoard, "CORE");
  const coreFromPackages = theory.packages
    .filter((p) => p.status === "CORE")
    .slice(0, 4)
    .map((p) => ({ id: p.packageId, title: p.name, reason: p.purpose.slice(0, 80) }));
  const researching = ideasInLaneV4(theory.ideaBoard, "VERIFY").concat(ideasInLaneV4(theory.ideaBoard, "EXPLORE"));
  const weird = ideasInLaneV4(theory.ideaBoard, "WEIRD");
  const rejected = ideasInLaneV4(theory.ideaBoard, "REJECTED");

  return (
    <div className="max-h-[40vh] overflow-y-auto border-b border-neutral-800/60 p-4 lg:max-h-none lg:border-b-0">
      <h2 className="text-xs uppercase tracking-wider text-amber-700/70">Professor&apos;s Notebook</h2>

      <NotebookSection
        title="Core"
        items={[
          ...coreFromBoard.map((i) => ({ id: i.ideaId, title: i.title, reason: i.description.slice(0, 80), prefix: "✓" as const })),
          ...coreFromPackages.map((p) => ({ id: p.id, title: p.title, reason: p.reason, prefix: "✓" as const })),
        ]}
      />
      <NotebookSection
        title="Researching"
        items={researching.map((i) => ({ id: i.ideaId, title: i.title, reason: i.description.slice(0, 60), prefix: "?" as const }))}
      />
      <NotebookSection
        title="Weird Ideas"
        items={weird.map((i) => ({ id: i.ideaId, title: i.title, reason: i.description.slice(0, 60), prefix: "★" as const }))}
      />
      <NotebookSection
        title="Rejected"
        items={rejected.map((i) => ({
          id: i.ideaId,
          title: i.title,
          reason: i.statusReason ?? i.description.slice(0, 60),
          prefix: "✗" as const,
          reconsider: true,
        }))}
        onReconsider={onReconsider}
      />

      {theory.revisionHistory.length > 1 ? (
        <div className="mt-4 border-t border-neutral-800/60 pt-3">
          <p className="text-[10px] uppercase text-neutral-600">Brew journal</p>
          <ul className="mt-1 space-y-1 text-[11px] text-neutral-500">
            {theory.revisionHistory.slice(-3).map((r) => (
              <li key={r.revision}>
                r{r.revision}: {r.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NotebookSection({
  title,
  items,
  onReconsider,
}: {
  title: string;
  items: { id: string; title: string; reason?: string; prefix: string; reconsider?: boolean }[];
  onReconsider?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[10px] font-medium uppercase text-neutral-500">{title}</p>
      <ul className="mt-1 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="text-neutral-400">{item.prefix} </span>
            <span className="text-neutral-200">{item.title}</span>
            {item.reason ? <p className="ml-4 text-xs text-neutral-600">{item.reason}</p> : null}
            {item.reconsider && onReconsider ? (
              <button
                type="button"
                onClick={() => onReconsider(item.id)}
                className="ml-4 text-[10px] text-amber-600 hover:text-amber-400"
              >
                [Reconsider]
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import type { ProfessorCardGradeV4 } from "@/lib/deck-synthesis/professor-deck-grade-v4-v1";
import type { BrewTreeNodeV42 } from "@/lib/deck-synthesis/professor-brew-tree-v4-2-v1";

export function CardInspectorPanel({
  node,
  cardGrade,
  onAction,
}: {
  node: BrewTreeNodeV42;
  cardGrade?: ProfessorCardGradeV4 | null;
  onAction: (action: "KEEP" | "REMOVE" | "FIND_ALTERNATIVE" | "FIND_WEIRDER") => void;
}) {
  return (
    <div className="border-t border-neutral-800/60 p-4">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500">Why Professor chose it</h2>
      <p className="mt-2 text-base font-medium text-white">{node.label}</p>
      <p className="text-xs text-neutral-500">{node.cardStatus ?? "CANDIDATE"}</p>

      {node.roles?.length ? (
        <ul className="mt-3 space-y-1 text-sm text-neutral-300">
          {node.roles.map((r) => (
            <li key={r}>✓ {r}</li>
          ))}
        </ul>
      ) : null}

      {node.provenanceNote ? <p className="mt-3 text-xs text-neutral-500">{node.provenanceNote}</p> : null}
      {node.commanderDependence ? (
        <p className="mt-2 text-xs text-neutral-600">Commander dependence: {node.commanderDependence}</p>
      ) : null}

      {cardGrade ? (
        <div className="mt-4 border border-neutral-800/80 bg-neutral-950/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Professor grade</p>
          <p className="mt-1 text-lg font-semibold text-amber-200">{cardGrade.professorGrade}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-neutral-400">
            <div>Commander fit</div>
            <div className="text-right text-neutral-200">{cardGrade.commanderFit}</div>
            <div>Package fit</div>
            <div className="text-right text-neutral-200">{cardGrade.packageFit}</div>
            <div>Role compression</div>
            <div className="text-right text-neutral-200">{cardGrade.roleCompression}</div>
            <div>Independence</div>
            <div className="text-right text-neutral-200">{cardGrade.independence}</div>
            <div>Mechanical confidence</div>
            <div className="text-right text-emerald-400">{cardGrade.mechanicalConfidence}</div>
          </dl>
          <p className="mt-3 text-xs text-neutral-500">{cardGrade.explanation}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {(["KEEP", "REMOVE", "FIND ALTERNATIVE", "FIND WEIRDER"] as const).map((label) => {
          const action =
            label === "KEEP"
              ? "KEEP"
              : label === "REMOVE"
                ? "REMOVE"
                : label === "FIND ALTERNATIVE"
                  ? "FIND_ALTERNATIVE"
                  : "FIND_WEIRDER";
          return (
            <button
              key={label}
              type="button"
              onClick={() => onAction(action)}
              className={`rounded border px-2 py-1 text-[10px] ${
                action === "FIND_WEIRDER"
                  ? "border-violet-800 text-violet-300 hover:bg-violet-950/40"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-900"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

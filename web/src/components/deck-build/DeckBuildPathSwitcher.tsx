"use client";

import type { BuildPathClass } from "@/lib/deck-synthesis/build-path-types-v1";
import { DECK_BUILD_PATH_EXPLANATIONS } from "@/lib/deck-synthesis/deck-build-graph-fixture-v1";

const PATH_ORDER: BuildPathClass[] = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];

export function DeckBuildPathSwitcher({
  selected,
  onSelect,
}: {
  selected: BuildPathClass;
  onSelect: (path: BuildPathClass) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PATH_ORDER.map((pathClass) => {
          const meta = DECK_BUILD_PATH_EXPLANATIONS[pathClass];
          const active = selected === pathClass;
          return (
            <button
              key={pathClass}
              type="button"
              onClick={() => onSelect(pathClass)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-neutral-500 bg-neutral-800 text-white"
                  : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
              }`}
            >
              <span className="block text-sm font-medium">{meta.title}</span>
              <span className="block text-xs text-neutral-500">{meta.tagline}</span>
            </button>
          );
        })}
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-neutral-500">
        {DECK_BUILD_PATH_EXPLANATIONS[selected].description}
      </p>
    </div>
  );
}

"use client";

import type { SolDirectedBuildStatusV111 } from "@/lib/deck-synthesis/professor-sol-directed-build-types-v1-1-1";
import {
  solDirectedBuildProgressPercent,
  solDirectedBuildStageState,
  solDirectedBuildStatusLabel,
  solDirectedProgressStages,
} from "@/lib/deck-synthesis/professor-sol-directed-build-progress-v1-1-1";
import { scryfallNamedArtCropUrl } from "@/lib/deck-synthesis/professor-brew-scryfall-images-v1";

function stageIcon(state: "active" | "done" | "pending"): string {
  if (state === "done") return "✓";
  if (state === "active") return "◆";
  return "○";
}

export function ProfessorSolDirectedBuildProgressPanel({
  status,
  statusLabel,
  commanderName,
  buildId,
  mode,
}: {
  status: SolDirectedBuildStatusV111;
  statusLabel?: string;
  commanderName?: string;
  buildId?: string;
  mode?: "build" | "optimize";
}) {
  const percent = solDirectedBuildProgressPercent(status, mode);
  const label = statusLabel ?? solDirectedBuildStatusLabel(status);
  const stages = solDirectedProgressStages(mode);
  const artUrl = commanderName ? scryfallNamedArtCropUrl(commanderName, true) : null;

  return (
    <div className="professor-mtg-chamber mb-8">
      <div className="professor-mtg-chamber__inner professor-mtg-chamber__inner--art">
        {artUrl ? (
          <div className="professor-mtg-chamber__hero">
            <img
              src={artUrl}
              alt=""
              aria-hidden
              className="professor-mtg-chamber__hero-img"
              fetchPriority="high"
              decoding="async"
            />
            <div className="professor-mtg-chamber__hero-scrim" aria-hidden />
            {commanderName ? (
              <p className="professor-mtg-title professor-mtg-chamber__hero-name">{commanderName}</p>
            ) : null}
          </div>
        ) : null}

        <div className="professor-mtg-chamber__content">
          <div className="text-center">
            {commanderName && !artUrl ? (
              <p className="professor-mtg-title text-xl sm:text-2xl">{commanderName}</p>
            ) : null}
            <p className="professor-mtg-label">{label}</p>
            <p className="professor-mtg-percent mt-2 text-3xl font-semibold">{percent}%</p>
          </div>

          <div className="mx-auto mt-6 max-w-md">
            <div className="professor-mtg-bar">
              <div className="professor-mtg-bar-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <ol className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
            {stages.filter((stage) => stage.status !== "COMPLETE").map((stage) => {
              const state = solDirectedBuildStageState({ status, stageStatus: stage.status, mode });
              return (
                <li
                  key={stage.status}
                  className={`professor-mtg-stage flex items-center gap-2.5 ${
                    state === "active"
                      ? "professor-mtg-stage--active"
                      : state === "done"
                        ? "professor-mtg-stage--done"
                        : "professor-mtg-stage--pending"
                  }`}
                >
                  <span className="professor-mtg-stage-icon w-4 shrink-0 text-center text-xs">
                    {stageIcon(state)}
                  </span>
                  <span>{stage.label}</span>
                </li>
              );
            })}
          </ol>

          {buildId ? (
            <p className="professor-mtg-muted mt-8 text-center text-[10px] tracking-wider">
              {buildId}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

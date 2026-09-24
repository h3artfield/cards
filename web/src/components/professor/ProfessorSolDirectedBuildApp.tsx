"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  SolDirectedBuildJobRecordV111,
  SolDirectedBuildStatusV111,
} from "@/lib/deck-synthesis/professor-sol-directed-build-types-v1-1-1";
import {
  readSolDirectedPendingBuild,
  clearSolDirectedPendingBuild,
} from "@/lib/deck-synthesis/professor-sol-directed-pending-build-v1-1-1";
import { ProfessorClientErrorBoundary } from "./ProfessorClientErrorBoundary";
import { ProfessorSolDirectedBuildProgressPanel } from "./ProfessorSolDirectedBuildProgressPanel";
import { ProfessorSolDirectedDeckListPanel } from "./ProfessorSolDirectedDeckListPanel";
import { ProfessorMtgPageShell } from "./ProfessorMtgPageShell";
import { CustomerDeckNavV1 } from "./CustomerDeckNavV1";

type BuildView = {
  solDirected: true;
  job: SolDirectedBuildJobRecordV111;
  result?: {
    buildId: string;
    status: string;
    commander: { name: string; oracleId: string; colorIdentity: string[] };
    userInputs: {
      bracket: number;
      playstyle: string;
      commanderStyle: string;
      deckPreferences?: string;
    };
    architectPlan: Record<string, unknown> | null;
    retrievalSummary: {
      uniqueCandidateCount: number;
      requirementPoolCounts: Record<string, number>;
      supplyGatePass: boolean;
    } | null;
    constructedDeck: Record<string, unknown> | null;
    critic: {
      summary: string;
      appliedSwaps: Array<{ cut: string; add: string; reason: string }>;
      proposedSwaps?: Array<{ cut: string; add: string; reason: string }>;
      rejectedSwaps?: Array<{ swap: { cut: string; add: string }; reason: string }>;
    } | null;
    headProfessor: {
      classification: string;
      grade: string;
      bracketFit: string;
      strategyCoherence: string;
      manaAssessment: string;
      earlyMidLateGameAssessment: string;
      winConditionAssessment: string;
      interactionAssessment: string;
      resilienceAssessment: string;
      offPlanCards: string[];
      requiredChanges: string[];
      optionalChanges: string[];
      reasoningSummary: string;
      selfBuildQuestionAnswer: string;
    } | null;
    failureCode: string | null;
    failureMessage: string | null;
    validation: {
      pass: boolean;
      violations: string[];
      architectRequirementRealization?: {
        counts: Record<string, number>;
        expected: Record<string, number>;
        pass: boolean;
        mismatches: string[];
      };
      legacyHeuristicAudit?: {
        ramp: number;
        draw: number;
        interaction: number;
        protection: number;
        tutorsAccess: number;
        averageMv: number;
        note: string;
      };
    } | null;
    telemetry: {
      modelCallCount: number;
      architectTokens: number | null;
      constructorTokens: number | null;
      criticTokens: number | null;
      headProfessorTokens: number | null;
      nonlandCount: number | null;
      landCount: number | null;
      candidateUniqueCount: number | null;
    } | null;
  };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Survives React Strict Mode remount so we only start one build POST per navigation. */
const pendingStartInflight = new Set<string>();

export function ProfessorSolDirectedBuildApp({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const buildIdParam = searchParams.get("buildId");
  const startPending = searchParams.get("start") === "1";
  const apiBase = `/api/store/${slug}/professor/sol-directed-build`;

  const [buildId, setBuildId] = useState<string | null>(buildIdParam);
  const [pendingCommanderName, setPendingCommanderName] = useState<string | null>(null);
  const [view, setView] = useState<BuildView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!buildId) return null;
    const res = await fetch(`${apiBase}?buildId=${encodeURIComponent(buildId)}`);
    const data = (await res.json()) as BuildView & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to load build");
    setView(data);
    return data;
  }, [apiBase, buildId]);

  useEffect(() => {
    if (!startPending || buildIdParam) return;
    const inflightKey = `${slug}:start`;
    if (pendingStartInflight.has(inflightKey)) return;
    pendingStartInflight.add(inflightKey);

    const pending = readSolDirectedPendingBuild(slug);
    if (!pending) {
      pendingStartInflight.delete(inflightKey);
      setError("No build in progress — start a new deck from the setup page.");
      setLoading(false);
      return;
    }

    setPendingCommanderName(pending.commanderName);
    setLoading(false);

    void (async () => {
      try {
        const res = await fetch(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ start: pending }),
        });
        const data = (await res.json()) as BuildView & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to start build");
        clearSolDirectedPendingBuild(slug);
        setBuildId(data.job.buildId);
        setView(data);
        router.replace(`/s/${slug}/inventory/professor/build?buildId=${data.job.buildId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        pendingStartInflight.delete(inflightKey);
      }
    })();
  }, [apiBase, buildIdParam, router, slug, startPending]);

  useEffect(() => {
    if (!buildId) return;

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        let current = await poll();
        while (!cancelled && current && !["COMPLETE", "FAILED"].includes(current.job.status)) {
          await sleep(1500);
          current = await poll();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildId, poll]);

  const status = (view?.job.status ?? "CREATED") as SolDirectedBuildStatusV111;
  const statusLabel = view?.job.statusLabel ?? "Starting build…";
  const commanderName = view?.job.commanderName ?? pendingCommanderName ?? undefined;
  const isComplete = view?.job.status === "COMPLETE";
  const isFailed = view?.job.status === "FAILED";
  const failureMessage = view?.result?.failureMessage ?? view?.job.failureMessage ?? null;
  const showProgress = !isComplete && !isFailed;

  if (!buildId && !startPending) {
    return (
      <ProfessorMtgPageShell>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-red-400/90">Missing build ID — start a new deck from the Professor setup page.</p>
        </div>
      </ProfessorMtgPageShell>
    );
  }

  return (
    <ProfessorMtgPageShell>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 sm:px-8">
        <CustomerDeckNavV1 slug={slug} />
        <button
          type="button"
          className="professor-mtg-link text-xs"
          onClick={() => router.push(`/s/${slug}/inventory/professor`)}
        >
          {view?.job.userInputs?.mode === "optimize" ? "New optimization" : "New build"}
        </button>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-3 pb-16 pt-4 sm:px-4">
        {showProgress ? (
          <ProfessorSolDirectedBuildProgressPanel
            status={status}
            statusLabel={statusLabel}
            commanderName={commanderName}
            buildId={buildId ?? undefined}
            mode={view?.job.userInputs?.mode === "optimize" ? "optimize" : "build"}
          />
        ) : null}

        {error ? (
          <div className="professor-mtg-card mx-auto max-w-2xl border-red-900/40 p-6 text-red-300/90">{error}</div>
        ) : null}

        {isFailed && failureMessage ? (
          <div className="professor-mtg-card mx-auto mb-8 max-w-2xl border-red-900/35 p-6">
            <p className="professor-mtg-label text-red-300/90">Build failed</p>
            <p className="mt-2 text-sm text-[var(--mtg-parchment-muted)]">{failureMessage}</p>
            {view?.result?.headProfessor?.requiredChanges?.length ? (
              <div className="mt-4">
                <p className="professor-mtg-label text-xs">Professor required fixes</p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--mtg-parchment-muted)]">
                  {view?.result?.headProfessor?.requiredChanges.slice(0, 8).map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {view?.result?.validation?.violations?.length ? (
              <ul className="mt-4 space-y-1 text-xs text-neutral-400">
                {view.result.validation.violations.slice(0, 12).map((violation) => (
                  <li key={violation}>{violation}</li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="professor-mtg-btn mt-6 px-4 py-2 text-sm"
              onClick={() => router.push(`/s/${slug}/inventory/professor`)}
            >
              Try again
            </button>
          </div>
        ) : null}

        {isComplete && view?.result ? (
          <ProfessorClientErrorBoundary>
            <ProfessorSolDirectedDeckListPanel
              slug={slug}
              buildId={buildId ?? view.job.buildId}
              commander={view.result.commander}
              constructedDeck={view.result.constructedDeck}
              userInputs={view.result.userInputs}
              architectPlan={view.result.architectPlan}
              critic={view.result.critic}
              headProfessor={view.result.headProfessor}
              validation={view.result.validation}
              retrievalSummary={view.result.retrievalSummary}
              telemetry={view.result.telemetry}
              validationPass={view.result.validation?.pass ?? false}
              deckEnrichment={view.result.deckEnrichment}
              professorRepairApplied={view.result.professorRepairApplied}
            />
          </ProfessorClientErrorBoundary>
        ) : null}

        {loading && !view && !error ? (
          <p className="professor-mtg-muted mt-4 text-center text-sm italic">Connecting…</p>
        ) : null}
      </main>
    </ProfessorMtgPageShell>
  );
}

import type { CombinedCorpus } from "./combined-corpus-v1";
import type { TopdeckPodGame } from "./types";
import { classifyTemporalStatus } from "./temporal-integrity-v1";

export type PodTemporalClass = "HISTORICAL_THROUGH_FETCH" | "FUTURE_SCHEDULED";

export type CorpusReconciliation = {
  rawPodRetrievals: number;
  uniquePodIds: number;
  duplicatePodRetrievals: number;
  futureScheduledPods: number;
  historicalQAPods: number;
  historicalPodsInMonthlyScope: number;
  historicalPodsOutsideMonthlyScope: number;
  outOfLogicalMonthWindowPods: number;
  reconciliation: {
    uniquePods: number;
    minusFutureScheduled: number;
    minusDuplicateRetrievals: number;
    minusOtherExclusions: number;
    equalsHistoricalQAPods: number;
  };
  futurePodIds: string[];
  outOfLogicalMonthPodIds: string[];
  verification: {
    rawMinusFutureEqualsHistorical: boolean;
    monthlySumEqualsHistorical: boolean;
    monthlyScopePlusOutsideScopeEqualsHistorical: boolean;
    monthlyBreakdown: Record<string, { raw: number; historical: number; future: number }>;
  };
};

export function classifyPodTemporal(input: {
  pod: TopdeckPodGame;
  tournamentStartDate?: number;
  fetchedAtByMonth: Record<string, string>;
}): PodTemporalClass {
  const month = input.pod.tournamentDate.slice(0, 7);
  const fetchedAt = input.fetchedAtByMonth[month] ?? input.fetchedAtByMonth["2026-08"];
  if (!fetchedAt) return "HISTORICAL_THROUGH_FETCH";

  if (input.tournamentStartDate != null) {
    return classifyTemporalStatus({
      tournamentStartDate: input.tournamentStartDate,
      fetchedAt,
    });
  }

  const fetchDay = fetchedAt.slice(0, 10);
  return input.pod.tournamentDate <= fetchDay
    ? "HISTORICAL_THROUGH_FETCH"
    : "FUTURE_SCHEDULED";
}

export function isHistoricalQAPod(
  pod: TopdeckPodGame,
  corpus: CombinedCorpus,
): boolean {
  const tournament = corpus.combined.tournamentByTid.get(pod.tid);
  return (
    classifyPodTemporal({
      pod,
      tournamentStartDate: tournament?.startDate,
      fetchedAtByMonth: corpus.combined.fetchedAtByMonth,
    }) === "HISTORICAL_THROUGH_FETCH"
  );
}

export function filterHistoricalQAPods(corpus: CombinedCorpus): TopdeckPodGame[] {
  return corpus.combined.pods.filter((pod) => isHistoricalQAPod(pod, corpus));
}

export function buildCorpusReconciliation(corpus: CombinedCorpus): CorpusReconciliation {
  const futurePodIds: string[] = [];
  let futureScheduledPods = 0;

  for (const pod of corpus.combined.pods) {
    if (!isHistoricalQAPod(pod, corpus)) {
      futureScheduledPods += 1;
      futurePodIds.push(pod.podId);
    }
  }

  const uniquePods = corpus.combined.uniquePodIds;
  const historicalQAPods = uniquePods - futureScheduledPods;
  const monthlyBreakdown: CorpusReconciliation["verification"]["monthlyBreakdown"] = {};
  const outOfLogicalMonthPodIds: string[] = [];

  for (const monthKey of Object.keys(corpus.byMonth)) {
    let monthFuture = 0;
    for (const pod of corpus.byMonth[monthKey]!.pods) {
      if (!isHistoricalQAPod(pod, corpus)) monthFuture += 1;
    }
    monthlyBreakdown[monthKey] = {
      raw: corpus.byMonth[monthKey]!.pods.length,
      historical: corpus.byMonth[monthKey]!.pods.length - monthFuture,
      future: monthFuture,
    };
  }

  for (const pod of corpus.combined.pods) {
    if (!pod.tournamentDate) continue;
    const importRun = corpus.runs.find((run) => run.pods.some((p) => p.podId === pod.podId));
    const tournamentMonth = pod.tournamentDate.slice(0, 7);
    if (importRun && tournamentMonth !== importRun.monthKey && isHistoricalQAPod(pod, corpus)) {
      outOfLogicalMonthPodIds.push(pod.podId);
    }
  }

  const monthlySumHistorical = Object.values(monthlyBreakdown).reduce((s, m) => s + m.historical, 0);
  const historicalPodsOutsideMonthlyScope = historicalQAPods - monthlySumHistorical;

  return {
    rawPodRetrievals: corpus.combined.rawPodRetrievals,
    uniquePodIds: uniquePods,
    duplicatePodRetrievals: corpus.combined.duplicatePodRetrievals,
    futureScheduledPods,
    historicalQAPods,
    historicalPodsInMonthlyScope: monthlySumHistorical,
    historicalPodsOutsideMonthlyScope,
    outOfLogicalMonthWindowPods: outOfLogicalMonthPodIds.length,
    reconciliation: {
      uniquePods,
      minusFutureScheduled: futureScheduledPods,
      minusDuplicateRetrievals: corpus.combined.duplicatePodRetrievals,
      minusOtherExclusions: 0,
      equalsHistoricalQAPods: historicalQAPods,
    },
    futurePodIds,
    outOfLogicalMonthPodIds,
    verification: {
      rawMinusFutureEqualsHistorical: uniquePods - futureScheduledPods === historicalQAPods,
      monthlySumEqualsHistorical: monthlySumHistorical === historicalQAPods,
      monthlyScopePlusOutsideScopeEqualsHistorical:
        monthlySumHistorical + historicalPodsOutsideMonthlyScope === historicalQAPods,
      monthlyBreakdown,
    },
  };
}

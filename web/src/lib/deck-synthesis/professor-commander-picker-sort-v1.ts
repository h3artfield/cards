/**
 * Ordering for the commander picker list. Lives outside the client component so
 * the comparators are testable, and because the picker sorts client-side: browse
 * returns at most 250 entries and search at most 50, so no server round-trip is
 * warranted.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";

export type ProfessorCommanderSortIdV1 = "alphabetical" | "popularity";

export const DEFAULT_PROFESSOR_COMMANDER_SORT_V1: ProfessorCommanderSortIdV1 = "alphabetical";

export const PROFESSOR_COMMANDER_SORT_OPTIONS_V1: Array<{
  id: ProfessorCommanderSortIdV1;
  label: string;
}> = [
  { id: "alphabetical", label: "A–Z" },
  { id: "popularity", label: "Popularity" },
];

/** Only the fields ordering needs, so the picker's own row type satisfies it. */
type SortableCommanderV1 = {
  name: string;
  rank?: number;
};

function compareByName(a: SortableCommanderV1, b: SortableCommanderV1): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Rank ascending, unranked last. Only ~14% of the pool has an EDHREC row, so an
 * absent rank is the common case and must not coerce to 0 and lead the list.
 */
function compareByRank(a: SortableCommanderV1, b: SortableCommanderV1): number {
  const aRanked = typeof a.rank === "number";
  const bRanked = typeof b.rank === "number";
  if (aRanked !== bRanked) return aRanked ? -1 : 1;
  if (aRanked && bRanked && a.rank !== b.rank) return (a.rank as number) - (b.rank as number);
  return compareByName(a, b);
}

export function compareProfessorCommandersV1(
  sortId: ProfessorCommanderSortIdV1,
): (a: SortableCommanderV1, b: SortableCommanderV1) => number {
  return sortId === "popularity" ? compareByRank : compareByName;
}

/**
 * Sorts a result page, pinning names that exactly match the query. Typing a full
 * name is unambiguous intent, so "Atraxa, Praetors' Voice" must not sit below
 * "Atraxa, Grand Unifier" just because A–Z says so.
 */
export function sortProfessorCommanderResultsV1<T extends SortableCommanderV1>(
  results: readonly T[],
  sortId: ProfessorCommanderSortIdV1,
  query: string,
): T[] {
  const compare = compareProfessorCommandersV1(sortId);
  const queryKey = normalizeOracleName(query);
  if (!queryKey) return [...results].sort(compare);

  const exact: T[] = [];
  const rest: T[] = [];
  for (const result of results) {
    (normalizeOracleName(result.name) === queryKey ? exact : rest).push(result);
  }

  return [...exact.sort(compare), ...rest.sort(compare)];
}

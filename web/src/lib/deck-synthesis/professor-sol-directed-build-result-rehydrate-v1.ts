/**
 * Rebuilds a finished build's result from its persisted artifacts.
 *
 * The result — the decklist itself — was only ever held in a process-local Map.
 * The job record persists to Firestore, so a build kept reporting COMPLETE with
 * a grade while its cards were gone, and a customer returning after any deploy
 * or scale-down found an empty deck. Three builds run on 2026-09-04 were
 * re-fetched an hour later: two returned zero cards.
 *
 * Nothing was actually lost. Every artifact is written to Storage under
 * deck-build-runs/{buildId}/, so the deck can be reconstructed on demand. That
 * is the approach taken here rather than also writing the result to Firestore,
 * because it is one mechanism instead of two and it recovers builds that
 * predate this fix — including every deck a customer has already saved.
 *
 * Only the fields the read path actually serves are reconstructed. Anything
 * cheap to recompute later (image, price, and inventory enrichment) is left
 * null, since the deck panel already refetches it.
 */
import { readSolDirectedBuildArtifactV111 } from "./professor-sol-directed-build-artifacts-v1-1-1";
import type {
  SolDirectedBuildJobRecordV111,
  SolDirectedBuildResultV111,
} from "./professor-sol-directed-build-types-v1-1-1";
import type { SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_BUILD_RESULT_REHYDRATE_V1_VERSION =
  "professor-sol-directed-build-result-rehydrate-v1";

/** Injectable so the reconstruction logic is testable without Storage. */
export type ArtifactReaderV1 = (name: string) => Promise<unknown | null>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A deck is only usable if it has a commander and at least one card. Anything
 * less is treated as absent rather than served as a broken deck.
 */
function usableDeck(value: unknown): SolDirectedConstructedDeckV11 | null {
  const deck = asRecord(value);
  if (!deck) return null;
  const commander = asRecord(deck.commander);
  if (!commander || typeof commander.name !== "string" || !commander.name.trim()) return null;
  const nonlands = Array.isArray(deck.nonlands) ? deck.nonlands : [];
  const lands = Array.isArray(deck.lands) ? deck.lands : [];
  if (nonlands.length === 0 && lands.length === 0) return null;
  return deck as unknown as SolDirectedConstructedDeckV11;
}

export type RehydratedResultV1 = {
  result: SolDirectedBuildResultV111;
  /** Artifacts that were found. Useful for diagnosing a partial recovery. */
  recovered: string[];
};

/**
 * Returns null when the deck cannot be recovered, so the caller can keep
 * serving the job alone rather than a result that claims to hold a deck.
 */
export async function rehydrateSolDirectedBuildResultV1(args: {
  job: SolDirectedBuildJobRecordV111;
  readArtifact?: ArtifactReaderV1;
}): Promise<RehydratedResultV1 | null> {
  const read: ArtifactReaderV1 =
    args.readArtifact ??
    ((name) =>
      readSolDirectedBuildArtifactV111({
        buildId: args.job.buildId,
        name: name as Parameters<typeof readSolDirectedBuildArtifactV111>[0]["name"],
      }));

  // The deck decides whether a recovery is possible at all, so it is fetched
  // first and the rest is skipped when it is missing.
  const deck = usableDeck(await read("canonicalized-deck.json"));
  if (!deck) return null;

  const [validation, headProfessor, critic, architectPlan, retrievalContract] = await Promise.all([
    read("validation.json"),
    read("head-professor-response.json"),
    read("critic-response.json"),
    read("architect-response.json"),
    read("retrieval-contract.json"),
  ]);

  const recovered = ["canonicalized-deck.json"];
  for (const [name, value] of [
    ["validation.json", validation],
    ["head-professor-response.json", headProfessor],
    ["critic-response.json", critic],
    ["architect-response.json", architectPlan],
    ["retrieval-contract.json", retrievalContract],
  ] as const) {
    if (value != null) recovered.push(name);
  }

  const result = {
    buildId: args.job.buildId,
    status: args.job.status,
    // The canonicalized deck carries the full commander blueprint, so the job
    // record's name and oracle id are only a fallback.
    commander: deck.commander,
    userInputs: args.job.userInputs,
    architectPlan: (architectPlan as SolDirectedBuildResultV111["architectPlan"]) ?? null,
    retrievalSummary: null,
    constructedDeck: deck,
    validation: (validation as SolDirectedBuildResultV111["validation"]) ?? null,
    critic: (critic as SolDirectedBuildResultV111["critic"]) ?? null,
    headProfessor: (headProfessor as SolDirectedBuildResultV111["headProfessor"]) ?? null,
    retrievalContract: (retrievalContract as SolDirectedBuildResultV111["retrievalContract"]) ?? null,
    professorRepairApplied: undefined,
    // Recomputed by the deck panel on load; not worth storing.
    deckEnrichment: null,
    telemetry: args.job.telemetry,
    modelCalls: [],
    proofChain: args.job.proofChain,
    failureCode: args.job.failureCode,
    failureMessage: args.job.failureMessage,
  } as SolDirectedBuildResultV111;

  return { result, recovered };
}

/**
 * True when a job claims a finished deck exists. Guards the recovery attempt so
 * an in-progress or failed build does not pay for Storage reads on every poll.
 */
export function jobShouldHaveResultV1(job: SolDirectedBuildJobRecordV111): boolean {
  return job.status === "COMPLETE" && Boolean(job.artifactStoragePrefix);
}

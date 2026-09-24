/**
 * Firestore + in-memory persistence for Sol-directed deck build jobs.
 */
import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "../firebase/collections";
import { getAdminFirestore } from "../firebase/admin";
import type {
  SolDirectedBuildJobRecordV111,
  SolDirectedBuildJobViewV111,
  SolDirectedBuildResultV111,
  SolDirectedBuildStatusV111,
  SolDirectedBuildActivityDirectionV111,
  SolDirectedBuildUserInputsV111,
} from "./professor-sol-directed-build-types-v1-1-1";
import {
  normalizeSolDirectedBuildUserInputsV111,
  SOL_DIRECTED_BUILD_STATUS_LABELS,
} from "./professor-sol-directed-build-types-v1-1-1";
import { saveCustomerDeckFromBuildJob } from "../customer-saved-decks/customer-saved-deck-store";
import {
  jobShouldHaveResultV1,
  rehydrateSolDirectedBuildResultV1,
} from "./professor-sol-directed-build-result-rehydrate-v1";

export const PROFESSOR_SOL_DIRECTED_BUILD_JOB_STORE_V1_1_1_VERSION =
  "professor-sol-directed-build-job-store-v1-1-1";

const memoryJobs = new Map<string, SolDirectedBuildJobRecordV111>();
const memoryResults = new Map<string, SolDirectedBuildResultV111>();

function nowIso(): string {
  return new Date().toISOString();
}

export function createSolDirectedBuildJobV111(args: {
  storeId: string;
  storeSlug: string;
  userId?: string | null;
  commanderOracleId: string;
  commanderName: string;
  userInputs: SolDirectedBuildUserInputsV111;
}): SolDirectedBuildJobRecordV111 {
  const buildId = randomUUID();
  const ts = nowIso();
  const userInputs = normalizeSolDirectedBuildUserInputsV111(args.userInputs);
  const job: SolDirectedBuildJobRecordV111 = {
    buildId,
    userId: args.userId ?? null,
    storeId: args.storeId,
    storeSlug: args.storeSlug,
    status: "CREATED",
    statusLabel: SOL_DIRECTED_BUILD_STATUS_LABELS.CREATED,
    commanderOracleId: args.commanderOracleId,
    commanderName: args.commanderName,
    bracket: userInputs.bracket,
    playstyle: userInputs.playstyle,
    deckTheme: userInputs.deckTheme,
    winPreference: userInputs.winPreference,
    commanderStyle: userInputs.commanderStyle,
    userInputs,
    activityLog: [],
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    failureCode: null,
    failureMessage: null,
    validationPass: null,
    finalClassification: null,
    finalGrade: null,
    artifactStoragePrefix: null,
    proofChain: null,
    telemetry: null,
  };
  memoryJobs.set(buildId, job);
  return job;
}

async function persistJob(job: SolDirectedBuildJobRecordV111): Promise<void> {
  memoryJobs.set(job.buildId, job);
  const db = getAdminFirestore();
  if (!db) return;
  await db.collection(COLLECTIONS.deckBuildJobs).doc(job.buildId).set(job, { merge: true });
}

export async function appendSolDirectedBuildActivityV111(args: {
  buildId: string;
  status: SolDirectedBuildStatusV111;
  message: string;
  direction?: SolDirectedBuildActivityDirectionV111;
}): Promise<void> {
  const existing = memoryJobs.get(args.buildId) ?? (await loadJobFromFirestore(args.buildId));
  if (!existing) return;
  const entry = {
    at: nowIso(),
    status: args.status,
    direction: args.direction ?? "status",
    message: args.message,
  };
  const activityLog = [...(existing.activityLog ?? []), entry].slice(-128);
  await persistJob({ ...existing, activityLog, updatedAt: nowIso() });
}

export async function updateSolDirectedBuildJobStatusV111(args: {
  buildId: string;
  status: SolDirectedBuildStatusV111;
  patch?: Partial<SolDirectedBuildJobRecordV111>;
}): Promise<SolDirectedBuildJobRecordV111 | null> {
  const existing = memoryJobs.get(args.buildId) ?? (await loadJobFromFirestore(args.buildId));
  if (!existing) return null;
  const { statusLabel: patchLabel, ...restPatch } = args.patch ?? {};
  const updated: SolDirectedBuildJobRecordV111 = {
    ...existing,
    ...restPatch,
    status: args.status,
    statusLabel: patchLabel ?? SOL_DIRECTED_BUILD_STATUS_LABELS[args.status],
    updatedAt: nowIso(),
  };
  await persistJob(updated);
  return updated;
}

async function loadJobFromFirestore(buildId: string): Promise<SolDirectedBuildJobRecordV111 | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const snap = await db.collection(COLLECTIONS.deckBuildJobs).doc(buildId).get();
  if (!snap.exists) return null;
  const job = snap.data() as SolDirectedBuildJobRecordV111;
  memoryJobs.set(buildId, job);
  return job;
}

export async function getSolDirectedBuildJobV111(buildId: string): Promise<SolDirectedBuildJobViewV111 | null> {
  const job = memoryJobs.get(buildId) ?? (await loadJobFromFirestore(buildId));
  if (!job) return null;

  let result = memoryResults.get(buildId) ?? null;

  // A completed build whose result is not in this process was almost certainly
  // built by an instance that has since gone away. Recover the deck from its
  // artifacts rather than serving a COMPLETE job with no cards.
  if (!result && jobShouldHaveResultV1(job)) {
    try {
      const rehydrated = await rehydrateSolDirectedBuildResultV1({ job });
      if (rehydrated) {
        result = rehydrated.result;
        // Cached so a page that polls does not re-read Storage each time.
        memoryResults.set(buildId, result);
      } else {
        console.warn(`[sol-directed-build] ${buildId} is COMPLETE but its deck could not be recovered`);
      }
    } catch (err) {
      console.warn(`[sol-directed-build] recovery failed for ${buildId}:`, err);
    }
  }

  return {
    job: { ...job, activityLog: job.activityLog ?? [] },
    result: result ?? undefined,
  };
}

export async function saveSolDirectedBuildResultV111(args: {
  job: SolDirectedBuildJobRecordV111;
  result: SolDirectedBuildResultV111;
}): Promise<SolDirectedBuildJobRecordV111> {
  memoryResults.set(args.job.buildId, args.result);
  const latest =
    memoryJobs.get(args.job.buildId) ?? (await loadJobFromFirestore(args.job.buildId)) ?? args.job;
  const updated: SolDirectedBuildJobRecordV111 = {
    ...latest,
    status: args.result.status,
    statusLabel: SOL_DIRECTED_BUILD_STATUS_LABELS[args.result.status],
    updatedAt: nowIso(),
    completedAt: args.result.status === "COMPLETE" || args.result.status === "FAILED" ? nowIso() : null,
    failureCode: args.result.failureCode,
    failureMessage: args.result.failureMessage,
    validationPass: args.result.validation?.pass ?? null,
    finalClassification: args.result.headProfessor?.classification ?? null,
    finalGrade: args.result.headProfessor?.grade ?? null,
    artifactStoragePrefix: args.result.proofChain ? `deck-build-runs/${args.job.buildId}` : null,
    proofChain: args.result.proofChain,
    telemetry: args.result.telemetry,
    activityLog: latest.activityLog ?? [],
  };
  await persistJob(updated);
  if (updated.status === "COMPLETE" && updated.userId) {
    await saveCustomerDeckFromBuildJob({ job: updated, result: args.result });
  }
  return updated;
}

/** Test helper */
export function clearSolDirectedBuildJobsForTestV111(): void {
  memoryJobs.clear();
  memoryResults.clear();
}

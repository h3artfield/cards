/**
 * Authoritative holdout execution registry — keyed by benchmark content hash.
 * Benchmark envelopes may remain immutable (parserExecutionCount=0 forever);
 * spent state lives here and preflight HARD STOPs when executionCount > 0.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type HoldoutExecutionStatus = "sealed" | "spent";

export type HoldoutExecutionRegistryEntry = {
  benchmarkHash: string;
  benchmarkPath: string;
  validationSet: string;
  executionCount: number;
  status: HoldoutExecutionStatus;
  firstExecutionTimestamp?: string;
  candidateLabel?: string;
  candidateManifestHash?: string;
  candidateGitCommitSha?: string;
  parserBlobClosure?: string;
  policyStackCompositeHash?: string;
  certificateHash?: string;
  executionRecordHash?: string;
  executionRecordPath?: string;
  aggregateHash?: string;
  rawOutputHash?: string;
  note?: string;
};

export type HoldoutExecutionRegistry = {
  registryVersion: "holdout-execution-registry-v1";
  updatedAt: string;
  entries: Record<string, HoldoutExecutionRegistryEntry>;
};

export const HOLDOUT_EXECUTION_REGISTRY_PATH = "data/milestones/holdout-execution-registry-v1.json";

function registryPath(): string {
  return resolve(HOLDOUT_EXECUTION_REGISTRY_PATH);
}

export function readHoldoutExecutionRegistry(): HoldoutExecutionRegistry {
  const path = registryPath();
  if (!existsSync(path)) {
    return {
      registryVersion: "holdout-execution-registry-v1",
      updatedAt: new Date(0).toISOString(),
      entries: {},
    };
  }
  return JSON.parse(readFileSync(path, "utf8")) as HoldoutExecutionRegistry;
}

export function writeHoldoutExecutionRegistry(registry: HoldoutExecutionRegistry): void {
  mkdirSync(resolve("data/milestones"), { recursive: true });
  writeFileSync(registryPath(), `${JSON.stringify({ ...registry, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

export function getHoldoutRegistryEntry(benchmarkHash: string): HoldoutExecutionRegistryEntry | undefined {
  return readHoldoutExecutionRegistry().entries[benchmarkHash];
}

/** HARD STOP if registry records prior official execution for this benchmark hash. */
export function assertHoldoutNotSpent(input: { benchmarkHash: string; label: string }): HoldoutExecutionRegistryEntry | undefined {
  const entry = getHoldoutRegistryEntry(input.benchmarkHash);
  if (entry && entry.executionCount > 0) {
    throw new Error(
      `HARD STOP — ${input.label}: holdout execution registry shows executionCount=${entry.executionCount} ` +
        `for benchmarkHash=${input.benchmarkHash} (status=${entry.status}). ` +
        "Official holdout already spent — benchmark envelope parserExecutionCount is non-authoritative.",
    );
  }
  return entry;
}

export function recordHoldoutExecution(input: {
  benchmarkHash: string;
  benchmarkPath: string;
  validationSet: string;
  candidateLabel?: string;
  candidateManifestHash?: string;
  candidateGitCommitSha?: string;
  parserBlobClosure?: string;
  policyStackCompositeHash?: string;
  certificateHash?: string;
  executionRecordHash: string;
  executionRecordPath: string;
  aggregateHash?: string;
  rawOutputHash?: string;
  timestamp: string;
  note?: string;
}): HoldoutExecutionRegistryEntry {
  const registry = readHoldoutExecutionRegistry();
  const existing = registry.entries[input.benchmarkHash];
  if (existing?.executionCount && existing.executionCount > 0) {
    throw new Error(
      `Refusing duplicate holdout execution registry write for ${input.benchmarkHash}: already spent.`,
    );
  }

  const entry: HoldoutExecutionRegistryEntry = {
    benchmarkHash: input.benchmarkHash,
    benchmarkPath: input.benchmarkPath,
    validationSet: input.validationSet,
    executionCount: 1,
    status: "spent",
    firstExecutionTimestamp: input.timestamp,
    candidateLabel: input.candidateLabel,
    candidateManifestHash: input.candidateManifestHash,
    candidateGitCommitSha: input.candidateGitCommitSha,
    parserBlobClosure: input.parserBlobClosure,
    policyStackCompositeHash: input.policyStackCompositeHash,
    certificateHash: input.certificateHash,
    executionRecordHash: input.executionRecordHash,
    executionRecordPath: input.executionRecordPath,
    aggregateHash: input.aggregateHash,
    rawOutputHash: input.rawOutputHash,
    note: input.note,
  };

  registry.entries[input.benchmarkHash] = entry;
  writeHoldoutExecutionRegistry(registry);
  return entry;
}

export function registryEntryContentHash(entry: HoldoutExecutionRegistryEntry): string {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

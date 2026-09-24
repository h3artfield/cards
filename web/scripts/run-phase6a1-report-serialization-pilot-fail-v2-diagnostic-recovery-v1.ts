#!/usr/bin/env npx tsx
/** Phase 1 diagnostic recovery report for failed gate-v2 serialization pilot run. No rerun. */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-plan-serialization-pilot-fail-v2-diagnostic-recovery-v1.json",
);
const GATE_V2 = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json");
const PILOT_STDOUT_LOG = resolve(MILESTONES, ".serialization-pilot-v8-out/pilot-run-stdout.log");
const TERMINALS_DIR = resolve(
  process.env.USERPROFILE ?? "",
  ".cursor/projects/c-Users-h3art-PycharmProjects-cards/terminals",
);
const PS_HISTORY = resolve(
  process.env.APPDATA ?? "",
  "Microsoft/Windows/PowerShell/PSReadLine/ConsoleHost_history.txt",
);

function searchDirectoryForPattern(dir: string, pattern: RegExp): { searched: boolean; matchCount: number; note: string } {
  if (!existsSync(dir)) {
    return { searched: false, matchCount: 0, note: `Directory absent: ${dir}` };
  }
  let matchCount = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".txt")) continue;
    const text = readFileSync(resolve(dir, name), "utf8");
    if (pattern.test(text)) matchCount += 1;
  }
  return {
    searched: true,
    matchCount,
    note: matchCount === 0 ? "No matches" : `${matchCount} terminal file(s) matched`,
  };
}

function searchFileForPattern(path: string, pattern: RegExp): { present: boolean; match: boolean; note: string } {
  if (!existsSync(path)) {
    return { present: false, match: false, note: "File absent" };
  }
  const text = readFileSync(path, "utf8");
  return {
    present: true,
    match: pattern.test(text),
    note: pattern.test(text) ? "Pattern matched" : "Pattern not matched",
  };
}

function dockerRetainedContainerCheck(): { searched: boolean; retainedCount: number; note: string } {
  const result = spawnSync(
    "docker",
    ["ps", "-a", "--filter", "ancestor=node:22-alpine", "--format", "{{.ID}}"],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    return {
      searched: false,
      retainedCount: 0,
      note: `Docker query failed: ${result.error?.message ?? result.stderr ?? result.stdout ?? "unknown"}`,
    };
  }
  const ids = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    searched: true,
    retainedCount: ids.length,
    note:
      ids.length === 0
        ? "No retained node:22-alpine containers (--rm boundary discards terminated containers)"
        : `${ids.length} retained container(s) found; logs not inspected because none are provably the failed pilot run`,
  };
}

function main() {
  if (!existsSync(GATE_V2)) {
    throw new Error(`Missing prerequisite gate-v2 artifact: ${GATE_V2}`);
  }

  const gateV2 = JSON.parse(readFileSync(GATE_V2, "utf8")) as {
    generatedAt?: string;
    decision?: string;
    containerExitCode?: number;
    invokedShellCommand?: string;
    containerStderrTail?: string;
  };

  const runnerStdoutPattern = /"perCommanderResults"|SERIALIZATION_PILOT_FAIL_CLOSED|"failureClass"/;
  const terminalSearch = searchDirectoryForPattern(TERMINALS_DIR, runnerStdoutPattern);
  const psHistorySearch = searchFileForPattern(PS_HISTORY, /run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1\.ts/);
  const pilotStdoutLogSearch = searchFileForPattern(PILOT_STDOUT_LOG, runnerStdoutPattern);
  const dockerCheck = dockerRetainedContainerCheck();

  const recoverable =
    terminalSearch.matchCount > 0 ||
    (pilotStdoutLogSearch.present && pilotStdoutLogSearch.match) ||
    dockerCheck.retainedCount > 0;

  const report = {
    version: "phase6a1-professor-plan-serialization-pilot-fail-v2-diagnostic-recovery-v1",
    generatedAt: new Date().toISOString(),
    decision: "SERIALIZATION_PILOT_FAIL_V2_DIAGNOSTIC_RECOVERY_FIRST_NO_RERUN",
    phase: "PHASE_1_LOCAL_EVIDENCE_RECOVERY",
    outcome: recoverable ? "PARTIAL_OR_UNVERIFIED" : "ORIGINAL_CONTAINER_STDOUT_NOT_RECOVERABLE",
    instruction: recoverable
      ? "Preserve any recovered stdout as a write-once text artifact before any rerun."
      : "Original container stdout not recoverable from implementation-side/local evidence. Proceed to gate-v3 diagnostic capture successor review only; do not rerun yet.",
    preservedHistoricalEvidence: {
      gateV2Artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json",
      gateV2Sha256: sha256File(GATE_V2),
      gateV2GeneratedAt: gateV2.generatedAt ?? null,
      gateV2Decision: gateV2.decision ?? null,
      gateV2ContainerExitCode: gateV2.containerExitCode ?? null,
      gateV2InvokedShellCommand: gateV2.invokedShellCommand ?? null,
      gateV2StderrTailOnly: true,
      gateV2StderrTailPreview: (gateV2.containerStderrTail ?? "").slice(0, 500),
    },
    searchLocations: [
      {
        kind: "cursor_terminal_capture",
        path: TERMINALS_DIR,
        ...terminalSearch,
      },
      {
        kind: "powershell_history",
        path: PS_HISTORY,
        present: psHistorySearch.present,
        commandHistoryMatch: psHistorySearch.match,
        note: psHistorySearch.note,
      },
      {
        kind: "local_run_log",
        path: PILOT_STDOUT_LOG,
        present: pilotStdoutLogSearch.present,
        runnerStdoutMatch: pilotStdoutLogSearch.match,
        byteSize: existsSync(PILOT_STDOUT_LOG) ? statSync(PILOT_STDOUT_LOG).size : null,
        note: pilotStdoutLogSearch.match
          ? "Log contains runner-like JSON"
          : "Log contains host gate-v2 JSON only, not container runner stdout",
      },
      {
        kind: "docker_desktop_retained_container",
        ...dockerCheck,
      },
      {
        kind: "wrapper_in_memory_buffer",
        note: "gate-v2 wrapper captured container stdout in spawnSync memory only; gate-v2 persisted stderr tail (4000 chars) but not stdout",
      },
    ],
    extractedRunnerSummary: null,
    stdoutRecoveryArtifact: null,
    stdoutRecoveryArtifactSha256: null,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();

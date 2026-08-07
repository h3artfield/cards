/**
 * Mark expansion-check-v1 holdout as spent after milestone #2 diagnosis.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeDatasetContentHash } from "./lib/eval-provenance-guard";

const SPENT = {
  holdoutStatus: "spent_for_development" as const,
  spentReason: "failure-family diagnosis after milestone #2",
  parserExecutionCount: 2,
  spentAt: "2026-08-07T21:30:00.000Z",
  doNotRunExecution: 3,
};

function patchEnvelope(path: string, label: string) {
  const full = resolve(process.cwd(), path);
  const envelope = JSON.parse(readFileSync(full, "utf8")) as Record<string, unknown>;
  const priorHash = envelope.contentHash as string;
  envelope.expansionCheckHoldout = SPENT;
  if (envelope.expansionSplit && typeof envelope.expansionSplit === "object") {
    envelope.expansionSplit = {
      ...(envelope.expansionSplit as Record<string, unknown>),
      checkHoldout: SPENT,
    };
  }
  envelope.contentHash = computeDatasetContentHash(envelope.cases as never[]);
  writeFileSync(full, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ label, path, priorHash, newHash: envelope.contentHash }, null, 2));
}

patchEnvelope("data/oracle-action-eval-development-generalization-expansion-v1.json", "expansion_v1");
patchEnvelope("data/oracle-action-eval-development-generalization-expansion-v2.json", "expansion_v2");

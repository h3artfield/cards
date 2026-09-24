/**
 * Load pinned exposed-benchmark oracle IDs for freshness exclusion (manifest v2, fail-closed).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveBenchmarkCommanderOracleIds } from "../../src/lib/deck-synthesis/benchmark-commander-resolver-v1";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import { sha256File } from "./verify-pinned-catalog-data-state-v2-core";

const MANIFEST_PATH = resolve(
  __dirname,
  "../../data/milestones/deck-synthesis/phase6a1-exposed-benchmark-identities-manifest-v2.json",
);

type ExposedManifest = {
  failClosed: boolean;
  sources: Array<{
    id: string;
    kind: string;
    pathFromMilestones: string;
    sha256: string;
  }>;
  spentRosterSidecars: Array<{ artifact: string; sha256: string }>;
};

type PopulationCase = { commanders?: string[]; commander?: string };

function commanderNamesFromPopulation(data: unknown): string[] {
  const names: string[] = [];
  const record = data as { cases?: PopulationCase[]; commanderIdentities?: string[] };
  for (const c of record.cases ?? []) {
    if (c.commanders) names.push(...c.commanders);
    if (c.commander) names.push(c.commander);
  }
  for (const name of record.commanderIdentities ?? []) {
    names.push(name);
  }
  return names;
}

export type LoadedExposedOracleIds = {
  manifestByteSha256: string;
  excludedOracleIds: Set<string>;
  excludedCommanderNameCount: number;
  unresolvedCommanderNames: string[];
};

export function loadExposedBenchmarkOracleIdsFailClosed(
  catalog: DeckResolutionCatalog,
  milestonesDir?: string,
): LoadedExposedOracleIds {
  const milestones = milestonesDir ?? resolve(__dirname, "../../data/milestones/deck-synthesis");
  const manifestPath = resolve(milestones, "phase6a1-exposed-benchmark-identities-manifest-v2.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`FAIL_CLOSED: missing exposed identities manifest ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ExposedManifest;
  const manifestByteSha256 = sha256File(manifestPath);
  if (!manifest.failClosed) {
    throw new Error("FAIL_CLOSED: exposed identities manifest must be failClosed=true");
  }

  const commanderNames = new Set<string>();

  for (const source of manifest.sources) {
    const sourcePath = resolve(milestones, source.pathFromMilestones);
    if (!existsSync(sourcePath)) {
      throw new Error(`FAIL_CLOSED: missing exposed source ${source.id} at ${sourcePath}`);
    }
    const actualSha = sha256File(sourcePath);
    if (actualSha !== source.sha256) {
      throw new Error(`FAIL_CLOSED: exposed source ${source.id} SHA mismatch (${actualSha} != ${source.sha256})`);
    }
    for (const name of commanderNamesFromPopulation(JSON.parse(readFileSync(sourcePath, "utf8")))) {
      commanderNames.add(name);
    }
  }

  for (const sidecar of manifest.spentRosterSidecars) {
    const sidecarPath = resolve(milestones, sidecar.artifact);
    if (!existsSync(sidecarPath)) {
      throw new Error(`FAIL_CLOSED: missing spent sidecar ${sidecar.artifact}`);
    }
    const actualSha = sha256File(sidecarPath);
    if (actualSha !== sidecar.sha256) {
      throw new Error(`FAIL_CLOSED: spent sidecar ${sidecar.artifact} SHA mismatch`);
    }
    for (const name of commanderNamesFromPopulation(JSON.parse(readFileSync(sidecarPath, "utf8")))) {
      commanderNames.add(name);
    }
  }

  const excludedOracleIds = new Set<string>();
  const unresolvedCommanderNames: string[] = [];
  for (const name of [...commanderNames].sort()) {
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, [name]);
    const audit = resolution.audits[0];
    if (!audit?.resolved || !audit.oracleId) {
      unresolvedCommanderNames.push(name);
      continue;
    }
    excludedOracleIds.add(audit.oracleId);
  }

  if (unresolvedCommanderNames.length > 0) {
    throw new Error(
      `FAIL_CLOSED: ${unresolvedCommanderNames.length} exposed commander names unresolved (first 5: ${unresolvedCommanderNames.slice(0, 5).join("; ")})`,
    );
  }

  return {
    manifestByteSha256,
    excludedOracleIds,
    excludedCommanderNameCount: commanderNames.size,
    unresolvedCommanderNames,
  };
}

/**
 * Implementation-visible union of all previously exposed benchmark commander identities.
 * Used to validate fresh prospective holdout membership without authority imports.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MILESTONES = resolve("data/milestones/deck-synthesis");

function normalizeCommanderIdentity(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function addFromPopulation(path: string, set: Set<string>): void {
  if (!existsSync(path)) return;
  const pop = JSON.parse(readFileSync(path, "utf8")) as { cases?: Array<{ commanders?: string[] }> };
  for (const c of pop.cases ?? []) {
    for (const cmd of c.commanders ?? []) set.add(normalizeCommanderIdentity(cmd));
    if ((c.commanders ?? []).length > 1) {
      set.add(normalizeCommanderIdentity((c.commanders ?? []).join(" // ")));
    }
  }
}

export function loadExposedBenchmarkCommanderIdentities(): Set<string> {
  const exposed = new Set<string>();
  const files = [
    "phase6a1-professor-plan-dev36-population-v2.json",
    "phase6a1-professor-plan-holdout24-population-v2.json",
    "phase6a1-professor-plan-holdout24-v3-population-v3.json",
    "phase6a1-professor-plan-holdout-prospective-v4-population-v4.json",
    "phase6a1-professor-plan-holdout-prospective-v5-population-v5.json",
    "phase6a1-professor-plan-holdout-prospective-v6-population-v6.json",
    "phase6a1-professor-plan-holdout-prospective-v7-population-v7.json",
    "phase6a1-professor-plan-holdout-prospective-v8-population-v8.json",
  ];
  for (const f of files) addFromPopulation(resolve(MILESTONES, f), exposed);

  const spentPipelineV1 = resolve(
    MILESTONES,
    "phase6a1-professor-plan-prospective-commander-selection-policy-v1.json",
  );
  if (existsSync(spentPipelineV1)) {
    const policy = JSON.parse(readFileSync(spentPipelineV1, "utf8")) as {
      slots?: Array<{ primaryCommander?: string; alternatesOrdered?: string[] }>;
    };
    for (const slot of policy.slots ?? []) {
      if (slot.primaryCommander) exposed.add(normalizeCommanderIdentity(slot.primaryCommander));
      for (const alt of slot.alternatesOrdered ?? []) exposed.add(normalizeCommanderIdentity(alt));
    }
  }

  const v8Manifest = resolve(
    MILESTONES,
    "phase6a1-professor-plan-experiment-v3-amended-v8/phase6a1-professor-plan-experiment-manifest-v3-amended-v8.json",
  );
  if (existsSync(v8Manifest)) {
    const manifest = JSON.parse(readFileSync(v8Manifest, "utf8")) as {
      cases?: Array<{ commander?: string; commanders?: string[] }>;
    };
    for (const c of manifest.cases ?? []) {
      if (c.commander) exposed.add(normalizeCommanderIdentity(c.commander));
      for (const cmd of c.commanders ?? []) exposed.add(normalizeCommanderIdentity(cmd));
    }
  }
  return exposed;
}

export function assertFreshHoldoutMembership(
  commanders: string[],
  label: string,
  exposed = loadExposedBenchmarkCommanderIdentities(),
): void {
  for (const name of commanders) {
    if (exposed.has(normalizeCommanderIdentity(name))) {
      throw new Error(`${label}: commander previously exposed: ${name}`);
    }
  }
  if (commanders.length > 1 && exposed.has(normalizeCommanderIdentity(commanders.join(" // ")))) {
    throw new Error(`${label}: partner identity previously exposed: ${commanders.join(" // ")}`);
  }
}

export { normalizeCommanderIdentity };

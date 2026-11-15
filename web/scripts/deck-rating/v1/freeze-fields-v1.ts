#!/usr/bin/env npx tsx
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256File, snapshotRoot, writeJson } from "./lib";

export function freezeFieldsV1(): Record<string, unknown> {
  const snap = snapshotRoot();
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    joined: number;
    decks: Array<{ playgroupName: string; last3Years: boolean; mtgjsonCode: string | null }>;
  };
  const fit = JSON.parse(readFileSync(join(snap, "fit", "casual-fit-v1.json"), "utf8")) as {
    labels: Array<{ name: string; measured: number; last3Years: boolean; W: number; y: number }>;
  };
  const arch = JSON.parse(readFileSync(join(snap, "archidekt", "summary.json"), "utf8")) as {
    fieldCounts: { b3: number; b4: number };
    filters: unknown;
    funnel: unknown;
    targetMet?: unknown;
  };
  const b2 = fit.labels.filter((r) => r.last3Years && r.measured === 2);
  const b5 = JSON.parse(readFileSync(join(snap, "b5", "summary.json"), "utf8"));
  const cedhPath = join(snap, "fit", "cedh-fit-v1.json");
  const cedh = existsSync(cedhPath) ? JSON.parse(readFileSync(cedhPath, "utf8")) : null;
  const report = {
    version: "deck-rating-fields-v1",
    snapshotDate: "2026-09-25",
    b2: {
      role: "comparison set, not training",
      n: b2.length,
      names: b2.map((r) => r.name),
      filter: "official precons from the last 3 years that measure B2",
    },
    b3: { n: arch.fieldCounts.b3, source: "archidekt", filters: arch.filters },
    b4: { n: arch.fieldCounts.b4, source: "archidekt" },
    b5: { n: b5.uniqueIdentitySets, source: "topdeck-cedh-identity-sets", rawUncommitted: true },
    labels: { rankedPrecons: 82, joinable: labels.joined, used: labels.joined },
    funnel: arch.funnel,
    targetMet: arch.targetMet ?? null,
    casualFit: {
      keepMeanCardStrength: false,
      featuresUsed: ["commanderPrior", "interaction", "cardFlow", "manaBase"],
      medianPreconW: 500,
    },
    cedhFit: cedh
      ? { nTrain: cedh.nPods?.train, nTest: cedh.nPods?.test, weights: cedh.weights, test: cedh.test }
      : null,
  };
  writeJson(join(snap, "fields", "FIELDS.json"), report);
  return { ...report, dest: join(snap, "fields", "FIELDS.json"), sha256: sha256File(join(snap, "fields", "FIELDS.json")) };
}

if (require.main === module) {
  console.log(JSON.stringify(freezeFieldsV1(), null, 2));
}

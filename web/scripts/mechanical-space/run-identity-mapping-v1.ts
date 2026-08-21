/**
 * Map Commander Spellbook card identities onto our Golden/snapshot oracleIds.
 * Run: cd web && npx tsx scripts/mechanical-space/run-identity-mapping-v1.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { mechanicalSpacePath } from "../../src/lib/mechanical-space/artifact-paths";
import {
  buildOracleIdentityIndex,
  mapExternalCard,
  summarizeIdentityMappings,
} from "../../src/lib/mechanical-space/identity-mapping";
import { assertMechanicalSpaceReadOnly } from "../../src/lib/mechanical-space/safety";
import type { OracleCardRef } from "../../src/lib/mechanical-space/types";

assertMechanicalSpaceReadOnly("run-identity-mapping-v1");

type SnapshotRow = { oracleId: string; name: string };
type SpellbookCard = { id: number; name: string; oracleId?: string };

function loadOracleRefs(): OracleCardRef[] {
  const indexPath = mechanicalSpacePath("semantic-oracle-snapshot-v1", "index.jsonl");
  if (!existsSync(indexPath)) {
    throw new Error("Semantic snapshot missing. Run extract-semantic-oracle-snapshot-v1.ts first.");
  }
  return readFileSync(indexPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SnapshotRow)
    .map((r) => ({ oracleId: r.oracleId, name: r.name }));
}

function main() {
  const outDir = mechanicalSpacePath("oracle-identity-mapping-v1");
  mkdirSync(outDir, { recursive: true });
  const cardsPath = mechanicalSpacePath("spellbook-reference-normalization-v1", "cards-slim.json");
  if (!existsSync(cardsPath)) {
    throw new Error("Spellbook sample missing. Run fetch-spellbook-research-sample-v1.ts first.");
  }
  const cards = JSON.parse(readFileSync(cardsPath, "utf8")) as SpellbookCard[];
  const index = buildOracleIdentityIndex(loadOracleRefs());
  const mappings = cards.map((c) =>
    mapExternalCard({ externalId: String(c.id), name: c.name, oracleId: c.oracleId }, index),
  );
  const summary = summarizeIdentityMappings(mappings);
  writeFileSync(resolve(outDir, "mappings.jsonl"), mappings.map((m) => JSON.stringify(m)).join("\n") + "\n");
  const report = {
    version: "oracle-identity-mapping-v1",
    createdAt: new Date().toISOString(),
    ...summary,
  };
  writeFileSync(resolve(outDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();

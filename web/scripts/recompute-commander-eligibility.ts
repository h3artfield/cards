/**
 * Recompute commander eligibility v2 across all catalogOracleCards.
 * Run: npx --yes tsx scripts/recompute-commander-eligibility.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { deriveOracleCommanderFields } from "../src/lib/deck-builder/catalog-oracle-card";
import type { GoldenCatalogOracleCard } from "../src/lib/deck-builder/golden-catalog/schemas";
import { COMMANDER_ELIGIBILITY_VERSION } from "../src/lib/deck-builder/commander-classification";

loadEnvLocal();

interface ClassificationCounts {
  totalOracleCards: number;
  eligibleCommanders: number;
  legendaryCreatureCommanders: number;
  explicitTextCommanders: number;
  pairedConfigurationCommanders: number;
  ineligibleCards: number;
  unknownClassifications: number;
  byBasis: Record<string, number>;
}

async function main() {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    console.error("Firestore required");
    process.exit(1);
  }

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  const counts: ClassificationCounts = {
    totalOracleCards: 0,
    eligibleCommanders: 0,
    legendaryCreatureCommanders: 0,
    explicitTextCommanders: 0,
    pairedConfigurationCommanders: 0,
    ineligibleCards: 0,
    unknownClassifications: 0,
    byBasis: {},
  };

  const samples: Record<string, GoldenCatalogOracleCard> = {};
  let batch = db.batch();
  let batchOps = 0;
  let updated = 0;

  const snap = await db.collection(COLLECTIONS.catalogOracleCards).get();
  counts.totalOracleCards = snap.size;

  for (const doc of snap.docs) {
    const existing = doc.data() as GoldenCatalogOracleCard;
    const commanderFields = deriveOracleCommanderFields({
      name: existing.canonicalName,
      typeLine: existing.typeLine,
      oracleText: existing.oracleText,
      colorIdentity: existing.colorIdentity ?? [],
      legalities: existing.legalities,
    });

    const c = commanderFields.commanderClassification;
    counts.byBasis[c.eligibilityBasis] = (counts.byBasis[c.eligibilityBasis] ?? 0) + 1;

    if (c.canOccupyCommandZone) counts.eligibleCommanders += 1;
    else counts.ineligibleCards += 1;

    if (c.eligibilityBasis === "legendary_creature") counts.legendaryCreatureCommanders += 1;
    if (c.eligibilityBasis === "explicit_can_be_commander_text") counts.explicitTextCommanders += 1;
    if (
      c.eligibilityBasis === "background_configuration" ||
      c.eligibilityBasis === "partner_configuration"
    ) {
      counts.pairedConfigurationCommanders += 1;
    }
    if (c.commanderFormatStatus === "unknown") counts.unknownClassifications += 1;

    if (existing.canonicalName === "Sculpting Steel") samples.sculptingSteel = existing;
    if (/aetherspouts/i.test(existing.canonicalName)) samples.aetherspouts = existing;
    if (c.eligibilityBasis === "legendary_creature" && c.canOccupyCommandZone && !samples.positiveLegendary) {
      samples.positiveLegendary = existing;
    }
    if (c.eligibilityBasis === "explicit_can_be_commander_text" && !samples.positiveExplicit) {
      samples.positiveExplicit = existing;
    }

    batch.set(
      doc.ref,
      {
        commanderClassification: commanderFields.commanderClassification,
        commanderEligibility: commanderFields.commanderEligibility,
        commanderEligibilityVersion: COMMANDER_ELIGIBILITY_VERSION,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    batchOps += 1;
    updated += 1;

    if (batchOps >= 500) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
      console.log(`  updated ${updated}/${counts.totalOracleCards}…`);
    }
  }

  if (batchOps > 0) await batch.commit();

  // Refresh samples after write
  for (const [key, lookup] of [
    ["sculptingSteel", "Sculpting Steel"],
    ["aetherspouts", "Aetherspouts"],
  ] as const) {
    const q = await db
      .collection(COLLECTIONS.catalogOracleCards)
      .where("canonicalName", "==", lookup)
      .limit(1)
      .get();
    if (q.docs[0]) {
      samples[key] = q.docs[0].data() as GoldenCatalogOracleCard;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    commanderEligibilityVersion: COMMANDER_ELIGIBILITY_VERSION,
    counts,
    samples: {
      sculptingSteel: samples.sculptingSteel
        ? {
            canonicalName: samples.sculptingSteel.canonicalName,
            commanderClassification: samples.sculptingSteel.commanderClassification,
            commanderEligibility: samples.sculptingSteel.commanderEligibility,
          }
        : null,
      aetherspouts: samples.aetherspouts
        ? {
            canonicalName: samples.aetherspouts.canonicalName,
            commanderClassification: samples.aetherspouts.commanderClassification,
          }
        : null,
      positiveLegendary: samples.positiveLegendary
        ? {
            canonicalName: samples.positiveLegendary.canonicalName,
            commanderClassification: samples.positiveLegendary.commanderClassification,
          }
        : null,
      positiveExplicit: samples.positiveExplicit
        ? {
            canonicalName: samples.positiveExplicit.canonicalName,
            commanderClassification: samples.positiveExplicit.commanderClassification,
          }
        : null,
    },
  };

  const outPath = resolve(process.cwd(), "reports", "commander-eligibility-v2-recompute.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Commander eligibility v2 recompute complete\n");
  console.log(JSON.stringify(counts, null, 2));
  console.log(`\nReport: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

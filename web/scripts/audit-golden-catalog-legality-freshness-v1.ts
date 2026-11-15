#!/usr/bin/env npx tsx
/**
 * Golden Catalog legality freshness audit — Commander format metadata reconciliation.
 * Catalog integrity task; not Phase 5 semantic work.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  assessCommanderLegality,
  SET_PRERELEASE_CALENDAR,
  scanStalePrereleaseLegalityCohort,
} from "../src/lib/deck-synthesis/benchmark-commander-legality-v1.1";

loadProjectEnvLocal();

const COMMANDER_BANNED_ORACLE_NAMES = [
  "Golos, Tireless Pilgrim",
  "Erayo, Soratami Ascendant // Erayo's Essence",
  "Griselbrand",
];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const outDir = resolve(process.cwd(), "data/milestones/catalog-shadow");
  mkdirSync(outDir, { recursive: true });
  const legalityAsOf = new Date().toISOString();

  const bannedCards: Array<Record<string, unknown>> = [];
  const prereleaseStale: Array<Record<string, unknown>> = [];
  const recentlyReleasedNotLegal: Array<Record<string, unknown>> = [];
  const previewFuture: Array<Record<string, unknown>> = [];
  const nonConstructed: Array<Record<string, unknown>> = [];
  const digitalOnly: Array<Record<string, unknown>> = [];
  const structurallyEligibleButNotLegal: Array<Record<string, unknown>> = [];

  for (const card of catalog.byOracleId.values()) {
    const assessment = assessCommanderLegality({ catalog, card, legalityAsOf });
    const paper = catalog.paperByOracleId.get(card.oracleId);
    const row = {
      oracleId: card.oracleId,
      canonicalName: card.canonicalName,
      setCode: card.releaseInformation?.setCode ?? null,
      setName: card.releaseInformation?.setName ?? null,
      releasedAt: card.releaseInformation?.releasedAt ?? null,
      scryfallCommander: card.legalities?.commander ?? null,
      paperPopulationFrame: paper?.paperPopulationFrame ?? "UNKNOWN",
      structuralCommandZoneEligibility: assessment.structuralCommandZoneEligibility,
      currentCommanderFormatLegality: assessment.currentCommanderFormatLegality,
      staleLegalityMetadata: assessment.staleLegalityMetadata,
      liveCommanderLegal: assessment.liveCommanderLegal,
      legalitySource: assessment.legalitySource,
      legalityReason: assessment.legalityReason,
      catalogUpdatedAt: card.updatedAt,
      bulkUpdatedAt: card.evidence?.bulkUpdatedAt ?? null,
    };

    if (assessment.currentCommanderFormatLegality === "BANNED") {
      bannedCards.push(row);
    }
    if (assessment.staleLegalityMetadata) {
      prereleaseStale.push(row);
    }
    if (assessment.currentCommanderFormatLegality === "NOT_YET_LEGAL") {
      previewFuture.push(row);
    }
    if (assessment.currentCommanderFormatLegality === "NON_CONSTRUCTED") {
      nonConstructed.push(row);
    }
    if (assessment.currentCommanderFormatLegality === "DIGITAL_ONLY") {
      digitalOnly.push(row);
    }
    if (
      assessment.structuralCommandZoneEligibility === "ELIGIBLE" &&
      card.legalities?.commander === "not_legal" &&
      !assessment.staleLegalityMetadata &&
      assessment.currentCommanderFormatLegality !== "NON_CONSTRUCTED" &&
      assessment.currentCommanderFormatLegality !== "NOT_YET_LEGAL"
    ) {
      structurallyEligibleButNotLegal.push(row);
    }
  }

  const hobCohort = scanStalePrereleaseLegalityCohort({ catalog, setCode: "hob", legalityAsOf });
  const hobEligibleStale = hobCohort.filter((c) => c.structuralCommandZoneEligibility === "ELIGIBLE");

  const bannedSpotCheck = COMMANDER_BANNED_ORACLE_NAMES.map((name) => {
    const matches = [...catalog.byOracleId.values()].filter((c) => c.canonicalName === name);
    return matches.map((card) => {
      const a = assessCommanderLegality({ catalog, card, legalityAsOf });
      return {
        canonicalName: card.canonicalName,
        scryfallCommander: card.legalities?.commander,
        structurallyCanBeCommander: a.structurallyCanBeCommander,
        currentCommanderFormatLegality: a.currentCommanderFormatLegality,
      };
    });
  }).flat();

  const report = {
    version: "golden-catalog-legality-freshness-audit-v1",
    generatedAt: legalityAsOf,
    legalityAsOf,
    catalogUniverse: catalog.catalogUniverse,
    setPrereleaseCalendar: SET_PRERELEASE_CALENDAR,
    purpose:
      "Reconcile Golden Catalog Commander format legality against Wizards banned policy, prerelease timing, non-Constructed frame, and digital-only population.",
    summary: {
      totalOracleCards: catalog.byOracleId.size,
      commanderBanned: bannedCards.length,
      prereleaseStaleMetadata: prereleaseStale.length,
      previewNotYetLegal: previewFuture.length,
      nonConstructed: nonConstructed.length,
      digitalOnlyCommanderRelevant: digitalOnly.length,
      structurallyEligibleScryfallNotLegalUnreconciled: structurallyEligibleButNotLegal.length,
      hobStaleCohortTotal: hobCohort.length,
      hobStructurallyEligibleStale: hobEligibleStale.length,
    },
    mismatches: {
      prereleaseStaleMetadata: prereleaseStale.sort((a, b) =>
        String(a.canonicalName).localeCompare(String(b.canonicalName)),
      ),
      structurallyEligibleScryfallNotLegalUnreconciled: structurallyEligibleButNotLegal
        .slice(0, 100)
        .sort((a, b) => String(a.canonicalName).localeCompare(String(b.canonicalName))),
      hobStaleCohort: hobEligibleStale,
    },
    cohorts: {
      commanderBanned: bannedCards.slice(0, 50),
      previewFuture: previewFuture.slice(0, 50),
      nonConstructedSample: nonConstructed.slice(0, 50),
      digitalOnlySample: digitalOnly.slice(0, 50),
    },
    spotChecks: {
      commanderBannedList: bannedSpotCheck,
      fili: prereleaseStale.find((r) => r.canonicalName === "Fíli the Pathfinder") ?? null,
      bilbo: prereleaseStale.find((r) => r.canonicalName === "Bilbo, Thief in the Night") ?? null,
      macie: nonConstructed.find((r) => r.canonicalName === "Grand Marshal Macie") ?? null,
      golos: bannedSpotCheck.find((r) => r.canonicalName === "Golos, Tireless Pilgrim") ?? null,
    },
    recommendations: [
      "Refresh Golden Catalog Scryfall legalities import after main-set release dates, or overlay Wizards prerelease policy in catalog pipeline.",
      "Do not use raw commander=not_legal as sole benchmark invalidation — require provenance-aware legality assessment.",
      "HOB cohort requires catalog legality refresh: Scryfall lags Wizards prerelease Commander legality.",
    ],
    authorization: {
      catalogPipelineFix: "AUTHORIZED — separate from Phase 5.6 semantic repairs",
      phase56: "WAIT",
    },
  };

  const outPath = resolve(outDir, "golden-catalog-legality-freshness-audit-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");

  const hobReleasedUnreconciled = hobCohort.filter(
    (c) => c.scryfallCommanderLegality === "not_legal" && !c.liveCommanderLegal,
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        hash,
        summary: report.summary,
        spotChecks: report.spotChecks,
        hobStaleSample: hobEligibleStale.slice(0, 10),
        hobReleasedUnreconciled: hobReleasedUnreconciled.length,
      },
      null,
      2,
    ),
  );

  if (hobReleasedUnreconciled.length > 0) {
    console.error(
      `FAIL: ${hobReleasedUnreconciled.length} The Hobbit cards still not Commander-legal after release — add set policy to commander-format-legality-snapshot-v1.json or refresh golden catalog import.`,
    );
    process.exit(1);
  }

  if (report.summary.structurallyEligibleScryfallNotLegalUnreconciled > 0) {
    console.error(
      `WARN: ${report.summary.structurallyEligibleScryfallNotLegalUnreconciled} structural commanders still unreconciled against stale not_legal — review golden-catalog-legality-freshness-audit-v1.json`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

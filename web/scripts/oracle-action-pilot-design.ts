/**
 * 500-card Oracle-action extraction pilot — design and gate checklist.
 * Does NOT run full extraction until production gates pass on eval set.
 *
 * Run: npx tsx scripts/oracle-action-pilot-design.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PRODUCTION_GATES } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

const PILOT_CATEGORIES = [
  "vanilla creatures",
  "modal spells",
  "split/adventure/aftermath",
  "transforming/MDFC",
  "sagas/classes/rooms",
  "planeswalkers",
  "replacement effects",
  "activated chains",
  "triggered chains",
  "multi-face cards",
  "commander staples",
  "unsupported layouts",
];

const MANUAL_AUDIT_REQUIREMENTS = [
  "Every low-confidence extraction (confidence < 0.85)",
  "Every unsupported layout (mutate, prototype, dungeon, etc.)",
  "Random 10% sample of high-confidence extractions",
  "All cards producing > 5 actions",
  "All cards receiving roles: board wipe, tutor, combo piece, cast-from-exile payoff",
];

const report = {
  generatedAt: new Date().toISOString(),
  status: "NOT_STARTED",
  reason: "Production field-level gates not met on 204-case eval set — pilot blocked",
  pilotSize: 500,
  selectionCriteria: {
    diverseOracleCards: true,
    categories: PILOT_CATEGORIES,
    perCategoryMinimum: Math.ceil(500 / PILOT_CATEGORIES.length),
  },
  manualAuditRequirements: MANUAL_AUDIT_REQUIREMENTS,
  productionGatesRequired: ORACLE_ACTION_PRODUCTION_GATES,
  pilotPassCriteria: "All production gates met on pilot audit sample before 38,542-card extraction",
  blockedUntil: [
    "Balanced rulings audit closed",
    "204+ eval cases pass field-level gates",
    "Deterministic parser with evidence-span validation complete",
  ],
};

const outPath = resolve(process.cwd(), "reports", "oracle-action-pilot-design.json");
mkdirSync(resolve(outPath, ".."), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(`Pilot design (blocked): ${outPath}`);

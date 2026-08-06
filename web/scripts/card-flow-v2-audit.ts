/**
 * Batch V2 audit — compare production pricing vs shadow market on stored cards.
 * Run: npm run card-flow-v2:audit -- --limit 50
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { runCardAuditV2 } from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import {
  printAuditSummary,
  summarizeV2Audits,
} from "../src/lib/card-flow-v2/audit/audit-summary";
import { computeCardOfferPreviewV2 } from "../src/lib/card-flow-v2/offer/run-card-offer-preview-v2";
import { mergeLiveRegressionFixtures } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { StoreRule } from "../src/lib/types";
import type {
  CardFlowV2AuditRecord,
  V2AuditAgreement,
} from "../src/lib/card-flow-v2/audit/types";
import type { ScannedCard } from "../src/lib/types";

function loadEnvLocal() {
  try {
    const p = resolve(__dirname, "../.env.local");
    const text = readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

type CliOptions = {
  limit: number;
  categories: string[];
  onlyDisagreements: boolean;
  onlyHighRisk: boolean;
  output: "text" | "json" | "csv";
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    limit: 50,
    categories: [],
    onlyDisagreements: false,
    onlyHighRisk: false,
    output: "text",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit" && argv[i + 1]) {
      opts.limit = parseInt(argv[++i], 10) || opts.limit;
    } else if (arg === "--category" && argv[i + 1]) {
      opts.categories.push(argv[++i].toLowerCase());
    } else if (arg === "--only-disagreements") {
      opts.onlyDisagreements = true;
    } else if (arg === "--only-high-risk") {
      opts.onlyHighRisk = true;
    } else if (arg === "--output" && argv[i + 1]) {
      const fmt = argv[++i].toLowerCase();
      if (fmt === "json" || fmt === "csv") opts.output = fmt;
    }
  }
  return opts;
}

function normalizeCategory(cat?: string): string {
  if (!cat) return "unknown";
  if (cat === "magic") return "mtg";
  return cat;
}

function hasV2Data(card: ScannedCard): boolean {
  return Boolean(
    card.cardFlowV2Evidence ||
      card.cardFlowV2Identity ||
      card.cardFlowV2Market ||
      card.cardFlowV2Audit,
  );
}

function isDisagreement(agreement: V2AuditAgreement): boolean {
  return (
    agreement === "v2_higher" ||
    agreement === "v2_lower" ||
    agreement === "current_has_price_v2_none" ||
    agreement === "v2_has_price_current_none"
  );
}

function auditToCsvRow(r: CardFlowV2AuditRecord): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [
    r.cardId,
    r.orderId ?? "",
    r.category,
    r.currentMarketPrice ?? "",
    r.priceComparison.v2ValueMedian ?? "",
    r.priceComparison.agreement,
    r.riskLevel,
    r.v2Locked,
    r.acceptedCompCount,
    r.issues.join(";"),
  ]
    .map((v) => esc(String(v)))
    .join(",");
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));

  const orders = (await dataStore.getOrders()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  let cards: ScannedCard[] = [];
  for (const order of orders) {
    const orderCards = await dataStore.getCardsByOrder(order.id);
    for (const card of orderCards) {
      if (hasV2Data(card)) cards.push(card);
    }
  }

  cards = mergeLiveRegressionFixtures(cards);

  let records: CardFlowV2AuditRecord[] = cards.map((card) =>
    runCardAuditV2({ card }),
  );

  if (opts.categories.length) {
    const allowed = new Set(opts.categories.map((c) => (c === "magic" ? "mtg" : c)));
    records = records.filter((r) => allowed.has(normalizeCategory(r.category)));
  }

  if (opts.onlyDisagreements) {
    records = records.filter((r) => isDisagreement(r.priceComparison.agreement));
  }

  if (opts.onlyHighRisk) {
    records = records.filter(
      (r) => r.riskLevel === "high" || r.riskLevel === "critical",
    );
  }

  records = records.slice(0, opts.limit);

  const auditedCards = cards.filter((c) => records.some((r) => r.cardId === c.id));

  const snapshots =
    auditedCards.flatMap((c) => c.cardFlowV2Market?.snapshots ?? []) ?? [];

  const emptyRules: StoreRule[] = [];
  const offerPreviews = auditedCards.map((card) =>
    card.cardFlowV2OfferPreview ??
      computeCardOfferPreviewV2({
        card,
        settings: { id: "audit", ...DEFAULT_STORE_SETTINGS },
        rules: emptyRules,
      }),
  );

  const summary = summarizeV2Audits(records, snapshots, offerPreviews, cards.slice(0, 50));

  if (opts.output === "json") {
    console.log(JSON.stringify({ summary, records }, null, 2));
    return;
  }

  if (opts.output === "csv") {
    console.log(
      "cardId,orderId,category,currentMarketPrice,v2Median,agreement,riskLevel,v2Locked,acceptedComps,issues",
    );
    for (const r of records) console.log(auditToCsvRow(r));
    return;
  }

  console.log(`Audited ${records.length} cards (from ${cards.length} with V2 data)`);
  printAuditSummary(summary);

  const withComps = records.filter((r) => r.acceptedCompCount > 0).length;
  const noComps = records.filter((r) => r.acceptedCompCount === 0).length;
  console.log(`\nCards with accepted comps: ${withComps}`);
  console.log(`Cards with no accepted comps: ${noComps}`);
  console.log(
    `Current vs V2 matches: ${summary.agreementCounts.matches_current ?? 0}`,
  );
  console.log(`V2 higher: ${summary.agreementCounts.v2_higher ?? 0}`);
  console.log(`V2 lower: ${summary.agreementCounts.v2_lower ?? 0}`);
  console.log(
    `Large disagreements: ${summary.examples.largeDisagreements.length}`,
  );
  console.log(
    `High/critical risk: ${(summary.riskCounts.high ?? 0) + (summary.riskCounts.critical ?? 0)}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

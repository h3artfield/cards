/**
 * Directive 006L — pricing safety sweep across staging cards.
 * Run: npm run card-flow-v2:pricing-safety-audit -- --limit 100
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import {
  bucketCounts,
  runPricingSafetyAudit,
  type PricingSafetyFinding,
} from "../src/lib/card-flow-v2/audit/pricing-safety-audit";
import { mergeLiveRegressionFixtures } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { applyStaffConfirmPricingRefresh } from "../src/lib/card-flow-v2/staff-confirm-pricing";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard } from "../src/lib/types";
import type { StoreRule } from "../src/lib/types";

function loadEnvLocal() {
  try {
    const p = resolve(__dirname, "../.env.local");
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] == null) {
        process.env[key] = trimmed.slice(eq + 1).trim();
      }
    }
  } catch {
    /* optional */
  }
  for (const flag of [
    "CARD_FLOW_V2_EVIDENCE_ENABLED",
    "CARD_FLOW_V2_IDENTITY_ENABLED",
    "CARD_FLOW_V2_MARKET_ENABLED",
    "CARD_FLOW_V2_AUDIT_ENABLED",
    "CARD_FLOW_V2_OFFER_PREVIEW_ENABLED",
  ]) {
    process.env[flag] = "true";
  }
}

type CliOptions = {
  limit: number;
  output: "text" | "json" | "csv";
  minRisk: "low" | "medium" | "high" | "critical";
  refresh: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    limit: 100,
    output: "text",
    minRisk: "low",
    refresh: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit" && argv[i + 1]) {
      opts.limit = parseInt(argv[++i], 10) || opts.limit;
    } else if (arg === "--output" && argv[i + 1]) {
      const fmt = argv[++i].toLowerCase();
      if (fmt === "json" || fmt === "csv") opts.output = fmt;
    } else if (arg === "--min-risk" && argv[i + 1]) {
      const r = argv[++i].toLowerCase();
      if (["low", "medium", "high", "critical"].includes(r)) {
        opts.minRisk = r as CliOptions["minRisk"];
      }
    } else if (arg === "--no-refresh") {
      opts.refresh = false;
    } else if (arg === "--refresh") {
      opts.refresh = true;
    }
  }
  return opts;
}

function hasV2Data(card: ScannedCard): boolean {
  return Boolean(
    card.cardFlowV2Evidence ||
      card.cardFlowV2Identity ||
      card.cardFlowV2Market ||
      card.cardFlowV2Audit,
  );
}

const RISK_ORDER = ["critical", "high", "medium", "low"] as const;

function meetsMinRisk(
  bucket: PricingSafetyFinding["riskBucket"],
  min: CliOptions["minRisk"],
): boolean {
  return RISK_ORDER.indexOf(bucket) <= RISK_ORDER.indexOf(min);
}

function fmtPct(n?: number): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function fmtMoney(n?: number): string {
  if (n == null || n <= 0) return "—";
  return `$${n.toFixed(2)}`;
}

function findingToCsvRow(f: PricingSafetyFinding): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [
    f.cardId,
    f.orderId ?? "",
    f.cardName,
    f.confirmedIdentity,
    f.productionMarketPrice ?? "",
    f.v2PreviewMarket ?? "",
    f.percentDifference != null ? (f.percentDifference * 100).toFixed(1) : "",
    f.absoluteDifference ?? "",
    f.suspectedBadSource ?? "",
    f.reason,
    f.recommendedStaffAction,
    f.riskBucket,
    f.signals.join(";"),
  ]
    .map((v) => esc(String(v)))
    .join(",");
}

function printTable(findings: PricingSafetyFinding[]) {
  const header = [
    "risk",
    "cardId",
    "orderId",
    "name",
    "identity",
    "production",
    "v2 preview",
    "diff %",
    "diff $",
    "bad source",
    "reason",
    "action",
  ];
  console.log(header.join("\t"));
  for (const f of findings) {
    console.log(
      [
        f.riskBucket,
        f.cardId.slice(0, 8),
        (f.orderId ?? "").slice(0, 8),
        f.cardName.slice(0, 28),
        f.confirmedIdentity.slice(0, 40),
        fmtMoney(f.productionMarketPrice),
        fmtMoney(f.v2PreviewMarket),
        fmtPct(f.percentDifference),
        f.absoluteDifference != null ? `$${f.absoluteDifference.toFixed(2)}` : "—",
        f.suspectedBadSource ?? "—",
        f.reason.slice(0, 50),
        f.recommendedStaffAction.slice(0, 40),
      ].join("\t"),
    );
  }
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));

  const orders = (await dataStore.getOrders()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  let cards: ScannedCard[] = [];
  for (const order of orders) {
    for (const card of await dataStore.getCardsByOrder(order.id)) {
      if (hasV2Data(card)) cards.push(card);
    }
  }
  cards = mergeLiveRegressionFixtures(cards);

  const settings = { ...DEFAULT_STORE_SETTINGS, id: "pricing-safety-audit" };
  const rules: StoreRule[] = [];

  if (opts.refresh) {
    const refreshed: ScannedCard[] = [];
    for (const card of cards) {
      if (card.cardFlowV2Identity?.staffSelection?.suspectId) {
        try {
          const result = await applyStaffConfirmPricingRefresh({
            card,
            identity: card.cardFlowV2Identity,
            market: card.cardFlowV2Market,
            evidence: card.cardFlowV2Evidence,
            settings,
            rules,
            manualRefresh: true,
          });
          refreshed.push({
            ...card,
            cardFlowV2Identity: result.cardFlowV2Identity,
            cardFlowV2Market: result.cardFlowV2Market,
            cardFlowV2OfferPreview: result.cardFlowV2OfferPreview,
            cardFlowV2Audit: result.cardFlowV2Audit,
          });
          continue;
        } catch {
          /* fall through to stored snapshot */
        }
      }
      refreshed.push(card);
    }
    cards = refreshed;
  }

  let findings = runPricingSafetyAudit(cards);
  findings = findings.filter((f) => meetsMinRisk(f.riskBucket, opts.minRisk));
  findings = findings.slice(0, opts.limit);

  const counts = bucketCounts(findings);

  if (opts.output === "json") {
    console.log(
      JSON.stringify(
        {
          scannedCards: cards.length,
          findingCount: findings.length,
          bucketCounts: counts,
          findings,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (opts.output === "csv") {
    console.log(
      "cardId,orderId,cardName,confirmedIdentity,productionMarketPrice,v2PreviewMarket,percentDifference,absoluteDifference,suspectedBadSource,reason,recommendedStaffAction,riskBucket,signals",
    );
    for (const f of findings) console.log(findingToCsvRow(f));
    return;
  }

  console.log("Directive 006L — Pricing Safety Audit\n");
  console.log(`Scanned ${cards.length} cards with V2 data`);
  console.log(`Findings: ${findings.length}`);
  console.log(
    `Buckets — critical: ${counts.critical}, high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low}`,
  );
  console.log("");

  if (findings.length) {
    printTable(findings);
  } else {
    console.log("No pricing safety findings.");
  }

  const tyrannosaurus = findings.find((f) =>
    /ravenous tyrannosaurus/i.test(f.cardName),
  );
  if (tyrannosaurus) {
    console.log("\n--- Ravenous Tyrannosaurus (006K validation card) ---");
    console.log(`Risk: ${tyrannosaurus.riskBucket}`);
    console.log(`Production: ${fmtMoney(tyrannosaurus.productionMarketPrice)}`);
    console.log(`V2 preview: ${fmtMoney(tyrannosaurus.v2PreviewMarket)}`);
    console.log(`Difference: ${fmtPct(tyrannosaurus.percentDifference)}`);
    console.log(`Reason: ${tyrannosaurus.reason}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

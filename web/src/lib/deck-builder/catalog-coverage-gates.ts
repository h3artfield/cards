import type { InventoryItem } from "../types";
import type { CommanderSelectionPolicy } from "../store-inventory/resolved-clerk-request";
import { ORACLE_TAG_ROLE_MAP } from "./functional-profile";
import {
  DEFAULT_POOL_COVERAGE_THRESHOLD_PCT,
} from "./version-constants";

export type DeckBuildRole =
  | "ramp"
  | "draw"
  | "interaction"
  | "lands"
  | "synergy"
  | "finishers"
  | "overall";

export type RequestCoverageMode = "warn" | "block";

export interface RequestScopedCoverageConfig {
  mode: RequestCoverageMode;
  /** Warn when role pool oracle-id coverage falls below this (configurable). */
  poolCoverageThresholdPct: number;
}

export interface RequestScopedCoverageInput {
  commanderSelectionPolicy: CommanderSelectionPolicy;
  requestedCommanderName?: string;
  commanderOracleId?: string;
  commanderColors?: string[];
  /** Magic inventory rows in scope for this request. */
  candidatePool: InventoryItem[];
  config?: Partial<RequestScopedCoverageConfig>;
}

export interface RoleCoverageMetrics {
  role: DeckBuildRole;
  total: number;
  withOracleId: number;
  oracleIdPct: number;
}

export interface RequestScopedCoverageResult {
  hardBlock: boolean;
  warnings: string[];
  blockReasons: string[];
  roleCoverage: RoleCoverageMetrics[];
  overallOracleIdPct: number;
  mode: RequestCoverageMode;
  thresholdPct: number;
  loggedAt: string;
}

const ROLE_TAG_MAP: Record<DeckBuildRole, string[]> = {
  ramp: ["ramp"],
  draw: ["card_advantage"],
  interaction: ["spot_removal", "board_wipe", "countermagic", "protection"],
  lands: [],
  synergy: ["token_enabler", "sacrifice_outlet", "graveyard_enabler", "tutor", "recursion"],
  finishers: ["finisher"],
  overall: [],
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function itemHasRole(item: InventoryItem, role: DeckBuildRole): boolean {
  if (role === "overall") return true;
  if (role === "lands") {
    const type = (item.catalogTypeLine ?? item.displayName ?? "").toLowerCase();
    return type.includes("land") || /\bisland\b|\bplains\b|\bforest\b|\bswamp\b|\bmountain\b/.test(type);
  }
  const tags = (item.catalogOracleTags ?? []).map((t) => t.toLowerCase());
  const roleKeys = ROLE_TAG_MAP[role];
  for (const tag of tags) {
    for (const [slug, mappedRoles] of Object.entries(ORACLE_TAG_ROLE_MAP)) {
      if (tag.includes(slug) || slug.includes(tag)) {
        if (mappedRoles.some((r) => roleKeys.includes(r))) return true;
      }
    }
  }
  return false;
}

function computeRoleCoverage(
  pool: InventoryItem[],
  role: DeckBuildRole,
): RoleCoverageMetrics {
  const scoped = role === "overall" ? pool : pool.filter((item) => itemHasRole(item, role));
  const total = scoped.length;
  const withOracleId = scoped.filter((item) => item.catalogOracleId?.trim()).length;
  return {
    role,
    total,
    withOracleId,
    oracleIdPct: pct(withOracleId, total),
  };
}

/**
 * Request-scoped catalog coverage assessment.
 * Hard blocks: unresolved exact commander, missing canonical identity, unvalidated color identity.
 * Warn-only (default): low oracle-id coverage in the relevant candidate pool by deck role.
 */
export function assessRequestScopedCoverage(
  input: RequestScopedCoverageInput,
): RequestScopedCoverageResult {
  const config: RequestScopedCoverageConfig = {
    mode: input.config?.mode ?? "warn",
    poolCoverageThresholdPct:
      input.config?.poolCoverageThresholdPct ?? DEFAULT_POOL_COVERAGE_THRESHOLD_PCT,
  };

  const blockReasons: string[] = [];
  const warnings: string[] = [];

  if (
    input.commanderSelectionPolicy === "exact_commander_required" &&
    input.requestedCommanderName?.trim() &&
    !input.commanderOracleId?.trim()
  ) {
    blockReasons.push(
      `Exact commander "${input.requestedCommanderName}" lacks a canonical Oracle ID — cannot verify identity or legality.`,
    );
  }

  if (
    input.commanderOracleId?.trim() &&
    input.commanderColors === undefined
  ) {
    blockReasons.push(
      "Commander Oracle ID is present but color identity could not be validated.",
    );
  }

  const roles: DeckBuildRole[] = [
    "overall",
    "ramp",
    "draw",
    "interaction",
    "lands",
    "synergy",
    "finishers",
  ];
  const roleCoverage = roles.map((role) =>
    computeRoleCoverage(input.candidatePool, role),
  );
  const overall = roleCoverage.find((r) => r.role === "overall")!;
  const overallOracleIdPct = overall.oracleIdPct;

  for (const metric of roleCoverage) {
    if (metric.role === "overall" || metric.total < 5) continue;
    if (metric.oracleIdPct < config.poolCoverageThresholdPct) {
      warnings.push(
        `${metric.role} candidate pool oracle-id coverage is ${metric.oracleIdPct.toFixed(1)}% (${metric.withOracleId}/${metric.total}) — below ${config.poolCoverageThresholdPct}% threshold.`,
      );
    }
  }

  const hardBlock = blockReasons.length > 0;

  return {
    hardBlock,
    warnings,
    blockReasons,
    roleCoverage,
    overallOracleIdPct,
    mode: config.mode,
    thresholdPct: config.poolCoverageThresholdPct,
    loggedAt: new Date().toISOString(),
  };
}

/** @deprecated Global gate removed — use assessRequestScopedCoverage. */
export interface CatalogCoverageGateResult {
  allowed: boolean;
  message?: string;
  oracleIdPct: number;
  thresholdPct: number;
}

/** @deprecated Use assessRequestScopedCoverage — kept for transitional callers. */
export function assessDeckBuildCatalogGate(
  coverage: { rates: { oracleIdPct: number }; counts: { total: number } } | null | undefined,
): CatalogCoverageGateResult {
  const oracleIdPct = coverage?.rates.oracleIdPct ?? 0;
  const thresholdPct = DEFAULT_POOL_COVERAGE_THRESHOLD_PCT;
  return {
    allowed: true,
    oracleIdPct,
    thresholdPct,
    message:
      oracleIdPct < thresholdPct
        ? `Global oracle-id coverage ${oracleIdPct.toFixed(1)}% — request-scoped assessment will warn per role.`
        : undefined,
  };
}

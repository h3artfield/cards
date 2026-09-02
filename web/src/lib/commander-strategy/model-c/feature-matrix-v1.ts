import type { FeatureColumnFamily, ModelCVariant } from "./types";

export type FeatureColumnSpec = {
  name: string;
  family: FeatureColumnFamily;
};

export type FeatureMatrix = {
  rowKeys: string[];
  columns: FeatureColumnSpec[];
  values: number[][];
};

export type ColumnPruningReport = {
  inputColumnCount: number;
  removedZeroVariance: string[];
  removedConstant: string[];
  removedDuplicate: string[];
  removedInvalidNumeric: string[];
  scalingFailures: string[];
  outputColumnCount: number;
};

const VARIANCE_EPS = 1e-12;

function familyForColumn(name: string): FeatureColumnFamily {
  if (name.startsWith("basic_")) return "BASIC_STRUCTURE";
  if (name.startsWith("gc_")) return "GAME_CHANGER";
  if (name.startsWith("rc8_action_")) return "RC8_ACTIONS";
  if (name.startsWith("rc8_ability_")) return "RC8_ABILITY_STRUCTURES";
  if (name.startsWith("rc8_zone_") || name.startsWith("rc8_density_")) return "RC8_ZONES_TRANSITIONS";
  if (name.startsWith("rc8_owner_")) return "RC8_OWNERSHIP_CONTEXT";
  if (name.startsWith("rc8_role_")) return "RC8_DERIVED_ROLES";
  if (name.startsWith("rc8_attack_")) return "RC8_ATTACK_VECTORS";
  if (name.startsWith("rc8_vuln_") || name.startsWith("rc8_dep_")) return "RC8_VULNERABILITY_VECTORS";
  if (name.startsWith("rc8_missing_")) return "RC8_MISSINGNESS";
  if (name.startsWith("card_id_")) return "CARD_ID";
  return "BASIC_STRUCTURE";
}

function sanitizeNumeric(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value;
}

export function buildFeatureMatrix(input: {
  rowKeys: string[];
  featureMaps: Array<Record<string, number>>;
  columnOrder?: string[];
}): FeatureMatrix {
  const columnSet = new Set<string>();
  for (const row of input.featureMaps) {
    for (const key of Object.keys(row)) columnSet.add(key);
  }
  const columns = [...(input.columnOrder ?? [...columnSet].sort())];
  const values = input.featureMaps.map((row) =>
    columns.map((col) => sanitizeNumeric(row[col] ?? 0)),
  );
  return {
    rowKeys: input.rowKeys,
    columns: columns.map((name) => ({ name, family: familyForColumn(name) })),
    values,
  };
}

export function pruneFeatureMatrixTrainOnly(
  matrix: FeatureMatrix,
  options?: { columnAllowlist?: string[] },
): { matrix: FeatureMatrix; report: ColumnPruningReport } {
  const allow = options?.columnAllowlist ? new Set(options.columnAllowlist) : null;
  const colIndices = matrix.columns
    .map((c, i) => ({ name: c.name, i }))
    .filter((c) => (allow ? allow.has(c.name) : true));
  const subMatrix: FeatureMatrix = {
    rowKeys: matrix.rowKeys,
    columns: colIndices.map((c) => matrix.columns[c.i]!),
    values: matrix.values.map((row) => colIndices.map((c) => row[c.i] ?? 0)),
  };
  const pruned = pruneFeatureMatrixTrainOnlyInternal(subMatrix);
  if (!allow) return pruned;
  return pruned;
}

function pruneFeatureMatrixTrainOnlyInternal(
  matrix: FeatureMatrix,
): { matrix: FeatureMatrix; report: ColumnPruningReport } {
  const rowCount = matrix.values.length;
  const colCount = matrix.columns.length;
  const removedZeroVariance: string[] = [];
  const removedConstant: string[] = [];
  const removedDuplicate: string[] = [];
  const removedInvalidNumeric: string[] = [];
  const scalingFailures: string[] = [];

  const keep = new Array(colCount).fill(true);

  for (let j = 0; j < colCount; j += 1) {
    let invalid = 0;
    for (let i = 0; i < rowCount; i += 1) {
      const raw = matrix.values[i]?.[j];
      if (raw === undefined || !Number.isFinite(raw)) invalid += 1;
    }
    if (invalid === rowCount) {
      keep[j] = false;
      removedInvalidNumeric.push(matrix.columns[j]!.name);
    }
  }

  for (let j = 0; j < colCount; j += 1) {
    if (!keep[j]) continue;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < rowCount; i += 1) {
      const v = sanitizeNumeric(matrix.values[i]?.[j] ?? 0);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
    const mean = rowCount > 0 ? sum / rowCount : 0;
    let varSum = 0;
    for (let i = 0; i < rowCount; i += 1) {
      const v = sanitizeNumeric(matrix.values[i]?.[j] ?? 0);
      varSum += (v - mean) ** 2;
    }
    const variance = rowCount > 0 ? varSum / rowCount : 0;
    if (variance < VARIANCE_EPS) {
      keep[j] = false;
      removedZeroVariance.push(matrix.columns[j]!.name);
      if (Math.abs(min - max) < VARIANCE_EPS) removedConstant.push(matrix.columns[j]!.name);
      scalingFailures.push(matrix.columns[j]!.name);
    }
  }

  const signatureToFirst = new Map<string, number>();
  for (let j = 0; j < colCount; j += 1) {
    if (!keep[j]) continue;
    const sig = matrix.values.map((row) => sanitizeNumeric(row[j] ?? 0).toFixed(8)).join("|");
    const first = signatureToFirst.get(sig);
    if (first === undefined) {
      signatureToFirst.set(sig, j);
    } else {
      keep[j] = false;
      removedDuplicate.push(matrix.columns[j]!.name);
    }
  }

  const keptIdx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  const nextColumns = keptIdx.map((i) => matrix.columns[i]!);
  const nextValues = matrix.values.map((row) => keptIdx.map((i) => sanitizeNumeric(row[i] ?? 0)));

  return {
    matrix: {
      rowKeys: matrix.rowKeys,
      columns: nextColumns,
      values: nextValues,
    },
    report: {
      inputColumnCount: colCount,
      removedZeroVariance,
      removedConstant,
      removedDuplicate,
      removedInvalidNumeric,
      scalingFailures,
      outputColumnCount: nextColumns.length,
    },
  };
}

export function variantColumnNames(
  variant: ModelCVariant,
  basicNames: string[],
  gameChangerNames: string[],
  semanticNames: string[],
  cardIdNames: string[],
): string[] {
  const gBlock = [...basicNames, ...gameChangerNames];
  switch (variant) {
    case "C0":
      return basicNames;
    case "G":
      return gBlock;
    case "C1":
      return [...gBlock, ...semanticNames];
    case "ID":
      return [...gBlock, ...cardIdNames];
    case "C2":
      return [...gBlock, ...semanticNames, ...cardIdNames];
    default:
      return basicNames;
  }
}

export function assertBasicBlockNestedness(input: {
  basicColumns: string[];
  bundles: Array<{ deckHash: string; basicStructure: Record<string, number> }>;
  variants: Array<{ label: string; project: (basic: Record<string, number>) => Record<string, number> }>;
  sampleSize?: number;
}): { pass: boolean; mismatches: string[]; extraBasicColumnInC1?: string } {
  const mismatches: string[] = [];
  const sample = input.bundles.slice(0, input.sampleSize ?? 50);
  for (const variant of input.variants) {
    for (const bundle of sample) {
      const projected = variant.project(bundle.basicStructure);
      for (const col of input.basicColumns) {
        const a = bundle.basicStructure[col] ?? 0;
        const b = projected[col];
        if (b === undefined) {
          mismatches.push(`${variant.label} missing basic column ${col} for deck ${bundle.deckHash}`);
        } else if (Math.abs(a - b) > 1e-12) {
          mismatches.push(
            `${variant.label} value mismatch ${col} deck ${bundle.deckHash}: ${a} vs ${b}`,
          );
        }
      }
      for (const key of Object.keys(projected)) {
        if (key.startsWith("basic_") && !input.basicColumns.includes(key)) {
          mismatches.push(`${variant.label} unexpected basic column ${key} (deck ${bundle.deckHash})`);
        }
      }
    }
  }
  return { pass: mismatches.length === 0, mismatches };
}

export function familyDimensions(columns: FeatureColumnSpec[]): Record<FeatureColumnFamily, number> {
  const counts: Record<FeatureColumnFamily, number> = {
    BASIC_STRUCTURE: 0,
    GAME_CHANGER: 0,
    RC8_ACTIONS: 0,
    RC8_ABILITY_STRUCTURES: 0,
    RC8_ZONES_TRANSITIONS: 0,
    RC8_OWNERSHIP_CONTEXT: 0,
    RC8_DERIVED_ROLES: 0,
    RC8_ATTACK_VECTORS: 0,
    RC8_VULNERABILITY_VECTORS: 0,
    RC8_MISSINGNESS: 0,
    CARD_ID: 0,
  };
  for (const col of columns) counts[col.family] += 1;
  return counts;
}

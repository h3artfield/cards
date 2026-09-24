/**
 * Regex-based runtime local import closure for Professor v3 smoke execute runners.
 * Self-contained — no TypeScript compiler dependency.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { MILESTONES, REPO, WEB } from "./phase6a1-pinned-implementation-container-v1";
import type { ProfessorV3SmokeMaterialSourceV3 } from "./phase6a1-professor-v3-smoke-material-pins-v3";

export const PROFESSOR_V3_RUNTIME_LOCAL_IMPORT_CLOSURE_V1_VERSION =
  "phase6a1-professor-v3-runtime-local-import-closure-v1";

export const CHATTERFANG_EXECUTE_RUNNER_PATH = resolve(
  REPO,
  "web/scripts/run-phase6a1-execute-smoke-professor-v3-chatterfang-prospective-v1.ts",
);

export const PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS = [
  resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts"),
  resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1.ts"),
] as const;

const LOCAL_EXTENSIONS = [".ts", ".tsx", ".js", ".json"] as const;
const INDEX_SUFFIXES = ["/index.ts", "/index.tsx", "/index.js"] as const;

export type RuntimeLocalImportClosureCollectResultV1 = {
  closure: Set<string>;
  externalImports: Set<string>;
};

export type RuntimeLocalImportClosureAuditResultV1 = {
  pass: boolean;
  unpinnedLocalImports: string[];
  extraPinnedNotInClosure: string[];
  externalImports: string[];
  pinnedCount: number;
  reachableCount: number;
};

function isExistingFile(path: string): boolean {
  if (!existsSync(path)) return false;
  return statSync(path).isFile();
}

function normalizeAbsolutePath(path: string): string {
  return normalize(resolve(path));
}

function isBarePackageSpecifier(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  if (specifier.startsWith(".") || specifier.startsWith("/")) return false;
  return true;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function isTypeOnlyImportExportStatement(statement: string): boolean {
  const trimmed = statement.trim();
  return /^(import|export)\s+type\b/.test(trimmed) || /^export\s+type\s+\{/.test(trimmed);
}

function extractModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const lines = stripComments(source).split(/\r?\n/);
  let pending = "";

  const flushPending = () => {
    if (!pending) return;
    const statement = pending.trim();
    pending = "";
    if (!statement) return;
    if (isTypeOnlyImportExportStatement(statement)) return;

    for (const match of statement.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      specifiers.push(match[1]!);
    }

    for (const match of statement.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      specifiers.push(match[1]!);
    }

    const sideEffect = statement.match(/^\s*import\s+["']([^"']+)["']/);
    if (sideEffect) specifiers.push(sideEffect[1]!);
  };

  for (const line of lines) {
    const trimmedLine = line.replace(/\/\/.*$/, "").trim();
    if (!trimmedLine) continue;
    pending = pending ? `${pending} ${trimmedLine}` : trimmedLine;

    const complete =
      pending.endsWith(";") ||
      /\bfrom\s+["'][^"']+["']\s*;?\s*$/.test(pending) ||
      /import\s*\(\s*["'][^"']+["']\s*\)\s*;?\s*$/.test(pending) ||
      /^\s*import\s+["'][^"']+["']\s*;?\s*$/.test(pending);

    if (complete) flushPending();
  }

  flushPending();
  return specifiers;
}

function extractResolveLiteralPaths(source: string, repoRoot: string): string[] {
  const paths: string[] = [];
  for (const match of source.matchAll(/resolve\s*\(\s*MILESTONES\s*,\s*["']([^"']+)["']\s*\)/g)) {
    paths.push(resolve(MILESTONES, match[1]!));
  }
  for (const match of source.matchAll(/resolve\s*\(\s*REPO\s*,\s*["'](web\/[^"']+)["']\s*\)/g)) {
    paths.push(resolve(repoRoot, match[1]!));
  }
  return paths;
}

function resolveLocalModulePath(fromFile: string, specifier: string): string | null {
  if (isBarePackageSpecifier(specifier)) return null;

  const base = resolve(dirname(fromFile), specifier);
  if (isExistingFile(base)) return normalizeAbsolutePath(base);

  for (const ext of LOCAL_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (isExistingFile(candidate)) return normalizeAbsolutePath(candidate);
  }

  for (const suffix of INDEX_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (isExistingFile(candidate)) return normalizeAbsolutePath(candidate);
  }

  return null;
}

function isExternalAbsolutePath(path: string, externalAbsolutePaths: Set<string>): boolean {
  return externalAbsolutePaths.has(normalizeAbsolutePath(path));
}

export function collectRuntimeLocalImportClosureV1(
  entryPath: string,
  options?: {
    externalAbsolutePaths?: Set<string>;
    webRoot?: string;
    repoRoot?: string;
  },
): RuntimeLocalImportClosureCollectResultV1 {
  const repoRoot = options?.repoRoot ?? REPO;
  const externalAbsolutePaths = new Set(
    [...(options?.externalAbsolutePaths ?? [])].map(normalizeAbsolutePath),
  );

  const closure = new Set<string>();
  const externalImports = new Set<string>();
  const queue: string[] = [];

  const entry = normalizeAbsolutePath(entryPath);
  if (!isExistingFile(entry)) {
    throw new Error(`Entry path is not a readable file: ${entry}`);
  }

  queue.push(entry);

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (closure.has(current)) continue;
    closure.add(current);

    const source = readFileSync(current, "utf8");

    for (const literalPath of extractResolveLiteralPaths(source, repoRoot)) {
      const normalized = normalizeAbsolutePath(literalPath);
      if (!isExistingFile(normalized)) continue;
      if (isExternalAbsolutePath(normalized, externalAbsolutePaths)) {
        externalImports.add(normalized);
        continue;
      }
      if (!closure.has(normalized)) queue.push(normalized);
    }

    for (const specifier of extractModuleSpecifiers(source)) {
      if (isBarePackageSpecifier(specifier)) {
        externalImports.add(specifier);
        continue;
      }

      const resolved = resolveLocalModulePath(current, specifier);
      if (!resolved) {
        externalImports.add(specifier);
        continue;
      }

      if (isExternalAbsolutePath(resolved, externalAbsolutePaths)) {
        externalImports.add(resolved);
        continue;
      }

      if (!closure.has(resolved)) queue.push(resolved);
    }
  }

  return { closure, externalImports };
}

export function auditRuntimeLocalImportClosureV1(args: {
  entryPath: string;
  pinnedAbsolutePaths: Iterable<string>;
  externalAbsolutePaths?: Set<string>;
}): RuntimeLocalImportClosureAuditResultV1 {
  const pinned = new Set([...args.pinnedAbsolutePaths].map(normalizeAbsolutePath));
  const { closure, externalImports } = collectRuntimeLocalImportClosureV1(args.entryPath, {
    externalAbsolutePaths: args.externalAbsolutePaths,
  });

  const unpinnedLocalImports = [...closure]
    .filter((path) => !pinned.has(path))
    .sort((a, b) => a.localeCompare(b));
  const extraPinnedNotInClosure = [...pinned]
    .filter((path) => !closure.has(path))
    .sort((a, b) => a.localeCompare(b));

  let pinnedCount = 0;
  for (const path of closure) {
    if (pinned.has(path)) pinnedCount += 1;
  }

  return {
    pass: unpinnedLocalImports.length === 0 && extraPinnedNotInClosure.length === 0,
    unpinnedLocalImports,
    extraPinnedNotInClosure,
    externalImports: [...externalImports].sort((a, b) => a.localeCompare(b)),
    pinnedCount,
    reachableCount: closure.size,
  };
}

export function buildMaterialSourcesFromClosureV1(
  closurePaths: Iterable<string>,
): ProfessorV3SmokeMaterialSourceV3[] {
  const unique = [...new Set([...closurePaths].map(normalizeAbsolutePath))];
  unique.sort((a, b) => a.localeCompare(b));
  return unique.map((path) => ({
    label: basename(path, extname(path)),
    path,
  }));
}

export function buildProfessorV3ChatterfangRequiredRuntimeMaterialInputSourcesV1(): ProfessorV3SmokeMaterialSourceV3[] {
  return [
    {
      label: "phase6a1-professor-plan-model-pin-v2-json",
      path: join(MILESTONES, "phase6a1-professor-plan-model-pin-v2.json"),
    },
    {
      label: "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1",
      path: join(MILESTONES, "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1.json"),
    },
  ];
}

export const PROFESSOR_V3_CHATTERFANG_REQUIRED_RUNTIME_MATERIAL_INPUTS_V1: readonly ProfessorV3SmokeMaterialSourceV3[] =
  buildProfessorV3ChatterfangRequiredRuntimeMaterialInputSourcesV1();

export function professorV3ChatterfangRequiredRuntimeMaterialInputPathSetV1(): Set<string> {
  return new Set(PROFESSOR_V3_CHATTERFANG_REQUIRED_RUNTIME_MATERIAL_INPUTS_V1.map((source) => normalizeAbsolutePath(source.path)));
}

export type RuntimeMaterialInputBindingAuditResultV1 = {
  pass: boolean;
  requiredMaterialInputCount: number;
  discoveredMaterialInputCount: number;
  missingRequiredMaterialInputs: string[];
  unpinnedMaterialInputs: string[];
  extraMaterialInputsNotDiscovered: string[];
};

export function buildMaterialInputSourcesV1(paths: Iterable<string>): ProfessorV3SmokeMaterialSourceV3[] {
  const requiredByPath = new Map(
    PROFESSOR_V3_CHATTERFANG_REQUIRED_RUNTIME_MATERIAL_INPUTS_V1.map((source) => [
      normalizeAbsolutePath(source.path),
      source.label,
    ]),
  );
  const unique = [...new Set([...paths].map(normalizeAbsolutePath))];
  unique.sort((a, b) => a.localeCompare(b));
  return unique.map((path) => ({
    label: requiredByPath.get(path) ?? basename(path, extname(path)),
    path,
  }));
}

export function mergeProfessorV3SmokeMaterialSourcesV1(
  moduleSources: ProfessorV3SmokeMaterialSourceV3[],
  materialInputSources: ProfessorV3SmokeMaterialSourceV3[],
): ProfessorV3SmokeMaterialSourceV3[] {
  const merged = new Map<string, ProfessorV3SmokeMaterialSourceV3>();
  for (const source of [...moduleSources, ...materialInputSources]) {
    merged.set(normalizeAbsolutePath(source.path), source);
  }
  return [...merged.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function auditRuntimeMaterialInputBindingV1(args: {
  moduleClosurePaths: Iterable<string>;
  materialInputPaths: Iterable<string>;
  pinnedAbsolutePaths: Iterable<string>;
  requiredMaterialInputs?: readonly ProfessorV3SmokeMaterialSourceV3[];
}): RuntimeMaterialInputBindingAuditResultV1 {
  const moduleClosure = new Set([...args.moduleClosurePaths].map(normalizeAbsolutePath));
  const materialInputs = new Set([...args.materialInputPaths].map(normalizeAbsolutePath));
  const pinned = new Set([...args.pinnedAbsolutePaths].map(normalizeAbsolutePath));
  const required = args.requiredMaterialInputs ?? PROFESSOR_V3_CHATTERFANG_REQUIRED_RUNTIME_MATERIAL_INPUTS_V1;

  const missingRequiredMaterialInputs = required
    .map((source) => normalizeAbsolutePath(source.path))
    .filter((path) => !pinned.has(path))
    .sort((a, b) => a.localeCompare(b));

  const unpinnedMaterialInputs = [...materialInputs]
    .filter((path) => !pinned.has(path))
    .sort((a, b) => a.localeCompare(b));

  const pinnedJsonOutsideModuleClosure = [...pinned]
    .filter((path) => path.endsWith(".json") && !moduleClosure.has(path))
    .sort((a, b) => a.localeCompare(b));

  const extraMaterialInputsNotDiscovered = pinnedJsonOutsideModuleClosure
    .filter((path) => !materialInputs.has(path))
    .sort((a, b) => a.localeCompare(b));

  return {
    pass:
      missingRequiredMaterialInputs.length === 0 &&
      unpinnedMaterialInputs.length === 0 &&
      extraMaterialInputsNotDiscovered.length === 0,
    requiredMaterialInputCount: required.length,
    discoveredMaterialInputCount: materialInputs.size,
    missingRequiredMaterialInputs,
    unpinnedMaterialInputs,
    extraMaterialInputsNotDiscovered,
  };
}

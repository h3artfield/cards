/**
 * Pinned Docker implementation execution boundary — same boundary as ACL proof v2.
 * Mounts git-archive+overlay tree read-only; never mounts benchmark-authority or Docker socket.
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "../../..");
export const WEB = resolve(REPO, "web");
export const MILESTONES = resolve(REPO, "web/data/milestones/deck-synthesis");

export const CONTAINER_IMAGE = "node:22-alpine";
export const CONTAINER_IMAGE_DIGEST =
  "sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32";

const VERIFIER_ENV_KEYS = ["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_KEY"] as const;
const PILOT_EXTRA_ENV_KEYS = ["OPENAI_API_KEY"] as const;

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256Bytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function dockerMountPath(absPath: string): string {
  return absPath.replace(/\\/g, "/");
}

function shouldSkipOverlay(relFromWeb: string): boolean {
  const norm = relFromWeb.replace(/\\/g, "/");
  return (
    norm.startsWith("node_modules/") ||
    norm.startsWith(".next/") ||
    norm.startsWith(".cache/") ||
    norm.startsWith("out/")
  );
}

function overlayCopyWeb(stagingRoot: string): number {
  let copied = 0;
  function walk(absDir: string, relDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (shouldSkipOverlay(rel)) continue;
      const abs = join(absDir, entry.name);
      const dest = join(stagingRoot, "web", rel);
      if (entry.isDirectory()) {
        mkdirSync(dest, { recursive: true });
        walk(abs, rel);
      } else {
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(abs, dest);
        copied += 1;
      }
    }
  }
  walk(WEB, "");
  return copied;
}

export function buildImplementationExecutionTree(): {
  stagingRoot: string;
  stagingTreeRoot: string;
  archiveByteSha256: string;
  overlayFileCount: number;
  treeManifestSha256: string;
  treeFileCount: number;
} {
  const stagingRoot = mkdtempSync(join(tmpdir(), "phase6a1-impl-exec-tree-"));
  const tarPath = join(stagingRoot, "repo.tar");
  const extractDir = join(stagingRoot, "tree");
  mkdirSync(extractDir, { recursive: true });
  const archive = spawnSync("git", ["-C", REPO, "archive", "--format=tar", "-o", tarPath, "HEAD"], {
    encoding: "utf8",
  });
  if (archive.status !== 0) throw new Error(`git archive failed: ${archive.stderr || archive.stdout}`);
  const archiveByteSha256 = sha256File(tarPath);
  const untar = spawnSync("tar", ["-xf", tarPath, "-C", extractDir], { encoding: "utf8" });
  if (untar.status !== 0) throw new Error(`tar extract failed: ${untar.stderr || untar.stdout}`);
  const overlayFileCount = overlayCopyWeb(extractDir);
  const stagingTreeRoot = extractDir;

  const entries: Array<{ relPath: string; sha256: string }> = [];
  function walk(absDir: string, relDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else entries.push({ relPath: rel.replace(/\\/g, "/"), sha256: sha256File(abs) });
    }
  }
  walk(stagingTreeRoot, "");
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const treeManifestSha256 = sha256Bytes(JSON.stringify(entries));

  if (existsSync(resolve(stagingTreeRoot, "benchmark-authority"))) {
    throw new Error("FAIL_CLOSED: staged implementation tree must not contain benchmark-authority/");
  }

  return {
    stagingRoot,
    stagingTreeRoot,
    archiveByteSha256,
    overlayFileCount,
    treeManifestSha256,
    treeFileCount: entries.length,
  };
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function buildFilteredEnvFile(keys: readonly string[], includePilotSecrets = false): string {
  const envPath = resolve(WEB, ".env.local");
  const parsed = parseEnvFile(envPath);
  const selected = includePilotSecrets ? [...VERIFIER_ENV_KEYS, ...PILOT_EXTRA_ENV_KEYS] : [...VERIFIER_ENV_KEYS];
  const lines: string[] = [];
  for (const key of selected) {
    const fromProcess = process.env[key]?.trim();
    const fromFile = parsed[key]?.trim();
    const value = fromProcess || fromFile;
    if (!value) continue;
    lines.push(`${key}=${value}`);
  }
  if (lines.length === 0) {
    throw new Error(`FAIL_CLOSED: no scoped credentials found for keys: ${selected.join(", ")}`);
  }
  const envFile = mkdtempSync(join(tmpdir(), "phase6a1-scoped-env-"));
  const envFilePath = join(envFile, "scoped.env");
  writeFileSync(envFilePath, `${lines.join("\n")}\n`);
  return envFilePath;
}

export type PinnedContainerRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  invokedShellCommand: string;
  dockerArgv: string[];
  boundary: {
    containerImage: string;
    containerImageDigest: string;
    implementationExecutionTreeManifestSha256: string;
    implementationExecutionTreeFileCount: number;
    benchmarkAuthorityMounted: false;
    dockerSocketMounted: false;
    nodeModulesHostMount: true;
    artifactOutputMount: string;
  };
};

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function buildPinnedContainerShellCommand(scriptRelFromWeb: string, scriptArgs: readonly string[] = []): string {
  return ["npx", "--yes", "tsx", scriptRelFromWeb, ...scriptArgs].map(shellQuote).join(" ");
}

export function buildPinnedContainerDockerInvocation(opts: {
  stagingTreeRoot: string;
  artifactOutDir: string;
  envFilePath: string;
  scriptRelFromWeb: string;
  scriptArgs?: readonly string[];
  extraEnv?: Record<string, string>;
}): { dockerArgv: string[]; invokedShellCommand: string } {
  const nodeModules = resolve(WEB, "node_modules");
  const invokedShellCommand = buildPinnedContainerShellCommand(opts.scriptRelFromWeb, opts.scriptArgs ?? []);
  const dockerArgv = [
    "run",
    "--rm",
    "-v",
    `${dockerMountPath(opts.stagingTreeRoot)}:/implementation:ro`,
    "-v",
    `${dockerMountPath(nodeModules)}:/implementation/web/node_modules:ro`,
    "-v",
    `${dockerMountPath(opts.artifactOutDir)}:/artifact-out:rw`,
    "--env-file",
    dockerMountPath(opts.envFilePath),
    "-e",
    "PHASE6A1_IMPLEMENTATION_CONTAINER=1",
    "-e",
    "PHASE6A1_ARTIFACT_OUTPUT_DIR=/artifact-out",
    "-w",
    "/implementation/web",
  ];
  for (const [k, v] of Object.entries(opts.extraEnv ?? {})) {
    dockerArgv.push("-e", `${k}=${v}`);
  }
  dockerArgv.push(
    `${CONTAINER_IMAGE}@${CONTAINER_IMAGE_DIGEST}`,
    "sh",
    "-c",
    invokedShellCommand,
  );
  return { dockerArgv, invokedShellCommand };
}

export function runInPinnedImplementationContainer(opts: {
  stagingTreeRoot: string;
  artifactOutDir: string;
  envFilePath: string;
  scriptRelFromWeb: string;
  scriptArgs?: readonly string[];
  extraEnv?: Record<string, string>;
  treeManifestSha256: string;
  treeFileCount: number;
}): PinnedContainerRunResult {
  mkdirSync(opts.artifactOutDir, { recursive: true });
  const nodeModules = resolve(WEB, "node_modules");
  if (!existsSync(nodeModules)) {
    throw new Error("FAIL_CLOSED: host web/node_modules missing; required read-only mount into container");
  }

  const { dockerArgv, invokedShellCommand } = buildPinnedContainerDockerInvocation(opts);

  const result = spawnSync("docker", dockerArgv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return {
    exitCode: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    invokedShellCommand,
    dockerArgv,
    boundary: {
      containerImage: CONTAINER_IMAGE,
      containerImageDigest: CONTAINER_IMAGE_DIGEST,
      implementationExecutionTreeManifestSha256: opts.treeManifestSha256,
      implementationExecutionTreeFileCount: opts.treeFileCount,
      benchmarkAuthorityMounted: false,
      dockerSocketMounted: false,
      nodeModulesHostMount: true,
      artifactOutputMount: opts.artifactOutDir,
    },
  };
}

export function cleanupStagingRoot(stagingRoot: string | undefined): void {
  if (stagingRoot) rmSync(stagingRoot, { recursive: true, force: true });
}

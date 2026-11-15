#!/usr/bin/env npx tsx
/**
 * Plan §8.3: Java 17 + latest Forge release, then the 24 harness jobs.
 *
 *   cd web && npx --yes tsx scripts/deck-rating/v1/forge-install-and-run-v1.ts
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { snapshotRoot, writeJson, repoWebRoot } from "./lib";
import { buildForgeJobs } from "./forge-harness-v1";

const FORGE_TAG = "forge-2.0.14";
const FORGE_URL = `https://github.com/Card-Forge/forge/releases/download/${FORGE_TAG}/forge-installer-2.0.14.tar.bz2`;
const JDK_URL = "https://aka.ms/download-jdk/microsoft-jdk-17.0.20.1-windows-x64.zip";
const SMOKE = process.argv.includes("--smoke");
const SCALED = process.argv.includes("--scaled");
const GAMES_PER_VARIANT = Number(process.env.DR_FORGE_GAMES ?? (SMOKE ? 1 : SCALED ? 8 : 2));
const CLOCK_S = Number(process.env.DR_FORGE_CLOCK ?? (SMOKE ? 90 : SCALED ? 300 : 180));
const JOB_CAP = Number(process.env.DR_FORGE_JOBS ?? (SMOKE ? 1 : 0));

type Job = {
  id: string;
  commander: string;
  stockPrecon: string;
  stockCount: number;
  upgradedCount: number;
};

function toolsRoot(): string {
  return resolve(repoWebRoot(), "data/milestones/deck-rating/v1/tools");
}

function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let out = "";
    child.stdout.on("data", (b) => {
      out += String(b);
      process.stdout.write(b);
    });
    child.stderr.on("data", (b) => {
      out += String(b);
      process.stderr.write(b);
    });
    child.on("exit", (code) => resolvePromise({ code: code ?? 1, out }));
    child.on("error", (err) => resolvePromise({ code: 1, out: String(err) }));
  });
}

function findJava(root: string): string | null {
  const hits: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isFile() && name.name.toLowerCase() === "java.exe") hits.push(p);
      else if (name.isDirectory()) walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return hits[0] ?? null;
}

function findForgeJar(root: string): string | null {
  const hits: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 5 || !existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isFile() && /^forge.*\.jar$/i.test(name.name) && !/installer/i.test(name.name)) hits.push(p);
      else if (name.isDirectory()) walk(p, depth + 1);
    }
  };
  walk(root, 0);
  const desktop = hits.find((p) => /forge-gui-desktop/i.test(p));
  return desktop ?? hits.sort((a, b) => a.length - b.length)[0] ?? null;
}

function dck(name: string, commander: string, main: Array<{ name?: string; quantity?: number }>): string {
  const lines = [
    "[metadata]",
    `Name=${name}`,
    "Deck Type=Commander",
    "[Commander]",
    `1 ${commander}`,
    "[Main]",
  ];
  for (const c of main) {
    if (!c.name || c.name === commander) continue;
    lines.push(`${c.quantity ?? 1} ${c.name}`);
  }
  return `${lines.join("\n")}\n`;
}

function forgeCommanderDir(): string {
  const dir = join(process.env.APPDATA ?? "", "Forge", "decks", "commander");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function forgeInstallAndRun(): Promise<Record<string, unknown>> {
  const tools = toolsRoot();
  mkdirSync(tools, { recursive: true });
  const jdkZip = join(tools, "jdk-17.zip");
  const jdkDir = join(tools, "jdk-17");
  const forgeTbz = join(tools, "forge-2.0.14.tar.bz2");
  const forgeDir = join(tools, "forge-2.0.14");
  mkdirSync(jdkDir, { recursive: true });
  mkdirSync(forgeDir, { recursive: true });

  if (!findJava(jdkDir) && !existsSync(jdkZip)) {
    console.log("Forge: downloading portable JDK 17");
    await run("curl.exe", ["-L", "--retry", "5", "-o", jdkZip, JDK_URL]);
  }
  if (!findJava(jdkDir) && existsSync(jdkZip)) {
    console.log("Forge: extracting JDK 17");
    await run("tar.exe", ["-xf", jdkZip, "-C", jdkDir]);
  }
  const java = findJava(jdkDir);
  if (!java) throw new Error("Java 17 not found after portable install");

  if (!findForgeJar(forgeDir) && !existsSync(forgeTbz)) {
    console.log("Forge: downloading 2.0.14");
    await run("curl.exe", ["-L", "--retry", "5", "-o", forgeTbz, FORGE_URL]);
  }
  if (!findForgeJar(forgeDir) && existsSync(forgeTbz)) {
    console.log("Forge: extracting 2.0.14");
    await run("tar.exe", ["-xjf", forgeTbz, "-C", forgeDir]);
  }
  const jar = findForgeJar(forgeDir);
  const snap = snapshotRoot();
  buildForgeJobs();
  const harness = JSON.parse(readFileSync(join(snap, "forge", "harness-jobs-v1.json"), "utf8")) as {
    jobs: Job[];
  };
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{
      playgroupName: string;
      commanders: Array<{ name?: string }>;
      mainboard: Array<{ name?: string; quantity?: number }>;
    }>;
  };
  const byName = new Map(labels.decks.map((d) => [d.playgroupName, d]));
  const field = labels.decks.filter((d) => d.commanders[0]?.name).slice(24, 27);
  const deckDir = join(snap, "forge", "decks");
  const commanderDir = forgeCommanderDir();
  mkdirSync(deckDir, { recursive: true });
  // Forge treats a -d arg as a file only when it ends in .xxx (e.g. .dck).
  // It then loads `deckDir + filename`, so pass the .dck name plus -D, never an absolute path.
  const writeDeck = (fileName: string, commander: string, main: Array<{ name?: string; quantity?: number }>) => {
    const stem = fileName.replace(/\.dck$/i, "");
    writeFileSync(join(deckDir, fileName), dck(stem, commander, main));
    copyFileSync(join(deckDir, fileName), join(commanderDir, fileName));
    return fileName;
  };
  const fieldNames = field.map((opp, i) =>
    writeDeck(`field-${i}.dck`, opp.commanders[0]?.name ?? "Unknown", opp.mainboard),
  );

  const results = [];
  const status = {
    java,
    javaVersion: (await run(java, ["-version"])).out,
    forgeJar: jar,
    forgeTag: FORGE_TAG,
    nJobs: JOB_CAP > 0 ? JOB_CAP : harness.jobs.length,
    scaled: SCALED,
    gamesPerVariant: GAMES_PER_VARIANT,
    clockS: CLOCK_S,
    smoke: SMOKE,
    commanderDir,
    deckDir,
  };
  if (!jar) {
    writeJson(join(snap, "forge", "harness-results-v1.json"), { ...status, error: "forge-jar-not-found-after-extract" });
    return { ...status, error: "forge-jar-not-found-after-extract" };
  }

  const resultsName = SMOKE ? "harness-smoke-v1.json" : SCALED ? "scaled-fixed-field-v1.json" : "harness-results-v1.json";
  const jobs = (SMOKE ? harness.jobs.slice(0, 1) : harness.jobs).slice(0, JOB_CAP > 0 ? JOB_CAP : undefined);
  for (const job of jobs) {
    const src = byName.get(job.stockPrecon);
    if (!src?.commanders[0]?.name) {
      results.push({ id: job.id, status: "missing-list" });
      continue;
    }
    const commander = src.commanders[0]!.name!;
    const stem = job.id.replace(/[^a-z0-9]+/gi, "_");
    const stockName = writeDeck(`${stem}-stock.dck`, commander, src.mainboard);
    const upName = writeDeck(`${stem}-upgrade.dck`, commander, [
      ...src.mainboard,
      { name: "Rhystic Study", quantity: 1 },
      { name: "Cyclonic Rift", quantity: 1 },
      { name: "Sol Ring", quantity: 1 },
    ]);
    const runVariant = async (label: string, deckName: string) => {
      const args = [
        "-Xmx4096m",
        "-Dfile.encoding=UTF-8",
        "-jar",
        jar,
        "sim",
        "-D",
        deckDir,
        "-d",
        deckName,
        ...fieldNames,
        "-f",
        "Commander",
        "-n",
        String(GAMES_PER_VARIANT),
        "-q",
        "-c",
        String(CLOCK_S),
      ];
      const started = Date.now();
      const hit = await run(java, args, forgeDir);
      return { label, code: hit.code, ms: Date.now() - started, tail: hit.out.slice(-1200) };
    };
    console.log(`Forge job ${job.id}${SMOKE ? " (smoke stock only)" : ""}`);
    const stock = await runVariant("stock", stockName);
    const upgrade = SMOKE ? { label: "upgrade", skipped: "smoke" } : await runVariant("upgrade", upName);
    results.push({ id: job.id, commander, stock, upgrade });
    writeJson(join(snap, "forge", resultsName), { ...status, results });
  }

  const dest = join(snap, "forge", resultsName);
  writeJson(dest, { version: "deck-rating-forge-harness-results-v1", ...status, results });
  return { dest, n: results.length, java, jar };
}

if (require.main === module) {
  forgeInstallAndRun()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

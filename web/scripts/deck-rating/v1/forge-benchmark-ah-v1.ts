#!/usr/bin/env npx tsx
/**
 * Spec rev2 §6.2 / §10 item 5: Forge benchmark tests A–H on an idle machine.
 *
 *   A  1 worker, precon vs 3 precons, -n 20 -c 900
 *   B  workers = physical−1 (same matchup); pick workers whose median game
 *      time is within 10% of A
 *   C  previous parallelism (1 sequential JVM)
 *   D  SerialGC flags on the A matchup
 *   E  -n 1 vs -n 50
 *   F  upgraded precon vs 3 B3-field, -n 20 -c 900
 *   G  upgraded precon vs 3 B4-field
 *   H  2-player A and F
 *
 *   cd web && npx --yes tsx scripts/deck-rating/v1/forge-benchmark-ah-v1.ts
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { repoWebRoot, snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const PHYSICAL = 16;
const B_WORKERS_TARGET = PHYSICAL - 1;
const CLOCK_A = 900;
const GAMES_A = 20;
const FROM = (process.argv.find((a) => a.startsWith("--from=")) ?? "--from=A").slice(7);
const XMX_SINGLE = "4096m";
const XMX_PARALLEL = "2560m";

type ParsedGame = {
  ms: number;
  clockDraw: boolean;
  turn: number | null;
  heroWins: boolean;
};

type TestRow = {
  id: string;
  label: string;
  n: number;
  clockS: number;
  workers: number;
  serialGc: boolean;
  twoPlayer: boolean;
  decks: string[];
  code: number;
  wallMs: number;
  games: ParsedGame[];
  medianGameMs: number | null;
  p90GameMs: number | null;
  clockDrawRate: number | null;
  heroWinRate: number | null;
};

function toolsRoot(): string {
  return resolve(repoWebRoot(), "data/milestones/deck-rating/v1/tools");
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
  return hits.find((p) => /forge-gui-desktop/i.test(p)) ?? hits[0] ?? null;
}

function dck(name: string, commander: string, main: Array<{ name?: string; quantity?: number }>): string {
  const lines = ["[metadata]", `Name=${name}`, "Deck Type=Commander", "[Commander]", `1 ${commander}`, "[Main]"];
  for (const c of main) {
    if (!c.name || c.name === commander) continue;
    lines.push(`${c.quantity ?? 1} ${c.name}`);
  }
  return `${lines.join("\n")}\n`;
}

function pinAiProfile(): { path: string; wrote: boolean } {
  const dir = join(process.env.APPDATA ?? "", "Forge");
  mkdirSync(join(dir, "preferences"), { recursive: true });
  const path = join(dir, "forge.preferences");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (/uiCurrentAIProfile/i.test(existing)) {
    const next = existing.replace(/uiCurrentAIProfile\s*=\s*.*/i, "uiCurrentAIProfile=Default");
    if (next !== existing) writeFileSync(path, next);
    return { path, wrote: next !== existing };
  }
  const body = existing
    ? `${existing.trimEnd()}\nuiCurrentAIProfile=Default\n`
    : "uiCurrentAIProfile=Default\n";
  writeFileSync(path, body);
  return { path, wrote: true };
}

function run(cmd: string, args: string[], cwd?: string, timeoutMs?: number): Promise<{ code: number; out: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let out = "";
    let done = false;
    const finish = (code: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolvePromise({ code, out });
    };
    const timer = timeoutMs
      ? setTimeout(() => {
          out += `\n[harness] killed after ${timeoutMs}ms\n`;
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 5_000);
          finish(124);
        }, timeoutMs)
      : undefined;
    child.stdout.on("data", (b) => {
      out += String(b);
      process.stdout.write(b);
    });
    child.stderr.on("data", (b) => {
      out += String(b);
      process.stderr.write(b);
    });
    child.on("exit", (code) => finish(code ?? 1));
    child.on("error", (err) => {
      out += String(err);
      finish(1);
    });
  });
}

function parseGames(out: string, heroStem: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  const resultRe = /Game Result: Game \d+ ended in (\d+) ms/g;
  const drawMarks = [...out.matchAll(/Stopping slow match as draw/g)].length;
  const turns = [...out.matchAll(/Game Outcome: Turn (\d+)/g)].map((m) => Number(m[1]));
  const matchLines = [...out.matchAll(/Match Result: ([^\n]+)/g)].map((m) => m[1] ?? "");
  let i = 0;
  for (const m of out.matchAll(resultRe)) {
    const ms = Number(m[1]);
    const match = matchLines[Math.min(i, matchLines.length - 1)] ?? "";
    const heroScore = new RegExp(`${heroStem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^:]*:\\s*(\\d+)`).exec(match);
    games.push({
      ms,
      clockDraw: ms >= CLOCK_A * 1000 - 50 || (i < drawMarks && ms >= (CLOCK_A * 1000) / 2),
      turn: turns[i] ?? null,
      heroWins: heroScore ? Number(heroScore[1]) > 0 && /:\s*[1-9]/.test(heroScore[0]) : /has won/i.test(out),
    });
    i += 1;
  }
  if (!games.length && /Stopping slow match as draw/.test(out)) {
    games.push({ ms: CLOCK_A * 1000, clockDraw: true, turn: turns.at(-1) ?? null, heroWins: false });
  }
  return games;
}

function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.min(s.length - 1, lo + 1);
  const t = i - lo;
  return s[lo]! * (1 - t) + s[hi]! * t;
}

function summarizeGames(games: ParsedGame[]): Pick<TestRow, "medianGameMs" | "p90GameMs" | "clockDrawRate" | "heroWinRate"> {
  const ms = games.map((g) => g.ms);
  return {
    medianGameMs: quantile(ms, 0.5),
    p90GameMs: quantile(ms, 0.9),
    clockDrawRate: games.length ? games.filter((g) => g.clockDraw).length / games.length : null,
    heroWinRate: games.length ? games.filter((g) => g.heroWins).length / games.length : null,
  };
}

async function loadFieldNames(
  path: string,
  oracle: Awaited<ReturnType<typeof loadSnapshotOracleNameMap>>,
  n: number,
): Promise<Array<{ id: string; commander: string; main: Array<{ name: string; quantity: number }> }>> {
  const out: Array<{ id: string; commander: string; main: Array<{ name: string; quantity: number }> }> = [];
  if (!existsSync(path)) return out;
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim() || out.length >= n) continue;
    const rec = JSON.parse(line) as { archidektId?: number; commanders?: string[]; oracleIds?: string[] };
    const ids = rec.oracleIds ?? [];
    if (ids.length < 90) continue;
    const names = ids.map((id) => oracle.byId.get(id)?.name).filter((x): x is string => Boolean(x));
    const commander = rec.commanders?.[0] ?? names[0] ?? "Unknown";
    out.push({
      id: String(rec.archidektId ?? out.length),
      commander,
      main: names.filter((nm) => nm !== commander).map((name) => ({ name, quantity: 1 })),
    });
  }
  return out;
}

export async function forgeBenchmarkAh(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const java = findJava(join(toolsRoot(), "jdk-17"));
  const jar = findForgeJar(join(toolsRoot(), "forge-2.0.14"));
  if (!java || !jar) throw new Error("portable JDK 17 or Forge 2.0.14 missing");
  const forgeDir = join(toolsRoot(), "forge-2.0.14");
  const dest = join(snap, "forge", "benchmark-ah-v1.json");
  const ai = pinAiProfile();
  const skipBefore = (id: string) => {
    const order = ["A", "B", "C", "D", "E-n1", "E-n50", "F", "G", "H-A", "H-F"];
    return order.indexOf(id) < order.indexOf(FROM);
  };

  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{
      playgroupName: string;
      last3Years?: boolean;
      commanders: Array<{ name?: string }>;
      mainboard: Array<{ name?: string; quantity?: number }>;
    }>;
  };
  const precons = labels.decks.filter((d) => d.last3Years && d.commanders[0]?.name);
  if (precons.length < 4) throw new Error("need ≥4 last-3-year precons for A");
  const hero = precons[0]!;
  const oppPrecons = precons.slice(1, 4);
  const oracle = await loadSnapshotOracleNameMap(snap);
  const b3 = await loadFieldNames(join(snap, "archidekt", "field-b3.jsonl.gz"), oracle, 3);
  const b4 = await loadFieldNames(join(snap, "archidekt", "field-b4.jsonl.gz"), oracle, 3);

  const deckDir = join(snap, "forge", "bench-decks");
  const commanderDir = join(process.env.APPDATA ?? "", "Forge", "decks", "commander");
  mkdirSync(deckDir, { recursive: true });
  mkdirSync(commanderDir, { recursive: true });
  const writeDeck = (fileName: string, commander: string, main: Array<{ name?: string; quantity?: number }>) => {
    writeFileSync(join(deckDir, fileName), dck(fileName.replace(/\.dck$/i, ""), commander, main));
    copyFileSync(join(deckDir, fileName), join(commanderDir, fileName));
    return fileName;
  };
  const heroName = writeDeck("bench-hero.dck", hero.commanders[0]!.name!, hero.mainboard);
  const upName = writeDeck("bench-hero-upgrade.dck", hero.commanders[0]!.name!, [
    ...hero.mainboard,
    { name: "Rhystic Study", quantity: 1 },
    { name: "Cyclonic Rift", quantity: 1 },
    { name: "Sol Ring", quantity: 1 },
  ]);
  const preconOpp = oppPrecons.map((d, i) => writeDeck(`bench-precon-${i}.dck`, d.commanders[0]!.name!, d.mainboard));
  const b3Opp = b3.map((d, i) => writeDeck(`bench-b3-${i}.dck`, d.commander, d.main));
  const b4Opp = b4.map((d, i) => writeDeck(`bench-b4-${i}.dck`, d.commander, d.main));

  const report: {
    version: string;
    spec: string;
    startedAt: string;
    java: string;
    jar: string;
    aiProfile: typeof ai;
    physicalCores: number;
    tests: TestRow[];
    chosen: Record<string, unknown> | null;
  } = {
    version: "deck-rating-forge-benchmark-ah-v1",
    spec: "rev2-§6.2",
    startedAt: new Date().toISOString(),
    java,
    jar,
    aiProfile: ai,
    physicalCores: PHYSICAL,
    tests: existsSync(dest)
      ? ((JSON.parse(readFileSync(dest, "utf8")) as { tests?: TestRow[] }).tests ?? [])
      : [],
    chosen: null,
  };
  if (FROM !== "A") {
    report.tests = report.tests.filter((t) => skipBefore(t.id) || t.id.startsWith("B"));
  }
  const flush = () => writeJson(dest, report);

  const jvmArgs = (xmx: string, serialGc: boolean) => [
    `-Xmx${xmx}`,
    "-Dfile.encoding=UTF-8",
    "-Dio.netty.tryReflectionSetAccessible=true",
    ...(serialGc ? ["-XX:+UseSerialGC"] : []),
    "-jar",
    jar,
  ];

  const oneJvm = async (args: {
    id: string;
    label: string;
    decks: string[];
    n: number;
    clockS: number;
    workers: number;
    serialGc: boolean;
    twoPlayer: boolean;
    xmx: string;
  }): Promise<TestRow> => {
    const sim = [
      ...jvmArgs(args.xmx, args.serialGc),
      "sim",
      "-D",
      deckDir,
      "-d",
      ...args.decks,
      "-f",
      "Commander",
      "-n",
      String(args.n),
      "-q",
      "-c",
      String(args.clockS),
    ];
    console.log(`\n== ${args.id} ${args.label} workers=${args.workers} n=${args.n} c=${args.clockS} ==`);
    const started = Date.now();
    const hit = await run(java, sim, forgeDir, (args.n * args.clockS + 180) * 1000);
    const games = parseGames(hit.out, args.decks[0]!.replace(/\.dck$/i, ""));
    const row: TestRow = {
      id: args.id,
      label: args.label,
      n: args.n,
      clockS: args.clockS,
      workers: args.workers,
      serialGc: args.serialGc,
      twoPlayer: args.twoPlayer,
      decks: args.decks,
      code: hit.code,
      wallMs: Date.now() - started,
      games,
      ...summarizeGames(games),
    };
    report.tests.push(row);
    flush();
    console.log(
      `${args.id} wall=${row.wallMs}ms games=${games.length} median=${row.medianGameMs} p90=${row.p90GameMs} clockDraw=${row.clockDrawRate}`,
    );
    return row;
  };

  const manyJvm = async (args: {
    id: string;
    label: string;
    decks: string[];
    nPerWorker: number;
    workers: number;
    clockS: number;
    serialGc: boolean;
    twoPlayer: boolean;
  }): Promise<TestRow> => {
    console.log(`\n== ${args.id} ${args.label} workers=${args.workers} n/worker=${args.nPerWorker} ==`);
    const started = Date.now();
    const jobs = Array.from({ length: args.workers }, () =>
      run(
        java,
        [
          ...jvmArgs(XMX_PARALLEL, args.serialGc),
          "sim",
          "-D",
          deckDir,
          "-d",
          ...args.decks,
          "-f",
          "Commander",
          "-n",
          String(args.nPerWorker),
          "-q",
          "-c",
          String(args.clockS),
        ],
        forgeDir,
        (args.nPerWorker * args.clockS + 180) * 1000,
      ),
    );
    const hits = await Promise.all(jobs);
    const games = hits.flatMap((h) => parseGames(h.out, args.decks[0]!.replace(/\.dck$/i, "")));
    const row: TestRow = {
      id: args.id,
      label: args.label,
      n: args.nPerWorker * args.workers,
      clockS: args.clockS,
      workers: args.workers,
      serialGc: args.serialGc,
      twoPlayer: args.twoPlayer,
      decks: args.decks,
      code: hits.every((h) => h.code === 0) ? 0 : 1,
      wallMs: Date.now() - started,
      games,
      ...summarizeGames(games),
    };
    report.tests.push(row);
    flush();
    console.log(
      `${args.id} wall=${row.wallMs}ms games=${games.length} median=${row.medianGameMs} p90=${row.p90GameMs} clockDraw=${row.clockDrawRate}`,
    );
    return row;
  };

  const aDecks = [heroName, ...preconOpp];
  const fDecks = [upName, ...b3Opp];
  const gDecks = [upName, ...b4Opp];
  const a2 = [heroName, preconOpp[0]!];
  const f2 = [upName, b3Opp[0]!].filter(Boolean);

  let A = report.tests.find((t) => t.id === "A");
  let chosenWorkers = 8;
  if (!skipBefore("A")) {
    A = await oneJvm({
      id: "A",
      label: "1 worker precon vs 3 precons",
      decks: aDecks,
      n: GAMES_A,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: false,
      twoPlayer: false,
      xmx: XMX_SINGLE,
    });

    chosenWorkers = 1;
    const workerTries = [B_WORKERS_TARGET, 8, 4, 2].filter((w, i, xs) => w >= 2 && xs.indexOf(w) === i);
    for (const w of workerTries) {
      const B = await manyJvm({
        id: w === B_WORKERS_TARGET ? "B" : `B-${w}`,
        label: `${w} parallel JVMs, same A matchup`,
        decks: aDecks,
        nPerWorker: 2,
        workers: w,
        clockS: CLOCK_A,
        serialGc: false,
        twoPlayer: false,
      });
      if (A.medianGameMs && B.medianGameMs && B.medianGameMs <= A.medianGameMs * 1.1) {
        chosenWorkers = w;
        break;
      }
      if (w === workerTries.at(-1)) chosenWorkers = 1;
    }
  }

  if (!skipBefore("C") && !report.tests.some((t) => t.id === "C")) {
    report.tests.push({
      id: "C",
      label: "previous parallelism (24-job harness): 1 sequential JVM",
      n: 0,
      clockS: 180,
      workers: 1,
      serialGc: false,
      twoPlayer: false,
      decks: [],
      code: 0,
      wallMs: 0,
      games: [],
      medianGameMs: null,
      p90GameMs: null,
      clockDrawRate: null,
      heroWinRate: null,
    });
    flush();
  }

  if (!skipBefore("D") && !report.tests.some((t) => t.id === "D")) {
    await oneJvm({
      id: "D",
      label: "A matchup + SerialGC",
      decks: aDecks,
      n: GAMES_A,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: true,
      twoPlayer: false,
      xmx: XMX_SINGLE,
    });
  }

  if (!skipBefore("E-n1") && !report.tests.some((t) => t.id === "E-n1")) {
    await oneJvm({
      id: "E-n1",
      label: "A matchup -n 1",
      decks: aDecks,
      n: 1,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: false,
      twoPlayer: false,
      xmx: XMX_SINGLE,
    });
  }
  if (!skipBefore("E-n50") && !report.tests.some((t) => t.id === "E-n50")) {
    await oneJvm({
      id: "E-n50",
      label: "A matchup -n 50",
      decks: aDecks,
      n: 50,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: false,
      twoPlayer: false,
      xmx: XMX_SINGLE,
    });
  }

  if (skipBefore("F") || report.tests.some((t) => t.id === "F")) {
    /* already recorded */
  } else if (b3Opp.length >= 3) {
    await oneJvm({
      id: "F",
      label: "upgraded vs 3 B3-field",
      decks: fDecks,
      n: GAMES_A,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: false,
      twoPlayer: false,
      xmx: XMX_SINGLE,
    });
  } else {
    report.tests.push({
      id: "F",
      label: "upgraded vs 3 B3-field — missing field decks",
      n: 0,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: false,
      twoPlayer: false,
      decks: fDecks,
      code: 1,
      wallMs: 0,
      games: [],
      medianGameMs: null,
      p90GameMs: null,
      clockDrawRate: null,
      heroWinRate: null,
    });
    flush();
  }

  if (!skipBefore("G") && !report.tests.some((t) => t.id === "G") && b4Opp.length >= 3) {
    await oneJvm({
      id: "G",
      label: "upgraded vs 3 B4-field",
      decks: gDecks,
      n: GAMES_A,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: false,
      twoPlayer: false,
      xmx: XMX_SINGLE,
    });
  }

  if (!skipBefore("H-A") && !report.tests.some((t) => t.id === "H-A")) {
    await oneJvm({
      id: "H-A",
      label: "2-player A",
      decks: a2,
      n: GAMES_A,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: false,
      twoPlayer: true,
      xmx: XMX_SINGLE,
    });
  }
  if (!skipBefore("H-F") && !report.tests.some((t) => t.id === "H-F") && f2.length === 2) {
    await oneJvm({
      id: "H-F",
      label: "2-player F",
      decks: f2,
      n: GAMES_A,
      clockS: CLOCK_A,
      workers: 1,
      serialGc: false,
      twoPlayer: true,
      xmx: XMX_SINGLE,
    });
  }

  const timed = report.tests.filter((t) => t.p90GameMs != null) as Array<TestRow & { p90GameMs: number }>;
  const slowestP90 = timed.reduce((m, t) => Math.max(m, t.p90GameMs), 0);
  const chosenClock = Math.max(CLOCK_A, Math.ceil((2 * slowestP90) / 1000));
  report.chosen = {
    workers: chosenWorkers,
    clockS: chosenClock,
    gamesPerMatch: GAMES_A,
    rule: "workers where B median game time ≤ 1.10 × A; -c ≥ 2 × p90 of slowest timed band",
    aMedianGameMs: A?.medianGameMs ?? null,
    slowestP90GameMs: slowestP90 || null,
    xmx: chosenWorkers > 1 ? XMX_PARALLEL : XMX_SINGLE,
    aiProfile: "Default",
    finishedAt: new Date().toISOString(),
  };
  flush();
  return { dest, chosen: report.chosen, nTests: report.tests.length };
}

if (require.main === module) {
  forgeBenchmarkAh()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

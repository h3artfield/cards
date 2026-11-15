/**
 * Asks the Professor for the strategy of the deck already on file.
 * Does not rebuild the 99. The standing checker plays strategy.json.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { requestProfessorStrategy } from "../../../src/lib/deck-rating/v1/professor-strategy-request-v1";
import type { PlanCardV1 } from "../../../src/lib/deck-rating/v1/plan-schema-v1";

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-rating/v1/plan-factory");
const STATUS_PATH = resolve(OUT_DIR, "status.json");

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function patch(partial: Record<string, unknown>) {
  const status = JSON.parse(readFileSync(STATUS_PATH, "utf8")) as Record<string, unknown>;
  const next = { ...status, ...partial, updatedAt: new Date().toISOString() };
  const tmp = `${STATUS_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(next));
  renameSync(tmp, STATUS_PATH);
}

async function main() {
  loadEnvLocal();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");
  const status = JSON.parse(readFileSync(STATUS_PATH, "utf8")) as {
    deck?: { commanders?: PlanCardV1[]; cards?: PlanCardV1[] };
    activity?: string[];
  };
  const commander = status.deck?.commanders?.[0];
  const cards = status.deck?.cards;
  if (!commander || !cards?.length) throw new Error("No saved deck to explain");
  patch({
    stage: "requesting-strategy",
    activity: [...(status.activity ?? []), `Professor is explaining ${commander.name}`].slice(-40),
  });
  console.log(`[handoff] asking for a strategy of ${commander.name} (${cards.length} cards)`);
  const result = await requestProfessorStrategy({
    commander,
    cards,
    onProgress: (message) => console.log(`[handoff] ${message}`),
  });
  writeFileSync(
    resolve(OUT_DIR, "strategy.json"),
    JSON.stringify({ model: result.model, strategy: result.strategy }, null, 2),
  );
  patch({
    stage: "watching",
    activity: [...(status.activity ?? []), `Professor strategy saved (${result.strategy.win.type})`].slice(-40),
  });
  console.log(`[handoff] saved ${result.strategy.win.type}: ${result.strategy.win.requiredCards.join(", ") || "no required cards"}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[handoff] ${message}`);
  try {
    patch({ stage: "strategy-failed", failure: message });
  } catch {
    /* status may be missing */
  }
  process.exit(1);
});

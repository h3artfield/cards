import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { callHeadProfessorJsonV48 } from "../src/lib/deck-synthesis/professor-head-professor-caller-v4-8-v1";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
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

loadEnvLocal();
process.env.PROFESSOR_BREW_HEAD_PROFESSOR_REASONING_EFFORT = "medium";
process.env.PROFESSOR_BREW_HEAD_PROFESSOR_TIMEOUT_MS = "180000";

async function main() {
  const start = Date.now();
  const result = await callHeadProfessorJsonV48<{ swaps: unknown[]; overallAssessment: string }>({
    system: "Return JSON only. Keep brief.",
    userContent:
      "Review a UR deck with 22 lands. Recommend 5 CUT->ADD land swaps. Return JSON with swaps array and overallAssessment.",
  });
  console.log("OK in", Math.round((Date.now() - start) / 1000) + "s");
  console.log("swaps:", result.parsed.swaps?.length ?? 0);
  console.log("assessment:", result.parsed.overallAssessment?.slice(0, 120));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

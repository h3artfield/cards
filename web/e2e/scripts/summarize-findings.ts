/**
 * Prints a severity-ranked summary of e2e/artifacts/ux-findings.json
 * Usage: npx tsx e2e/scripts/summarize-findings.ts
 */
import fs from "node:fs";
import path from "node:path";

const p = path.join(__dirname, "..", "artifacts", "ux-findings.json");
if (!fs.existsSync(p)) {
  console.error("No findings file at", p);
  process.exit(1);
}
const findings = JSON.parse(fs.readFileSync(p, "utf8")) as Array<{
  id: string;
  severity: string;
  category: string;
  surface: string;
  title: string;
  recommendation: string;
}>;
const order = ["blocker", "major", "minor", "nit"];
const counts: Record<string, number> = {};
for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
console.log("UX findings:", findings.length);
console.log(counts);
console.log("---");
for (const sev of order) {
  const group = findings.filter((f) => f.severity === sev);
  if (!group.length) continue;
  console.log(`\n# ${sev.toUpperCase()} (${group.length})`);
  for (const f of group) {
    console.log(`- [${f.id}] (${f.surface}/${f.category}) ${f.title}`);
    console.log(`    → ${f.recommendation}`);
  }
}

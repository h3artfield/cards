import fs from "node:fs";
import path from "node:path";

export type FindingSeverity = "blocker" | "major" | "minor" | "nit";
export type FindingCategory =
  | "usability"
  | "design"
  | "navigation"
  | "copy"
  | "interaction"
  | "a11y"
  | "reliability";

export type UxFinding = {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  surface: string;
  url: string;
  title: string;
  repro: string;
  evidence: string | null;
  recommendation: string;
  recordedAt: string;
};

const ARTIFACTS = path.join(__dirname, "..", "artifacts");
const FINDINGS_PATH = path.join(ARTIFACTS, "ux-findings.json");

function ensureArtifactsDir() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
}

function loadAll(): UxFinding[] {
  ensureArtifactsDir();
  if (!fs.existsSync(FINDINGS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(FINDINGS_PATH, "utf8")) as UxFinding[];
  } catch {
    return [];
  }
}

function saveAll(findings: UxFinding[]) {
  ensureArtifactsDir();
  fs.writeFileSync(FINDINGS_PATH, JSON.stringify(findings, null, 2), "utf8");
}

export function resetFindings() {
  ensureArtifactsDir();
  saveAll([]);
}

export function recordFinding(
  partial: Omit<UxFinding, "id" | "recordedAt"> & { id?: string },
): UxFinding {
  const findings = loadAll();
  const finding: UxFinding = {
    id: partial.id ?? `F-${String(findings.length + 1).padStart(3, "0")}`,
    severity: partial.severity,
    category: partial.category,
    surface: partial.surface,
    url: partial.url,
    title: partial.title,
    repro: partial.repro,
    evidence: partial.evidence,
    recommendation: partial.recommendation,
    recordedAt: new Date().toISOString(),
  };
  findings.push(finding);
  saveAll(findings);
  return finding;
}

export function findingsPath() {
  return FINDINGS_PATH;
}

export function summarizeFindings(findings: UxFinding[] = loadAll()) {
  const bySeverity: Record<FindingSeverity, number> = {
    blocker: 0,
    major: 0,
    minor: 0,
    nit: 0,
  };
  for (const f of findings) bySeverity[f.severity] += 1;
  return { total: findings.length, bySeverity, findings };
}

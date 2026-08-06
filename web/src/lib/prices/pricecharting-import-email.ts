import type { PriceChartingDailyReport } from "./types";

export type PriceChartingImportEmailConfig = {
  provider: "resend";
  to: string;
  fromEmail: string;
  fromName: string;
};

export function getPriceChartingImportEmailConfig(): PriceChartingImportEmailConfig | null {
  const provider = process.env.PRICECHARTING_IMPORT_EMAIL_PROVIDER?.trim().toLowerCase();
  if (provider !== "resend") return null;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.PRICECHARTING_IMPORT_EMAIL_TO?.trim();
  const fromEmail = process.env.PRICECHARTING_IMPORT_EMAIL_FROM?.trim();
  const fromName =
    process.env.PRICECHARTING_IMPORT_EMAIL_FROM_NAME?.trim() || "Card Scanner Reports";

  if (!apiKey || !to || !fromEmail) return null;

  return { provider: "resend", to, fromEmail, fromName };
}

function resendFromHeader(config: PriceChartingImportEmailConfig): string {
  return `${config.fromName} <${config.fromEmail}>`;
}

async function sendViaResend(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[pricecharting import email]", res.status, body.slice(0, 200));
    return false;
  }
  return true;
}

function buildReportHtml(report: PriceChartingDailyReport): string {
  const sampleRows = report.sampleChecks
    .map(
      (s) =>
        `<tr><td>${s.pass ? "PASS" : "FAIL"}</td><td>${s.label}</td><td>${s.snapshotCount}</td><td>${s.pointCount ?? "—"}</td></tr>`,
    )
    .join("");

  const importRows = report.imports
    .map(
      (i) =>
        `<tr><td>${i.category}</td><td>${i.skippedAlreadyImported ? "skipped" : i.importRunId}</td><td>${i.rowsRead}</td><td>${i.rowsImported}</td><td>${i.rowsRejected}</td></tr>`,
    )
    .join("");

  const warnings =
    report.warnings.length > 0
      ? `<p><strong>Warnings:</strong></p><ul>${report.warnings.map((w) => `<li>${w}</li>`).join("")}</ul>`
      : "";

  const errors =
    report.errors.length > 0
      ? `<p><strong>Errors:</strong></p><ul>${report.errors.map((e) => `<li>${e}</li>`).join("")}</ul>`
      : "";

  return `<h2>PriceCharting daily import — ${report.date}</h2>
<p>Status: <strong>${report.status}</strong></p>
<p>Execution: ${report.jobExecutionId ?? "n/a"}</p>
<p>Snapshots for ${report.date}: ${report.warehouse.snapshotsForDate ?? 0}</p>
${report.archive?.reportPath ? `<p>Report: ${report.archive.reportPath}</p>` : ""}
<h3>Imports</h3>
<table border="1" cellpadding="4"><tr><th>Category</th><th>Run</th><th>Read</th><th>Imported</th><th>Rejected</th></tr>${importRows}</table>
<h3>Sample checks</h3>
<table border="1" cellpadding="4"><tr><th>Result</th><th>Label</th><th>Snapshots</th><th>Points</th></tr>${sampleRows}</table>
${warnings}${errors}`;
}

export async function sendPriceChartingImportReportEmail(
  report: PriceChartingDailyReport,
): Promise<boolean> {
  const config = getPriceChartingImportEmailConfig();
  if (!config) {
    console.log("[pricecharting import email] skipped — provider not configured");
    return false;
  }

  return sendViaResend({
    to: config.to,
    from: resendFromHeader(config),
    subject: `PriceCharting daily import — ${report.date} (${report.status})`,
    html: buildReportHtml(report),
  });
}

export async function sendPriceChartingImportTestEmail(): Promise<boolean> {
  const config = getPriceChartingImportEmailConfig();
  if (!config) {
    console.error(
      "PriceCharting import email not configured — set PRICECHARTING_IMPORT_EMAIL_PROVIDER=resend and Resend env vars.",
    );
    return false;
  }

  return sendViaResend({
    to: config.to,
    from: resendFromHeader(config),
    subject: "Card Scanner Reports — Resend test",
    html: `<p>Resend is configured for PriceCharting import reports.</p>
<p>From: ${config.fromName} &lt;${config.fromEmail}&gt;</p>
<p>Sent at ${new Date().toISOString()}</p>`,
  });
}

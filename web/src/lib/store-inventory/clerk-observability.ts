import type { ClerkAnswerSource, ClerkRequestMode } from "./clerk-request-classifier";
import type { ClerkIntent, ClerkVerificationSummary } from "./clerk-types";

export interface ClerkRequestLogEntry {
  storeId: string;
  storeSlug: string;
  question: string;
  mode: ClerkRequestMode;
  answerSource: ClerkAnswerSource;
  intent: ClerkIntent;
  inventorySearchStrategy?: string;
  ragHitCount?: number;
  verificationStatus?: ClerkVerificationSummary["status"];
  hardFailures?: string[];
  latencyMs: number;
  redirectToInventorySearch?: string;
}

export function logClerkRequest(entry: ClerkRequestLogEntry): void {
  const payload = {
    type: "clerk_request",
    ...entry,
    hardFailures: entry.hardFailures?.slice(0, 5),
  };
  if (process.env.NODE_ENV === "production") {
    console.info(JSON.stringify(payload));
  } else {
    console.info(
      `[clerk] ${entry.mode}/${entry.answerSource} intent=${entry.intent} ${entry.latencyMs}ms` +
        (entry.hardFailures?.length
          ? ` FAIL: ${entry.hardFailures.join("; ")}`
          : ""),
    );
  }
}

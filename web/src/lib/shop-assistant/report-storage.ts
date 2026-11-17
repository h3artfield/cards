import { REPORT_STORAGE_KEY, type ShopReportView } from "./chat-client";

/**
 * Hands a report from the chat drawer to the report page through one
 * sessionStorage key. Browser only. Storage can be missing or refuse writes
 * (private windows, blocked site data), so every call is guarded and the
 * caller is told whether it worked.
 */

export function storeReport(report: ShopReportView): boolean {
  try {
    window.sessionStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(report));
    return true;
  } catch {
    return false;
  }
}

export function readStoredReportText(): string | null {
  try {
    return window.sessionStorage.getItem(REPORT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetStoredReport(): void {
  try {
    window.sessionStorage.removeItem(REPORT_STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}

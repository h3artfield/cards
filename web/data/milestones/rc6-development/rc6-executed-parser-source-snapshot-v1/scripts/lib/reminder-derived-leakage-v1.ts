import { findReminderSpans } from "../../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

type ReminderCheckAction = {
  reviewStatus: string;
  cardNativeLayer2Eligible?: boolean;
  provenance: { actionSpan: { cardStart: number; cardEnd: number; text?: string } };
};

/** Count accepted card-native L2 actions whose evidence lies in a classified reminder span. */
export function countAcceptedReminderDerivedLayer2(
  oracleText: string,
  actions: ReminderCheckAction[],
): number {
  const reminders = findReminderSpans(oracleText).filter(
    (r) => r.role === "reminder_text" || r.role === "mechanic_reminder",
  );
  if (reminders.length === 0) return 0;

  let count = 0;
  for (const action of actions) {
    if (action.reviewStatus !== "accepted") continue;
    if (action.cardNativeLayer2Eligible === false) continue;
    const { cardStart, cardEnd } = action.provenance.actionSpan;
    const inReminder = reminders.some(
      (r) => cardStart >= r.localStart && cardEnd <= r.localEnd,
    );
    if (inReminder) count++;
  }
  return count;
}

export function scanAcceptedReminderDerivedLayer2(cases: Array<{ oracleText: string; actions: ReminderCheckAction[] }>) {
  let acceptedReminderDerivedLayer2Count = 0;
  const ledger: Array<{ evidence: string; cardStart: number; cardEnd: number }> = [];

  for (const row of cases) {
    const reminders = findReminderSpans(row.oracleText).filter(
      (r) => r.role === "reminder_text" || r.role === "mechanic_reminder",
    );
    for (const action of row.actions) {
      if (action.reviewStatus !== "accepted") continue;
      if (action.cardNativeLayer2Eligible === false) continue;
      const { cardStart, cardEnd, text } = action.provenance.actionSpan;
      if (reminders.some((r) => cardStart >= r.localStart && cardEnd <= r.localEnd)) {
        acceptedReminderDerivedLayer2Count++;
        ledger.push({ evidence: text ?? "", cardStart, cardEnd });
      }
    }
  }

  return { acceptedReminderDerivedLayer2Count, ledger };
}

import type { Customer } from "@/lib/types";

const SERVER_ONLY_KEYS = [
  "passwordHash",
  "emailVerificationTokenHash",
  "emailVerificationSentAt",
  "passwordResetTokenHash",
  "passwordResetSentAt",
] as const;

/** Strip server-only fields before sending a customer to the browser. */
export function sanitizeCustomer(customer: Customer): Customer {
  const copy = { ...customer } as Customer & Record<string, unknown>;
  for (const key of SERVER_ONLY_KEYS) {
    delete copy[key];
  }
  return copy;
}

export function sanitizeCustomers(customers: Customer[]): Customer[] {
  return customers.map(sanitizeCustomer);
}

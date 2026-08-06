import type { SenderProfile } from "./types";

/** Legacy localStorage may still have a single `name` field. */
export type SenderProfileInput = Partial<SenderProfile> & { name?: string };

export function splitPersonName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) {
    return { firstName: trimmed, lastName: "Store" };
  }
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim() || "Store",
  };
}

export function normalizeSenderProfile(input?: SenderProfileInput): SenderProfile {
  const base: SenderProfile = {
    firstName: "",
    lastName: "",
    company: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
    phone: "",
    email: "",
  };

  if (!input) return base;

  const merged = { ...base, ...input };

  if (!merged.firstName.trim() && !merged.lastName.trim() && input.name?.trim()) {
    const split = splitPersonName(input.name);
    merged.firstName = split.firstName;
    merged.lastName = split.lastName;
    if (!merged.company?.trim()) {
      merged.company = input.name.trim();
    }
  }

  if (!merged.company?.trim() && merged.firstName && !merged.lastName.includes(" ")) {
    // Keep company optional
  }

  merged.country = merged.country.trim() || "US";
  return merged;
}

export function isSenderComplete(sender: SenderProfile): boolean {
  const s = normalizeSenderProfile(sender);
  return (
    s.firstName.trim().length > 0 &&
    s.lastName.trim().length > 0 &&
    s.address1.trim().length > 0 &&
    s.city.trim().length > 0 &&
    s.state.trim().length > 0 &&
    s.postalCode.trim().length > 0 &&
    s.phone.trim().length > 0 &&
    s.email.trim().length > 0
  );
}

export function senderMissingFields(sender: SenderProfile): string[] {
  const s = normalizeSenderProfile(sender);
  const missing: string[] = [];
  if (!s.firstName.trim()) missing.push("first name");
  if (!s.lastName.trim()) missing.push("last name");
  if (!s.address1.trim()) missing.push("street address");
  if (!s.city.trim()) missing.push("city");
  if (!s.state.trim()) missing.push("state");
  if (!s.postalCode.trim()) missing.push("ZIP code");
  if (!s.phone.trim()) missing.push("phone");
  if (!s.email.trim()) missing.push("email");
  return missing;
}

export function mergeSenderDefaults(
  base: SenderProfile,
  patch?: SenderProfileInput,
): SenderProfile {
  return normalizeSenderProfile({ ...base, ...patch });
}

/** USPS Click-N-Ship expects MM-DD-YYYY. */
export function formatUspsShippingDate(isoDate: string): string {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${month}-${day}-${year}`;
}

export function totalWeightOz(lbs: number, oz: number): number {
  return Math.round((lbs * 16 + oz) * 100) / 100;
}

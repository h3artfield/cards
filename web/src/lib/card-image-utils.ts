/** True when a card has a customer-uploaded back photo. */
export function hasBackImage(url?: string | null): boolean {
  return Boolean(url?.trim());
}

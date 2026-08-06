export const ADMIN_DELETE_CONFIRM_WORD = "delete";

export function isAdminDeleteConfirmed(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === ADMIN_DELETE_CONFIRM_WORD;
}

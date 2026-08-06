export type AdminCardViewMode = "clerk" | "manager" | "developer";

/** Resolve staff card review view — default clerk; ?debug=1 → developer; ?view=manager|developer. */
export function resolveAdminCardViewMode(input: {
  debugParam?: string | null;
  viewParam?: string | null;
}): AdminCardViewMode {
  if (input.debugParam === "1" || input.debugParam === "true") {
    return "developer";
  }
  if (input.viewParam === "developer") return "developer";
  if (input.viewParam === "manager") return "manager";
  if (input.viewParam === "clerk") return "clerk";
  return "clerk";
}

export function adminCardViewModeLabel(mode: AdminCardViewMode): string {
  switch (mode) {
    case "clerk":
      return "Clerk";
    case "manager":
      return "Manager";
    case "developer":
      return "Developer";
  }
}

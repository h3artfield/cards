import type { AdminSession } from "../types";
import type { ShopToolId } from "./types";

/**
 * Whether this signed-in staff member may use a tool.
 *
 * Owner decision (messages/002): every V1 tool is open to any signed-in staff
 * session for the store, clerks included. Per-role rules, once clerk logins
 * exist, belong here and nowhere else.
 */
export function canUseShopTool(
  session: Pick<AdminSession, "userId" | "role">,
  tool: ShopToolId,
): boolean {
  void session;
  void tool;
  return true;
}

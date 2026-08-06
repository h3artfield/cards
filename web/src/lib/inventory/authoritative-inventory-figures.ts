/**
 * @deprecated Operational inventory counts must come from computeLiveInventoryMetrics().
 * Use loadInventoryAuditSnapshot() for the immutable CSV reconciliation baseline.
 */
export { loadInventoryAuditSnapshot, computeLiveInventoryMetrics } from "./inventory-audit-snapshot";
export type {
  InventoryAuditSnapshot,
  LiveInventoryMetrics,
} from "./inventory-audit-snapshot";

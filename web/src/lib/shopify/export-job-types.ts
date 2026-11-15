export type ShopifyExportJobStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export type ShopifyExportJobFailure = {
  inventoryItemId: string;
  displayName: string;
  error: string;
  at: string;
};

export type ShopifyExportJob = {
  id: string;
  storeId: string;
  status: ShopifyExportJobStatus;
  /** Rows per chunk. Each chunk is one request, so this stays modest. */
  batchSize: number;
  /** Eligible rows when the job started — the denominator for progress. */
  totalEligible: number;
  exported: number;
  failed: number;
  /** Consecutive failures, reset by any success. Drives the circuit breaker. */
  failureStreak: number;
  failures: ShopifyExportJobFailure[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  startedBy?: string;
  cancelRequested?: boolean;
  stopReason?: string;
  /**
   * Held while a chunk is in flight. Both the browser and the server's own
   * continuation can call tick, and exporting the same row twice would create
   * duplicate Shopify products, so a chunk must hold an exclusive lease.
   */
  leaseUntil?: string;
};

export type ShopifyExportJobChunkOutcome = {
  job: ShopifyExportJob;
  chunkExported: number;
  chunkFailed: number;
  remainingEligible: number;
};

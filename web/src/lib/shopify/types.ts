export type ShopifyProductStatus = "DRAFT" | "ACTIVE";

export type ShopifyPriceStrategy =
  | "marketPrice"
  | "marketPlusMarkup"
  | "manual";

export type ShopifyAuthMethod = "client_credentials" | "legacy_admin_token";

export type ShopifyIntegration = {
  enabled: boolean;
  /** Default: client_credentials (Shopify Dev Dashboard). */
  authMethod?: ShopifyAuthMethod;
  shopDomain?: string;
  /** Shopify Dev Dashboard app Client ID (public). */
  clientId?: string;
  /** Encrypted Client Secret — never sent to browser after save. */
  clientSecretEncrypted?: string;
  /** Cached OAuth access token (encrypted). Obtained via client_credentials grant. */
  oauthAccessTokenEncrypted?: string;
  oauthAccessTokenExpiresAt?: string;
  /**
   * @deprecated Legacy manually pasted Admin API token. Use client credentials OAuth.
   */
  accessTokenEncrypted?: string;
  defaultLocationId?: string;
  defaultCollectionId?: string;
  defaultProductStatus: ShopifyProductStatus;
  publishOnlineStore: boolean;
  publishShopChannel: boolean;
  defaultVendor?: string;
  defaultProductType?: string;
  defaultTags?: string[];
  priceStrategy: ShopifyPriceStrategy;
  markupPercent?: number;
  requireStaffConfirmedOnly?: boolean;
  connectedAt?: string;
  lastTestedAt?: string;
  lastTestResult?: "success" | "failed";
  lastTestError?: string;
  lastTestScopes?: string[];
  canWriteProducts?: boolean;
  canReadLocations?: boolean;
  canReadInventory?: boolean;
  canReadOrders?: boolean;
  /** Shopify webhook id for inventory_levels/update (primary sold detection). */
  inventoryLevelsWebhookId?: string;
  inventoryLevelsWebhookRegisteredAt?: string;
  /** Optional orders/paid webhook — requires protected customer data approval. */
  ordersPaidWebhookId?: string;
  ordersPaidWebhookRegisteredAt?: string;
  ordersPaidWebhookLastError?: string;
  soldDetectionWebhookLastError?: string;
};

/** Client-safe view — never includes secrets or access tokens. */
export type ShopifyIntegrationPublic = Omit<
  ShopifyIntegration,
  | "clientSecretEncrypted"
  | "oauthAccessTokenEncrypted"
  | "accessTokenEncrypted"
> & {
  hasClientSecret: boolean;
  hasLegacyAccessToken: boolean;
  /** True when a valid OAuth token is cached server-side. */
  hasValidAccessToken: boolean;
  oauthAccessTokenExpiresAt?: string;
};

export type ShopifyExportStatus =
  | "not_exported"
  | "queued"
  | "exported"
  | "failed"
  | "skipped"
  | "exported_with_publish_warning";

export type ShopifyCardExport = {
  status: ShopifyExportStatus;
  productId?: string;
  variantId?: string;
  inventoryItemId?: string;
  sku?: string;
  productAdminUrl?: string;
  productOnlineUrl?: string;
  exportedAt?: string;
  exportedBy?: string;
  exportPrice?: number;
  productStatus?: ShopifyProductStatus;
  error?: string;
  lastAttemptAt?: string;
  soldAt?: string;
  soldOrderId?: string;
};

export type ShopifyLocation = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ShopifyExportCardInput = {
  cardId: string;
  exportPrice: number;
  productStatus?: ShopifyProductStatus;
  /** Clear prior export record and create a new Shopify product (e.g. listing removed from Shopify). */
  reexport?: boolean;
};

export type ShopifyExportCardResult = {
  cardId: string;
  ok: boolean;
  status: ShopifyExportStatus;
  error?: string;
  productId?: string;
  productAdminUrl?: string;
  skippedReason?: string;
};

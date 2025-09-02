import type { AdapterDebugLogs } from "better-auth/adapters";

/**
 * ID generation strategies for SurrealDB records.
 */
export type IdGenerator =
  | "sdk.UUIDv4"
  | "sdk.UUIDv7"
  | "surreal"
  | "surreal.ULID"
  | "surreal.UUID"
  | "surreal.UUIDv4"
  | "surreal.UUIDv7"
  | "surreal.guid";

/**
 * Maps table fields to their referenced tables for RecordId conversion.
 */
export interface RecordIdMap {
  tableSpecific: Record<string, Record<string, string>>;
}

/**
 * Configuration options for the SurrealDB adapter.
 */
export interface SurrealDBAdapterConfig {
  /** Enable debug logging for adapter operations. */
  debugLogs?: AdapterDebugLogs;

  /** Use plural table names (e.g., 'users' instead of 'user'). @default false */
  usePlural?: boolean;

  /** ID generation strategy. @default undefined (uses Better Auth default) */
  idGenerator?: IdGenerator;

  /** Allow passing custom IDs in data objects. @default false */
  allowPassingId?: boolean;
}

/**
 * Adapter method names for logging and debugging.
 */
export type AdapterMethod =
  | "create"
  | "update"
  | "updateMany"
  | "findOne"
  | "findMany"
  | "delete"
  | "deleteMany"
  | "count";

/**
 * Rule for special field-to-table mappings with optional conditions.
 */
export interface FieldMappingRule {
  sourceModel: string;
  sourceField: string;
  targetModel: string;
  condition?: (data: Record<string, any>) => boolean;
}

/**
 * Options for building query suffix clauses (ORDER BY, LIMIT, etc.).
 */
export interface QuerySuffixOptions {
  sortBy?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
  offset?: number;
  groupAll?: boolean;
  returnAfter?: boolean;
  returnFields?: string;
  limitOne?: boolean;
  model?: string;
}

/**
 * Options for optimized query execution with direct record access.
 */
export interface ExecuteOptimizedQueryOptions {
  method: AdapterMethod;
  model: string;
  where?: any[];
  baseQuery: string;
  directRecordQuery?: (recordIds: any[]) => string;
  content?: any;
  suffix?: string;
  processResult?: (result: any) => any;
  returnCount?: boolean;
  singleRecord?: boolean;
}

/**
 * Default field-to-table reference mappings for common Better Auth fields.
 */
export const DEFAULT_FIELD_REFERENCES: Record<string, string> = {
  userId: "user",
  organizationId: "organization",
  teamId: "team",
  inviterId: "user",
  activeOrganizationId: "organization",
  activeTeamId: "team",
};

/**
 * Comparison operator mappings for SurrealDB WHERE clauses.
 */
export const COMPARISON_OPERATORS: Record<string, string> = {
  eq: "=",
  ne: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

/**
 * String operator mappings for SurrealDB text operations.
 */
export const STRING_OPERATORS: Record<string, string> = {
  contains: "CONTAINS",
  starts_with: "starts_with",
  ends_with: "ends_with",
};

/**
 * Special field mapping rules with conditional logic.
 */
export const FIELD_MAPPING_RULES: FieldMappingRule[] = [
  {
    sourceModel: "account",
    sourceField: "accountId",
    targetModel: "user",
    condition: (data) => data.providerId === "credential",
  },
  {
    sourceModel: "oauthAccessToken",
    sourceField: "clientId",
    targetModel: "oauthApplication",
  },
  {
    sourceModel: "oauthConsent",
    sourceField: "clientId",
    targetModel: "oauthApplication",
  },
];

/**
 * Parameters for schema generation from Better Auth tables.
 */
export interface GenerateSchemaParams {
  file?: string;
  tables: Record<string, any>;
  getModelName: (model: string) => string;
  getFieldName: (opts: { model: string; field: string }) => string;
  getReferencedModel: (tableName: string, fieldName: string) => string | null;
}

/**
 * Result of schema generation with path and content.
 */
export interface GenerateSchemaResult {
  path: string;
  code: string;
  overwrite: boolean;
}

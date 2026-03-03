import type { DBAdapterDebugLogOption } from "better-auth/adapters";

/**
 * Supported ID generation strategies for SurrealDB records.
 * - ULID: Universally Unique Lexicographically Sortable Identifier.
 * - UUIDv4: Randomly generated UUID.
 * - UUIDv7: Time-ordered UUID.
 * - guid: SurrealDB's default random string ID.
 */
export type IdGenerator = "ULID" | "UUIDv4" | "UUIDv7" | "guid";

/**
 * Internal map used to track which fields reference which tables.
 * Used during RecordId conversion to ensure correct table prefixes.
 */
export interface RecordIdMap {
  tableSpecific: Record<string, Record<string, string>>;
}

/**
 * Configuration options for the SurrealDB adapter.
 */
export interface SurrealDBAdapterConfig {
  /**
   * Enable granular debug logging for adapter operations.
   * @default false
   */
  debugLogs?: DBAdapterDebugLogOption;

  /**
   * Whether to use plural table names (e.g., 'users' instead of 'user').
   * @default false
   */
  usePlural?: boolean;

  /**
   * Strategy for generating record IDs in SurrealDB.
   * If undefined, falls back to Better-Auth's default behavior.
   * @default undefined
   */
  idGenerator?: IdGenerator;

  /**
   * Displays the interpolated SurrealQL queries in the console for debugging purposes.
   * @default false
   */
  logSurrealQL?: boolean;
}

/**
 * Valid method names for the database adapter.
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
 * Parameters passed to the schema generation function.
 */
export interface GenerateSchemaParams {
  /** Path to the output file. */
  file?: string;
  /** The table definitions from Better-Auth. */
  tables: Record<string, any>;
  /** Utility to get the actual database table name for a model. */
  getModelName: (model: string) => string;
  /** Utility to get the actual database field name for a model property. */
  getFieldName: (opts: { model: string; field: string }) => string;
  /** Logic to determine if a field is a reference to another table. */
  getReferencedModel: (tableName: string, fieldName: string) => string | null;
}

/**
 * The output structure of a schema generation operation.
 */
export interface GenerateSchemaResult {
  /** The final path where the schema was (or should be) written. */
  path: string;
  /** The generated SurrealQL code. */
  code: string;
  /** Whether the generation should overwrite an existing file. */
  overwrite: boolean;
}

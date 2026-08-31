import type { BetterAuthDBSchema } from "better-auth";
import type { DBAdapterDebugLogOption } from "better-auth/adapters";

/**
 * Supported ID generation strategies for SurrealDB records.
 * - `ULID`: Universally Unique Lexicographically Sortable Identifier (rand::ulid()).
 * - `UUIDv4`: Randomly generated UUIDv4 (rand::uuid::v4()).
 * - `UUIDv7`: Time-ordered UUIDv7 (rand::uuid()).
 * - `guid`: SurrealDB's default random string ID (rand::id()).
 */
export type IdGenerator = "ULID" | "UUIDv4" | "UUIDv7" | "guid";

/**
 * Table definition mode for generated SurrealQL schema files.
 * - `schemafull` (default): Strictly enforces types and constraints on all declared fields.
 * - `schemaless`: Enforces known types/indexes, but accepts arbitrary undeclared plugin fields.
 */
export type SchemaMode = "schemafull" | "schemaless";

/**
 * Internal map used to track which fields reference which tables.
 * Used during RecordId conversion to ensure correct table prefixes.
 */
export interface RecordIdMap {
  tableSpecific: Record<string, Record<string, string>>;
}

/**
 * Configuration options for the SurrealDB Better Auth adapter.
 */
export interface SurrealDBAdapterConfig {
  /**
   * Enable granular debug logging for adapter operations.
   * Accepts either a boolean flag or a granular method filter object.
   * @default false
   */
  debugLogs?: boolean | DBAdapterDebugLogOption;

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
   * Displays the raw and interpolated SurrealQL queries in the console for debugging.
   * @default false
   */
  logSurrealQL?: boolean;

  /**
   * Table definition mode used when generating `.surql` schema files.
   * @default "schemafull"
   */
  schemaMode?: SchemaMode;
}

/**
 * Valid method names for the database adapter, including modern Better-Auth 1.7+ operations.
 */
export type AdapterMethod =
  | "create"
  | "update"
  | "updateMany"
  | "findOne"
  | "findMany"
  | "delete"
  | "deleteMany"
  | "count"
  | "consumeOne"
  | "incrementOne";

/**
 * Parameters passed to the schema generation function.
 */
export interface GenerateSchemaParams {
  /** Path to the output file (defaults to 'schema.surql'). */
  file?: string;

  /** The table definitions from Better-Auth. */
  tables: BetterAuthDBSchema | Record<string, any>;

  /** Utility to get the actual database table name for a model. */
  getModelName: (model: string) => string;

  /** Utility to get the actual database field name for a model property. */
  getFieldName: (opts: { model: string; field: string }) => string;

  /** Logic to determine if a field is a reference to another table. */
  getReferencedModel: (tableName: string, fieldName: string) => string | null;

  /** Table definition mode for the generated schema. */
  schemaMode?: SchemaMode;

  /** Whether plural table names are enabled. */
  usePlural?: boolean;
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

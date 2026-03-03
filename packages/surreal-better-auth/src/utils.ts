import { logger, type BetterAuthDBSchema, type JoinConfig } from "better-auth";
import { raw, escapeIdent, type BoundQuery, RecordId, StringRecordId, surql } from "surrealdb";
import { type RecordIdMap, type SurrealDBAdapterConfig } from "./types";

/**
 * Function type to resolve actual database field names from internal model field names.
 */
type GetFieldNameFn = (params: { field: string; model: string }) => string;

/**
 * Converts a string or primitive value to a SurrealDB RecordId or StringRecordId.
 * Validates the table prefix against the valid tables set to prevent accidental
 * conversion of non-record strings (e.g., URLs) containing colons.
 *
 * @param value - The value to convert.
 * @param validTables - A set of valid table names in the current database.
 * @param fallbackTable - Optional table name to use if the value lacks a prefix.
 * @returns A RecordId instance or the original value.
 */
export function toRecordId(
  value: any,
  validTables: Set<string>,
  fallbackTable?: string | null,
): any {
  if (value instanceof RecordId || value instanceof StringRecordId) return value;

  if (typeof value === "string" && value.length > 0) {
    const colonIndex = value.indexOf(":");

    if (colonIndex > 0) {
      const tablePrefix = value.substring(0, colonIndex);
      if (validTables.has(tablePrefix)) {
        return new RecordId(tablePrefix, value.substring(colonIndex + 1));
      }
      return value;
    }

    if (fallbackTable && colonIndex === -1 && validTables.has(fallbackTable)) {
      return new RecordId(fallbackTable, value);
    }
  }

  return value;
}

/**
 * Identifies the target model for polymorphic fields or fields where metadata info might be missing.
 * Specifically handles 'accountId' for accounts and 'clientId' for OAuth models.
 *
 * @param dbModelName - The actual database table name.
 * @param field - The internal field name.
 * @param getModelName - Resolver for database table names.
 * @param schema - The Better-Auth database schema.
 * @param data - Optional data object for context-sensitive resolution.
 * @returns The target model name or null if not resolved.
 */
export const getSpecialReferenceModel = (
  dbModelName: string,
  field: string,
  getModelName: (m: string) => string,
  schema: BetterAuthDBSchema,
  data?: Record<string, any>,
): string | null => {
  if (schema.account && dbModelName === getModelName("account") && field === "accountId") {
    const userModel = schema.user ? getModelName("user") : null;
    if (data) {
      return data.providerId === "credential" ? userModel : null;
    }
    return userModel;
  }

  if (schema.oauthAccessToken && schema.oauthConsent) {
    const accessTokenTable = getModelName("oauthAccessToken");
    const consentTable = getModelName("oauthConsent");

    if (
      (dbModelName === accessTokenTable || dbModelName === consentTable) &&
      field === "clientId"
    ) {
      return schema.oauthApplication ? getModelName("oauthApplication") : null;
    }
  }

  return null;
};

/**
 * Factory for creating the WHERE clause builder.
 * Handles operator mapping and automatic RecordId conversion for relational fields.
 *
 * @param getFieldName - Resolver for field names.
 * @param getFieldAttributes - Resolver for field metadata.
 * @param getModelName - Resolver for table names.
 * @param validTables - Set of valid database tables.
 * @param schema - Better-Auth DB schema.
 * @returns A function that generates a BoundQuery for WHERE clauses.
 */
export const createWhereBuilder = (
  getFieldName: any,
  getFieldAttributes: any,
  getModelName: any,
  validTables: Set<string>,
  schema: BetterAuthDBSchema,
) => {
  return (where: any[] | undefined | null, modelName: string) => {
    if (!where || where.length === 0) return null;

    let query = surql``;
    const dbModelName = getModelName(modelName);

    where.forEach((w, index) => {
      if (index > 0) {
        query.append(surql` ${raw(w.connector || "AND")} `);
      }

      const dbField = getFieldName({ field: w.field, model: modelName });
      const attr = getFieldAttributes({ field: w.field, model: modelName });
      let val = w.value;

      let targetModel = getSpecialReferenceModel(dbModelName, w.field, getModelName, schema);

      if (!targetModel && (w.field === "id" || attr?.references)) {
        const refModel = attr?.references?.model;
        targetModel = refModel ? getModelName(refModel) : dbModelName;
      }

      if (targetModel) {
        if (Array.isArray(val)) {
          val = val.map((v) => toRecordId(v, validTables, targetModel));
        } else if (val !== undefined && val !== null) {
          val = toRecordId(val, validTables, targetModel);
        }
      }

      const fieldRaw = raw(escapeIdent(dbField));

      switch (w.operator) {
        case "eq":
        case undefined:
          query.append(surql`${fieldRaw} = ${val}`);
          break;
        case "ne":
          query.append(surql`${fieldRaw} != ${val}`);
          break;
        case "gt":
          query.append(surql`${fieldRaw} > ${val}`);
          break;
        case "gte":
          query.append(surql`${fieldRaw} >= ${val}`);
          break;
        case "lt":
          query.append(surql`${fieldRaw} < ${val}`);
          break;
        case "lte":
          query.append(surql`${fieldRaw} <= ${val}`);
          break;
        case "in":
          query.append(surql`${fieldRaw} IN ${val}`);
          break;
        case "not_in":
          query.append(surql`${fieldRaw} NOT IN ${val}`);
          break;
        case "contains":
          query.append(surql`${fieldRaw} CONTAINS ${val}`);
          break;
        case "starts_with":
          query.append(surql`string::starts_with(${fieldRaw}, ${val})`);
          break;
        case "ends_with":
          query.append(surql`string::ends_with(${fieldRaw}, ${val})`);
          break;
        default:
          throw new Error(`[SurrealDB Adapter]: Unsupported operator "${w.operator}"`);
      }
    });

    return query;
  };
};

/**
 * Extracts field names from join configurations to build the SurrealDB FETCH clause.
 *
 * @param join - Better-Auth join configuration.
 * @param getFieldName - Resolver for field names.
 * @param model - Base model name.
 * @returns Array of field names to fetch or null.
 */
export const buildFetchLinks = (
  join: JoinConfig | undefined,
  getFieldName: GetFieldNameFn,
  model: string,
): string[] | null => {
  if (!join) return null;

  const keys = Object.keys(join);
  const recordLinks: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const config = join[keys[i]];
    if (config && typeof config === "object" && "on" in config) {
      recordLinks.push(getFieldName({ model, field: config.on.from }));
    }
  }

  return recordLinks.length > 0 ? recordLinks : null;
};

/**
 * Converts null values to undefined within an object.
 * Required for SurrealDB MERGE operations to effectively remove fields
 * rather than storing null values.
 *
 * @param data - The object to transform.
 * @returns The transformed object with nulls replaced by undefined.
 */
export function mapNullToUndefined<T extends Record<string, any>>(data: T): T {
  const out = { ...data };
  const keys = Object.keys(out);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (out[key] === null) {
      (out as any)[key] = undefined;
    }
  }

  return out;
}

/**
 * Internal error reporting utilities for debugging purposes.
 */
export const ERROR_HANDLERS = {
  modelNotFound: (modelName: string, config?: SurrealDBAdapterConfig) => {
    if (config?.debugLogs) {
      logger.debug(
        `[surreal-better-auth]: Model '${modelName}' not found in schema, skipping operation`,
      );
    }
  },
  fieldMappingSkipped: (rule: string, reason: string, config?: SurrealDBAdapterConfig) => {
    if (config?.debugLogs) {
      logger.debug(`[surreal-better-auth]: Skipping field mapping rule for '${rule}': ${reason}`);
    }
  },
  unsupportedOperator: (operator: string, config?: SurrealDBAdapterConfig) => {
    if (config?.debugLogs) {
      logger.warn(
        `[surreal-better-auth]: Unknown operator '${operator}', falling back to equality comparison`,
      );
    }
  },
};

/**
 * Resolves the referenced model for a specific field using explicit mappings or defaults.
 *
 * @returns The referenced model name or null.
 */
export function getReferencedModel(
  tableName: string,
  fieldName: string,
  recordIdMap: RecordIdMap,
  getDefaultModelName: (tableName: string) => string,
  getDefaultFieldName: (opts: { model: string; field: string }) => string,
  getModelName: (model: string) => string,
  config?: SurrealDBAdapterConfig,
): string | null {
  const defaultModel = getDefaultModelName(tableName);
  const defaultField = getDefaultFieldName({
    model: defaultModel,
    field: fieldName,
  });

  const referencedModel = DEFAULT_FIELD_REFERENCES[defaultField];
  if (referencedModel) {
    try {
      return getModelName(referencedModel);
      // oxlint-disable-next-line
    } catch (error) {
      ERROR_HANDLERS.modelNotFound(referencedModel, config);
    }
  }

  return recordIdMap.tableSpecific[tableName]?.[fieldName] || null;
}

/**
 * Standard relational mappings used for common Better-Auth fields.
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
 * Scans the Better-Auth schema to build a map of fields referencing other tables.
 * Used to automatically resolve RecordId types.
 *
 * @returns A populated RecordIdMap object.
 */
export function buildRecordIdMap(
  tables: any,
  getModelName: (model: string) => string,
  getFieldName: (opts: { model: string; field: string }) => string,
): RecordIdMap {
  const map: RecordIdMap = { tableSpecific: {} };
  if (!tables) return map;

  for (const internalModelName in tables) {
    const tableDef = tables[internalModelName];
    if (!tableDef?.fields) continue;

    const actualTableName = getModelName(internalModelName);
    if (!map.tableSpecific[actualTableName]) {
      map.tableSpecific[actualTableName] = {};
    }

    for (const internalFieldName in tableDef.fields) {
      const fieldDef = tableDef.fields[internalFieldName];
      if (fieldDef?.references?.model) {
        const actualFieldName = getFieldName({
          model: internalModelName,
          field: internalFieldName,
        });
        const referencedActualTableName = getModelName(fieldDef.references.model);
        map.tableSpecific[actualTableName][actualFieldName] = referencedActualTableName;
      }
    }
  }
  return map;
}

/**
 * ANSI Escape sequences for colorized console output.
 */
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[90m",
  border: "\x1b[38;5;238m",
  fg: {
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    purple: "\x1b[35m",
  },
};

/**
 * Formats and outputs SurrealQL queries to the console with syntax highlighting.
 * Helps developers verify queries and bindings sent to SurrealDB.
 *
 * @param config - Adapter configuration containing logging flags.
 * @param method - The name of the adapter method being called.
 * @param model - The model name.
 * @param queryObj - The BoundQuery containing the SurQL string and bindings.
 */
export function logSurrealQuery(config: any, method: string, model: string, queryObj: BoundQuery) {
  if (!config?.debugLogs && !config?.logSurrealQL) return;

  if (typeof config.debugLogs === "object" && !("isRunningAdapterTests" in config.debugLogs)) {
    const logsMap = config.debugLogs as Record<string, boolean>;
    if (!logsMap[method]) return;
  }

  const q = queryObj.query;
  const b = queryObj.bindings || {};

  const formatValue = (val: any): string => {
    if (typeof val === "string") {
      if (val.includes(":")) return `${colors.fg.cyan}${val}${colors.reset}`;
      return `${colors.fg.green}'${val}'${colors.reset}`;
    }
    if (typeof val === "number" || typeof val === "boolean")
      return `${colors.fg.yellow}${val}${colors.reset}`;
    if (val === null) return `${colors.dim}null${colors.reset}`;
    if (val === undefined) return `${colors.dim}undefined${colors.reset}`;

    let jsonStr = "";
    try {
      jsonStr = JSON.stringify(val, null, 2);
    } catch {
      jsonStr = String(val);
    }

    return jsonStr
      .replace(/"([^"]+)":/g, `${colors.fg.cyan}$1${colors.reset}:`)
      .replace(/: "([^"]*)"/g, `: ${colors.fg.green}'$1'${colors.reset}`)
      .replace(
        /: (true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        `: ${colors.fg.yellow}$1${colors.reset}`,
      );
  };

  const formatSQL = (str: string) =>
    str
      .replace(
        /\b(CREATE|CONTENT|SELECT|FROM|WHERE|UPDATE|MERGE|SET|DELETE|LIMIT|ORDER BY|START|FETCH|type::record|type::thing)\b/g,
        `${colors.fg.purple}$1${colors.reset}`,
      )
      .replace(/\b(rand::\w+(?:::\w+)?)\b/g, `${colors.fg.blue}$1${colors.reset}`)
      .replace(/(\$bind__\w+)/g, `${colors.fg.yellow}$1${colors.reset}`);

  let fullQuery = q;
  const sortedKeys = Object.keys(b).sort((a, b) => b.length - a.length);
  sortedKeys.forEach((key) => {
    const val = b[key];
    const displayVal = typeof val === "string" ? `'${val}'` : JSON.stringify(val);
    fullQuery = fullQuery.replace(
      new RegExp(`\\$${key}\\b`, "g"),
      `${colors.fg.green}${displayVal}${colors.reset}`,
    );
  });

  let logOut = `\n${colors.border}┌── ${colors.reset}${colors.bold}SURREALDB DEBUG${colors.reset} ${colors.dim}───────────────────────────────────────${colors.reset}\n`;

  const addLine = (content: string = "") => {
    const lines = content.split("\n");
    lines.forEach((line) => {
      logOut += `${colors.border}│${colors.reset} ${line}\n`;
    });
  };

  addLine(
    `${colors.dim}Method:${colors.reset} ${colors.bold}${method}${colors.reset}  ${colors.dim}Model:${colors.reset} ${colors.fg.cyan}${model}${colors.reset}`,
  );
  addLine();
  addLine(`${colors.dim}Full Query (interpolated):${colors.reset}`);
  addLine(formatSQL(fullQuery));
  addLine();
  addLine(`${colors.dim}Raw SurQL:${colors.reset}`);
  addLine(formatSQL(q));
  addLine();
  addLine(`${colors.dim}Bindings:${colors.reset}`);

  Object.entries(b).forEach(([key, val]) => {
    const prefix = `  ${colors.fg.yellow}${key}${colors.reset} ${colors.dim}=${colors.reset} `;
    const cleanPrefixLength = `  ${key} = `.length;

    let formattedVal = formatValue(val);

    if (formattedVal.includes("\n")) {
      const indentStr = " ".repeat(cleanPrefixLength);
      formattedVal = formattedVal
        .split("\n")
        .map((l, i) => (i === 0 ? l : `${indentStr}${l}`))
        .join("\n");
    }

    addLine(`${prefix}${formattedVal}`);
  });

  logOut += `${colors.border}└──────────────────────────────────────────────────────────────${colors.reset}\n`;

  console.log(logOut);
}

/**
 * Normalizes SurrealDB results by processing the FETCH clause output.
 * Moves successfully fetched documents to their corresponding relation keys
 * and restores simple string IDs in the original foreign key fields to maintain type stability.
 * Optimized for performance by pre-calculating join meta-data.
 *
 * @param data - Single record or array of records from SurrealDB.
 * @param join - Better-Auth join configuration.
 * @param model - Internal model name.
 * @param getFieldName - Resolver for field names.
 * @returns The normalized data matching Better-Auth's relational structure.
 */
export const mapFetchedRelations = <T extends Record<string, any>>(
  data: T | T[] | null | undefined,
  join: JoinConfig | undefined,
  model: string,
  getFieldName: GetFieldNameFn,
): T | T[] | null | undefined => {
  if (!data || !join) return data;

  const isArray = Array.isArray(data);
  const records = isArray ? (data as T[]) : [data as T];
  if (records.length === 0) return data;

  const joinKeys = Object.keys(join);
  const joinMeta = [];
  for (let i = 0; i < joinKeys.length; i++) {
    const relName = joinKeys[i];
    joinMeta.push({
      relName,
      relField: getFieldName({ model, field: (join[relName] as any).on.from }),
    });
  }

  for (let i = 0; i < records.length; i++) {
    const table = records[i];
    if (!table) continue;

    for (let j = 0; j < joinMeta.length; j++) {
      const { relName, relField } = joinMeta[j];
      const val = table[relField];

      if (
        val &&
        typeof val === "object" &&
        !(val instanceof RecordId) &&
        !(val instanceof StringRecordId)
      ) {
        table[relName as keyof T] = val;
        table[relField as keyof T] = (val.id?.toString() || val.id) as any;
      }
    }
  }

  return isArray ? records : records[0];
};

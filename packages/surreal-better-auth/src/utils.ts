import { logger, type BetterAuthDBSchema, type JoinConfig } from "better-auth";
import { raw, escapeIdent, type BoundQuery, RecordId, StringRecordId, surql } from "surrealdb";
import { type RecordIdMap, type SurrealDBAdapterConfig } from "./types";

type GetFieldNameFn = (params: { field: string; model: string }) => string;

/**
 * Converts a value to a SurrealDB RecordId or StringRecordId.
 * It validates the table prefix against the schema to avoid converting
 * non-record strings (like URLs or emails) that happen to contain colons.
 */
export function toRecordId(
  value: any,
  validTables: Set<string>,
  fallbackTable?: string | null,
): any {
  if (value instanceof RecordId || value instanceof StringRecordId) return value;

  if (typeof value === "string") {
    if (value.includes(":")) {
      const [tablePrefix, ...rest] = value.split(":");
      const idPart = rest.join(":");

      if (validTables.has(tablePrefix)) {
        return new RecordId(tablePrefix, idPart);
      }
      return value;
    }

    if (fallbackTable && validTables.has(fallbackTable)) {
      return new RecordId(fallbackTable, value);
    }
  }

  return value;
}

/**
 * Resolves the target table for polymorphic fields or fields where
 * Better-Auth metadata might be missing explicit relationship info.
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
 * Builds a BoundQuery for the WHERE clause, handling operator mapping
 * and automatic RecordId conversion for relational fields.
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
 * Maps join configurations to a list of fields for the SurrealDB FETCH clause.
 */
export const buildFetchLinks = (
  join: JoinConfig | undefined,
  getFieldName: GetFieldNameFn,
  _model: string,
) => {
  if (!join) return null;

  const recordLinks = Object.entries(join).map(([joinedModel, config]): string => {
    return getFieldName({ model: joinedModel, field: config.on.to });
  });
  return recordLinks;
};

/**
 * Converts null values to undefined.
 * This is required for SurrealDB MERGE operations to effectively
 * unset/remove fields from a document rather than storing a NULL value.
 */
export function mapNullToUndefined<T extends Record<string, any>>(data: T): T {
  const out = { ...data };

  for (const key of Object.keys(out)) {
    if ((out as any)[key] === null) {
      (out as any)[key] = undefined;
    }
  }

  return out;
}

/**
 * Standardized error logging for adapter operations.
 */
export const ERROR_HANDLERS = {
  modelNotFound: (modelName: string, config?: SurrealDBAdapterConfig) => {
    if (config?.debugLogs) {
      logger.debug(
        `[surreal-better-auth]: Model '${modelName}' not found in schema, skipping operation `,
      );
    }
  },
  fieldMappingSkipped: (rule: string, reason: string, config?: SurrealDBAdapterConfig) => {
    if (config?.debugLogs) {
      logger.debug(`[surreal-better-auth]: Skipping field mapping rule for '${rule}': ${reason} `);
    }
  },
  unsupportedOperator: (operator: string, config?: SurrealDBAdapterConfig) => {
    if (config?.debugLogs) {
      logger.warn(
        `[surreal-better-auth]: Unknown operator '${operator}', falling back to equality comparison `,
      );
    }
  },
};

/**
 * Finds the referenced model name for a specific field based on schema or defaults.
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
      const modelName = getModelName(referencedModel);
      if (config?.debugLogs) {
        logger.debug(
          `[surreal-better-auth]: Found default reference: ${tableName}.${fieldName} -> ${modelName} `,
        );
      }
      return modelName;
      // oxlint-disable-next-line
    } catch (error) {
      ERROR_HANDLERS.modelNotFound(referencedModel, config);
    }
  }

  const tableSpecificRef = recordIdMap.tableSpecific[tableName]?.[fieldName];
  if (tableSpecificRef && config?.debugLogs) {
    logger.debug(
      `[surreal-better-auth]: Found table-specific reference: ${tableName}.${fieldName} -> ${tableSpecificRef} `,
    );
  }

  return tableSpecificRef || null;
}

/**
 * Common field-to-model mappings used as a fallback for implicit relationships.
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
 * Scans Better-Auth tables to build a map of fields that reference other models.
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
 * Formats and logs SurrealQL queries to the console with syntax highlighting.
 * Helps developers debug the exact queries and bindings sent to the database.
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

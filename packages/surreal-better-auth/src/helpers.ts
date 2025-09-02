/**
 * Helper utilities for SurrealDB Better Auth adapter.
 * Handles ID conversion, data transformation, and schema mapping.
 */

import { decodeCbor, PreparedQuery, RecordId, type Fill, Gap } from "surrealdb";
import type { Where } from "better-auth/types";
import { logger } from "better-auth";
import type {
  AdapterMethod,
  RecordIdMap,
  SurrealDBAdapterConfig,
  QuerySuffixOptions,
  // FieldMappingRule
} from "./types";
import {
  COMPARISON_OPERATORS,
  STRING_OPERATORS,
  DEFAULT_FIELD_REFERENCES,
  FIELD_MAPPING_RULES,
} from "./types";

/**
 * Converts null values to undefined to prevent SurrealDB errors with option<record<table>> fields.
 */
export function mapNullToUndefined(
  data: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...data };
  for (const k of Object.keys(out)) {
    if (out[k] === null) out[k] = undefined;
  }
  return out;
}

/**
 * Converts various ID formats to SurrealDB RecordId.
 * Handles RecordId instances, "table:id" strings, plain IDs, and numbers.
 */
export function toRecordId(model: string, id: any): RecordId {
  if (id instanceof RecordId) return id;
  if (typeof id === "string") {
    if (id.includes(":"))
      return new RecordId(id.split(":")[0], id.split(":")[1]);
    return new RecordId(model, id);
  }
  return new RecordId(model, id);
}

/**
 * Recursively converts RecordId objects to "table:id" strings throughout data structures.
 */
export function recordIdsToStrings<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof RecordId)
    return (value.id
      ? `${(value as RecordId).tb}:${(value as RecordId).id}`
      : value.toString()) as unknown as T;
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value))
    return value.map((v) => recordIdsToStrings(v)) as unknown as T;
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = recordIdsToStrings(v as any);
    }
    return out as T;
  }
  return value;
}

/**
 * Builds field-to-table reference mappings from Better Auth schema for RecordId conversion.
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
        const referencedActualTableName = getModelName(
          fieldDef.references.model,
        );
        map.tableSpecific[actualTableName][actualFieldName] =
          referencedActualTableName;
      }
    }
  }
  return map;
}

/**
 * Logs SurrealDB queries with formatted output when debug logging is enabled.
 */
export function logQuery(
  config: SurrealDBAdapterConfig | undefined,
  debugLog: (...args: any[]) => void,
  method: AdapterMethod,
  query: PreparedQuery,
  fills: Fill<any>[],
): void {
  if (!config?.debugLogs) return;
  if (
    config.debugLogs &&
    typeof config.debugLogs === "object" &&
    !("isRunningAdapterTests" in config.debugLogs)
  ) {
    if (method === "create" && !config.debugLogs.create) {
      return;
    } else if (method === "update" && !config.debugLogs.update) {
      return;
    } else if (method === "updateMany" && !config.debugLogs.updateMany) {
      return;
    } else if (method === "findOne" && !config.debugLogs.findOne) {
      return;
    } else if (method === "findMany" && !config.debugLogs.findMany) {
      return;
    } else if (method === "delete" && !config.debugLogs.delete) {
      return;
    } else if (method === "deleteMany" && !config.debugLogs.deleteMany) {
      return;
    } else if (method === "count" && !config.debugLogs.count) {
      return;
    }
  }

  const encoded = query.build(fills);
  const [queryTemplate, params] = decodeCbor(encoded);
  let readableQuery = queryTemplate;

  // Replace parameters with actual values
  Object.entries(params).forEach(([paramName, value]) => {
    const paramPattern = new RegExp(`\\$${paramName}\\b`, "g");
    let formattedValue: string;

    if (value instanceof RecordId) {
      // RecordId should be displayed without quotes
      formattedValue = value.toString();
    } else if (typeof value === "string" && value.includes(":")) {
      // String that looks like RecordId should be displayed without quotes
      formattedValue = value;
    } else {
      // Other values should be JSON stringified
      formattedValue = JSON.stringify(value);
    }

    readableQuery = readableQuery.replace(paramPattern, formattedValue);
  });
  const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    fg: {
      surreal_pink: "\x1b[38;5;200m",
      surreal_purple: "\x1b[38;5;93m",
      yellow: "\x1b[33m",
      magenta: "\x1b[35m",
    },
    bg: {
      obsidian_violet: "\x1b[48;5;233m",
      black: "\x1b[40m",
    },
  };
  function formatLogLine(lang: string, query: string) {
    let transationId = `${colors.fg.magenta}###`;
    let stepString = `${colors.bg.black}${colors.fg.yellow}[0/#]${colors.reset}`;
    let methodString = `${colors.bright}${method}`;
    let preparedString = `${colors.dim}(PreparedQuery)${colors.reset}:`;
    const PADDING = "  ";
    let formattedString = `${colors.bg.obsidian_violet}`;
    formattedString += PADDING;
    formattedString += `${colors.fg.surreal_purple}[${lang}]`;
    formattedString += `  ${colors.fg.surreal_pink}${query}`;
    formattedString += PADDING;
    formattedString += `${colors.reset}`;
    return `${transationId} ${stepString} ${methodString} ${preparedString} \n\n${formattedString}\n\n`;
  }

  debugLog(`${formatLogLine("SurrealQL", readableQuery)}`);
}
/**
 * Declarative error handling configuration for adapter operations.
 */
export const ERROR_HANDLERS = {
  modelNotFound: (modelName: string, config?: SurrealDBAdapterConfig) => {
    if (config?.debugLogs) {
      logger.debug(
        `[surreal-better-auth]: Model '${modelName}' not found in schema, skipping operation `,
      );
    }
  },
  fieldMappingSkipped: (
    rule: string,
    reason: string,
    config?: SurrealDBAdapterConfig,
  ) => {
    if (config?.debugLogs) {
      logger.debug(
        `[surreal-better-auth]: Skipping field mapping rule for '${rule}': ${reason} `,
      );
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
 * Gets the referenced table name for a field using default mappings and schema.
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

  // Check default references first
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
    } catch (error) {
      ERROR_HANDLERS.modelNotFound(referencedModel, config);
    }
  }

  // Fallback to table-specific mappings
  const tableSpecificRef = recordIdMap.tableSpecific[tableName]?.[fieldName];
  if (tableSpecificRef && config?.debugLogs) {
    logger.debug(
      `[surreal-better-auth]: Found table-specific reference: ${tableName}.${fieldName} -> ${tableSpecificRef} `,
    );
  }

  return tableSpecificRef || null;
}

/**
 * Builds special field mapping cases from declarative rules.
 */
export function buildSpecialCasesMapping(
  getModelName: (model: string) => string,
  getFieldName: (opts: { model: string; field: string }) => string,
  config?: SurrealDBAdapterConfig,
): Record<
  string,
  Record<
    string,
    {
      condition?: (data: Record<string, any>) => boolean;
      recordTable: string;
    }
  >
> {
  const specialCases: Record<
    string,
    Record<
      string,
      {
        condition?: (data: Record<string, any>) => boolean;
        recordTable: string;
      }
    >
  > = {};

  for (const rule of FIELD_MAPPING_RULES) {
    try {
      const sourceModelName = getModelName(rule.sourceModel);
      const targetModelName = getModelName(rule.targetModel);
      const fieldName = getFieldName({
        model: rule.sourceModel,
        field: rule.sourceField,
      });

      if (!specialCases[sourceModelName]) {
        specialCases[sourceModelName] = {};
      }

      specialCases[sourceModelName][fieldName] = {
        recordTable: targetModelName,
        condition: rule.condition,
      };

      if (config?.debugLogs) {
        logger.debug(
          `[surreal-better-auth]: Registered field mapping: ${sourceModelName}.${fieldName} -> to record ${targetModelName} `,
        );
      }
    } catch (e) {
      const error = e as Error;
      ERROR_HANDLERS.fieldMappingSkipped(
        `${rule.sourceModel}.${rule.sourceField}`,
        error.message,
        config,
      );
    }
  }

  return specialCases;
}

/**
 * Converts string IDs to RecordId objects for fields that reference other tables.
 */
export function serializeRecordIdFields(
  tableName: string,
  data: Record<string, any>,
  getReferencedModelFn: (tableName: string, fieldName: string) => string | null,
  buildSpecialCasesFn: () => Record<
    string,
    Record<
      string,
      {
        condition?: (data: Record<string, any>) => boolean;
        recordTable: string;
      }
    >
  >,
  config?: SurrealDBAdapterConfig,
): Record<string, any> {
  const out = { ...data };
  const specialCases = buildSpecialCasesFn();

  if (config?.debugLogs) {
    logger.debug(
      `[surreal-better-auth]: Serializing record ID fields for table: ${tableName} `,
      {
        fieldCount: Object.keys(out).length,
        hasSpecialCases: !!specialCases[tableName],
      },
    );
  }

  for (const fieldName in out) {
    const value = out[fieldName];

    if (typeof value !== "string" || !value) {
      continue;
    }

    const specialCase = specialCases[tableName]?.[fieldName];

    if (specialCase) {
      const shouldApply = !specialCase.condition || specialCase.condition(out);

      if (shouldApply) {
        const recordId = toRecordId(specialCase.recordTable, value);
        out[fieldName] = recordId;

        if (config?.debugLogs) {
          logger.debug(
            `[surreal-better-auth]: Applied special case mapping: ${tableName}.${fieldName} = "${value}" -> "${recordId}" `,
          );
        }
      } else if (config?.debugLogs) {
        logger.debug(
          `[surreal-better-auth]: Special case condition not met for: ${tableName}.${fieldName} `,
        );
      }
    } else {
      const referencedModel = getReferencedModelFn(tableName, fieldName);

      if (referencedModel) {
        const recordId = toRecordId(referencedModel, value);
        out[fieldName] = recordId;

        if (config?.debugLogs) {
          logger.debug(
            `[surreal-better-auth]: Applied default reference mapping: ${tableName}.${fieldName} = "${value}" -> "${recordId}" `,
          );
        }
      }
    }
  }

  return out;
}

/**
 * Extracts direct record IDs from WHERE conditions for query optimization.
 */
export function extractDirectRecords(
  where: Where[] | undefined,
  model: string,
  getModelName: (model: string) => string,
): { recordIds: RecordId[]; remainingWhere: Where[] } | null {
  if (!where || where.length === 0) return null;

  const tableName = getModelName(model);

  // Find id = value condition (single record)
  const idEqIndex = where.findIndex(
    (w) => w.field === "id" && w.operator === "eq",
  );
  if (idEqIndex !== -1) {
    const idEqCondition = where[idEqIndex];
    const recordId = toRecordId(tableName, idEqCondition.value as any);
    const remainingWhere = where.filter((_, index) => index !== idEqIndex);
    return { recordIds: [recordId], remainingWhere };
  }

  // Find id IN [...] condition (multiple records)
  const idInIndex = where.findIndex(
    (w) => w.field === "id" && w.operator === "in" && Array.isArray(w.value),
  );
  if (idInIndex !== -1) {
    const idInCondition = where[idInIndex];
    const recordIds = (idInCondition.value as any[]).map((id) =>
      toRecordId(tableName, id),
    );
    const remainingWhere = where.filter((_, index) => index !== idInIndex);
    return { recordIds, remainingWhere };
  }

  return null;
}

/**
 * Builds query suffix with ORDER BY, LIMIT, RETURN clauses.
 */
export function buildQuerySuffix(
  options: QuerySuffixOptions = {},
  getFieldName?: (opts: { model: string; field: string }) => string,
): string {
  const {
    sortBy,
    limit,
    offset,
    groupAll,
    returnAfter,
    returnFields,
    limitOne,
    model,
  } = options;

  let suffix = "";

  // ORDER BY clause
  if (sortBy && model && getFieldName) {
    const field = getFieldName({ model, field: sortBy.field });
    const direction = sortBy.direction === "desc" ? "DESC" : "ASC";
    suffix += ` ORDER BY ${field} ${direction}`;
  }

  // LIMIT clause
  if (limitOne) {
    suffix += " LIMIT 1";
  } else if (typeof limit === "number") {
    suffix += ` LIMIT ${limit}`;
  }

  // START AT clause (offset)
  if (typeof offset === "number") {
    suffix += ` START AT ${offset}`;
  }

  // GROUP ALL clause
  if (groupAll) {
    suffix += " GROUP ALL";
  }

  // RETURN clauses
  if (returnAfter) {
    suffix += " RETURN AFTER";
  } else if (returnFields) {
    suffix += ` RETURN ${returnFields}`;
  }

  return suffix;
}

/**
 * Builds WHERE clause with proper parameter binding and RecordId conversion.
 */
export function buildWhereClauseParts(
  bindings: Record<string, Gap<any>>,
  fills: Fill<any>[],
  { where, model }: { where: Where[]; model: string },
  getModelName: (model: string) => string,
  getFieldName: (opts: { model: string; field: string }) => string,
  getReferencedModelFn: (tableName: string, fieldName: string) => string | null,
  config?: SurrealDBAdapterConfig,
): string {
  if (!where || where.length === 0) return "";

  const conditions: string[] = [];
  const tableName = getModelName(model);

  where.forEach((w, idx) => {
    const {
      field: internalField,
      value,
      operator = "eq",
      connector = "AND",
    } = w;
    if (operator === "in" && Array.isArray(value) && value.length === 0) return;

    const fieldName = getFieldName({ model, field: internalField });

    const param = `where_${idx}`;
    const gap = new Gap<any>();
    bindings[param] = gap;
    let conditionStr = "";

    if (operator === "in") {
      conditionStr = `${fieldName} IN $${param}`;
      const vals = Array.isArray(value) ? value : [value];
      let finalVals: any[] = vals;

      if (internalField === "id") {
        finalVals = vals.map((v) => toRecordId(tableName, v));
      } else {
        const referencedModelName = getReferencedModelFn(tableName, fieldName);
        if (referencedModelName) {
          finalVals = vals.map((v) =>
            typeof v === "string" ? toRecordId(referencedModelName, v) : v,
          );
        }
      }
      fills.push(gap.fill(finalVals));
    } else if (operator in COMPARISON_OPERATORS) {
      conditionStr = `${fieldName} ${COMPARISON_OPERATORS[operator]} $${param}`;
      if (internalField === "id") {
        const recordId = toRecordId(tableName, value);
        fills.push(gap.fill(recordId));
      } else {
        const referencedModelName = getReferencedModelFn(tableName, fieldName);
        if (referencedModelName && typeof value === "string") {
          const recordId = toRecordId(referencedModelName, value);
          fills.push(gap.fill(recordId));
        } else {
          fills.push(gap.fill(value));
        }
      }
    } else if (operator in STRING_OPERATORS) {
      if (STRING_OPERATORS[operator] === "CONTAINS") {
        conditionStr = `${fieldName} CONTAINS $${param}`;
      } else {
        conditionStr = `string::${STRING_OPERATORS[operator]}(${fieldName}, $${param})`;
      }
      fills.push(gap.fill(value));
    } else {
      // Fallback for unknown operators - treat as generic value comparison
      conditionStr = `${fieldName} = $${param}`;
      fills.push(gap.fill(value));

      ERROR_HANDLERS.unsupportedOperator(operator, config);
    }

    if (conditions.length > 0)
      conditions.push(` ${connector.toUpperCase()} ${conditionStr}`);
    else conditions.push(conditionStr);
  });

  if (conditions.length === 0) return "";
  return ` WHERE ${conditions.join("")}`;
}

/**
 * Generates CREATE query with appropriate ID generation strategy.
 */
export function generateCreateQuery(
  tableName: string,
  content: Record<string, any>,
  config?: SurrealDBAdapterConfig,
  customId?: string,
  selectFields?: string,
  generateId?: () => string,
): { query: PreparedQuery; fills: Fill<any>[] } {
  let targetClause: string;
  const providedId = customId ?? (generateId ? generateId() : null);

  if (providedId) {
    targetClause = toRecordId(tableName, providedId).toString();
  } else {
    switch (config?.idGenerator) {
      case "surreal.ULID":
        targetClause = `type::thing('${tableName}', rand::ulid())`;
        break;
      case "surreal.UUID":
        targetClause = `type::thing('${tableName}', rand::uuid())`;
        break;
      case "surreal.UUIDv4":
        targetClause = `type::thing('${tableName}', rand::uuid::v4())`;
        break;
      case "surreal.UUIDv7":
        targetClause = `type::thing('${tableName}', rand::uuid::v7())`;
        break;
      case "surreal.guid":
        targetClause = `type::thing('${tableName}', rand::guid())`;
        break;
      case "surreal":
      default: // Includes `sdk.*` and undefined
        targetClause = `type::table('${tableName}')`;
        break;
    }
  }

  const suffix = buildQuerySuffix({ returnFields: selectFields });
  const queryString = `CREATE ${targetClause} CONTENT $content${suffix}`;

  const bindings = { content: new Gap<any>() };
  const fills = [bindings.content.fill(content)];
  const preparedQuery = new PreparedQuery(queryString, bindings);

  return {
    query: preparedQuery,
    fills,
  };
}

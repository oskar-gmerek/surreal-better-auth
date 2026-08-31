import type { BetterAuthDBSchema, Where } from "better-auth";
import { raw, type BoundQuery, RecordId, StringRecordId, surql, DateTime } from "surrealdb";
import type { SurrealDBAdapterConfig } from "./types";

export type GetFieldNameFn = (params: { field: string; model: string }) => string;

export function unwrapResult<T = any>(rawResult: any): T {
  if (!rawResult || !Array.isArray(rawResult) || rawResult.length === 0) {
    return [] as any;
  }
  const first = rawResult[0];
  if (first && typeof first === "object") {
    if ("status" in first) {
      if (first.status === "ERR") {
        throw new Error(`[SurrealDB Error]: ${first.detail || JSON.stringify(first)}`);
      }
      if ("result" in first) {
        return first.result as T;
      }
    }
  }
  return first as T;
}

export function cleanIdPart(id: string): string {
  let clean = id.trim();
  while (clean.startsWith("⟨") && clean.endsWith("⟩")) {
    clean = clean.slice(1, -1);
  }
  return clean;
}

/**
 * Deserializes database values to standard JavaScript types.
 * Matches the official SurrealDB adapter standard: extracts `val.id` from RecordId.
 */
export function formatRecordIdOutput(val: any): any {
  if (val === null || val === undefined) return val;

  if (val instanceof RecordId) {
    return typeof val.id === "string" ? cleanIdPart(val.id) : String(val.id);
  }

  if (val instanceof StringRecordId) {
    const str = val.toString();
    const colonIdx = str.indexOf(":");
    return colonIdx >= 0 ? cleanIdPart(str.slice(colonIdx + 1)) : cleanIdPart(str);
  }

  if (val instanceof DateTime) {
    return val.toDate();
  }

  if (val instanceof Date) {
    return val;
  }

  if (val instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(val))) {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(formatRecordIdOutput);
  }

  if (typeof val === "object") {
    if (val.constructor && val.constructor.name !== "Object") {
      return val;
    }
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      cleaned[key] = formatRecordIdOutput(val[key]);
    }
    return cleaned;
  }

  return val;
}

export function extractCleanId(val: any, validTables?: Set<string>): any {
  if (val instanceof RecordId) {
    return typeof val.id === "string" ? cleanIdPart(val.id) : String(val.id);
  }

  if (val instanceof StringRecordId) {
    const str = val.toString();
    const colonIdx = str.indexOf(":");
    const rawVal = colonIdx >= 0 ? str.slice(colonIdx + 1) : str;
    return cleanIdPart(rawVal);
  }

  if (typeof val === "string" && val.includes(":") && validTables) {
    const colonIdx = val.indexOf(":");
    const prefix = val.slice(0, colonIdx);
    if (validTables.has(prefix)) {
      return cleanIdPart(val.slice(colonIdx + 1));
    }
  }

  return val;
}

export function toRecordId(
  value: any,
  validTables: Set<string>,
  fallbackTable?: string | null,
): any {
  if (value instanceof RecordId || value instanceof StringRecordId) return value;

  if (typeof value === "string" && value.length > 0) {
    const clean = cleanIdPart(value);
    const colonIndex = clean.indexOf(":");

    if (colonIndex > 0) {
      const tablePrefix = clean.substring(0, colonIndex);
      const rawId = clean.substring(colonIndex + 1);
      if (validTables.has(tablePrefix)) {
        return new RecordId(tablePrefix, cleanIdPart(rawId));
      }
      return value;
    }

    if (fallbackTable && colonIndex === -1 && validTables.has(fallbackTable)) {
      return new RecordId(fallbackTable, clean);
    }
  }

  return value;
}

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

export const createWhereBuilder = (
  getFieldName: (opts: { model: string; field: string }) => string,
  getFieldAttributes: (opts: { model: string; field: string }) => any,
  getModelName: (model: string) => string,
  validTables: Set<string>,
  schema: BetterAuthDBSchema,
) => {
  return (where: Where[] | undefined | null, modelName: string): BoundQuery | null => {
    if (!where || where.length === 0) return null;

    const dbModelName = getModelName(modelName);

    const buildCondition = (w: Where): BoundQuery => {
      const dbField = getFieldName({ field: w.field, model: modelName });
      const attr = getFieldAttributes({ field: w.field, model: modelName });
      let val = w.value;
      const isInsensitive = (w as any).mode === "insensitive";

      let targetModel = getSpecialReferenceModel(dbModelName, w.field, getModelName, schema);

      if (
        !targetModel &&
        (w.field === "id" ||
          attr?.references?.field === "id" ||
          (attr?.references && !attr.references.field))
      ) {
        const refModel = attr?.references?.model;
        targetModel = refModel ? getModelName(refModel) : dbModelName;
      }

      if (targetModel && val !== null && val !== undefined) {
        if (Array.isArray(val)) {
          val = val.map((v) => toRecordId(v, validTables, targetModel));
        } else {
          val = toRecordId(val, validTables, targetModel);
        }
      }

      const fieldRaw = raw(dbField);
      const op = (w.operator || "eq").toLowerCase();
      const query = surql``;

      switch (op) {
        case "eq":
          if (val === null || val === undefined) {
            query.append(surql`(${fieldRaw} IS NULL OR ${fieldRaw} IS NONE)`);
          } else if (isInsensitive && typeof val === "string") {
            query.append(surql`string::lowercase(${fieldRaw} ?? '') = string::lowercase(${val})`);
          } else {
            query.append(surql`${fieldRaw} = ${val}`);
          }
          break;
        case "ne":
          if (val === null || val === undefined) {
            query.append(surql`(${fieldRaw} IS NOT NULL AND ${fieldRaw} IS NOT NONE)`);
          } else if (isInsensitive && typeof val === "string") {
            query.append(surql`string::lowercase(${fieldRaw} ?? '') != string::lowercase(${val})`);
          } else {
            query.append(surql`${fieldRaw} != ${val}`);
          }
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
          if (isInsensitive && Array.isArray(val)) {
            const lowerVals = val.map((v) => (typeof v === "string" ? v.toLowerCase() : v));
            query.append(surql`string::lowercase(${fieldRaw} ?? '') IN ${lowerVals}`);
          } else {
            query.append(surql`${fieldRaw} IN ${val}`);
          }
          break;
        case "not_in":
          if (isInsensitive && Array.isArray(val)) {
            const lowerVals = val.map((v) => (typeof v === "string" ? v.toLowerCase() : v));
            query.append(surql`string::lowercase(${fieldRaw} ?? '') NOT IN ${lowerVals}`);
          } else {
            query.append(surql`${fieldRaw} NOT IN ${val}`);
          }
          break;
        case "contains":
          if (isInsensitive && typeof val === "string") {
            query.append(
              surql`string::contains(string::lowercase(${fieldRaw} ?? ''), string::lowercase(${val}))`,
            );
          } else {
            query.append(surql`string::contains(${fieldRaw} ?? '', ${val})`);
          }
          break;
        case "starts_with":
          if (isInsensitive && typeof val === "string") {
            query.append(
              surql`string::starts_with(string::lowercase(${fieldRaw} ?? ''), string::lowercase(${val}))`,
            );
          } else {
            query.append(surql`string::starts_with(${fieldRaw} ?? '', ${val})`);
          }
          break;
        case "ends_with":
          if (isInsensitive && typeof val === "string") {
            query.append(
              surql`string::ends_with(string::lowercase(${fieldRaw} ?? ''), string::lowercase(${val}))`,
            );
          } else {
            query.append(surql`string::ends_with(${fieldRaw} ?? '', ${val})`);
          }
          break;
        default:
          throw new Error(`[SurrealDB Adapter]: Unsupported operator "${w.operator}"`);
      }

      return query;
    };

    if (where.length === 1) {
      return buildCondition(where[0]!);
    }

    const andConditions: BoundQuery[] = [];
    const orConditions: BoundQuery[] = [];

    where.forEach((w) => {
      const cond = buildCondition(w);
      if (w.connector === "OR") {
        orConditions.push(cond);
      } else {
        andConditions.push(cond);
      }
    });

    const finalQuery = surql``;

    const joinWithConnector = (queries: BoundQuery[], connector: string): BoundQuery => {
      const res = surql``;
      queries.forEach((q, idx) => {
        if (idx > 0) res.append(surql` ${raw(connector)} `);
        res.append(q);
      });
      return res;
    };

    if (andConditions.length > 0 && orConditions.length > 0) {
      const andPart = joinWithConnector(andConditions, "AND");
      const orPart = joinWithConnector(orConditions, "OR");
      finalQuery.append(surql`(${andPart}) AND (${orPart})`);
    } else if (andConditions.length > 0) {
      finalQuery.append(joinWithConnector(andConditions, "AND"));
    } else if (orConditions.length > 0) {
      finalQuery.append(joinWithConnector(orConditions, "OR"));
    }

    return finalQuery;
  };
};

export function logSurrealQuery(
  config: SurrealDBAdapterConfig | undefined,
  method: string,
  model: string,
  queryObj: BoundQuery,
) {
  if (!config?.debugLogs && !config?.logSurrealQL) return;

  if (
    typeof config.debugLogs === "object" &&
    !(config.debugLogs as Record<string, boolean>)[method]
  ) {
    return;
  }

  console.log(`[SurrealDB Debug] [${method}] [${model}]`, {
    query: queryObj.query,
    bindings: queryObj.bindings,
  });
}

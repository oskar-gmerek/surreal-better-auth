import type { Where } from "better-auth";
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

/** Only schema identity positions may decode native records. */
export function extractIdentityId(value: any, expectedTable: string): any {
  if (value instanceof StringRecordId) {
    throw new Error(
      "StringRecordId identity inputs are unsupported; use an opaque string or RecordId",
    );
  }
  if (value instanceof RecordId) {
    if (value.table.name !== expectedTable || typeof value.id !== "string") {
      throw new Error("Identity RecordId must have the expected table and a string ID component");
    }
    return value.id;
  }
  return value;
}

/** Convert dates without reinterpreting application strings or JSON records. */
export function formatRecordIdOutput(val: any): any {
  if (val instanceof DateTime) return val.toDate();
  if (Array.isArray(val)) return val.map(formatRecordIdOutput);
  if (val && Object.getPrototypeOf(val) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(val).map(([key, value]) => [key, formatRecordIdOutput(value)]),
    );
  }
  return val;
}

export function toRecordId(value: any, validTables: Set<string>, targetTable?: string | null): any {
  if (!targetTable) return value;
  if (!validTables.has(targetTable)) throw new Error("Unknown identity target table");
  const id = extractIdentityId(value, targetTable);
  return typeof id === "string" ? new RecordId(targetTable, id) : id;
}

export function getIdentityTarget(
  model: string,
  field: string,
  getFieldName: GetFieldNameFn,
  getFieldAttributes: (opts: { model: string; field: string }) => any,
  getModelName: (model: string) => string,
): string | null {
  if (field === getFieldName({ model, field: "id" })) return getModelName(model);
  const reference = getFieldAttributes({ model, field })?.references;
  return reference && (!reference.field || reference.field === "id")
    ? getModelName(reference.model)
    : null;
}

export const createWhereBuilder = (
  getFieldName: (opts: { model: string; field: string }) => string,
  getFieldAttributes: (opts: { model: string; field: string }) => any,
  getModelName: (model: string) => string,
  validTables: Set<string>,
) => {
  return (where: Where[] | undefined | null, modelName: string): BoundQuery | null => {
    if (!where || where.length === 0) return null;

    const buildCondition = (w: Where): BoundQuery => {
      const dbField = getFieldName({ field: w.field, model: modelName });
      let val = w.value;
      const isInsensitive = (w as any).mode === "insensitive";
      const targetModel = getIdentityTarget(
        modelName,
        dbField,
        getFieldName,
        getFieldAttributes,
        getModelName,
      );

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

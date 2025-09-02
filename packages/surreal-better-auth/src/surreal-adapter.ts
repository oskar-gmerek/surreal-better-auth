import {
  type RecordId,
  PreparedQuery,
  Uuid,
  Gap,
  type Surreal,
  type Fill,
} from "surrealdb";
import type { Where } from "better-auth/types";
import { createAdapter } from "better-auth/adapters";
import { logger } from "better-auth";
import {
  mapNullToUndefined,
  recordIdsToStrings,
  buildRecordIdMap,
  logQuery,
  getReferencedModel,
  buildSpecialCasesMapping,
  serializeRecordIdFields,
  extractDirectRecords,
  buildQuerySuffix,
  buildWhereClauseParts,
  generateCreateQuery,
} from "./helpers";
import { generateSchema } from "./schema";
import type {
  ExecuteOptimizedQueryOptions,
  SurrealDBAdapterConfig,
} from "./types";

export const surrealdbAdapter = (
  db: Surreal,
  config?: SurrealDBAdapterConfig,
) => {
  return createAdapter({
    config: {
      adapterId: "surrealdb_adapter",
      adapterName: "surreal-better-auth",
      usePlural: config?.usePlural ?? false,
      debugLogs: config?.debugLogs ?? false,
      supportsNumericIds: false,
      supportsBooleans: true,
      supportsDates: true,
      supportsJSON: true,
      customIdGenerator:
        config?.idGenerator && config.idGenerator.startsWith("sdk.")
          ? ({ model }: { model: string }) => {
              if (config?.debugLogs) {
                logger.info(
                  `[surreal-better-auth]: Generating custom ID for model: ${model} using ${config.idGenerator} `,
                );
              }
              switch (config.idGenerator) {
                case "sdk.UUIDv4":
                  return Uuid.v4().toString();
                case "sdk.UUIDv7":
                  return Uuid.v7().toString();
                default:
                  throw new Error(
                    `Invalid ID generator type: ${config.idGenerator}. Supported types: "sdk.UUIDv4", "sdk.UUIDv7", "surreal", "surreal.ULID", "surreal.UUID", "surreal.UUIDv4", "surreal.UUIDv7", "surreal.guid"`,
                  );
              }
            }
          : undefined,
      disableIdGeneration: config?.idGenerator?.startsWith("surreal") ?? false,
      customTransformOutput({ data }) {
        if (data === undefined) return null;
        return recordIdsToStrings(data);
      },
    },
    adapter: ({
      options,
      getModelName,
      getFieldName,
      getDefaultModelName,
      getDefaultFieldName,
      debugLog,
    }) => {
      const recordIdMap = buildRecordIdMap(
        (options as any)?.schema?.tables,
        getModelName,
        getFieldName,
      );

      // Extract generateId from options if provided by Better Auth
      const generateId = (options as any)?.advanced?.database?.generateId;

      // Create helper functions with bound dependencies
      const getReferencedModelFn = (tableName: string, fieldName: string) =>
        getReferencedModel(
          tableName,
          fieldName,
          recordIdMap,
          getDefaultModelName,
          getDefaultFieldName,
          getModelName,
          config,
        );

      const buildSpecialCasesFn = () =>
        buildSpecialCasesMapping(getModelName, getFieldName, config);

      const serializeRecordIdFieldsFn = (
        tableName: string,
        data: Record<string, any>,
      ) =>
        serializeRecordIdFields(
          tableName,
          data,
          getReferencedModelFn,
          buildSpecialCasesFn,
          config,
        );

      const extractDirectRecordsFn = (
        where: Where[] | undefined,
        model: string,
      ) => extractDirectRecords(where, model, getModelName);

      const buildQuerySuffixFn = (options: any = {}) =>
        buildQuerySuffix(options, getFieldName);

      const buildWhereClausePartsFn = (
        bindings: Record<string, Gap<any>>,
        fills: Fill<any>[],
        { where, model }: { where: Where[]; model: string },
      ) =>
        buildWhereClauseParts(
          bindings,
          fills,
          { where, model },
          getModelName,
          getFieldName,
          getReferencedModelFn,
          config,
        );

      const generateCreateQueryFn = (
        tableName: string,
        content: Record<string, any>,
        customId?: string,
        selectFields?: string,
      ) =>
        generateCreateQuery(
          tableName,
          content,
          config,
          customId,
          selectFields,
          generateId,
        );

      async function executeOptimizedQuery(
        options: ExecuteOptimizedQueryOptions,
      ): Promise<any> {
        const {
          method,
          model,
          where,
          baseQuery,
          directRecordQuery,
          content,
          suffix = "",
          processResult = (r: any) => r,
          returnCount = false,
          singleRecord = false,
        } = options;

        // Check for direct record access optimization
        const directRecordInfo = extractDirectRecordsFn(where, model);

        if (directRecordInfo && directRecordQuery) {
          const { recordIds, remainingWhere } = directRecordInfo;
          const directQuery = directRecordQuery(recordIds);

          if (remainingWhere.length === 0) {
            // Pure direct record operation
            const bindings: Record<string, Gap<any>> = {};
            const fills: Fill<any>[] = [];

            if (content !== undefined) {
              bindings.content = new Gap<any>();
              fills.push(bindings.content.fill(content));
            }

            const query = new PreparedQuery(directQuery + suffix, bindings);
            logQuery(config, debugLog, method, query, fills);
            const result = await db.query<[any[]]>(query, fills);

            if (returnCount) {
              return result[0]?.length || 0;
            }

            return processResult(singleRecord ? result[0] : result[0]);
          } else {
            // Direct record operation with additional WHERE conditions
            const bindings: Record<string, Gap<any>> = {};
            const fills: Fill<any>[] = [];

            if (content !== undefined) {
              bindings.content = new Gap<any>();
              fills.push(bindings.content.fill(content));
            }

            const whereStr = buildWhereClausePartsFn(bindings, fills, {
              where: remainingWhere,
              model,
            });
            const queryString = directQuery + whereStr + suffix;

            const query = new PreparedQuery(queryString, bindings);
            logQuery(config, debugLog, method, query, fills);
            const result = await db.query<[any[]]>(query, fills);

            if (returnCount) {
              return result[0]?.length || 0;
            }

            return processResult(singleRecord ? result[0] : result[0]);
          }
        }

        // Fallback to standard WHERE clause query
        const bindings: Record<string, Gap<any>> = {};
        const fills: Fill<any>[] = [];

        if (content !== undefined) {
          bindings.content = new Gap<any>();
          fills.push(bindings.content.fill(content));
        }

        const whereStr = buildWhereClausePartsFn(bindings, fills, {
          where: where || [],
          model,
        });
        const queryString = baseQuery + whereStr + suffix;

        const query = new PreparedQuery(queryString, bindings);
        logQuery(config, debugLog, method, query, fills);
        const result = await db.query<[any[]]>(query, fills);

        if (returnCount) {
          return result[0]?.length || 0;
        }

        return processResult(singleRecord ? result[0] : result[0]);
      }

      return {
        async create({ model, data: values, select }) {
          const tableName = getModelName(model);
          const content = serializeRecordIdFieldsFn(
            tableName,
            mapNullToUndefined(values as Record<string, any>),
          );

          // Extract custom ID if allowed or if using sdk.* generator (Better Auth passes generated ID)
          const customId =
            (config?.allowPassingId ||
              config?.idGenerator?.startsWith("sdk.")) &&
            content.id
              ? content.id
              : undefined;
          // Always remove id field from content
          delete content.id;

          // Process select parameter
          let selectFields: string | undefined;
          if (select && Array.isArray(select) && select.length > 0) {
            const mappedFields = select.map((field) =>
              getFieldName({ model, field }),
            );
            // Always include id in the return fields
            if (!mappedFields.includes("id")) {
              mappedFields.unshift("id");
            }
            selectFields = mappedFields.join(", ");
          }

          // Generate query
          const { query, fills } = generateCreateQueryFn(
            tableName,
            content,
            customId,
            selectFields,
          );

          logQuery(config, debugLog, "create", query, fills);

          const result = await db.query<[any[]]>(query, fills);
          return recordIdsToStrings(result[0][0]);
        },

        async findOne({ model, where, select }) {
          const tableName = getModelName(model);
          const selectFields = select
            ? typeof select === "string"
              ? getFieldName({ model, field: select })
              : (select as string[])
                  .map((f) => getFieldName({ model, field: f }))
                  .join(", ")
            : "*";

          return executeOptimizedQuery({
            method: "findOne",
            model,
            where,
            baseQuery: `SELECT ${selectFields} FROM ONLY ${tableName}`,
            directRecordQuery: (recordIds: RecordId[]) =>
              `SELECT ${selectFields} FROM ONLY ${recordIds[0].toString()}`,
            suffix: buildQuerySuffixFn({ limitOne: true }),
            processResult: (result: any) => recordIdsToStrings(result) || null,
            singleRecord: true,
          });
        },

        async findMany({ model, where, limit, offset, sortBy }) {
          const tableName = getModelName(model);
          const selectClause = "*";

          return executeOptimizedQuery({
            method: "findMany",
            model,
            where,
            baseQuery: `SELECT ${selectClause} FROM ${tableName}`,
            directRecordQuery: (recordIds: RecordId[]) =>
              `SELECT ${selectClause} FROM [${recordIds.map((id: RecordId) => id.toString()).join(", ")}]`,
            suffix: buildQuerySuffixFn({ sortBy, limit, offset, model }),
            processResult: recordIdsToStrings,
          });
        },

        async count({ model, where }) {
          const tableName = getModelName(model);

          return executeOptimizedQuery({
            method: "count",
            model,
            where,
            baseQuery: `SELECT count() FROM ${tableName}`,
            directRecordQuery: (recordIds: RecordId[]) =>
              `SELECT count() FROM [${recordIds.map((r: RecordId) => r.toString()).join(", ")}]`,
            suffix: buildQuerySuffixFn({ groupAll: true }),
            processResult: (result: any) => result[0].count || 0,
            singleRecord: true,
          });
        },

        async update({ model, where, update: values }) {
          const tableName = getModelName(model);
          const content = serializeRecordIdFieldsFn(
            tableName,
            mapNullToUndefined(values as Record<string, any>),
          );

          return executeOptimizedQuery({
            method: "update",
            model,
            where,
            baseQuery: `UPDATE ONLY ${tableName} MERGE $content`,
            directRecordQuery: (recordIds: RecordId[]) =>
              `UPDATE ONLY ${recordIds[0].toString()} MERGE $content`,
            content,
            suffix: buildQuerySuffixFn({ returnAfter: true }),
            processResult: (result: any) => recordIdsToStrings(result) || null,
            singleRecord: true,
          });
        },

        async updateMany({ model, where, update: values }) {
          const tableName = getModelName(model);
          const content = serializeRecordIdFieldsFn(
            tableName,
            mapNullToUndefined(values as Record<string, any>),
          );

          return executeOptimizedQuery({
            method: "updateMany",
            model,
            where,
            baseQuery: `UPDATE ${tableName} MERGE $content`,
            directRecordQuery: (recordIds: RecordId[]) =>
              `UPDATE [${recordIds.map((r: RecordId) => r.toString()).join(", ")}] MERGE $content`,
            content,
            returnCount: true,
          });
        },

        async delete({ model, where }) {
          const tableName = getModelName(model);

          return executeOptimizedQuery({
            method: "delete",
            model,
            where,
            baseQuery: `DELETE ${tableName}`,
            directRecordQuery: (recordIds: RecordId[]) =>
              `DELETE ${recordIds[0].toString()}`,
            processResult: () => undefined,
          });
        },

        async deleteMany({ model, where }) {
          const tableName = getModelName(model);

          return executeOptimizedQuery({
            method: "deleteMany",
            model,
            where,
            baseQuery: `DELETE ${tableName}`,
            directRecordQuery: (recordIds: RecordId[]) =>
              `DELETE [${recordIds.map((r: RecordId) => r.toString()).join(", ")}]`,
            returnCount: true,
          });
        },

        async createSchema({ file, tables }) {
          return generateSchema({
            file,
            tables,
            getModelName,
            getFieldName,
            getReferencedModel: getReferencedModelFn,
          });
        },
      };
    },
  });
};

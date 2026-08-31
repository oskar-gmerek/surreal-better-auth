import type { BetterAuthOptions } from "better-auth";
import {
  createAdapterFactory,
  type AdapterFactoryCustomizeAdapterCreator,
  type AdapterFactoryOptions,
  type DBAdapter,
} from "better-auth/adapters";
import {
  type BoundQuery,
  Features,
  raw,
  RecordId,
  surql,
  Table,
  type Surreal,
  type SurrealTransaction,
  type Values,
} from "surrealdb";
import {
  cleanIdPart,
  createWhereBuilder,
  extractCleanId,
  formatRecordIdOutput,
  getSpecialReferenceModel,
  logSurrealQuery,
  toRecordId,
  unwrapResult,
} from "./utils";
import { generateSchema } from "./schema";
import type { SurrealDBAdapterConfig } from "./types";

/**
 * SurrealDB database adapter for Better-Auth.
 *
 * @param db - An active SurrealDB client instance.
 * @param config - Optional configuration settings for table naming, logging, and ID strategies.
 * @returns A Better-Auth database adapter factory function.
 */
export const surrealdbAdapter = (db: Surreal, config?: SurrealDBAdapterConfig) => {
  let lazyOptions: BetterAuthOptions | null = null;

  const createCustomAdapter =
    (client: Surreal | SurrealTransaction): AdapterFactoryCustomizeAdapterCreator =>
    ({ getFieldName, getFieldAttributes, getModelName, getDefaultModelName, schema }) => {
      const validTables = new Set<string>();
      Object.keys(schema).forEach((modelKey) => {
        validTables.add(getModelName(modelKey));
        validTables.add(modelKey);
      });

      const buildWhere = createWhereBuilder(
        getFieldName,
        getFieldAttributes,
        getModelName,
        validTables,
        schema,
      );

      /**
       * Dynamically ensures unique and composite indexes exist for the given model.
       * Executed exclusively against the root `db` connection to avoid transaction DDL deadlocks.
       */
      const ensureModelIndexes = async (model: string) => {
        if (client !== db) return;

        const defaultModelName = getDefaultModelName(model);
        const table = schema[defaultModelName];
        if (!table || (table as any).disableMigrations) return;

        const actualTableName = getModelName(model);
        const indexes: { name: string; columns: string[]; unique?: boolean }[] = [];

        // 1. Single-field unique constraints
        if (table.fields) {
          for (const [fieldName, fieldDef] of Object.entries<any>(table.fields)) {
            if (fieldDef?.unique) {
              indexes.push({
                name: `${actualTableName}_${fieldName}_unique`,
                columns: [fieldName],
                unique: true,
              });
            }
          }
        }

        // 2. Table-level index definitions from schema
        if (table.indexes) {
          const tableIndexes = Array.isArray(table.indexes)
            ? table.indexes
            : Object.entries<any>(table.indexes).map(([k, v]) => ({
                name: v?.name || k,
                ...v,
              }));

          for (const idxDef of tableIndexes) {
            const cols = idxDef.fields || idxDef.columns || [];
            const indexCols = Array.isArray(cols) ? cols : [cols];
            const idxName = idxDef.name || `${actualTableName}_${indexCols.join("_")}_idx`;
            indexes.push({
              name: idxName,
              columns: indexCols,
              unique: idxDef.unique ?? false,
            });
          }
        }

        // 3. Composite identity indexes for the account model (OAuth & Credential identity keys)
        if (defaultModelName === "account") {
          indexes.push({
            name: `${actualTableName}_provider_id_account_id_unique`,
            columns: ["providerId", "accountId"],
            unique: true,
          });
          if (table.fields?.issuer) {
            indexes.push({
              name: `${actualTableName}_account_id_issuer_unique`,
              columns: ["accountId", "issuer"],
              unique: true,
            });
          }
        }

        await Promise.all(
          indexes.map(async (index) => {
            if (!index.columns || index.columns.length === 0) return;
            const physicalFieldNames = index.columns.map((fieldName) =>
              getFieldName({ field: fieldName, model }),
            );

            const indexName =
              index.name || `${actualTableName}_idx_${Math.random().toString(36).substring(2, 7)}`;
            const cleanIndexName = String(indexName).replace(/[^a-zA-Z0-9_]/g, "_");
            const fieldsRaw = raw(physicalFieldNames.join(", "));
            const tableRaw = raw(actualTableName);
            const indexNameRaw = raw(cleanIndexName);

            let query = surql`DEFINE INDEX ${indexNameRaw} ON ${tableRaw} FIELDS ${fieldsRaw}`;
            if (index.unique) {
              query.append(surql` UNIQUE`);
            }

            try {
              const res = await db.query(query);
              unwrapResult(res);
            } catch {
              // Ignore if index already exists
            }
          }),
        );
      };

      /**
       * Serializes JavaScript payload into SurrealDB-compatible structures,
       * coercing primary keys and relational foreign keys to native `RecordId` instances.
       */
      const transformDataForDB = (model: string, data: Record<string, any>) => {
        const transformed = { ...data };
        const currentDbTable = getModelName(model);

        for (const key in transformed) {
          const value = transformed[key];
          if (value === undefined) continue;

          const attr = getFieldAttributes({ field: key, model });

          let fallbackTable = getSpecialReferenceModel(
            currentDbTable,
            key,
            getModelName,
            schema,
            transformed,
          );

          if (
            !fallbackTable &&
            (key === "id" ||
              attr?.references?.field === "id" ||
              (attr?.references && !attr.references.field))
          ) {
            const refModel = attr?.references?.model;
            fallbackTable = refModel ? getModelName(refModel) : currentDbTable;
          }

          if (value !== null) {
            transformed[key] = toRecordId(value, validTables, fallbackTable);
          }
        }
        return transformed;
      };

      /**
       * Resolves relational joins efficiently in a single batch query per relation
       * instead of sequential N+1 network requests.
       */
      const resolveJoins = async (
        records: Record<string, any>[],
        model: string,
        joinConfig?: Record<string, any>,
      ) => {
        if (!records.length || !joinConfig) return records;

        for (const [joinedModel, joinOptions] of Object.entries(joinConfig)) {
          const localFieldName = getFieldName({
            field: joinOptions.on.from,
            model,
          });
          const foreignFieldName = getFieldName({
            field: joinOptions.on.to,
            model: joinedModel,
          });

          const defaultJoinedModelName = getDefaultModelName(joinedModel);
          const joinedModelSchema = schema[defaultJoinedModelName];
          const foreignFieldAttr = joinedModelSchema?.fields[joinOptions.on.to];
          const isUnique =
            foreignFieldAttr?.unique === true || joinOptions.relation === "one-to-one";

          const actualJoinedTableName = getModelName(joinedModel);
          const actualLocalTableName = getModelName(model);
          const joinedTableIdent = raw(actualJoinedTableName);

          const isForeignKeyAnId =
            foreignFieldName === "id" ||
            foreignFieldAttr?.references?.field === "id" ||
            (foreignFieldAttr?.references && !foreignFieldAttr.references.field);

          let targetRefTable = actualJoinedTableName;
          if (foreignFieldAttr?.references?.model) {
            targetRefTable = getModelName(foreignFieldAttr.references.model);
          } else if (joinOptions.on.from === "id") {
            targetRefTable = actualLocalTableName;
          }

          const valuesToMatch: any[] = [];
          for (const record of records) {
            const localVal = record[localFieldName];
            if (localVal !== undefined && localVal !== null) {
              if (isForeignKeyAnId) {
                valuesToMatch.push(toRecordId(localVal, validTables, targetRefTable));
              } else {
                valuesToMatch.push(localVal);
              }
            }
          }

          if (valuesToMatch.length === 0) {
            for (const record of records) {
              record[joinedModel] = isUnique ? null : [];
            }
            continue;
          }

          const foreignFieldRaw = raw(foreignFieldName);
          const joinQuery = surql`SELECT * FROM ${joinedTableIdent} WHERE ${foreignFieldRaw} IN ${valuesToMatch}`;

          let joinedRes: any[] = [];
          try {
            const rawRes = await client.query(joinQuery);
            joinedRes = unwrapResult<any[]>(rawRes);
          } catch (err: any) {
            if (
              err?.kind === "NotFound" ||
              err?.message?.includes("does not exist") ||
              err?.details?.kind === "Table"
            ) {
              joinedRes = [];
            } else {
              throw err;
            }
          }

          const allFetched = formatRecordIdOutput(Array.isArray(joinedRes) ? joinedRes : []);

          const grouped = new Map<any, any[]>();
          for (const item of allFetched) {
            const keyVal = String(extractCleanId(item[foreignFieldName], validTables));
            if (!grouped.has(keyVal)) {
              grouped.set(keyVal, []);
            }
            grouped.get(keyVal)!.push(item);
          }

          for (const record of records) {
            const localVal = record[localFieldName];
            if (localVal === undefined || localVal === null) {
              record[joinedModel] = isUnique ? null : [];
              continue;
            }

            const cleanLocalKey = String(extractCleanId(localVal, validTables));
            let matches = grouped.get(cleanLocalKey) || [];

            if (joinOptions.limit && !isUnique) {
              matches = matches.slice(0, Number(joinOptions.limit));
            }

            if (isUnique) {
              record[joinedModel] = matches[0] || null;
            } else {
              record[joinedModel] = matches;
            }
          }
        }

        return records;
      };

      return {
        async create({ model, data }) {
          await ensureModelIndexes(model);
          const actualTableName = getModelName(model);
          const idGenerator = config?.idGenerator;
          const providedId = data.id;
          const { id: _, ...restData } = data;

          function buildCreateQuery() {
            if (providedId && providedId !== "__surreal__") {
              const idStr = String(providedId);
              if (idStr.includes(":")) {
                const colonIdx = idStr.indexOf(":");
                const tb = idStr.substring(0, colonIdx);
                const rawId = cleanIdPart(idStr.substring(colonIdx + 1));
                return surql`CREATE ${new RecordId(tb, rawId)}`;
              }
              return surql`CREATE ${new RecordId(actualTableName, cleanIdPart(idStr))}`;
            }

            switch (idGenerator) {
              case "ULID":
                return surql`CREATE type::record(${actualTableName}, rand::ulid())`;
              case "UUIDv4":
                return surql`CREATE type::record(${actualTableName}, rand::uuid::v4())`;
              case "UUIDv7":
                return surql`CREATE type::record(${actualTableName}, rand::uuid())`;
              case "guid":
                return surql`CREATE type::record(${actualTableName}, rand::id())`;
              default:
                return surql`CREATE ${new Table(actualTableName)}`;
            }
          }

          const surrealql = buildCreateQuery();
          surrealql.append(surql` CONTENT ${transformDataForDB(model, restData)}`);

          const rawRes = await client.query(surrealql);
          logSurrealQuery(config, "create", model, surrealql);

          const result = unwrapResult<any[]>(rawRes);
          const item = Array.isArray(result) ? result[0] : result;
          return formatRecordIdOutput(item);
        },

        async findOne({ model, where, select, join }) {
          const actualTableName = getModelName(model);
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(actualTableName);
          let surrealql: BoundQuery;

          if (select && select.length > 0) {
            const selectedFields = new Set<string>(
              select.map((f) => getFieldName({ field: f, model })),
            );
            if (join) {
              for (const joinConfig of Object.values(join)) {
                if (joinConfig && (joinConfig as any).on?.from) {
                  selectedFields.add(
                    getFieldName({
                      field: (joinConfig as any).on.from,
                      model,
                    }),
                  );
                }
              }
            }
            const fields = raw(Array.from(selectedFields).join(", "));
            surrealql = surql`SELECT ${fields} FROM ${tableIdent}`;
          } else {
            surrealql = surql`SELECT * FROM ${tableIdent}`;
          }

          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }

          surrealql.append(surql` LIMIT 1`);

          logSurrealQuery(config, "findOne", model, surrealql);

          let item: any = null;
          try {
            const rawRes = await client.query(surrealql);
            const result = unwrapResult<any[]>(rawRes);
            item = (Array.isArray(result) ? result[0] : result) || null;
          } catch (err: any) {
            if (
              err?.kind === "NotFound" ||
              err?.message?.includes("does not exist") ||
              err?.details?.kind === "Table"
            ) {
              return null;
            }
            throw err;
          }

          if (!item) return null;
          item = formatRecordIdOutput(item);

          if (join) {
            const withJoins = await resolveJoins([item], model, join);
            return withJoins[0] || null;
          }

          return item;
        },

        async findMany({ model, where, limit, offset, sortBy, select, join }) {
          const actualTableName = getModelName(model);
          const tableIdent = raw(actualTableName);
          let surrealql: BoundQuery;

          if (select && select.length > 0) {
            const selectedFields = new Set<string>(
              select.map((f) => getFieldName({ field: f, model })),
            );
            if (join) {
              for (const joinConfig of Object.values(join)) {
                if (joinConfig && (joinConfig as any).on?.from) {
                  selectedFields.add(
                    getFieldName({
                      field: (joinConfig as any).on.from,
                      model,
                    }),
                  );
                }
              }
            }
            const fields = raw(Array.from(selectedFields).join(", "));
            surrealql = surql`SELECT ${fields} FROM ${tableIdent}`;
          } else {
            surrealql = surql`SELECT * FROM ${tableIdent}`;
          }

          const whereExpr = buildWhere(where, model);
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }

          if (sortBy) {
            const dbField = raw(getFieldName({ field: sortBy.field, model }));
            const direction = raw(sortBy.direction === "desc" ? "DESC" : "ASC");
            surrealql.append(surql` ORDER BY ${dbField} ${direction}`);
          }

          if (limit !== undefined && limit !== null) {
            surrealql.append(surql` LIMIT ${raw(String(Number(limit)))}`);
          }

          if (offset !== undefined && offset !== null) {
            surrealql.append(surql` START ${raw(String(Number(offset)))}`);
          }

          logSurrealQuery(config, "findMany", model, surrealql);

          let list: any[] = [];
          try {
            const rawRes = await client.query(surrealql);
            const result = unwrapResult<any[]>(rawRes);
            list = formatRecordIdOutput(Array.isArray(result) ? result : []);
          } catch (err: any) {
            if (
              err?.kind === "NotFound" ||
              err?.message?.includes("does not exist") ||
              err?.details?.kind === "Table"
            ) {
              return [];
            }
            throw err;
          }

          if (join && list.length > 0) {
            list = await resolveJoins(list, model, join);
          }

          return list;
        },

        async update({ model, where, update: values }) {
          await ensureModelIndexes(model);
          const actualTableName = getModelName(model);
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(actualTableName);
          const transformedUpdate = transformDataForDB(model, values as any);

          let surrealql = surql`UPDATE ${tableIdent} MERGE ${transformedUpdate}`;
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }
          surrealql.append(surql` RETURN AFTER`);

          logSurrealQuery(config, "update", model, surrealql);

          const rawRes = await client.query(surrealql);
          const result = unwrapResult<any[]>(rawRes);
          const item = (Array.isArray(result) ? result[0] : result) || null;
          return formatRecordIdOutput(item);
        },

        async updateMany({ model, where, update: values }) {
          await ensureModelIndexes(model);
          const actualTableName = getModelName(model);
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(actualTableName);
          const transformedUpdate = transformDataForDB(model, values as any);

          let surrealql = surql`UPDATE ${tableIdent} MERGE ${transformedUpdate as Values<unknown>}`;
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }

          logSurrealQuery(config, "updateMany", model, surrealql);

          const rawRes = await client.query(surrealql);
          const result = unwrapResult<any[]>(rawRes);
          return Array.isArray(result) ? result.length : 0;
        },

        async count({ model, where }) {
          const actualTableName = getModelName(model);
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(actualTableName);

          let surrealql = surql`SELECT count() FROM ${tableIdent}`;
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }
          surrealql.append(surql` GROUP ALL`);

          logSurrealQuery(config, "count", model, surrealql);

          try {
            const rawRes = await client.query(surrealql);
            const result = unwrapResult<any[]>(rawRes);
            const first = Array.isArray(result) ? result[0] : result;
            return first?.count ?? 0;
          } catch (err: any) {
            if (
              err?.kind === "NotFound" ||
              err?.message?.includes("does not exist") ||
              err?.details?.kind === "Table"
            ) {
              return 0;
            }
            throw err;
          }
        },

        async delete({ model, where }) {
          const actualTableName = getModelName(model);
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(actualTableName);
          let surrealql = surql`DELETE ${tableIdent}`;
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }

          logSurrealQuery(config, "delete", model, surrealql);
          try {
            const rawRes = await client.query(surrealql);
            unwrapResult(rawRes);
          } catch (err: any) {
            if (
              err?.kind === "NotFound" ||
              err?.message?.includes("does not exist") ||
              err?.details?.kind === "Table"
            ) {
              return;
            }
            throw err;
          }
        },

        async deleteMany({ model, where }) {
          const actualTableName = getModelName(model);
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(actualTableName);
          let surrealql = surql`DELETE ${tableIdent}`;
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }
          surrealql.append(surql` RETURN BEFORE`);

          logSurrealQuery(config, "deleteMany", model, surrealql);

          try {
            const rawRes = await client.query(surrealql);
            const result = unwrapResult<any[]>(rawRes);
            return Array.isArray(result) ? result.length : 0;
          } catch (err: any) {
            if (
              err?.kind === "NotFound" ||
              err?.message?.includes("does not exist") ||
              err?.details?.kind === "Table"
            ) {
              return 0;
            }
            throw err;
          }
        },

        async consumeOne({ model, where }) {
          const actualTableName = getModelName(model);
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(actualTableName);
          let surrealql = surql`DELETE ${tableIdent}`;
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }
          surrealql.append(surql` RETURN BEFORE`);

          logSurrealQuery(config, "consumeOne", model, surrealql);

          try {
            const rawRes = await client.query(surrealql);
            const result = unwrapResult<any[]>(rawRes);
            const item = (Array.isArray(result) ? result[0] : result) || null;
            return formatRecordIdOutput(item);
          } catch (err: any) {
            if (
              err?.kind === "NotFound" ||
              err?.message?.includes("does not exist") ||
              err?.details?.kind === "Table"
            ) {
              return null;
            }
            throw err;
          }
        },

        async incrementOne({ model, where, increment, set }) {
          await ensureModelIndexes(model);
          const actualTableName = getModelName(model);
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(actualTableName);
          const hasInc = Object.keys(increment).length > 0;
          const hasSet = set && Object.keys(set).length > 0;

          if (!hasInc && !hasSet) {
            return this.findOne({ model, where });
          }

          const setClauses: BoundQuery[] = [];

          for (const [field, incVal] of Object.entries(increment)) {
            const dbField = raw(getFieldName({ field, model }));
            setClauses.push(surql`${dbField} += ${incVal}`);
          }

          if (hasSet) {
            const transformedSet = transformDataForDB(model, set as any);
            for (const [field, val] of Object.entries(transformedSet)) {
              const dbField = raw(getFieldName({ field, model }));
              setClauses.push(surql`${dbField} = ${val}`);
            }
          }

          let surrealql = surql`UPDATE ${tableIdent} SET `;
          setClauses.forEach((clause, idx) => {
            if (idx > 0) surrealql.append(surql`, `);
            surrealql.append(clause);
          });

          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }
          surrealql.append(surql` RETURN AFTER`);

          logSurrealQuery(config, "incrementOne", model, surrealql);

          const rawRes = await client.query(surrealql);
          const result = unwrapResult<any[]>(rawRes);
          const item = (Array.isArray(result) ? result[0] : result) || null;
          return formatRecordIdOutput(item);
        },

        async createSchema({ file, tables }) {
          return generateSchema({
            file,
            tables,
            getModelName,
            getFieldName,
            getReferencedModel: (tableName, fieldName) => {
              const defaultModel = getDefaultModelName(tableName);
              const defaultField = getFieldName({ model: defaultModel, field: fieldName });
              const defaultModelDef = schema[defaultModel];
              const fieldDef = defaultModelDef?.fields?.[defaultField];
              if (fieldDef?.references?.model) {
                return getModelName(fieldDef.references.model);
              }
              return null;
            },
            schemaMode: config?.schemaMode ?? "schemafull",
            usePlural: config?.usePlural ?? false,
          });
        },
      };
    };

  let lazyAdapter: ((options: BetterAuthOptions) => DBAdapter<BetterAuthOptions>) | null = null;
  let adapterOptions: AdapterFactoryOptions | null = null;

  const supportsTxn = db.isFeatureSupported(Features.Transactions);

  adapterOptions = {
    config: {
      adapterId: "surrealdb",
      adapterName: "SurrealDB",
      usePlural: config?.usePlural ?? false,
      debugLogs: config?.debugLogs ?? false,
      supportsArrays: true,
      supportsNumericIds: false,
      supportsJSON: true,
      customIdGenerator: config?.idGenerator ? () => "__surreal__" : undefined,

      customTransformOutput({ data }) {
        return formatRecordIdOutput(data);
      },

      transaction: supportsTxn
        ? async (cb) => {
            const txn = await db.beginTransaction();
            try {
              const transactionalAdapter = createAdapterFactory({
                config: {
                  ...adapterOptions!.config,
                  transaction: false,
                },
                adapter: createCustomAdapter(txn),
              })(lazyOptions!);

              const result = await cb(transactionalAdapter);
              await txn.commit();
              return result;
            } catch (err) {
              await txn.cancel();
              throw err;
            }
          }
        : false,
    },
    adapter: createCustomAdapter(db),
  };

  lazyAdapter = createAdapterFactory(adapterOptions);

  return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
    lazyOptions = options;
    return lazyAdapter(options);
  };
};

import {
  createAdapterFactory,
  type AdapterFactoryCustomizeAdapterCreator,
  type AdapterFactoryOptions,
  type DBAdapter,
} from "better-auth/adapters";
import {
  BoundQuery,
  DateTime,
  escapeIdent,
  Features,
  raw,
  RecordId,
  StringRecordId,
  surql,
  Table,
  type Surreal,
  type SurrealTransaction,
  type Values,
} from "surrealdb";
import {
  buildFetchLinks,
  buildRecordIdMap,
  createWhereBuilder,
  getReferencedModel,
  getSpecialReferenceModel,
  logSurrealQuery,
  mapFetchedRelations,
  mapNullToUndefined,
  toRecordId,
} from "./utils";
import type { SurrealDBAdapterConfig } from "./types";
import { generateSchema } from "./schema";
import type { BetterAuthOptions } from "better-auth";

/**
 * Better-Auth adapter for SurrealDB.
 * Supports native RecordId, transactions, and fetch-based joins.
 *
 * @param db - An instance of SurrealDB client.
 * @param config - Configuration settings for the adapter.
 */
export const surrealdbAdapter = (db: Surreal, config?: SurrealDBAdapterConfig) => {
  let authOptions: BetterAuthOptions;

  const createCustomAdapter =
    (client: Surreal | SurrealTransaction): AdapterFactoryCustomizeAdapterCreator =>
    ({
      getFieldName,
      getFieldAttributes,
      getModelName,
      getDefaultFieldName,
      getDefaultModelName,
      options,
      schema,
    }) => {
      authOptions = options;

      const validTables = new Set<string>();
      Object.keys(schema).forEach((modelKey) => {
        validTables.add(getModelName(modelKey));
      });

      const buildWhere = createWhereBuilder(
        getFieldName,
        getFieldAttributes,
        getModelName,
        validTables,
        schema,
      );

      /**
       * Transforms data for SurrealDB by converting appropriate strings to RecordIds
       * and mapping nulls to undefined for correct MERGE behavior.
       */
      const transformDataForDB = (model: string, data: Record<string, any>) => {
        const transformed = { ...data };
        const currentDbTable = getModelName(model);

        for (const key in transformed) {
          const value = transformed[key];
          if (value === undefined || value === null) continue;

          const attr = getFieldAttributes({ field: key, model });

          let fallbackTable = getSpecialReferenceModel(
            currentDbTable,
            key,
            getModelName,
            schema,
            transformed,
          );

          if (!fallbackTable && (key === "id" || attr?.references)) {
            const refModel = attr?.references?.model;
            fallbackTable = refModel ? getModelName(refModel) : currentDbTable;
          }

          transformed[key] = toRecordId(value, validTables, fallbackTable);
        }
        return mapNullToUndefined(transformed);
      };

      const recordIdMap = buildRecordIdMap(schema, getModelName, getFieldName);

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

      return {
        async create({ model, data }) {
          const idGenerator = config?.idGenerator;
          const providedId = data.id;
          const { id: _, ...restData } = data;
          console.log({ dataID: data.id });
          function buildCreateQuery() {
            if (
              providedId &&
              providedId !== "__surreal__" &&
              options.advanced?.database?.generateId
            ) {
              return surql`CREATE type::record(${model}, ${String(providedId)})`;
            }

            switch (idGenerator) {
              case "ULID":
                return surql`CREATE type::record(${model}, rand::ulid())`;
              case "UUIDv4":
                return surql`CREATE type::record(${model}, rand::uuid::v4())`;
              case "UUIDv7":
                return surql`CREATE type::record(${model}, rand::uuid())`;
              case "guid":
                return surql`CREATE type::record(${model}, rand::id())`;
              default:
                return surql`CREATE ${new Table(model)}`;
            }
          }

          const surrealql = buildCreateQuery();
          surrealql.append(surql` CONTENT ${transformDataForDB(model, restData)}`);

          const [result] = await client.query<[any[]]>(surrealql);
          logSurrealQuery(config, "create", model, surrealql);

          return result[0] as any;
        },

        async findOne({ model, where, select, join }) {
          const whereExpr = buildWhere(where, model);
          if (!whereExpr) return null;

          const tableIdent = raw(escapeIdent(model));
          let surrealql: BoundQuery;

          if (select && select.length > 0) {
            const fields = raw(
              select.map((f) => escapeIdent(getFieldName({ field: f, model }))).join(", "),
            );
            surrealql = surql`SELECT ${fields} FROM ${tableIdent} WHERE `;
          } else {
            surrealql = surql`SELECT * FROM ${tableIdent} WHERE `;
          }

          surrealql.append(whereExpr).append(surql` LIMIT 1`);

          const fetchLinks = buildFetchLinks(join, getFieldName, model);
          if (fetchLinks && fetchLinks.length > 0) {
            surrealql.append(surql` FETCH ${raw(fetchLinks.join(", "))}`);
          }

          logSurrealQuery(config, "findOne", model, surrealql);

          const [result] = await client.query<[any[]]>(surrealql);
          return mapFetchedRelations(result?.[0], join, model, getFieldName) || null;
        },

        async findMany({ model, where, limit, offset, sortBy, join }) {
          const tableIdent = raw(escapeIdent(model));
          let surrealql = surql`SELECT * FROM ${tableIdent}`;

          const whereExpr = buildWhere(where, model);
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }

          if (sortBy) {
            const dbField = raw(escapeIdent(getFieldName({ field: sortBy.field, model })));
            const direction = raw(sortBy.direction === "desc" ? "DESC" : "ASC");
            surrealql.append(surql` ORDER BY ${dbField} ${direction}`);
          }

          if (limit) {
            surrealql.append(surql` LIMIT ${limit}`);
          }

          if (offset) {
            surrealql.append(surql` START ${offset}`);
          }

          const fetchLinks = buildFetchLinks(join, getFieldName, model);
          if (fetchLinks && fetchLinks.length > 0) {
            surrealql.append(surql` FETCH ${raw(fetchLinks.join(", "))}`);
          }

          logSurrealQuery(config, "findMany", model, surrealql);

          const [result] = await client.query<[any[]]>(surrealql);
          return mapFetchedRelations(result || [], join, model, getFieldName);
        },

        async update({ model, where, update }) {
          const whereExpr = buildWhere(where, model);
          if (!whereExpr) return null;

          const tableIdent = raw(escapeIdent(model));
          const transformedUpdate = transformDataForDB(model, update as any);

          const surrealql = surql`UPDATE ${tableIdent} MERGE ${transformedUpdate} WHERE `;
          surrealql.append(whereExpr);

          logSurrealQuery(config, "update", model, surrealql);

          const [result] = await client.query<[any[]]>(surrealql);
          return result?.[0] || null;
        },

        async updateMany({ model, where, update }) {
          const whereExpr = buildWhere(where, model);
          if (!whereExpr) return 0;

          const tableIdent = raw(escapeIdent(model));
          const data = mapNullToUndefined(update);

          const surrealql = surql`UPDATE ${tableIdent} MERGE ${data as Values<unknown>} WHERE `;
          surrealql.append(whereExpr);

          logSurrealQuery(config, "updateMany", model, surrealql);

          const [result] = await client.query<[any[]]>(surrealql);
          return result ? result.length : 0;
        },

        async count({ model, where }) {
          const whereExpr = buildWhere(where, model);
          const tableIdent = raw(escapeIdent(model));

          const surrealql = surql`SELECT count() FROM ${tableIdent}`;
          if (whereExpr) {
            surrealql.append(surql` WHERE `).append(whereExpr);
          }
          surrealql.append(surql` GROUP ALL`);

          logSurrealQuery(config, "count", model, surrealql);

          const [result] = await client.query<[any[]]>(surrealql);
          return result?.[0]?.count || 0;
        },

        async delete({ model, where }) {
          const whereExpr = buildWhere(where, model);
          if (!whereExpr) return;

          const tableIdent = raw(escapeIdent(model));
          const surrealql = surql`DELETE FROM ${tableIdent} WHERE `;
          surrealql.append(whereExpr);

          logSurrealQuery(config, "delete", model, surrealql);
          await client.query(surrealql);
        },

        async deleteMany({ model, where }) {
          const whereExpr = buildWhere(where, model);
          if (!whereExpr) return 0;

          const tableIdent = raw(escapeIdent(model));
          const surrealql = surql`DELETE FROM ${tableIdent} WHERE `;
          surrealql.append(whereExpr);
          surrealql.append(surql` RETURN BEFORE`);

          logSurrealQuery(config, "deleteMany", model, surrealql);

          const [result] = await client.query<[any[]]>(surrealql);
          return result ? result.length : 0;
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
    };

  return (options: any): DBAdapter => {
    // Determine transaction support dynamically
    const supportsTxn = db.isFeatureSupported(Features.Transactions);

    const adapterOptions: AdapterFactoryOptions = {
      config: {
        adapterId: "surrealdb",
        adapterName: "SurrealDB",
        usePlural: config?.usePlural ?? false,
        debugLogs: config?.debugLogs ?? false,
        supportsJSON: true,
        supportsArrays: true,
        supportsUUIDs: true,
        // @ts-expect-error
        supportsJoin: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsNumericIds: true,
        customIdGenerator: config?.idGenerator ? () => "__surreal__" : undefined,

        /**
         * Transforms SurrealDB specific types back to standard JavaScript types.
         */
        customTransformOutput: ({ data }) => {
          if (data instanceof RecordId || data instanceof StringRecordId) {
            return data.toString();
          }
          if (data instanceof DateTime) {
            return data.toDate();
          }
          return data;
        },

        /**
         * Handles database transactions by creating a dedicated transactional adapter.
         */
        transaction: supportsTxn
          ? async (cb) => {
              if (config?.debugLogs) console.log("--- [TXN] Starting transaction... ---");
              const txn = await db.beginTransaction();
              try {
                const transactionalAdapter = createAdapterFactory({
                  config: adapterOptions.config,
                  adapter: createCustomAdapter(txn),
                })(authOptions);

                const result = await cb(transactionalAdapter);
                if (config?.debugLogs) console.log("--- [TXN] Committing transaction... ---");
                await txn.commit();
                return result;
              } catch (err) {
                if (config?.debugLogs) console.log("--- [TXN] Rolling back transaction... ---");
                await txn.cancel();
                throw err;
              }
            }
          : false,
      },
      adapter: createCustomAdapter(db),
    };

    return createAdapterFactory(adapterOptions)(options);
  };
};

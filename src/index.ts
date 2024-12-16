import type { Adapter, BetterAuthOptions, Where } from "better-auth/types";
import { PreparedQuery, type Surreal } from "surrealdb";

function composeWhereClause(where: Where[], model: string): string {
  if (!where.length) return "";

  return where
    .map(({ field, value, operator = "eq", connector = "AND" }, index) => {
      const val =
        typeof value === "string" ? `'${value.replace(/'/g, "\\'")}'` : value;
      const mod = `'${model.replace(/'/g, "\\'")}'`;

      const condition = {
        eq: () =>
          field === "id"
            ? `${field} = type::thing(${mod}, ${val})`
            : `${field} = ${val}`,
        in: () =>
          field === "id"
            ? `${field} IN [${
                Array.isArray(val)
                  ? val.map((v) => `type::thing('${model}', ${v})`).join(", ")
                  : `type::thing('${model}', ${val})`
              }]`
            : `${field} IN [${
                Array.isArray(value) ? value.map((v) => `${v}`).join(", ") : val
              }]`,
        gt: () => `${field} > ${val}`,
        gte: () => `${field} >= ${val}`,
        lt: () => `${field} < ${val}`,
        lte: () => `${field} <= ${val}`,
        ne: () => `${field} != ${val}`,
        contains: () => `${field} CONTAINS ${val}`,
        starts_with: () => `string::starts_with(${field}, ${val})`,
        ends_with: () => `string::ends_with(${field}, ${val})`,
      }[operator.toLowerCase() as typeof operator]();

      return index > 0 ? `${connector} ${condition}` : condition;
    })
    .join(" ");
}

function checkForIdInWhereClause(
  where: Where[],
): string | number | boolean | string[] | number[] | undefined {
  if (where.some(({ field }) => field === "id")) {
    return where.find(({ field }) => field === "id")?.value;
  }
}

export const surrealAdapter = (db: Surreal) => (options: BetterAuthOptions) => {
  if (!db) {
    throw new Error("SurrealDB adapter requires a SurrealDB client");
  }
  return {
    id: "surrealdb",
    async create(data) {
      const { model, data: val } = data;

      const query = new PreparedQuery(
        `CREATE type::table($model) CONTENT $val `,
        {
          model: model,
          val: val,
        },
      );

      const response = await db.query<[any[]]>(query);
      const result = response[0][0];
      return result;
    },
    async findOne(data) {
      const { model, where, select = [] } = data;

      const wheres = composeWhereClause(where, model);

      const query =
        select.length > 0
          ? new PreparedQuery(
              `SELECT type::fields($selects) FROM IF $thing {type::thing($model, $thing)} ELSE {type::table($model)} WHERE $wheres;`,
              {
                id: select.includes("id")
                  ? 'meta::id("id") as id, '
                  : undefined,
                thing: checkForIdInWhereClause(where) || undefined,
                selects: select,
                model: model,
                wheres: wheres,
              },
            )
          : new PreparedQuery(
              `SELECT * FROM IF $thing {type::thing($model, $thing)} ELSE {type::table($model)} WHERE $wheres;`,
              {
                id: select.includes("id")
                  ? 'meta::id("id") as id, '
                  : undefined,
                thing: checkForIdInWhereClause(where) || undefined,
                model: model,
                wheres: wheres,
              },
            );

      const response = await db.query<[any[]]>(query);
      const result = response[0][0];

      if (!result) {
        return null;
      }

      return result;
    },
    async findMany(data) {
      const { model, where, limit, offset, sortBy } = data;
      const clauses: string[] = [];

      if (where) {
        const wheres = composeWhereClause(where, model);
        clauses.push(`WHERE ${wheres}`);
      }
      if (sortBy !== undefined) {
        clauses.push(`ORDER BY ${sortBy.field} ${sortBy.direction}`);
      }
      if (limit !== undefined) {
        clauses.push(`LIMIT type::number('${limit}')`);
      }
      if (offset !== undefined) {
        clauses.push(`START type::number('${offset}')`);
      }

      const query = new PreparedQuery(
        `SELECT * FROM type::table($model) ${
          clauses.length > 0 ? clauses.join(" ") : ""
        }`,
        {
          model: model,
        },
      );

      const response = await db.query<[any[]]>(query);
      const result = response[0];

      return result;
    },
    async update(data) {
      const { model, where, update } = data;
      const wheres = composeWhereClause(where, model);
      if (!wheres)
        throw new Error("Empty conditions - possible unintended operation");

      if (update.id) {
        update.id = undefined;
      }

      const query = new PreparedQuery(
        "UPDATE type::table($model) MERGE { $update } WHERE $wheres",
        {
          model: model,
          update: update,
          wheres: wheres,
        },
      );

      const response = await db.query<[any[]]>(query);
      const result = response[0][0];

      return result;
    },
    async updateMany(data) {
      const { model, where, update } = data;
      const wheres = composeWhereClause(where, model);
      if (!wheres)
        throw new Error("Empty conditions - possible unintended operation");

      if (update.id) {
        update.id = undefined;
      }

      const query = new PreparedQuery(
        "UPDATE type::table($model) MERGE { $update } WHERE $wheres",
        {
          model: model,
          update: update,
          wheres: wheres,
        },
      );

      const response = await db.query<[any[]]>(query);
      const result = response[0];

      return result.length;
    },
    async delete(data) {
      const { model, where } = data;
      const wheres = composeWhereClause(where, model);
      if (!wheres)
        throw new Error("Empty conditions - possible unintended operation");

      const query = new PreparedQuery(
        `DELETE type::table($model) WHERE ${wheres}`,
        {
          model: model,
          wheres: wheres,
        },
      );

      await db.query(query);
    },
    async deleteMany(data) {
      const { model, where } = data;
      const wheres = composeWhereClause(where, model);
      if (!wheres)
        throw new Error("Empty conditions - possible unintended operation");

      const query = new PreparedQuery(
        `DELETE type::table($model) WHERE ${wheres}`,
        {
          model: model,
          wheres: wheres,
        },
      );

      const response = await db.query<[any[]]>(query);
      const result = response[0];

      return result.length;
    },
  } satisfies Adapter;
};

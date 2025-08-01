import { getAuthTables } from 'better-auth/db';
import { createAdapter } from "better-auth/adapters";
import type { CreateCustomAdapter } from "better-auth/adapters";
import type { BetterAuthOptions, Where } from 'better-auth/types';
import { jsonify, RecordId, Surreal } from 'surrealdb';

const createTransform = (options: BetterAuthOptions) => {
    const schema = getAuthTables(options);

    function getField(model: string, field: string) {
        if (field === "id") {
            return field;
        }
        const f = schema[model].fields[field];
        return f.fieldName || field;
    }

    return {
        convertWhereClause(where: Where[], model: string) {
            return where.map(clause => {
                const { field: field, value, operator } = clause;
                switch (operator) {
                    case "eq":
                        return (field === 'id' || value instanceof RecordId)
                            ? `${field} = ${jsonify(value)}`
                            : `${field} = '${jsonify(value)}'`
                    case "in":
                        return `${field} IN [${jsonify(value)}]`;
                    case "contains":
                        return `${field} CONTAINS '${jsonify(value)}'`;
                    case "starts_with":
                        return `string::starts_with(${field},'${value}')`;
                    case "ends_with":
                        return `string::ends_with(${field},'${value}')`;
                    default:
                        return (field === 'id' || value instanceof RecordId)
                            ? `${field} = ${jsonify(value)}`
                            : `${field} = '${jsonify(value)}'`
                }
            }).join(' AND ');
        },
        getField,
    };
};

export const surrealAdapter = (db: Surreal) => {
    if (!db) {
        throw new Error("SurrealDB adapter requires a SurrealDB client");
    }

    return createAdapter({
        config: {
            adapterId: "surreal",
            supportsBooleans: true,
            supportsJSON: true,
            supportsDates: true,
            supportsNumericIds: true,
        },
        adapter: ({ options }) => {
            const { convertWhereClause, getField } = createTransform(options);

            return {
                create: async ({ model, data }) => {
                    const [result] = await db.create<any>(model, data);
                    return result;
                },
                findOne: async ({ model, where, select = [] }) => {
                    const whereClause = convertWhereClause(where, model);
                    const selectClause = select.length > 0 && select.map((f) => getField(model, f)) || []
                    const query = select.length > 0
                        ? `SELECT ${selectClause.join(', ')} FROM ${model} WHERE ${whereClause} LIMIT 1`
                        : `SELECT * FROM ${model} WHERE ${whereClause} LIMIT 1`;
                    const [result] = await db.query<[any[]]>(query)
                    return result[0];
                },
                findMany: async ({ model, where, sortBy, limit, offset }) => {
                    let query = `SELECT * FROM ${model}`;
                    if (where) {
                        const whereClause = convertWhereClause(where, model);
                        query += ` WHERE ${whereClause}`;
                    }
                    if (sortBy) {
                        query += ` ORDER BY ${getField(model, sortBy.field)} ${sortBy.direction}`;
                    }
                    if (limit !== undefined) {
                        query += ` LIMIT ${limit}`;
                    }
                    if (offset !== undefined) {
                        query += ` START ${offset}`;
                    }
                    const [results] = await db.query<[any[]]>(query);
                    return results;
                },
                count: async ({ model, where }) => {
                    const whereClause = where ? convertWhereClause(where, model) : '';
                    const query = `SELECT count(${whereClause}) FROM ${model} GROUP ALL`;
                    const [result] = await db.query<[any[]]>(query);
                    const res = result[0];
                    return res.count;
                },
                update: async ({ model, where, update }) => {
					const whereClause = convertWhereClause(where, model);
					const [result] = await db.query<[any[]]>(
						`UPDATE ${model} MERGE $update WHERE ${whereClause}`,
						{
							update,
						},
					);
					return result[0];
				},
                delete: async ({ model, where }) => {
                    const whereClause = convertWhereClause(where, model);
                    await db.query(`DELETE FROM ${model} WHERE ${whereClause}`);
                },
                deleteMany: async ({ model, where }) => {
                    const whereClause = convertWhereClause(where, model);
                    const [result] = await db.query<[any[]]>(`DELETE FROM ${model} WHERE ${whereClause}`);
                    return result.length;
                },
                updateMany: async ({ model, where, update }) => {
                    const whereClause = convertWhereClause(where, model);
                    const [result] = await db.query<[any[]]>(`UPDATE ${model} MERGE ${JSON.stringify(update)} WHERE ${whereClause}`);
                    return result[0];
                },
            } satisfies ReturnType<CreateCustomAdapter>
        },
    })
};

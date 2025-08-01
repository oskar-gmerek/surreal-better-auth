import type { FieldType} from 'better-auth/db';
import { getAuthTables } from 'better-auth/db';
import { createAdapter } from "better-auth/adapters";
import type { CreateCustomAdapter } from "better-auth/adapters";
import type { BetterAuthOptions, Where } from 'better-auth/types';
import type { Surreal } from 'surrealdb';
import { jsonify, RecordId, StringRecordId } from 'surrealdb';
import { operatorMap, typeMap } from './utils';

export interface SurrealBetterAuthConfig {
    /**
     * Enable fields with record type. Otherwise, field type is string.
     *
     * Utilizing this may require you to convert string fields
     * to record types beforehand as `generate` does not perform
     * this conversion for you.
     *
     * @default false
     */
    enableRecords?: boolean
    /**
     * Settings pertaining to schema creation and likewise
     * the better-auth cli `generate` function
     */
	generate?: {
		/**
		 * Add the overwrite clause on all statements
		 */
		overwrite?: boolean
		/**
		 * Disables "ON DELETE" record references functionality
		 * such as when surreal<=v2. Only valid when
         * enableRecords is true.
		 *
		 * @default false
		 */
		disableOnDeleteReference?: boolean
		/**
		 * Rounds default times using time::
		 * 
		 * @default 's' - seconds
		 */
		roundDefaultTime?: 's' | 'ms' | false
	}
}

const createTransform = (options: BetterAuthOptions, config?: SurrealBetterAuthConfig) => {
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
            return where.map((clause, index) => {
                const { field: field, value, operator, connector } = clause;
                const isRecordField =
                    field === 'id'
                    || value instanceof RecordId
                    || (field.endsWith('Id') && config?.enableRecords)
                let str!: string
                switch (operator) {
                    case "in":
                        str = `${field} IN [${jsonify(value)}]`;
                        break;
                    case "starts_with":
                        str = `string::starts_with(${field},'${value}')`;
                        break;
                    case "ends_with":
                        str = `string::ends_with(${field},'${value}')`;
                        break;
                    default:
                        str = isRecordField
                            ? `${field} ${operatorMap[operator ?? "eq"]} ${jsonify(value)}`
                            : `${field} ${operatorMap[operator ?? "eq"]} '${jsonify(value)}'`
                        break;
                }
                if (index < where.length - 1) {
                    str += ` ${connector ?? 'AND'} `
                }
                return str
            }).join('');
        },
        getField,
    };
};

export const surrealAdapter = (db: Surreal, config?: SurrealBetterAuthConfig) => {
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
            disableIdGeneration: true,
            customTransformInput: ({ field, data }) => {
                // Attempt to transform a string to a RecordId
                if (
                    config?.enableRecords
                    && (field === 'id' || field.endsWith('Id'))
                    && typeof data === 'string'
                ) {
                    data = new StringRecordId(data)
                }
                return data
            },
            customTransformOutput: ({ field, data }) => {
                // Convert RecordId to String
                if (data instanceof RecordId) {
                    data = data.toString()
                }
                return data
            }
        },
        adapter: ({ options }) => {
            const { convertWhereClause, getField } = createTransform(options, config);

            return {
                create: async ({ model, data }) => {
                    const [result] = await db.create<any>(model, data);
                    return result;
                },
                findOne: async ({ model, where, select = [] }) => {
                    const idWhereIndex = where.findIndex((val) => val.field === "id")
                    const selectClause = select.length > 0 && select.map((f) => getField(model, f)) || []

                    // Search by id
                    if (idWhereIndex >= 0) {
                        const [id] = where.splice(idWhereIndex, 1)
                        const whereClause = convertWhereClause(where, model);
                        const query = select.length > 0
                            ? `SELECT ${selectClause.join(', ')} FROM ONLY ${id.value} ${whereClause.length ? `WHERE ${whereClause}` : ''}`
                            : `SELECT * FROM ONLY ${id.value} ${whereClause.length ? `WHERE ${whereClause}` : ''}`;
                        const [result] = await db.query<[any]>(query)
                        return typeof result === 'object' ? result : null
                    }
                    // Search by where
                    else {
                        const whereClause = convertWhereClause(where, model);
                        const query = select.length > 0
                            ? `SELECT ${selectClause.join(', ')} FROM ${model} WHERE ${whereClause} LIMIT 1`
                            : `SELECT * FROM ${model} WHERE ${whereClause} LIMIT 1`;
                        const [result] = await db.query<[any[]]>(query)
                        return result[0];
                    }
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
                    const idWhereIndex = where.findIndex((val) => val.field === "id")
                    if (idWhereIndex > 0) {
                        const [id] = where.splice(idWhereIndex, 1)
                        const whereClause = convertWhereClause(where, model);
                        const query = `UPDATE ONLY ${id.value} MERGE $update ${whereClause.length ? `WHERE ${whereClause}` : ''}`
                        const [result] = await db.query<[any]>(query, {
                            update,
                        })
                        return typeof result === 'object' ? result : null
                    } else {
                        const whereClause = convertWhereClause(where, model);
                        const query = `UPDATE ${model} MERGE $update WHERE ${whereClause}`
                        const [result] = await db.query<[any[]]>(query, {
                            update,
                        });
                        return result[0];
                    }
				},
                delete: async ({ model, where }) => {
                    const idWhereIndex = where.findIndex((val) => val.field === "id")
                    if (idWhereIndex > 0) {
                        const [id] = where.splice(idWhereIndex, 1)
                        const whereClause = convertWhereClause(where, model);
                        const query = `DELETE ONLY ${id.value} ${whereClause.length ? `WHERE ${whereClause}` : ''} RETURN BEFORE`
                        await db.query<[any]>(query)
                    } else {
                        const whereClause = convertWhereClause(where, model);
                        const query = `DELETE ${model} WHERE ${whereClause} RETURN NONE`
                        await db.query<[any[]]>(query);
                    }
                },
                deleteMany: async ({ model, where }) => {
                    const whereClause = convertWhereClause(where, model);
                    const [result] = await db.query<[any[]]>(`DELETE FROM ${model} WHERE ${whereClause} RETURN BEFORE`);
                    return result.length;
                },
                updateMany: async ({ model, where, update }) => {
                    const whereClause = convertWhereClause(where, model);
                    const [result] = await db.query<[any[]]>(`UPDATE ${model} MERGE ${JSON.stringify(update)} WHERE ${whereClause}`);
                    return result[0];
                },
                createSchema: async ({ file, tables }) => {
                    if (file && !file?.endsWith('.surql')) {
                        throw Error("output file type must be .surql")
                    }
                    let code = ''
                    const overwrite = config?.generate?.overwrite ? "OVERWRITE " : ""
                    const defaultTimeNow = config?.generate?.roundDefaultTime === false
                        ? `time::now()`
                        : `time::round(time::now(), 1${config?.generate?.roundDefaultTime ?? 's'})`

                    for (const [tablekey, table] of Object.entries(tables)) {
                        const tableName = table.modelName ?? tablekey
                        code += `DEFINE TABLE ${overwrite}${tableName} SCHEMAFULL;\n`

                        for (const [fieldkey, field] of Object.entries(table.fields)) {
                            const fieldName = field.fieldName ?? fieldkey
                            const typeKey = Array.isArray(field.type) ? `${field.type[0]}[]` as FieldType : field.type;
                            let type = typeMap[typeKey as string] ?? "any"

                            if (
                                config?.enableRecords
                                && field.references
                                && field.references.field === 'id'
                            ) {
                                type = (typeKey as string).endsWith("[]")
                                    ? `record<array<${field.references.model}>>`
                                    : `record<${field.references.model}>`
                            }

                            if (!field.required && type !== "any") {
                                type = `option<${type}>`
                            }

                            let fieldDefault = typeof field.defaultValue === "function" ? field.defaultValue() : field.defaultValue;
                            let defaultStr: string | undefined = undefined
                            if (fieldDefault) {
                                if (fieldkey?.endsWith('At')) {
                                    fieldDefault = defaultTimeNow
                                    defaultStr = fieldDefault ? ` VALUE ${fieldDefault}${
                                        fieldkey === 'createdAt' ? " READONLY" : ""
                                    }` : ""
                                } else {
                                    defaultStr = fieldDefault ? ` DEFAULT ${fieldDefault}` : ""
                                }
                            }

                            if (
                                config?.enableRecords
                                && field.references?.onDelete
                                && !config?.generate?.disableOnDeleteReference
                            ) {
                                switch (field.references.onDelete) {
                                    case 'set null':
                                        type += ` REFERENCE ON DELETE UNSET`
                                        break;
                                    case 'no action':
                                        type += ` REFERENCE ON DELETE IGNORE`
                                        break;
                                    case 'restrict':
                                        type += ` REFERENCE ON DELETE REJECT`
                                        break;
                                    case 'set default':
                                        type += ` REFERENCE ON DELETE THEN $value = ${fieldDefault}`
                                        break;
                                    case 'cascade':
                                    default:
                                        type += ` REFERENCE ON DELETE CASCADE`
                                        break;
                                }
                            }

                            code += `DEFINE FIELD ${overwrite}${fieldName} ON TABLE ${tableName} TYPE ${type}${defaultStr ?? ""};\n`
                        }

                        code += `\n`
                    }
                    return {
                        code,
                        path: file ?? 'auth.surql',
                    }
                },
            } satisfies ReturnType<CreateCustomAdapter>
        },
    })
};

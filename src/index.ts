import { generateId } from "better-auth";
import { getAuthTables } from "better-auth/db";
import type { Adapter, BetterAuthOptions, Where } from "better-auth/types";
import { jsonify, type RecordId, type Surreal } from "surrealdb";
import { withApplyDefault } from "./utils";

const createTransform = (options: BetterAuthOptions) => {
	const schema = getAuthTables(options);

	function transformSelect(select: string[], model: string): string[] {
		if (!select || select.length === 0) return [];
		return select.map((field) => getField(model, field));
	}

	function getField(model: string, field: string) {
		if (field === "id") {
			return field;
		}
		const f = schema[model].fields[field];
		return f.fieldName || field;
	}

	return {
		transformInput(
			data: Record<string, any>,
			model: string,
			action: "update" | "create",
		) {
			const transformedData: Record<string, any> =
				action === "update"
					? {}
					: {
							id: options.advanced?.generateId
								? options.advanced.generateId({ model })
								: data.id || generateId(),
						};

			const fields = schema[model].fields;
			for (const field in fields) {
				const value = data[field];
				if (value === undefined && !fields[field].defaultValue) {
					continue;
				}
				transformedData[fields[field].fieldName || field] = withApplyDefault(
					value,
					fields[field],
					action,
				);
			}
			return transformedData;
		},
		transformOutput(
			data: Record<string, any>,
			model: string,
			select: string[] = [],
		) {
			if (!data) return null;
			const transformedData: Record<string, any> =
				data.id || data._id
					? select.length === 0 || select.includes("id")
						? { id: data.id }
						: {}
					: {};
			const tableSchema = schema[model].fields;
			for (const key in tableSchema) {
				if (select.length && !select.includes(key)) {
					continue;
				}
				const field = tableSchema[key];
				if (field) {
					transformedData[key] = data[field.fieldName || key];
				}
			}
			return transformedData as any;
		},
		convertWhereClause(where: Where[], model: string) {
			return where
				.map((clause) => {
					const { field: _field, value, operator } = clause;
					const field = getField(model, _field);
					const v = value as unknown as RecordId;
					const isRecordId = !!v.tb;
					switch (operator) {
						case "eq":
							return field === "id" || isRecordId
								? `${field} = ${jsonify(value)}`
								: `${field} = '${jsonify(value)}'`;
						case "in":
							return `${field} IN [${jsonify(value)}]`;
						case "contains":
							return `${field} CONTAINS '${jsonify(value)}'`;
						case "starts_with":
							return `string::starts_with(${field},'${value}')`;
						case "ends_with":
							return `string::ends_with(${field},'${value}')`;
						default:
							if (field.endsWith("Id") || isRecordId || field === "id") {
								return `${field} = ${jsonify(value)}`;
							}
							return `${field} = '${jsonify(value)}'`;
					}
				})
				.join(" AND ");
		},
		transformSelect,
		getField,
	};
};

export const surrealAdapter = (db: Surreal) => (options: BetterAuthOptions) => {
	if (!db) {
		throw new Error("SurrealDB adapter requires a SurrealDB client");
	}
	const { transformInput, transformOutput, convertWhereClause, getField } =
		createTransform(options);

	return {
		id: "surreal",
		create: async ({ model, data }) => {
			const transformed = transformInput(data, model, "create");
			const [result] = await db.create(model, transformed);
			return transformOutput(result, model);
		},
		findOne: async ({ model, where, select = [] }) => {
			const whereClause = convertWhereClause(where, model);
			const selectClause =
				(select.length > 0 && select.map((f) => getField(model, f))) || [];
			const query =
				select.length > 0
					? `SELECT ${selectClause.join(", ")} FROM ${model} WHERE ${whereClause} LIMIT 1`
					: `SELECT * FROM ${model} WHERE ${whereClause} LIMIT 1`;
			const result = await db.query<[any[]]>(query);
			return transformOutput(result[0][0], model, select);
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
			return results.map((record) => transformOutput(record, model));
		},
		count: async ({ model, where }) => {
			const whereClause = where ? convertWhereClause(where, model) : "";
			const query = `SELECT count(${whereClause}) FROM ${model} GROUP ALL`;
			const [result] = await db.query<[any[]]>(query);
			const res = result[0];
			return res.count;
		},
		update: async ({ model, where, update }) => {
			const whereClause = convertWhereClause(where, model);
			const transformedUpdate = transformInput(update, model, "update");
			const [result] = await db.query<[any[]]>(
				`UPDATE ${model} MERGE ${JSON.stringify(transformedUpdate)} WHERE ${whereClause}`,
			);
			return transformOutput(result[0], model);
		},
		delete: async ({ model, where }) => {
			const whereClause = convertWhereClause(where, model);
			await db.query(`DELETE FROM ${model} WHERE ${whereClause}`);
		},
		deleteMany: async ({ model, where }) => {
			const whereClause = convertWhereClause(where, model);
			const [result] = await db.query<[any[]]>(
				`DELETE FROM ${model} WHERE ${whereClause}`,
			);
			return result.length;
		},
		updateMany: async ({ model, where, update }) => {
			const whereClause = convertWhereClause(where, model);
			const transformedUpdate = transformInput(update, model, "update");
			const [result] = await db.query<[any[]]>(
				`UPDATE ${model} MERGE ${JSON.stringify(transformedUpdate)} WHERE ${whereClause}`,
			);
			return transformOutput(result[0], model);
		},
	} satisfies Adapter;
};

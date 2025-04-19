import { generateId } from "better-auth";
import { getAuthTables } from "better-auth/db";
import type { Adapter, BetterAuthOptions, Where } from "better-auth/types";
import { jsonify, type RecordId } from "surrealdb";
import { Surreal } from "surrealdb";
import { withApplyDefault } from "./utils";

interface SurrealConfig {
	address: string;
	username: string;
	password: string;
	ns: string;
	db: string;
}

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
		transformInput<T extends Record<string, unknown>>(
			data: T,
			model: string,
			action: "update" | "create",
		) {
			const transformedData: Record<string, unknown> =
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
					{
						...fields[field],
						fieldName: fields[field].fieldName || field,
					},
					action,
				);
			}
			return transformedData;
		},
		transformOutput<T extends Record<string, unknown>>(
			data: T,
			model: string,
			select: string[] = [],
		) {
			if (!data) return null;
			const transformedData: Record<string, unknown> =
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
			return transformedData as T;
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

export const surrealAdapter =
	(config: SurrealConfig) =>
	(options: BetterAuthOptions): Adapter => {
		let db: Surreal | null = null;
		let isConnecting = false;
		let connectionPromise: Promise<Surreal> | null = null;

		const ensureConnection = async () => {
			if (db) {
				try {
					// Test if connection is still alive
					await db.query("SELECT * FROM user LIMIT 1");
					return db;
				} catch (error) {
					// Connection is dead, reset and reconnect
					db = null;
				}
			}

			if (isConnecting && connectionPromise) {
				return connectionPromise;
			}

			isConnecting = true;
			connectionPromise = new Promise((resolve, reject) => {
				const newDb = new Surreal();
				newDb
					.connect(config.address, {
						namespace: config.ns,
						database: config.db,
						auth: {
							username: config.username,
							password: config.password,
						},
					})
					.then(() => {
						db = newDb;
						isConnecting = false;
						connectionPromise = null;
						resolve(newDb);
					})
					.catch((error) => {
						isConnecting = false;
						connectionPromise = null;
						reject(error);
					});
			});

			return connectionPromise;
		};

		const { transformInput, transformOutput, convertWhereClause, getField } =
			createTransform(options);

		return {
			id: "surreal",
			create: async <T extends Record<string, unknown>, R = T>({
				model,
				data,
			}: { model: string; data: T }) => {
				const db = await ensureConnection();
				const transformed = transformInput(data, model, "create");
				const [result] = await db.create(model, transformed);
				return transformOutput(result, model) as R;
			},
			findOne: async <T>({
				model,
				where,
				select = [],
			}: { model: string; where: Where[]; select?: string[] }) => {
				const db = await ensureConnection();
				const whereClause = convertWhereClause(where, model);
				const selectClause =
					(select.length > 0 && select.map((f) => getField(model, f))) || [];
				const query =
					select.length > 0
						? `SELECT ${selectClause.join(", ")} FROM ${model} WHERE ${whereClause} LIMIT 1`
						: `SELECT * FROM ${model} WHERE ${whereClause} LIMIT 1`;
				const result = await db.query<[Record<string, unknown>[]]>(query);
				return transformOutput(result[0][0], model, select) as T | null;
			},
			findMany: async <T>({
				model,
				where,
				sortBy,
				limit,
				offset,
			}: {
				model: string;
				where?: Where[];
				sortBy?: { field: string; direction: "asc" | "desc" };
				limit?: number;
				offset?: number;
			}) => {
				const db = await ensureConnection();
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
				const [results] = await db.query<[Record<string, unknown>[]]>(query);
				return results.map((record) => transformOutput(record, model) as T);
			},
			count: async ({ model, where }: { model: string; where?: Where[] }) => {
				const db = await ensureConnection();
				const whereClause = where ? convertWhereClause(where, model) : "";
				const query = `SELECT count(${whereClause}) FROM ${model} GROUP ALL`;
				const [result] = await db.query<[Record<string, unknown>[]]>(query);
				const res = result[0];
				return Number(res.count);
			},
			update: async <T extends Record<string, unknown>, R = T>({
				model,
				where,
				update,
			}: { model: string; where: Where[]; update: T }) => {
				const db = await ensureConnection();
				const whereClause = convertWhereClause(where, model);
				const transformedUpdate = transformInput(update, model, "update");
				const [result] = await db.query<[Record<string, unknown>[]]>(
					`UPDATE ${model} MERGE $transformedUpdate WHERE ${whereClause}`,
					{
						transformedUpdate,
					},
				);
				return transformOutput(result[0], model) as R;
			},
			delete: async ({ model, where }: { model: string; where: Where[] }) => {
				const db = await ensureConnection();
				const whereClause = convertWhereClause(where, model);
				await db.query(`DELETE FROM ${model} WHERE ${whereClause}`);
			},
			deleteMany: async ({
				model,
				where,
			}: { model: string; where: Where[] }) => {
				const db = await ensureConnection();
				const whereClause = convertWhereClause(where, model);
				const [result] = await db.query<[Record<string, unknown>[]]>(
					`DELETE FROM ${model} WHERE ${whereClause}`,
				);
				return result.length;
			},
			updateMany: async <T extends Record<string, unknown>, R = T>({
				model,
				where,
				update,
			}: { model: string; where: Where[]; update: T }) => {
				const db = await ensureConnection();
				const whereClause = convertWhereClause(where, model);
				const transformedUpdate = transformInput(update, model, "update");
				const [result] = await db.query<[Record<string, unknown>[]]>(
					`UPDATE ${model} MERGE $transformedUpdate WHERE ${whereClause}`,
					{
						transformedUpdate,
					},
				);
				return transformOutput(result[0], model) as R;
			},
		} satisfies Adapter;
	};

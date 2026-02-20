import { createAdapterFactory, type DBAdapterDebugLogOption } from "better-auth/adapters";
import { Surreal } from "surrealdb";

// Your custom adapter config options
interface CustomAdapterConfig {
  /**
   * Helps you debug issues with the adapter.
   */
  debugLogs?: DBAdapterDebugLogOption;
  /**
   * If the table names in the schema are plural.
   */
  usePlural?: boolean;
}

export const myAdapter = (db: Surreal, config: CustomAdapterConfig = {}) =>
  createAdapterFactory({
    config: {
          adapterId: "surrealdb", // A unique identifier for the adapter.
          adapterName: "SurrealDB", // The name of the adapter.
          usePlural: config.usePlural ?? false, // Whether the table names in the schema are plural.
          debugLogs: config.debugLogs ?? false, // Whether to enable debug logs.
          supportsJSON: true, // Whether the database supports JSON. (Default: false)
          supportsDates: true, // Whether the database supports dates. (Default: true)
          supportsBooleans: true, // Whether the database supports booleans. (Default: true)
          supportsNumericIds: false, // Whether the database supports auto-incrementing numeric IDs. (Default: true)
          transaction: 
        },
        adapter: ({}) => {
              return {
                create: async ({ data, model, select }) => {
                  // ...
                },
                update: async ({ data, model, select }) => {
                  // ...
                },
                updateMany: async ({ data, model, select }) => {
                  // ...
                },
                delete: async ({ data, model, select }) => {
                  // ...
                },
                // ...
              };
  });
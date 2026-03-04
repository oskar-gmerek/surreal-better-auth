import { testAdapter } from "@better-auth/test-utils/adapter";
import { afterAll, beforeAll, describe } from "vitest";
import { surrealdbAdapter } from "../packages/surreal-better-auth/src/adapter";
import { getTestSurrealInstance } from "./surrealdb";
import { crudTestSuite } from "./suites/crudTestSuite";
// import { surrealTestSuite } from "./suites/surrealTestSuite";
import { surrealTestSuite } from "./suites/surrealTestSuite";
import { specialConfigTestSuite } from "./suites/specialConfigTestSuite";
import { Surreal } from "surrealdb";

/**
 * Main Integration Test Runner for the SurrealDB Adapter.
 * This suite executes both standard Better-Auth internal tests and
 * SurrealDB-specific edge case tests.
 */
describe("SurrealDB Adapter Integration Tests", async () => {
  const { execute } = await testAdapter({
    /**
     * Adapter Factory Wrapper.
     * We return a function that 'testAdapter' calls with its own generated options.
     * This allows us to inject experimental flags and custom configurations.
     */
    adapter: async () => {
      const db = await getTestSurrealInstance();
      if (!db) throw new Error("DB not initialized!");

      const factory = surrealdbAdapter(db, {
        // logSurrealQL: true,
        // idGenerator: "guid",
        // usePlural: false,
      });

      return (authOptions: any) => {
        return factory({
          ...authOptions,
          experimental: {
            joins: true,
          },
        });
      };
    },

    runMigrations: async (options) => {
      const db = await getTestSurrealInstance();
      // Create a temporary instance to access the createSchema method with current options
      const tempAdapter = surrealdbAdapter(db, { idGenerator: "ULID" })(options);

      if (tempAdapter.createSchema) {
        const schema = await tempAdapter.createSchema(options);

        // IMPORTANT: For SurrealDB SCHEMAFULL, we must drop the tables
        // before applying a new schema structure (like renaming email -> email_address)
        // to avoid "required field missing" errors.
        await db.query(`
              REMOVE TABLE IF EXISTS account;
              REMOVE TABLE IF EXISTS business;
              REMOVE TABLE IF EXISTS invitation;
              REMOVE TABLE IF EXISTS member;
              REMOVE TABLE IF EXISTS session;
              REMOVE TABLE IF EXISTS team;
              REMOVE TABLE IF EXISTS teamMember;
              REMOVE TABLE IF EXISTS user;
              REMOVE TABLE IF EXISTS verification;
            `);

        // Apply the new schema (using DEFINE TABLE ... OVERWRITE)
        await db.query(schema.code);

        console.log(`[SurrealDB] Migration completed for suite: ${options.appName || "Standard"}`);
      }
    },

    /**
     * List of test suites to execute.
     * 1. Edge Cases: Specific SurrealDB behaviors (Transactions, FETCH Joins, etc.)
     * 2. Internal Tests: Standard CRUD and operator logic.
     */
    // tests: [crudTestSuite(), surrealTestSuite(), specialConfigTestSuite()],
    tests: [
      crudTestSuite(),
      async (helpers: any) => {
        const db = await getTestSurrealInstance();
        return await surrealTestSuite(db)(helpers);
      },
      specialConfigTestSuite(),
    ],

    /**
     * Cleanup logic performed after the entire test run finishes.
     */
    additionalCleanups: async () => {},
  });

  /**
   * Register the tests within the Vitest runner.
   */
  execute();
});

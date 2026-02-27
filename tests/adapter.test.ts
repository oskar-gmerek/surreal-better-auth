import { describe, beforeAll, afterAll, test, expect } from "vitest";
import { Surreal } from "surrealdb";
import { runAdapterTest } from "better-auth/adapters/test";
import { surrealdbAdapter } from "../packages/surreal-better-auth/dist/index.mjs";
import { surql } from "surrealdb";

/**
 * Main test suite for the SurrealDB Better-Auth adapter.
 * This suite executes the standard Better-Auth adapter test suite to ensure
 * compliance with the framework's internal requirements.
 */
describe("SurrealDB adapter test", async () => {
  const db = new Surreal({
    websocketImpl: globalThis.WebSocket,
  });

  beforeAll(async () => {
    // Establish connection to the local SurrealDB instance
    await db.connect("ws://127.0.0.1:8000/rpc");
    await db.signin({ username: "root", password: "root" });
    await db.use({ namespace: "test", database: "better_auth_test" });

    // Initial cleanup of testing tables
    await db.query(surql`
          BEGIN TRANSACTION;
            REMOVE TABLE IF EXISTS account;
            REMOVE TABLE IF EXISTS user;
            REMOVE TABLE IF EXISTS sessions;
            REMOVE TABLE IF EXISTS accounts;
            REMOVE TABLE IF EXISTS users;
            REMOVE TABLE IF EXISTS sessionss;
          COMMIT TRANSACTION;
        `);

    // Import the required schema for standard Better-Auth tests
    await db.import(`
      BEGIN TRANSACTION;
        DEFINE TABLE OVERWRITE user SCHEMAFULL;
        DEFINE FIELD OVERWRITE id ON TABLE user TYPE record<user>;
        DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;
        DEFINE FIELD OVERWRITE email_address ON TABLE user TYPE string;
        DEFINE FIELD OVERWRITE emailVerified ON TABLE user TYPE bool;
        DEFINE FIELD OVERWRITE image ON TABLE user TYPE option<string>;
        DEFINE FIELD OVERWRITE createdAt ON TABLE user TYPE datetime;
        DEFINE FIELD OVERWRITE updatedAt ON TABLE user TYPE datetime;

        DEFINE INDEX OVERWRITE idx_user_id ON user COLUMNS id UNIQUE;
        DEFINE INDEX OVERWRITE idx_user_email ON user COLUMNS email_address UNIQUE;

        DEFINE TABLE OVERWRITE sessions SCHEMAFULL;
        DEFINE FIELD OVERWRITE id ON TABLE sessions TYPE record<sessions>;
        DEFINE FIELD OVERWRITE expiresAt ON TABLE sessions TYPE datetime;
        DEFINE FIELD OVERWRITE token ON TABLE sessions TYPE string;
        DEFINE FIELD OVERWRITE createdAt ON TABLE sessions TYPE datetime;
        DEFINE FIELD OVERWRITE updatedAt ON TABLE sessions TYPE datetime;
        DEFINE FIELD OVERWRITE ipAddress ON TABLE sessions TYPE option<string>;
        DEFINE FIELD OVERWRITE userAgent ON TABLE sessions TYPE option<string>;
        DEFINE FIELD OVERWRITE userId ON TABLE sessions TYPE record<user>;

        DEFINE INDEX OVERWRITE idx_sessions_id ON sessions COLUMNS id UNIQUE;
        DEFINE INDEX OVERWRITE idx_sessions_token ON sessions COLUMNS token UNIQUE;
        DEFINE INDEX OVERWRITE idx_sessions_userId ON sessions COLUMNS userId;

        DEFINE TABLE OVERWRITE account SCHEMAFULL;
        DEFINE FIELD OVERWRITE id ON TABLE account TYPE record<account>;
        DEFINE FIELD OVERWRITE accountId ON TABLE account TYPE record<user> | string;
        DEFINE FIELD OVERWRITE providerId ON TABLE account TYPE string;
        DEFINE FIELD OVERWRITE userId ON TABLE account TYPE record<user>;
        DEFINE FIELD OVERWRITE accessToken ON TABLE account TYPE option<string>;
        DEFINE FIELD OVERWRITE refreshToken ON TABLE account TYPE option<string>;
        DEFINE FIELD OVERWRITE idToken ON TABLE account TYPE option<string>;
        DEFINE FIELD OVERWRITE accessTokenExpiresAt ON TABLE account TYPE option<datetime>;
        DEFINE FIELD OVERWRITE refreshTokenExpiresAt ON TABLE account TYPE option<datetime>;
        DEFINE FIELD OVERWRITE scope ON TABLE account TYPE option<string>;
        DEFINE FIELD OVERWRITE password ON TABLE account TYPE option<string>;
        DEFINE FIELD OVERWRITE createdAt ON TABLE account TYPE datetime;
        DEFINE FIELD OVERWRITE updatedAt ON TABLE account TYPE datetime;

        DEFINE INDEX OVERWRITE idx_account_id ON account COLUMNS id UNIQUE;
        DEFINE INDEX OVERWRITE idx_account_userId ON account COLUMNS userId;
      COMMIT TRANSACTION;
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  const adapter = surrealdbAdapter(db, {
    idGenerator: "guid",
    logSurrealQL: false,
    usePlural: false,
  });

  /**
   * Run the official Better-Auth adapter test suite.
   * Tests are performed with pluralization enabled and custom field mapping for emails.
   */
  runAdapterTest({
    getAdapter: async (customOptions = {}) => {
      return adapter({
        user: {
          fields: {
            email: "email_address",
          },
          additionalFields: {
            test: {
              type: "string",
              defaultValue: "test",
            },
          },
        },
        session: {
          modelName: "sessions",
        },
        ...customOptions,
      });
    },
    disableTests: {
      // Disabled because SurrealDB handles ID generation internally or via custom triggers
      SHOULD_PREFER_GENERATE_ID_IF_PROVIDED: true,
    },
  });

  /**
   * Custom test to verify that provide generateId function in advanced database
   * options is respected and results in a valid RecordId format.
   */
  test("should prefer generateId if provided and return recordid", async () => {
    const customAdapter = adapter({
      advanced: {
        database: {
          generateId: () => "mocked_id",
        },
      },
      user: {
        fields: {
          email: "email_address",
        },
        additionalFields: {
          test: {
            type: "string",
            defaultValue: "test",
          },
        },
      },
    });

    const res = await customAdapter.create({
      model: "user",
      data: {
        id: "user:passed_id",
        name: "user4",
        test: "ustawione",
        email: "user4@email.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Verify that the ID matches the mocked value, accounting for potential pluralization prefixes
    expect(res.id).toBeOneOf(["user:mocked_id", "users:mocked_id"]);
  });
});

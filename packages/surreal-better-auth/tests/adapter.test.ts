import { describe, beforeAll, afterAll, test, expect } from "vitest";
import { Surreal } from "surrealdb";
import { runAdapterTest } from "better-auth/adapters/test";
import { surrealdbAdapter } from "../dist/index.js";

describe("SurrealDB adapter test", async () => {
  const db = new Surreal();

  beforeAll(async () => {
    await db.connect("ws://127.0.0.1:8000/rpc");
    await db.signin({ username: "root", password: "root" });
    await db.use({ namespace: "test", database: "better_auth_test" });

    await db.query(`
      BEGIN TRANSACTION;
      DELETE account; DELETE user; DELETE sessions; DELETE verification;

-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  TABLE: user                                                           ║
-- ╚════════════════════════════════════════════════════════════════════════╝
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

-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  TABLE: sessions                                                       ║
-- ╚════════════════════════════════════════════════════════════════════════╝
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
COMMIT TRANSACTION;
`);
  });

  afterAll(async () => {
    await db.close();
  });

  const adapter = surrealdbAdapter(db, {
    idGenerator: "surreal.ULID",
    debugLogs: true,
    allowPassingId: true
  });

  await runAdapterTest({
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
      SHOULD_PREFER_GENERATE_ID_IF_PROVIDED: true,
    },
  });
  test("should prefer generateId if provided and return recordid", async () => {
    const customAdapter = adapter({
      advanced: {
        database: {
          generateId: () => "mocked-id",
        },
      },
      user: {
        fields: {
          email: "email_address",
        },
      },
    });
    const res = await customAdapter.create({
      model: "user",
      data: {
        id: "user:passed_id",
        name: "user4",
        email: "user4@email.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect(res.id).toBe("user:mocked-id");
  });
});

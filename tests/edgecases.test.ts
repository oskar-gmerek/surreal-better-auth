import { describe, beforeAll, afterAll, test, expect } from "vitest";
import { Surreal, RecordId, StringRecordId, surql, DateTime } from "surrealdb";
import { surrealdbAdapter } from "../packages/surreal-better-auth/dist/index.mjs";

/**
 * Integration tests for SurrealDB adapter edge cases.
 * These tests verify SurrealDB-specific behaviors like native RecordId conversion,
 * polymorphic field handling, and transaction rollbacks.
 */
describe("SurrealDB Adapter - Edge Cases", async () => {
  const db = new Surreal();

  beforeAll(async () => {
    await db.connect("ws://127.0.0.1:8000/rpc");
    await db.signin({ username: "root", password: "root" });
    await db.use({ namespace: "test", database: "better_auth_test_edge" });

    // Clean up existing tables before starting tests
    await db.query(surql`
      REMOVE TABLE IF EXISTS account;
      REMOVE TABLE IF EXISTS user;
      REMOVE TABLE IF EXISTS session;
    `);

    // Initialize Schemafull tables to enforce strict type checking during tests
    await db.import(`
      DEFINE TABLE user SCHEMAFULL;
      DEFINE FIELD name ON user TYPE string;
      DEFINE FIELD email ON user TYPE string;
      DEFINE FIELD image ON user TYPE option<string>;
      DEFINE FIELD emailVerified ON user TYPE bool;
      DEFINE FIELD createdAt ON user TYPE datetime;
      DEFINE FIELD updatedAt ON user TYPE datetime;

      DEFINE TABLE account SCHEMAFULL;
      DEFINE FIELD accountId ON account TYPE record<user> | string;
      DEFINE FIELD providerId ON account TYPE string;
      DEFINE FIELD userId ON account TYPE record<user>;
      DEFINE FIELD createdAt ON account TYPE datetime;
      DEFINE FIELD updatedAt ON account TYPE datetime;
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  /**
   * Helper to initialize the adapter for testing.
   * Uses 'guid' generator and enables forceAllowId to allow manual ID testing.
   */
  const getTestAdapter = () => {
    return surrealdbAdapter(db, {
      usePlural: false,
      idGenerator: "guid",
      logSurrealQL: false,
    })({
      user: { modelName: "user" },
      account: { modelName: "account" },
      session: { modelName: "session" },
      advanced: { database: { forceAllowId: true } },
    });
  };

  /**
   * Tests the polymorphic nature of the accountId field.
   * Credential providers should link to user records, while OAuth providers
   * should remain as raw strings.
   */
  test("Polymorphic accountId: should store credential as RecordId and google as string", async () => {
    const adapter = getTestAdapter();
    const userId = "user_1";

    // Create a credential-based account (should be converted to RecordId)
    const acc1 = await adapter.create({
      model: "account",
      data: {
        accountId: userId,
        providerId: "credential",
        userId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Create an OAuth-based account (should remain a raw string)
    const acc2 = await adapter.create({
      model: "account",
      data: {
        accountId: "google:999",
        providerId: "google",
        userId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const actualId1 = acc1.id.toString();
    const actualId2 = acc2.id.toString();

    // Query directly from DB to verify raw data types
    const [acc1Res] = await db.query<[any[]]>(
      surql`SELECT * FROM account WHERE id = ${new StringRecordId(actualId1)}`,
    );
    const [acc2Res] = await db.query<[any[]]>(
      surql`SELECT * FROM account WHERE id = ${new StringRecordId(actualId2)}`,
    );

    expect(acc1Res[0]).toBeDefined();
    expect(acc1Res[0].accountId).toBeInstanceOf(RecordId);
    expect(acc1Res[0].accountId.toString()).toBe("user:user_1");

    expect(acc2Res[0]).toBeDefined();
    expect(typeof acc2Res[0].accountId).toBe("string");
    expect(acc2Res[0].accountId).toBe("google:999");
  });

  /**
   * Verifies that updating a field to null effectively removes the key
   * from the document, adhering to SurrealDB's MERGE behavior with undefined (NONE).
   */
  test("mapNullToUndefined: should effectively remove field from document on null update", async () => {
    const adapter = getTestAdapter();

    const createdUser = await adapter.create({
      model: "user",
      data: {
        name: "Oskar",
        email: "oskar@test.com",
        image: "http://image.com/old.png",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const actualId = createdUser.id.toString();

    // Perform the null update which triggers mapNullToUndefined
    await adapter.update({
      model: "user",
      where: [{ field: "id", value: actualId }],
      update: { image: null },
    });

    const [result] = await db.query<[any[]]>(
      surql`SELECT * FROM user WHERE id = ${new StringRecordId(actualId)}`,
    );

    expect(result[0]).toBeDefined();
    // In SurrealDB, merging with NONE removes the field from the object
    expect(result[0].image).toBeUndefined();
  });

  /**
   * Ensures that strings containing colons (like URLs) are not accidentally
   * converted to RecordIds if the prefix does not match a valid table.
   */
  test("toRecordId safety: should not convert random strings with colons to RecordId", async () => {
    const adapter = getTestAdapter();
    const myName = "My Name is info:user_123";

    const user = await adapter.create({
      model: "user",
      data: {
        name: myName,
        email: "test@safety.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const actualId = user.id.toString();

    const [dbUser] = await db.query<[any[]]>(
      surql`SELECT name FROM user WHERE id = ${new StringRecordId(actualId)}`,
    );

    expect(dbUser[0]).toBeDefined();
    expect(typeof dbUser[0].name).toBe("string");
    expect(dbUser[0].name).toBe(myName);
  });

  /**
   * Validates that the transaction helper correctly rolls back data
   * when an error occurs during the execution block.
   */
  test("Transactions: should rollback data on error", async () => {
    const adapter = getTestAdapter();
    const testEmail = "rollback@test.com";

    try {
      await adapter.transaction(async (txn) => {
        await txn.create({
          model: "user",
          data: {
            name: "Tx User",
            email: testEmail,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        throw new Error("Simulated Transaction Failure");
      });
      // oxlint-disable-next-line
    } catch (e) {
      // Expected failure
    }

    const [users] = await db.query<[any[]]>(surql`SELECT * FROM user WHERE email = ${testEmail}`);
    expect(users.length).toBe(0);
  });

  /**
   * Verifies that arrays of strings in WHERE IN clauses are correctly
   * mapped to RecordId arrays for database queries.
   */
  test("Array mapping: WHERE IN operator should properly map array of strings to RecordIds", async () => {
    const adapter = getTestAdapter();

    const u1 = await adapter.create({
      model: "user",
      data: {
        name: "A",
        email: "a@a.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const u2 = await adapter.create({
      model: "user",
      data: {
        name: "B",
        email: "b@b.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const results = (await adapter.findMany({
      model: "user",
      where: [{ field: "id", operator: "in", value: [u1.id.toString(), u2.id.toString()] }],
    })) as any[];

    expect(results).toBeDefined();
    expect(results.length).toBe(2);

    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["A", "B"]);
  });

  /**
   * Confirms that customTransformOutput correctly converts SurrealDB's
   * native DateTime objects back into standard JavaScript Date objects.
   */
  test("Native Types: should convert Surreal DateTime to JS Date via customTransformOutput", async () => {
    const adapter = surrealdbAdapter(db, { idGenerator: "guid" })({
      user: { modelName: "user" },
      session: { modelName: "session" },
    });

    const testDate = new Date("2030-01-01T10:00:00.000Z");

    const session = (await adapter.create({
      model: "session",
      data: {
        userId: "user_1",
        token: "token_type_test",
        expiresAt: testDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })) as any;

    // The adapter must return a native Date instance
    expect(session.expiresAt).toBeInstanceOf(Date);
    expect(session.expiresAt.toISOString()).toBe("2030-01-01T10:00:00.000Z");

    const [dbResult] = await db.query<[any[]]>(
      surql`SELECT expiresAt FROM session WHERE id = ${new StringRecordId(session.id)}`,
    );

    // Verify the raw SDK driver returns DateTime (proving the adapter transform worked)
    expect(dbResult[0].expiresAt).toBeInstanceOf(DateTime);
  });

  /**
   * TODO:
   * Skipped: Native JOIN support via FETCH requires Better-Auth v1.5.0+ or later (still on beta).
   */
  test.skip(
    "[supportsJoin is not implemented in Better-Auth yet.] " +
      "Joins (FETCH): should populate referenced record when join is requested",
    async () => {
      const adapter = getTestAdapter();

      const user = await adapter.create({
        model: "user",
        data: {
          name: "Join User",
          email: "join@test.com",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const session = await adapter.create({
        model: "session",
        data: {
          userId: user.id.toString(),
          token: "join_token_123",
          expiresAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const fetchedSession = (await adapter.findOne({
        model: "session",
        where: [{ field: "id", value: session.id.toString() }],
        join: {
          user: {
            // @ts-expect-error
            on: { to: "userId", from: "id" },
          },
        },
      })) as any;

      expect(fetchedSession).toBeDefined();
      expect(typeof fetchedSession.userId).toBe("object");
      expect(fetchedSession.userId.name).toBe("Join User");
    },
  );
});

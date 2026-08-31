import { expect } from "vitest";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { RecordId, StringRecordId, surql, DateTime, type Surreal } from "surrealdb";

/**
 * Integration test suite for SurrealDB-specific internals:
 * - Native RecordId graph pointers vs raw strings for polymorphic fields.
 * - String safety against false-positive RecordId coercion.
 * - Native SurrealDB DateTime storage vs JavaScript Date deserialization.
 */
export const surrealTestSuite = (db: Surreal) => {
  return async () => {
    return createTestSuite("SurrealDB Native Engine Tests", {}, ({ adapter }) => {
      return {
        "[01] Polymorphic accountId: should store credential as RecordId and OAuth as string":
          async () => {
            const user = await adapter.create({
              model: "user",
              data: {
                name: "Test User",
                email: `test-poly-${Date.now()}@edge.com`,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            // Credential account: accountId is the User's ID -> must be stored as native RecordId
            const acc1 = await adapter.create({
              model: "account",
              data: {
                accountId: user.id,
                providerId: "credential",
                userId: user.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            // OAuth account: accountId is an external provider ID -> must be stored as string
            const acc2 = await adapter.create({
              model: "account",
              data: {
                accountId: "google:999",
                providerId: "google",
                userId: user.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            const [acc1Res] = await db.query<[any[]]>(
              surql`SELECT * FROM account WHERE id = ${new StringRecordId(acc1.id.toString())}`,
            );
            const [acc2Res] = await db.query<[any[]]>(
              surql`SELECT * FROM account WHERE id = ${new StringRecordId(acc2.id.toString())}`,
            );

            expect(acc1Res[0].accountId).toBeInstanceOf(RecordId);
            expect(typeof acc2Res[0].accountId).toBe("string");
          },

        "[02] toRecordId safety: should not convert non-table strings with colons to RecordId":
          async () => {
            const myName = "My Name is info:user_123";

            const user = await adapter.create({
              model: "user",
              data: {
                name: myName,
                email: `safety-${Date.now()}@edge.com`,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            const [dbUser] = await db.query<[any[]]>(
              surql`SELECT name FROM user WHERE id = ${new StringRecordId(user.id)}`,
            );

            expect(typeof dbUser[0].name).toBe("string");
            expect(dbUser[0].name).toBe(myName);
          },

        "[03] Native Types: should store Surreal DateTime in DB and return JS Date to Better-Auth":
          async () => {
            const user = await adapter.create({
              model: "user",
              data: {
                name: "Date User",
                email: `date-${Date.now()}@test.com`,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            const testDate = new Date("2030-01-01T10:00:00.000Z");

            const session = (await adapter.create({
              model: "session",
              data: {
                userId: user.id,
                token: `tok-${Date.now()}`,
                expiresAt: testDate,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            })) as any;

            // Output to application must be a standard JS Date
            expect(session.expiresAt).toBeInstanceOf(Date);
            expect(session.expiresAt.toISOString()).toBe("2030-01-01T10:00:00.000Z");

            // Raw record in SurrealDB must be a native DateTime object
            const [dbResult] = await db.query<[any[]]>(
              surql`SELECT expiresAt FROM session WHERE id = ${new StringRecordId(session.id)}`,
            );

            expect(dbResult[0].expiresAt).toBeInstanceOf(DateTime);
          },
      };
    });
  };
};

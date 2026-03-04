import { expect } from "vitest";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { RecordId, StringRecordId, surql, DateTime, Surreal } from "surrealdb";
import { auth } from "../auth.ts";

/**
 * Integration tests for SurrealDB specific logic, transactions, and joins.
 */
export const surrealTestSuite = (db: Surreal) => {
  return async (_helpers: any) => {
    const _suite = createTestSuite("Surreal Test Suite", {}, ({ adapter }) => {
      return {
        "[01] Polymorphic accountId: should store credential as RecordId and google as string":
          async () => {
            const user = await adapter.create({
              model: "user",
              data: {
                name: "test user",
                email: `test-poly-${Date.now()}@edge.com`,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

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

        "[02] mapNullToUndefined: should effectively remove field from document on null update":
          async () => {
            const user = await adapter.create({
              model: "user",
              data: {
                name: "Oskar",
                email: `null-${Date.now()}@test.com`,
                image: "http://image.com/old.png",
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            await adapter.update({
              model: "user",
              where: [{ field: "id", value: user.id }],
              update: { image: null },
            });

            const [result] = await db.query<[any[]]>(
              surql`SELECT * FROM user WHERE id = ${new StringRecordId(user.id)}`,
            );

            expect(result[0].image).toBeUndefined();
          },

        "[03] toRecordId safety: should not convert random strings with colons to RecordId":
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

            expect(dbUser[0].name).toBe(myName);
          },

        "[04] Transactions: should rollback successful operations when a subsequent operation fails":
          async () => {
            const validEmail = `txn-valid-${Date.now()}@test.com`;
            const invalidEmail = `txn-invalid-${Date.now()}@test.com`;

            const ctx = await auth.$context;
            const realAdapter = ctx.adapter;

            try {
              await realAdapter.transaction(async (txn: any) => {
                await txn.create({
                  model: "user",
                  data: {
                    name: "Good User",
                    email: validEmail,
                    emailVerified: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                });

                await txn.create({
                  model: "user",
                  data: {
                    name: "Bad User",
                    email: invalidEmail,
                    emailVerified: 12345, // Type failure
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                });
              });
              // oxlint-disable-next-line
            } catch (e) {
              // caught error
            }

            const [users] = await db.query<[any[]]>(
              surql`SELECT * FROM user WHERE email = ${validEmail}`,
            );

            expect(users.length).toBe(0);
          },

        "[05] Array mapping: WHERE IN operator should properly map array of strings to RecordIds":
          async () => {
            const u1 = await adapter.create({
              model: "user",
              data: {
                name: "A",
                email: `a-${Date.now()}@in.com`,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            const u2 = await adapter.create({
              model: "user",
              data: {
                name: "B",
                email: `b-${Date.now()}@in.com`,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            const results = (await adapter.findMany({
              model: "user",
              where: [{ field: "id", operator: "in", value: [u1.id, u2.id] }],
            })) as any[];

            expect(results.length).toBe(2);
            const names = results.map((r) => r.name).sort();
            expect(names).toEqual(["A", "B"]);
          },

        "[06] Native Types: should convert Surreal DateTime to JS Date via customTransformOutput":
          async () => {
            const user = await adapter.create({
              model: "user",
              data: {
                name: "u",
                email: `u-${Date.now()}@u.com`,
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

            expect(session.expiresAt).toBeInstanceOf(Date);
            expect(session.expiresAt.toISOString()).toBe("2030-01-01T10:00:00.000Z");

            const [dbResult] = await db.query<[any[]]>(
              surql`SELECT expiresAt FROM session WHERE id = ${new StringRecordId(session.id)}`,
            );

            expect(dbResult[0].expiresAt).toBeInstanceOf(DateTime);
          },

        "[07] Joins (FETCH): should populate referenced record when join is requested":
          async () => {
            const user = await adapter.create({
              model: "user",
              data: {
                name: "Join User",
                email: `join-${Date.now()}@test.com`,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            const session = await adapter.create({
              model: "session",
              data: {
                userId: user.id,
                token: `jtok-${Date.now()}`,
                expiresAt: new Date(Date.now() + 10000),
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });

            const fetchedSession = (await adapter.findOne({
              model: "session",
              where: [{ field: "id", value: session.id }],
              join: { user: true },
            })) as any;

            expect(fetchedSession).toBeDefined();
            expect(fetchedSession.id).toBe(session.id);
            expect(typeof fetchedSession.userId).toBe("string");
            expect(typeof fetchedSession.user).toBe("object");
            expect(fetchedSession.user.name).toBe("Join User");
          },

        "[08] Joins (FETCH) in findMany: should populate referenced records for multiple results":
          async () => {
            const prefix = Date.now();
            for (let i = 1; i <= 2; i++) {
              const u = await adapter.create({
                model: "user",
                data: {
                  name: `User ${i}`,
                  email: `many-${i}-${prefix}@t.com`,
                  emailVerified: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              });
              await adapter.create({
                model: "session",
                data: {
                  userId: u.id,
                  token: `m-${i}-${prefix}`,
                  expiresAt: new Date(Date.now() + 10000),
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              });
            }

            const results = (await adapter.findMany({
              model: "session",
              where: [{ field: "token", operator: "contains", value: String(prefix) }],
              join: { user: true },
            })) as any[];

            expect(results.length).toBe(2);
            for (const session of results) {
              expect(typeof session.userId).toBe("string");
              expect(typeof session.user).toBe("object");
              expect(session.user.id).toBe(session.userId);
            }
          },
      };
    });
  };
};

import { expect } from "vitest";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { Session, User } from "better-auth";

/**
 * A collection of standard adapter tests adapted from the internal Better-Auth requirements.
 * These tests verify basic CRUD operations, operator logic, and SurrealDB specific ID handling.
 */
export const crudTestSuite = createTestSuite("CRUD Test Suite", {}, ({ adapter }) => {
  /**
   * Helper function to seed a user record for testing.
   * @param overrides - Optional fields to override the default test user data.
   */
  const createUser = async (overrides = {}) => {
    return await adapter.create({
      model: "user",
      data: {
        name: "user",
        email: "user@email.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      },
    });
  };

  return {
    /**
     * Verifies that a model can be created and returns the correct data.
     */
    "[01] create model": async () => {
      const res = await createUser();
      expect(res).toHaveProperty("id");
      expect(res.name).toBe("user");
      expect(res.email).toBe("user@email.com");
    },

    /**
     * Ensures that the adapter automatically generates a string ID if none is provided.
     */
    "[02] create model should always return an id": async () => {
      const res = await createUser({
        name: "test-name-without-id",
        email: "test-email-without-id@email.com",
      });
      expect(res).toHaveProperty("id");
      expect(typeof res.id).toBe("string");
    },

    /**
     * Verifies that findOne can retrieve a record by its primary ID.
     */
    "[03] find model": async () => {
      const user = await createUser();
      const res: User | null = await adapter.findOne({
        model: "user",
        where: [{ field: "id", value: user.id }],
      });
      expect(res?.name).toBe(user.name);
      expect(res?.email).toBe(user.email);
    },

    /**
     * Verifies that findOne can retrieve a record using a non-ID field (email).
     */
    "[04] find model without id": async () => {
      const user = await createUser({ email: "unique@email.com" });
      const res: User | null = await adapter.findOne({
        model: "user",
        where: [{ field: "email", value: user.email }],
      });
      expect(res?.name).toBe(user.name);
    },

    /**
     * Verifies that the 'select' option correctly restricts the returned fields.
     */
    "[05] find model with select": async () => {
      const user = await createUser({ email: "select@email.com" });
      const res: User | null = await adapter.findOne({
        model: "user",
        where: [{ field: "id", value: user.id }],
        select: ["email"],
      });
      expect(res).toEqual({ email: user.email });
    },

    /**
     * Verifies that an existing record can be updated.
     */
    "[06] update model": async () => {
      const user = await createUser();
      const newEmail = "updated@email.com";
      const res: User | null = await adapter.update({
        model: "user",
        where: [{ field: "id", value: user.id }],
        update: { email: newEmail },
      });
      expect(res?.email).toBe(newEmail);
    },

    /**
     * Verifies that findMany returns multiple records.
     */
    "[07] should find many": async () => {
      await createUser();
      await createUser({ email: "another@email.com" });
      const res: User[] = await adapter.findMany({ model: "user" });
      expect(res.length).toBeGreaterThan(0);
    },

    /**
     * Verifies findMany filtering using equality.
     */
    "[08] should find many with where": async () => {
      const user2 = await createUser({ name: "user2", email: "test2@email.com" });
      const res: User[] = await adapter.findMany({
        model: "user",
        where: [{ field: "id", value: user2.id }],
      });
      expect(res.length).toBe(1);
    },

    /**
     * Verifies the 'in' operator for findMany.
     */
    "[09] should find many with operators": async () => {
      const u1 = await createUser({ email: "op1@email.com" });
      const u2 = await createUser({ email: "op2@email.com" });
      const res = await adapter.findMany({
        model: "user",
        where: [{ field: "id", operator: "in", value: [u1.id, u2.id] }],
      });
      expect(res.length).toBe(2);
    },

    /**
     * Verifies the 'not_in' operator for findMany.
     */
    "[10] should find many with not in operator": async () => {
      const u1 = await createUser({ email: "notin1@email.com" });
      const u2 = await createUser({ email: "notin2@email.com" });
      const allUsers = await adapter.findMany({ model: "user" });

      const filteredUsers = await adapter.findMany({
        model: "user",
        where: [{ field: "id", operator: "not_in", value: [u1.id, u2.id] }],
      });
      expect(filteredUsers.length).toBe(allUsers.length - 2);
    },

    /**
     * Verifies that relationships between tables (Session -> User) work using RecordIds.
     */
    "[11] should work with reference fields": async () => {
      const user = await createUser();
      const session = await adapter.create({
        model: "session",
        data: {
          token: "mocked-token-" + Date.now(),
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: user.id,
          expiresAt: new Date(),
        },
      });
      const resUserId: Session | null = await adapter.findOne({
        model: "session",
        where: [{ field: "userId", value: user.id }],
      });
      const resToken: Session | null = await adapter.findOne({
        model: "session",
        where: [{ field: "token", value: session.token }],
      });

      expect(resUserId?.userId).toBe(user.id);
      expect(resToken?.userId).toBe(user.id);
    },

    /**
     * Verifies that the 'sortBy' option correctly orders returned records.
     */
    "[12] should find many with sortBy": async () => {
      await createUser({ name: "a_sorted", email: "sorted1@email.com" });
      await createUser({ name: "b_sorted", email: "sorted2@email.com" });
      const res: User[] = await adapter.findMany({
        model: "user",
        sortBy: { field: "name", direction: "asc" },
      });
      const sortedNames = res.map((r) => r.name).filter((n) => n?.includes("_sorted"));
      expect(sortedNames[0]).toBe("a_sorted");
    },

    /**
     * Verifies pagination: limit.
     */
    "[13] should find many with limit": async () => {
      await createUser({ email: "limit1@email.com" });
      await createUser({ email: "limit2@email.com" });
      const res: User[] = await adapter.findMany({ model: "user", limit: 1 });
      expect(res.length).toBe(1);
    },

    /**
     * Verifies pagination: offset.
     */
    "[14] should find many with offset": async () => {
      await createUser({ email: "offset1@email.com" });
      await createUser({ email: "offset2@email.com" });
      await createUser({ email: "offset3@email.com" });
      const all: User[] = await adapter.findMany({ model: "user" });
      const res: User[] = await adapter.findMany({ model: "user", offset: 2 });
      expect(res.length).toBe(all.length - 2);
    },

    /**
     * Verifies updating multiple records using complex where conditions.
     */
    "[15] should update with multiple where": async () => {
      const user = await createUser({ email: "multi@email.com" });
      await adapter.updateMany({
        model: "user",
        where: [
          { field: "name", value: user.name },
          { field: "email", value: user.email },
        ],
        update: { email: "multi-where-updated@email.com" },
      });
      const updatedUser: User | null = await adapter.findOne({
        model: "user",
        where: [{ field: "email", value: "multi-where-updated@email.com" }],
      });
      expect(updatedUser?.name).toBe(user.name);
    },

    /**
     * Verifies bulk deletion using filters.
     */
    "[16] should delete many": async () => {
      for (const i of [1, 2]) {
        await createUser({ name: "to-be-deleted", email: `tbd-${i}@email.com` });
      }
      await adapter.deleteMany({
        model: "user",
        where: [{ field: "name", value: "to-be-deleted" }],
      });
      const res: User[] = await adapter.findMany({
        model: "user",
        where: [{ field: "name", value: "to-be-deleted" }],
      });
      expect(res.length).toBe(0);
    },

    /**
     * Verifies that a single record can be deleted.
     */
    "[17] delete model": async () => {
      const user = await createUser({ email: "delete@email.com" });
      await adapter.delete({
        model: "user",
        where: [{ field: "id", value: user.id }],
      });
      const res: User | null = await adapter.findOne({
        model: "user",
        where: [{ field: "id", value: user.id }],
      });
      expect(res).toBeNull();
    },

    /**
     * Ensures that attempting to delete a non-existent record does not throw an error.
     */
    "[18] shouldn't throw on delete record not found": async () => {
      await expect(
        adapter.delete({
          model: "user",
          where: [{ field: "id", value: "not-found-id-123" }],
        }),
      ).resolves.not.toThrow();
    },

    /**
     * Verifies the 'starts_with' string operator.
     */
    "[19] should search users with startsWith": async () => {
      await createUser({ name: "user_starts", email: "starts@email.com" });
      const res: User[] = await adapter.findMany({
        model: "user",
        where: [{ field: "name", operator: "starts_with", value: "us" }],
      });
      expect(res.length).toBeGreaterThanOrEqual(1);
    },

    /**
     * Verifies the 'ends_with' string operator.
     */
    "[20] should search users with endsWith": async () => {
      await createUser({ name: "user_ends", email: "ends@email.com" });
      const res: User[] = await adapter.findMany({
        model: "user",
        where: [{ field: "name", operator: "ends_with", value: "nds" }],
      });
      expect(res.length).toBeGreaterThanOrEqual(1);
    },

    /**
     * Verifies the 'contains' string operator.
     */
    "[21] should find many with contains operator": async () => {
      await createUser({ name: "user_contains", email: "contains@email.com" });
      const res: User[] = await adapter.findMany({
        model: "user",
        where: [{ field: "name", operator: "contains", value: "r_conta" }],
      });
      expect(res.length).toBeGreaterThanOrEqual(1);
    },

    /**
     * Verifies that if an ID is passed in the data object, it is ignored and overwritten
     * by the adapter's ID generator (when allowPassingId is not enabled).
     */
    "[22] should ignore passed id and generate a new one if allowPassingId is not true":
      async () => {
        const manualId = "user:manual_id_to_ignore";
        const res: User = await adapter.create({
          model: "user",
          data: {
            id: manualId,
            name: "Overwritten User",
            email: "overwrite@test.com",
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        expect(res.id).not.toBe(manualId);
        expect(typeof res.id).toBe("string");
        expect(res.id).toContain("user:");
      },
  };
});

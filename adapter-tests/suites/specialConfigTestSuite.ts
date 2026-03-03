import { expect } from "vitest";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { User } from "better-auth";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("qwertyuiuoasdfghjklzxcvbnm");

export const specialConfigTestSuite = createTestSuite(
  "SurrealDB Adapter - Special Configurations",
  {
    alwaysMigrate: true,
    defaultBetterAuthOptions: {
      user: {
        fields: {
          email: "email_address",
        },
        additionalFields: {
          hakunamatata: {
            type: "string",
            input: true,
            required: false,
          },
        },
      },
      advanced: {
        database: {
          generateId: () => "generateId_generated_" + nanoid(),
        },
      },

      database: {},
    },
  },
  ({ adapter, getAuth, getBetterAuthOptions }) => {
    return {
      "[setup] create specific configuration schema": async () => {
        const auth = await getAuth();
        const ctx = await auth.$context;
        const options = getBetterAuthOptions();
        const schema = await ctx?.adapter?.createSchema?.(options);
        console.log({ specialConfigTestSuite: { options: JSON.stringify(options), schema } });
      },
      "[01] find model with modified field name": async () => {
        const testEmail = `modified-${Date.now()}@test.com`;

        const createdUser = await adapter.create({
          model: "user",
          data: {
            name: "Mapped User",
            email: testEmail,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        const foundUser: User | null = await adapter.findOne({
          model: "user",
          where: [{ field: "email", value: testEmail }],
        });

        expect(foundUser).not.toBeNull();
        expect(foundUser?.email).toBe(testEmail);
        expect(foundUser?.id).toBe(createdUser.id);
      },

      "[02] shouldn't throw on record not found": async () => {
        const result = await adapter.findOne({
          model: "user",
          where: [{ field: "id", value: "user:non_existent_id_999" }],
        });

        expect(result).toBeNull();
      },

      "[03] should prefer generateId over regular better-auth generated id": async () => {
        const res = await adapter.create({
          model: "user",
          data: {
            name: "Custom Generator User",
            email: `gen-${Date.now()}@test.com`,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // The adapter logic should detect the generator and ensure
        // a valid string ID is returned from SurrealDB.
        expect(res.id).toBeDefined();
        expect(typeof res.id).toBe("string");
        expect(res.id).toContain("user:");
        expect(res.id).contains("user:generateId_generated_");
      },
    };
  },
);

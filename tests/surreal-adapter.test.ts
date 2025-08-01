import { beforeAll, describe, expect, it } from "bun:test";
import { surrealAdapter } from "../src";
import { getDatabase } from "../db/surreal";
import { runAdapterTest } from "./runAdapterTest";
import { getTestInstance } from "./testInstance";

describe("adapter test", async () => {
  const db = await getDatabase();

  async function setupDB() {
    await db.query(
      `
      DEFINE NAMESPACE IF NOT EXISTS better_auth;
      DEFINE DATABASE IF NOT EXISTS better_auth;
      DELETE user;
      DELETE sessions;
      `,
    );
  }

  beforeAll(async () => {
    await setupDB();
  });

  const adapter = surrealAdapter(db);
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
  });
});

describe("simple-flow", async () => {
  const { auth, client, sessionSetter } = await getTestInstance(
    {},
    {
      disableTestUser: true,
      testWith: "surreal",
    },
  );
  const testUser = {
    email: "test@email.com",
    password: "password",
    name: "Test Name",
  };

  it("should sign up", async () => {
    const user = await auth.api.signUpEmail({
      body: testUser,
    });
    expect(user).toBeDefined();
  });

  it("should sign in", async () => {
    const user = await auth.api.signInEmail({
      body: testUser,
    });
    expect(user).toBeDefined();
  });

  it("should get session", async () => {
    const headers = new Headers();
    await client.signIn.email(
      {
        email: testUser.email,
        password: testUser.password,
      },
      {
        onSuccess: sessionSetter(headers),
      },
    );
    const { data: session } = await client.getSession({
      fetchOptions: { headers },
    });
    expect(session?.user).toBeDefined();
  });
});

import { afterAll } from "bun:test";
import type { SuccessContext } from "@better-fetch/fetch";
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { parseSetCookieHeader } from "better-auth/cookies";
import { getAdapter } from "better-auth/db";
import type {
  BetterAuthOptions,
  ClientOptions,
  Session,
  User,
} from "better-auth/types";

import { getBaseURL } from "../utlis/getBaseURL";

import { surrealAdapter } from "..";
import { getDatabase } from "../db/surreal";

export async function getTestInstance<
  O extends Partial<BetterAuthOptions>,
  C extends ClientOptions,
>(
  options?: O,
  config?: {
    clientOptions?: C;
    port?: number;
    disableTestUser?: boolean;
    testUser?: Partial<User>;
    testWith?: "surreal";
  },
) {
  const db = await getDatabase({
    url: "http://127.0.0.1:8000/rpc",
    namespace: "better_auth_test",
    database: "better_auth_test",
    auth: { username: "root", password: "root" },
  });

  const opts = {
    socialProviders: {
      github: {
        clientId: "test",
        clientSecret: "test",
      },
      google: {
        clientId: "test",
        clientSecret: "test",
      },
    },
    secret: "better-auth.secret",
    database: surrealAdapter(db),
    emailAndPassword: {
      enabled: true,
    },
    rateLimit: {
      enabled: false,
    },
    advanced: {
      cookies: {},
    },
  } satisfies BetterAuthOptions;

  const auth = betterAuth({
    baseURL: `http://localhost:${config?.port || 3000}`,
    ...opts,
    ...options,
    advanced: {
      disableCSRFCheck: true,
      ...options?.advanced,
    },
  } as O extends undefined ? typeof opts : O & typeof opts);

  const testUser = {
    email: "test@test.com",
    password: "test123456",
    name: "test user",
    ...config?.testUser,
  };
  async function createTestUser() {
    if (config?.disableTestUser) {
      return;
    }
    //@ts-expect-error
    await auth.api.signUpEmail({
      body: testUser,
    });
  }

  await createTestUser();

  afterAll(async () => {
    await db.query("DELETE account; DELETE session; DELETE user;");
    return;
  });

  async function signInWithTestUser() {
    if (config?.disableTestUser) {
      throw new Error("Test user is disabled");
    }
    const headers = new Headers();
    const setCookie = (name: string, value: string) => {
      const current = headers.get("cookie");
      headers.set("cookie", `${current || ""}; ${name}=${value}`);
    };
    //@ts-expect-error
    const { data } = await client.signIn.email({
      email: testUser.email,
      password: testUser.password,

      fetchOptions: {
        // @ts-expect-error
        onSuccess(context) {
          const header = context.response.headers.get("set-cookie");
          const cookies = parseSetCookieHeader(header || "");
          const signedCookie = cookies.get("better-auth.session_token")?.value;
          headers.set("cookie", `better-auth.session_token=${signedCookie}`);
        },
      },
    });
    return {
      session: data.session as Session,
      user: data.user as User,
      headers,
      setCookie,
    };
  }
  async function signInWithUser(email: string, password: string) {
    const headers = new Headers();
    //@ts-expect-error
    const { data } = await client.signIn.email({
      email,
      password,
      fetchOptions: {
        //@ts-expect-error
        onSuccess(context) {
          const header = context.response.headers.get("set-cookie");
          const cookies = parseSetCookieHeader(header || "");
          const signedCookie = cookies.get("better-auth.session_token")?.value;
          headers.set("cookie", `better-auth.session_token=${signedCookie}`);
        },
      },
    });
    return {
      res: data as {
        user: User;
        session: Session;
      },
      headers,
    };
  }

  const customFetchImpl = async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const req = new Request(url.toString(), init);
    return auth.handler(req);
  };

  function sessionSetter(headers: Headers) {
    return (context: SuccessContext) => {
      const header = context.response.headers.get("set-cookie");
      if (header) {
        const cookies = parseSetCookieHeader(header || "");
        const signedCookie = cookies.get("better-auth.session_token")?.value;
        headers.set("cookie", `better-auth.session_token=${signedCookie}`);
      }
    };
  }
  function cookieSetter(headers: Headers) {
    return (context: { response: Response }) => {
      const setCookieHeader = context.response.headers.get("set-cookie");
      if (!setCookieHeader) {
        return;
      }

      const cookieMap = new Map<string, string>();

      const existingCookiesHeader = headers.get("cookie") || "";
      existingCookiesHeader.split(";").forEach((cookie) => {
        const [name, ...rest] = cookie.trim().split("=");
        if (name && rest.length > 0) {
          cookieMap.set(name, rest.join("="));
        }
      });

      const setCookieHeaders = setCookieHeader.split(",");
      setCookieHeaders.forEach((header) => {
        const cookies = parseSetCookieHeader(header);
        cookies.forEach((value, name) => {
          cookieMap.set(name, value.value);
        });
      });

      const updatedCookies = Array.from(cookieMap.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
      headers.set("cookie", updatedCookies);
    };
  }
  const client = createAuthClient({
    ...(config?.clientOptions as C extends undefined ? {} : C),
    baseURL: getBaseURL(
      options?.baseURL || "http://localhost:" + (config?.port || 3000),
      options?.basePath || "/api/auth",
    ),
    fetchOptions: {
      customFetchImpl,
    },
  });
  return {
    auth,
    client,
    testUser,
    signInWithTestUser,
    signInWithUser,
    cookieSetter,
    customFetchImpl,
    sessionSetter,
    db: await getAdapter(auth.options),
  };
}

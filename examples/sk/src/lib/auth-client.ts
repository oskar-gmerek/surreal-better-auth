import { createAuthClient } from "better-auth/svelte";
import {
  adminClient,
  inferAdditionalFields,
  inferOrgAdditionalFields,
  organizationClient,
  usernameClient,
} from "better-auth/client/plugins";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [
    inferAdditionalFields<typeof auth>(),
    adminClient({}),
    usernameClient(),
    organizationClient({
      schema: {
        organization: {
          additionalFields:
            inferOrgAdditionalFields<typeof auth>().organization
              ?.additionalFields,
        },
        team: {
          additionalFields:
            inferOrgAdditionalFields<typeof auth>().team?.additionalFields,
        },
      },
      teams: {
        enabled: true,
      },
    }),
  ],
});
export const { signIn, signUp, useSession } = authClient;

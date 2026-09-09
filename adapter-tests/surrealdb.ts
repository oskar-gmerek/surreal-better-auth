import { Surreal } from "surrealdb";
import { WebSocket } from "ws";
import { inject } from "vitest";
import { assertOwnedEndpoint } from "./ownedSurreal";
import type {} from "./globalSetup";

let adapter: Promise<Surreal> | undefined;
let bootstrap: Promise<Surreal> | undefined;
async function connect(role: "adapterAuth" | "bootstrapAuth") {
  const owned = inject("surreal");
  if (!owned) throw new Error("Run adapter tests with their owned global setup");
  assertOwnedEndpoint(owned.endpoint, Number(new URL(owned.endpoint).port));
  const db = new Surreal({ websocketImpl: WebSocket as any });
  try {
    await db.connect(owned.endpoint, { reconnect: false });
    await db.signin(owned[role]);
    await db.use({ namespace: owned.namespace, database: owned.database });
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
export const getTestSurrealInstance = () => (adapter ??= connect("adapterAuth"));
export const getTestBootstrapInstance = () => (bootstrap ??= connect("bootstrapAuth"));
export const closeTestSurrealInstance = async () => {
  await Promise.allSettled([adapter, bootstrap].map(async (client) => (await client)?.close()));
  adapter = bootstrap = undefined;
};

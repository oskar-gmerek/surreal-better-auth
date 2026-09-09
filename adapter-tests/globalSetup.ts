import type { TestProject } from "vitest/node";
import { startOwnedSurreal } from "./ownedSurreal";

export default async function setup(project: TestProject) {
  const owned = await startOwnedSurreal();
  try {
    project.provide("surreal", {
      endpoint: owned.endpoint,
      namespace: owned.namespace,
      database: owned.database,
      adapterAuth: owned.adapterAuth,
      bootstrapAuth: owned.bootstrapAuth,
    });
  } catch (error) {
    await owned.close();
    throw error;
  }
  // The coordinator owns teardown even when collection fails or all tests are filtered out.
  return () => owned.close();
}

declare module "vitest" {
  export interface ProvidedContext {
    surreal: Pick<
      Awaited<ReturnType<typeof startOwnedSurreal>>,
      "endpoint" | "namespace" | "database" | "adapterAuth" | "bootstrapAuth"
    >;
  }
}

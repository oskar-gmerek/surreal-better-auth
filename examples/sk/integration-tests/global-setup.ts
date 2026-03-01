import type { FullConfig } from "@playwright/test";
import { escapeIdent, Surreal } from "surrealdb";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

async function globalSetup(_config: FullConfig) {
  console.log("🚀 Setting up test environment...");
  if (!process.env.CI) {
    console.log("🌐 Checking for Playwright browsers (chromium)...");
    try {
      execSync("bunx playwright install chromium", { stdio: "ignore" });
      // oxlint-disable-next-line
    } catch (error) {
      console.warn(
        "⚠️ Failed to auto-install browsers. You might need to run 'bunx playwright install' manually.",
      );
    }
  }

  process.env.BETTER_AUTH_SECRET =
    process.env.BETTER_AUTH_SECRET || "static-test-secret-at-least-32-chars-long";
  process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const db = new Surreal();

  try {
    const surrealUrl = process.env.SURREALDB_URL || "ws://127.0.0.1:8000/rpc";
    const surrealUser = process.env.SURREALDB_USER || "root";
    const surrealPass = process.env.SURREALDB_PASS || "root";
    const surrealNs = process.env.SURREALDB_NS || "test";
    const surrealDb = process.env.SURREALDB_DB || "example-sveltekit";

    await db.connect(surrealUrl);
    console.log(`✅ Connected to ${surrealUrl}!`);
    await db.signin({ username: surrealUser, password: surrealPass });
    await db.use({ namespace: surrealNs, database: surrealDb });

    console.log("📊 Setting up database schema...");
    console.log("🧹 Wiping the entire database for a clean slate...");
    await db.query(`REMOVE DATABASE ${escapeIdent(surrealDb)};`);
    await db.query(`DEFINE DATABASE ${escapeIdent(surrealDb)};`);
    await db.use({ namespace: surrealNs, database: surrealDb });

    // Load schema from file or generate it
    const schemaPath = join(process.cwd(), "schema.surql");
    let schemaContent: string;

    if (existsSync(schemaPath)) {
      console.log("📄 Loading schema from schema.surql...");
      schemaContent = readFileSync(schemaPath, "utf-8");
    } else {
      console.log("📝 Schema file not found, generating with Better Auth CLI...");
      try {
        execSync("bunx @better-auth/cli generate --yes", {
          stdio: "inherit",
          cwd: process.cwd(),
        });

        if (existsSync(schemaPath)) {
          console.log("✅ Schema generated successfully!");
          schemaContent = readFileSync(schemaPath, "utf-8");
        } else {
          throw new Error("Schema generation completed but schema.surql file was not created");
        }
      } catch (error) {
        console.error("❌ Failed to generate schema with Better Auth CLI:", error);
        throw new Error(
          'Could not generate database schema. Please run "bunx @better-auth/cli generate" manually.',
        );
      }
    }

    // Apply schema to database
    await db.import(schemaContent);

    console.log(await db.query("INFO FOR DB;"));

    // console.log("🧹 Ensuring clean test environment...");

    // // Extract table names from schema and clean them
    // const tableNames = extractTableNames(schemaContent);

    // for (const tableName of tableNames) {
    //   try {
    //     await db.query(`DELETE ${tableName}`);
    //   } catch (error) {
    //     // Ignore errors for non-existent tables
    //   }
    // }

    // console.log(`🗑️ Cleaned ${tableNames.length} tables: ${tableNames.join(", ")}`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("✅ Test environment setup complete!");
  } catch (error) {
    console.error("❌ Failed to setup test environment:", error);
    throw error;
  } finally {
    await db.close();
  }
}

/**
 * Extracts table names from SurrealDB schema content
 */
function extractTableNames(schemaContent: string): string[] {
  const tableRegex = /DEFINE TABLE (?:OVERWRITE )?(\w+)/g;
  const tables = new Set<string>();
  let match: RegExpExecArray | null;
  while (true) {
    match = tableRegex.exec(schemaContent);
    if (match === null) {
      break;
    }
    tables.add(match[1]);
  }

  //   while ((match = tableRegex.exec(schemaContent)) !== null) {
  //     tables.add(match[1]);
  //   }

  return Array.from(tables);
}

export default globalSetup;

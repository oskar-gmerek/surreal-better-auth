import Surreal from "surrealdb";

// Define the database configuration interface
interface DatabaseConfig {
  url: string;
  namespace: string;
  database: string;
  auth: {
    username: string;
    password: string;
  };
}

// Define the default database configuration
const DEFAULT_CONFIG: DatabaseConfig = {
  url: "http://127.0.0.1:8000/rpc",
  namespace: "better_auth",
  database: "better_auth",
  auth: {
    username: "root",
    password: "root",
  },
};

// Define the function to get the database instance
export async function getDatabase(
  config: DatabaseConfig = DEFAULT_CONFIG,
): Promise<Surreal> {
  const db = new Surreal();

  try {
    await db.connect(config.url, {
      namespace: config.namespace,
      database: config.database,
      auth: { username: config.auth.username, password: config.auth.password },
    });
    return db;
  } catch (err) {
    console.error(
      "Failed to connect to SurrealDB:",
      err instanceof Error ? err.message : String(err),
    );
    await db.close();
    throw err;
  }
}

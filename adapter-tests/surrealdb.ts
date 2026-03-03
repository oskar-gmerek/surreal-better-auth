import { escapeIdent, Surreal } from "surrealdb";

let db: Surreal;

export const getTestSurrealInstance = async () => {
  if (!db) {
    db = new Surreal();
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    const surrealNS = "test";
    const surrealDB = "suite";
    await db.connect("ws://127.0.0.1:8000/rpc");
    await db.signin({ username: "root", password: "root" });
    await db.use({ namespace: surrealNS, database: surrealDB });
    await db.query(`REMOVE DATABASE ${escapeIdent(surrealDB)};`);
    await db.query(`DEFINE DATABASE ${escapeIdent(surrealDB)};`);
  }
  return db;
};

import { afterAll, beforeAll, describe, expect, Test, test } from "bun:test";
import { surrealAdapter, SurrealBetterAuthConfig } from "../src";
import { getDatabase } from "../db/surreal";
import { BetterAuthOptions } from "better-auth/types";
import { runAdapterTest } from "./runAdapterTest";
import Surreal from "surrealdb";

// Autocleans after each test, if you are debugging, you may wish this is false
const cleanAfterAll = true;

function getTestSchemaAdapter(db: Surreal, config?: SurrealBetterAuthConfig) {
  const adapterFunc = surrealAdapter(db, config);
  const opts: BetterAuthOptions = {
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
  }
  const adapter = adapterFunc(opts)

  if (!adapter.createSchema) {
    throw new Error("create schema should be defined");
  }

  return {
    adapter,
    opts,
  }
}

describe("no config", async () => {
  const database = `better_auth_test_no_config`
  const db = await getDatabase({
    url: "http://127.0.0.1:8000/rpc",
    namespace: "better_auth",
    database,
    auth: {
      username: "root",
      password: "root",
    },
  });
  const { adapter, opts } = getTestSchemaAdapter(db);

  beforeAll(async () => {
    await db.query(`
      DEFINE NAMESPACE IF NOT EXISTS better_auth;
      REMOVE DATABASE IF EXISTS ${database};
      DEFINE DATABASE IF NOT EXISTS ${database};
    `);
  });

  afterAll(async () => {
    if (cleanAfterAll) {
      await db.query(`REMOVE DATABASE IF EXISTS ${database};`)
    }
  })

  test("schema generation", async () => {
    const schema = await adapter.createSchema!(opts)

    expect(schema.code.length).toBeGreaterThan(0);
    expect(schema.code).toContain("DEFINE FIELD email_address ON TABLE user");
    expect(schema.code).toContain("DEFINE FIELD test ON TABLE user");
    expect(schema.code).toContain("DEFINE TABLE sessions");

    // Add schema to db
    await db.query(schema.code)
  })

  // Adapter should still run
  await runAdapterTest({
    getAdapter: async () => adapter
  })
});

describe("generate - overwrite", async () => {
  const database = `better_auth_test_overwrite_schema`
  const db = await getDatabase({
    url: "http://127.0.0.1:8000/rpc",
    namespace: "better_auth",
    database,
    auth: {
      username: "root",
      password: "root",
    },
  });

  beforeAll(async () => {
    await db.query(`
      DEFINE NAMESPACE IF NOT EXISTS better_auth;
      REMOVE DATABASE IF EXISTS ${database};
      DEFINE DATABASE IF NOT EXISTS ${database};
    `);
  });

  afterAll(async () => {
    if (cleanAfterAll) {
      await db.query(`REMOVE DATABASE IF EXISTS ${database};`)
    }
  })

  test("schema without overwrite", async () => {
    const { adapter, opts } = getTestSchemaAdapter(db);

    const schema = await adapter.createSchema!(opts)

    expect(schema.code.length).toBeGreaterThan(0);
    expect(schema.code).not.toContain("DEFINE FIELD OVERWRITE");
    expect(schema.code).not.toContain("DEFINE TABLE OVERWRITE");

    await db.query(schema.code);
  })

  test("schema overwriten", async () => {
    const { adapter, opts } = getTestSchemaAdapter(db, {
      generate: {
        overwrite: true,
      }
    });

    const schema = await adapter.createSchema!(opts)

    expect(schema.code.length).toBeGreaterThan(0);
    const pattern = /^(?!.*\bDEFINE (FIELD|TABLE)\b(?! OVERWRITE)).*\bDEFINE (FIELD|TABLE) OVERWRITE\b.*$/s;
    expect(pattern.test(schema.code)).toBeTrue();

    // Shall overwrite the schema in test 1
    await db.query(schema.code);
  })
});

describe("generate - enable records", async () => {
  const database = `better_auth_test_enableRecords`
  const db = await getDatabase({
    url: "http://127.0.0.1:8000/rpc",
    namespace: "better_auth",
    database,
    auth: {
      username: "root",
      password: "root",
    },
  });
  const { adapter, opts } = getTestSchemaAdapter(db, {
    enableRecords: true,
  });

  beforeAll(async () => {
    await db.query(`
      DEFINE NAMESPACE IF NOT EXISTS better_auth;
      REMOVE DATABASE IF EXISTS ${database};
      DEFINE DATABASE IF NOT EXISTS ${database};
    `);
  });

  afterAll(async () => {
    if (cleanAfterAll) {
      await db.query(`REMOVE DATABASE IF EXISTS ${database};`)
    }
  })

  test("schema generation", async () => {
    const schema = await adapter.createSchema!(opts)

    expect(schema.code.length).toBeGreaterThan(0);
    expect(schema.code).toContain("DEFINE FIELD email_address ON TABLE user");
    expect(schema.code).toContain("DEFINE FIELD test ON TABLE user");
    expect(schema.code).toContain("DEFINE TABLE sessions");

    // Add schema to db
    await db.query(schema.code)
  })

  // Adapter should still run
  await runAdapterTest({
    getAdapter: async () => adapter
  })
});

describe("generate - enable records, disable on delete references", async () => {
  const database = `better_auth_test_enableRecords_disableOnDeleteReference`
  const db = await getDatabase({
    url: "http://127.0.0.1:8000/rpc",
    namespace: "better_auth",
    database,
    auth: {
      username: "root",
      password: "root",
    },
  });
  const { adapter, opts } = getTestSchemaAdapter(db, {
    enableRecords: true,
    generate: {
      disableOnDeleteReference: true,
    }
  });

  beforeAll(async () => {
    await db.query(`
      DEFINE NAMESPACE IF NOT EXISTS better_auth;
      REMOVE DATABASE IF EXISTS ${database};
      DEFINE DATABASE IF NOT EXISTS ${database};
    `);
  });

  afterAll(async () => {
    if (cleanAfterAll) {
      await db.query(`REMOVE DATABASE IF EXISTS ${database};`)
    }
  })

  test("schema generation", async () => {
    const schema = await adapter.createSchema!(opts)

    expect(schema.code.length).toBeGreaterThan(0);
    expect(schema.code).toContain("DEFINE FIELD email_address ON TABLE user");
    expect(schema.code).toContain("DEFINE FIELD test ON TABLE user");
    expect(schema.code).toContain("DEFINE TABLE sessions");

    // Add schema to db
    await db.query(schema.code)
  })

  // Adapter should still run
  await runAdapterTest({
    getAdapter: async () => adapter
  })
});

describe.each([
  's', 'ms', false
])("generate - roundDefaultTime %p", async (roundDefaultTime) => {
  const database = `better_auth_test_roundDefaultTime_${roundDefaultTime.toString()}`
  const db = await getDatabase({
    url: "http://127.0.0.1:8000/rpc",
    namespace: "better_auth",
    database,
    auth: {
      username: "root",
      password: "root",
    },
  });
  const { adapter, opts } = getTestSchemaAdapter(db, {
    generate: {
      roundDefaultTime: roundDefaultTime as 's' | 'ms' | false | undefined,
    }
  });

  beforeAll(async () => {
    await db.query(`
      DEFINE NAMESPACE IF NOT EXISTS better_auth;
      REMOVE DATABASE IF EXISTS ${database};
      DEFINE DATABASE IF NOT EXISTS ${database};
    `);
  });

  afterAll(async () => {
    if (cleanAfterAll) {
      await db.query(`REMOVE DATABASE IF EXISTS ${database};`)
    }
  })

  test("schema generation", async () => {
    const schema = await adapter.createSchema!(opts)

    if (roundDefaultTime) {
      expect(schema.code).toContain(`time::round(time::now(), 1${roundDefaultTime})`)
    } else {
      expect(schema.code).toContain("time::now()")
    }

    // Check createdAt, updatedAt, and expiresAt 
    if (roundDefaultTime === false) {
      expect(schema.code).toContain("DEFINE FIELD createdAt ON TABLE user TYPE datetime VALUE time::now() READONLY;");
      expect(schema.code).toContain("DEFINE FIELD updatedAt ON TABLE user TYPE datetime VALUE time::now();");
      expect(schema.code).toContain("DEFINE FIELD expiresAt ON TABLE sessions TYPE datetime;"); // not applied
    } else {
      expect(schema.code).toContain(`DEFINE FIELD createdAt ON TABLE user TYPE datetime VALUE time::round(time::now(), 1${roundDefaultTime ?? 's'}) READONLY;`);
      expect(schema.code).toContain(`DEFINE FIELD updatedAt ON TABLE user TYPE datetime VALUE time::round(time::now(), 1${roundDefaultTime ?? 's'});`);
      expect(schema.code).toContain(`DEFINE FIELD expiresAt ON TABLE sessions TYPE datetime;`); // not applied
    }

    // Add schema to db
    await db.query(schema.code)
  })

  // Adapter should still run
  await runAdapterTest({
    getAdapter: async () => adapter
  })
})

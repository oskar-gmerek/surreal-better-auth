import { access } from "node:fs/promises";
import { RecordId } from "surrealdb";
import { expect, it } from "vitest";
import {
  acquireLegacyRecoveryFixture,
  restoreLegacyFixture,
  snapshotLegacyFixture,
} from "./legacyMigrationSnapshot";

it("rejects nonowned recovery contexts before any destructive query", async () => {
  let queries = 0;
  const unowned = { bootstrap: { query: () => queries++ } };
  await expect(
    restoreLegacyFixture(unowned as unknown as Parameters<typeof restoreLegacyFixture>[0]),
  ).rejects.toThrow("acquired legacy fixture");
  expect(queries).toBe(0);
});

it("cleans an acquired recovery fixture when rehearsal fails", async () => {
  const owned = await acquireLegacyRecoveryFixture();
  await expect(
    (async () => {
      try {
        await expect(restoreLegacyFixture(owned)).rejects.toThrow("fixture snapshot");
        await owned.bootstrap.query(
          "DEFINE TABLE user SCHEMAFULL; DEFINE TABLE account SCHEMAFULL;",
        );
        await snapshotLegacyFixture(owned);
        throw new Error("synthetic rehearsal failure");
      } finally {
        await owned.close();
      }
    })(),
  ).rejects.toThrow("synthetic rehearsal failure");
  await expect(access(owned.storage)).rejects.toThrow();
  await expect(restoreLegacyFixture(owned)).rejects.toThrow("acquired legacy fixture");
}, 30000);

it("restores a schema-inclusive export after partial credential conversion fails", async () => {
  const owned = await acquireLegacyRecoveryFixture();
  const legacy = new RecordId("user", " user:legacy:opaque ");
  const modern = new RecordId("user", "modern:opaque");
  const rows = () =>
    owned.adapter.query("SELECT * FROM user ORDER BY id; SELECT * FROM account ORDER BY id;");
  const schema = () => owned.bootstrap.query("INFO FOR TABLE user; INFO FOR TABLE account;");
  try {
    await owned.bootstrap.query(`
      DEFINE TABLE user SCHEMAFULL;
      DEFINE FIELD name ON user TYPE string;
      DEFINE TABLE account SCHEMAFULL;
      DEFINE FIELD providerId ON account TYPE string;
      DEFINE FIELD accountId ON account TYPE string | record<user>;
      DEFINE FIELD userId ON account TYPE record<user>;
      DEFINE INDEX provider_account ON account FIELDS providerId, accountId UNIQUE;
      DEFINE INDEX provider_user ON account FIELDS providerId, userId UNIQUE;
    `);
    await owned.adapter.query(
      `
      CREATE $legacy SET name = 'Legacy'; CREATE $modern SET name = 'Modern';
      CREATE account:legacy SET providerId = 'credential', accountId = $legacy, userId = $legacy;
      CREATE account:modern SET providerId = 'credential', accountId = $modern.id, userId = $modern;
      CREATE account:google SET providerId = 'google', accountId = 'google:subject', userId = $legacy;
    `,
      { legacy, modern },
    );
    const originalRows = await rows();
    const originalSchema = await schema();
    const snapshot = await snapshotLegacyFixture(owned);
    expect(snapshot).toContain("DEFINE TABLE");
    expect(snapshot).toContain("SCHEMAFULL");
    expect(snapshot).toContain("DEFINE FIELD");
    expect(snapshot).toContain("DEFINE INDEX");
    expect(snapshot).not.toMatch(/DEFINE USER|DEFINE ACCESS/);
    const partialConversion = async () => {
      await owned.adapter.query("UPDATE account:legacy SET accountId = $value;", {
        value: legacy.id,
      });
      // Failure is deliberately outside a transaction: an actual write must be undone.
      throw new Error("synthetic partial conversion failure");
    };
    await expect(partialConversion()).rejects.toThrow("synthetic partial conversion failure");
    expect(await rows()).not.toEqual(originalRows);
    // Also damage schema, so row replay alone cannot pass the recovery assertions.
    await owned.bootstrap.query(`
      REMOVE INDEX provider_account ON account;
      DEFINE FIELD OVERWRITE accountId ON account TYPE string;
    `);
    await restoreLegacyFixture(owned);
    expect(await schema()).toEqual(originalSchema);
    expect(await rows()).toEqual(originalRows);
    const [restored] = await owned.adapter.query<[{ accountId: RecordId; userId: RecordId }[]]>(
      "SELECT accountId, userId FROM account:legacy;",
    );
    for (const id of [restored[0].accountId, restored[0].userId]) {
      expect(id).toBeInstanceOf(RecordId);
      expect(id.table.name).toBe("user");
      expect(id.id).toBe(" user:legacy:opaque ");
      expect(typeof id.id).toBe("string");
    }
    // Existing authenticated EDITOR remains usable, and can authenticate again.
    await owned.adapter.signin(owned.adapterAuth);
    await expect(
      owned.adapter.query("DEFINE NAMESPACE forbidden_recovery_namespace;"),
    ).rejects.toThrow();
    await owned.adapter.query(
      `
      CREATE account:probe SET providerId = 'probe', accountId = $legacy, userId = $legacy;
    `,
      { legacy },
    );
    await expect(
      owned.adapter.query(
        `
      CREATE account:duplicate SET providerId = 'probe', accountId = $legacy, userId = $modern;
    `,
        { legacy, modern },
      ),
    ).rejects.toThrow();
    await expect(
      owned.adapter.query(
        `
      CREATE account:duplicate_user SET providerId = 'probe', accountId = 'different', userId = $legacy;
    `,
        { legacy },
      ),
    ).rejects.toThrow();
    await expect(owned.adapter.query("UPDATE account:probe SET accountId = 42;")).rejects.toThrow();
  } finally {
    await owned.close();
  }
  await expect(access(owned.storage)).rejects.toThrow();
  await expect(restoreLegacyFixture(owned)).rejects.toThrow("acquired legacy fixture");
}, 30000);

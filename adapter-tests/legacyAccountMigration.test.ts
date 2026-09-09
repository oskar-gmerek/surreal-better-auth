import { RecordId, StringRecordId } from "surrealdb";
import { expect, it } from "vitest";
import { surrealdbAdapter } from "../packages/surreal-better-auth/src/adapter";
import {
  migrateLegacyFixture,
  planLegacyAccounts,
  preflightLegacyAccounts,
  type LegacyAccountLayout,
} from "./legacyAccountMigration";
import { acquireLegacyRecoveryFixture, snapshotLegacyFixture } from "./legacyMigrationSnapshot";

for (const name of ["default", "mapped", "plural"] as const) {
  const mapped = name === "mapped";
  const layout: LegacyAccountLayout = {
    account: mapped ? "identity_login" : name === "plural" ? "accounts" : "account",
    user: mapped ? "identity_person" : name === "plural" ? "users" : "user",
    accountId: mapped ? "subject" : "accountId",
    providerId: mapped ? "provider" : "providerId",
    userId: mapped ? "owner" : "userId",
    uniqueKeys: [],
  };
  layout.uniqueKeys = [
    [layout.providerId, layout.accountId],
    [layout.providerId, "issuer"],
  ];
  const options = {
    user: { modelName: mapped ? layout.user : "user" },
    account: {
      modelName: mapped ? layout.account : "account",
      fields: {
        accountId: layout.accountId,
        providerId: layout.providerId,
        userId: layout.userId,
      },
    },
  };
  async function fixture() {
    const owned = await acquireLegacyRecoveryFixture(name);
    try {
      await owned.bootstrap.query(`
        DEFINE TABLE ${layout.user} SCHEMAFULL;
        DEFINE FIELD name ON ${layout.user} TYPE string;
        DEFINE TABLE ${layout.account} SCHEMAFULL;
        DEFINE FIELD ${layout.accountId} ON ${layout.account} TYPE string | record<${layout.user}>;
        DEFINE FIELD ${layout.providerId} ON ${layout.account} TYPE string;
        DEFINE FIELD ${layout.userId} ON ${layout.account} TYPE record<${layout.user}>;
        DEFINE FIELD issuer ON ${layout.account} TYPE string;
        DEFINE FIELD createdAt ON ${layout.account} TYPE option<datetime>;
        DEFINE FIELD updatedAt ON ${layout.account} TYPE option<datetime>;
        DEFINE INDEX provider_account ON ${layout.account} FIELDS ${layout.providerId}, ${layout.accountId} UNIQUE;
        DEFINE INDEX provider_issuer ON ${layout.account} FIELDS ${layout.providerId}, issuer UNIQUE;
      `);
      const legacy = new RecordId(layout.user, " user:legacy:opaque ");
      const modern = new RecordId(layout.user, "modern:opaque");
      await owned.bootstrap.query(
        "CREATE $legacy SET name = 'Legacy'; CREATE $modern SET name = 'Modern';",
        { legacy, modern },
      );
      const seed = async (
        id: string,
        value: unknown,
        provider: unknown = "credential",
        link: unknown = legacy,
        issuer = id,
      ) => {
        await owned.bootstrap.query("CREATE $id CONTENT $data", {
          id: new RecordId(layout.account, id),
          data: {
            [layout.accountId]: value,
            [layout.providerId]: provider,
            [layout.userId]: link,
            issuer,
          },
        });
      };
      await seed("legacy", legacy);
      await seed("modern", "modern:opaque", "credential", modern);
      await seed("google", " user:legacy:opaque ", "google");
      const rows = () =>
        owned.bootstrap.query(
          `SELECT * FROM ${layout.user} ORDER BY id; SELECT * FROM ${layout.account} ORDER BY id;`,
        );
      const schema = () =>
        owned.bootstrap.query(`INFO FOR TABLE ${layout.user}; INFO FOR TABLE ${layout.account};`);
      return { owned, legacy, modern, seed, rows, schema };
    } catch (error) {
      await owned.close();
      throw error;
    }
  }

  if (name === "default") {
    it("post-write validation rejects unintended row changes before narrowing and restores them", async () => {
      const { owned, rows, schema } = await fixture();
      try {
        const before = await rows();
        const beforeSchema = await schema();
        await expect(
          migrateLegacyFixture(owned, layout, async () => {
            await owned.bootstrap.query(
              `UPDATE ${layout.account}:modern SET issuer = 'unexpected';`,
            );
            expect(await schema()).toEqual(beforeSchema);
          }),
        ).rejects.toThrow("Post-write validation failed");
        expect(await rows()).toEqual(before);
        expect(await schema()).toEqual(beforeSchema);
      } finally {
        await owned.close();
      }
    }, 30000);

    it("retains original and recovery errors when the acquired fixture closes after a real write", async () => {
      const { owned } = await fixture();
      const original = new Error("failure before recovery");
      try {
        await expect(
          migrateLegacyFixture(owned, layout, async () => {
            await owned.close();
            throw original;
          }),
        ).rejects.toMatchObject({
          message: "Migration and recovery failed; writes remain stopped",
          errors: [
            original,
            expect.objectContaining({
              message: "Recovery requires an acquired legacy fixture snapshot",
            }),
          ],
        });
      } finally {
        await owned.close();
      }
    }, 30000);

    it("rejects a real oversized complete user dataset without changing accounts or schema", async () => {
      const { owned, rows, schema } = await fixture();
      try {
        await owned.bootstrap.query(`INSERT INTO ${layout.user} $rows`, {
          rows: Array.from({ length: 999 }, (_, i) => ({
            id: new RecordId(layout.user, `bounded_${i}`),
            name: "Synthetic",
          })),
        });
        const before = await rows();
        const beforeSchema = await schema();
        await expect(migrateLegacyFixture(owned, layout)).rejects.toThrow("exceeds bounds");
        expect(await rows()).toEqual(before);
        expect(await schema()).toEqual(beforeSchema);
      } finally {
        await owned.close();
      }
    }, 30000);
  }

  it(`${name}: rejects a layout mismatch before snapshot or mutation`, async () => {
    const { owned, rows, schema } = await fixture();
    try {
      const before = await rows();
      const beforeSchema = await schema();
      await expect(
        migrateLegacyFixture(owned, { ...layout, account: "not_registered" }),
      ).rejects.toThrow("do not match acquired fixture");
      expect(await rows()).toEqual(before);
      expect(await schema()).toEqual(beforeSchema);
    } finally {
      await owned.close();
    }
  }, 30000);

  it(`${name}: offline recipe converts losslessly, repeats, and supports scoped adapter CRUD`, async () => {
    const { owned, legacy } = await fixture();
    try {
      await snapshotLegacyFixture(owned);
      const plan = await preflightLegacyAccounts(owned.bootstrap, layout);
      expect(plan.changes).toEqual([
        { id: new RecordId(layout.account, "legacy"), value: legacy.id },
      ]);
      expect(
        plan.accounts.find((row) => (row.id as RecordId).id === "legacy")![layout.accountId],
      ).toBeInstanceOf(RecordId);
      await migrateLegacyFixture(owned, layout);
      const post = await preflightLegacyAccounts(owned.bootstrap, layout);
      expect(post.changes).toEqual([]);
      expect(post.accounts.map((row) => row[layout.accountId])).toEqual([
        legacy.id,
        legacy.id,
        "modern:opaque",
      ]);
      await migrateLegacyFixture(owned, layout);
      await expect(
        owned.bootstrap.query(`UPDATE $id SET ${layout.accountId} = $value`, {
          id: new RecordId(layout.account, "legacy"),
          value: legacy,
        }),
      ).rejects.toThrow();
      const adapter = surrealdbAdapter(owned.adapter, { usePlural: name === "plural" })(options);
      await expect(owned.adapter.query("DEFINE NAMESPACE migration_forbidden")).rejects.toThrow();
      const created = await adapter.create<any>({
        model: "account",
        data: {
          providerId: "google",
          accountId: "opaque:new:subject",
          userId: legacy.id,
          issuer: "scoped",
        },
      });
      expect(created.accountId).toBe("opaque:new:subject");
      const found = await adapter.findOne<any>({
        model: "account",
        where: [{ field: "id", value: created.id }],
      });
      expect(found!.userId).toBe(legacy.id);
      const updated = await adapter.update<any>({
        model: "account",
        where: [{ field: "id", value: created.id }],
        update: { accountId: " opaque:updated " },
      });
      expect(updated!.accountId).toBe(" opaque:updated ");
    } finally {
      await owned.close();
    }
  }, 30000);

  it(`${name}: actual snapshot restores registered schema, indexes and data after partial application`, async () => {
    const { owned, rows, schema, legacy } = await fixture();
    try {
      const before = await rows();
      const beforeSchema = await schema();
      await snapshotLegacyFixture(owned);
      const failure = new Error("forced partial application");
      await expect(
        migrateLegacyFixture(owned, layout, async () => {
          expect(await rows()).not.toEqual(before);
          await owned.bootstrap.query(
            `REMOVE INDEX provider_account ON ${layout.account}; DEFINE FIELD OVERWRITE ${layout.accountId} ON ${layout.account} TYPE string;`,
          );
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(await rows()).toEqual(before);
      expect(await schema()).toEqual(beforeSchema);
      await owned.adapter.signin(owned.adapterAuth);
      await owned.adapter.query(`UPDATE $id SET ${layout.accountId} = $value`, {
        id: new RecordId(layout.account, "legacy"),
        value: legacy,
      });
      await expect(
        owned.adapter.query(
          `CREATE $id SET ${layout.providerId} = 'credential', ${layout.accountId} = $value, ${layout.userId} = $value, issuer = 'duplicate'`,
          { id: new RecordId(layout.account, "duplicate"), value: legacy },
        ),
      ).rejects.toThrow();
    } finally {
      await owned.close();
    }
  }, 30000);

  it(`${name}: valid typed/string collision fails complete preflight without mutation`, async () => {
    const { owned, legacy, seed, rows, schema } = await fixture();
    try {
      await seed("collision", legacy.id);
      const before = await rows();
      const beforeSchema = await schema();
      await snapshotLegacyFixture(owned);
      await expect(migrateLegacyFixture(owned, layout)).rejects.toThrow(
        "composite unique collision",
      );
      expect(await rows()).toEqual(before);
      expect(await schema()).toEqual(beforeSchema);
    } finally {
      await owned.close();
    }
  }, 30000);

  it(`${name}: explicitly enumerated second identity key detects a cross-provider collision only when configured`, async () => {
    const { owned, legacy, seed, rows, schema } = await fixture();
    try {
      await seed("other", legacy.id, "other", legacy, "legacy");
      await owned.bootstrap.query(
        `DEFINE INDEX subject_issuer ON ${layout.account} FIELDS ${layout.accountId}, issuer UNIQUE;`,
      );
      const configured = {
        ...layout,
        uniqueKeys: [...layout.uniqueKeys, [layout.accountId, "issuer"]],
      };
      const before = await rows();
      const beforeSchema = await schema();
      await expect(migrateLegacyFixture(owned, configured)).rejects.toThrow(
        "composite unique collision",
      );
      expect(await rows()).toEqual(before);
      expect(await schema()).toEqual(beforeSchema);
    } finally {
      await owned.close();
    }
  }, 30000);

  it(`${name}: invalid provider/type/table/link/missing user reject before writes`, async () => {
    const { owned, legacy, modern, seed, rows } = await fixture();
    try {
      // Malformed historical values cannot inhabit the normal union; widen only the synthetic fixture to demonstrate rejection.
      await owned.bootstrap.query(
        `DEFINE FIELD OVERWRITE ${layout.accountId} ON ${layout.account} TYPE any; DEFINE FIELD OVERWRITE ${layout.userId} ON ${layout.account} TYPE any; DEFINE FIELD OVERWRITE ${layout.providerId} ON ${layout.account} TYPE any;`,
      );
      for (const [value, provider, link] of [
        [legacy, "google", legacy],
        [new RecordId("wrong", "opaque"), "credential", legacy],
        [new RecordId(layout.user, 42), "credential", legacy],
        [42, "credential", legacy],
        ["", "credential", legacy],
        [{ malformed: true }, "credential", legacy],
        [modern, "credential", legacy],
        [new RecordId(layout.user, "missing"), "credential", new RecordId(layout.user, "missing")],
        ["valid", "credential", new RecordId("wrong", legacy.id)],
        ["valid", "", legacy],
        ["valid", 42, legacy],
        ["valid", "credential", new RecordId(layout.user, 42)],
        ["valid", "credential", { malformed: true }],
      ] as const) {
        await seed("invalid", value, provider, link);
        const before = await rows();
        await expect(migrateLegacyFixture(owned, layout)).rejects.toThrow();
        expect(await rows()).toEqual(before);
        await owned.bootstrap.query("DELETE $id", { id: new RecordId(layout.account, "invalid") });
      }
      // SDK StringRecordId is a query wrapper, not a persisted record type. The database normalizes it;
      // it must not be presented as evidence that its original representation can be detected after storage.
      const valid = {
        id: new RecordId(layout.account, "wrapper"),
        [layout.providerId]: "credential",
        [layout.userId]: legacy,
        issuer: "wrapper",
      };
      expect(() =>
        planLegacyAccounts(
          [{ ...valid, [layout.accountId]: new StringRecordId(`${layout.user}:legacy`) }],
          [{ id: legacy }],
          layout,
        ),
      ).toThrow("RecordId");
      expect(() =>
        planLegacyAccounts(
          [
            {
              ...valid,
              [layout.accountId]: legacy,
              [layout.userId]: new StringRecordId(`${layout.user}:legacy`),
            },
          ],
          [{ id: legacy }],
          layout,
        ),
      ).toThrow("RecordId");
      expect(() =>
        planLegacyAccounts(
          [],
          Array.from({ length: 1001 }, () => ({ id: legacy })),
          layout,
        ),
      ).toThrow("exceeds bounds");
      expect(() => planLegacyAccounts([], [], { ...layout, uniqueKeys: [] })).toThrow("Enumerate");
      expect(() =>
        planLegacyAccounts([], [], {
          ...layout,
          uniqueKeys: [...layout.uniqueKeys, ["subject.path", "issuer"]],
        }),
      ).toThrow("Unsupported");
    } finally {
      await owned.close();
    }
  }, 30000);
}

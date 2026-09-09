import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RecordId, StringRecordId, type Surreal } from "surrealdb";
import { surrealdbAdapter } from "../../packages/surreal-better-auth/src/adapter";
import { toRecordId } from "../../packages/surreal-better-auth/src/utils";
import {
  closeTestSurrealInstance,
  getTestBootstrapInstance,
  getTestSurrealInstance,
} from "../surrealdb";

const ids = [
  "550e8400-e29b-41d4-a716-446655440000",
  "foreign:alpha:beta",
  "user:alice",
  "  spaced  ",
  "⟨⟨nested⟩⟩",
  "雪🙂",
  "__surreal__",
];
const now = new Date("2026-01-01T00:00:00Z");
const userData = {
  name: "Synthetic",
  email: "identity@example.invalid",
  emailVerified: false,
  createdAt: now,
  updatedAt: now,
};
const accountData = {
  issuer: "synthetic",
  providerId: "google",
  accountId: "subject",
  userId: "owner",
  createdAt: now,
  updatedAt: now,
};
let bootstrap: Surreal;
let client: Surreal;
async function mustResolve<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    expect.fail(`Expected lossless SCHEMAFULL write to succeed: ${String(error)}`);
  }
}

beforeAll(async () => {
  bootstrap = await getTestBootstrapInstance();
  client = await getTestSurrealInstance();
});
afterAll(closeTestSurrealInstance);

for (const layout of ["default", "mapped", "plural"] as const) {
  describe(`identity serialization / ${layout}`, () => {
    const mapped = layout === "mapped";
    const plural = layout === "plural";
    const tables = {
      user: mapped ? "identity_person" : plural ? "users" : "user",
      account: mapped ? "identity_login" : plural ? "accounts" : "account",
      session: mapped ? "identity_session" : plural ? "sessions" : "session",
      verification: mapped ? "identity_verification" : plural ? "verifications" : "verification",
    };
    const fields = {
      accountId: mapped ? "subject" : "accountId",
      providerId: mapped ? "provider" : "providerId",
      userId: mapped ? "owner" : "userId",
    };
    const options = {
      user: {
        modelName: mapped ? tables.user : "user",
        additionalFields: { metadata: { type: "json" as const, required: false } },
      },
      account: { modelName: mapped ? tables.account : "account", fields },
      session: { modelName: mapped ? tables.session : "session" },
      verification: { modelName: mapped ? tables.verification : "verification" },
    };
    const adapter = () => surrealdbAdapter(client, { usePlural: plural })(options);
    const raw = async (model: keyof typeof tables) =>
      (await bootstrap.query<any[]>(`SELECT * FROM ${tables[model]}`))[0] as any[];
    const seedUser = async (id: string) => {
      await bootstrap.query("CREATE $id CONTENT $data", {
        id: new RecordId(tables.user, id),
        data: userData,
      });
    };
    const seedAccount = async (id: string, subject = "subject", provider = "google") => {
      await bootstrap.query("CREATE $id CONTENT $data", {
        id: new RecordId(tables.account, id),
        data: {
          issuer: provider,
          [fields.accountId]: subject,
          [fields.providerId]: provider,
          [fields.userId]: new RecordId(tables.user, "owner"),
          createdAt: now,
          updatedAt: now,
        },
      });
    };
    beforeEach(async () => {
      for (const table of new Set([...Object.values(tables), "foreign", "user"]))
        await bootstrap.query(`REMOVE TABLE IF EXISTS ${table}`);
      const schema = await surrealdbAdapter(bootstrap, { usePlural: plural })(options)
        .createSchema!(options);
      await bootstrap.query(schema.code);
    });

    it("control: SCHEMAFULL setup and scoped CRUD", async () => {
      await expect(client.query("DEFINE NAMESPACE identity_forbidden")).rejects.toThrow();
      const a = adapter();
      const created = await a.create<any>({ model: "user", data: userData });
      expect(typeof created.id).toBe("string");
      expect((await raw("user"))[0].id).toBeInstanceOf(RecordId);
      const where = [{ field: "id", value: created.id }];
      expect(await a.findOne({ model: "user", where })).not.toBeNull();
      await a.update({ model: "user", where, update: { name: "Updated" } });
      expect((await raw("user"))[0].name).toBe("Updated");
      await a.delete({ model: "user", where });
      expect(await raw("user")).toEqual([]);
    });

    for (const id of ids) {
      for (const operation of ["create", "find", "update", "delete"] as const) {
        it(`${operation} opaque primary ${JSON.stringify(id)}`, async () => {
          const a = adapter();
          const where = [{ field: "id", value: id }];
          if (operation === "create") {
            const result = await a.create<any>({
              model: "user",
              data: { ...userData, id },
              forceAllowId: true,
            });
            expect.soft(result.id).toBe(id);
            const rows = await raw("user");
            expect(rows).toHaveLength(1);
            expect(rows[0].id).toEqual(new RecordId(tables.user, id));
          } else {
            await seedUser(id); // Isolate predicate/output defects from broken create serialization.
            expect((await raw("user"))[0].id).toEqual(new RecordId(tables.user, id));
            if (operation === "find")
              expect((await a.findOne<any>({ model: "user", where }))?.id).toBe(id);
            if (operation === "update") {
              await a.update({ model: "user", where, update: { name: "Updated" } });
              expect((await raw("user"))[0].name).toBe("Updated");
              expect((await raw("user"))[0].id).toEqual(new RecordId(tables.user, id));
            }
            if (operation === "delete") {
              await a.delete({ model: "user", where });
              expect(await raw("user")).toEqual([]);
            }
          }
        });
      }
      it(`declared reference write ${JSON.stringify(id)}`, async () => {
        await seedUser(id);
        expect
          .soft(
            await mustResolve(
              adapter().create({ model: "account", data: { ...accountData, userId: id } }),
            ),
          )
          .toMatchObject({ userId: id });
        expect((await raw("account"))[0][fields.userId]).toEqual(new RecordId(tables.user, id));
      });
      it(`declared reference predicate ${JSON.stringify(id)}`, async () => {
        await seedUser(id);
        await seedAccount("reference");
        await bootstrap.query(`UPDATE ${tables.account} SET ${fields.userId} = $id`, {
          id: new RecordId(tables.user, id),
        });
        const rows = await adapter().findMany<any>({
          model: "account",
          where: [{ field: "userId", value: id }],
        });
        expect(rows.map((row) => row.userId)).toEqual([id]);
      });
    }

    for (const providerId of ["credential", "google"]) {
      for (const accountId of ["subject", "user:alice"]) {
        it(`${providerId} accountId write ${accountId} is string`, async () => {
          await seedUser("owner");
          expect
            .soft(
              await mustResolve(
                adapter().create({
                  model: "account",
                  data: { ...accountData, accountId, providerId },
                }),
              ),
            )
            .toMatchObject({ accountId, userId: "owner" });
          const row = (await raw("account"))[0];
          expect(row[fields.accountId]).toBe(accountId);
          expect(row[fields.userId]).toEqual(new RecordId(tables.user, "owner"));
        });
      }
      for (const operator of ["eq", "ne", "in", "not_in"] as const) {
        for (const withProvider of [false, true]) {
          it(`${providerId} accountId ${operator} provider=${withProvider}`, async () => {
            await seedUser("owner");
            await seedAccount("match", "subject", providerId);
            await seedAccount("other", "different", providerId);
            await seedAccount(
              "otherprovider",
              "subject",
              providerId === "google" ? "credential" : "google",
            );
            expect(
              (await raw("account")).every((row) => typeof row[fields.accountId] === "string"),
            ).toBe(true);
            const where: any[] = [
              {
                field: "accountId",
                operator,
                value: operator === "in" || operator === "not_in" ? ["subject"] : "subject",
              },
            ];
            if (withProvider) where.push({ field: "providerId", value: providerId });
            const rows = await adapter().findMany<any>({ model: "account", where });
            const positive = operator === "eq" || operator === "in";
            expect(rows.map((row) => row.id).sort()).toEqual(
              positive ? (withProvider ? ["match"] : ["match", "otherprovider"]) : ["other"],
            );
          });
        }
      }
      it(`${providerId} partial accountId update without provider`, async () => {
        await seedUser("owner");
        await seedAccount("partial", "before", providerId);
        await mustResolve(
          adapter().update({
            model: "account",
            where: [{ field: "id", value: "partial" }],
            update: { accountId: "user:alice" },
          }),
        );
        expect((await raw("account"))[0][fields.accountId]).toBe("user:alice");
      });
    }
    it("same subject across providers retains composite uniqueness", async () => {
      await seedUser("owner");
      const a = adapter();
      for (const providerId of ["google", "credential"])
        await a.create({
          model: "account",
          data: { ...accountData, providerId, issuer: providerId },
        });
      expect
        .soft((await raw("account")).map((row) => row[fields.accountId]))
        .toEqual(["subject", "subject"]);
      await expect(a.create({ model: "account", data: accountData })).rejects.toThrow();
    });
    for (const field of ["name", "metadata", "token"] as const) {
      it(`ordinary ${field} preserves known-prefix string`, async () => {
        const value = "user:alice";
        if (field === "token") {
          await seedUser("owner");
          expect
            .soft(
              await mustResolve(
                adapter().create({
                  model: "session",
                  data: {
                    token: value,
                    userId: "owner",
                    expiresAt: now,
                    createdAt: now,
                    updatedAt: now,
                  },
                }),
              ),
            )
            .toMatchObject({ token: value });
          expect((await raw("session"))[0].token).toBe(value);
        } else {
          const data =
            field === "metadata"
              ? { metadata: { text: value, nested: ["⟨⟨literal⟩⟩", "__surreal__"] } }
              : { name: value };
          expect
            .soft(
              await mustResolve(
                adapter().create({ model: "user", data: { ...userData, ...data } }),
              ),
            )
            .toMatchObject(data);
          expect((await raw("user"))[0][field]).toEqual(data[field as keyof typeof data]);
        }
      });
    }
    it("generated SCHEMAFULL declared reference accepts correctly scoped record", async () => {
      await seedUser("owner");
      await mustResolve(seedAccount("schema-control"));
      await expect(
        bootstrap.query(`UPDATE ${tables.account} SET ${fields.userId} = 'owner'`),
      ).rejects.toThrow();
      await expect(
        bootstrap.query(`UPDATE ${tables.account} SET ${fields.userId} = $id`, {
          id: new RecordId("foreign", "owner"),
        }),
      ).rejects.toThrow();
    });
    it("generated SCHEMAFULL accountId rejects records", async () => {
      await seedUser("owner");
      await seedAccount("schema-control");
      await expect(
        bootstrap.query(`UPDATE ${tables.account} SET ${fields.accountId} = $id`, {
          id: new RecordId(tables.user, "owner"),
        }),
      ).rejects.toThrow();
    });
    it("control: raw ordinary string fixtures and scoped account/session writes", async () => {
      await seedUser("owner");
      await bootstrap.query(`UPDATE ${tables.user} SET name = $value`, { value: "user:alice" });
      expect((await raw("user"))[0].name).toBe("user:alice");
      await adapter().create({ model: "account", data: accountData });
      expect((await raw("account"))[0][fields.accountId]).toBe("subject");
      await adapter().create({
        model: "session",
        data: { token: "plain", userId: "owner", expiresAt: now, createdAt: now, updatedAt: now },
      });
      await bootstrap.query(`UPDATE ${tables.session} SET token = $value`, { value: "user:alice" });
      expect((await raw("session"))[0].token).toBe("user:alice");
    });
    it("control: empty supplied ID is removed by BA factory, not an opaque public ID", async () => {
      const row = await adapter().create<any>({
        model: "user",
        data: { ...userData, id: "" },
        forceAllowId: true,
      });
      expect(typeof row.id).toBe("string");
      expect(row.id.length).toBeGreaterThan(0);
    });
    for (const generateId of [false, "uuid"] as const) {
      it(`control: BA generateId=${generateId} with missing ID`, async () => {
        const a = surrealdbAdapter(client, { usePlural: plural })({
          ...options,
          advanced: { database: { generateId } },
        });
        const row = await a.create<any>({ model: "user", data: userData });
        expect(typeof row.id).toBe("string");
        expect(
          await a.findOne({ model: "user", where: [{ field: "id", value: row.id }] }),
        ).not.toBeNull();
      });
    }
    for (const idGenerator of [undefined, "ULID", "UUIDv4", "UUIDv7", "guid"] as const) {
      it(`supplied sentinel overrides generation ${idGenerator ?? "BA default"}`, async () => {
        const a = surrealdbAdapter(client, { usePlural: plural, idGenerator })(options);
        const row = await a.create<any>({
          model: "user",
          data: { ...userData, id: "__surreal__" },
          forceAllowId: true,
        });
        expect.soft(row.id).toBe("__surreal__");
        expect((await raw("user"))[0].id).toEqual(new RecordId(tables.user, "__surreal__"));
      });
      it(`missing ID generation ${idGenerator ?? "BA default"}`, async () => {
        const a = surrealdbAdapter(client, { usePlural: plural, idGenerator })(options);
        const row = await a.create<any>({ model: "user", data: userData });
        expect(typeof row.id).toBe("string");
        expect(row.id).not.toBe("__surreal__");
        expect(row.id.length).toBeGreaterThan(0);
        expect((await raw("user"))[0].id).toBeInstanceOf(RecordId);
        expect(
          await a.findOne({ model: "user", where: [{ field: "id", value: row.id }] }),
        ).not.toBeNull();
      });
    }
  });
}

describe("typed record scope at supported conversion helper (not BA public string API)", () => {
  for (const target of ["user", "account"]) {
    for (const value of [new RecordId("foreign", "opaque"), new StringRecordId("foreign:opaque")]) {
      it(`rejects ${value.constructor.name} outside ${target}`, () => {
        expect(() => toRecordId(value, new Set(["user", "account"]), target)).toThrow();
      });
    }
  }
});

it("typed conversion preserves string components and rejects textual SDK wrappers", () => {
  const tables = new Set(["user"]);
  for (const id of ["user:alice", " ⟨nested:⟨id⟩⟩ ", "__surreal__"]) {
    expect(toRecordId(id, tables, "user")).toEqual(new RecordId("user", id));
    expect(toRecordId(new RecordId("user", id), tables, "user")).toEqual(new RecordId("user", id));
  }
  expect(() => toRecordId(new StringRecordId("user:alice"), tables, "user")).toThrow(
    "StringRecordId",
  );
});

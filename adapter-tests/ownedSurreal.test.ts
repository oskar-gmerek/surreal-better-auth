import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { assertOwnedEndpoint, startOwnedSurreal } from "./ownedSurreal";
import { surrealdbAdapter } from "../packages/surreal-better-auth/src/adapter";

const ownedDirectories = async () =>
  (await readdir(tmpdir())).filter((name) => name.startsWith("surreal-adapter-test-")).sort();

describe("owned SurrealDB test harness", () => {
  it("rejects remote, shared, and malformed endpoints", () => {
    for (const [endpoint, port] of [
      ["ws://example.com:19000/rpc", 19000],
      ["ws://127.0.0.1:8000/rpc", 8000],
      ["ws://127.0.0.1:18763/rpc", 18763],
      ["ws://localhost:19000/rpc", 19000],
      ["ws://127.0.0.1:19000/rpc?redirect=1", 19000],
    ] as const)
      expect(() => assertOwnedEndpoint(endpoint, port)).toThrow();
  });

  it("does not acquire or stop an existing listener", async () => {
    const before = await ownedDirectories();
    const listener = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    try {
      const port = (listener.address() as { port: number }).port;
      await expect(startOwnedSurreal({ port })).rejects.toThrow("failed to start");
      expect(listener.listening).toBe(true);
      expect(await ownedDirectories()).toEqual(before);
    } finally {
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  }, 20000);

  it("cleans storage and child after initialization failure", async () => {
    const before = await ownedDirectories();
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    await expect(
      startOwnedSurreal({
        port,
        initialize: async () => {
          throw new Error("synthetic initialization failure");
        },
      }),
    ).rejects.toThrow("synthetic initialization failure");
    // Rebinding proves the failed initialization did not leave its child listening.
    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    expect(await ownedDirectories()).toEqual(before);
  }, 20000);

  it("bootstraps schema separately and runs unchanged adapter CRUD as a database identity", async () => {
    const before = await ownedDirectories();
    const owned = await startOwnedSurreal();
    try {
      // A database EDITOR cannot perform root-level namespace administration.
      await expect(
        owned.adapter.query("DEFINE NAMESPACE forbidden_test_namespace;"),
      ).rejects.toThrow();
      const options = { emailAndPassword: { enabled: true } };
      const schemaAdapter = surrealdbAdapter(owned.bootstrap)(options);
      const schema = await schemaAdapter.createSchema!(options);
      await owned.bootstrap.query(schema.code);
      const adapter = surrealdbAdapter(owned.adapter)(options);
      const user = await adapter.create<any>({
        model: "user",
        data: {
          name: "Synthetic",
          email: "synthetic@example.invalid",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const where = [{ field: "id", value: user.id }];
      expect((await adapter.findOne<any>({ model: "user", where }))?.name).toBe("Synthetic");
      await adapter.update({ model: "user", where, update: { name: "Updated" } });
      expect((await adapter.findOne<any>({ model: "user", where }))?.name).toBe("Updated");
      await adapter.delete({ model: "user", where });
      expect(await adapter.findOne({ model: "user", where })).toBeNull();
    } finally {
      await owned.close();
      await owned.close(); // teardown is idempotent
    }
    expect(await ownedDirectories()).toEqual(before);
  }, 20000);
});

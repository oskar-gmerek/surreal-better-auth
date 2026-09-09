import { startOwnedSurreal } from "./ownedSurreal";

type Owned = Awaited<ReturnType<typeof startOwnedSurreal>>;
const fixtures = new WeakMap<Owned, { tables: readonly string[]; snapshot?: string }>();
const fixtureTables = {
  default: ["account", "user"],
  mapped: ["identity_login", "identity_person"],
  plural: ["accounts", "users"],
} as const;

/** Acquires a separate synthetic fixture; shared global setup is never registered. */
export async function acquireLegacyRecoveryFixture(layout: keyof typeof fixtureTables = "default") {
  if (!Object.hasOwn(fixtureTables, layout)) throw new Error("Unknown synthetic fixture layout");
  const owned = await startOwnedSurreal();
  fixtures.set(owned, { tables: fixtureTables[layout] });
  const close = owned.close;
  let closing: Promise<void> | undefined;
  owned.close = () => {
    fixtures.delete(owned);
    return (closing ??= close());
  };
  return owned;
}

async function bounded<T>(owned: Owned, operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void owned
            .close()
            .then(() => reject(new Error("Synthetic recovery I/O timed out")), reject);
        }, 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function snapshotLegacyFixture(owned: Owned, tables?: readonly string[]) {
  const registered = fixtures.get(owned);
  if (!registered) throw new Error("Recovery requires an acquired legacy fixture");
  if (
    tables &&
    (tables.length !== 2 || tables.some((table, index) => table !== registered.tables[index]))
  )
    throw new Error("Migration tables do not match acquired fixture layout");
  // Deliberately exclude identities: retain the fixture's database and scoped user.
  const snapshot = await bounded(owned, async () => {
    const response = await owned.bootstrap
      .export({
        users: false,
        accesses: false,
        tables: true,
        records: true,
      })
      .raw();
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_000_000) throw new Error("Synthetic snapshot too large");
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString("utf8");
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  });
  const fixture = fixtures.get(owned);
  if (!fixture) throw new Error("Recovery fixture closed during snapshot");
  fixture.snapshot = snapshot;
  return snapshot;
}

/** Restore only this fixture's two known tables, not its database or credentials. */
export async function restoreLegacyFixture(owned: Owned) {
  const fixture = fixtures.get(owned);
  if (!fixture?.snapshot) throw new Error("Recovery requires an acquired legacy fixture snapshot");
  await bounded(owned, async () => {
    await owned.bootstrap.query(fixture.tables.map((table) => `REMOVE TABLE ${table};`).join("\n"));
    await owned.bootstrap.import(fixture.snapshot!);
  });
}

import { startOwnedSurreal } from "./ownedSurreal";

type Owned = Awaited<ReturnType<typeof startOwnedSurreal>>;
const fixtures = new WeakMap<Owned, string | undefined>();

/** Acquires a separate synthetic fixture; shared global setup is never registered. */
export async function acquireLegacyRecoveryFixture() {
  const owned = await startOwnedSurreal();
  fixtures.set(owned, undefined);
  const close = owned.close;
  owned.close = async () => {
    fixtures.delete(owned);
    await close();
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
          void owned.close();
          reject(new Error("Synthetic recovery I/O timed out"));
        }, 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function snapshotLegacyFixture(owned: Owned) {
  if (!fixtures.has(owned)) throw new Error("Recovery requires an acquired legacy fixture");
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
  fixtures.set(owned, snapshot);
  return snapshot;
}

/** Restore only this fixture's two known tables, not its database or credentials. */
export async function restoreLegacyFixture(owned: Owned) {
  const snapshot = fixtures.get(owned);
  if (!snapshot) throw new Error("Recovery requires an acquired legacy fixture snapshot");
  await bounded(owned, async () => {
    await owned.bootstrap.query("REMOVE TABLE account; REMOVE TABLE user;");
    await owned.bootstrap.import(snapshot);
  });
}

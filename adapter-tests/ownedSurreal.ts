import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { Surreal } from "surrealdb";
import { WebSocket } from "ws";

export function assertOwnedEndpoint(endpoint: string, port: number) {
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    [8000, 18763].includes(port) ||
    endpoint !== `ws://127.0.0.1:${port}/rpc`
  ) {
    throw new Error("Tests require a dedicated loopback endpoint");
  }
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

/** Test-only owner: never accepts an existing service, storage directory or PID. */
export async function startOwnedSurreal(
  options: { port?: number; initialize?: (bootstrap: Surreal) => Promise<void> } = {},
) {
  const binary = process.env.SURREAL_TEST_BINARY || "surreal";
  if (!/^3\.2\.3(?:\+|\s)/.test(execFileSync(binary, ["version"], { encoding: "utf8" }))) {
    throw new Error("Tests require SurrealDB 3.2.3");
  }
  const port = options.port ?? (await freePort());
  const endpoint = `ws://127.0.0.1:${port}/rpc`;
  assertOwnedEndpoint(endpoint, port);
  const reservation = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      reservation.once("error", reject);
      reservation.listen(port, "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
  } catch {
    throw new Error("Owned SurrealDB failed to start: port already occupied");
  }
  const storage = await mkdtemp(join(tmpdir(), "surreal-adapter-test-"));
  const suffix = randomUUID().replaceAll("-", "");
  const namespace = `test_${suffix}`;
  const database = `db_${suffix}`;
  const username = `adapter_${suffix}`;
  const password = randomUUID();
  const bootstrapPassword = randomUUID();
  const child = spawn(
    binary,
    ["start", "--no-banner", "--bind", `127.0.0.1:${port}`, `surrealkv://${join(storage, "data")}`],
    {
      // Do not inherit external database settings or print credentials/server logs.
      env: {
        PATH: process.env.PATH,
        SURREAL_USER: `bootstrap_${suffix}`,
        SURREAL_PASS: bootstrapPassword,
        SURREAL_AUTH: "true",
      },
      stdio: "ignore",
    },
  );
  let exited = false;
  const stopped = new Promise<void>((resolve) => {
    child.once("exit", () => {
      exited = true;
      resolve();
    });
    child.once("error", () => {
      exited = true;
      resolve();
    });
  });
  const bootstrap = new Surreal({ websocketImpl: WebSocket as any });
  const adapter = new Surreal({ websocketImpl: WebSocket as any });
  const onExit = () => {
    if (!exited) child.kill("SIGKILL");
  };
  process.once("exit", onExit);
  let disposed = false;
  async function close() {
    if (disposed) return;
    disposed = true;
    if (!exited) child.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (!exited) child.kill("SIGKILL");
    }, 3000);
    await stopped;
    clearTimeout(timer);
    process.removeListener("exit", onExit);
    try {
      await Promise.allSettled([adapter.close(), bootstrap.close()]);
    } finally {
      await rm(storage, { recursive: true, force: true });
    }
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !exited; attempt++) {
      const listening = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        const finish = (value: boolean) => {
          socket.destroy();
          resolve(value);
        };
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.setTimeout(200, () => finish(false));
      });
      if (listening) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready || exited) throw new Error("Owned SurrealDB failed to start or authenticate");
    let deadline: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        (async () => {
          await bootstrap.connect(endpoint, { reconnect: false });
          // Random per-child credentials prove ownership even in a port allocation race.
          await bootstrap.signin({ username: `bootstrap_${suffix}`, password: bootstrapPassword });
        })(),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Owned SurrealDB authentication timed out")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(deadline!);
    }
    if (exited) throw new Error("Owned SurrealDB exited before initialization");
    await bootstrap.query(
      `DEFINE NAMESPACE ${namespace}; USE NS ${namespace}; DEFINE DATABASE ${database}; USE DB ${database}; DEFINE USER ${username} ON DATABASE PASSWORD '${password}' ROLES EDITOR;`,
    );
    await bootstrap.use({ namespace, database });
    await options.initialize?.(bootstrap);
    await adapter.connect(endpoint, { reconnect: false });
    await adapter.signin({ namespace, database, username, password });
    await adapter.use({ namespace, database });
    return {
      adapter,
      bootstrap,
      close,
      endpoint,
      storage,
      namespace,
      database,
      adapterAuth: { namespace, database, username, password },
      bootstrapAuth: { username: `bootstrap_${suffix}`, password: bootstrapPassword },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

# Adapter integration tests

Install the repository's frozen lock without lifecycle scripts:

```sh
bun install --frozen-lockfile --ignore-scripts
```

Install SurrealDB **3.2.3** separately and put `surreal` on PATH (or set
`SURREAL_TEST_BINARY` to that binary). No Docker download or existing database is
used. From this directory:

```sh
node ../node_modules/vitest/vitest.mjs list
node ../node_modules/vitest/vitest.mjs run ownedSurreal.test.ts
node ../node_modules/vitest/vitest.mjs run
```

The root `test:adapter`/`test:all` aliases also use this configuration. Global setup
owns a child on a free loopback port, random namespace/database and temporary
persistent storage. Ports 8000 and 18763 and non-loopback endpoints are rejected.
A bind collision never authorizes using or stopping the existing service.
Random bootstrap authentication establishes ownership before schema changes.

Schema migrations use the bootstrap connection. Adapter CRUD uses a separate
DATABASE EDITOR identity, not root. Credentials exist only in ephemeral test
setup/context and must not be logged. These database users are synthetic test
identities, not a production record-access policy.

Coordinator teardown stops only its acquired child and removes its storage,
including collection failure, listing, and filtered runs. Initialization errors
also release the child/storage. As with other subprocess tests, forcibly killing
the coordinator (SIGKILL) cannot guarantee filesystem cleanup. No instance
management is included in the adapter package.

The harness smoke covers synthetic CRUD and scope denial against unchanged
adapter source. It does not establish identity regression, full-suite, migration,
or external OAuth-provider correctness.

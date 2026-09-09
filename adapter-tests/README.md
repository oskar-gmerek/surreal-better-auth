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

## Identity serialization regressions

`suites/identitySerialization.test.ts` is collected
by the normal Vitest configuration. Run it with `ownedSurreal.test.ts` to retain
harness controls. These tests intentionally assert the proposed lossless identity
policy and are red against the original adapter; they are not `fails`/skipped tests.

The suite uses the frozen Better Auth/core **1.7.2** factory: caller IDs require
`forceAllowId`; its ID input transform removes an empty string before the adapter
sees it. Empty input therefore tests factory generation, not preservation of an
unsupported public empty ID. Literal `__surreal__` is nonempty and must survive.
Missing IDs exercise BA default/disabled/UUID and all advertised adapter generators.
BA UUID mode only permits UUID caller IDs; arbitrary opaque IDs use default mode.
Numeric/compound IDs and typed records are not promised by BA's public string API.
Wrong-table `RecordId`/`StringRecordId` inputs are tested only at `toRecordId`, which
explicitly accepts those SDK types. No email-derived identity is used.

Each primary CRUD operation and reference predicate is independent, seeded with
explicit table-scoped SDK records where needed so broken writes cannot mask reads.
Raw persisted values and generated SCHEMAFULL rejection assertions complement
public output assertions. Default, mapped tables/fields, and plural layouts run
separately. A bootstrap-only mapped `userId` field override isolates CRUD from the
original generator's string-reference DDL defect; a separate unmodified-schema
case asserts that defect. Account fixtures include BA 1.7.2's required `issuer`;
provider fixtures use distinct issuers to avoid confusing its additional unique
index with provider/account uniqueness. Plain account/session writes and raw
known-prefix strings are passing setup controls for type-conversion rejections.

This is synthetic local evidence, not Better Auth 1.7.3, Google runtime, full-suite,
migration, application transport, or upstream policy acceptance evidence.

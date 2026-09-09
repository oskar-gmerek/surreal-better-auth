# Migration readiness

This proposed string-only account identity change is breaking for legacy
record-valued credential `accountId` fields. The adapter does **not** migrate
existing data. This guide describes a bounded offline recipe demonstrated only on
fresh synthetic fixtures, not an approved production migration or release.
Maintainer compatibility agreement remains unresolved (issue #36).

## Operator gates: stop if any cannot be established

- Stop **all** writers for the entire snapshot, preflight, conversion, validation
  and recovery interval. A read-before-write comparison is not concurrency control.
- Establish target ownership, backup/restore privileges, secure backup retention,
  and recovery of identities and configuration. Rehearse recovery on an isolated,
  operator-owned restored copy with the actual server/schema/authentication setup.
- Certify identity history independently. Native UUID record components and callers
  that prefixed, trimmed or otherwise normalized IDs require compatibility review.
  Already-lost characters cannot be detected or reconstructed by this tool.
  No email matching, trimming, colon parsing, prefix removal or guessed history is
  allowed. Unresolved history means **stop**, not silently convert or link users.
- Resolve physical table and field names explicitly from your configuration.
  Enumerate **every relevant unique constraint**, including provider/account and
  additional identity keys such as provider/issuer. The recipe supports only
  simple composite keys (2–8 distinct top-level fields), whose values are strings
  or string-component typed records. It checks at most 16 keys. Missing/optional,
  numeric, array, nested, computed, conditional or otherwise unsupported key
  semantics require a separate reviewed procedure: stop rather than omit a key.
  This is not arbitrary-index discovery or validation. In particular, never
  invent a global accountId uniqueness rule across providers.
- The schema-narrowing statement below is for a simple field definition. If the
  account identity field has assertions, defaults, permissions or other clauses
  that must survive `DEFINE FIELD OVERWRITE`, stop for a reviewed schema-specific
  procedure. No automatic schema-policy translation is provided.
- This tool is bounded synthetic tooling: at most 1,000 accounts and 1,000 users,
  500,000 JSON characters in the decoded dataset, and a 1 MB SQL snapshot. Reads
  request 1,001 rows per table to reject overflow, not migrate a truncated prefix.
  The decoded-size check is after retrieval; it is not a production streaming or
  memory-bound guarantee. Do not use it as a production-scale migration utility.

Operator certification is not an authentication bypass. Any proposed application
migration still uses fresh synthetic identities for rehearsal; do not import
trusted sessions or infer ownership from email.

## One recipe, shared with tests

The executable source of this recipe is
`adapter-tests/legacyAccountMigration.ts`; it is not exported by the package.
`legacyAccountMigration.test.ts` uses the same `migrateLegacyFixture` path for
success, preflight rejection and forced partial-write recovery. The entry point
accepts only a separately acquired recovery fixture, not arbitrary endpoints or
the global test database. All maintenance is bootstrap work on the owned fixture;
post-migration adapter create/find/update runs through DATABASE EDITOR.

The fixture mappings are explicit:

| Layout  | Account table  | User table      | Account identity | Provider   | Linked user |
| ------- | -------------- | --------------- | ---------------- | ---------- | ----------- |
| default | account        | user            | accountId        | providerId | userId      |
| mapped  | identity_login | identity_person | subject          | provider   | owner       |
| plural  | accounts       | users           | accountId        | providerId | userId      |

For example the default layout's `uniqueKeys` is
`[["providerId", "accountId"], ["providerId", "issuer"]]`. Mapped layouts use the
physical provider/identity fields, not their Better Auth aliases. The additional
collision test explicitly adds `[accountId, issuer]` (using the mapped identity
field where applicable) and creates that real unique index under the old union
schema. Equal subjects across providers are otherwise preserved, not rejected.

With all operator gates established, follow this order:

1. **Keep writes stopped. Take a schema-inclusive snapshot.** Validate the restored
   copy and operator history/constraint inventory before attempting conversion.
   Synthetic `snapshotLegacyFixture` uses actual SDK SQL export; it does not clone
   projected rows. A fixture is registered with its known default/mapped/plural
   tables at acquisition, and migration rejects a mismatched table configuration.
2. **Complete read-only preflight of all accounts and user references before any
   write.** `preflightLegacyAccounts` reads the bounded complete dataset in ID
   order. Each account ID and linked user ID must be a string-component `RecordId`
   in its configured physical table; the linked user must exist. Providers must be
   nonempty strings. Existing nonempty string account identities, including Google
   subjects, remain byte-for-byte unchanged; string identities are not guessed to
   be user IDs. Only provider `credential` may have a typed account identity, and
   that must be a `RecordId` with a string component in the expected user table,
   with the exact same table/component as its canonical linked user ID.
   Reject OAuth typed records, wrong tables, numeric/compound/native UUID
   components, `StringRecordId`, empty/malformed values, mismatched links and
   missing users. SDK `StringRecordId` wrappers cannot retain their wrapper type
   through storage: pure validation tests prove rejection of wrappers, not
   detection of their historical use after database normalization.
3. **Check the proposed complete dataset for collisions.** For each explicitly
   configured composite key, compare typed values across converted **and untouched**
   rows. Distinguish strings from records and preserve record table/component
   identity. Any unsupported key value or duplicate stops preflight with zero
   mutation. The real old `string | record<user>` schema can contain a typed and
   string identity that become duplicates only after conversion; tests cover this.
4. **Convert under the old union schema.** Re-read and require an unchanged offline
   dataset. For eligible rows only, execute `UPDATE $id SET <physical accountId> =
$value` with the original string component bound directly as `$value`. Do not
   serialize or parse the record. No string row, provider, link or other field is
   deliberately rewritten.
5. **Validate before narrowing.** Run complete preflight again, require no remaining
   conversions, and compare all account rows to the exact planned dataset and all
   user rows to their originals. Only then execute `DEFINE FIELD OVERWRITE
<physical accountId> ON <physical account table> TYPE string`. Repeating the
   recipe on an already-string dataset performs no account updates. Verify raw
   types, record rejection by the new schema and scoped adapter create/find/update
   before considering any later activation decision.
6. **On failure keep writes stopped.** Read-only preflight errors do not trigger
   destructive restoration. Errors after application begins invoke the rehearsed
   actual SQL snapshot restore, then rethrow the original error. If restoration
   also fails, `AggregateError.errors` retains both original and recovery errors;
   never report recovery success or resume writes. Tests force a failure after an
   actual update and schema/index damage, then compare restored schema and data
   exactly and recheck uniqueness and scoped login/legacy record writes.

Passing this synthetic recipe does not authorize deployment. Operator backup,
compatibility, restored-copy checks and application acceptance remain external
prerequisites; the helper does not certify them automatically.

## Recovery evidence and limits

The integration tests use SurrealDB **3.2.3**, SDK **2.0.8** and locked Better Auth/core
**1.7.2**. Each migration fixture owns a separate authenticated server, process,
namespace/database and temporary storage. Snapshot/restore uses SQL export/import
of old SCHEMAFULL tables, fields, indexes and rows, preserving exact typed record
components. The accepted `legacyMigrationRecovery.test.ts` additionally exercises
recovery I/O timeout cleanup and rejects unowned/closed contexts.

Exports set `users: false` and `accesses: false`: this is **not** a backup of
identities, passwords, access definitions, namespace or server configuration.
Restore removes only the acquired fixture's two registered tables, never its
database or DATABASE EDITOR user. The exact-object WeakMap ownership guard,
memoized cleanup and 10-second snapshot/restore I/O deadlines remain in place.
Snapshot text contains only synthetic data, stays in bounded memory and is
invalidated on cleanup; clients/process/storage are closed in `finally`.

Operators must rehearse their own complete recovery procedure, including restored
types, constraints, scoped login and application access. Do not run destructive
fixture tooling against production or shared databases. This evidence is not real
Google authentication, application transport, native UUID/history compatibility,
production backup, maintainer approval, release readiness or permission to deploy.

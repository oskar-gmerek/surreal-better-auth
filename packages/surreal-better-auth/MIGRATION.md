# Migration readiness

## Recovery rehearsal before upgrading

The proposed string-only account identity change is breaking for databases with
legacy record-valued credential `accountId` fields. Do not upgrade such a database
without a verified backup and a successful restore rehearsal. A complete migration
recipe is not provided here yet; the adapter does not migrate existing data.

Current recovery evidence is synthetic and local: the integration test
`adapter-tests/legacyMigrationRecovery.test.ts` runs on SurrealDB **3.2.3**, with
SDK **2.0.8** and the repository's locked Better Auth **1.7.2** environment. It uses
its own authenticated server, separate from the shared test database. SDK SQL
export/import restores old SCHEMAFULL tables, field definitions, composite unique
indexes and rows after a deliberately failed partial credential conversion and
schema damage. Assertions compare the original schema and data, including exact
string components of typed `record<user>` identities, prove the old union field
accepts records again, and check both composite uniqueness constraints.

This is a schema-and-data snapshot, not a row-only clone. The fixture explicitly
exports with `users: false` and `accesses: false`: it does **not** back up identities,
passwords, access definitions, namespace configuration or server configuration.
Restoration removes only the two known fixture tables, preserving its database
and database-scoped EDITOR user. The test verifies the existing authenticated
connection can read restored data, sign in again, write legacy records, and still
cannot administer namespaces. Bootstrap credentials perform schema restoration;
all fixture record CRUD uses the scoped EDITOR. Snapshot text contains synthetic
data only, is size-limited and held in memory, and is discarded during fixture
cleanup. The helper only accepts instances it acquired itself, never operator
endpoints or the shared test database.

Operators must separately establish ownership of the target, sufficient backup
and restore privileges, secure storage and retention for backups, and recovery of
all required identities and configuration. Do not assume this fixture's table-only
replacement or credential preservation covers your deployment. Stop application
writes and rehearse restoration on an isolated, operator-owned copy using the
actual server version, schema, indexes, data and authentication setup. Verify
restored types, constraints, scoped login and application access before proceeding.
If an upgrade fails, keep writes stopped and use the rehearsed recovery procedure.
Do not run destructive fixture tooling against a production or shared database.

Historical native UUID record components and callers that previously prefixed,
trimmed or otherwise normalized IDs remain a separate compatibility gate. This
recovery proof does not establish that those identities can be migrated losslessly.
It is not production recovery evidence, a full credential backup, maintainer
approval, or authorization to deploy the proposed breaking upgrade.

import { isDeepStrictEqual } from "node:util";
import { RecordId, type Surreal } from "surrealdb";
import { snapshotLegacyFixture, restoreLegacyFixture } from "./legacyMigrationSnapshot";

/** Physical names, not Better Auth model/field aliases. Only simple composite keys are supported. */
export interface LegacyAccountLayout {
  account: string;
  user: string;
  accountId: string;
  providerId: string;
  userId: string;
  uniqueKeys: readonly (readonly string[])[];
}

type Row = Record<string, unknown>;
const MAX_ROWS = 1000;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

function record(value: unknown, table: string): RecordId<string, string> {
  if (!(value instanceof RecordId) || value.table.name !== table || typeof value.id !== "string")
    throw new Error(`Expected string-component RecordId in ${table}`);
  return value as RecordId<string, string>;
}

function atom(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(["string", value]);
  if (value instanceof RecordId && typeof value.id === "string")
    return JSON.stringify(["record", value.table.name, value.id]);
  throw new Error("Unsupported composite key value");
}

function validateLayout(layout: LegacyAccountLayout) {
  const names = [layout.account, layout.user, layout.accountId, layout.providerId, layout.userId];
  if (
    names.some((name) => !identifier.test(name)) ||
    layout.account === layout.user ||
    new Set(names.slice(2)).size !== 3 ||
    names.slice(2).includes("id")
  )
    throw new Error("Unsupported physical names");
  if (
    layout.uniqueKeys.length > 16 ||
    !layout.uniqueKeys.some(
      (key) =>
        key.length === 2 && key.includes(layout.providerId) && key.includes(layout.accountId),
    )
  )
    throw new Error("Enumerate provider/account and all other relevant composite unique keys");
  for (const key of layout.uniqueKeys)
    if (
      key.length < 2 ||
      key.length > 8 ||
      new Set(key).size !== key.length ||
      key.some((field) => !identifier.test(field))
    )
      throw new Error("Unsupported composite unique key");
}

async function readAll(db: Surreal, layout: LegacyAccountLayout) {
  const [accounts, users] = await db.query<[Row[], Row[]]>(
    `SELECT * FROM ${layout.account} ORDER BY id LIMIT ${MAX_ROWS + 1};
     SELECT * FROM ${layout.user} ORDER BY id LIMIT ${MAX_ROWS + 1};`,
  );
  if (
    accounts.length > MAX_ROWS ||
    users.length > MAX_ROWS ||
    JSON.stringify([accounts, users]).length > 500_000
  )
    throw new Error("Synthetic migration dataset exceeds bounds");
  return { accounts, users };
}

/** Complete read-only preflight; never infer identity from email or serialized record text. */
export async function preflightLegacyAccounts(db: Surreal, layout: LegacyAccountLayout) {
  validateLayout(layout);
  const { accounts, users } = await readAll(db, layout);
  return planLegacyAccounts(accounts, users, layout);
}

/** Pure validation seam for SDK wrappers which cannot retain their type through database storage. */
export function planLegacyAccounts(accounts: Row[], users: Row[], layout: LegacyAccountLayout) {
  validateLayout(layout);
  if (
    accounts.length > MAX_ROWS ||
    users.length > MAX_ROWS ||
    JSON.stringify([accounts, users]).length > 500_000
  )
    throw new Error("Synthetic migration dataset exceeds bounds");
  const userIds = new Set(users.map((row) => atom(record(row.id, layout.user))));
  const changes: { id: RecordId<string, string>; value: string }[] = [];
  const converted = accounts.map((row) => {
    const id = record(row.id, layout.account);
    const linked = record(row[layout.userId], layout.user);
    if (!userIds.has(atom(linked))) throw new Error("Missing linked user");
    const provider = row[layout.providerId];
    if (typeof provider !== "string" || !provider) throw new Error("Invalid provider");
    let value = row[layout.accountId];
    if (typeof value !== "string") {
      if (provider !== "credential") throw new Error("Typed account identity is not credential");
      const legacy = record(value, layout.user);
      if (legacy.id !== linked.id) throw new Error("Credential link mismatch");
      value = legacy.id;
      changes.push({ id, value: legacy.id });
    }
    if (value === "") throw new Error("Empty account identity");
    return { ...row, [layout.accountId]: value };
  });
  for (const key of layout.uniqueKeys) {
    const seen = new Set<string>();
    for (const row of converted) {
      const identity = JSON.stringify(key.map((field) => atom(row[field])));
      if (seen.has(identity)) throw new Error("Post-conversion composite unique collision");
      seen.add(identity);
    }
  }
  return { accounts, users, converted, changes };
}

/** Docs/test-only offline recipe. Caller owns snapshot, recovery and history certification.
 * No runtime export, endpoint acquisition, authentication bypass or automatic migration.
 */
async function applyLegacyAccountPlan(
  db: Surreal,
  layout: LegacyAccountLayout,
  plan: Awaited<ReturnType<typeof preflightLegacyAccounts>>,
  afterWrite?: () => Promise<void>,
) {
  validateLayout(layout);
  // This check is not concurrency control: all writers MUST remain stopped throughout.
  const current = await readAll(db, layout);
  if (!isDeepStrictEqual(current, { accounts: plan.accounts, users: plan.users }))
    throw new Error("Offline dataset changed");
  for (const change of plan.changes) {
    await db.query(`UPDATE $id SET ${layout.accountId} = $value;`, change);
    await afterWrite?.();
  }
  const post = await preflightLegacyAccounts(db, layout);
  if (
    post.changes.length ||
    !isDeepStrictEqual(post.accounts, plan.converted) ||
    !isDeepStrictEqual(post.users, plan.users)
  )
    throw new Error("Post-write validation failed");
  await db.query(`DEFINE FIELD OVERWRITE ${layout.accountId} ON ${layout.account} TYPE string;`);
}

/** Synthetic owned-fixture execution of the operator recipe; no arbitrary endpoint entry point. */
export async function migrateLegacyFixture(
  owned: Parameters<typeof snapshotLegacyFixture>[0],
  layout: LegacyAccountLayout,
  afterWrite?: () => Promise<void>,
) {
  await snapshotLegacyFixture(owned, [layout.account, layout.user]);
  // Read-only rejection must cause zero mutation, including no destructive restore.
  const plan = await preflightLegacyAccounts(owned.bootstrap, layout);
  try {
    await applyLegacyAccountPlan(owned.bootstrap, layout, plan, afterWrite);
  } catch (original) {
    try {
      await restoreLegacyFixture(owned);
    } catch (recovery) {
      throw new AggregateError(
        [original, recovery],
        "Migration and recovery failed; writes remain stopped",
      );
    }
    throw original;
  }
}

import type { GenerateSchemaParams, GenerateSchemaResult } from "./types";

/**
 * Maps standard Better Auth field types to their corresponding native SurrealQL data types.
 *
 * @param type - The Better Auth field type string.
 * @returns The native SurrealQL type string.
 */
function baseSurrealType(type?: string): string {
  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "bool";
    case "date":
      return "datetime";
    case "json":
      return "object";
    case "string[]":
      return "array<string>";
    case "number[]":
      return "array<number>";
    default:
      return type || "any";
  }
}

/**
 * Builds an ASCII decorative box header for individual table sections.
 *
 * @param text - The text to display inside the box.
 * @param totalWidth - Total width of the ASCII box banner.
 * @returns Array of formatted comment lines.
 */
function buildTableBox(text: string, totalWidth = 76): string[] {
  const contentWidth = totalWidth - 8;
  const lineContent = text.padEnd(contentWidth, " ");
  const top = `-- ╔${"═".repeat(totalWidth - 4)}╗`;
  const mid = `-- ║  ${lineContent}  ║`;
  const bot = `-- ╚${"═".repeat(totalWidth - 4)}╝`;
  return [top, mid, bot];
}

/**
 * Generates a complete, production-ready SurrealQL schema file (.surql)
 * from Better Auth table and field definitions.
 *
 * @param params - Configuration parameters including tables, resolvers, and output path.
 * @returns Result object containing the generated SurrealQL code and output path.
 */
export function generateSchema(params: GenerateSchemaParams): GenerateSchemaResult {
  const {
    file,
    tables,
    getModelName,
    getFieldName,
    getReferencedModel,
    schemaMode = "schemafull",
  } = params;

  const schemaLines: string[] = [];
  const date = new Date();
  const formattedDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} at ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")} UTC`;

  // 1. Decorative File Header
  schemaLines.push(
    "-- ╔════════════════════════════════════════════════════════════════════════╗",
    "-- ║                     SurrealDB Better Auth Schema                       ║",
    "-- ╟────────────────────────────────────────────────────────────────────────╢",
    "-- ║  This schema was auto-generated for Better Auth integration            ║",
    "-- ║  Adapter: surreal-better-auth                                          ║",
    "-- ║  Repo: https://github.com/oskar-gmerek/surreal-better-auth             ║",
    "-- ║  Author: Oskar Gmerek                                                  ║",
    "-- ║                                                                        ║",
    `-- ║  Generation Date: ${formattedDate.padEnd(53)}║`,
    "-- ╟────────────────────────────────────────────────────────────────────────╢",
    "-- ║  Warning: Review the schema prior to deployment in production to       ║",
    "-- ║           ensure all project-specific field requirements are met.      ║",
    "-- ╟────────────────────────────────────────────────────────────────────────╢",
    "-- ║  Tip: Apply this schema via Surrealist Import or SurrealDB CLI:        ║",
    "-- ║       surreal import --conn http://localhost:8000 schema.surql         ║",
    "-- ╚════════════════════════════════════════════════════════════════════════╝",
    "",
    "",
  );

  /**
   * Resolves the exact SurrealQL type definition for a given field,
   * accounting for relations, polymorphic references, and nullability.
   */
  function mapFieldType(
    tableName: string,
    fieldName: string,
    rawType?: string,
    required: boolean = false,
  ): { type: string; isFlexible: boolean } {
    let resolvedBaseType: string | null = null;

    // Special polymorphic case: account.accountId
    try {
      const accountModelName = getModelName("account");
      const userModelName = getModelName("user");
      const accountIdFieldName = getFieldName({
        model: "account",
        field: "accountId",
      });

      if (tableName === accountModelName && fieldName === accountIdFieldName) {
        resolvedBaseType = `record<${userModelName}> | string`;
      }
    } catch {
      // Model not in schema, continue
    }

    // Special OAuth Client reference cases
    try {
      const oauthAppModelName = getModelName("oauthApplication");
      const accessTokenModelName = getModelName("oauthAccessToken");
      const consentModelName = getModelName("oauthConsent");

      if (
        (tableName === accessTokenModelName || tableName === consentModelName) &&
        fieldName === "clientId"
      ) {
        resolvedBaseType = `record<${oauthAppModelName}> | string`;
      }
    } catch {
      // OAuth models not in schema, continue
    }

    // Standard relational reference checking (foreign keys -> record<target_table>)
    if (!resolvedBaseType) {
      const referencedModel = getReferencedModel(tableName, fieldName);
      if (referencedModel) {
        resolvedBaseType = `record<${referencedModel}>`;
      }
    }

    if (!resolvedBaseType) {
      resolvedBaseType = baseSurrealType(rawType);
    }

    const isFlexible = rawType === "json" || resolvedBaseType === "object";

    // Optional fields in SCHEMAFULL must be typed as `option<T | null>`
    // to accept: a typed value, an explicit stored NULL (clearing values), or omitted NONE.
    if (!required) {
      if (resolvedBaseType === "any") {
        return { type: "option<any>", isFlexible };
      }
      return { type: `option<${resolvedBaseType} | null>`, isFlexible };
    }

    return { type: resolvedBaseType, isFlexible };
  }

  const tableMode = schemaMode === "schemaless" ? "SCHEMALESS" : "SCHEMAFULL";

  // 2. Iterate through all schema models and generate DDL
  for (const [internalModelName, tableDef] of Object.entries(tables)) {
    const tableName = getModelName(internalModelName);
    if ((tableDef as any)?.disableMigrations) continue;

    schemaLines.push(...buildTableBox(`TABLE: ${tableName}`));
    schemaLines.push(
      `DEFINE TABLE OVERWRITE ${tableName} ${tableMode} COMMENT 'Better Auth ${internalModelName} table';`,
    );
    schemaLines.push("");

    const fields = (tableDef as any)?.fields || {};
    const createdIndexNames = new Set<string>();

    // Generate field definitions
    for (const [internalFieldName, fieldConfig] of Object.entries<any>(fields)) {
      const fieldName = getFieldName({
        model: internalModelName,
        field: internalFieldName,
      });

      // A field is strictly required ONLY if `required: true` is explicitly configured.
      const isRequired = fieldConfig.required === true;
      const { type: finalType, isFlexible } = mapFieldType(
        tableName,
        fieldName,
        fieldConfig.type?.toString(),
        isRequired,
      );

      const flexibleSuffix = isFlexible ? " FLEXIBLE" : "";
      schemaLines.push(
        `DEFINE FIELD OVERWRITE ${fieldName} ON TABLE ${tableName} TYPE ${finalType}${flexibleSuffix};`,
      );
    }

    schemaLines.push("");

    // Generate single-field indexes & unique constraints
    for (const [internalFieldName, fieldConfig] of Object.entries<any>(fields)) {
      const fieldName = getFieldName({
        model: internalModelName,
        field: internalFieldName,
      });

      if (fieldConfig.unique) {
        const indexName = `idx_${tableName}_${fieldName}_unique`;
        schemaLines.push(
          `DEFINE INDEX OVERWRITE ${indexName} ON TABLE ${tableName} FIELDS ${fieldName} UNIQUE;`,
        );
        createdIndexNames.add(indexName);
      } else if (fieldConfig.index) {
        const indexName = `idx_${tableName}_${fieldName}`;
        schemaLines.push(
          `DEFINE INDEX OVERWRITE ${indexName} ON TABLE ${tableName} FIELDS ${fieldName};`,
        );
        createdIndexNames.add(indexName);
      }
    }

    // Generate table-level composite indexes from schema metadata
    if ((tableDef as any)?.indexes) {
      const rawIndexes = Array.isArray((tableDef as any).indexes)
        ? (tableDef as any).indexes
        : Object.entries<any>((tableDef as any).indexes).map(([k, v]) => ({
            name: v?.name || k,
            ...v,
          }));

      for (const rawIndex of rawIndexes) {
        const columns = rawIndex.fields || rawIndex.columns || [];
        const columnList = (Array.isArray(columns) ? columns : [columns])
          .map((col: string) => getFieldName({ model: internalModelName, field: col }))
          .join(", ");

        if (!columnList) continue;

        const baseIndexName = rawIndex.name || `idx_${tableName}_${columns.join("_")}`;
        const sanitizedIndexName = String(baseIndexName).replace(/[^a-zA-Z0-9_]/g, "_");

        if (!createdIndexNames.has(sanitizedIndexName)) {
          const uniqueClause = rawIndex.unique ? " UNIQUE" : "";
          schemaLines.push(
            `DEFINE INDEX OVERWRITE ${sanitizedIndexName} ON TABLE ${tableName} FIELDS ${columnList}${uniqueClause};`,
          );
          createdIndexNames.add(sanitizedIndexName);
        }
      }
    }

    // Enforce composite account identity indexes if not already emitted
    if (internalModelName === "account") {
      const accountIdField = getFieldName({ model: "account", field: "accountId" });
      const providerIdField = getFieldName({ model: "account", field: "providerId" });
      const issuerField = getFieldName({ model: "account", field: "issuer" });

      const accountProviderIdx = `idx_${tableName}_provider_id_account_id_unique`;
      if (!createdIndexNames.has(accountProviderIdx)) {
        schemaLines.push(
          `DEFINE INDEX OVERWRITE ${accountProviderIdx} ON TABLE ${tableName} FIELDS ${providerIdField}, ${accountIdField} UNIQUE;`,
        );
        createdIndexNames.add(accountProviderIdx);
      }

      if (fields.issuer) {
        const accountIssuerIdx = `idx_${tableName}_account_id_issuer_unique`;
        if (!createdIndexNames.has(accountIssuerIdx)) {
          schemaLines.push(
            `DEFINE INDEX OVERWRITE ${accountIssuerIdx} ON TABLE ${tableName} FIELDS ${accountIdField}, ${issuerField} UNIQUE;`,
          );
          createdIndexNames.add(accountIssuerIdx);
        }
      }
    }

    schemaLines.push("");
  }

  // 3. Organization & Team Plugin SurrealQL Helper Functions
  if (tables.member) {
    const memberTable = getModelName("member");
    const memberUserId = getFieldName({ model: "member", field: "userId" });
    const memberOrgId = getFieldName({ model: "member", field: "organizationId" });
    const memberRole = getFieldName({ model: "member", field: "role" });

    schemaLines.push(
      ...buildTableBox("HELPER FUNCTIONS: Organization Access Control"),
      "-- Returns true if a user is an active member of the specified organization.",
      `DEFINE FUNCTION OVERWRITE fn::auth::organization::member_of($userId: record, $organizationId: record) -> bool {`,
      `    RETURN count(SELECT id FROM ${memberTable} WHERE ${memberUserId} = $userId AND ${memberOrgId} = $organizationId LIMIT 1) > 0;`,
      `};`,
      "",
      "-- Returns the user's role string (e.g. 'owner', 'admin', 'member') or NONE.",
      `DEFINE FUNCTION OVERWRITE fn::auth::organization::get_role($userId: record, $organizationId: record) -> option<string> {`,
      `    RETURN array::first(SELECT VALUE ${memberRole} FROM ${memberTable} WHERE ${memberUserId} = $userId AND ${memberOrgId} = $organizationId LIMIT 1);`,
      `};`,
      "",
      "-- Returns true if the user holds at least the required minimum hierarchy role.",
      `DEFINE FUNCTION OVERWRITE fn::auth::organization::has_role($userId: record, $organizationId: record, $minRole: string) -> bool {`,
      `    LET $role = fn::auth::organization::get_role($userId, $organizationId);`,
      `    IF $role IS NONE { RETURN false };`,
      `    LET $rank = { owner: 3, admin: 2, member: 1 };`,
      `    RETURN ($rank[$role] ?? 0) >= ($rank[$minRole] ?? 0);`,
      `};`,
      "",
      "-- Returns all member records for an organization.",
      `DEFINE FUNCTION OVERWRITE fn::auth::organization::members($organizationId: record) -> array {`,
      `    RETURN SELECT * FROM ${memberTable} WHERE ${memberOrgId} = $organizationId;`,
      `};`,
      "",
    );

    // Dynamic Permission Control helper (if organizationRole table exists)
    if (tables.organizationRole) {
      const orgRoleTable = getModelName("organizationRole");
      const orgRoleOrgId = getFieldName({ model: "organizationRole", field: "organizationId" });
      const orgRoleRole = getFieldName({ model: "organizationRole", field: "role" });
      const orgRolePermission = getFieldName({ model: "organizationRole", field: "permission" });

      schemaLines.push(
        "-- Evaluates fine-grained resource and action permissions for dynamic access control.",
        `DEFINE FUNCTION OVERWRITE fn::auth::organization::has_permission($userId: record, $organizationId: record, $resource: string, $action: string) -> bool {`,
        `    LET $role = fn::auth::organization::get_role($userId, $organizationId);`,
        `    IF $role IS NONE { RETURN false };`,
        `    LET $rows = (SELECT ${orgRolePermission} FROM ${orgRoleTable} WHERE ${orgRoleOrgId} = $organizationId AND ${orgRoleRole} = $role LIMIT 1);`,
        `    IF array::len($rows) == 0 { RETURN false };`,
        `    LET $raw = $rows[0].${orgRolePermission};`,
        `    IF $raw = NONE OR $raw = "" { RETURN false };`,
        `    LET $perms = encoding::json::decode($raw);`,
        `    LET $actions = $perms[$resource];`,
        `    RETURN type::is_array($actions) AND $actions CONTAINS $action;`,
        `};`,
        "",
      );
    }

    // Team Access Control helpers (if team and teamMember tables exist)
    if (tables.teamMember) {
      const teamMemberTable = getModelName("teamMember");
      const tmUserId = getFieldName({ model: "teamMember", field: "userId" });
      const tmTeamId = getFieldName({ model: "teamMember", field: "teamId" });

      schemaLines.push(
        "-- Returns true if a user is a member of the specified team.",
        `DEFINE FUNCTION OVERWRITE fn::auth::team::member_of($userId: record, $teamId: record) -> bool {`,
        `    RETURN count(SELECT id FROM ${teamMemberTable} WHERE ${tmUserId} = $userId AND ${tmTeamId} = $teamId LIMIT 1) > 0;`,
        `};`,
        "",
        "-- Returns all member records for a given team.",
        `DEFINE FUNCTION OVERWRITE fn::auth::team::members($teamId: record) -> array {`,
        `    RETURN SELECT * FROM ${teamMemberTable} WHERE ${tmTeamId} = $teamId;`,
        `};`,
        "",
      );
    }
  }

  const outputPath = file ?? "schema.surql";
  return {
    path: outputPath,
    code: schemaLines.join("\n"),
    overwrite: true,
  };
}

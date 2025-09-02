/**
 * Schema generation utilities for SurrealDB Better Auth adapter.
 * Generates SurrealDB schema definitions with proper field types and indexes.
 */

import type { GenerateSchemaParams, GenerateSchemaResult } from "./types";

/**
 * Generates SurrealDB schema from Better Auth table definitions with proper field types and indexes.
 */
export function generateSchema(
  params: GenerateSchemaParams,
): GenerateSchemaResult {
  const { file, tables, getModelName, getFieldName, getReferencedModel } =
    params;

  const schemaLines: string[] = [];
  const date = new Date();
  const formatted = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} at ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")} UTC`;

  schemaLines.push(
    `-- ╔════════════════════════════════════════════════════════════════════════╗`,
    `-- ║                     SurrealDB Better Auth Schema                       ║`,
    `-- ╟────────────────────────────────────────────────────────────────────────╢`,
    `-- ║  This schema was auto-generated for BetterAuth integration             ║`,
    `-- ║  Adapter: surreal-better-auth                                          ║`,
    `-- ║  Repo: https://github.com/oskar-gmerek/surreal-better-auth             ║`,
    `-- ║  Author: Oskar Gmerek                                                  ║`,
    `-- ║                                                                        ║`,
    `-- ║  Generation Date: ${formatted.padEnd(53)}║`,
    `-- ╟────────────────────────────────────────────────────────────────────────╢`,
    `-- ║  Warning: It is strongly recommended to manually review the schema     ║`,
    `-- ║           after each generation to ensure it fully meets your          ║`,
    `-- ║           project's specific requirements.                             ║`,
    `-- ╟────────────────────────────────────────────────────────────────────────╢`,
    `-- ║  Tip: The easiest way to apply this schema to your db is to copy its   ║`,
    `-- ║       contents and paste them directly into the Surrealist.            ║`,
    `-- ╚════════════════════════════════════════════════════════════════════════╝`,
    "",
    "",
    "",
  );

  /**
   * Builds decorative box around table names in schema output.
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
   * Maps Better Auth field types to SurrealDB types with special cases for references.
   */
  function mapFieldType(
    tableName: string,
    fieldName: string,
    type?: string,
  ): string {
    // Special cases for field-to-table mappings in schema generation
    try {
      const accountModelName = getModelName("account");
      const userModelName = getModelName("user");
      const accountIdFieldName = getFieldName({
        model: "account",
        field: "accountId",
      });

      if (tableName === accountModelName && fieldName === accountIdFieldName) {
        return `record<${userModelName}> | string`;
      }
    } catch (e) {
      // account or user model not in schema, skip
    }

    try {
      const oauthAccessTokenModelName = getModelName("oauthAccessToken");
      const oauthApplicationModelName = getModelName("oauthApplication");
      const oauthAccessTokenIdFieldName = getFieldName({
        model: "oauthAccessToken",
        field: "clientId",
      });

      if (
        tableName === oauthAccessTokenModelName &&
        fieldName === oauthAccessTokenIdFieldName
      ) {
        return `record<${oauthApplicationModelName}>`;
      }
    } catch (e) {
      // oauthAccessToken or oauthApplication model not in schema, skip
    }

    try {
      const oauthConsentModelName = getModelName("oauthConsent");
      const oauthApplicationModelName = getModelName("oauthApplication");
      const oauthConsentIdFieldName = getFieldName({
        model: "oauthConsent",
        field: "clientId",
      });

      if (
        tableName === oauthConsentModelName &&
        fieldName === oauthConsentIdFieldName
      ) {
        return `record<${oauthApplicationModelName}>`;
      }
    } catch (e) {
      // oauthConsent or oauthApplication model not in schema, skip
    }

    const referencedModel = getReferencedModel(tableName, fieldName);
    if (referencedModel) {
      return `record<${referencedModel}>`;
    }

    const typeMap: Record<string, string> = {
      boolean: "bool",
      date: "datetime",
    };

    return typeMap[type || ""] || type || "any";
  }

  // Generate schema for each table
  for (const [internalModelName, tableDef] of Object.entries(tables)) {
    const tableName = getModelName(internalModelName);
    if ((tableDef as any).disableMigrations) continue;

    schemaLines.push(...buildTableBox(`TABLE: ${tableName}`));
    schemaLines.push(`DEFINE TABLE OVERWRITE ${tableName} SCHEMAFULL;`);
    schemaLines.push("");
    schemaLines.push(
      `DEFINE FIELD OVERWRITE id ON TABLE ${tableName} TYPE record<${tableName}>;`,
    );

    // Generate field definitions
    for (const [internalFieldName, field] of Object.entries(
      (tableDef as any).fields,
    )) {
      const fieldName = getFieldName({
        model: internalModelName,
        field: internalFieldName,
      });
      const baseType = mapFieldType(
        tableName,
        fieldName,
        (field as any).type?.toString(),
      );
      const finalType =
        (field as any).required === false ? `option<${baseType}>` : baseType;
      schemaLines.push(
        `DEFINE FIELD OVERWRITE ${fieldName} ON TABLE ${tableName} TYPE ${finalType};`,
      );
    }

    schemaLines.push("");
    schemaLines.push(
      `DEFINE INDEX OVERWRITE idx_${tableName}_id ON ${tableName} COLUMNS id UNIQUE;`,
    );

    // Generate indexes for specific fields
    for (const [internalFieldName, field] of Object.entries(
      (tableDef as any).fields,
    )) {
      const fieldName = getFieldName({
        model: internalModelName,
        field: internalFieldName,
      });

      const indexedFields: Record<string, string | string[]> = {
        user: "email",
        account: "userId",
        session: ["userId", "token"],
        verification: "identifier",
        invitation: ["email", "organizationId"],
        member: ["userId", "organizationId"],
        organization: "slug",
        passkey: "userId",
        twoFactor: "secret",
      };

      const fieldsToIndex = indexedFields[internalModelName];
      const shouldIndex =
        fieldsToIndex &&
        ((Array.isArray(fieldsToIndex) &&
          fieldsToIndex.includes(internalFieldName)) ||
          fieldsToIndex === internalFieldName);

      if (shouldIndex) {
        schemaLines.push(
          `DEFINE INDEX OVERWRITE idx_${tableName}_${fieldName} ON ${tableName} COLUMNS ${fieldName}${(field as any).unique ? ` UNIQUE` : ""};`,
        );
      }
    }
    schemaLines.push("");
  }

  const path = file ?? "schema.surql";
  return {
    path,
    code: schemaLines.join("\n"),
    overwrite: true,
  };
}

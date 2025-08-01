import type { FieldAttribute } from "better-auth/db";
import type { Where } from "better-auth/types";

export const operatorMap: Record<Required<Where>['operator'], string | null> = {
    "eq": "==",
    "ne": "!=",
    "lt": "<",
    "lte": "<=",
    "gt": ">",
    "gte": ">=",
    "contains": "CONTAINS",
    "in": "IN",
    // not operators but functions
    "starts_with": null,
    "ends_with": null,
}

export const typeMap: Record<string, string> = {
    string: "string",
    boolean: "bool",
    number: "number",
    date: "datetime",
    "number[]": "array<number>",
    "string[]": "array<string>",
}

function isDateString(dateString: string) {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
}

export function withApplyDefault(
    value: any,
    field: FieldAttribute,
    action: "create" | "update",
) {
    if (action === "update") {
        return value;
    }
    if (value === undefined || value === null) {
        if (field.defaultValue) {
            if (typeof field.defaultValue === "function") {
                return field.defaultValue();
            }
            return field.defaultValue;
        }
    }
    if (typeof value === 'string' && isDateString(value)) {
        return new Date(value);
    }
    return value;
}
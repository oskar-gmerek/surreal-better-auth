import { FieldAttribute } from "better-auth/db";

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
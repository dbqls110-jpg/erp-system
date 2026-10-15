/** Fixed service identity. This address is an internal identifier, not a mailbox. */
export const DOT_ACCOUNT_ID = "erp-dot-assistant";
export const DOT_ACCOUNT_EMAIL = "dot@agents.erp.invalid";
export const DOT_ROLE = "dot";
export const DOT_RECIPIENT_EMAIL = "dbqls110@gmail.com";
export const DOT_READ_MENUS = new Set([
  "dashboard", "projects", "calendar", "messenger", "venues", "inquiries",
  "customers", "partners", "finance", "companyFinance", "sheets",
]);

export function isDotReadOnly(role: string | null | undefined) {
  return role === DOT_ROLE;
}

/** DOT sessions may browse, but must not invoke Server Actions or ordinary writes. */
export function blocksDotWrite(role: unknown, method: string) {
  return role === DOT_ROLE && method !== "GET" && method !== "HEAD";
}

/**
 * What to call a company on screen.
 *
 * Signup collects only username, email and password — `name` stays null until
 * the account fills in its business profile (see CompanyProfile in types, and
 * assertProfileComplete in companies.controller.ts, which blocks ordering
 * until it's set). Rendering `company.name` directly therefore leaves a blank
 * where a company should be, which is worst in admin: a nameless row in
 * Orders or Invoices is exactly the account someone needs to chase.
 *
 * Falls back to the username, which is always present and is the handle the
 * account signed up with.
 */
export function companyLabel(company: { name?: string | null; username?: string | null }): string {
  return company.name?.trim() || company.username || 'Unnamed company';
}

/**
 * Mirrors isProfileComplete on the server (companies.controller.ts) — the
 * three fields that must be set before an account can order or request a
 * quote. Kept here so admin can show *why* an account has placed no orders
 * rather than leaving it looking merely inactive.
 */
export function isProfileComplete(company: {
  name?: string | null;
  contactName?: string | null;
  phone?: string | null;
}): boolean {
  return Boolean(company.name && company.contactName && company.phone);
}

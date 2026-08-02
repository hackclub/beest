/**
 * Canonical form for country values so the country captured from Hack Club
 * Auth and the keys of shop_items.regional_prices always compare equal:
 * trimmed, uppercased, capped at the users.country column length. Returns
 * null for anything that isn't a non-empty string.
 */
export function normalizeCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.toUpperCase().slice(0, 64);
}

/**
 * Extracts the normalized country from a Hack Club Auth userinfo/identity
 * payload: the singular `address` claim first, falling back to the first
 * entry of the `addresses` array (HCA responses use both shapes).
 */
export function countryFromHcaUserinfo(
  userinfo:
    | { address?: { country?: string }; [key: string]: unknown }
    | null
    | undefined,
): string | null {
  if (!userinfo) return null;
  const addresses = userinfo.addresses;
  const fromArray = Array.isArray(addresses)
    ? (addresses[0] as { country?: string } | undefined)?.country
    : undefined;
  return normalizeCountry(userinfo.address?.country ?? fromArray);
}

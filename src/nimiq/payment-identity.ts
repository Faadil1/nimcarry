export type PaymentSenderRelation =
  | "MATCHES_LISTED_ACCOUNT"
  | "DIFFERS_FROM_LISTED_ACCOUNTS"
  | "NO_LISTED_ACCOUNTS";

export function normalizeNimiqAddress(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function shortNimiqAddress(value: string): string {
  const normalized = normalizeNimiqAddress(value);
  return normalized.length <= 12 ? normalized : `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

/**
 * Diagnostic only.
 *
 * Nimiq Pay may expose a user-facing account identity that is not necessarily
 * the exact on-chain sender used by its outgoing payment rails. This helper
 * deliberately classifies that relationship without deciding whether a route
 * handoff is valid. Canonical custody validation stays fail-closed until a
 * payment-address mapping is independently established.
 */
export function classifyPaymentSender(
  observedSender: string,
  listedAccounts: string[],
): PaymentSenderRelation {
  const listed = listedAccounts.map(normalizeNimiqAddress).filter(Boolean);
  if (listed.length === 0) return "NO_LISTED_ACCOUNTS";
  const observed = normalizeNimiqAddress(observedSender);
  return listed.includes(observed) ? "MATCHES_LISTED_ACCOUNT" : "DIFFERS_FROM_LISTED_ACCOUNTS";
}

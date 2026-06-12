// Pure compatibility-matching logic for the vehicle configurator.
// Extracted so it can be unit-tested without React / Supabase.

const WILDCARD_VALUES = new Set([
  "",
  "*",
  "any",
  "all",
  "qualquer",
  "(qualquer)",
  "todos",
  "todas",
]);

export function normalizeCompatValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isWildcardCompatValue(value: unknown): boolean {
  if (Array.isArray(value))
    return value.length === 0 || value.every(isWildcardCompatValue);
  const normalized = normalizeCompatValue(value);
  return (
    WILDCARD_VALUES.has(normalized) ||
    normalized.replace(/[()]/g, "").trim() === "qualquer"
  );
}

export type CompatRecord = {
  product_id?: string;
  products?: { name?: string; active?: boolean } | null;
  year_from?: number | null;
  year_to?: number | null;
  answers?: Record<string, string | string[]> | null;
};

export type MatchInput = {
  year: number;
  /** Customer answers keyed by question.key -> selected value */
  userAnswers: Record<string, string>;
  /** Keys for questions that were actually part of THIS year's flow */
  flowQuestionKeys: Set<string>;
};

/**
 * Returns true when the compatibility record matches the customer's selection.
 * Strict: any in-flow required filter without a matching answer rejects the product.
 * Lenient on out-of-flow keys (e.g. version filters for OTHER year ranges).
 */
export function matchesCompatRecord(
  record: CompatRecord,
  input: MatchInput,
): boolean {
  const yf = record.year_from ?? 0;
  const yt = record.year_to ?? 9999;
  if (!(input.year >= yf && input.year <= yt)) return false;
  if (record.products && record.products.active === false) return false;

  const required = (record.answers ?? {}) as Record<string, string | string[]>;
  for (const k of Object.keys(required)) {
    const req = required[k];
    if (isWildcardCompatValue(req)) continue;
    const accepted = (Array.isArray(req) ? req : [req])
      .filter((v) => !isWildcardCompatValue(v))
      .map(normalizeCompatValue);
    if (accepted.length === 0) continue;

    const got = normalizeCompatValue(input.userAnswers[k]);

    // Out-of-flow filter (asked only for other years) → skip, don't reject.
    if (!got && !input.flowQuestionKeys.has(k)) continue;

    // In-flow filter with no answer → strict reject.
    if (!got) return false;

    const matched = accepted.some((acc) => {
      const cleanAcc = acc.replace(/[\[\]]/g, "");
      return cleanAcc === got || acc === got;
    });
    if (!matched) return false;
  }
  return true;
}

export function filterCompatibleProducts(
  records: CompatRecord[],
  input: MatchInput,
): CompatRecord[] {
  return records.filter((r) => matchesCompatRecord(r, input));
}

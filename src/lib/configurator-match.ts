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
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function canonicalizeCompatValue(value: unknown): string {
  return normalizeCompatValue(value)
    .replace(/[\[\]]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function compatValuesEqual(expected: unknown, received: unknown): boolean {
  const normalizedExpected = normalizeCompatValue(expected).replace(/[\[\]]/g, "");
  const normalizedReceived = normalizeCompatValue(received).replace(/[\[\]]/g, "");
  return (
    normalizedExpected === normalizedReceived ||
    canonicalizeCompatValue(expected) === canonicalizeCompatValue(received)
  );
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
  id?: string;
  product_id?: string;
  products?: { name?: string; active?: boolean } | { name?: string; active?: boolean }[] | null;
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
  const product = getCompatProduct(record);
  if (product && product.active === false) return false;

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

    const matched = accepted.some((acc) => compatValuesEqual(acc, got));
    if (!matched) return false;
  }
  return true;
}

export function getCompatProduct(record: CompatRecord) {
  return Array.isArray(record.products) ? (record.products[0] ?? null) : (record.products ?? null);
}

export function getCompatRecordDiagnostics(record: CompatRecord, input: MatchInput) {
  const product = getCompatProduct(record);
  const checks: Array<Record<string, unknown>> = [];
  const yf = record.year_from ?? 0;
  const yt = record.year_to ?? 9999;

  if (!(input.year >= yf && input.year <= yt)) {
    return { matches: false, reason: "ano fora da faixa", checks, year_from: yf, year_to: yt, product };
  }
  if (product && product.active === false) {
    return { matches: false, reason: "produto inativo", checks, year_from: yf, year_to: yt, product };
  }

  const required = (record.answers ?? {}) as Record<string, string | string[]>;
  for (const key of Object.keys(required)) {
    const adminValue = required[key];
    const received = input.userAnswers[key];
    const inFlow = input.flowQuestionKeys.has(key);

    if (isWildcardCompatValue(adminValue)) {
      checks.push({ key, status: "ignorado: qualquer", inFlow, adminValue, received });
      continue;
    }

    const accepted = (Array.isArray(adminValue) ? adminValue : [adminValue])
      .filter((value) => !isWildcardCompatValue(value));

    if (accepted.length === 0) {
      checks.push({ key, status: "ignorado: lista vazia/qualquer", inFlow, adminValue, received });
      continue;
    }

    const got = normalizeCompatValue(received);
    if (!got && !inFlow) {
      checks.push({ key, status: "ignorado: fora do fluxo deste ano", inFlow, adminValue, received });
      continue;
    }
    if (!got) {
      checks.push({ key, status: "falhou: resposta ausente", inFlow, adminValue, received });
      return { matches: false, reason: `resposta ausente: ${key}`, checks, year_from: yf, year_to: yt, product };
    }

    const matched = accepted.some((value) => compatValuesEqual(value, got));
    checks.push({
      key,
      status: matched ? "ok" : "falhou: valor diferente",
      inFlow,
      adminValue,
      received,
      receivedNormalizado: normalizeCompatValue(received),
      receivedCanonico: canonicalizeCompatValue(received),
      adminNormalizado: accepted.map(normalizeCompatValue),
      adminCanonico: accepted.map(canonicalizeCompatValue),
    });

    if (!matched) {
      return { matches: false, reason: `valor diferente: ${key}`, checks, year_from: yf, year_to: yt, product };
    }
  }

  return { matches: true, reason: "compatível", checks, year_from: yf, year_to: yt, product };
}

export function filterCompatibleProducts(
  records: CompatRecord[],
  input: MatchInput,
): CompatRecord[] {
  return records.filter((r) => matchesCompatRecord(r, input));
}

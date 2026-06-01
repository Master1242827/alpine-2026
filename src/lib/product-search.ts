// Smart product search with synonyms, year-range matching and relevance ranking.
//
// Strategy:
// - Normalize text (lowercase, strip diacritics, drop punctuation).
// - Expand query tokens using a synonym map (saveiro quadrada ↔ g1 ↔ antiga …).
// - Extract any 4-digit year from the query.
// - For each product, score against: vehicle make/model, year range from
//   vehicle_product_map (or parsed from name), product name, description,
//   category, slug. Higher score = more relevant.

export interface SearchableProduct {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description?: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  images: string[];
  featured: boolean;
  category_name?: string | null;
  // From vehicle_product_map joined with vehicle_models / vehicle_makes:
  vehicles?: Array<{
    make: string | null;
    model: string | null;
    year_from: number | null;
    year_to: number | null;
  }>;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Synonyms / apelidos. Each cluster maps to a canonical set of tokens.
// When any token in a cluster is present in the query, we add every token of
// the cluster to the expanded query.
const SYNONYM_CLUSTERS: string[][] = [
  ["saveiro g1", "saveiro quadrada", "saveiro antiga", "g1 quadrada"],
  ["saveiro g2", "saveiro bola"],
  ["saveiro g3"],
  ["saveiro g4"],
  ["saveiro g5"],
  ["saveiro g6"],
  ["gol g1", "gol quadrado"],
  ["gol g2", "gol bola"],
  ["parati g1", "parati quadrada"],
  ["parati g2", "parati bola"],
  ["s10", "s 10"],
  ["l200", "l 200", "triton"],
  ["hilux"],
  ["ranger"],
  ["amarok"],
  ["frontier"],
  ["vw", "volkswagen"],
  ["chevrolet", "gm"],
  ["cabine simples", "cs"],
  ["cabine dupla", "cd"],
  ["cabine estendida", "ce"],
  ["capota", "capota maritima", "cobertura cacamba", "tampa cacamba"],
];

function expandSynonyms(query: string): string[] {
  const q = norm(query);
  const extras = new Set<string>();
  for (const cluster of SYNONYM_CLUSTERS) {
    const hit = cluster.some((token) => q.includes(norm(token)));
    if (hit) cluster.forEach((t) => extras.add(norm(t)));
  }
  return Array.from(extras);
}

function extractYears(query: string): number[] {
  const out: number[] = [];
  const re = /\b(19\d{2}|20\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) out.push(parseInt(m[1], 10));
  return out;
}

// Parse a year range from a product name when no vehicle mapping is present.
// Captures patterns like "2000 a 2009", "2010 a 2026", "até 1997", "1997".
function parseYearRangeFromName(name: string): { from: number; to: number } | null {
  const n = name.toLowerCase();
  const range = n.match(/(19\d{2}|20\d{2})\s*(?:a|até|ate|-|\/)\s*(19\d{2}|20\d{2})/);
  if (range) return { from: +range[1], to: +range[2] };
  const ate = n.match(/at[eé]\s*(19\d{2}|20\d{2})/);
  if (ate) return { from: 1900, to: +ate[1] };
  const single = n.match(/\b(19\d{2}|20\d{2})\b/);
  if (single) return { from: +single[1], to: +single[1] };
  return null;
}

export interface ScoredProduct extends SearchableProduct {
  __score: number;
}

export function searchProducts(
  products: SearchableProduct[],
  rawQuery: string,
): ScoredProduct[] {
  const term = rawQuery.trim();
  if (!term) return products.map((p) => ({ ...p, __score: 0 }));

  const baseTokens = norm(term).split(" ").filter(Boolean);
  const synonyms = expandSynonyms(term);
  const queryYears = extractYears(term);
  // Tokens excluding year tokens — years are matched separately.
  const textTokens = Array.from(
    new Set(
      [...baseTokens, ...synonyms.flatMap((s) => s.split(" "))].filter(
        (t) => t.length > 1 && !/^(19|20)\d{2}$/.test(t),
      ),
    ),
  );

  const scored: ScoredProduct[] = [];
  for (const p of products) {
    const haystackName = norm(p.name);
    const haystackDesc = norm(`${p.short_description ?? ""} ${p.description ?? ""}`);
    const haystackCategory = norm(p.category_name ?? "");
    const haystackSlug = norm(p.slug);
    const haystackVehicles = (p.vehicles ?? [])
      .map((v) => `${v.make ?? ""} ${v.model ?? ""}`)
      .map(norm)
      .join(" ");

    let score = 0;

    // Token text matches with field weights.
    for (const t of textTokens) {
      if (haystackVehicles.includes(t)) score += 12; // model/make match is strongest
      if (haystackName.includes(t)) score += 8;
      if (haystackCategory.includes(t)) score += 4;
      if (haystackDesc.includes(t)) score += 2;
      if (haystackSlug.includes(t)) score += 1;
    }

    // Phrase bonus: full normalized query appears in name.
    if (haystackName.includes(norm(term))) score += 15;

    // Year compatibility.
    if (queryYears.length) {
      // Build all known ranges for this product.
      const ranges: Array<{ from: number; to: number }> = [];
      for (const v of p.vehicles ?? []) {
        if (v.year_from != null && v.year_to != null) {
          ranges.push({ from: v.year_from, to: v.year_to });
        }
      }
      if (ranges.length === 0) {
        const parsed = parseYearRangeFromName(p.name);
        if (parsed) ranges.push(parsed);
      }
      const anyMatch = queryYears.some((y) =>
        ranges.some((r) => y >= r.from && y <= r.to),
      );
      if (anyMatch) score += 20;
      else if (ranges.length > 0 && textTokens.length === 0) {
        // Pure year query that misses every range → drop the product.
        continue;
      } else if (ranges.length > 0) {
        // Year given but does not fit this product → strong penalty.
        score -= 25;
      }
    }

    if (score > 0) scored.push({ ...p, __score: score });
  }

  scored.sort((a, b) => {
    if (b.__score !== a.__score) return b.__score - a.__score;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return scored;
}

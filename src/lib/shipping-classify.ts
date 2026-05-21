// Pure client-safe classifier — keep in sync with src/lib/shipping.functions.ts
export type SizeClass = "small" | "medium" | "large";

const LARGE_KEYWORDS = [
  "capota", "parachoque", "para-choque", "santo antonio", "santo antônio",
  "estribo", "rack", "grade", "porta-mala", "porta mala", "longarina",
  "tampa traseira", "carroceria",
];
const MEDIUM_KEYWORDS = [
  "farol", "spoiler", "aerofolio", "aerofólio", "vidro",
  "para-lama", "paralama", "capo", "capô", "porta",
];
const SMALL_KEYWORDS = [
  "retrovisor", "sensor", "macaneta", "maçaneta", "lampada", "lâmpada",
  "chave", "emblema", "parafuso", "fusivel", "fusível", "lanterna",
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const RANK: Record<SizeClass, number> = { small: 0, medium: 1, large: 2 };

export function classifyProductSize(p: {
  name: string;
  categoryName?: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}): SizeClass {
  const txt = norm(`${p.name} ${p.categoryName ?? ""}`);
  let byKw: SizeClass | null = null;
  if (LARGE_KEYWORDS.some((k) => txt.includes(norm(k)))) byKw = "large";
  else if (MEDIUM_KEYWORDS.some((k) => txt.includes(norm(k)))) byKw = "medium";
  else if (SMALL_KEYWORDS.some((k) => txt.includes(norm(k)))) byKw = "small";

  const maxDim = Math.max(p.widthCm, p.heightCm, p.lengthCm);
  const sumDim = p.widthCm + p.heightCm + p.lengthCm;
  let byDim: SizeClass = "small";
  if (maxDim > 100 || sumDim > 190 || p.weightKg > 28) byDim = "large";
  else if (maxDim > 60 || sumDim > 120 || p.weightKg > 10) byDim = "medium";

  return byKw && RANK[byKw] > RANK[byDim] ? byKw : byDim;
}

export const SIZE_LABEL: Record<SizeClass, string> = {
  small: "Pequeno",
  medium: "Médio",
  large: "Grande",
};

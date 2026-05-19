// Smart, deterministic image fallback for products and vehicles.
//
// Real photos always win. When none exist we render a clean SVG tile with
// a relevant emoji icon + the item's name. No external network calls, no
// random results — what you see always matches the label.

type Token = { match: RegExp; icon: string; gradient: [string, string] };

// Order matters: first match wins. Tune keywords for PT-BR auto parts.
const PRODUCT_TOKENS: Token[] = [
  { match: /capota|tampa.*ca[cç]amba|cobertura.*ca[cç]amba/i, icon: "🛻", gradient: ["#0f172a", "#1e3a8a"] },
  { match: /farol|head.?light/i, icon: "💡", gradient: ["#1e293b", "#f59e0b"] },
  { match: /lanterna|tail.?light/i, icon: "🚨", gradient: ["#7f1d1d", "#dc2626"] },
  { match: /retrovisor|espelho/i, icon: "🪞", gradient: ["#334155", "#64748b"] },
  { match: /para.?choque|bumper/i, icon: "🚙", gradient: ["#1f2937", "#475569"] },
  { match: /para.?lama|fender/i, icon: "🚗", gradient: ["#1f2937", "#374151"] },
  { match: /grade|grille/i, icon: "🔲", gradient: ["#111827", "#374151"] },
  { match: /capo|hood/i, icon: "🚘", gradient: ["#1e293b", "#3b82f6"] },
  { match: /porta|door/i, icon: "🚪", gradient: ["#334155", "#475569"] },
  { match: /roda|aro|wheel|rim/i, icon: "🛞", gradient: ["#0f172a", "#334155"] },
  { match: /pneu|tire|tyre/i, icon: "🛞", gradient: ["#000000", "#374151"] },
  { match: /banco|seat|estofamento/i, icon: "💺", gradient: ["#3f3f46", "#71717a"] },
  { match: /volante|steering/i, icon: "🎛️", gradient: ["#1f2937", "#52525b"] },
  { match: /escapamento|exhaust|ponteira/i, icon: "🌀", gradient: ["#27272a", "#52525b"] },
  { match: /motor|engine/i, icon: "⚙️", gradient: ["#1c1917", "#57534e"] },
  { match: /amortecedor|suspens[aã]o|shock/i, icon: "🔩", gradient: ["#1f2937", "#475569"] },
  { match: /freio|brake|pastilha|disco/i, icon: "🛑", gradient: ["#7f1d1d", "#b91c1c"] },
  { match: /bateria|battery/i, icon: "🔋", gradient: ["#14532d", "#22c55e"] },
  { match: /[óo]leo|filtro|oil/i, icon: "🛢️", gradient: ["#422006", "#a16207"] },
  { match: /som|alto.?falante|speaker|multim[ií]dia|r[aá]dio/i, icon: "🔊", gradient: ["#1e1b4b", "#4f46e5"] },
  { match: /tapete|carpet|forra[cç][aã]o/i, icon: "🟫", gradient: ["#3f2d18", "#78350f"] },
  { match: /santo.?ant[oô]nio|rollbar|roll.?bar/i, icon: "🛻", gradient: ["#0c0a09", "#44403c"] },
  { match: /estribo|step|side.?bar/i, icon: "🛻", gradient: ["#111827", "#374151"] },
  { match: /engate|reboque|hitch/i, icon: "🪝", gradient: ["#1c1917", "#57534e"] },
  { match: /pelicula|insulfilm|tint/i, icon: "🪟", gradient: ["#020617", "#1e293b"] },
  { match: /chave|key|alarme/i, icon: "🔑", gradient: ["#422006", "#ca8a04"] },
  { match: /limpador|palheta|wiper/i, icon: "💧", gradient: ["#0c4a6e", "#0284c7"] },
  { match: /buzina|horn/i, icon: "📯", gradient: ["#422006", "#a16207"] },
  { match: /vidro|glass|para.?brisa/i, icon: "🪟", gradient: ["#0c4a6e", "#0ea5e9"] },
];

const PRODUCT_DEFAULT: Token = { match: /.*/, icon: "🔧", gradient: ["#0f172a", "#1e293b"] };

// Brand color palettes so each tile actually evokes the brand.
const VEHICLE_BRAND_TOKENS: Token[] = [
  { match: /toyota/i, icon: "🛻", gradient: ["#7a0000", "#eb0a1e"] },
  { match: /ford/i, icon: "🛻", gradient: ["#003478", "#0066b2"] },
  { match: /chevrolet|gm/i, icon: "🛻", gradient: ["#b45309", "#facc15"] },
  { match: /volkswagen|vw/i, icon: "🛻", gradient: ["#001e50", "#1c4dc7"] },
  { match: /fiat/i, icon: "🛻", gradient: ["#7c1d1d", "#c8102e"] },
  { match: /nissan/i, icon: "🛻", gradient: ["#0a0a0a", "#c3002f"] },
  { match: /renault/i, icon: "🛻", gradient: ["#222222", "#efdf00"] },
  { match: /mitsubishi/i, icon: "🛻", gradient: ["#5b0000", "#e60012"] },
  { match: /honda/i, icon: "🚗", gradient: ["#0a0a0a", "#cc0000"] },
  { match: /jeep/i, icon: "🚙", gradient: ["#1d4d2b", "#3b7d3f"] },
  { match: /dodge|ram/i, icon: "🛻", gradient: ["#1a1a1a", "#cc0000"] },
  { match: /peugeot/i, icon: "🚗", gradient: ["#0a0a0a", "#1f6dc9"] },
  { match: /citro[eë]n/i, icon: "🚗", gradient: ["#3a0a3a", "#b91c8f"] },
];

const VEHICLE_MODEL_TOKENS: Token[] = [
  { match: /hilux/i, icon: "🛻", gradient: ["#7a0000", "#eb0a1e"] },          // Toyota
  { match: /ranger|maverick/i, icon: "🛻", gradient: ["#003478", "#0066b2"] }, // Ford
  { match: /s.?10|montana/i, icon: "🛻", gradient: ["#b45309", "#facc15"] },   // Chevrolet
  { match: /amarok|saveiro/i, icon: "🛻", gradient: ["#001e50", "#1c4dc7"] },  // VW
  { match: /strada|toro/i, icon: "🛻", gradient: ["#7c1d1d", "#c8102e"] },     // Fiat
  { match: /frontier/i, icon: "🛻", gradient: ["#0a0a0a", "#c3002f"] },        // Nissan
  { match: /oroch/i, icon: "🛻", gradient: ["#222222", "#efdf00"] },           // Renault
  { match: /l200|triton/i, icon: "🛻", gradient: ["#5b0000", "#e60012"] },     // Mitsubishi
];

const CABIN_TOKENS: Token[] = [
  { match: /simples|single/i, icon: "🛻", gradient: ["#334155", "#64748b"] },
  { match: /estendida|cabine.?e|extended/i, icon: "🛻", gradient: ["#1e3a8a", "#3b82f6"] },
  { match: /dupla|double|crew/i, icon: "🛻", gradient: ["#0f172a", "#1e293b"] },
];

const VEHICLE_DEFAULT: Token = { match: /.*/, icon: "🚗", gradient: ["#1f2937", "#475569"] };

function pickToken(text: string, table: Token[], fallback: Token): Token {
  for (const t of table) if (t.match.test(text)) return t;
  return fallback;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!),
  );
}

function svgTile(token: Token, label: string, size: number): string {
  const safe = escapeXml(label.length > 28 ? label.slice(0, 26) + "…" : label);
  const [c1, c2] = token.gradient;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.15)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
  <rect width="${size}" height="${size}" fill="url(#r)"/>
  <text x="50%" y="48%" font-size="${Math.round(size * 0.4)}" text-anchor="middle" dominant-baseline="middle" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',system-ui,sans-serif">${token.icon}</text>
  <text x="50%" y="86%" font-size="${Math.round(size * 0.065)}" text-anchor="middle" fill="white" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-weight="700" letter-spacing="0.5">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface ProductImageInput {
  images?: string[] | null;
  name?: string | null;
  categoryName?: string | null;
}

export function resolveProductImage(p: ProductImageInput, size = 600): string {
  const real = p.images?.[0];
  if (real) return real;
  const text = `${p.name ?? ""} ${p.categoryName ?? ""}`;
  const token = pickToken(text, PRODUCT_TOKENS, PRODUCT_DEFAULT);
  return svgTile(token, p.name || p.categoryName || "Produto", size);
}

export function resolveVehicleImage(
  opts: { image?: string | null; name: string; kind?: "make" | "model" | "cabin" },
  size = 600,
): string {
  if (opts.image) return opts.image;
  const table =
    opts.kind === "cabin" ? CABIN_TOKENS :
    opts.kind === "model" ? VEHICLE_MODEL_TOKENS :
    VEHICLE_BRAND_TOKENS;
  const token = pickToken(opts.name, table, VEHICLE_DEFAULT);
  return svgTile(token, opts.name, size);
}

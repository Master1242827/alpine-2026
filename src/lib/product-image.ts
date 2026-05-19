// Smart image fallback for products and vehicles.
// Real photos (when uploaded) always take precedence. When missing,
// we serve a keyword-matched stock image so the catalog never shows
// "sem imagem" / broken placeholders.

// Keyword -> stock tags used to fetch a relevant illustrative photo.
// Order matters: first match wins.
const PRODUCT_KEYWORDS: { match: RegExp; tags: string }[] = [
  { match: /capota|tampa|cobertura.*ca[cç]amba/i, tags: "pickup,truck,bed,cover" },
  { match: /farol|head.?light/i, tags: "car,headlight" },
  { match: /lanterna|tail.?light/i, tags: "car,taillight" },
  { match: /retrovisor|espelho/i, tags: "car,mirror" },
  { match: /para.?choque|bumper/i, tags: "car,bumper" },
  { match: /para.?lama|fender/i, tags: "car,fender" },
  { match: /grade|grille/i, tags: "car,grille" },
  { match: /capo|hood/i, tags: "car,hood" },
  { match: /porta|door/i, tags: "car,door" },
  { match: /roda|aro|wheel|rim/i, tags: "car,wheel" },
  { match: /pneu|tire|tyre/i, tags: "car,tire" },
  { match: /banco|seat|estofamento/i, tags: "car,seat,interior" },
  { match: /volante|steering/i, tags: "car,steering,wheel" },
  { match: /escapamento|exhaust|ponteira/i, tags: "car,exhaust" },
  { match: /motor|engine/i, tags: "car,engine" },
  { match: /amortecedor|suspens[aã]o|shock/i, tags: "car,suspension" },
  { match: /freio|brake|pastilha|disco/i, tags: "car,brake,disc" },
  { match: /bateria|battery/i, tags: "car,battery" },
  { match: /[óo]leo|filtro|oil/i, tags: "car,engine,oil" },
  { match: /som|alto.?falante|speaker|multim[ií]dia/i, tags: "car,audio,speaker" },
  { match: /tapete|carpet|forra[cç][aã]o/i, tags: "car,interior,carpet" },
  { match: /santo.?ant[oô]nio|rollbar|roll.?bar/i, tags: "pickup,truck,rollbar" },
  { match: /estribo|step|side.?bar/i, tags: "pickup,truck,step" },
  { match: /engate|reboque|hitch/i, tags: "truck,hitch,trailer" },
  { match: /pelicula|insulfilm|tint/i, tags: "car,window,tint" },
  { match: /chave|key|alarme/i, tags: "car,key" },
  { match: /limpador|palheta|wiper/i, tags: "car,wiper" },
];

const VEHICLE_KEYWORDS: { match: RegExp; tags: string }[] = [
  { match: /hilux/i, tags: "toyota,hilux,pickup" },
  { match: /ranger/i, tags: "ford,ranger,pickup" },
  { match: /s10|s-10/i, tags: "chevrolet,s10,pickup" },
  { match: /amarok/i, tags: "volkswagen,amarok,pickup" },
  { match: /frontier/i, tags: "nissan,frontier,pickup" },
  { match: /strada/i, tags: "fiat,strada,pickup" },
  { match: /toro/i, tags: "fiat,toro,pickup" },
  { match: /saveiro/i, tags: "volkswagen,saveiro,pickup" },
  { match: /montana/i, tags: "chevrolet,montana,pickup" },
  { match: /oroch/i, tags: "renault,oroch,pickup" },
  { match: /l200|triton/i, tags: "mitsubishi,l200,pickup" },
  { match: /maverick/i, tags: "ford,maverick,pickup" },
  { match: /ram/i, tags: "ram,pickup,truck" },
  { match: /toyota/i, tags: "toyota,car" },
  { match: /ford/i, tags: "ford,car" },
  { match: /chevrolet|gm/i, tags: "chevrolet,car" },
  { match: /volkswagen|vw/i, tags: "volkswagen,car" },
  { match: /fiat/i, tags: "fiat,car" },
  { match: /nissan/i, tags: "nissan,car" },
  { match: /renault/i, tags: "renault,car" },
  { match: /mitsubishi/i, tags: "mitsubishi,car" },
  { match: /honda/i, tags: "honda,car" },
  { match: /jeep/i, tags: "jeep,suv" },
  { match: /dodge/i, tags: "dodge,pickup" },
];

const CABIN_KEYWORDS: { match: RegExp; tags: string }[] = [
  { match: /simples|single/i, tags: "pickup,truck,single,cab" },
  { match: /estendida|cabine.?e|extended/i, tags: "pickup,truck,extended,cab" },
  { match: /dupla|double|crew/i, tags: "pickup,truck,crew,cab" },
];

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 1000;
}

function stockUrl(tags: string, seed: string, size = 600): string {
  // loremflickr serves keyword-matched CC-licensed photos. `lock` keeps
  // the result deterministic per product so it doesn't flicker on reload.
  return `https://loremflickr.com/${size}/${size}/${encodeURIComponent(tags)}?lock=${hashSeed(seed)}`;
}

function matchTags(text: string, table: { match: RegExp; tags: string }[], fallback: string) {
  for (const k of table) if (k.match.test(text)) return k.tags;
  return fallback;
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
  const tags = matchTags(text, PRODUCT_KEYWORDS, "car,auto,parts");
  return stockUrl(tags, p.name || tags, size);
}

export function resolveVehicleImage(
  opts: { image?: string | null; name: string; kind?: "make" | "model" | "cabin" },
  size = 600,
): string {
  if (opts.image) return opts.image;
  const table = opts.kind === "cabin" ? CABIN_KEYWORDS : VEHICLE_KEYWORDS;
  const fallback = opts.kind === "cabin" ? "pickup,truck,cab" : "pickup,truck";
  const tags = matchTags(opts.name, table, fallback);
  return stockUrl(tags, opts.name, size);
}

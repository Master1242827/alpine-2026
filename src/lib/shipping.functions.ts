import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProductSchema = z.object({
  id: z.string().min(1),
  width: z.number().min(1),
  height: z.number().min(1),
  length: z.number().min(1),
  weight: z.number().min(0.01),
  insurance_value: z.number().min(0),
  quantity: z.number().int().min(1),
});

const InputSchema = z.object({
  toCep: z.string().min(8).max(9),
  products: z.array(ProductSchema).min(1).max(50),
});

// ===== Frenet types =====
type FrenetService = {
  Carrier?: string;
  CarrierCode?: string;
  ServiceCode?: string;
  ServiceDescription?: string;
  ShippingPrice?: string | number;
  DeliveryTime?: string | number;
  Error?: boolean;
  Msg?: string;
  CarrierLogo?: string;
  OriginalDeliveryTime?: string | number;
  OriginalShippingPrice?: string | number;
};

type FrenetQuoteResponse = {
  ShippingSevicesArray?: FrenetService[];
  ShippingSeviceArray?: FrenetService[]; // some docs use this alt name
  Msg?: string;
};

async function getFrenetConfig() {
  const { data } = await supabaseAdmin
    .from("admin_integrations")
    .select("frenet_token, updated_at")
    .eq("id", 1)
    .maybeSingle();
  const token = (data?.frenet_token || process.env.FRENET_TOKEN || "").trim();
  return { token, updatedAt: data?.updated_at ?? null };
}

export type QuotedOption = {
  id: string;
  name: string;
  priceCents: number;
  deliveryDays: number | null;
  companyPicture: string | null;
};

export type QuoteResult =
  | { options: QuotedOption[]; unavailable: false }
  | { options: []; unavailable: true };

export async function quoteShippingInternal(
  toCep: string,
  products: z.infer<typeof ProductSchema>[],
): Promise<QuoteResult> {
  const { token } = await getFrenetConfig();
  if (!token) {
    console.error("Frenet: token não configurado");
    return { options: [], unavailable: true };
  }

  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("origin_cep")
    .eq("id", 1)
    .maybeSingle();
  const fromCep = (settings?.origin_cep || "").replace(/\D/g, "");
  if (fromCep.length !== 8) {
    return { options: [], unavailable: true };
  }

  const productIds = products.map((p) => p.id);
  const { data: productRows } = await supabaseAdmin
    .from("products")
    .select("id, name, allowed_carriers, blocked_carriers, shipping_weight_kg, shipping_length_cm, shipping_width_cm, shipping_height_cm, categories(slug, name)")
    .in("id", productIds);
  const productMap = new Map<string, {
    name: string;
    categoryName?: string;
    allowed: string[];
    blocked: string[];
    shipWeight?: number | null;
    shipLength?: number | null;
    shipWidth?: number | null;
    shipHeight?: number | null;
  }>();
  for (const r of (productRows ?? []) as Array<{
    id: string;
    name: string;
    allowed_carriers: string[] | null;
    blocked_carriers: string[] | null;
    shipping_weight_kg: number | null;
    shipping_length_cm: number | null;
    shipping_width_cm: number | null;
    shipping_height_cm: number | null;
    categories: { slug: string; name: string } | { slug: string; name: string }[] | null;
  }>) {
    const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    productMap.set(r.id, {
      name: r.name,
      categoryName: cat?.name,
      allowed: r.allowed_carriers ?? [],
      blocked: r.blocked_carriers ?? [],
      shipWeight: r.shipping_weight_kg,
      shipLength: r.shipping_length_cm,
      shipWidth: r.shipping_width_cm,
      shipHeight: r.shipping_height_cm,
    });
  }

  const shippedProducts = products.map((p) => {
    const info = productMap.get(p.id);
    return {
      ...p,
      weight: info?.shipWeight ?? p.weight,
      length: info?.shipLength ?? p.length,
      width: info?.shipWidth ?? p.width,
      height: info?.shipHeight ?? p.height,
    };
  });

  const invoiceValue = shippedProducts.reduce(
    (acc, p) => acc + (p.insurance_value || 0) * p.quantity,
    0,
  );

  const body = {
    SellerCEP: fromCep,
    RecipientCEP: toCep.replace(/\D/g, ""),
    ShipmentInvoiceValue: Number(invoiceValue.toFixed(2)) || 1,
    ShippingItemArray: shippedProducts.map((p) => ({
      Weight: p.weight,
      Length: p.length,
      Height: p.height,
      Width: p.width,
      Quantity: p.quantity,
      SKU: p.id,
      isFragile: false,
    })),
    RecipientCountry: "BR",
  };

  let res: Response;
  try {
    res = await fetch("https://api.frenet.com.br/shipping/quote", {
      method: "POST",
      headers: {
        token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("Frenet: falha de rede", err);
    return { options: [], unavailable: true };
  }

  const raw = await res.text();
  if (!res.ok) {
    console.error(`Frenet [${res.status}]: ${raw.slice(0, 500)}`);
    return { options: [], unavailable: true };
  }

  let parsed: FrenetQuoteResponse;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("Frenet: resposta inválida", raw.slice(0, 300));
    return { options: [], unavailable: true };
  }

  const services = parsed.ShippingSevicesArray ?? parsed.ShippingSeviceArray ?? [];
  const sizeClass = classifyShipmentSize(shippedProducts, productMap);

  const options = services
    .filter((s) => !s.Error && (s.ShippingPrice ?? null) !== null && s.ShippingPrice !== "")
    .map((s) => {
      const priceNum = Number(String(s.ShippingPrice).replace(",", "."));
      const days = s.DeliveryTime != null ? Number(s.DeliveryTime) : null;
      const carrier = s.Carrier ?? "";
      const service = s.ServiceDescription ?? "";
      return {
        id: `${s.CarrierCode ?? carrier}-${s.ServiceCode ?? service}`,
        name: `${carrier} ${service}`.trim() || service || carrier,
        companyName: carrier,
        serviceName: service,
        priceCents: Math.round(priceNum * 100),
        deliveryDays: Number.isFinite(days as number) ? (days as number) : null,
        companyPicture: s.CarrierLogo ?? null,
      };
    })
    .filter((opt) => opt.priceCents > 0)
    .filter((opt) => isCarrierCompatible(opt, sizeClass, products, productMap))
    .sort((a, b) => a.priceCents - b.priceCents)
    .map(({ companyName: _c, serviceName: _s, ...rest }) => rest);

  return { options, unavailable: false };
}

export const quoteShipping = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    return quoteShippingInternal(data.toCep, data.products);
  });

// ===== Smart shipping classification =====
type SizeClass = "small" | "medium" | "large";

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

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function classifyByKeywords(name: string, category?: string): SizeClass | null {
  const txt = normalize(`${name} ${category ?? ""}`);
  if (LARGE_KEYWORDS.some((k) => txt.includes(normalize(k)))) return "large";
  if (MEDIUM_KEYWORDS.some((k) => txt.includes(normalize(k)))) return "medium";
  if (SMALL_KEYWORDS.some((k) => txt.includes(normalize(k)))) return "small";
  return null;
}

function classifyByDimensions(p: { width: number; height: number; length: number; weight: number }): SizeClass {
  const maxDim = Math.max(p.width, p.height, p.length);
  const sumDim = p.width + p.height + p.length;
  if (maxDim > 100 || sumDim > 190 || p.weight > 28) return "large";
  if (maxDim > 60 || sumDim > 120 || p.weight > 10) return "medium";
  return "small";
}

const SIZE_RANK: Record<SizeClass, number> = { small: 0, medium: 1, large: 2 };

function classifyShipmentSize(
  products: Array<{ id: string; width: number; height: number; length: number; weight: number }>,
  map: Map<string, { name: string; categoryName?: string }>,
): SizeClass {
  let worst: SizeClass = "small";
  for (const p of products) {
    const info = map.get(p.id);
    const byKw = info ? classifyByKeywords(info.name, info.categoryName) : null;
    const byDim = classifyByDimensions(p);
    const cls = byKw && SIZE_RANK[byKw] > SIZE_RANK[byDim] ? byKw : byDim;
    if (SIZE_RANK[cls] > SIZE_RANK[worst]) worst = cls;
  }
  return worst;
}

function isCarrierCompatible(
  opt: { name: string; companyName: string; serviceName: string },
  size: SizeClass,
  products: Array<{ id: string }>,
  map: Map<string, { allowed: string[]; blocked: string[] }>,
): boolean {
  const nameLower = opt.name.toLowerCase();
  const isCorreios = /correios/i.test(opt.companyName);
  const isSedex = /sedex/i.test(opt.serviceName);
  const isPac = /\bpac\b/i.test(opt.serviceName);

  for (const p of products) {
    const info = map.get(p.id);
    if (!info) continue;
    if (info.blocked.some((b) => b && nameLower.includes(b.toLowerCase()))) return false;
    if (info.allowed.length > 0 && !info.allowed.some((a) => a && nameLower.includes(a.toLowerCase()))) {
      return false;
    }
  }

  if (size === "large" && (isCorreios || isPac || isSedex)) return false;
  return true;
}

// ============ Admin: integração Frenet ============

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const getShippingIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("admin_integrations")
      .select("frenet_token, updated_at")
      .eq("id", 1)
      .maybeSingle();
    const dbToken = (data?.frenet_token || "").trim();
    const envToken = (process.env.FRENET_TOKEN || "").trim();
    const token = dbToken || envToken;
    return {
      provider: "frenet" as const,
      hasToken: !!token,
      source: dbToken ? ("database" as const) : envToken ? ("env" as const) : ("none" as const),
      updatedAt: data?.updated_at ?? null,
      tokenPreview: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : null,
    };
  });

export const updateShippingIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      token: z.string().min(10).max(4000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("admin_integrations")
      .upsert({
        id: 1,
        frenet_token: data.token.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (error) {
      console.error("[shipping] update integration error", error);
      throw new Error("Falha ao salvar integração. Tente novamente.");
    }
    return { ok: true };
  });

export const testShippingIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { token } = await getFrenetConfig();
    if (!token) {
      return {
        ok: false,
        status: "missing" as const,
        message: "Token da Frenet não configurado. Cadastre um token para ativar o cálculo de frete.",
        account: null as string | null,
      };
    }
    try {
      const res = await fetch("https://api.frenet.com.br/shipping/info", {
        headers: {
          token,
          Accept: "application/json",
        },
      });
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: "expired" as const,
          message: "Token da Frenet inválido ou expirado. Gere um novo token no painel da Frenet.",
          account: null as string | null,
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          status: "error" as const,
          message: `Frenet respondeu com erro (${res.status}). Tente novamente em instantes.`,
          account: null as string | null,
        };
      }
      const body = await res.json().catch(() => ({} as { CompanyName?: string; Email?: string }));
      return {
        ok: true,
        status: "ok" as const,
        message: "Conexão com a Frenet funcionando.",
        account: body?.CompanyName || body?.Email || null,
      };
    } catch {
      return {
        ok: false,
        status: "network" as const,
        message: "Não foi possível conectar à Frenet. Verifique sua conexão.",
        account: null as string | null,
      };
    }
  });

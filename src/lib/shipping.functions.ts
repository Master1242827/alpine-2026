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

type MEService = {
  id: number;
  name: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number;
  company?: { id: number; name: string; picture?: string };
  error?: string;
};

async function getMelhorEnvioConfig() {
  const { data } = await supabaseAdmin
    .from("admin_integrations")
    .select("melhor_envio_token, melhor_envio_env")
    .eq("id", 1)
    .maybeSingle();
  const token = (data?.melhor_envio_token || process.env.MELHOR_ENVIO_TOKEN || "").trim();
  const env = data?.melhor_envio_env || process.env.MELHOR_ENVIO_ENV || "production";
  const base = env === "sandbox"
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br";
  return { token, base, env };
}

export const quoteShipping = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { token, base } = await getMelhorEnvioConfig();
    if (!token) {
      console.error("Melhor Envio: token não configurado");
      return { options: [], unavailable: true as const };
    }

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("origin_cep")
      .eq("id", 1)
      .maybeSingle();
    const fromCep = (settings?.origin_cep || "").replace(/\D/g, "");
    if (fromCep.length !== 8) {
      return { options: [], unavailable: true as const };
    }

    // Carregar dados dos produtos (nome, categoria, overrides, dimensões de envio)
    const productIds = data.products.map((p) => p.id);
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

    // Aplicar dimensões de envio (quando preenchidas pelo admin) — ex.: capota enrolada
    const shippedProducts = data.products.map((p) => {
      const info = productMap.get(p.id);
      return {
        ...p,
        weight: info?.shipWeight ?? p.weight,
        length: info?.shipLength ?? p.length,
        width: info?.shipWidth ?? p.width,
        height: info?.shipHeight ?? p.height,
      };
    });

    let res: Response;
    try {
      res = await fetch(`${base}/api/v2/me/shipment/calculate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Alpine (contato@alpine.local)",
        },
        body: JSON.stringify({
          from: { postal_code: fromCep },
          to: { postal_code: data.toCep.replace(/\D/g, "") },
          products: shippedProducts,
        }),
      });

    } catch (err) {
      console.error("Melhor Envio: falha de rede", err);
      return { options: [], unavailable: true as const };
    }

    const body = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.error("Melhor Envio: token expirado/inválido");
      } else {
        console.error(`Melhor Envio [${res.status}]: ${body.slice(0, 500)}`);
      }
      return { options: [], unavailable: true as const };
    }
    let parsed: MEService[];
    try {
      parsed = JSON.parse(body);
    } catch {
      console.error("Melhor Envio: resposta inválida", body.slice(0, 300));
      return { options: [], unavailable: true as const };
    }

    // ===== Filtro inteligente por tamanho/peso/categoria/nome =====
    const sizeClass = classifyShipmentSize(data.products, productMap);

    const options = parsed
      .filter((s) => !s.error && (s.price ?? s.custom_price))
      .map((s) => ({
        id: String(s.id),
        name: `${s.company?.name ?? ""} ${s.name}`.trim(),
        companyName: s.company?.name ?? "",
        serviceName: s.name,
        priceCents: Math.round(Number(s.custom_price ?? s.price) * 100),
        deliveryDays: s.delivery_time ?? null,
        companyPicture: s.company?.picture ?? null,
      }))
      .filter((opt) => isCarrierCompatible(opt, sizeClass, data.products, productMap))
      .sort((a, b) => a.priceCents - b.priceCents)
      .map(({ companyName: _c, serviceName: _s, ...rest }) => rest);

    return { options, unavailable: false as const };
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
  // Limites Correios: maior dimensão ~105cm, soma ~200cm, peso 30kg.
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

  // Overrides manuais por produto
  for (const p of products) {
    const info = map.get(p.id);
    if (!info) continue;
    if (info.blocked.some((b) => b && nameLower.includes(b.toLowerCase()))) return false;
    if (info.allowed.length > 0 && !info.allowed.some((a) => a && nameLower.includes(a.toLowerCase()))) {
      return false;
    }
  }

  // Produtos grandes: ocultar Correios (PAC/SEDEX) automaticamente
  if (size === "large" && (isCorreios || isPac || isSedex)) return false;
  return true;
}


// ============ Admin: integração Melhor Envio ============

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
      .select("melhor_envio_token, melhor_envio_env, updated_at")
      .eq("id", 1)
      .maybeSingle();
    const dbToken = (data?.melhor_envio_token || "").trim();
    const envToken = (process.env.MELHOR_ENVIO_TOKEN || "").trim();
    const token = dbToken || envToken;
    return {
      hasToken: !!token,
      source: dbToken ? ("database" as const) : envToken ? ("env" as const) : ("none" as const),
      env: data?.melhor_envio_env || "production",
      updatedAt: data?.updated_at ?? null,
      tokenPreview: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : null,
    };
  });

export const updateShippingIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      token: z.string().min(10).max(4000),
      env: z.enum(["production", "sandbox"]).default("production"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("admin_integrations")
      .upsert({
        id: 1,
        melhor_envio_token: data.token.trim(),
        melhor_envio_env: data.env,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testShippingIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { token, base } = await getMelhorEnvioConfig();
    if (!token) {
      return {
        ok: false,
        status: "missing" as const,
        message: "Token do Melhor Envio não configurado. Cadastre um token para ativar o cálculo de frete.",
      };
    }
    try {
      const res = await fetch(`${base}/api/v2/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "Alpine (contato@alpine.local)",
        },
      });
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: "expired" as const,
          message: "Token do Melhor Envio expirado. Gere um novo token.",
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          status: "error" as const,
          message: `Melhor Envio respondeu com erro (${res.status}). Tente novamente em instantes.`,
        };
      }
      const body = await res.json().catch(() => ({} as { name?: string; email?: string }));
      return {
        ok: true,
        status: "ok" as const,
        message: "Conexão com o Melhor Envio funcionando.",
        account: body?.name || body?.email || null,
      };
    } catch {
      return {
        ok: false,
        status: "network" as const,
        message: "Não foi possível conectar ao Melhor Envio. Verifique sua conexão.",
      };
    }
  });

/**
 * Camada de dados do frete (Frenet) com fallback — mesma ideia de
 * checkout-backend.server.ts / admin-backend.server.ts.
 *
 * - Com SUPABASE_SERVICE_ROLE_KEY: acesso direto ao banco.
 * - Sem a chave (servidor Node externo): chama /api/public/checkout/shipping-*
 *   na instalação Lovable, autenticando com CHECKOUT_API_TOKEN / ADMIN_API_TOKEN.
 */

type Json = Record<string, unknown>;

export function hasServiceRole(): boolean {
  return !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
}

function externalConfig() {
  const base =
    process.env["CHECKOUT_API_BASE_URL"] ||
    (process.env["ADMIN_API_BASE_URL"]
      ? process.env["ADMIN_API_BASE_URL"]!.replace(/\/admin\/?$/, "/checkout")
      : "");
  const token = process.env["CHECKOUT_API_TOKEN"] || process.env["ADMIN_API_TOKEN"];
  if (!base || !token) return null;
  return { baseUrl: base.replace(/\/+$/, ""), token };
}

export function externalConfigured(): boolean {
  return !!externalConfig();
}

async function request<T>(method: string, path: string, body?: Json): Promise<T> {
  const cfg = externalConfig();
  if (!cfg) {
    throw new Error(
      "Frete indisponível: configure CHECKOUT_API_BASE_URL e CHECKOUT_API_TOKEN no .env deste servidor (ou use a chave de serviço).",
    );
  }
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-checkout-token": cfg.token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message =
      parsed && typeof parsed === "object" && "error" in (parsed as Json)
        ? String((parsed as Json)["error"])
        : res.status === 401
          ? "API de frete recusou o token (401). O CHECKOUT_API_TOKEN deste servidor precisa ser igual ao configurado no projeto Lovable."
          : `Erro ${res.status} na API de frete`;
    console.error("[shipping-backend] external error", { path, status: res.status, message });
    throw new Error(message);
  }
  return parsed as T;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type ShippingConfig = {
  frenetToken: string;
  updatedAt: string | null;
  originCep: string;
};

export async function getShippingConfig(): Promise<ShippingConfig> {
  if (hasServiceRole()) {
    const client = await db();
    const [{ data: integ }, { data: settings }] = await Promise.all([
      client.from("admin_integrations").select("frenet_token, updated_at").eq("id", 1).maybeSingle(),
      client.from("store_settings").select("origin_cep").eq("id", 1).maybeSingle(),
    ]);
    return {
      frenetToken: String(integ?.frenet_token || "").trim(),
      updatedAt: integ?.updated_at ?? null,
      originCep: String(settings?.origin_cep || "").trim(),
    };
  }
  const out = await request<{ data?: { frenet_token?: string; updated_at?: string | null; origin_cep?: string } }>(
    "GET",
    "/shipping-config",
  );
  return {
    frenetToken: String(out?.data?.frenet_token || "").trim(),
    updatedAt: out?.data?.updated_at ?? null,
    originCep: String(out?.data?.origin_cep || "").trim(),
  };
}

export type ShippingProductRow = {
  id: string;
  name: string;
  allowed_carriers: string[] | null;
  blocked_carriers: string[] | null;
  shipping_weight_kg: number | null;
  shipping_length_cm: number | null;
  shipping_width_cm: number | null;
  shipping_height_cm: number | null;
  categories: { slug: string; name: string } | { slug: string; name: string }[] | null;
};

const SHIPPING_PRODUCT_SELECT =
  "id, name, allowed_carriers, blocked_carriers, shipping_weight_kg, shipping_length_cm, shipping_width_cm, shipping_height_cm, categories(slug, name)";

export async function getShippingProducts(ids: string[]): Promise<ShippingProductRow[]> {
  if (ids.length === 0) return [];
  if (hasServiceRole()) {
    const client = await db();
    const { data } = await client.from("products").select(SHIPPING_PRODUCT_SELECT).in("id", ids);
    return (data ?? []) as ShippingProductRow[];
  }
  try {
    const out = await request<{ data?: ShippingProductRow[] }>("POST", "/shipping-products", { ids });
    return out?.data ?? [];
  } catch {
    return [];
  }
}

export async function saveFrenetToken(token: string): Promise<void> {
  if (hasServiceRole()) {
    const client = await db();
    const { error } = await client
      .from("admin_integrations")
      .upsert({ id: 1, frenet_token: token, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) {
      console.error("[shipping-backend] save token error", error);
      throw new Error("Falha ao salvar integração. Tente novamente.");
    }
    return;
  }
  await request("POST", "/shipping-token", { token });
}

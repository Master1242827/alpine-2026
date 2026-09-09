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
      : "") ||
    "https://project--b370b26e-0ef1-41ec-ae73-c00c6755b5d3.lovable.app/api/public/checkout";
  const token =
    process.env["CHECKOUT_API_TOKEN"] ||
    process.env["ADMIN_API_TOKEN"] ||
    process.env["EXTERNAL_ADMIN_API_TOKEN"];
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
      "Sem conexão com o banco neste servidor. O token foi salvo localmente (arquivo .frenet-token.json) e o frete continua funcionando.",
    );
  }

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-checkout-token": cfg.token },
    signal: AbortSignal.timeout(12000),
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

/** Cliente público (anon) — leitura de dados não sensíveis fora do Lovable. */
async function publicDb(): Promise<any | null> {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as any;
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

  if (externalConfigured()) {
    try {
      const out = await request<{
        data?: { frenet_token?: string; updated_at?: string | null; origin_cep?: string };
      }>("GET", "/shipping-config");
      return {
        frenetToken: String(out?.data?.frenet_token || "").trim(),
        updatedAt: out?.data?.updated_at ?? null,
        originCep: String(out?.data?.origin_cep || "").trim(),
      };
    } catch (err) {
      console.error("[shipping-backend] config via API externa falhou, usando fallback local", err);
    }
  }

  // Fallback local: token salvo no arquivo local / .env + CEP de origem por leitura pública.
  const local = await readLocalToken();
  const envToken = local?.token || String(process.env["FRENET_TOKEN"] || "").trim();
  let originCep = String(process.env["ORIGIN_CEP"] || "").trim();
  if (!originCep) {
    const pub = await publicDb();
    if (pub) {
      const { data } = await pub.from("store_settings").select("origin_cep").eq("id", 1).maybeSingle();
      originCep = String(data?.origin_cep || "").trim();
    }
  }
  return { frenetToken: envToken, updatedAt: local?.updatedAt ?? null, originCep };
}

/** Guarda local do token (servidores externos sem chave de serviço). */
function localTokenPath(): string {
  return process.env["FRENET_TOKEN_FILE"] || `${process.cwd()}/.frenet-token.json`;
}

async function readLocalToken(): Promise<{ token: string; updatedAt: string | null } | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(localTokenPath(), "utf8");
    const parsed = JSON.parse(raw) as { token?: string; updated_at?: string };
    const token = String(parsed?.token || "").trim();
    if (!token) return null;
    return { token, updatedAt: parsed?.updated_at ?? null };
  } catch {
    return null;
  }
}

async function writeLocalToken(token: string): Promise<boolean> {
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      localTokenPath(),
      JSON.stringify({ token, updated_at: new Date().toISOString() }, null, 2),
      "utf8",
    );
    return true;
  } catch (err) {
    console.error("[shipping-backend] falha ao salvar token local", err);
    return false;
  }
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
  if (externalConfigured()) {
    try {
      const out = await request<{ data?: ShippingProductRow[] }>("POST", "/shipping-products", { ids });
      if (out?.data?.length) return out.data;
    } catch (err) {
      console.error("[shipping-backend] produtos via API externa falharam", err);
    }
  }
  try {
    const pub = await publicDb();
    if (!pub) return [];
    const { data } = await pub.from("products").select(SHIPPING_PRODUCT_SELECT).in("id", ids);
    return (data ?? []) as ShippingProductRow[];
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
  if (externalConfigured()) {
    try {
      await request("POST", "/shipping-token", { token });
      await writeLocalToken(token);
      return;
    } catch (err) {
      console.error("[shipping-backend] salvar token via API externa falhou", err);
    }
  }
  const ok = await writeLocalToken(token);
  if (!ok) {
    throw new Error(
      "Não foi possível salvar o token neste servidor. Verifique a permissão de escrita na pasta do site.",
    );
  }
}


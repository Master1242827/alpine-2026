/**
 * Camada de acesso do checkout com fallback (mesma ideia de admin-backend.server.ts).
 *
 * - Com SUPABASE_SERVICE_ROLE_KEY disponível: usa o cliente admin direto.
 * - Sem a chave (ex.: servidor Node externo): chama /api/public/checkout na
 *   instalação Lovable, autenticando com CHECKOUT_API_TOKEN (ou ADMIN_API_TOKEN).
 *
 * Arquivo *.server.ts: nunca entra no bundle do cliente.
 */

type Json = Record<string, unknown>;

export function hasServiceRole(): boolean {
  return !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
}

/** Base pública da instalação Lovable (tem chave de serviço e token do Mercado Pago). */
const PUBLIC_CHECKOUT_FALLBACK_BASE =
  "https://project--b370b26e-0ef1-41ec-ae73-c00c6755b5d3.lovable.app/api/public/checkout";

function externalConfig() {
  const base =
    process.env["CHECKOUT_API_BASE_URL"] ||
    (process.env["ADMIN_API_BASE_URL"]
      ? process.env["ADMIN_API_BASE_URL"]!.replace(/\/admin\/?$/, "/checkout")
      : "") ||
    PUBLIC_CHECKOUT_FALLBACK_BASE;
  const token =
    process.env["CHECKOUT_API_TOKEN"] ||
    process.env["ADMIN_API_TOKEN"] ||
    process.env["EXTERNAL_ADMIN_API_TOKEN"];
  if (!base || !token) return null;
  return { baseUrl: base.replace(/\/+$/, ""), token };
}


async function request<T>(method: string, path: string, body?: Json): Promise<T> {
  const cfg = externalConfig();
  if (!cfg) {
    throw new Error(
      "Checkout indisponível: nem a chave de serviço nem a API externa estão configuradas.",
    );
  }
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-checkout-token": cfg.token,
    },
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
      (parsed && typeof parsed === "object" && "error" in (parsed as Json)
        ? String((parsed as Json)["error"])
        : null) ?? `Erro ${res.status} na API de checkout`;
    console.error("[checkout-backend] external error", { path, status: res.status, message });
    throw new Error(message);
  }
  return parsed as T;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type StoreSettingsRow = {
  pix_enabled?: boolean | null;
  pix_discount_percent?: number | null;
  card_discount_percent?: number | null;
  installments_max?: number | null;
  installments_interest_free?: number | null;
  installments_monthly_rate?: number | null;
  whatsapp_number?: string | null;
  store_name?: string | null;
} | null;

const SETTINGS_SELECT =
  "pix_enabled, pix_discount_percent, card_discount_percent, installments_max, installments_interest_free, installments_monthly_rate, whatsapp_number, store_name";

/** Leitura pública (sem token) na instalação Lovable — dados que a loja já exibe. */
async function publicRequest<T>(method: string, path: string, body?: Json): Promise<T | null> {
  const base = (process.env["CHECKOUT_API_BASE_URL"] || PUBLIC_CHECKOUT_FALLBACK_BASE).replace(
    /\/+$/,
    "",
  );
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(12000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error("[checkout-backend] leitura pública falhou", { path, err });
    return null;
  }
}

export async function getStoreSettings(): Promise<StoreSettingsRow> {
  if (hasServiceRole()) {
    const client = await db();
    const { data } = await client
      .from("store_settings")
      .select(SETTINGS_SELECT)
      .eq("id", 1)
      .maybeSingle();
    return data ?? null;
  }
  if (externalConfig()) {
    try {
      const out = await request<{ data?: StoreSettingsRow }>("GET", "/settings");
      if (out?.data) return out.data;
    } catch (err) {
      console.error("[checkout-backend] settings via API autenticada falhou", err);
    }
  }
  const pub = await publicRequest<{ data?: StoreSettingsRow }>("GET", "/settings-public");
  return pub?.data ?? null;
}

export type ProductRow = { id: string; name: string; price_cents: number; active: boolean };

export async function getProductsByIds(ids: string[]): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  if (hasServiceRole()) {
    const client = await db();
    const { data, error } = await client
      .from("products")
      .select("id,name,price_cents,active")
      .in("id", ids);
    if (error) {
      console.error("[checkout-backend] product lookup error", error);
      throw new Error("Falha ao validar produtos. Tente novamente.");
    }
    return (data ?? []) as ProductRow[];
  }
  if (externalConfig()) {
    try {
      const out = await request<{ data?: ProductRow[] }>("POST", "/products", { ids });
      if (out?.data?.length) return out.data;
    } catch (err) {
      console.error("[checkout-backend] produtos via API autenticada falhou", err);
    }
  }
  const pub = await publicRequest<{ data?: ProductRow[] }>("POST", "/products-public", { ids });
  return pub?.data ?? [];
}

export async function getProductImages(ids: string[]): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  let rows: Array<{ id: string; images: unknown }> = [];
  if (hasServiceRole()) {
    const client = await db();
    const { data } = await client.from("products").select("id, images").in("id", ids);
    rows = (data ?? []) as any;
  } else if (externalConfig()) {
    const out = await request<{ data?: any[] }>("POST", "/product-images", { ids });
    rows = out?.data ?? [];
  } else {
    const out = await publicRequest<{ data?: any[] }>("POST", "/product-images-public", { ids });
    rows = out?.data ?? [];
  }
  return Object.fromEntries(
    rows.map((p) => [p.id, Array.isArray(p.images) && p.images[0] ? String(p.images[0]) : null]),
  );
}


export async function getInstallmentFee(
  installments: number,
): Promise<{ fee_percent: number | null; active: boolean | null } | null> {
  if (hasServiceRole()) {
    const client = await db();
    const { data } = await client
      .from("installment_fees")
      .select("fee_percent,active")
      .eq("installments", installments)
      .maybeSingle();
    return data ?? null;
  }
  if (externalConfig()) {
    try {
      const out = await request<{ data?: any }>("GET", `/installment-fee/${installments}`);
      if (out?.data) return out.data;
    } catch (err) {
      console.error("[checkout-backend] taxa via API autenticada falhou", err);
    }
  }
  const pub = await publicRequest<{ data?: any }>(
    "GET",
    `/installment-fee-public/${installments}`,
  );
  return pub?.data ?? null;

}

export async function createOrder(order: Json): Promise<{ id: string }> {
  if (hasServiceRole()) {
    const client = await db();
    const { data, error } = await client.from("orders").insert(order).select("id").single();
    if (error || !data) {
      console.error("[checkout-backend] create order error", error);
      throw new Error("Falha ao criar pedido. Tente novamente.");
    }
    return data as { id: string };
  }
  if (externalConfig()) {
    try {
      const out = await request<{ data?: { id: string } }>("POST", "/orders", { order });
      if (out?.data?.id) return out.data;
    } catch (err) {
      console.error("[checkout-backend] criar pedido via API autenticada falhou", err);
    }
  }
  const pub = await publicRequest<{ data?: { id: string } }>("POST", "/orders-public", { order });
  if (!pub?.data?.id) throw new Error("Falha ao criar pedido. Tente novamente.");
  return pub.data;
}

export async function insertOrderItems(orderId: string, items: Json[]): Promise<void> {
  if (hasServiceRole()) {
    const client = await db();
    const { error } = await client.from("order_items").insert(items);
    if (error) {
      console.error("[checkout-backend] insert items error", error);
      throw new Error("Falha ao registrar itens do pedido.");
    }
    return;
  }
  if (externalConfig()) {
    try {
      await request("POST", `/orders/${encodeURIComponent(orderId)}/items`, { items });
      return;
    } catch (err) {
      console.error("[checkout-backend] itens via API autenticada falhou", err);
    }
  }
  await publicRequest("POST", "/order-items-public", { order_id: orderId, items });
}

export async function updateOrder(orderId: string, patch: Json): Promise<void> {
  if (hasServiceRole()) {
    const client = await db();
    const { error } = await client.from("orders").update(patch).eq("id", orderId);
    if (error) console.error("[checkout-backend] update order error", { orderId, error });
    return;
  }
  if (externalConfig()) {
    try {
      await request("PATCH", `/orders/${encodeURIComponent(orderId)}`, patch);
      return;
    } catch (err) {
      console.error("[checkout-backend] update order failed", { orderId, err });
    }
  }
  await publicRequest("POST", "/order-patch-public", { order_id: orderId, patch });
}

export async function getOrderWithItems(orderId: string): Promise<any | null> {
  if (hasServiceRole()) {
    const client = await db();
    const { data, error } = await client
      .from("orders")
      .select(
        "id,user_id,total_cents,status,payment_method,mp_payment_id,mp_preference_id,created_at, order_items(product_id, product_name, quantity, unit_price_cents)",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) {
      console.error("[checkout-backend] order lookup error", error);
      throw new Error("Erro ao buscar pedido. Tente novamente.");
    }
    return data ?? null;
  }
  try {
    const out = await request<{ data?: any }>("GET", `/orders/${encodeURIComponent(orderId)}`);
    return out?.data ?? null;
  } catch {
    return null;
  }
}

// ---------- Webhooks (pagamento / logística) ----------

export type OrderRow = Record<string, any> | null;

/**
 * Busca um pedido por id (uuid) ou por código de rastreio.
 * Direto no banco quando há service role; senão via POST /orders/find.
 */
export async function findOrder(opts: {
  id?: string | null;
  trackingCode?: string | null;
}): Promise<OrderRow> {
  const id = opts.id?.trim() || null;
  const trackingCode = opts.trackingCode?.trim() || null;
  if (!id && !trackingCode) return null;

  if (hasServiceRole()) {
    const client = await db();
    let query = client.from("orders").select("*, order_items(*)");
    if (id) query = query.eq("id", id);
    else query = query.eq("tracking_code", trackingCode);
    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error("[checkout-backend] findOrder error", error);
      throw new Error("Erro ao buscar pedido.");
    }
    return data ?? null;
  }

  const out = await request<{ data?: OrderRow }>("POST", "/orders/find", {
    id,
    tracking_code: trackingCode,
  });
  return out?.data ?? null;
}

export type WebhookEventRow = {
  payment_id: string;
  topic?: string | null;
  payment_status?: string | null;
  mapped_status?: string | null;
  order_id?: string | null;
  raw_body?: string | null;
  query_string?: string | null;
};

/**
 * Registra o evento recebido. Retorna { duplicate: true } quando a constraint
 * unique dispara (reentrega do mesmo evento).
 */
export async function recordWebhookEvent(
  row: WebhookEventRow,
): Promise<{ duplicate: boolean; error?: string }> {
  if (hasServiceRole()) {
    const client = await db();
    const { error } = await client.from("mp_webhook_events").insert(row);
    if (error) {
      if (error.code === "23505") return { duplicate: true };
      return { duplicate: false, error: error.message };
    }
    return { duplicate: false };
  }
  try {
    const out = await request<{ duplicate?: boolean; error?: string }>(
      "POST",
      "/webhook-events",
      row as unknown as Json,
    );
    return { duplicate: !!out?.duplicate, ...(out?.error ? { error: out.error } : {}) };
  } catch (err) {
    return { duplicate: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- Mercado Pago ----------

export type MpResult = { status: number; ok: boolean; json: any; text: string };

function hasMpToken() {
  return !!process.env["MERCADO_PAGO_ACCESS_TOKEN"];
}

async function mpDirect(url: string, init: RequestInit): Promise<MpResult> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${process.env["MERCADO_PAGO_ACCESS_TOKEN"]}`,
    },
  });
  const text = await res.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  return { status: res.status, ok: res.ok, json: parsed, text };
}

const MP_PREFERENCES_ENDPOINT = "https://api.mercadopago.com/checkout/preferences";
const MP_PAYMENTS_ENDPOINT = "https://api.mercadopago.com/v1/payments";

export async function mpCreatePreference(body: Json): Promise<MpResult> {
  if (hasMpToken()) {
    return mpDirect(MP_PREFERENCES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return request<MpResult>("POST", "/mp/preference", { body });
}

export async function mpCreatePixPayment(body: Json, idempotencyKey: string): Promise<MpResult> {
  if (hasMpToken()) {
    return mpDirect(MP_PAYMENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
  }
  return request<MpResult>("POST", "/mp/pix", { body, idempotencyKey });
}

/** Cria qualquer pagamento no Mercado Pago (cartão, boleto, pix). */
export async function mpCreatePayment(body: Json, idempotencyKey: string): Promise<MpResult> {
  return mpCreatePixPayment(body, idempotencyKey);
}

/** Chave pública do Mercado Pago (publicável no navegador). */
export function mpPublicKey(): string {
  return process.env["MERCADO_PAGO_PUBLIC_KEY"] ?? "";
}


export async function mpGetPayment(opts: {
  paymentId?: string | null;
  externalReference?: string | null;
}): Promise<MpResult> {
  if (hasMpToken()) {
    const endpoint = opts.paymentId
      ? `${MP_PAYMENTS_ENDPOINT}/${encodeURIComponent(opts.paymentId)}`
      : `${MP_PAYMENTS_ENDPOINT}/search?external_reference=${encodeURIComponent(
          opts.externalReference ?? "",
        )}&sort=date_created&criteria=desc`;
    return mpDirect(endpoint, { method: "GET" });
  }
  return request<MpResult>("POST", "/mp/payment", {
    paymentId: opts.paymentId ?? null,
    externalReference: opts.externalReference ?? null,
  });
}

export function mpConfigured(): boolean {
  return hasMpToken() || !!externalConfig();
}

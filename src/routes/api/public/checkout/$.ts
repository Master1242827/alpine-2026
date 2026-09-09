import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * API pública de checkout para servidores externos (ex.: Node na Hostinger)
 * que não possuem SUPABASE_SERVICE_ROLE_KEY nem o token do Mercado Pago.
 *
 * Autenticação: header `x-checkout-token` / `x-admin-token`
 * (ou `Authorization: Bearer <token>`) com CHECKOUT_API_TOKEN
 * (fallback: EXTERNAL_ADMIN_API_TOKEN).
 *
 * Rotas (prefixo /api/public/checkout):
 *   GET    /settings
 *   POST   /products              { ids: uuid[] }        -> preço/nome/ativo
 *   POST   /product-images        { ids: uuid[] }
 *   GET    /installment-fee/:n
 *   POST   /orders                { order: {...} }       -> { id }
 *   POST   /orders/:id/items      { items: [...] }
 *   PATCH  /orders/:id            { mp_preference_id?, mp_payment_id?, status? }
 *   GET    /orders/:id                                    -> pedido + itens
 *   POST   /mp/preference         { body }
 *   POST   /mp/pix                { body, idempotencyKey }
 *   POST   /mp/payment            { paymentId? | externalReference? }
 */

const MP_PREFERENCES_ENDPOINT = "https://api.mercadopago.com/checkout/preferences";
const MP_PAYMENTS_ENDPOINT = "https://api.mercadopago.com/v1/payments";

const ORDER_STATUSES = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "returned",
  "completed",
  "cancelled",
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorize(request: Request): Response | null {
  const expected =
    process.env["CHECKOUT_API_TOKEN"] || process.env["EXTERNAL_ADMIN_API_TOKEN"];
  if (!expected) return json({ error: "API não configurada" }, 503);
  const provided =
    request.headers.get("x-checkout-token") ??
    request.headers.get("x-admin-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

const uuid = z.string().uuid();
const idsSchema = z.object({ ids: z.array(uuid).min(1).max(100) });

const OrderInsertSchema = z.object({
  user_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().min(1).max(120),
  customer_email: z.string().max(180),
  customer_phone: z.string().max(20),
  customer_cpf: z.string().max(20).nullable().optional(),
  shipping_address: z.record(z.string(), z.unknown()),
  shipping_cost_cents: z.number().int().min(0),
  shipping_service: z.string().max(60).optional(),
  subtotal_cents: z.number().int().min(0),
  discount_cents: z.number().int().min(0),
  total_cents: z.number().int().min(0),
  notes: z.string().max(500).optional(),
  notes_images: z.array(z.string().max(500)).max(6).optional(),
  notes_video_url: z.string().max(500).nullable().optional(),
  status: z.enum(ORDER_STATUSES),
  payment_method: z.string().max(30),
});

const ItemInsertSchema = z.object({
  order_id: uuid,
  product_id: uuid,
  product_name: z.string().min(1).max(255),
  unit_price_cents: z.number().int().min(0),
  quantity: z.number().int().min(1).max(99),
  vehicle_config: z.record(z.string(), z.string()).nullable().optional(),
});

const OrderPatchSchema = z.object({
  mp_preference_id: z.string().max(120).optional(),
  mp_payment_id: z.string().max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  tracking_code: z.string().max(120).nullable().optional(),
  tracking_carrier: z.string().max(120).nullable().optional(),
  shipping_label_url: z.string().max(600).nullable().optional(),
  shipping_label_id: z.string().max(120).nullable().optional(),
  shipped_at: z.string().max(40).nullable().optional(),
  delivered_at: z.string().max(40).nullable().optional(),
});

const WebhookEventSchema = z.object({
  payment_id: z.string().min(1).max(120),
  topic: z.string().max(60).nullable().optional(),
  payment_status: z.string().max(60).nullable().optional(),
  mapped_status: z.string().max(60).nullable().optional(),
  order_id: z.string().max(60).nullable().optional(),
  raw_body: z.string().max(4000).nullable().optional(),
  query_string: z.string().max(1000).nullable().optional(),
});

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function mpFetch(url: string, init: RequestInit) {
  const token = process.env["MERCADO_PAGO_ACCESS_TOKEN"];
  if (!token) return json({ error: "MERCADO_PAGO_ACCESS_TOKEN não configurado" }, 503);
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  return json({ status: res.status, ok: res.ok, json: parsed, text });
}

const PublicQuoteSchema = z.object({
  toCep: z.string().min(8).max(9),
  products: z
    .array(
      z.object({
        id: z.string().min(1),
        width: z.number().min(1),
        height: z.number().min(1),
        length: z.number().min(1),
        weight: z.number().min(0.01),
        insurance_value: z.number().min(0),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(50),
});

async function handle(request: Request, splat: string): Promise<Response> {
  // Cotação de frete é pública (é o que o cliente final já vê na loja),
  // então funciona sem token para servidores externos sem credenciais.
  if (splat.replace(/^\/+|\/+$/g, "") === "shipping-quote" && request.method === "POST") {
    const parsed = PublicQuoteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "dados inválidos" }, 400);
    const { quoteShippingInternal } = await import("@/lib/shipping.functions");
    const data = await quoteShippingInternal(parsed.data.toCep, parsed.data.products);
    return json({ data });
  }

  // Leituras públicas (mesmos dados que a loja já mostra ao cliente final):
  // funcionam sem token para servidores externos sem credenciais.
  {
    const clean = splat.replace(/^\/+|\/+$/g, "");
    const parts = clean.split("/").filter(Boolean);
    if (parts[0]?.endsWith("-public") || parts[0] === "installment-fee-public") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const pdb = supabaseAdmin as any;
      const name = parts[0];

      if (name === "settings-public" && request.method === "GET") {
        const { data } = await pdb
          .from("store_settings")
          .select(
            "pix_enabled, pix_discount_percent, card_discount_percent, installments_max, installments_interest_free, installments_monthly_rate, whatsapp_number, store_name",
          )
          .eq("id", 1)
          .maybeSingle();
        return json({ data });
      }

      if (name === "products-public" && request.method === "POST") {
        const parsed = idsSchema.safeParse(await readBody(request));
        if (!parsed.success) return json({ error: "ids inválidos" }, 400);
        const { data } = await pdb
          .from("products")
          .select("id,name,price_cents,active")
          .in("id", parsed.data.ids);
        return json({ data });
      }

      if (name === "product-images-public" && request.method === "POST") {
        const parsed = idsSchema.safeParse(await readBody(request));
        if (!parsed.success) return json({ error: "ids inválidos" }, 400);
        const { data } = await pdb.from("products").select("id, images").in("id", parsed.data.ids);
        return json({ data });
      }

      if (name === "installment-fee-public" && request.method === "GET" && parts[1]) {
        const n = Number(parts[1]);
        if (!Number.isInteger(n) || n < 1 || n > 12) return json({ error: "parcela inválida" }, 400);
        const { data } = await pdb
          .from("installment_fees")
          .select("fee_percent,active")
          .eq("installments", n)
          .maybeSingle();
        return json({ data });
      }

      // ----- Fluxo de pagamento sem token (mesmas ações que o cliente final
      // já dispara na loja): criar pedido, itens, atualizar e pagar no MP. -----
      if (name === "orders-public" && request.method === "POST") {
        const body = await readBody(request);
        const parsed = OrderInsertSchema.safeParse(body["order"]);
        if (!parsed.success) return json({ error: "pedido inválido" }, 400);
        const { data, error } = await pdb
          .from("orders")
          .insert(parsed.data)
          .select("id")
          .single();
        if (error) return json({ error: "Falha ao criar pedido" }, 500);
        return json({ data });
      }

      if (name === "order-items-public" && request.method === "POST") {
        const body = await readBody(request);
        const orderId = String(body["order_id"] ?? "");
        if (!uuid.safeParse(orderId).success) return json({ error: "id inválido" }, 400);
        const parsed = z.array(ItemInsertSchema).min(1).max(50).safeParse(body["items"]);
        if (!parsed.success) return json({ error: "itens inválidos" }, 400);
        const rows = parsed.data.map((i) => ({ ...i, order_id: orderId }));
        const { error } = await pdb.from("order_items").insert(rows);
        if (error) return json({ error: "Falha ao registrar itens" }, 500);
        return json({ ok: true });
      }

      if (name === "order-patch-public" && request.method === "POST") {
        const body = await readBody(request);
        const orderId = String(body["order_id"] ?? "");
        if (!uuid.safeParse(orderId).success) return json({ error: "id inválido" }, 400);
        const parsed = OrderPatchSchema.safeParse(body["patch"]);
        if (!parsed.success || Object.keys(parsed.data).length === 0) {
          return json({ error: "dados inválidos" }, 400);
        }
        const { error } = await pdb.from("orders").update(parsed.data).eq("id", orderId);
        if (error) return json({ error: "Falha ao atualizar pedido" }, 500);
        return json({ ok: true });
      }

      if (name === "order-get-public" && request.method === "GET" && parts[1]) {
        if (!uuid.safeParse(parts[1]).success) return json({ error: "id inválido" }, 400);
        const { data } = await pdb
          .from("orders")
          .select(
            "id,user_id,total_cents,status,payment_method,mp_payment_id,mp_preference_id,created_at, order_items(product_id, product_name, quantity, unit_price_cents)",
          )
          .eq("id", parts[1])
          .maybeSingle();
        return data ? json({ data }) : json({ error: "não encontrado" }, 404);
      }

      if (name === "mp-preference-public" && request.method === "POST") {
        const body = await readBody(request);
        return mpFetch(MP_PREFERENCES_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body["body"] ?? {}),
        });
      }

      if (name === "mp-pix-public" && request.method === "POST") {
        const body = await readBody(request);
        const key = String(body["idempotencyKey"] ?? crypto.randomUUID());
        return mpFetch(MP_PAYMENTS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Idempotency-Key": key },
          body: JSON.stringify(body["body"] ?? {}),
        });
      }

      if (name === "mp-payment-public" && request.method === "POST") {
        const body = await readBody(request);
        const paymentId = body["paymentId"] ? String(body["paymentId"]) : "";
        const ref = body["externalReference"] ? String(body["externalReference"]) : "";
        if (!paymentId && !ref) return json({ error: "informe paymentId ou externalReference" }, 400);
        const endpoint = paymentId
          ? `${MP_PAYMENTS_ENDPOINT}/${encodeURIComponent(paymentId)}`
          : `${MP_PAYMENTS_ENDPOINT}/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc`;
        return mpFetch(endpoint, { method: "GET" });
      }

      return json({ error: "rota não encontrada" }, 404);
    }
  }

  const denied = authorize(request);
  if (denied) return denied;





  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const seg = splat.split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  const fail = (error: { message: string } | null, msg: string) => {
    if (!error) return null;
    console.error(JSON.stringify({ scope: "checkout-api", path: splat, error: error.message }));
    return json({ error: msg }, 500);
  };

  // ---------- SETTINGS ----------
  if (seg[0] === "settings" && method === "GET") {
    const { data, error } = await db
      .from("store_settings")
      .select(
        "pix_enabled, pix_discount_percent, card_discount_percent, installments_max, installments_interest_free, installments_monthly_rate, whatsapp_number, store_name",
      )
      .eq("id", 1)
      .maybeSingle();
    return fail(error, "Falha ao ler configurações") ?? json({ data });
  }

  // ---------- PRODUCTS ----------
  if (seg[0] === "products" && method === "POST") {
    const parsed = idsSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "ids inválidos" }, 400);
    const { data, error } = await db
      .from("products")
      .select("id,name,price_cents,active")
      .in("id", parsed.data.ids);
    return fail(error, "Falha ao ler produtos") ?? json({ data });
  }

  if (seg[0] === "product-images" && method === "POST") {
    const parsed = idsSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "ids inválidos" }, 400);
    const { data, error } = await db.from("products").select("id, images").in("id", parsed.data.ids);
    return fail(error, "Falha ao ler imagens") ?? json({ data });
  }

  // ---------- FRETE (Frenet) ----------
  if (seg[0] === "shipping-config" && method === "GET") {
    const [{ data: integ, error: e1 }, { data: settings, error: e2 }] = await Promise.all([
      db.from("admin_integrations").select("frenet_token, updated_at").eq("id", 1).maybeSingle(),
      db.from("store_settings").select("origin_cep").eq("id", 1).maybeSingle(),
    ]);
    return (
      fail(e1 || e2, "Falha ao ler configuração de frete") ??
      json({
        data: {
          frenet_token: integ?.frenet_token ?? "",
          updated_at: integ?.updated_at ?? null,
          origin_cep: settings?.origin_cep ?? "",
        },
      })
    );
  }

  if (seg[0] === "shipping-products" && method === "POST") {
    const parsed = idsSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "ids inválidos" }, 400);
    const { data, error } = await db
      .from("products")
      .select(
        "id, name, allowed_carriers, blocked_carriers, shipping_weight_kg, shipping_length_cm, shipping_width_cm, shipping_height_cm, categories(slug, name)",
      )
      .in("id", parsed.data.ids);
    return fail(error, "Falha ao ler produtos do frete") ?? json({ data });
  }

  if (seg[0] === "shipping-token" && method === "POST") {
    const parsed = z
      .object({ token: z.string().min(10).max(4000) })
      .safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "token inválido" }, 400);
    const { error } = await db
      .from("admin_integrations")
      .upsert(
        { id: 1, frenet_token: parsed.data.token.trim(), updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    return fail(error, "Falha ao salvar token") ?? json({ ok: true });
  }

  // ---------- INSTALLMENT FEE ----------

  if (seg[0] === "installment-fee" && method === "GET" && seg[1]) {
    const n = Number(seg[1]);
    if (!Number.isInteger(n) || n < 1 || n > 12) return json({ error: "parcela inválida" }, 400);
    const { data, error } = await db
      .from("installment_fees")
      .select("fee_percent,active")
      .eq("installments", n)
      .maybeSingle();
    return fail(error, "Falha ao ler taxa de parcelamento") ?? json({ data });
  }

  // ---------- WEBHOOK EVENTS (idempotência) ----------
  if (seg[0] === "webhook-events" && method === "POST") {
    const parsed = WebhookEventSchema.safeParse(await readBody(request));
    if (!parsed.success) return json({ error: "evento inválido" }, 400);
    const { error } = await db.from("mp_webhook_events").insert(parsed.data);
    if (error) {
      if ((error as any).code === "23505") return json({ duplicate: true });
      console.error(JSON.stringify({ scope: "checkout-api", path: splat, error: error.message }));
      return json({ duplicate: false, error: error.message });
    }
    return json({ duplicate: false });
  }

  // ---------- ORDERS ----------
  if (seg[0] === "orders") {
    if (method === "POST" && seg[1] === "find") {
      const body = await readBody(request);
      const id = body["id"] ? String(body["id"]) : "";
      const tracking = body["tracking_code"] ? String(body["tracking_code"]) : "";
      let query = db.from("orders").select("*, order_items(*)");
      if (id && uuid.safeParse(id).success) query = query.eq("id", id);
      else if (tracking) query = query.eq("tracking_code", tracking);
      else return json({ error: "informe id ou tracking_code" }, 400);
      const { data, error } = await query.maybeSingle();
      return fail(error, "Falha ao buscar pedido") ?? json({ data: data ?? null });
    }

    if (method === "POST" && !seg[1]) {
      const body = await readBody(request);
      const parsed = OrderInsertSchema.safeParse(body["order"]);
      if (!parsed.success) return json({ error: "pedido inválido" }, 400);
      const { data, error } = await db.from("orders").insert(parsed.data).select("id").single();
      return fail(error, "Falha ao criar pedido") ?? json({ data });
    }

    if (method === "POST" && seg[1] && seg[2] === "items") {
      if (!uuid.safeParse(seg[1]).success) return json({ error: "id inválido" }, 400);
      const body = await readBody(request);
      const parsed = z.array(ItemInsertSchema).min(1).max(50).safeParse(body["items"]);
      if (!parsed.success) return json({ error: "itens inválidos" }, 400);
      const rows = parsed.data.map((i) => ({ ...i, order_id: seg[1] }));
      const { error } = await db.from("order_items").insert(rows);
      return fail(error, "Falha ao registrar itens") ?? json({ ok: true });
    }

    if ((method === "PATCH" || method === "PUT") && seg[1]) {
      if (!uuid.safeParse(seg[1]).success) return json({ error: "id inválido" }, 400);
      const parsed = OrderPatchSchema.safeParse(await readBody(request));
      if (!parsed.success || Object.keys(parsed.data).length === 0) {
        return json({ error: "dados inválidos" }, 400);
      }
      const { error } = await db.from("orders").update(parsed.data).eq("id", seg[1]);
      return fail(error, "Falha ao atualizar pedido") ?? json({ ok: true });
    }

    if (method === "GET" && seg[1]) {
      if (!uuid.safeParse(seg[1]).success) return json({ error: "id inválido" }, 400);
      const { data, error } = await db
        .from("orders")
        .select(
          "id,user_id,total_cents,status,payment_method,mp_payment_id,mp_preference_id,created_at, order_items(product_id, product_name, quantity, unit_price_cents)",
        )
        .eq("id", seg[1])
        .maybeSingle();
      const failed = fail(error, "Falha ao buscar pedido");
      if (failed) return failed;
      return data ? json({ data }) : json({ error: "não encontrado" }, 404);
    }
  }

  // ---------- MERCADO PAGO ----------
  if (seg[0] === "mp" && method === "POST") {
    const body = await readBody(request);
    if (seg[1] === "preference") {
      return mpFetch(MP_PREFERENCES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body["body"] ?? {}),
      });
    }
    if (seg[1] === "pix") {
      const key = String(body["idempotencyKey"] ?? crypto.randomUUID());
      return mpFetch(MP_PAYMENTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Idempotency-Key": key },
        body: JSON.stringify(body["body"] ?? {}),
      });
    }
    if (seg[1] === "payment") {
      const paymentId = body["paymentId"] ? String(body["paymentId"]) : "";
      const ref = body["externalReference"] ? String(body["externalReference"]) : "";
      if (!paymentId && !ref) return json({ error: "informe paymentId ou externalReference" }, 400);
      const endpoint = paymentId
        ? `${MP_PAYMENTS_ENDPOINT}/${encodeURIComponent(paymentId)}`
        : `${MP_PAYMENTS_ENDPOINT}/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc`;
      return mpFetch(endpoint, { method: "GET" });
    }
  }

  return json({ error: "rota não encontrada" }, 404);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,x-checkout-token,x-admin-token,authorization",
};

async function withCors(request: Request, splat: string) {
  const res = await handle(request, splat);
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

export const Route = createFileRoute("/api/public/checkout/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request, params }) => withCors(request, params._splat ?? ""),
      POST: async ({ request, params }) => withCors(request, params._splat ?? ""),
      PATCH: async ({ request, params }) => withCors(request, params._splat ?? ""),
      PUT: async ({ request, params }) => withCors(request, params._splat ?? ""),
    },
  },
});

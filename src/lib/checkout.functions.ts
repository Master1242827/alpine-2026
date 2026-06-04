import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { quoteShippingInternal } from "./shipping.functions";

const MP_PREFERENCES_ENDPOINT = "https://api.mercadopago.com/checkout/preferences";
const MP_PAYMENTS_ENDPOINT = "https://api.mercadopago.com/v1/payments";

type OrderStatus = "pending" | "paid" | "cancelled";

function mapPaymentStatus(status?: string): OrderStatus {
  if (status === "approved" || status === "authorized") return "paid";
  if (["cancelled", "rejected", "refunded", "charged_back"].includes(status ?? "")) return "cancelled";
  return "pending";
}

function getRuntimeOrigin() {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return process.env.SITE_URL || "https://project--b370b26e-0ef1-41ec-ae73-c00c6755b5d3.lovable.app";
  }
}

async function readMercadoPagoResponse(res: Response) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) as any };
  } catch {
    return { text, json: {} as any };
  }
}

function mercadoPagoMessage(json: any, fallback: string) {
  return json?.message || json?.error || json?.cause?.[0]?.description || fallback;
}

// Public, non-sensitive store settings (read from client without auth).
export const getPublicStoreSettings = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("store_settings")
      .select("pix_enabled, pix_discount_percent, whatsapp_number, store_name")
      .eq("id", 1)
      .maybeSingle();
    return {
      pix_enabled: !!data?.pix_enabled,
      pix_discount_percent: Number(data?.pix_discount_percent ?? 0),
      whatsapp_number: data?.whatsapp_number ?? "",
      store_name: data?.store_name ?? "",
    };
  });

const ItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(255),
  // Client-supplied price is IGNORED — server fetches authoritative price from DB.
  // Kept optional for backwards compat with the client payload shape.
  priceCents: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).max(99),
  vehicleConfig: z.record(z.string(), z.string()).optional(),
});

const InputSchema = z.object({
  customer: z.object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(180),
    phone: z.string().min(8).max(20),
  }),
  shipping: z.object({
    cep: z.string().min(8).max(9),
    street: z.string().min(1).max(160),
    number: z.string().min(1).max(20),
    complement: z.string().max(80).optional().default(""),
    district: z.string().min(1).max(80),
    city: z.string().min(1).max(80),
    state: z.string().min(2).max(2),
  }),
  shippingCostCents: z.number().int().min(0).default(0),
  shippingService: z.string().max(60).optional().default("A combinar"),
  notes: z.string().max(500).optional().default(""),
  items: z.array(ItemSchema).min(1).max(50),
  paymentMethod: z.enum(["mercadopago", "pix"]).optional().default("mercadopago"),
  discountCents: z.number().int().min(0).optional().default(0),
});

const OrderLookupSchema = z.object({ orderId: z.string().uuid() });

type ResolvedItem = {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  vehicleConfig?: Record<string, string>;
};

/**
 * SECURITY: Replace client-supplied prices with the authoritative price from the products table,
 * and recompute the PIX discount from store_settings server-side. Never trust client price/discount.
 */
async function resolveCheckoutAmounts(input: z.infer<typeof InputSchema>) {
  const ids = Array.from(new Set(input.items.map((i) => i.productId)));
  const { data: rows, error } = await supabaseAdmin
    .from("products")
    .select("id,name,price_cents,active")
    .in("id", ids);
  if (error) {
    console.error("[checkout] product validation error", error);
    throw new Error("Falha ao validar produtos. Tente novamente.");
  }
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const resolvedItems: ResolvedItem[] = input.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new Error(`Produto indisponível (${i.productId})`);
    if (!p.active) throw new Error(`Produto inativo: ${p.name}`);
    return {
      productId: i.productId,
      name: p.name,
      priceCents: p.price_cents,
      quantity: i.quantity,
      vehicleConfig: i.vehicleConfig,
    };
  });
  const subtotal = resolvedItems.reduce((s, i) => s + i.priceCents * i.quantity, 0);

  // SECURITY: Re-quote shipping server-side and validate against the
  // client-supplied price. Never trust client shippingCostCents — an attacker
  // could send 0 and ship goods for free.
  const requestedShipping = Math.max(0, Math.min(input.shippingCostCents | 0, 1_000_00));
  const quoteProducts = resolvedItems.map((i) => ({
    id: i.productId,
    width: 30,
    height: 10,
    length: 30,
    weight: 1,
    insurance_value: i.priceCents / 100,
    quantity: i.quantity,
  }));
  const quote = await quoteShippingInternal(input.shipping.cep, quoteProducts);
  let shippingCostCents = requestedShipping;
  if (!quote.unavailable && quote.options.length > 0) {
    // Accept if within ±5% or ±R$2 tolerance of any returned option price.
    const ok = quote.options.some((o) => {
      const tolerance = Math.max(200, Math.round(o.priceCents * 0.05));
      return Math.abs(o.priceCents - requestedShipping) <= tolerance;
    });
    if (!ok) {
      const cheapest = Math.min(...quote.options.map((o) => o.priceCents));
      throw new Error(
        `Frete informado (R$ ${(requestedShipping / 100).toFixed(2)}) não corresponde a nenhuma cotação atual. ` +
          `Recalcule o frete (a partir de R$ ${(cheapest / 100).toFixed(2)}).`,
      );
    }
  } else if (requestedShipping === 0 && !quote.unavailable) {
    throw new Error("Selecione uma opção de frete antes de finalizar.");
  }
  // When quote is unavailable (no token / origin CEP missing) we fall back to
  // the client-supplied value, matching the existing "A combinar" behaviour.

  // Recompute discount from server-side store_settings (PIX only).
  let discountCents = 0;
  if (input.paymentMethod === "pix") {
    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("pix_enabled,pix_discount_percent")
      .eq("id", 1)
      .maybeSingle();
    if (settings?.pix_enabled && settings.pix_discount_percent) {
      discountCents = Math.floor((subtotal * Number(settings.pix_discount_percent)) / 100);
    }
  }

  const total = Math.max(0, subtotal + shippingCostCents - discountCents);
  return { resolvedItems, subtotal, shippingCostCents, discountCents, total };
}


export const createCheckoutPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN is not configured");

    const { resolvedItems, subtotal, shippingCostCents, discountCents, total } =
      await resolveCheckoutAmounts(data);

    // Create order (pending)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: context.userId,
        customer_name: data.customer.name,
        customer_email: data.customer.email,
        customer_phone: data.customer.phone,
        shipping_address: data.shipping,
        shipping_cost_cents: shippingCostCents,
        shipping_service: data.shippingService,
        subtotal_cents: subtotal,
        discount_cents: discountCents,
        total_cents: total,
        notes: data.notes,
        status: "pending",
        payment_method: data.paymentMethod,
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

    const itemsRows = resolvedItems.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      product_name: i.name,
      unit_price_cents: i.priceCents,
      quantity: i.quantity,
      vehicle_config: i.vehicleConfig ?? null,
    }));
    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(itemsRows);
    if (itemsErr) throw new Error(itemsErr.message);

    const origin = getRuntimeOrigin();
    const mpItems = data.paymentMethod === "pix" && discountCents > 0
      ? [{
          id: order.id,
          title: `Pedido Alpine #${String(order.id).slice(0, 8)} com frete e desconto PIX`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number((total / 100).toFixed(2)),
        }]
      : resolvedItems.map((i) => ({
          id: i.productId,
          title: i.name.slice(0, 250),
          quantity: i.quantity,
          currency_id: "BRL",
          unit_price: Number((i.priceCents / 100).toFixed(2)),
        }));
    if (!(data.paymentMethod === "pix" && discountCents > 0) && shippingCostCents > 0) {
      mpItems.push({
        id: "shipping",
        title: `Frete (${data.shippingService})`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number((shippingCostCents / 100).toFixed(2)),
      });
    }


    const [firstName, ...rest] = data.customer.name.split(" ");
    const paymentMethods = data.paymentMethod === "pix"
      ? { excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }, { id: "atm" }] }
      : { excluded_payment_types: [{ id: "bank_transfer" }] };
    const preferenceBody = {
      items: mpItems,
      payer: {
        name: firstName,
        surname: rest.join(" ") || firstName,
        email: data.customer.email,
        phone: { number: data.customer.phone },
        address: {
          zip_code: data.shipping.cep.replace(/\D/g, ""),
          street_name: data.shipping.street,
          street_number: Number(data.shipping.number.replace(/\D/g, "")) || 0,
        },
      },
      external_reference: order.id,
      notification_url: `${origin}/api/public/webhooks/mercadopago`,
      back_urls: {
        success: `${origin}/checkout/aprovado?order=${order.id}`,
        failure: `${origin}/checkout/recusado?order=${order.id}`,
        pending: `${origin}/checkout/pendente?order=${order.id}`,
      },
      auto_return: "approved",
      payment_methods: paymentMethods,
      statement_descriptor: "ALPINE",
    };

    console.info("[MercadoPago] create preference", { endpoint: MP_PREFERENCES_ENDPOINT, orderId: order.id, paymentMethod: data.paymentMethod, totalCents: total });
    const res = await fetch(MP_PREFERENCES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    });
    const { text, json } = await readMercadoPagoResponse(res);
    const redirectUrl = json.init_point || json.sandbox_init_point;
    if (!res.ok || !json.id || !redirectUrl) {
      console.error("[MercadoPago] preference error", { endpoint: MP_PREFERENCES_ENDPOINT, status: res.status, body: text, orderId: order.id });
      throw new Error(`Mercado Pago preference_id error [${res.status}]: ${mercadoPagoMessage(json, "preference failed")}`);
    }

    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({ mp_preference_id: json.id })
      .eq("id", order.id);
    if (updateErr) console.error("[MercadoPago] order preference update error", { orderId: order.id, message: updateErr.message });

    console.info("[MercadoPago] preference ready", { orderId: order.id, preferenceId: json.id, redirectUrl });
    return { orderId: order.id, initPoint: redirectUrl as string, preferenceId: json.id as string };
  });

export const getOrderPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrderLookupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id,user_id,total_cents,status,payment_method,mp_payment_id,mp_preference_id,created_at")
      .eq("id", data.orderId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar pedido: ${error.message}`);
    if (!order || order.user_id !== context.userId) throw new Error("Pedido não encontrado");

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (token && order.status === "pending") {
      const endpoint = order.mp_payment_id
        ? `${MP_PAYMENTS_ENDPOINT}/${order.mp_payment_id}`
        : `${MP_PAYMENTS_ENDPOINT}/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc`;
      try {
        console.info("[MercadoPago] status check", { endpoint, orderId: order.id });
        const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        const { text, json } = await readMercadoPagoResponse(res);
        if (!res.ok) {
          console.error("[MercadoPago] status check error", { endpoint, status: res.status, body: text, orderId: order.id });
        } else {
          const payment = order.mp_payment_id ? json : json?.results?.[0];
          if (payment?.id && payment?.status) {
            const nextStatus = mapPaymentStatus(payment.status);
            const { error: updateErr } = await supabaseAdmin
              .from("orders")
              .update({ status: nextStatus, mp_payment_id: String(payment.id) })
              .eq("id", order.id);
            if (updateErr) console.error("[MercadoPago] status update error", { orderId: order.id, message: updateErr.message });
            return {
              id: order.id,
              shortId: String(order.id).slice(0, 8).toUpperCase(),
              totalCents: order.total_cents,
              status: nextStatus,
              paymentMethod: order.payment_method,
              paymentId: String(payment.id),
              preferenceId: order.mp_preference_id,
              paymentStatus: payment.status as string,
              statusDetail: payment.status_detail as string | undefined,
            };
          }
        }
      } catch (err) {
        console.error("[MercadoPago] status check failed", { orderId: order.id, message: err instanceof Error ? err.message : String(err) });
      }
    }

    return {
      id: order.id,
      shortId: String(order.id).slice(0, 8).toUpperCase(),
      totalCents: order.total_cents,
      status: order.status,
      paymentMethod: order.payment_method,
      paymentId: order.mp_payment_id,
      preferenceId: order.mp_preference_id,
      paymentStatus: order.status,
      statusDetail: undefined,
    };
  });

export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN is not configured");

    const { resolvedItems, subtotal, shippingCostCents, discountCents, total } =
      await resolveCheckoutAmounts({ ...data, paymentMethod: "pix" });

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: context.userId,
        customer_name: data.customer.name,
        customer_email: data.customer.email,
        customer_phone: data.customer.phone,
        shipping_address: data.shipping,
        shipping_cost_cents: shippingCostCents,
        shipping_service: data.shippingService,
        subtotal_cents: subtotal,
        discount_cents: discountCents,
        total_cents: total,
        notes: data.notes,
        status: "pending",
        payment_method: "pix",
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

    const itemsRows = resolvedItems.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      product_name: i.name,
      unit_price_cents: i.priceCents,
      quantity: i.quantity,
      vehicle_config: i.vehicleConfig ?? null,
    }));
    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(itemsRows);
    if (itemsErr) throw new Error(itemsErr.message);

    const origin = getRuntimeOrigin();
    const [firstName, ...rest] = data.customer.name.split(" ");
    const expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace("Z", "-00:00");
    const pixBody = {
      transaction_amount: Number((total / 100).toFixed(2)),
      description: `Pedido Alpine #${String(order.id).slice(0, 8)}`,
      payment_method_id: "pix",
      external_reference: order.id,
      notification_url: `${origin}/api/public/webhooks/mercadopago`,
      date_of_expiration: expiration,
      payer: {
        email: data.customer.email,
        first_name: firstName,
        last_name: rest.join(" ") || firstName,
      },
    };

    console.info("[MercadoPago] create pix payment", { endpoint: MP_PAYMENTS_ENDPOINT, orderId: order.id, totalCents: total });
    const res = await fetch(MP_PAYMENTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `pix-${order.id}`,
      },
      body: JSON.stringify(pixBody),
    });
    const { text, json } = await readMercadoPagoResponse(res);
    const qrCode = json?.point_of_interaction?.transaction_data?.qr_code as string | undefined;
    const qrCodeBase64 = json?.point_of_interaction?.transaction_data?.qr_code_base64 as string | undefined;
    const ticketUrl = json?.point_of_interaction?.transaction_data?.ticket_url as string | undefined;
    if (!res.ok || !json?.id || !qrCode) {
      console.error("[MercadoPago] pix error", { endpoint: MP_PAYMENTS_ENDPOINT, status: res.status, body: text, orderId: order.id });
      throw new Error(`Mercado Pago PIX error [${res.status}]: ${mercadoPagoMessage(json, "pix failed")}`);
    }

    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({ mp_payment_id: String(json.id) })
      .eq("id", order.id);
    if (updateErr) console.error("[MercadoPago] order pix update error", { orderId: order.id, message: updateErr.message });

    console.info("[MercadoPago] pix ready", { orderId: order.id, paymentId: json.id });
    return {
      orderId: order.id,
      paymentId: String(json.id),
      qrCode,
      qrCodeBase64,
      ticketUrl,
      totalCents: total,
      expiresAt: expiration,
    };
  });


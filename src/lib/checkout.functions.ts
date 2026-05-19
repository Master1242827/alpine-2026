import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(255),
  priceCents: z.number().int().positive(),
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
  userId: z.string().uuid().nullable().optional(),
});

export const createCheckoutPreference = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN is not configured");

    const subtotal = data.items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
    const total = subtotal + data.shippingCostCents;

    // Create order (pending)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: data.userId ?? null,
        customer_name: data.customer.name,
        customer_email: data.customer.email,
        customer_phone: data.customer.phone,
        shipping_address: data.shipping,
        shipping_cost_cents: data.shippingCostCents,
        shipping_service: data.shippingService,
        subtotal_cents: subtotal,
        total_cents: total,
        notes: data.notes,
        status: "pending",
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

    const itemsRows = data.items.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      product_name: i.name,
      unit_price_cents: i.priceCents,
      quantity: i.quantity,
      vehicle_config: i.vehicleConfig ?? null,
    }));
    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(itemsRows);
    if (itemsErr) throw new Error(itemsErr.message);

    // Build MP preference
    const origin =
      process.env.SITE_URL ||
      `https://project--${process.env.VITE_LOVABLE_PROJECT_ID ?? "b370b26e-0ef1-41ec-ae73-c00c6755b5d3"}.lovable.app`;

    const mpItems = data.items.map((i) => ({
      id: i.productId,
      title: i.name.slice(0, 250),
      quantity: i.quantity,
      currency_id: "BRL",
      unit_price: Number((i.priceCents / 100).toFixed(2)),
    }));
    if (data.shippingCostCents > 0) {
      mpItems.push({
        id: "shipping",
        title: `Frete (${data.shippingService})`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number((data.shippingCostCents / 100).toFixed(2)),
      });
    }

    const [firstName, ...rest] = data.customer.name.split(" ");
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
        success: `${origin}/checkout/sucesso?order=${order.id}`,
        failure: `${origin}/checkout/falha?order=${order.id}`,
        pending: `${origin}/checkout/sucesso?order=${order.id}`,
      },
      auto_return: "approved",
      statement_descriptor: "AUTOPREMIUM",
    };

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    });
    const json = (await res.json()) as { id?: string; init_point?: string; message?: string };
    if (!res.ok || !json.id || !json.init_point) {
      throw new Error(`Mercado Pago error [${res.status}]: ${json.message ?? "preference failed"}`);
    }

    await supabaseAdmin
      .from("orders")
      .update({ mp_preference_id: json.id })
      .eq("id", order.id);

    return { orderId: order.id, initPoint: json.init_point, preferenceId: json.id };
  });

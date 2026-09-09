import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { quoteShippingInternal } from "./shipping.functions";

const MP_PREFERENCES_ENDPOINT = "https://api.mercadopago.com/checkout/preferences";
const MP_PAYMENTS_ENDPOINT = "https://api.mercadopago.com/v1/payments";

/** Camada de dados/pagamento: usa a chave de serviço quando existe, senão a API pública. */
async function backend() {
  return await import("./checkout-backend.server");
}


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
    const data = await (await backend()).getStoreSettings();

    return {
      pix_enabled: !!data?.pix_enabled,
      pix_discount_percent: Number(data?.pix_discount_percent ?? 0),
      card_discount_percent: Number(data?.card_discount_percent ?? 0),
      installments_max: Number(data?.installments_max ?? 10),
      installments_interest_free: Number(data?.installments_interest_free ?? 1),
      installments_monthly_rate: Number(data?.installments_monthly_rate ?? 0),
      whatsapp_number: data?.whatsapp_number ?? "",
      store_name: data?.store_name ?? "",
      mp_public_key: (await backend()).mpPublicKey(),

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
    cpf: z.string().max(20).optional().default(""),
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
  notesImages: z.array(z.string().url().max(500)).max(6).optional().default([]),
  notesVideoUrl: z.string().url().max(500).optional().nullable(),
  items: z.array(ItemSchema).min(1).max(50),
  paymentMethod: z.enum(["mercadopago", "card", "boleto", "pix"]).optional().default("card"),
  discountCents: z.number().int().min(0).optional().default(0),
  installments: z.number().int().min(1).max(12).optional().default(1),
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
  const be = await backend();
  const rows = await be.getProductsByIds(ids);
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

  // Recompute discount from server-side store_settings.
  // PIX and card à vista both may have discounts; store settings drives the values.
  let discountCents = 0;
  const settings = await be.getStoreSettings();
  if (input.paymentMethod === "pix" && settings?.pix_enabled && settings?.pix_discount_percent) {
    discountCents = Math.floor((subtotal * Number(settings.pix_discount_percent)) / 100);
  } else if (input.paymentMethod === "card" || input.paymentMethod === "boleto") {
    // Cartão/boleto: o desconto por parcela (installment_fees) manda; se não houver
    // linha ativa para a parcela escolhida, cai no desconto único de store_settings.
    const n = input.paymentMethod === "boleto" ? 1 : Math.max(1, Math.min(12, input.installments ?? 1));
    const feeRow = await be.getInstallmentFee(n);

    const percent =
      feeRow?.active && feeRow.fee_percent != null
        ? Number(feeRow.fee_percent)
        : Number(settings?.card_discount_percent ?? 0);
    if (percent > 0) discountCents = Math.floor((subtotal * percent) / 100);
  }

  const total = Math.max(0, subtotal + shippingCostCents - discountCents);
  return { resolvedItems, subtotal, shippingCostCents, discountCents, total };
}



export const createCheckoutPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const be = await backend();
    if (!be.mpConfigured()) throw new Error("Pagamento não configurado neste ambiente.");

    const { resolvedItems, subtotal, shippingCostCents, discountCents, total } =
      await resolveCheckoutAmounts(data);

    // Create order (pending)
    const order = await be.createOrder({
      user_id: context.userId,
      customer_name: data.customer.name,
      customer_email: data.customer.email,
      customer_phone: data.customer.phone,
      customer_cpf: (data.customer.cpf || "").replace(/\D/g, "") || null,
      shipping_address: data.shipping,
      shipping_cost_cents: shippingCostCents,
      shipping_service: data.shippingService,
      subtotal_cents: subtotal,
      discount_cents: discountCents,
      total_cents: total,
      notes: data.notes,
      notes_images: data.notesImages ?? [],
      notes_video_url: data.notesVideoUrl ?? null,
      status: "pending",
      payment_method: data.paymentMethod,
    });

    const itemsRows = resolvedItems.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      product_name: i.name,
      unit_price_cents: i.priceCents,
      quantity: i.quantity,
      vehicle_config: i.vehicleConfig ?? null,
    }));
    await be.insertOrderItems(order.id, itemsRows);


    const origin = getRuntimeOrigin();
    // Sempre usa 1 linha consolidada quando há desconto, para o total bater com o MP.
    const consolidated = discountCents > 0;
    const mpItems = consolidated
      ? [{
          id: order.id,
          title: `Pedido Alpine #${String(order.id).slice(0, 8)}`,
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
    if (!consolidated && shippingCostCents > 0) {
      mpItems.push({
        id: "shipping",
        title: `Frete (${data.shippingService})`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number((shippingCostCents / 100).toFixed(2)),
      });
    }

    // Configurações de parcelamento (via store_settings)
    const paySettings = await be.getStoreSettings();
    const maxInstallments = Math.max(1, Math.min(12, Number(paySettings?.installments_max ?? 10)));


    const [firstName, ...rest] = data.customer.name.split(" ");
    let paymentMethods: any;
    if (data.paymentMethod === "pix") {
      paymentMethods = {
        excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }, { id: "atm" }],
      };
    } else if (data.paymentMethod === "boleto") {
      paymentMethods = {
        excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "bank_transfer" }, { id: "atm" }],
      };
    } else {
      // card (padrão) — permite crédito/débito, exclui boleto e PIX
      // O desconto já foi calculado para a parcela escolhida, então trava o
      // parcelamento nesse número para o valor cobrado bater com o exibido.
      const chosen = Math.max(1, Math.min(maxInstallments, data.installments ?? 1));
      paymentMethods = {
        excluded_payment_types: [{ id: "ticket" }, { id: "bank_transfer" }, { id: "atm" }],
        installments: chosen,
        default_installments: chosen,
      };
    }

    const cpfDigits = (data.customer.cpf || "").replace(/\D/g, "");
    const preferenceBody: any = {
      items: mpItems,
      payer: {
        name: firstName,
        surname: rest.join(" ") || firstName,
        email: data.customer.email,
        phone: { number: data.customer.phone },
        ...(cpfDigits.length === 11 && {
          identification: { type: "CPF", number: cpfDigits },
        }),
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
    const res = await be.mpCreatePreference(preferenceBody);
    const json = res.json ?? {};
    const text = res.text;
    const redirectUrl = json.init_point || json.sandbox_init_point;
    if (!res.ok || !json.id || !redirectUrl) {
      console.error("[MercadoPago] preference error", { endpoint: MP_PREFERENCES_ENDPOINT, status: res.status, body: text, orderId: order.id });
      throw new Error(`Mercado Pago preference_id error [${res.status}]: ${mercadoPagoMessage(json, "preference failed")}`);
    }

    await be.updateOrder(order.id, { mp_preference_id: String(json.id) });


    console.info("[MercadoPago] preference ready", { orderId: order.id, preferenceId: json.id, redirectUrl });
    return { orderId: order.id, initPoint: redirectUrl as string, preferenceId: json.id as string };
  });

export const getOrderPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrderLookupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const be = await backend();
    const order = await be.getOrderWithItems(data.orderId);
    if (!order || order.user_id !== context.userId) throw new Error("Pedido não encontrado");

    // Buscar imagem de capa de cada produto para exibir na tela de confirmação
    const productIds = (order.order_items ?? []).map((i: any) => i.product_id).filter(Boolean);
    const imagesByProduct: Record<string, string | null> =
      productIds.length > 0 ? await be.getProductImages(productIds) : {};

    const items = (order.order_items ?? []).map((i: any) => ({
      productId: i.product_id,
      name: i.product_name,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      image: imagesByProduct[i.product_id] ?? null,
    }));

    const buildResult = (status: OrderStatus, paymentId?: string, paymentStatus?: string, statusDetail?: string) => ({
      id: order.id,
      shortId: String(order.id).slice(0, 8).toUpperCase(),
      totalCents: order.total_cents,
      status,
      paymentMethod: order.payment_method,
      paymentId: paymentId ?? order.mp_payment_id,
      preferenceId: order.mp_preference_id,
      paymentStatus: paymentStatus ?? status,
      statusDetail,
      items,
    });

    if (be.mpConfigured() && order.status === "pending") {
      try {
        console.info("[MercadoPago] status check", { orderId: order.id });
        const res = await be.mpGetPayment({
          paymentId: order.mp_payment_id,
          externalReference: order.id,
        });
        if (!res.ok) {
          console.error("[MercadoPago] status check error", { status: res.status, body: res.text, orderId: order.id });
        } else {
          const payment = order.mp_payment_id ? res.json : res.json?.results?.[0];
          if (payment?.id && payment?.status) {
            const nextStatus = mapPaymentStatus(payment.status);
            await be.updateOrder(order.id, { status: nextStatus, mp_payment_id: String(payment.id) });
            return buildResult(nextStatus, String(payment.id), payment.status as string, payment.status_detail as string | undefined);
          }
        }
      } catch (err) {
        console.error("[MercadoPago] status check failed", { orderId: order.id, message: err instanceof Error ? err.message : String(err) });
      }
    }


    return buildResult(order.status as OrderStatus);
  });


export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const be = await backend();
    if (!be.mpConfigured()) throw new Error("Pagamento não configurado neste ambiente.");

    const { resolvedItems, subtotal, shippingCostCents, discountCents, total } =
      await resolveCheckoutAmounts({ ...data, paymentMethod: "pix" });

    const order = await be.createOrder({
      user_id: context.userId,
      customer_name: data.customer.name,
      customer_email: data.customer.email,
      customer_phone: data.customer.phone,
      customer_cpf: (data.customer.cpf || "").replace(/\D/g, "") || null,
      shipping_address: data.shipping,
      shipping_cost_cents: shippingCostCents,
      shipping_service: data.shippingService,
      subtotal_cents: subtotal,
      discount_cents: discountCents,
      total_cents: total,
      notes: data.notes,
      notes_images: data.notesImages ?? [],
      notes_video_url: data.notesVideoUrl ?? null,
      status: "pending",
      payment_method: "pix",
    });

    const itemsRows = resolvedItems.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      product_name: i.name,
      unit_price_cents: i.priceCents,
      quantity: i.quantity,
      vehicle_config: i.vehicleConfig ?? null,
    }));
    await be.insertOrderItems(order.id, itemsRows);


    const origin = getRuntimeOrigin();
    const [firstName, ...rest] = data.customer.name.split(" ");
    // MP requires ISO 8601 with explicit offset (e.g. .000+00:00 or -03:00)
    const expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace("Z", "+00:00");
    // MP payer.email é sensível: usa fallback determinístico sempre que houver
    // qualquer suspeita de formato inválido (espaços, +tags, TLD curto, domínios de teste).
    const rawEmail = (data.customer.email || "").trim().toLowerCase().replace(/\s+/g, "");
    const strictEmail = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
    const hasBadChars = /[^a-z0-9._@-]/.test(rawEmail) || rawEmail.includes("..");
    const [localPart = "", domain = ""] = rawEmail.split("@");
    const tld = domain.split(".").pop() || "";
    const emailValid =
      strictEmail.test(rawEmail) &&
      !hasBadChars &&
      localPart.length >= 3 &&
      localPart.length <= 64 &&
      domain.length <= 190 &&
      tld.length >= 2 &&
      /^[a-z]+$/.test(tld) &&
      !/@(test|example|localhost|invalid)\.(com|org|net|local|test)$/.test(rawEmail);
    const fallbackEmail = `pedido${String(order.id).replace(/-/g, "").slice(0, 12)}@alpinecapotas.com.br`;
    const payerEmail = emailValid ? rawEmail : fallbackEmail;
    console.info("[MercadoPago] pix payer email", { orderId: order.id, usedFallback: !emailValid });
    const buildPixBody = (email: string) => ({
      transaction_amount: Number((total / 100).toFixed(2)),
      description: `Pedido Alpine #${String(order.id).slice(0, 8)}`,
      payment_method_id: "pix",
      external_reference: order.id,
      notification_url: `${origin}/api/public/webhooks/mercadopago`,
      date_of_expiration: expiration,
      payer: {
        email,
        first_name: firstName,
        last_name: rest.join(" ") || firstName,
      },
    });


    console.info("[MercadoPago] create pix payment", { orderId: order.id, totalCents: total });
    let res = await be.mpCreatePixPayment(buildPixBody(payerEmail), `pix-${order.id}`);

    // Se o Mercado Pago recusar o e-mail do cliente, refaz a cobrança com o
    // e-mail interno do pedido para não travar o pagamento.
    const emailRejected =
      !res.ok &&
      /payer\.?_?email|email.*valid|valid.*email/i.test(
        `${mercadoPagoMessage(res.json, "")} ${res.text ?? ""}`,
      );
    if (emailRejected && payerEmail !== fallbackEmail) {
      console.warn("[MercadoPago] pix retry with fallback email", { orderId: order.id });
      res = await be.mpCreatePixPayment(buildPixBody(fallbackEmail), `pix-${order.id}-fb`);
    }

    const json = res.json;
    const text = res.text;
    const qrCode = json?.point_of_interaction?.transaction_data?.qr_code as string | undefined;
    const qrCodeBase64 = json?.point_of_interaction?.transaction_data?.qr_code_base64 as string | undefined;
    const ticketUrl = json?.point_of_interaction?.transaction_data?.ticket_url as string | undefined;
    if (!res.ok || !json?.id || !qrCode) {
      console.error("[MercadoPago] pix error", { status: res.status, body: text, orderId: order.id });
      throw new Error(`Mercado Pago PIX error [${res.status}]: ${mercadoPagoMessage(json, "pix failed")}`);
    }

    await be.updateOrder(order.id, { mp_payment_id: String(json.id) });


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

// Recupera o QR Code PIX direto do Mercado Pago (usado quando a tela do PIX
// é aberta sem os dados salvos na sessão, ex.: outro dispositivo/reload).
export const getOrderPixData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrderLookupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const be = await backend();
    const order = await be.getOrderWithItems(data.orderId);
    if (!order || order.user_id !== context.userId) throw new Error("Pedido não encontrado");
    if (!be.mpConfigured()) return null;

    const res = await be.mpGetPayment({
      paymentId: order.mp_payment_id,
      externalReference: order.id,
    });
    if (!res.ok) {
      console.error("[MercadoPago] pix fetch error", { status: res.status, orderId: order.id });
      return null;
    }
    const payment = order.mp_payment_id ? res.json : res.json?.results?.[0];
    const tx = payment?.point_of_interaction?.transaction_data;
    if (!tx?.qr_code) return null;
    return {
      orderId: order.id,
      qrCode: tx.qr_code as string,
      qrCodeBase64: (tx.qr_code_base64 as string | undefined) ?? undefined,
      ticketUrl: (tx.ticket_url as string | undefined) ?? undefined,
      expiresAt: (payment?.date_of_expiration as string | undefined) ?? undefined,
    };
  });




// ---------------------------------------------------------------------------
// Pagamento transparente (dentro do site): cartão e boleto
// ---------------------------------------------------------------------------

const CardInputSchema = InputSchema.extend({
  card: z.object({
    token: z.string().min(5).max(200),
    paymentMethodId: z.string().min(2).max(40),
    issuerId: z.string().max(40).optional().nullable(),
    installments: z.number().int().min(1).max(12).default(1),
    cardholderEmail: z.string().max(180).optional().default(""),
    identificationType: z.string().max(10).optional().default("CPF"),
    identificationNumber: z.string().max(20).optional().default(""),
  }),
});

function safePayerEmail(raw: string, orderId: string) {
  const email = (raw || "").trim().toLowerCase().replace(/\s+/g, "");
  const strict = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  const [localPart = "", domain = ""] = email.split("@");
  const tld = domain.split(".").pop() || "";
  const valid =
    strict.test(email) &&
    !/[^a-z0-9._@-]/.test(email) &&
    !email.includes("..") &&
    localPart.length >= 3 &&
    domain.length <= 190 &&
    tld.length >= 2 &&
    /^[a-z]+$/.test(tld) &&
    !/@(test|example|localhost|invalid)\./.test(email);
  return valid ? email : `pedido${orderId.replace(/-/g, "").slice(0, 12)}@alpinecapotas.com.br`;
}

async function persistOrder(
  data: z.infer<typeof InputSchema>,
  userId: string,
  method: string,
  amounts: Awaited<ReturnType<typeof resolveCheckoutAmounts>>,
) {
  const be = await backend();
  const order = await be.createOrder({
    user_id: userId,
    customer_name: data.customer.name,
    customer_email: data.customer.email,
    customer_phone: data.customer.phone,
    customer_cpf: (data.customer.cpf || "").replace(/\D/g, "") || null,
    shipping_address: data.shipping,
    shipping_cost_cents: amounts.shippingCostCents,
    shipping_service: data.shippingService,
    subtotal_cents: amounts.subtotal,
    discount_cents: amounts.discountCents,
    total_cents: amounts.total,
    notes: data.notes,
    notes_images: data.notesImages ?? [],
    notes_video_url: data.notesVideoUrl ?? null,
    status: "pending",
    payment_method: method,
  });
  await be.insertOrderItems(
    order.id,
    amounts.resolvedItems.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      product_name: i.name,
      unit_price_cents: i.priceCents,
      quantity: i.quantity,
      vehicle_config: i.vehicleConfig ?? null,
    })),
  );
  return order;
}

/** Cobrança no cartão sem sair do site (token gerado no navegador pelo SDK do MP). */
export const createCardPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CardInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const be = await backend();
    if (!be.mpConfigured()) throw new Error("Pagamento não configurado neste ambiente.");

    const amounts = await resolveCheckoutAmounts({ ...data, paymentMethod: "card", installments: data.card.installments });
    const order = await persistOrder(data, context.userId, "card", amounts);

    const origin = getRuntimeOrigin();
    const [firstName, ...rest] = data.customer.name.split(" ");
    const cpf = (data.card.identificationNumber || data.customer.cpf || "").replace(/\D/g, "");
    const body = {
      transaction_amount: Number((amounts.total / 100).toFixed(2)),
      token: data.card.token,
      description: `Pedido Alpine #${String(order.id).slice(0, 8)}`,
      installments: data.card.installments,
      payment_method_id: data.card.paymentMethodId,
      ...(data.card.issuerId ? { issuer_id: data.card.issuerId } : {}),
      external_reference: order.id,
      notification_url: `${origin}/api/public/webhooks/mercadopago`,
      statement_descriptor: "ALPINE",
      capture: true,
      payer: {
        email: safePayerEmail(data.card.cardholderEmail || data.customer.email, order.id),
        first_name: firstName,
        last_name: rest.join(" ") || firstName,
        ...(cpf.length === 11 ? { identification: { type: "CPF", number: cpf } } : {}),
      },
    };

    const res = await be.mpCreatePayment(body as any, `card-${order.id}`);
    const json = res.json;
    if (!res.ok || !json?.id) {
      console.error("[MercadoPago] card error", { status: res.status, body: res.text, orderId: order.id });
      throw new Error(`Mercado Pago cartão [${res.status}]: ${mercadoPagoMessage(json, "pagamento recusado")}`);
    }

    const status = mapPaymentStatus(json.status);
    await be.updateOrder(order.id, { mp_payment_id: String(json.id), status });

    return {
      orderId: order.id,
      paymentId: String(json.id),
      status,
      paymentStatus: String(json.status ?? ""),
      statusDetail: String(json.status_detail ?? ""),
      totalCents: amounts.total,
    };
  });

/** Boleto gerado na hora, dentro do site. */
export const createBoletoPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const be = await backend();
    if (!be.mpConfigured()) throw new Error("Pagamento não configurado neste ambiente.");

    const cpf = (data.customer.cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11) throw new Error("Informe um CPF válido para gerar o boleto.");

    const amounts = await resolveCheckoutAmounts({ ...data, paymentMethod: "boleto", installments: 1 });
    const order = await persistOrder(data, context.userId, "boleto", amounts);

    const origin = getRuntimeOrigin();
    const [firstName, ...rest] = data.customer.name.split(" ");
    const expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().replace("Z", "+00:00");
    const body = {
      transaction_amount: Number((amounts.total / 100).toFixed(2)),
      description: `Pedido Alpine #${String(order.id).slice(0, 8)}`,
      payment_method_id: "bolbradesco",
      external_reference: order.id,
      notification_url: `${origin}/api/public/webhooks/mercadopago`,
      date_of_expiration: expiration,
      payer: {
        email: safePayerEmail(data.customer.email, order.id),
        first_name: firstName,
        last_name: rest.join(" ") || firstName,
        identification: { type: "CPF", number: cpf },
        address: {
          zip_code: data.shipping.cep.replace(/\D/g, ""),
          street_name: data.shipping.street,
          street_number: data.shipping.number,
          neighborhood: data.shipping.district,
          city: data.shipping.city,
          federal_unit: data.shipping.state,
        },
      },
    };

    const res = await be.mpCreatePayment(body as any, `boleto-${order.id}`);
    const json = res.json;
    const td = json?.transaction_details ?? {};
    const barcode = json?.barcode?.content as string | undefined;
    if (!res.ok || !json?.id) {
      console.error("[MercadoPago] boleto error", { status: res.status, body: res.text, orderId: order.id });
      throw new Error(`Mercado Pago boleto [${res.status}]: ${mercadoPagoMessage(json, "falha ao gerar boleto")}`);
    }

    await be.updateOrder(order.id, { mp_payment_id: String(json.id) });

    return {
      orderId: order.id,
      paymentId: String(json.id),
      barcode: barcode ?? "",
      digitableLine: (barcode ?? "") as string,
      pdfUrl: (td.external_resource_url as string | undefined) ?? "",
      expiresAt: expiration,
      totalCents: amounts.total,
    };
  });

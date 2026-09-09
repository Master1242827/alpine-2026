/**
 * Geração automática de etiqueta de envio via Melhor Envio.
 *
 * Usado pelo webhook do Mercado Pago quando o pagamento é aprovado:
 * carrinho -> checkout (compra) -> geração -> impressão, salvando o código
 * de rastreio no pedido.
 *
 * Tolerante a falhas: qualquer erro apenas registra log e devolve null —
 * o pedido continua em "processing" e o admin pode gerar manualmente.
 *
 * Variáveis de ambiente:
 *   MELHOR_ENVIO_TOKEN     (obrigatório)
 *   MELHOR_ENVIO_ENV       "production" (padrão) | "sandbox"
 *   MELHOR_ENVIO_SERVICE   id do serviço (padrão 1 = Correios PAC)
 *   ME_FROM_NAME / ME_FROM_PHONE / ME_FROM_EMAIL / ME_FROM_DOCUMENT
 *   ME_FROM_ADDRESS / ME_FROM_NUMBER / ME_FROM_COMPLEMENT
 *   ME_FROM_DISTRICT / ME_FROM_CITY / ME_FROM_STATE / ME_FROM_CEP
 */

type LabelResult = {
  trackingCode: string | null;
  labelUrl: string | null;
  labelId: string | null;
};

function log(level: "info" | "warn" | "error", event: string, meta: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ scope: "melhor-envio", level, event, ts: new Date().toISOString(), ...meta });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

function baseUrl() {
  return (process.env["MELHOR_ENVIO_ENV"] || "production") === "sandbox"
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br";
}

function digits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

export function melhorEnvioConfigured(): boolean {
  return !!process.env["MELHOR_ENVIO_TOKEN"];
}

async function api(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Alpine Capotas (contato@alpinecapotas.com.br)",
      Authorization: `Bearer ${process.env["MELHOR_ENVIO_TOKEN"]}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    log("error", "api_error", { path, status: res.status, body: text.slice(0, 500) });
    throw new Error(`Melhor Envio ${res.status} em ${path}`);
  }
  return json;
}

function originAddress(originCep: string) {
  return {
    name: process.env["ME_FROM_NAME"] || "Alpine Capotas",
    phone: digits(process.env["ME_FROM_PHONE"]) || "0000000000",
    email: process.env["ME_FROM_EMAIL"] || "contato@alpinecapotas.com.br",
    document: digits(process.env["ME_FROM_DOCUMENT"]) || "",
    company_document: digits(process.env["ME_FROM_DOCUMENT"]) || "",
    address: process.env["ME_FROM_ADDRESS"] || "",
    number: process.env["ME_FROM_NUMBER"] || "",
    complement: process.env["ME_FROM_COMPLEMENT"] || "",
    district: process.env["ME_FROM_DISTRICT"] || "",
    city: process.env["ME_FROM_CITY"] || "",
    state_abbr: process.env["ME_FROM_STATE"] || "",
    country_id: "BR",
    postal_code: digits(process.env["ME_FROM_CEP"] || originCep),
  };
}

/**
 * Gera a etiqueta do pedido. Retorna null quando não configurado ou em erro.
 */
export async function generateShippingLabel(order: Record<string, any>, originCep = ""): Promise<LabelResult | null> {
  if (!melhorEnvioConfigured()) {
    log("info", "skipped_not_configured", { orderId: order?.id });
    return null;
  }

  const addr = (order?.shipping_address ?? {}) as Record<string, any>;
  const from = originAddress(originCep);
  if (!from.address || !from.city || !from.state_abbr || !from.postal_code) {
    log("warn", "missing_origin_address", { orderId: order?.id });
    return null;
  }
  const toCep = digits(addr["cep"] ?? addr["postal_code"] ?? addr["zip"]);
  if (!toCep) {
    log("warn", "missing_destination_cep", { orderId: order?.id });
    return null;
  }

  const items: Array<Record<string, any>> = Array.isArray(order?.order_items) ? order.order_items : [];
  const insurance = Math.max(1, Math.round(Number(order?.subtotal_cents ?? 0) / 100));

  try {
    const cart = await api("/api/v2/me/cart", {
      method: "POST",
      body: JSON.stringify({
        service: Number(process.env["MELHOR_ENVIO_SERVICE"] || 1),
        from,
        to: {
          name: order?.customer_name || "Cliente",
          phone: digits(order?.customer_phone) || "0000000000",
          email: order?.customer_email || "",
          document: digits(order?.customer_cpf) || "",
          address: addr["street"] ?? addr["logradouro"] ?? addr["address"] ?? "",
          number: String(addr["number"] ?? addr["numero"] ?? "S/N"),
          complement: addr["complement"] ?? addr["complemento"] ?? "",
          district: addr["district"] ?? addr["bairro"] ?? "",
          city: addr["city"] ?? addr["cidade"] ?? "",
          state_abbr: addr["state"] ?? addr["uf"] ?? "",
          country_id: "BR",
          postal_code: toCep,
        },
        products: items.length
          ? items.map((i) => ({
              name: String(i.product_name ?? "Produto").slice(0, 100),
              quantity: Number(i.quantity ?? 1),
              unitary_value: Math.max(1, Number(i.unit_price_cents ?? 0) / 100),
            }))
          : [{ name: "Pedido", quantity: 1, unitary_value: insurance }],
        volumes: [{ height: 20, width: 40, length: 60, weight: 5 }],
        options: {
          insurance_value: insurance,
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: true,
          invoice: null,
          platform: "Alpine Capotas",
          tags: [{ tag: String(order?.id ?? ""), url: null }],
        },
      }),
    });

    const cartId: string | undefined = cart?.id;
    if (!cartId) {
      log("error", "cart_without_id", { orderId: order?.id });
      return null;
    }

    await api("/api/v2/me/shipment/checkout", {
      method: "POST",
      body: JSON.stringify({ orders: [cartId] }),
    });
    await api("/api/v2/me/shipment/generate", {
      method: "POST",
      body: JSON.stringify({ orders: [cartId] }),
    });
    const printed = await api("/api/v2/me/shipment/print", {
      method: "POST",
      body: JSON.stringify({ orders: [cartId], mode: "public" }),
    });

    const info = await api(`/api/v2/me/shipment/tracking`, {
      method: "POST",
      body: JSON.stringify({ orders: [cartId] }),
    }).catch(() => null);

    const tracking =
      (info && (info[cartId]?.tracking || info[cartId]?.protocol)) || cart?.tracking || null;

    log("info", "label_generated", { orderId: order?.id, cartId, tracking });
    return {
      trackingCode: tracking ? String(tracking) : null,
      labelUrl: printed?.url ? String(printed.url) : null,
      labelId: cartId,
    };
  } catch (err) {
    log("error", "label_failed", {
      orderId: order?.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

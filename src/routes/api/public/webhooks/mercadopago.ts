import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MP_PAYMENTS_ENDPOINT = "https://api.mercadopago.com/v1/payments";

type MappedStatus = "pending" | "paid" | "cancelled";

type MPPayment = {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string | null;
};

// Mapeamento completo dos status do Mercado Pago
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api/payment-management/get-payments
const STATUS_MAP: Record<string, MappedStatus> = {
  approved: "paid",
  authorized: "paid",
  pending: "pending",
  in_process: "pending",
  in_mediation: "pending",
  rejected: "cancelled",
  cancelled: "cancelled",
  refunded: "cancelled",
  charged_back: "cancelled",
};

function mapStatus(s: string | undefined): MappedStatus {
  return (s && STATUS_MAP[s]) || "pending";
}

function log(level: "info" | "warn" | "error", event: string, meta: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ scope: "mp-webhook", level, event, ts: new Date().toISOString(), ...meta });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, init);
      // Retry apenas em 5xx ou 429 (erros transitórios)
      if (res.status >= 500 || res.status === 429) {
        log("warn", "mp_api_retry", { url, status: res.status, attempt: i });
        if (i === attempts) return res;
      } else {
        return res;
      }
    } catch (err) {
      lastErr = err;
      log("warn", "mp_api_fetch_error", { url, attempt: i, message: err instanceof Error ? err.message : String(err) });
      if (i === attempts) throw err;
    }
    await new Promise((r) => setTimeout(r, 250 * i));
  }
  throw lastErr;
}

function verifySignature(request: Request, rawBody: string, paymentId: string | null): { valid: boolean; reason: string } {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return { valid: false, reason: "no_secret_configured" };

  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signatureHeader) return { valid: false, reason: "missing_signature_header" };

  // x-signature format: "ts=1700000000,v1=abc..."
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  ) as { ts?: string; v1?: string };
  if (!parts.ts || !parts.v1) return { valid: false, reason: "malformed_signature" };

  // Manifest: id:<paymentId>;request-id:<id>;ts:<ts>;
  const manifest =
    (paymentId ? `id:${paymentId};` : "") +
    (requestId ? `request-id:${requestId};` : "") +
    `ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(parts.v1, "utf8");
    if (a.length !== b.length) return { valid: false, reason: "signature_mismatch" };
    return { valid: timingSafeEqual(a, b), reason: "compared" };
  } catch {
    return { valid: false, reason: "signature_compare_error" };
  }
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        if (!token) {
          log("error", "missing_access_token");
          // 500 → MP reentregará
          return new Response("misconfigured", { status: 500 });
        }

        const url = new URL(request.url);
        const requestId = request.headers.get("x-request-id");
        let rawBody = "";
        let body: any = {};
        try {
          rawBody = await request.text();
          if (rawBody) body = JSON.parse(rawBody);
        } catch {
          log("warn", "non_json_body", { rawBody: rawBody.slice(0, 300) });
        }

        const topic = body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic");
        const paymentId =
          body?.data?.id ||
          (typeof body?.resource === "string" ? body.resource.split("/").pop() : null) ||
          url.searchParams.get("id") ||
          url.searchParams.get("data.id");

        log("info", "received", { topic, paymentId, requestId, query: url.search, bodyPreview: rawBody.slice(0, 300) });

        // 1. Validação de assinatura (se MERCADO_PAGO_WEBHOOK_SECRET estiver configurado)
        const sig = verifySignature(request, rawBody, paymentId ? String(paymentId) : null);
        if (!sig.valid) {
          log("error", "invalid_signature", { reason: sig.reason, paymentId, requestId });
          return new Response("invalid signature", { status: 401 });
        }

        // 2. Ignora notificações que não são de pagamento (merchant_order, test, etc.)
        if (topic !== "payment" || !paymentId) {
          log("info", "ignored_topic", { topic, paymentId });
          return new Response("ignored", { status: 200 });
        }

        // 3. Busca detalhes do pagamento na API do MP (com retry em 5xx/429)
        const endpoint = `${MP_PAYMENTS_ENDPOINT}/${paymentId}`;
        let mpRes: Response;
        try {
          mpRes = await fetchWithRetry(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        } catch (err) {
          log("error", "mp_api_unreachable", { endpoint, message: err instanceof Error ? err.message : String(err) });
          // 500 → MP reentrega
          return new Response("mp api unreachable", { status: 500 });
        }
        const responseText = await mpRes.text();
        if (mpRes.status === 404) {
          log("warn", "payment_not_found", { endpoint, paymentId });
          // 200 → não reentregar pagamento inexistente
          return new Response("payment not found", { status: 200 });
        }
        if (!mpRes.ok) {
          log("error", "mp_api_error", { endpoint, status: mpRes.status, body: responseText.slice(0, 500) });
          // 5xx ou outros → 500 para MP reentregar
          return new Response("mp api error", { status: 500 });
        }

        let payment: MPPayment;
        try {
          payment = JSON.parse(responseText) as MPPayment;
        } catch {
          log("error", "mp_api_invalid_json", { endpoint, body: responseText.slice(0, 300) });
          return new Response("invalid mp response", { status: 500 });
        }

        if (!payment.external_reference) {
          log("warn", "payment_without_external_reference", { paymentId: payment.id, status: payment.status });
          return new Response("no external reference", { status: 200 });
        }

        const mappedStatus = mapStatus(payment.status);

        // 4. Idempotência: registra o evento. A constraint unique(payment_id, payment_status)
        //    rejeita reentregas exatas — apenas a primeira ocorrência atualiza o pedido.
        const { error: insertErr } = await supabaseAdmin.from("mp_webhook_events").insert({
          payment_id: String(payment.id),
          topic,
          payment_status: payment.status,
          mapped_status: mappedStatus,
          order_id: payment.external_reference,
          raw_body: rawBody.slice(0, 4000),
          query_string: url.search,
        });
        if (insertErr) {
          if (insertErr.code === "23505") {
            log("info", "duplicate_event_skipped", { paymentId: payment.id, status: payment.status, orderId: payment.external_reference });
            return new Response("duplicate", { status: 200 });
          }
          log("error", "event_log_insert_failed", { message: insertErr.message, code: insertErr.code });
          // Falha de log não deve impedir o update do pedido → segue
        }

        // 5. Atualiza pedido. Só sobe para "paid" se não estiver já "paid"/"cancelled"
        //    (evita regredir status final em reentregas atrasadas).
        const { data: currentOrder, error: fetchOrderErr } = await supabaseAdmin
          .from("orders")
          .select("id,status")
          .eq("id", payment.external_reference)
          .maybeSingle();
        if (fetchOrderErr || !currentOrder) {
          log("error", "order_not_found", { orderId: payment.external_reference, message: fetchOrderErr?.message });
          return new Response("order not found", { status: 200 });
        }

        const isFinal = currentOrder.status === "paid" || currentOrder.status === "cancelled";
        if (isFinal && mappedStatus === "pending") {
          log("info", "skip_regression", { orderId: currentOrder.id, current: currentOrder.status, incoming: mappedStatus });
          return new Response("no regression", { status: 200 });
        }
        if (currentOrder.status === mappedStatus) {
          log("info", "status_unchanged", { orderId: currentOrder.id, status: mappedStatus, paymentId: payment.id });
          // Garante o mp_payment_id mesmo se status já estiver correto
          await supabaseAdmin.from("orders").update({ mp_payment_id: String(payment.id) }).eq("id", currentOrder.id);
          return new Response("ok", { status: 200 });
        }

        const { error: updateErr } = await supabaseAdmin
          .from("orders")
          .update({ status: mappedStatus, mp_payment_id: String(payment.id) })
          .eq("id", currentOrder.id);
        if (updateErr) {
          log("error", "order_update_failed", { orderId: currentOrder.id, message: updateErr.message });
          // 500 → MP reentregará
          return new Response("order update failed", { status: 500 });
        }

        log("info", "order_updated", {
          orderId: currentOrder.id,
          paymentId: payment.id,
          paymentStatus: payment.status,
          statusDetail: payment.status_detail,
          mappedStatus,
          previousStatus: currentOrder.status,
          paymentMethod: payment.payment_method_id,
          paymentType: payment.payment_type_id,
          dateApproved: payment.date_approved,
        });
        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});

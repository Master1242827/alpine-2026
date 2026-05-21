import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MP_PAYMENTS_ENDPOINT = "https://api.mercadopago.com/v1/payments";

type MPPayment = {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string;
  order?: { id?: number };
};

function mapStatus(s: string): "pending" | "paid" | "cancelled" {
  if (s === "approved" || s === "authorized") return "paid";
  if (s === "cancelled" || s === "rejected" || s === "refunded" || s === "charged_back") return "cancelled";
  return "pending";
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        if (!token) {
          console.error("[MercadoPago webhook] erro autenticação: MERCADO_PAGO_ACCESS_TOKEN ausente");
          return new Response("misconfigured", { status: 500 });
        }

        let body: any = null;
        let rawBody = "";
        try {
          rawBody = await request.text();
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          // MP sometimes sends form-encoded; fall back
          body = {};
        }
        const url = new URL(request.url);
        const topic = body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic");
        const paymentId =
          body?.data?.id ||
          (typeof body?.resource === "string" ? body.resource.split("/").pop() : body?.resource) ||
          url.searchParams.get("id") ||
          url.searchParams.get("data.id");

        console.info("[MercadoPago webhook] recebido", { topic, paymentId, query: url.search, body: rawBody.slice(0, 500) });

        if (topic !== "payment" || !paymentId) {
          console.info("[MercadoPago webhook] ignorado", { topic, paymentId });
          return new Response("ignored", { status: 200 });
        }

        const endpoint = `${MP_PAYMENTS_ENDPOINT}/${paymentId}`;
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const responseText = await res.text();
        if (!res.ok) {
          console.error("[MercadoPago webhook] erro API Mercado Pago", { endpoint, status: res.status, message: responseText });
          return new Response("payment fetch failed", { status: 200 });
        }
        const payment = JSON.parse(responseText) as MPPayment;
        if (!payment.external_reference) {
          console.error("[MercadoPago webhook] pagamento sem external_reference", { paymentId: payment.id, status: payment.status });
          return new Response("no ref", { status: 200 });
        }

        const nextStatus = mapStatus(payment.status);
        const { error } = await supabaseAdmin
          .from("orders")
          .update({
            status: nextStatus,
            mp_payment_id: String(payment.id),
          })
          .eq("id", payment.external_reference);
        if (error) {
          console.error("[MercadoPago webhook] erro ao atualizar pedido", { orderId: payment.external_reference, message: error.message });
          return new Response("order update failed", { status: 200 });
        }

        console.info("[MercadoPago webhook] pedido atualizado", { orderId: payment.external_reference, paymentId: payment.id, status: payment.status, mappedStatus: nextStatus });
        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});

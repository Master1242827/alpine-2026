import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
        if (!token) return new Response("misconfigured", { status: 500 });

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          // MP sometimes sends form-encoded; fall back
          body = {};
        }
        const url = new URL(request.url);
        const topic = body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic");
        const paymentId =
          body?.data?.id ||
          body?.resource ||
          url.searchParams.get("id") ||
          url.searchParams.get("data.id");

        if (topic !== "payment" || !paymentId) {
          return new Response("ignored", { status: 200 });
        }

        const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return new Response("payment fetch failed", { status: 200 });
        const payment = (await res.json()) as MPPayment;
        if (!payment.external_reference) return new Response("no ref", { status: 200 });

        await supabaseAdmin
          .from("orders")
          .update({
            status: mapStatus(payment.status),
            mp_payment_id: String(payment.id),
          })
          .eq("id", payment.external_reference);

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});

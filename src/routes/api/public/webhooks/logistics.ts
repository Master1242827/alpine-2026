import { createFileRoute } from "@tanstack/react-router";
import { findOrder, updateOrder } from "@/lib/checkout-backend.server";

/**
 * Webhook genérico de logística/transportadora.
 *
 * Autenticação: header `x-logistics-token` (ou `authorization: Bearer <token>`)
 * comparado com a variável de ambiente LOGISTICS_WEBHOOK_SECRET.
 *
 * Payload aceito (campos alternativos são tolerados):
 * {
 *   "event": "shipped" | "dispatched" | "collected" | "delivered" | ...,
 *   "order_id": "<uuid do pedido>",          // ou "external_reference" / "reference"
 *   "tracking_code": "AB123456789BR",        // ou "trackingNumber" / "tracking"
 *   "carrier": "Correios",                   // opcional
 *   "occurred_at": "2026-08-12T12:00:00Z"    // opcional (data do evento)
 * }
 */

type Mapped = "shipped" | "delivered" | "cancelled" | "returned" | null;

const EVENT_MAP: Record<string, Mapped> = {
  shipped: "shipped",
  dispatched: "shipped",
  dispatch: "shipped",
  collected: "shipped",
  collect: "shipped",
  posted: "shipped",
  in_transit: "shipped",
  intransit: "shipped",
  despachado: "shipped",
  coletado: "shipped",
  postado: "shipped",
  em_transito: "shipped",
  delivered: "delivered",
  entregue: "delivered",
  delivery: "delivered",
  returned: "returned",
  devolvido: "returned",
  devolucao: "returned",
  cancelled: "cancelled",
  canceled: "cancelled",
  cancelado: "cancelled",
};

const RANK: Record<string, number> = {
  pending: 0,
  paid: 1,
  shipped: 2,
  delivered: 3,
  completed: 4,
  returned: 4,
  cancelled: 4,
};

function log(level: "info" | "warn" | "error", event: string, meta: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ scope: "logistics-webhook", level, event, ts: new Date().toISOString(), ...meta });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export const Route = createFileRoute("/api/public/webhooks/logistics")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }) => {
        const secret = process.env.LOGISTICS_WEBHOOK_SECRET;
        if (!secret) {
          log("error", "missing_secret");
          return new Response("misconfigured", { status: 500 });
        }
        const provided =
          request.headers.get("x-logistics-token") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          new URL(request.url).searchParams.get("token") ||
          "";
        if (provided !== secret) {
          log("warn", "unauthorized");
          return new Response("unauthorized", { status: 401 });
        }

        let body: any = {};
        let raw = "";
        try {
          raw = await request.text();
          if (raw) body = JSON.parse(raw);
        } catch {
          log("warn", "non_json_body", { preview: raw.slice(0, 300) });
          return new Response("invalid json", { status: 400 });
        }

        const orderId: string | undefined =
          body.order_id || body.orderId || body.external_reference || body.reference || body.pedido_id;
        const trackingCode: string | undefined =
          body.tracking_code || body.trackingNumber || body.tracking || body.codigo_rastreio || body.ShippingServiceCode;
        const carrier: string | undefined = body.carrier || body.transportadora || body.ServiceDescription;
        const occurredAt: string | undefined = body.occurred_at || body.event_date || body.date || body.data;
        const rawEvent = normalize(body.event || body.status || body.event_type || body.tracking_status);
        const mapped = EVENT_MAP[rawEvent] ?? null;

        log("info", "received", { rawEvent, mapped, orderId, trackingCode });

        if (!mapped) return new Response("ignored", { status: 200 });

        // Localiza o pedido por id ou por código de rastreio já salvo
        const byId = orderId && /^[0-9a-f-]{36}$/i.test(orderId) ? orderId : null;
        if (!byId && !trackingCode) return new Response("missing order reference", { status: 400 });

        let order: Record<string, any> | null = null;
        try {
          order = await findOrder({ id: byId, trackingCode: byId ? null : trackingCode });
        } catch (err) {
          log("error", "order_lookup_failed", { message: err instanceof Error ? err.message : String(err) });
          return new Response("lookup failed", { status: 500 });
        }
        if (!order) {
          log("warn", "order_not_found", { orderId, trackingCode });
          return new Response("order not found", { status: 200 });
        }

        // Não regride status (ex.: "em trânsito" chegando depois de "entregue")
        if ((RANK[mapped] ?? 0) <= (RANK[order.status] ?? 0) && order.status !== mapped) {
          log("info", "skip_regression", { orderId: order.id, current: order.status, incoming: mapped });
          if (trackingCode && !order.tracking_code) {
            await supabaseAdmin.from("orders").update({ tracking_code: trackingCode }).eq("id", order.id);
          }
          return new Response("no regression", { status: 200 });
        }

        const when = occurredAt ? new Date(occurredAt) : null;
        const whenIso = when && !Number.isNaN(when.getTime()) ? when.toISOString() : new Date().toISOString();
        const patch = {
          status: mapped,
          ...(trackingCode ? { tracking_code: trackingCode } : {}),
          ...(carrier ? { tracking_carrier: carrier } : {}),
          ...(mapped === "shipped" ? { shipped_at: whenIso } : {}),
          ...(mapped === "delivered" ? { delivered_at: whenIso } : {}),
        };

        const { error: updErr } = await supabaseAdmin.from("orders").update(patch).eq("id", order.id);
        if (updErr) {
          log("error", "order_update_failed", { orderId: order.id, message: updErr.message });
          return new Response("update failed", { status: 500 });
        }

        log("info", "order_updated", { orderId: order.id, from: order.status, to: mapped, trackingCode });
        return new Response(JSON.stringify({ ok: true, orderId: order.id, status: mapped }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

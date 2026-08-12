import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Job diário (pg_cron): conclui automaticamente pedidos entregues há 7+ dias
 * que não possuem solicitação de devolução aberta.
 * Autenticação: header `apikey` com a chave pública do backend.
 */
export const Route = createFileRoute("/api/public/hooks/check-order-completion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided =
          request.headers.get("apikey") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const { data, error } = await (supabaseAdmin as any).rpc("complete_delivered_orders");
        if (error) {
          console.error(JSON.stringify({ scope: "check-order-completion", error: error.message }));
          return new Response("failed", { status: 500 });
        }
        console.info(JSON.stringify({ scope: "check-order-completion", completed: data ?? 0 }));
        return new Response(JSON.stringify({ ok: true, completed: data ?? 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

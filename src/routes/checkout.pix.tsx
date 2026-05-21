import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Loader2, QrCode, Clock } from "lucide-react";
import { formatCents } from "@/lib/format";
import { toast } from "sonner";
import { getOrderPaymentStatus } from "@/lib/checkout.functions";

export const Route = createFileRoute("/checkout/pix")({
  component: PixPage,
  validateSearch: (s: Record<string, unknown>) => ({ order: String(s.order ?? "") }),
});

type PixData = {
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt?: string;
};

function PixPage() {
  const { order } = useSearch({ from: "/checkout/pix" });
  const navigate = useNavigate();
  const getStatus = useServerFn(getOrderPaymentStatus);

  const [orderRow, setOrderRow] = useState<any>(null);
  const [pix, setPix] = useState<PixData | null>(null);
  const [status, setStatus] = useState<"pending" | "paid" | "cancelled">("pending");
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  // Carrega pedido + dados PIX salvos
  useEffect(() => {
    if (!order) return;
    (async () => {
      const { data: o } = await supabase.from("orders").select("*").eq("id", order).maybeSingle();
      setOrderRow(o);
      if (o?.status) setStatus(o.status);

      const raw = sessionStorage.getItem(`pix:${order}`);
      if (raw) {
        try { setPix(JSON.parse(raw) as PixData); } catch { /* ignore */ }
      }
      setLoading(false);
    })();
  }, [order]);

  // Polling automático do status (a cada 4s enquanto pendente)
  useEffect(() => {
    if (!order || status !== "pending") return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await getStatus({ data: { orderId: order } });
        if (!alive) return;
        if (res.status === "paid") {
          setStatus("paid");
          sessionStorage.removeItem(`pix:${order}`);
          toast.success("Pagamento aprovado! Liberando seu pedido...");
          setTimeout(() => navigate({ to: "/pedido/$id", params: { id: order } }), 1200);
        } else if (res.status === "cancelled") {
          setStatus("cancelled");
        }
      } catch (err) {
        console.error("[PIX] erro ao verificar status", err);
      }
    };
    pollRef.current = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [order, status, getStatus, navigate]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex items-center justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!orderRow) {
    return (
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted-foreground">Pedido não encontrado.</p>
        <Button asChild className="mt-4"><Link to="/">Voltar à loja</Link></Button>
      </div>
    );
  }

  const isPaid = status === "paid";
  const isCancelled = status === "cancelled";

  return (
    <div className="container mx-auto max-w-xl px-4 py-10">
      <Card className="space-y-5 p-6">
        <header className="text-center">
          {isPaid ? (
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          ) : isCancelled ? (
            <Clock className="mx-auto h-12 w-12 text-destructive" />
          ) : (
            <QrCode className="mx-auto h-12 w-12 text-primary" />
          )}
          <h1 className="mt-3 text-2xl font-bold">
            {isPaid ? "Pagamento aprovado" : isCancelled ? "Pagamento cancelado" : "Pague com PIX"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Pedido #{String(orderRow.id).slice(0, 8).toUpperCase()} ·{" "}
            <span className="font-semibold text-primary">{formatCents(orderRow.total_cents)}</span>
          </p>
        </header>

        {!isPaid && !isCancelled && pix && (
          <>
            {pix.qrCodeBase64 && (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${pix.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="h-64 w-64 rounded-lg border bg-white object-contain p-2"
                />
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">PIX Copia e Cola</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={pix.qrCode}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-xs font-mono"
                />
                <Button size="sm" onClick={() => copy(pix.qrCode, "Código PIX")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Aguardando confirmação automática do pagamento…</span>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Assim que o Mercado Pago confirmar o PIX, esta tela atualiza sozinha e libera seu pedido.
            </p>
          </>
        )}

        {!isPaid && !isCancelled && !pix && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Não encontramos o QR Code deste pedido nesta sessão. Volte ao checkout e gere o PIX
            novamente, ou acompanhe o status do pedido.
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm" variant="outline" className="flex-1"><Link to="/carrinho">Voltar ao carrinho</Link></Button>
              <Button asChild size="sm" className="flex-1">
                <Link to="/pedido/$id" params={{ id: order }}>Ver pedido</Link>
              </Button>
            </div>
          </div>
        )}

        {isPaid && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center text-sm">
            Pagamento confirmado. Estamos liberando seu pedido para processamento.
          </div>
        )}

        <Button asChild variant="outline" className="w-full">
          <Link to="/pedido/$id" params={{ id: order }}>Acompanhar status do pedido</Link>
        </Button>
      </Card>
    </div>
  );
}

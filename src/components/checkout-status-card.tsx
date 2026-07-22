import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/format";
import { getOrderPaymentStatus } from "@/lib/checkout.functions";
import { useCart } from "@/lib/cart";

type Variant = "approved" | "pending" | "rejected";

const COPY: Record<Variant, { title: string; description: string; statusLabel: string }> = {
  approved: {
    title: "Pagamento aprovado",
    description: "Recebemos seu pagamento. Já liberamos seu pedido para processamento — você receberá atualizações por e-mail e WhatsApp.",
    statusLabel: "Pagamento aprovado",
  },
  pending: {
    title: "Pagamento pendente",
    description: "O Mercado Pago ainda está confirmando seu pagamento (boleto ou PIX podem levar alguns minutos). Esta página atualiza automaticamente.",
    statusLabel: "Aguardando confirmação",
  },
  rejected: {
    title: "Pagamento não aprovado",
    description: "Seu pagamento foi recusado ou cancelado pelo Mercado Pago. Você pode tentar novamente ou falar com a gente no WhatsApp.",
    statusLabel: "Pagamento não aprovado",
  },
};

export function CheckoutStatusCard({ orderId, variant }: { orderId: string; variant: Variant }) {
  const getStatus = useServerFn(getOrderPaymentStatus);
  const { clear } = useCart();
  const clearedRef = useRef(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let alive = true;
    let attempts = 0;
    const load = async () => {
      try {
        const res = await getStatus({ data: { orderId } });
        if (!alive) return;
        setData(res);
        setLoading(false);
        attempts += 1;
        if (res.status === "pending" && variant !== "rejected" && attempts < 10) {
          setTimeout(load, 3000);
        }
      } catch (err) {
        console.error("[Checkout] erro ao consultar status", err);
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [getStatus, orderId, variant]);

  const liveStatus: Variant = data?.status === "paid"
    ? "approved"
    : data?.status === "cancelled"
      ? "rejected"
      : variant;
  const copy = COPY[liveStatus];
  const isRejected = liveStatus === "rejected";
  const isApproved = liveStatus === "approved";

  // Ponto 7: só limpa o carrinho quando o pagamento foi realmente aprovado.
  useEffect(() => {
    if (isApproved && !clearedRef.current) {
      clearedRef.current = true;
      clear();
    }
  }, [isApproved, clear]);


  return (
    <div className="container mx-auto max-w-lg px-4 py-12">
      <Card className="p-6 text-center">
        {loading ? (
          <Loader2 className="mx-auto h-14 w-14 animate-spin text-primary" />
        ) : isApproved ? (
          <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
        ) : isRejected ? (
          <XCircle className="mx-auto h-16 w-16 text-destructive" />
        ) : (
          <Clock className="mx-auto h-16 w-16 text-primary" />
        )}
        <h1 className="mt-4 text-2xl font-bold">{copy.title}</h1>
        <p className="mt-2 text-muted-foreground">{copy.description}</p>

        {data && (
          <div className="mt-5 space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-left">
            <Row label="Número do pedido" value={`#${data.shortId}`} />
            <Row label="Status" value={copy.statusLabel} />
            <Row label="Valor" value={formatCents(data.totalCents)} />
            {data.paymentMethod && <Row label="Método" value={String(data.paymentMethod).toUpperCase()} />}
            {data.paymentId && <Row label="ID do pagamento" value={String(data.paymentId)} />}
          </div>
        )}

        {data?.items?.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-background p-3 text-left">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Confira seu pedido
            </p>
            <ul className="space-y-2">
              {data.items.map((it: any, idx: number) => (
                <li key={idx} className="flex items-center gap-3">
                  {it.image ? (
                    <img src={it.image} alt={it.name} className="h-14 w-14 shrink-0 rounded object-cover border" />
                  ) : (
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded border bg-muted text-lg">🖼️</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">Qtd: {it.quantity}</p>
                  </div>
                  <span className="text-sm font-semibold">{formatCents(it.unitPriceCents * it.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}


        <div className="mt-6 flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link to="/pedido/$id" params={{ id: orderId }}>Acompanhar status em tempo real</Link>
          </Button>
          {isRejected ? (
            <Button asChild variant="outline" className="w-full"><Link to="/carrinho">Tentar novamente</Link></Button>
          ) : (
            <Button asChild variant="outline" className="w-full"><Link to="/">Voltar para a loja</Link></Button>
          )}
          <Button asChild variant="outline" className="w-full">
            <a href="https://wa.me/5500000000000" target="_blank" rel="noreferrer">Falar no WhatsApp</a>
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

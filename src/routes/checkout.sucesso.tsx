import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/format";
import { getOrderPaymentStatus } from "@/lib/checkout.functions";

export const Route = createFileRoute("/checkout/sucesso")({
  validateSearch: (s: Record<string, unknown>) => ({ order: String(s.order ?? "") }),
  component: SuccessPage,
});

function SuccessPage() {
  const { order } = useSearch({ from: "/checkout/sucesso" });
  const getStatus = useServerFn(getOrderPaymentStatus);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!order) return;
    let alive = true;
    let attempts = 0;
    const load = async () => {
      try {
        const res = await getStatus({ data: { orderId: order } });
        if (!alive) return;
        setData(res);
        setLoading(false);
        attempts += 1;
        if (res.status === "pending" && attempts < 10) setTimeout(load, 3000);
      } catch (err) {
        console.error("[Checkout] erro ao consultar status", err);
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [getStatus, order]);

  const approved = data?.status === "paid";

  return (
    <div className="container mx-auto max-w-lg px-4 py-12">
      <Card className="p-6 text-center">
        {loading ? (
          <Loader2 className="mx-auto h-14 w-14 animate-spin text-primary" />
        ) : approved ? (
          <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
        ) : (
          <Clock className="mx-auto h-16 w-16 text-primary" />
        )}
        <h1 className="mt-4 text-2xl font-bold">
          {approved ? "Pagamento aprovado" : "Pedido recebido"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {approved
            ? "Pedido realizado com sucesso. Já liberamos seu pedido para processamento."
            : "Estamos aguardando a confirmação automática do Mercado Pago."}
        </p>
        {data && (
          <div className="mt-5 space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-left">
            <Row label="Número do pedido" value={`#${data.shortId}`} />
            <Row label="Status" value={approved ? "Pagamento aprovado" : data.status === "cancelled" ? "Pagamento não aprovado" : "Pendente"} />
            <Row label="Valor" value={formatCents(data.totalCents)} />
            {data.paymentId && <Row label="Pagamento" value={data.paymentId} />}
          </div>
        )}
        <Button asChild className="mt-6 w-full"><Link to="/">Voltar para a loja</Link></Button>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

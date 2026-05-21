import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/format";
import { getOrderPaymentStatus } from "@/lib/checkout.functions";

export const Route = createFileRoute("/pedido/$id")({
  component: OrderStatusPage,
});

type StatusData = {
  id: string;
  shortId: string;
  totalCents: number;
  status: "pending" | "paid" | "cancelled";
  paymentMethod: string | null;
  paymentId: string | null;
  preferenceId: string | null;
  paymentStatus: string;
  statusDetail?: string;
};

function OrderStatusPage() {
  const { id } = useParams({ from: "/pedido/$id" });
  const getStatus = useServerFn(getOrderPaymentStatus);
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await getStatus({ data: { orderId: id } });
      setData(res as StatusData);
      setLastChecked(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    timerRef.current = window.setInterval(() => {
      // só consulta enquanto pendente
      setData((current) => {
        if (!current || current.status === "pending") fetchStatus();
        return current;
      });
    }, 5000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isPaid = data?.status === "paid";
  const isCancelled = data?.status === "cancelled";
  const isPending = data?.status === "pending";

  return (
    <div className="container mx-auto max-w-xl px-4 py-10">
      <Card className="p-6">
        <header className="flex flex-col items-center text-center">
          {loading && !data ? (
            <Loader2 className="h-14 w-14 animate-spin text-primary" />
          ) : isPaid ? (
            <CheckCircle2 className="h-16 w-16 text-primary" />
          ) : isCancelled ? (
            <XCircle className="h-16 w-16 text-destructive" />
          ) : (
            <Clock className="h-16 w-16 text-primary animate-pulse" />
          )}
          <h1 className="mt-4 text-2xl font-bold">
            {isPaid ? "Pagamento aprovado" : isCancelled ? "Pagamento recusado" : "Pagamento pendente"}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {isPaid
              ? "Recebemos seu pagamento. Já liberamos seu pedido para processamento."
              : isCancelled
                ? "O pagamento foi recusado ou cancelado. Você pode tentar novamente."
                : "Aguardando confirmação automática do Mercado Pago. Esta página atualiza sozinha."}
          </p>
          <StatusBadge status={data?.status} />
        </header>

        {error && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {data && (
          <div className="mt-6 space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <Row label="Pedido" value={`#${data.shortId}`} />
            <Row label="Valor" value={formatCents(data.totalCents)} />
            {data.paymentMethod && <Row label="Método" value={String(data.paymentMethod).toUpperCase()} />}
            {data.paymentId && <Row label="ID do pagamento" value={data.paymentId} />}
            {data.statusDetail && <Row label="Detalhe" value={data.statusDetail} />}
            {lastChecked && (
              <Row label="Última verificação" value={lastChecked.toLocaleTimeString("pt-BR")} />
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={fetchStatus} variant="outline" className="w-full sm:flex-1" disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar agora
          </Button>
          {isCancelled ? (
            <Button asChild className="w-full sm:flex-1"><Link to="/carrinho">Tentar novamente</Link></Button>
          ) : (
            <Button asChild className="w-full sm:flex-1"><Link to="/">Voltar para a loja</Link></Button>
          )}
        </div>

        {isPending && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Verificando automaticamente a cada 5 segundos…
          </p>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium break-all text-right">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status?: "pending" | "paid" | "cancelled" }) {
  if (!status) return null;
  if (status === "paid") return <Badge className="mt-3 bg-primary text-primary-foreground">Aprovado</Badge>;
  if (status === "cancelled") return <Badge className="mt-3" variant="destructive">Recusado</Badge>;
  return <Badge className="mt-3" variant="secondary">Pendente</Badge>;
}

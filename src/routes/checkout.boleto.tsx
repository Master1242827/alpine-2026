import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Barcode, ExternalLink } from "lucide-react";
import { formatCents } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout/boleto")({
  component: BoletoPage,
  validateSearch: (s: Record<string, unknown>) => ({ order: String(s.order ?? "") }),
  head: () => ({
    meta: [
      { title: "Boleto do pedido | Alpine Capotas" },
      { name: "description", content: "Boleto gerado na hora para o seu pedido Alpine Capotas: copie a linha digitável ou baixe o PDF." },
      { property: "og:title", content: "Boleto do pedido | Alpine Capotas" },
      { property: "og:description", content: "Copie a linha digitável ou baixe o PDF do boleto do seu pedido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type BoletoData = {
  digitableLine: string;
  pdfUrl: string;
  expiresAt?: string;
  totalCents?: number;
};

function BoletoPage() {
  const { order } = useSearch({ from: "/checkout/boleto" });
  const [data, setData] = useState<BoletoData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!order) return;
    const raw = sessionStorage.getItem(`boleto:${order}`);
    if (raw) {
      try {
        setData(JSON.parse(raw) as BoletoData);
      } catch {
        /* ignore */
      }
    }
  }, [order]);

  function copy() {
    if (!data?.digitableLine) return;
    navigator.clipboard.writeText(data.digitableLine);
    setCopied(true);
    toast.success("Linha digitável copiada");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="container mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">Boleto gerado</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pedido #{String(order).slice(0, 8).toUpperCase()} · pagamento confirmado em 1 a 3 dias úteis.
      </p>

      <Card className="mt-6 space-y-4 p-5">
        {data?.digitableLine ? (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Barcode className="h-4 w-4 text-primary" /> Linha digitável
            </div>
            <p className="break-all rounded-lg border border-border bg-muted/40 p-3 font-mono text-sm">
              {data.digitableLine}
            </p>
            {data.totalCents ? (
              <p className="text-sm">
                Valor: <span className="font-bold">{formatCents(data.totalCents)}</span>
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={copy} className="flex-1">
                {copied ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copiado" : "Copiar código"}
              </Button>
              {data.pdfUrl && (
                <Button asChild variant="outline" className="flex-1">
                  <a href={data.pdfUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Abrir boleto em PDF
                  </a>
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Não encontramos os dados do boleto nesta sessão. Acompanhe o pedido na sua conta.
          </p>
        )}

        <Link to="/conta" className="block text-center text-sm text-primary underline">
          Ver meus pedidos
        </Link>
      </Card>
    </div>
  );
}

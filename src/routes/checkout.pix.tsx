import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, MessageCircle, Loader2 } from "lucide-react";
import { formatCents } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout/pix")({
  component: PixPage,
  validateSearch: (s: Record<string, unknown>) => ({ order: String(s.order ?? "") }),
});

function PixPage() {
  const { order } = useSearch({ from: "/checkout/pix" });
  const [data, setData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const [o, s] = await Promise.all([
        supabase.from("orders").select("*").eq("id", order).maybeSingle(),
        supabase.from("store_settings").select("*").eq("id", 1).maybeSingle(),
      ]);
      setData(o.data);
      setSettings(s.data);
    })();
  }, [order]);

  if (!data || !settings) {
    return (
      <div className="container mx-auto flex items-center justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const wa = settings.whatsapp_number?.replace(/\D/g, "") ?? "";
  const waLink = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        `Olá! Acabei de fazer o pedido #${data.id.slice(0, 8)} via PIX (${formatCents(data.total_cents)}). Segue o comprovante.`,
      )}`
    : null;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="container mx-auto max-w-xl px-4 py-10">
      <Card className="space-y-5 p-6">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-3 text-2xl font-bold">Pedido criado!</h1>
          <p className="text-sm text-muted-foreground">
            #{data.id.slice(0, 8)} • Pague via PIX para confirmarmos seu pedido.
          </p>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor com desconto PIX</p>
          <p className="text-3xl font-bold text-primary">{formatCents(data.total_cents)}</p>
          {data.discount_cents > 0 && (
            <p className="text-xs text-muted-foreground">
              Desconto aplicado: {formatCents(data.discount_cents)}
            </p>
          )}
        </div>

        {settings.pix_qr_image_url && (
          <div className="flex justify-center">
            <img
              src={settings.pix_qr_image_url}
              alt="QR Code PIX"
              className="h-56 w-56 rounded-lg border bg-white object-contain p-2"
            />
          </div>
        )}

        {settings.pix_copy_paste && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">PIX Copia e Cola</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={settings.pix_copy_paste}
                className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-xs"
              />
              <Button size="sm" onClick={() => copy(settings.pix_copy_paste, "Código PIX")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <Row label="Chave PIX" value={settings.pix_key} onCopy={() => copy(settings.pix_key, "Chave PIX")} />
          <Row label="Tipo" value={settings.pix_key_type?.toUpperCase()} />
          <Row label="Favorecido" value={settings.pix_holder_name} />
          {settings.pix_bank && <Row label="Banco" value={settings.pix_bank} />}
        </div>

        {settings.pix_message && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground whitespace-pre-line">
            {settings.pix_message}
          </p>
        )}

        {waLink && (
          <Button asChild className="w-full" size="lg">
            <a href={waLink} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" /> Enviar comprovante no WhatsApp
            </a>
          </Button>
        )}

        <Button asChild variant="outline" className="w-full">
          <Link to="/">Voltar à loja</Link>
        </Button>
      </Card>
    </div>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium">{value}</span>
        {onCopy && (
          <button type="button" onClick={onCopy} className="text-muted-foreground hover:text-primary">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

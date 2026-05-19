import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/format";
import { Loader2, Package, LogOut } from "lucide-react";

export const Route = createFileRoute("/conta")({ component: AccountPage });

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  paid: { label: "Pago", variant: "default" },
  shipped: { label: "Enviado", variant: "default" },
  delivered: { label: "Entregue", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const [{ data: p }, { data: o }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("orders").select("*, order_items(*)").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      setProfile(p); setOrders(o ?? []); setBusy(false);
    })();
  }, [user, loading, navigate]);

  if (loading || busy) {
    return <div className="container mx-auto flex items-center justify-center px-4 py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!user) return null;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Minha conta</h1>
          <p className="text-sm text-muted-foreground">{profile?.full_name || user.email}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>

      <h2 className="mt-8 mb-3 flex items-center gap-2 text-lg font-semibold"><Package className="h-5 w-5" /> Meus pedidos</h2>

      {orders.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <p>Você ainda não fez nenhum pedido.</p>
          <Button asChild className="mt-4"><Link to="/produtos">Ver produtos</Link></Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const s = statusLabels[o.status] ?? { label: o.status, variant: "outline" as const };
            return (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Pedido #{o.id.slice(0, 8)}</p>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <p className="text-lg font-bold text-primary">{formatCents(o.total_cents)}</p>
                </div>
                <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                  {o.order_items?.map((it: any) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span className="truncate">{it.quantity}× {it.product_name}</span>
                      <span className="text-muted-foreground">{formatCents(it.unit_price_cents * it.quantity)}</span>
                    </li>
                  ))}
                </ul>
                {o.shipping_service && (
                  <p className="mt-2 text-xs text-muted-foreground">Frete: {o.shipping_service} ({formatCents(o.shipping_cost_cents)})</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

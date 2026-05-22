import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCents } from "@/lib/format";
import { toast } from "sonner";
import {
  Loader2,
  Package,
  LogOut,
  User as UserIcon,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  ChevronRight,
  CreditCard,
} from "lucide-react";

export const Route = createFileRoute("/conta")({ component: AccountPage });

const STATUS_FLOW = ["pending", "paid", "shipped", "delivered"] as const;

const STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }
> = {
  pending: { label: "Aguardando pagamento", variant: "secondary", icon: Clock },
  paid: { label: "Pagamento aprovado", variant: "default", icon: CreditCard },
  shipped: { label: "Enviado", variant: "default", icon: Truck },
  delivered: { label: "Entregue", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", variant: "destructive", icon: XCircle },
};

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);

  // form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      const [{ data: p }, { data: o }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("orders")
          .select("*, order_items(*)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      setProfile(p);
      setFullName(p?.full_name ?? "");
      setPhone(p?.phone ?? "");
      setOrders(o ?? []);
      setBusy(false);
    })();
  }, [user, loading, navigate]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const payload = {
        id: user.id,
        email: user.email,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      };
      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      setProfile({ ...(profile ?? {}), ...payload });
      toast.success("Dados atualizados");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading || busy) {
    return (
      <div className="container mx-auto flex items-center justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
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
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            navigate({ to: "/" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>

      <Tabs defaultValue="orders" className="mt-6">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto">
          <TabsTrigger value="orders">
            <Package className="mr-2 h-4 w-4" /> Pedidos
          </TabsTrigger>
          <TabsTrigger value="profile">
            <UserIcon className="mr-2 h-4 w-4" /> Meus dados
          </TabsTrigger>
        </TabsList>

        {/* ORDERS */}
        <TabsContent value="orders" className="mt-4">
          {orders.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              <Package className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>Você ainda não fez nenhum pedido.</p>
              <Button asChild className="mt-4">
                <Link to="/produtos">Ver produtos</Link>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* PROFILE */}
        <TabsContent value="profile" className="mt-4">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Dados pessoais</h2>
            <p className="text-sm text-muted-foreground">
              Mantenha suas informações atualizadas para agilizar futuras compras.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" value={user.email ?? ""} disabled />
                <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  maxLength={32}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={saveProfile} disabled={savingProfile}>
                {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar alterações
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrderCard({ order }: { order: any }) {
  const meta = STATUS_META[order.status] ?? {
    label: order.status,
    variant: "outline" as const,
    icon: Clock,
  };
  const Icon = meta.icon;
  const isCancelled = order.status === "cancelled";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Pedido #{order.id.slice(0, 8)}</p>
            <Badge variant={meta.variant} className="gap-1">
              <Icon className="h-3 w-3" /> {meta.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        <p className="text-lg font-bold text-primary">{formatCents(order.total_cents)}</p>
      </div>

      {/* Timeline */}
      {!isCancelled && (
        <div className="border-t border-border bg-muted/30 px-4 py-3">
          <StatusTimeline current={order.status} />
        </div>
      )}

      {/* Items */}
      <div className="border-t border-border p-4">
        <ul className="space-y-1 text-sm">
          {order.order_items?.map((it: any) => (
            <li key={it.id} className="flex justify-between gap-2">
              <span className="truncate">
                {it.quantity}× {it.product_name}
              </span>
              <span className="text-muted-foreground">
                {formatCents(it.unit_price_cents * it.quantity)}
              </span>
            </li>
          ))}
        </ul>
        {order.shipping_service && (
          <p className="mt-3 text-xs text-muted-foreground">
            Frete: {order.shipping_service} ({formatCents(order.shipping_cost_cents)})
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border p-4">
        <Button asChild size="sm" variant="outline">
          <Link to="/pedido/$id" params={{ id: order.id }}>
            Acompanhar pedido <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
        {order.status === "pending" && order.payment_method === "mercadopago" && (
          <Button asChild size="sm">
            <Link to="/pedido/$id" params={{ id: order.id }}>
              Concluir pagamento
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

function StatusTimeline({ current }: { current: string }) {
  const currentIdx = STATUS_FLOW.indexOf(current as any);
  return (
    <ol className="flex items-center gap-1">
      {STATUS_FLOW.map((step, idx) => {
        const reached = currentIdx >= idx;
        const meta = STATUS_META[step];
        const Icon = meta.icon;
        return (
          <li key={step} className="flex flex-1 items-center gap-1">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                reached
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span
              className={`hidden text-xs sm:inline ${
                reached ? "text-foreground font-medium" : "text-muted-foreground"
              }`}
            >
              {meta.label}
            </span>
            {idx < STATUS_FLOW.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 ${
                  currentIdx > idx ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

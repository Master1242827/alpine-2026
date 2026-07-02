import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCents } from "@/lib/format";
import { checkIsAdmin } from "@/lib/admin.functions";
import { VehiclesAdmin } from "@/components/admin/vehicles-admin";
import { ShippingAdmin } from "@/components/admin/shipping-admin";
import { classifyProductSize, SIZE_LABEL } from "@/lib/shipping-classify";


export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const [state, setState] = useState<"loading" | "guest" | "denied" | "ok">("loading");
  const [email, setEmail] = useState<string>("");
  const check = useServerFn(checkIsAdmin);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { if (!cancelled) setState("guest"); return; }
      setEmail(sess.session.user.email ?? "");
      try {
        const res = await check();
        if (cancelled) return;
        setState(res.isAdmin ? "ok" : "denied");
      } catch {
        if (!cancelled) setState("denied");
      }
    }
    run();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session) run();
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [check]);

  if (state === "loading") {
    return <div className="container mx-auto px-4 py-12">Carregando…</div>;
  }
  if (state === "guest") {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Entre para continuar</h1>
        <Link to="/login" className="mt-4 inline-block text-primary underline">Ir para login</Link>
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Acesso negado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta ({email}) não possui permissão administrativa. Faça login novamente
          informando a senha administrativa.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
        >
          Sair e voltar ao login
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Painel administrativo</h1>
          <p className="text-sm text-muted-foreground">Logado como {email}</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/";
          }}
        >
          Sair
        </Button>
      </div>

      <Tabs defaultValue="products" className="mt-6">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="vehicles">Veículos</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="shipping">Frete</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
        <TabsContent value="vehicles"><VehiclesAdmin /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
        <TabsContent value="shipping"><ShippingAdmin /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Products ============
type Product = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  stock: number;
  images: string[];
  active: boolean;
  featured: boolean;
  requires_vehicle_config: boolean;
  category_id: string | null;
  allowed_carriers: string[];
  blocked_carriers: string[];
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  shipping_weight_kg: number | null;
  shipping_length_cm: number | null;
  shipping_width_cm: number | null;
  shipping_height_cm: number | null;
};

const emptyProduct: Product = {
  id: "",
  name: "",
  slug: "",
  short_description: "",
  description: "",
  price_cents: 0,
  compare_at_cents: null,
  stock: 0,
  images: [],
  active: true,
  featured: false,
  requires_vehicle_config: true,
  category_id: null,
  allowed_carriers: [],
  blocked_carriers: [],
  weight_kg: 1,
  length_cm: 30,
  width_cm: 30,
  height_cm: 10,
  shipping_weight_kg: null,
  shipping_length_cm: null,
  shipping_width_cm: null,
  shipping_height_cm: null,
};




function ProductsTab() {
  const [items, setItems] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as Product[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produto excluído");
    load();
  };

  if (editing) {
    return <ProductForm initial={editing} onClose={() => { setEditing(null); load(); }} />;
  }

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokens = query.trim().split(/\s+/).filter(Boolean).map(norm);
  const filtered = tokens.length
    ? items.filter((p) => {
        const hay = norm(
          `${p.name} ${p.slug} ${p.short_description ?? ""} ${p.description ?? ""}`,
        );
        return tokens.every((t) => hay.includes(t));
      })
    : items;

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{filtered.length} de {items.length} produto(s)</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto pelo nome…"
            className="w-64"
          />
          <Button onClick={() => setEditing({ ...emptyProduct })}>+ Novo produto</Button>
        </div>
      </div>
      {loading && <p>Carregando…</p>}
      <div className="grid gap-3">
        {filtered.map((p) => (
          <Card key={p.id} className="flex items-center gap-4 p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-muted">
              {p.images[0] && <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{p.name}</p>
                {!p.active && <Badge variant="secondary">Inativo</Badge>}
                {p.featured && <Badge>Destaque</Badge>}
                {(() => {
                  const size = classifyProductSize({
                    name: p.name,
                    weightKg: Number(p.weight_kg ?? 0),
                    lengthCm: Number(p.length_cm ?? 0),
                    widthCm: Number(p.width_cm ?? 0),
                    heightCm: Number(p.height_cm ?? 0),
                  });
                  const cls =
                    size === "large"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                      : size === "medium"
                      ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
                  return (
                    <Badge variant="outline" className={cls} title="Classificação automática para o frete">
                      Frete: {SIZE_LABEL[size]}
                    </Badge>
                  );
                })()}
              </div>

              <p className="text-sm text-muted-foreground">
                {formatCents(p.price_cents)} • Estoque: {p.stock}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(p)}>Editar</Button>
              <Button variant="destructive" size="sm" onClick={() => remove(p.id)}>Excluir</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function ProductForm({ initial, onClose }: { initial: Product; onClose: () => void }) {
  const [p, setP] = useState<Product>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
      setP((prev) => ({ ...prev, images: [...prev.images, ...urls] }));
      toast.success(`${urls.length} imagem(ns) enviada(s)`);
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: p.name,
        slug: p.slug || slugify(p.name),
        short_description: p.short_description,
        description: p.description,
        price_cents: p.price_cents,
        compare_at_cents: p.compare_at_cents,
        stock: p.stock,
        images: p.images,
        active: p.active,
        featured: p.featured,
        requires_vehicle_config: p.requires_vehicle_config,
        allowed_carriers: p.allowed_carriers,
        blocked_carriers: p.blocked_carriers,
        weight_kg: p.weight_kg,
        length_cm: p.length_cm,
        width_cm: p.width_cm,
        height_cm: p.height_cm,
        shipping_weight_kg: p.shipping_weight_kg,
        shipping_length_cm: p.shipping_length_cm,
        shipping_width_cm: p.shipping_width_cm,
        shipping_height_cm: p.shipping_height_cm,
      };

      const res = p.id
        ? await supabase.from("products").update(payload).eq("id", p.id)
        : await supabase.from("products").insert(payload);

      if (res.error) throw res.error;
      toast.success("Produto salvo");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-4 space-y-4">
      <Button variant="ghost" onClick={onClose}>← Voltar</Button>
      <Card className="space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Nome</Label>
            <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value, slug: p.slug || slugify(e.target.value) })} />
          </div>
          <div>
            <Label>Slug (URL)</Label>
            <Input value={p.slug} onChange={(e) => setP({ ...p, slug: slugify(e.target.value) })} />
          </div>
          <div>
            <Label>Preço (R$)</Label>
            <Input type="number" step="0.01" value={p.price_cents / 100}
              onChange={(e) => setP({ ...p, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })} />
          </div>
          <div>
            <Label>Preço "de" (opcional)</Label>
            <Input type="number" step="0.01" value={p.compare_at_cents ? p.compare_at_cents / 100 : ""}
              onChange={(e) => setP({ ...p, compare_at_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })} />
          </div>
          <div>
            <Label>Estoque</Label>
            <Input type="number" value={p.stock} onChange={(e) => setP({ ...p, stock: parseInt(e.target.value || "0") })} />
          </div>
        </div>
        <div>
          <Label>Resumo</Label>
          <Input value={p.short_description ?? ""} onChange={(e) => setP({ ...p, short_description: e.target.value })} />
        </div>
        <div>
          <Label>Descrição completa</Label>
          <Textarea
            rows={20}
            className="min-h-[420px] font-mono text-sm leading-relaxed"
            value={p.description ?? ""}
            onChange={(e) => setP({ ...p, description: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Dica: arraste o canto inferior direito para aumentar ainda mais.
          </p>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <Switch checked={p.active} onCheckedChange={(v) => setP({ ...p, active: v })} /> Ativo
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={p.featured} onCheckedChange={(v) => setP({ ...p, featured: v })} /> Destaque
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={p.requires_vehicle_config} onCheckedChange={(v) => setP({ ...p, requires_vehicle_config: v })} /> Exige buscador de veículo
          </label>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="text-sm font-semibold">Dimensões e peso</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Dimensões do produto montado. Usadas como padrão no cálculo de frete.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <Label>Peso (kg)</Label>
              <Input type="number" step="0.01" value={p.weight_kg}
                onChange={(e) => setP({ ...p, weight_kg: parseFloat(e.target.value || "0") })} />
            </div>
            <div>
              <Label>Comprimento (cm)</Label>
              <Input type="number" value={p.length_cm}
                onChange={(e) => setP({ ...p, length_cm: parseInt(e.target.value || "0") })} />
            </div>
            <div>
              <Label>Largura (cm)</Label>
              <Input type="number" value={p.width_cm}
                onChange={(e) => setP({ ...p, width_cm: parseInt(e.target.value || "0") })} />
            </div>
            <div>
              <Label>Altura (cm)</Label>
              <Input type="number" value={p.height_cm}
                onChange={(e) => setP({ ...p, height_cm: parseInt(e.target.value || "0") })} />
            </div>
          </div>

          <h4 className="mt-5 text-sm font-semibold">Dimensões de envio (embalagem)</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Preencha apenas se o produto é despachado em embalagem diferente — ex.: capota
            enviada enrolada (110×30×30 cm). Quando preenchidos, esses valores substituem
            os de cima no cálculo de frete. Deixe em branco para usar os padrões.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {([
              ["shipping_weight_kg", "Peso envio (kg)", "0.01", "number"],
              ["shipping_length_cm", "Comprimento envio (cm)", "1", "int"],
              ["shipping_width_cm", "Largura envio (cm)", "1", "int"],
              ["shipping_height_cm", "Altura envio (cm)", "1", "int"],
            ] as const).map(([key, label, step, kind]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  type="number"
                  step={step}
                  placeholder="—"
                  value={p[key] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setP({
                      ...p,
                      [key]: v === "" ? null : (kind === "int" ? parseInt(v) : parseFloat(v)),
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </div>


        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="text-sm font-semibold">Transportadoras (override manual)</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            O sistema escolhe automaticamente as transportadoras compatíveis com base no
            tamanho, peso e tipo do produto. Use os campos abaixo apenas para forçar ou
            bloquear opções específicas. Use partes do nome (ex.: PAC, SEDEX, Jadlog,
            Correios), separadas por vírgula.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <Label>Permitir somente (opcional)</Label>
              <Input
                placeholder="Ex.: Jadlog, SEDEX"
                value={p.allowed_carriers.join(", ")}
                onChange={(e) => setP({
                  ...p,
                  allowed_carriers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })}
              />
            </div>
            <div>
              <Label>Bloquear</Label>
              <Input
                placeholder="Ex.: PAC, SEDEX"
                value={p.blocked_carriers.join(", ")}
                onChange={(e) => setP({
                  ...p,
                  blocked_carriers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })}
              />
            </div>
          </div>
        </div>

        <div>
          <Label>Imagens</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            A primeira imagem é a capa do produto. Use as setas para reordenar.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.images.map((url, i) => {
              const move = (dir: -1 | 1) => {
                const j = i + dir;
                if (j < 0 || j >= p.images.length) return;
                const next = [...p.images];
                [next[i], next[j]] = [next[j], next[i]];
                setP({ ...p, images: next });
              };
              return (
                <div key={url} className="relative h-28 w-28 overflow-hidden rounded border bg-muted">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      CAPA
                    </span>
                  )}
                  <button type="button" onClick={() => setP({ ...p, images: p.images.filter((_, j) => j !== i) })}
                    className="absolute right-0 top-0 bg-destructive px-1.5 text-xs text-destructive-foreground" aria-label="Remover">×</button>
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 text-white">
                    <button type="button" onClick={() => move(-1)} disabled={i === 0}
                      className="flex-1 py-0.5 text-xs disabled:opacity-30 hover:bg-black/40" aria-label="Mover para a esquerda">‹</button>
                    <span className="px-1 py-0.5 text-[10px] opacity-70">{i + 1}</span>
                    <button type="button" onClick={() => move(1)} disabled={i === p.images.length - 1}
                      className="flex-1 py-0.5 text-xs disabled:opacity-30 hover:bg-black/40" aria-label="Mover para a direita">›</button>
                  </div>
                </div>
              );
            })}
          </div>
          <Input type="file" multiple accept="image/*" onChange={handleUpload} className="mt-3" disabled={uploading} />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </Card>
    </div>
  );
}

// ============ Orders ============
function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setOrders(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase.from("orders") as any).update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    setOrders((o) => o.map((x) => (x.id === id ? { ...x, status } : x)));
    toast.success("Status atualizado");
  };

  const totals = orders.reduce(
    (acc, o) => {
      acc.count += 1;
      acc.gross += o.total_cents || 0;
      if (["paid", "shipped", "delivered"].includes(o.status)) acc.paid += o.total_cents || 0;
      return acc;
    },
    { count: 0, gross: 0, paid: 0 },
  );

  if (loading) return <p className="mt-4">Carregando…</p>;

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Pedidos</p><p className="text-2xl font-bold">{totals.count}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Faturamento bruto</p><p className="text-2xl font-bold">{formatCents(totals.gross)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Confirmado</p><p className="text-2xl font-bold text-primary">{formatCents(totals.paid)}</p></Card>
      </div>

      {orders.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>}
      {orders.map((o) => {
        const isOpen = expanded === o.id;
        const addr = o.shipping_address || {};
        return (
          <Card key={o.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">#{o.id.slice(0, 8)} • {o.customer_name}</p>
                <p className="text-xs text-muted-foreground truncate">{o.customer_email} • {o.customer_phone}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">{formatCents(o.total_cents)}</p>
                <p className="text-xs text-muted-foreground">{(o.order_items?.length ?? 0)} item(s)</p>
              </div>
              <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)}
                className="rounded border bg-background px-2 py-1 text-sm">
                <option value="pending">Pendente</option>
                <option value="paid">Pago</option>
                <option value="shipped">Enviado</option>
                <option value="delivered">Entregue</option>
                <option value="cancelled">Cancelado</option>
              </select>
              <Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : o.id)}>
                {isOpen ? "Ocultar" : "Detalhes"}
              </Button>
            </div>
            {isOpen && (
              <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm md:grid-cols-2">
                <div>
                  <p className="mb-2 font-semibold">Itens</p>
                  <ul className="space-y-1">
                    {o.order_items?.map((it: any) => (
                      <li key={it.id} className="flex justify-between gap-2">
                        <span className="truncate">{it.quantity}× {it.product_name}</span>
                        <span>{formatCents(it.unit_price_cents * it.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 space-y-0.5 border-t border-border pt-2 text-xs">
                    <div className="flex justify-between"><span>Subtotal</span><span>{formatCents(o.subtotal_cents)}</span></div>
                    <div className="flex justify-between"><span>Frete ({o.shipping_service || "—"})</span><span>{formatCents(o.shipping_cost_cents)}</span></div>
                    <div className="flex justify-between font-bold"><span>Total</span><span>{formatCents(o.total_cents)}</span></div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-semibold">Endereço</p>
                  <p className="text-muted-foreground">
                    {addr.street}, {addr.number}{addr.complement ? ` — ${addr.complement}` : ""}<br />
                    {addr.district} — {addr.city}/{addr.state}<br />
                    CEP {addr.cep}
                  </p>
                  {o.notes && (<><p className="mt-3 font-semibold">Observações</p><p className="text-muted-foreground whitespace-pre-line">{o.notes}</p></>)}
                  {o.mp_payment_id && <p className="mt-3 text-xs text-muted-foreground">MP Payment: {o.mp_payment_id}</p>}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}


// ============ Settings ============
function SettingsTab() {
  const [s, setS] = useState<any>(null);
  const [uploadingHero, setUploadingHero] = useState(false);
  useEffect(() => {
    supabase.from("store_settings").select("*").eq("id", 1).maybeSingle()
      .then(({ data }) => setS(data ?? { id: 1, store_name: "Alpine", whatsapp_number: "", origin_cep: "", cnpj: "", hero_image_url: null }));
  }, []);
  if (!s) return <p className="mt-4">Carregando…</p>;
  const cepDigits = (s.origin_cep || "").replace(/\D/g, "");
  const cepInvalid = cepDigits.length !== 8;

  const uploadHero = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHero(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `site/hero-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setS({ ...s, hero_image_url: data.publicUrl });
      toast.success("Imagem enviada. Clique em Salvar para publicar.");
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    } finally {
      setUploadingHero(false);
      e.target.value = "";
    }
  };

  return (
    <Card className="mt-4 max-w-xl space-y-4 p-6">
      {cepInvalid && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          ⚠ Configure o CEP de origem da loja para que o cálculo de frete funcione no site.
        </div>
      )}
      <div>
        <Label>Nome da loja</Label>
        <Input value={s.store_name} onChange={(e) => setS({ ...s, store_name: e.target.value })} />
      </div>
      <div>
        <Label>WhatsApp (com DDI/DDD, só números)</Label>
        <Input value={s.whatsapp_number} onChange={(e) => setS({ ...s, whatsapp_number: e.target.value })} />
      </div>
      <div>
        <Label>CEP de origem da loja (interno — não exibido ao cliente)</Label>
        <Input
          placeholder="00000-000"
          value={s.origin_cep}
          onChange={(e) => setS({ ...s, origin_cep: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Usado apenas pelo sistema para calcular frete (origem → destino do cliente).
        </p>
      </div>
      <div className="space-y-2 border-t pt-4">
        <Label>Imagem do banner principal (home)</Label>
        <p className="text-xs text-muted-foreground">
          Recomendado: 1600×1024px, JPG ou PNG. Ideal para promoções, lançamentos ou artes sazonais.
        </p>
        {s.hero_image_url && (
          <div className="overflow-hidden rounded-md border">
            <img src={s.hero_image_url} alt="Banner atual" className="h-40 w-full object-cover" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input type="file" accept="image/*" onChange={uploadHero} disabled={uploadingHero} />
          {s.hero_image_url && (
            <Button variant="outline" size="sm" type="button" onClick={() => setS({ ...s, hero_image_url: null })}>
              Voltar ao padrão
            </Button>
          )}
        </div>
        {uploadingHero && <p className="text-xs text-muted-foreground">Enviando imagem…</p>}
      </div>
      <Button onClick={async () => {
        const { error } = await supabase.from("store_settings").update({
          store_name: s.store_name, whatsapp_number: s.whatsapp_number, origin_cep: s.origin_cep,
          hero_image_url: s.hero_image_url || null,
        } as any).eq("id", 1);
        if (error) return toast.error(error.message);
        toast.success("Configurações salvas");
      }}>Salvar</Button>
    </Card>
  );
}


// ============ Payments (PIX) ============
const DEFAULT_PIX_SETTINGS = {
  id: 1,
  pix_enabled: true,
  pix_key: "",
  pix_key_type: "cpf",
  pix_holder_name: "",
  pix_bank: "",
  pix_discount_percent: 5,
  pix_message: "Após o pagamento, envie o comprovante para confirmarmos o pedido.",
  pix_qr_image_url: null,
  pix_copy_paste: null,
};

function PaymentsTab() {
  const [s, setS] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.from("store_settings").select("*").eq("id", 1).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[PaymentsTab] store_settings:", error);
          setLoadError(error.message);
          setS({ ...DEFAULT_PIX_SETTINGS });
          return;
        }
        setS(data ?? { ...DEFAULT_PIX_SETTINGS });
      });
  }, []);

  if (!s) return <p className="mt-4">Carregando configurações de pagamento…</p>;

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `pix-qr/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setS({ ...s, pix_qr_image_url: data.publicUrl });
      toast.success("QR Code enviado");
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("store_settings").update({
      pix_enabled: s.pix_enabled,
      pix_key: s.pix_key || "",
      pix_key_type: s.pix_key_type || "cpf",
      pix_holder_name: s.pix_holder_name || "",
      pix_bank: s.pix_bank || "",
      pix_discount_percent: Number(s.pix_discount_percent) || 0,
      pix_message: s.pix_message || "",
      pix_qr_image_url: s.pix_qr_image_url || null,
      pix_copy_paste: s.pix_copy_paste || null,
    } as any).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações de PIX salvas");
  };

  return (
    <div className="mt-4 space-y-6">
      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Não foi possível carregar as configurações salvas ({loadError}). Os campos abaixo
          estão com valores padrão — preencha e clique em salvar.
        </div>
      )}
      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">PIX</h2>
            <p className="text-sm text-muted-foreground">
              Configure os dados do PIX exibidos ao cliente no checkout.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={!!s.pix_enabled}
              onCheckedChange={(v) => setS({ ...s, pix_enabled: v })}
            />
            {s.pix_enabled ? "Ativo" : "Desativado"}
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Tipo da chave</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={s.pix_key_type || "cpf"}
              onChange={(e) => setS({ ...s, pix_key_type: e.target.value })}
            >
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
              <option value="random">Chave aleatória</option>
            </select>
          </div>
          <div>
            <Label>Chave PIX</Label>
            <Input
              value={s.pix_key || ""}
              onChange={(e) => setS({ ...s, pix_key: e.target.value })}
              placeholder="Ex.: 000.000.000-00"
            />
          </div>
          <div>
            <Label>Nome do favorecido</Label>
            <Input
              value={s.pix_holder_name || ""}
              onChange={(e) => setS({ ...s, pix_holder_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Banco</Label>
            <Input
              value={s.pix_bank || ""}
              onChange={(e) => setS({ ...s, pix_bank: e.target.value })}
              placeholder="Ex.: Nubank, Itaú…"
            />
          </div>
          <div>
            <Label>Desconto no PIX (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={s.pix_discount_percent ?? 0}
              onChange={(e) => setS({ ...s, pix_discount_percent: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Aplicado automaticamente sobre subtotal + frete.
            </p>
          </div>
          <div>
            <Label>Código PIX Copia e Cola (opcional)</Label>
            <Input
              value={s.pix_copy_paste || ""}
              onChange={(e) => setS({ ...s, pix_copy_paste: e.target.value })}
              placeholder="EMV gerado pelo seu banco"
            />
          </div>
        </div>

        <div>
          <Label>Mensagem exibida ao cliente</Label>
          <Textarea
            rows={3}
            value={s.pix_message || ""}
            onChange={(e) => setS({ ...s, pix_message: e.target.value })}
            placeholder="Ex.: Após o pagamento, envie o comprovante no WhatsApp."
          />
        </div>

        <div>
          <Label>QR Code PIX (imagem)</Label>
          <div className="mt-2 flex items-start gap-4">
            {s.pix_qr_image_url ? (
              <div className="relative">
                <img
                  src={s.pix_qr_image_url}
                  alt="QR PIX"
                  className="h-32 w-32 rounded border bg-white object-contain p-1"
                />
                <button
                  type="button"
                  onClick={() => setS({ ...s, pix_qr_image_url: null })}
                  className="absolute right-0 top-0 bg-destructive px-1.5 text-xs text-destructive-foreground"
                >×</button>
              </div>
            ) : (
              <div className="grid h-32 w-32 place-items-center rounded border border-dashed text-xs text-muted-foreground">
                Sem QR
              </div>
            )}
            <Input type="file" accept="image/*" onChange={upload} disabled={uploading} />
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar configurações de PIX"}
        </Button>
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-bold">Outros gateways</h2>
        <p className="text-sm text-muted-foreground">
          Mercado Pago já está integrado para cartão e boleto. Os gateways abaixo serão
          conectados sob demanda — a estrutura de pedidos já está pronta para receber
          confirmação automática.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {["Mercado Pago", "Asaas", "PagSeguro", "Stripe", "Efí"].map((g) => (
            <div key={g} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>{g}</span>
              <Badge variant={g === "Mercado Pago" ? "default" : "secondary"}>
                {g === "Mercado Pago" ? "Conectado" : "Em breve"}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

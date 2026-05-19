import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: AdminPage,
});

function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setEmail(u.user?.email ?? "");
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user!.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, []);

  if (isAdmin === null) {
    return <div className="container mx-auto px-4 py-12">Carregando…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Acesso negado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta ({email}) não possui permissão administrativa. Faça login novamente
          informando o código de acesso.
        </p>
        <Link to="/login" className="mt-4 inline-block text-primary underline">
          Voltar ao login
        </Link>
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
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
        <TabsContent value="vehicles"><VehiclesTab /></TabsContent>
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
  requires_vehicle_config: false,
  category_id: null,
};

function ProductsTab() {
  const [items, setItems] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="mt-4">
      <div className="mb-4 flex justify-between">
        <h2 className="text-lg font-semibold">{items.length} produto(s)</h2>
        <Button onClick={() => setEditing({ ...emptyProduct })}>+ Novo produto</Button>
      </div>
      {loading && <p>Carregando…</p>}
      <div className="grid gap-3">
        {items.map((p) => (
          <Card key={p.id} className="flex items-center gap-4 p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-muted">
              {p.images[0] && <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{p.name}</p>
                {!p.active && <Badge variant="secondary">Inativo</Badge>}
                {p.featured && <Badge>Destaque</Badge>}
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
          <Textarea rows={6} value={p.description ?? ""} onChange={(e) => setP({ ...p, description: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <Switch checked={p.active} onCheckedChange={(v) => setP({ ...p, active: v })} /> Ativo
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={p.featured} onCheckedChange={(v) => setP({ ...p, featured: v })} /> Destaque
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={p.requires_vehicle_config} onCheckedChange={(v) => setP({ ...p, requires_vehicle_config: v })} /> Exige configurador de veículo
          </label>
        </div>
        <div>
          <Label>Imagens</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.images.map((url, i) => (
              <div key={url} className="relative h-24 w-24 overflow-hidden rounded border">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button onClick={() => setP({ ...p, images: p.images.filter((_, j) => j !== i) })}
                  className="absolute right-0 top-0 bg-destructive px-1.5 text-xs text-destructive-foreground">×</button>
              </div>
            ))}
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
  useEffect(() => {
    supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setOrders(data ?? []);
      });
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase.from("orders") as any).update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    setOrders((o) => o.map((x) => (x.id === id ? { ...x, status } : x)));
    toast.success("Status atualizado");
  };

  return (
    <div className="mt-4 space-y-3">
      {orders.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>}
      {orders.map((o) => (
        <Card key={o.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{o.customer_name} • {o.customer_email}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(o.created_at).toLocaleString("pt-BR")} • {formatCents(o.total_cents)}
              </p>
            </div>
            <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value as any)}
              className="rounded border bg-background px-2 py-1 text-sm">
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
              <option value="shipped">Enviado</option>
              <option value="delivered">Entregue</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============ Vehicles ============
function VehiclesTab() {
  const [makes, setMakes] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [cabins, setCabins] = useState<any[]>([]);
  const [newMake, setNewMake] = useState("");
  const [newModel, setNewModel] = useState({ make_id: "", name: "", year_range: "" });
  const [newCabin, setNewCabin] = useState("");

  const load = async () => {
    const [m, mo, c] = await Promise.all([
      supabase.from("vehicle_makes").select("*").order("display_order"),
      supabase.from("vehicle_models").select("*").order("display_order"),
      supabase.from("cabin_types").select("*").order("display_order"),
    ]);
    setMakes(m.data ?? []); setModels(mo.data ?? []); setCabins(c.data ?? []);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="mt-4 grid gap-6 md:grid-cols-3">
      <Card className="p-4">
        <h3 className="mb-3 font-semibold">Marcas</h3>
        <div className="flex gap-2">
          <Input value={newMake} onChange={(e) => setNewMake(e.target.value)} placeholder="Nome da marca" />
          <Button onClick={async () => {
            if (!newMake) return;
            const { error } = await supabase.from("vehicle_makes").insert({ name: newMake });
            if (error) return toast.error(error.message);
            setNewMake(""); load();
          }}>+</Button>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {makes.map((m) => (
            <li key={m.id} className="flex justify-between">
              <span>{m.name}</span>
              <button onClick={async () => {
                if (!confirm(`Excluir ${m.name}?`)) return;
                await supabase.from("vehicle_makes").delete().eq("id", m.id); load();
              }} className="text-destructive">×</button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-semibold">Modelos</h3>
        <div className="space-y-2">
          <select value={newModel.make_id} onChange={(e) => setNewModel({ ...newModel, make_id: e.target.value })}
            className="w-full rounded border bg-background px-2 py-2 text-sm">
            <option value="">Marca…</option>
            {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Input value={newModel.name} onChange={(e) => setNewModel({ ...newModel, name: e.target.value })} placeholder="Modelo" />
          <Input value={newModel.year_range} onChange={(e) => setNewModel({ ...newModel, year_range: e.target.value })} placeholder="Anos (ex: 2020-2024)" />
          <Button className="w-full" onClick={async () => {
            if (!newModel.make_id || !newModel.name) return;
            const { error } = await supabase.from("vehicle_models").insert(newModel);
            if (error) return toast.error(error.message);
            setNewModel({ make_id: "", name: "", year_range: "" }); load();
          }}>Adicionar</Button>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {models.map((m) => (
            <li key={m.id} className="flex justify-between">
              <span>{makes.find((x) => x.id === m.make_id)?.name} {m.name} {m.year_range && `(${m.year_range})`}</span>
              <button onClick={async () => {
                await supabase.from("vehicle_models").delete().eq("id", m.id); load();
              }} className="text-destructive">×</button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-semibold">Tipos de cabine</h3>
        <div className="flex gap-2">
          <Input value={newCabin} onChange={(e) => setNewCabin(e.target.value)} placeholder="Ex: Cabine Dupla" />
          <Button onClick={async () => {
            if (!newCabin) return;
            const { error } = await supabase.from("cabin_types").insert({ name: newCabin });
            if (error) return toast.error(error.message);
            setNewCabin(""); load();
          }}>+</Button>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {cabins.map((c) => (
            <li key={c.id} className="flex justify-between">
              <span>{c.name}</span>
              <button onClick={async () => {
                await supabase.from("cabin_types").delete().eq("id", c.id); load();
              }} className="text-destructive">×</button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ============ Settings ============
function SettingsTab() {
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    supabase.from("store_settings").select("*").eq("id", 1).maybeSingle()
      .then(({ data }) => setS(data ?? { id: 1, store_name: "AutoPremium", whatsapp_number: "", origin_cep: "" }));
  }, []);
  if (!s) return <p className="mt-4">Carregando…</p>;
  return (
    <Card className="mt-4 max-w-xl space-y-4 p-6">
      <div>
        <Label>Nome da loja</Label>
        <Input value={s.store_name} onChange={(e) => setS({ ...s, store_name: e.target.value })} />
      </div>
      <div>
        <Label>WhatsApp (com DDI/DDD, só números)</Label>
        <Input value={s.whatsapp_number} onChange={(e) => setS({ ...s, whatsapp_number: e.target.value })} />
      </div>
      <div>
        <Label>CEP de origem (envios)</Label>
        <Input value={s.origin_cep} onChange={(e) => setS({ ...s, origin_cep: e.target.value })} />
      </div>
      <Button onClick={async () => {
        const { error } = await supabase.from("store_settings").update({
          store_name: s.store_name, whatsapp_number: s.whatsapp_number, origin_cep: s.origin_cep,
        }).eq("id", 1);
        if (error) return toast.error(error.message);
        toast.success("Configurações salvas");
      }}>Salvar</Button>
    </Card>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, ImageIcon } from "lucide-react";

type Make = { id: string; name: string; image_url: string | null; display_order: number; active: boolean };
type Model = { id: string; make_id: string; name: string; image_url: string | null; year_from: number | null; year_to: number | null; year_range: string | null; display_order: number; active: boolean };
type Cabin = { id: string; name: string; description: string | null; image_url: string | null; display_order: number; active: boolean };
type Mapping = { id: string; model_id: string | null; cabin_type_id: string | null; product_id: string | null; year_from: number | null; year_to: number | null; active: boolean };

export function VehiclesAdmin() {
  return (
    <Tabs defaultValue="makes" className="mt-4">
      <TabsList className="flex w-full flex-wrap">
        <TabsTrigger value="makes">Marcas</TabsTrigger>
        <TabsTrigger value="models">Modelos</TabsTrigger>
        <TabsTrigger value="cabins">Cabines</TabsTrigger>
        <TabsTrigger value="mappings">Compatibilidades</TabsTrigger>
      </TabsList>
      <TabsContent value="makes"><MakesPanel /></TabsContent>
      <TabsContent value="models"><ModelsPanel /></TabsContent>
      <TabsContent value="cabins"><CabinsPanel /></TabsContent>
      <TabsContent value="mappings"><MappingsPanel /></TabsContent>
    </Tabs>
  );
}

// ---------- Shared upload ----------
async function uploadImage(file: File): Promise<string> {
  const path = `vehicles/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

function ImageField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="flex flex-col gap-1">
        <Input type="file" accept="image/*" disabled={busy} onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setBusy(true);
          try { onChange(await uploadImage(f)); toast.success("Imagem enviada"); }
          catch (err: any) { toast.error(err.message || "Falha no upload"); }
          finally { setBusy(false); e.target.value = ""; }
        }} />
        {value && <button type="button" onClick={() => onChange(null)} className="text-left text-xs text-destructive hover:underline">Remover</button>}
      </div>
    </div>
  );
}

// ---------- Marcas ----------
function MakesPanel() {
  const [items, setItems] = useState<Make[]>([]);
  const [editing, setEditing] = useState<Partial<Make> | null>(null);

  const load = async () => {
    const { data } = await supabase.from("vehicle_makes").select("*").order("display_order");
    setItems((data as Make[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name) return toast.error("Nome obrigatório");
    const payload = { name: editing.name, image_url: editing.image_url ?? null, display_order: editing.display_order ?? 0, active: editing.active ?? true };
    const res = editing.id
      ? await supabase.from("vehicle_makes").update(payload).eq("id", editing.id)
      : await supabase.from("vehicle_makes").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Marca salva"); setEditing(null); load();
  };
  const toggle = async (m: Make) => {
    await supabase.from("vehicle_makes").update({ active: !m.active }).eq("id", m.id); load();
  };
  const remove = async (m: Make) => {
    if (!confirm(`Excluir "${m.name}"? Modelos vinculados serão removidos.`)) return;
    const { error } = await supabase.from("vehicle_makes").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído"); load();
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-between">
        <h3 className="text-lg font-semibold">{items.length} marca(s)</h3>
        <Button onClick={() => setEditing({ active: true, display_order: items.length })}><Plus className="mr-1 h-4 w-4" /> Nova marca</Button>
      </div>

      {editing && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Nome</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div><Label>Ordem de exibição</Label><Input type="number" value={editing.display_order ?? 0} onChange={(e) => setEditing({ ...editing, display_order: parseInt(e.target.value || "0") })} /></div>
          </div>
          <div><Label>Imagem</Label><ImageField value={editing.image_url ?? null} onChange={(v) => setEditing({ ...editing, image_url: v })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Ativo no configurador</label>
          <div className="flex gap-2"><Button onClick={save}>Salvar</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
        </Card>
      )}

      <div className="grid gap-2">
        {items.map((m) => (
          <Card key={m.id} className="flex items-center gap-3 p-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
              {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">—</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">Ordem: {m.display_order}</p>
            </div>
            {!m.active && <Badge variant="secondary">Inativo</Badge>}
            <Switch checked={m.active} onCheckedChange={() => toggle(m)} />
            <Button variant="ghost" size="icon" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- Modelos ----------
function ModelsPanel() {
  const [items, setItems] = useState<Model[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [editing, setEditing] = useState<Partial<Model> | null>(null);
  const [filter, setFilter] = useState<string>("");

  const load = async () => {
    const [mo, ma] = await Promise.all([
      supabase.from("vehicle_models").select("*").order("display_order"),
      supabase.from("vehicle_makes").select("*").order("display_order"),
    ]);
    setItems((mo.data as Model[]) ?? []); setMakes((ma.data as Make[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.make_id || !editing?.name) return toast.error("Marca e nome são obrigatórios");
    const payload = {
      make_id: editing.make_id, name: editing.name,
      image_url: editing.image_url ?? null,
      year_from: editing.year_from ?? null, year_to: editing.year_to ?? null,
      year_range: editing.year_from && editing.year_to ? `${editing.year_from}-${editing.year_to}` : (editing.year_range ?? null),
      display_order: editing.display_order ?? 0, active: editing.active ?? true,
    };
    const res = editing.id
      ? await supabase.from("vehicle_models").update(payload).eq("id", editing.id)
      : await supabase.from("vehicle_models").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Modelo salvo"); setEditing(null); load();
  };
  const toggle = async (m: Model) => { await supabase.from("vehicle_models").update({ active: !m.active }).eq("id", m.id); load(); };
  const remove = async (m: Model) => {
    if (!confirm(`Excluir modelo "${m.name}"?`)) return;
    const { error } = await supabase.from("vehicle_models").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    load();
  };

  const filtered = filter ? items.filter((i) => i.make_id === filter) : items;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{filtered.length} modelo(s)</h3>
        <div className="flex gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border bg-background px-3 py-2 text-sm">
            <option value="">Todas as marcas</option>
            {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Button onClick={() => setEditing({ active: true, make_id: filter || makes[0]?.id, display_order: items.length })}><Plus className="mr-1 h-4 w-4" /> Novo modelo</Button>
        </div>
      </div>

      {editing && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Marca</Label>
              <select value={editing.make_id ?? ""} onChange={(e) => setEditing({ ...editing, make_id: e.target.value })} className="w-full rounded border bg-background px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div><Label>Nome</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div><Label>Ano inicial</Label><Input type="number" value={editing.year_from ?? ""} onChange={(e) => setEditing({ ...editing, year_from: e.target.value ? parseInt(e.target.value) : null })} placeholder="ex: 2012" /></div>
            <div><Label>Ano final</Label><Input type="number" value={editing.year_to ?? ""} onChange={(e) => setEditing({ ...editing, year_to: e.target.value ? parseInt(e.target.value) : null })} placeholder="ex: 2024" /></div>
            <div><Label>Ordem</Label><Input type="number" value={editing.display_order ?? 0} onChange={(e) => setEditing({ ...editing, display_order: parseInt(e.target.value || "0") })} /></div>
          </div>
          <div><Label>Imagem</Label><ImageField value={editing.image_url ?? null} onChange={(v) => setEditing({ ...editing, image_url: v })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Ativo</label>
          <div className="flex gap-2"><Button onClick={save}>Salvar</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
        </Card>
      )}

      <div className="grid gap-2">
        {filtered.map((m) => (
          <Card key={m.id} className="flex items-center gap-3 p-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
              {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">—</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{makes.find((x) => x.id === m.make_id)?.name} · {m.name}</p>
              <p className="text-xs text-muted-foreground">
                {m.year_from && m.year_to ? `${m.year_from}–${m.year_to}` : (m.year_range || "sem anos definidos")}
              </p>
            </div>
            {!m.active && <Badge variant="secondary">Inativo</Badge>}
            <Switch checked={m.active} onCheckedChange={() => toggle(m)} />
            <Button variant="ghost" size="icon" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- Cabines ----------
function CabinsPanel() {
  const [items, setItems] = useState<Cabin[]>([]);
  const [editing, setEditing] = useState<Partial<Cabin> | null>(null);

  const load = async () => {
    const { data } = await supabase.from("cabin_types").select("*").order("display_order");
    setItems((data as Cabin[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name) return toast.error("Nome obrigatório");
    const payload = { name: editing.name, description: editing.description ?? null, image_url: editing.image_url ?? null, display_order: editing.display_order ?? 0, active: editing.active ?? true };
    const res = editing.id
      ? await supabase.from("cabin_types").update(payload).eq("id", editing.id)
      : await supabase.from("cabin_types").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Cabine salva"); setEditing(null); load();
  };
  const toggle = async (m: Cabin) => { await supabase.from("cabin_types").update({ active: !m.active }).eq("id", m.id); load(); };
  const remove = async (m: Cabin) => {
    if (!confirm(`Excluir "${m.name}"?`)) return;
    const { error } = await supabase.from("cabin_types").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-between">
        <h3 className="text-lg font-semibold">{items.length} tipo(s) de cabine</h3>
        <Button onClick={() => setEditing({ active: true, display_order: items.length })}><Plus className="mr-1 h-4 w-4" /> Nova cabine</Button>
      </div>

      {editing && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Nome</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div><Label>Ordem</Label><Input type="number" value={editing.display_order ?? 0} onChange={(e) => setEditing({ ...editing, display_order: parseInt(e.target.value || "0") })} /></div>
          </div>
          <div><Label>Descrição</Label><Textarea rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
          <div><Label>Imagem</Label><ImageField value={editing.image_url ?? null} onChange={(v) => setEditing({ ...editing, image_url: v })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Ativo</label>
          <div className="flex gap-2"><Button onClick={save}>Salvar</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
        </Card>
      )}

      <div className="grid gap-2">
        {items.map((c) => (
          <Card key={c.id} className="flex items-center gap-3 p-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
              {c.image_url ? <img src={c.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">—</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.name}</p>
              {c.description && <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>}
            </div>
            {!c.active && <Badge variant="secondary">Inativo</Badge>}
            <Switch checked={c.active} onCheckedChange={() => toggle(c)} />
            <Button variant="ghost" size="icon" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- Compatibilidades ----------
function MappingsPanel() {
  const [items, setItems] = useState<Mapping[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<(Partial<Mapping> & { _make_id?: string }) | null>(null);
  const [filterMake, setFilterMake] = useState("");
  const [filterModel, setFilterModel] = useState("");

  const load = async () => {
    const [vpm, ma, mo, c, p] = await Promise.all([
      supabase.from("vehicle_product_map").select("*"),
      supabase.from("vehicle_makes").select("*").order("display_order"),
      supabase.from("vehicle_models").select("*").order("display_order"),
      supabase.from("cabin_types").select("*").order("display_order"),
      supabase.from("products").select("id, name").order("name"),
    ]);
    setItems((vpm.data as Mapping[]) ?? []);
    setMakes((ma.data as Make[]) ?? []);
    setModels((mo.data as Model[]) ?? []);
    setCabins((c.data as Cabin[]) ?? []);
    setProducts((p.data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const modelMakeMap = useMemo(() => new Map(models.map((m) => [m.id, m.make_id])), [models]);
  const filtered = items.filter((it) => {
    if (filterMake) {
      const mk = it.model_id ? modelMakeMap.get(it.model_id) : null;
      if (mk !== filterMake) return false;
    }
    if (filterModel && it.model_id !== filterModel) return false;
    return true;
  });

  const save = async () => {
    if (!editing?.model_id || !editing?.cabin_type_id || !editing?.product_id) return toast.error("Modelo, cabine e produto são obrigatórios");
    const payload = {
      model_id: editing.model_id, cabin_type_id: editing.cabin_type_id, product_id: editing.product_id,
      year_from: editing.year_from ?? null, year_to: editing.year_to ?? null, active: editing.active ?? true,
    };
    const res = editing.id
      ? await supabase.from("vehicle_product_map").update(payload).eq("id", editing.id)
      : await supabase.from("vehicle_product_map").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Compatibilidade salva"); setEditing(null); load();
  };
  const toggle = async (m: Mapping) => { await supabase.from("vehicle_product_map").update({ active: !m.active }).eq("id", m.id); load(); };
  const remove = async (m: Mapping) => {
    if (!confirm("Excluir esta compatibilidade?")) return;
    await supabase.from("vehicle_product_map").delete().eq("id", m.id); load();
  };

  const editMakeId = editing?._make_id || (editing?.model_id ? modelMakeMap.get(editing.model_id) : "") || "";
  const modelOptions = editMakeId ? models.filter((m) => m.make_id === editMakeId) : models;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{filtered.length} compatibilidade(s)</h3>
        <div className="flex flex-wrap gap-2">
          <select value={filterMake} onChange={(e) => { setFilterMake(e.target.value); setFilterModel(""); }} className="rounded border bg-background px-3 py-2 text-sm">
            <option value="">Todas as marcas</option>
            {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={filterModel} onChange={(e) => setFilterModel(e.target.value)} className="rounded border bg-background px-3 py-2 text-sm">
            <option value="">Todos os modelos</option>
            {(filterMake ? models.filter((m) => m.make_id === filterMake) : models).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Button onClick={() => setEditing({ active: true })}><Plus className="mr-1 h-4 w-4" /> Nova</Button>
        </div>
      </div>

      {editing && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Marca</Label>
              <select value={editMakeId} onChange={(e) => setEditing({ ...editing, _make_id: e.target.value, model_id: undefined })} className="w-full rounded border bg-background px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Modelo</Label>
              <select value={editing.model_id ?? ""} onChange={(e) => setEditing({ ...editing, model_id: e.target.value })} className="w-full rounded border bg-background px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Cabine</Label>
              <select value={editing.cabin_type_id ?? ""} onChange={(e) => setEditing({ ...editing, cabin_type_id: e.target.value })} className="w-full rounded border bg-background px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {cabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Produto vinculado</Label>
              <select value={editing.product_id ?? ""} onChange={(e) => setEditing({ ...editing, product_id: e.target.value })} className="w-full rounded border bg-background px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><Label>Ano inicial (opcional)</Label><Input type="number" value={editing.year_from ?? ""} onChange={(e) => setEditing({ ...editing, year_from: e.target.value ? parseInt(e.target.value) : null })} /></div>
            <div><Label>Ano final (opcional)</Label><Input type="number" value={editing.year_to ?? ""} onChange={(e) => setEditing({ ...editing, year_to: e.target.value ? parseInt(e.target.value) : null })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Deixe os anos em branco para valer para todos os anos do modelo.</p>
          <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Ativa</label>
          <div className="flex gap-2"><Button onClick={save}>Salvar</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
        </Card>
      )}

      <div className="grid gap-2">
        {filtered.map((it) => {
          const model = models.find((m) => m.id === it.model_id);
          const make = model ? makes.find((m) => m.id === model.make_id) : null;
          const cabin = cabins.find((c) => c.id === it.cabin_type_id);
          const product = products.find((p) => p.id === it.product_id);
          const years = it.year_from || it.year_to ? `${it.year_from ?? "—"}–${it.year_to ?? "—"}` : "todos anos";
          return (
            <Card key={it.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{make?.name} {model?.name} · {cabin?.name} · {years}</p>
                <p className="text-xs text-muted-foreground truncate">→ {product?.name ?? <span className="text-destructive">produto removido</span>}</p>
              </div>
              {!it.active && <Badge variant="secondary">Inativa</Badge>}
              <Switch checked={it.active} onCheckedChange={() => toggle(it)} />
              <Button variant="ghost" size="icon" onClick={() => setEditing(it)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma compatibilidade cadastrada. Adicione uma para que o configurador encontre o produto certo.
          </div>
        )}
      </div>
    </div>
  );
}

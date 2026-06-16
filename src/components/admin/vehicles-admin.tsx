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
import { Pencil, Trash2, Plus, ImageIcon, ChevronUp, ChevronDown, GripVertical } from "lucide-react";

type Make = { id: string; name: string; image_url: string | null; display_order: number; active: boolean };
type Model = { id: string; make_id: string; name: string; image_url: string | null; year_from: number | null; year_to: number | null; year_range: string | null; display_order: number; active: boolean };
type Cabin = { id: string; name: string; description: string | null; image_url: string | null; display_order: number; active: boolean };
type CompatAnswer = string | string[];
type Mapping = { id: string; model_id: string | null; cabin_type_id: string | null; product_id: string | null; year_from: number | null; year_to: number | null; active: boolean; answers: Record<string, CompatAnswer> | null };
type Question = { id: string; key: string; label: string; help_text: string | null; type: string; active: boolean; model_id?: string | null };
type Option = { id: string; question_id: string; value: string; label: string; image_url: string | null; display_order: number; active: boolean; terminates_flow?: boolean };
type Flow = { id: string; model_id: string; question_id: string; year_from: number | null; year_to: number | null; display_order: number; required: boolean; active: boolean; hidden?: boolean; auto_answer?: string | null };

const sb = supabase as any;

const WILDCARD_COMPAT_VALUES = new Set(["", "*", "any", "all", "qualquer", "(qualquer)", "todos", "todas"]);

function isWildcardCompatValue(value: unknown) {
  if (Array.isArray(value)) return value.length === 0 || value.every(isWildcardCompatValue);
  const normalized = String(value ?? "").trim().toLowerCase();
  return WILDCARD_COMPAT_VALUES.has(normalized) || normalized.replace(/[()]/g, "").trim() === "qualquer";
}

function showAdminError(error: unknown, fallback = "Não foi possível concluir a ação") {
  if (!error) return false;
  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message)
    : fallback;
  toast.error(message || fallback);
  return true;
}

export function VehiclesAdmin() {
  return (
    <Tabs defaultValue="makes" className="mt-4">
      <TabsList className="flex w-full flex-wrap">
        <TabsTrigger value="makes">Marcas</TabsTrigger>
        <TabsTrigger value="models">Modelos</TabsTrigger>
        <TabsTrigger value="questions">Perguntas</TabsTrigger>
        <TabsTrigger value="flows">Fluxos</TabsTrigger>
        <TabsTrigger value="mappings">Compatibilidades</TabsTrigger>
      </TabsList>
      <TabsContent value="makes"><MakesPanel /></TabsContent>
      <TabsContent value="models"><ModelsPanel /></TabsContent>
      <TabsContent value="questions"><QuestionsPanel /></TabsContent>
      <TabsContent value="flows"><FlowsPanel /></TabsContent>
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
    const { error } = await supabase.from("vehicle_makes").update({ active: !m.active }).eq("id", m.id);
    if (showAdminError(error)) return;
    load();
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
    
    // Validate year range
    if (editing.year_from && editing.year_to && editing.year_from > editing.year_to) {
      return toast.error("O ano inicial não pode ser maior que o ano final");
    }

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
  const toggle = async (m: Model) => {
    const { error } = await supabase.from("vehicle_models").update({ active: !m.active }).eq("id", m.id);
    if (showAdminError(error)) return;
    load();
  };
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
  const toggle = async (m: Cabin) => {
    const { error } = await supabase.from("cabin_types").update({ active: !m.active }).eq("id", m.id);
    if (showAdminError(error)) return;
    load();
  };
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

// ---------- Perguntas ----------
function QuestionsPanel() {
  const [items, setItems] = useState<Question[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [editing, setEditing] = useState<Partial<Question & { model_id: string | null }> | null>(null);
  const [optionsFor, setOptionsFor] = useState<Question | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterModel, setFilterModel] = useState<string>("all");

  const load = async () => {
    const [q, o, m] = await Promise.all([
      sb.from("configurator_questions").select("*").order("display_order").order("label"),
      sb.from("configurator_options").select("*").order("display_order"),
      supabase.from("vehicle_models").select("id, name, make_id").order("name"),
    ]);
    setItems((q.data as Question[]) ?? []);
    setOptions((o.data as Option[]) ?? []);
    setModels((m.data as Model[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.key || !editing?.label) return toast.error("Chave e rótulo são obrigatórios");
    const payload: any = {
      key: editing.key.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      label: editing.label,
      help_text: editing.help_text ?? null,
      type: "single_choice",
      active: editing.active ?? true,
      model_id: editing.model_id || null,
    };
    if (!editing.id) payload.display_order = items.length;
    const res = editing.id
      ? await sb.from("configurator_questions").update(payload).eq("id", editing.id)
      : await sb.from("configurator_questions").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Pergunta salva"); setEditing(null); load();
  };
  const toggle = async (q: Question) => {
    const { error } = await sb.from("configurator_questions").update({ active: !q.active }).eq("id", q.id);
    if (showAdminError(error)) return;
    load();
  };
  const remove = async (q: Question) => {
    if (!confirm(`Excluir pergunta "${q.label}"? Opções e fluxos vinculados serão removidos.`)) return;
    const { error } = await sb.from("configurator_questions").delete().eq("id", q.id);
    if (error) return toast.error(error.message);
    load();
  };

  const reorder = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const srcIdx = items.findIndex((i) => i.id === sourceId);
    const tgtIdx = items.findIndex((i) => i.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const next = [...items];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    setItems(next);
    const results = await Promise.all(
      next.map((q, idx) =>
        sb.from("configurator_questions").update({ display_order: idx }).eq("id", q.id),
      ),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) { toast.error(err.message); load(); }
  };

  const normSearch = search.trim().toLowerCase();
  const visibleItems = items.filter((q) => {
    const searchMatch = !normSearch || 
      q.label.toLowerCase().includes(normSearch) ||
      q.key.toLowerCase().includes(normSearch);
    
    const modelMatch = filterModel === "all" || 
      (filterModel === "none" ? !q.model_id : q.model_id === filterModel);
    
    return searchMatch && modelMatch;
  });

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{visibleItems.length} de {items.length} pergunta(s)</h3>
        <div className="flex flex-wrap gap-2">
          <select 
            value={filterModel} 
            onChange={(e) => setFilterModel(e.target.value)} 
            className="rounded border bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todos os modelos</option>
            <option value="none">Sem modelo (Geral)</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou chave…"
            className="w-48"
          />
          <Button onClick={() => setEditing({ active: true, model_id: filterModel !== "all" && filterModel !== "none" ? filterModel : null })}>
            <Plus className="mr-1 h-4 w-4" /> Nova pergunta
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Arraste pelo ícone à esquerda para reordenar as perguntas.</p>


      {editing && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Modelo (Pasta)</Label>
              <select 
                value={editing.model_id ?? ""} 
                onChange={(e) => setEditing({ ...editing, model_id: e.target.value || null })} 
                className="w-full rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="">Geral (sem modelo)</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Chave técnica</Label>
              <Input value={editing.key ?? ""} onChange={(e) => setEditing({ ...editing, key: e.target.value })} placeholder="ex: cabine, versao, grade" />
            </div>
            <div>
              <Label>Rótulo (texto da pergunta)</Label>
              <Input value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="ex: Qual o tipo de cabine?" />
            </div>
          </div>
          <div><Label>Texto de ajuda (opcional)</Label><Textarea rows={2} value={editing.help_text ?? ""} onChange={(e) => setEditing({ ...editing, help_text: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Ativa</label>
          <div className="flex gap-2"><Button onClick={save}>Salvar</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
        </Card>
      )}

      <div className="grid gap-2">
        {visibleItems.map((q) => {
          const count = options.filter((o) => o.question_id === q.id).length;
          const isDragging = dragId === q.id;
          return (
            <Card
              key={q.id}
              className={`flex flex-wrap items-center gap-3 p-3 ${isDragging ? "opacity-50" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const src = e.dataTransfer.getData("text/plain");
                if (src) reorder(src, q.id);
                setDragId(null);
              }}
            >
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  setDragId(q.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", q.id);
                }}
                onDragEnd={() => setDragId(null)}
                className="cursor-grab select-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                title="Arraste para reordenar"
                aria-label="Arrastar"
              >
                <GripVertical className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{q.label}</p>
                  {q.model_id && (
                    <Badge variant="outline" className="text-[10px] py-0 h-4">
                      {models.find(m => m.id === q.model_id)?.name}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">chave: <code>{q.key}</code> · {count} opção(ões)</p>
              </div>
              {!q.active && <Badge variant="secondary">Inativa</Badge>}
              <Button variant="outline" size="sm" onClick={() => setOptionsFor(q)}>Opções</Button>
              <Switch checked={q.active} onCheckedChange={() => toggle(q)} />
              <Button variant="ghost" size="icon" onClick={() => setEditing(q)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(q)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </Card>
          );
        })}
        {visibleItems.length === 0 && items.length > 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma pergunta encontrada para "{search}".
          </div>
        )}
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma pergunta cadastrada. Crie perguntas como "Cabine", "Versão", "Grade", "Ganchos", "Estepe" — depois associe a modelos na aba Fluxos.
          </div>
        )}
      </div>

      {optionsFor && (
        <OptionsEditor
          question={optionsFor}
          onClose={() => { setOptionsFor(null); load(); }}
        />
      )}
    </div>
  );
}

function OptionsEditor({ question, onClose }: { question: Question; onClose: () => void }) {
  const [items, setItems] = useState<Option[]>([]);
  const [editing, setEditing] = useState<Partial<Option> | null>(null);

  const load = async () => {
    const { data } = await sb.from("configurator_options").select("*").eq("question_id", question.id).order("display_order");
    setItems((data as Option[]) ?? []);
  };
  useEffect(() => { load(); }, [question.id]);

  const save = async () => {
    if (!editing?.value || !editing?.label) return toast.error("Valor e rótulo são obrigatórios");
    const payload = {
      question_id: question.id,
      value: editing.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
      label: editing.label,
      image_url: editing.image_url ?? null,
      display_order: editing.display_order ?? items.length,
      active: editing.active ?? true,
      terminates_flow: editing.terminates_flow ?? false,
    };
    const res = editing.id
      ? await sb.from("configurator_options").update(payload).eq("id", editing.id)
      : await sb.from("configurator_options").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Opção salva"); setEditing(null); load();
  };
  const remove = async (o: Option) => {
    if (!confirm(`Excluir opção "${o.label}"?`)) return;
    const { error } = await sb.from("configurator_options").delete().eq("id", o.id);
    if (showAdminError(error)) return;
    toast.success("Opção excluída");
    load();
  };

  return (
    <Card className="space-y-3 border-primary/40 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Opções de "{question.label}"</h4>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setEditing({ active: true, display_order: items.length })}><Plus className="mr-1 h-4 w-4" /> Nova opção</Button>
          <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>

      {editing && (
        <Card className="space-y-3 bg-muted/30 p-3">
          <div className="grid gap-2 md:grid-cols-3">
            <div><Label>Valor</Label><Input value={editing.value ?? ""} onChange={(e) => setEditing({ ...editing, value: e.target.value })} placeholder="ex: dupla, simples, sim, nao" /></div>
            <div><Label>Rótulo</Label><Input value={editing.label ?? ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="ex: Cabine dupla" /></div>
            <div><Label>Ordem</Label><Input type="number" value={editing.display_order ?? 0} onChange={(e) => setEditing({ ...editing, display_order: parseInt(e.target.value || "0") })} /></div>
          </div>
          <div><Label>Imagem (opcional)</Label><ImageField value={editing.image_url ?? null} onChange={(v) => setEditing({ ...editing, image_url: v })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Ativa</label>
          <label className="flex items-start gap-2 text-sm">
            <Switch checked={editing.terminates_flow ?? false} onCheckedChange={(v) => setEditing({ ...editing, terminates_flow: v })} />
            <span className="leading-tight">
              Finaliza o fluxo antecipadamente
              <span className="block text-xs text-muted-foreground">Quando o cliente escolhe esta opção, pula as perguntas seguintes e mostra o resultado direto. Útil para versões "completas" (ex.: Cross) que já vêm com todos os itens.</span>
            </span>
          </label>
          <div className="flex gap-2"><Button size="sm" onClick={save}>Salvar</Button><Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
        </Card>
      )}

      <div className="grid gap-2">
        {items.map((o) => (
          <div key={o.id} className="flex items-center gap-2 rounded border border-border bg-background p-2">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
              {o.image_url ? <img src={o.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">—</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{o.label}</p>
              <p className="text-xs text-muted-foreground">valor: <code>{o.value}</code></p>
            </div>
            {o.terminates_flow && <Badge className="text-xs">Finaliza fluxo</Badge>}
            {!o.active && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
            <Button size="icon" variant="ghost" onClick={() => setEditing(o)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => remove(o)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        {items.length === 0 && <p className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Sem opções ainda.</p>}
      </div>
    </Card>
  );
}

// ---------- Fluxos por veículo ----------
function FlowsPanel() {
  const [makes, setMakes] = useState<Make[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [filterMake, setFilterMake] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [dragId, setDragId] = useState<string | null>(null);

  const load = async () => {
    const [ma, mo, q, o, f] = await Promise.all([
      supabase.from("vehicle_makes").select("*").order("display_order"),
      supabase.from("vehicle_models").select("*").order("display_order"),
      sb.from("configurator_questions").select("*").eq("active", true).order("label"),
      sb.from("configurator_options").select("*").eq("active", true).order("display_order"),
      sb.from("vehicle_question_flow").select("*").order("display_order"),
    ]);
    setMakes((ma.data as Make[]) ?? []);
    setModels((mo.data as Model[]) ?? []);
    setQuestions((q.data as Question[]) ?? []);
    setOptions((o.data as Option[]) ?? []);
    setFlows((f.data as Flow[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const modelOptions = filterMake ? models.filter((m) => m.make_id === filterMake) : models;
  const modelFlows = flows.filter((f) => f.model_id === selectedModel).sort((a, b) => a.display_order - b.display_order);
  const usedQuestionIds = new Set(modelFlows.map((f) => f.question_id));
  const available = questions.filter((q) => {
    if (usedQuestionIds.has(q.id)) return false;
    // Only show questions that are general or linked to this specific model
    return !q.model_id || q.model_id === selectedModel;
  });

  const addQuestion = async (questionId: string) => {
    if (!selectedModel) return;
    const { error } = await sb.from("vehicle_question_flow").insert({
      model_id: selectedModel, question_id: questionId,
      display_order: modelFlows.length, required: true, active: true,
    });
    if (error) return toast.error(error.message);
    load();
  };
  const removeFlow = async (id: string) => {
    if (!confirm("Excluir esta função do fluxo?")) return;
    const { error } = await sb.from("vehicle_question_flow").delete().eq("id", id);
    if (showAdminError(error)) return;
    toast.success("Função removida do fluxo");
    load();
  };
  const toggleFlow = async (f: Flow) => {
    const { error } = await sb.from("vehicle_question_flow").update({ active: !f.active }).eq("id", f.id);
    if (showAdminError(error)) return;
    load();
  };
  const reorderFlow = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const srcIdx = modelFlows.findIndex((i) => i.id === sourceId);
    const tgtIdx = modelFlows.findIndex((i) => i.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const next = [...modelFlows];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    // optimistic update
    const otherFlows = flows.filter((x) => x.model_id !== selectedModel);
    setFlows([...otherFlows, ...next.map((f, idx) => ({ ...f, display_order: idx }))]);
    const results = await Promise.all(
      next.map((f, idx) =>
        sb.from("vehicle_question_flow").update({ display_order: idx }).eq("id", f.id),
      ),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) { toast.error(err.message); load(); }
  };

  const updateYears = async (f: Flow, yf: number | null, yt: number | null) => {
    if (yf && yt && yf > yt) {
      return toast.error("O ano inicial não pode ser maior que o ano final");
    }
    const { error } = await sb.from("vehicle_question_flow").update({ year_from: yf, year_to: yt }).eq("id", f.id);
    if (showAdminError(error)) return;
    load();
  };
  const updateFlow = async (f: Flow, patch: Partial<Flow>) => {
    const { error } = await sb.from("vehicle_question_flow").update(patch as any).eq("id", f.id);
    if (showAdminError(error)) return;
    load();
  };

  const selectedModelObj = models.find((m) => m.id === selectedModel);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={filterMake} onChange={(e) => { setFilterMake(e.target.value); setSelectedModel(""); }} className="rounded border bg-background px-3 py-2 text-sm">
          <option value="">Selecione a marca…</option>
          {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="rounded border bg-background px-3 py-2 text-sm" disabled={!filterMake}>
          <option value="">Selecione o modelo…</option>
          {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {!selectedModel && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Escolha uma marca e um modelo para configurar o fluxo de perguntas do configurador.
        </div>
      )}

      {selectedModel && (
        <div className="space-y-4">
          <Card className="p-4">
            <h4 className="font-semibold">Perguntas do fluxo — {selectedModelObj?.name}</h4>
            <p className="mt-1 text-xs text-muted-foreground">Na ordem em que serão apresentadas ao cliente. Use a faixa de anos para variar perguntas entre gerações do mesmo modelo (deixe em branco para todos os anos).</p>
            <div className="mt-3 space-y-2">
              {modelFlows.map((f, i) => {
                const q = questions.find((x) => x.id === f.question_id);
                const qOpts = options.filter((o) => o.question_id === f.question_id);
                const isDragging = dragId === f.id;
                return (
                  <div
                    key={f.id}
                    className={`rounded border border-border bg-background p-2 ${isDragging ? "opacity-50" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const src = e.dataTransfer.getData("text/plain");
                      if (src) reorderFlow(src, f.id);
                      setDragId(null);
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          setDragId(f.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", f.id);
                        }}
                        onDragEnd={() => setDragId(null)}
                        className="cursor-grab select-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                        title="Arraste para reordenar"
                        aria-label="Arrastar"
                      >
                        <GripVertical className="h-5 w-5" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{q?.label ?? "?"}</p>
                        <p className="text-xs text-muted-foreground">chave: <code>{q?.key}</code></p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input type="number" placeholder="de" className="h-8 w-20 text-xs"
                          defaultValue={f.year_from ?? ""}
                          onBlur={(e) => updateYears(f, e.target.value ? parseInt(e.target.value) : null, f.year_to)} />
                        <span className="text-xs text-muted-foreground">a</span>
                        <Input type="number" placeholder="até" className="h-8 w-20 text-xs"
                          defaultValue={f.year_to ?? ""}
                          onBlur={(e) => updateYears(f, f.year_from, e.target.value ? parseInt(e.target.value) : null)} />
                      </div>
                      {!f.active && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
                      {f.hidden && <Badge className="text-xs">Oculta</Badge>}
                      <Switch checked={f.active} onCheckedChange={() => toggleFlow(f)} />
                      <Button size="icon" variant="ghost" onClick={() => removeFlow(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-dashed border-border pt-2">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch checked={!!f.hidden} onCheckedChange={(v) => updateFlow(f, { hidden: v })} />
                        Ocultar do cliente
                      </label>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground">Resposta automática:</Label>
                        <select
                          value={f.auto_answer ?? ""}
                          onChange={(e) => updateFlow(f, { auto_answer: e.target.value || null })}
                          className="h-8 rounded border bg-background px-2 text-xs"
                        >
                          <option value="">— nenhuma —</option>
                          {qOpts.map((o) => <option key={o.id} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        Oculta + resposta automática = item de fábrica (ex.: ganchos sempre "sim").
                      </span>
                    </div>
                  </div>
                );
              })}
              {modelFlows.length === 0 && <p className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Sem perguntas — adicione abaixo.</p>}
            </div>
          </Card>

          {available.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-semibold">Adicionar pergunta ao fluxo</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {available.map((q) => (
                  <Button key={q.id} size="sm" variant="outline" onClick={() => addQuestion(q.id)} title={`chave: ${q.key}`}>
                    <Plus className="mr-1 h-3 w-3" /> {q.label}
                    <span className="ml-1 text-[10px] text-muted-foreground">({q.key})</span>
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <FlowSimulator
            model={selectedModelObj}
            flows={modelFlows}
            questions={questions}
            options={options}
          />

        </div>
      )}
    </div>
  );
}

// ---------- Compatibilidades ----------
function MappingsPanel() {
  const [items, setItems] = useState<Mapping[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; images?: string[] | null }[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [mappedProductIds, setMappedProductIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<(Partial<Mapping> & { _make_id?: string }) | null>(null);
  const [filterMake, setFilterMake] = useState("");
  const [filterModel, setFilterModel] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    const [vpm, ma, mo, p, q, o, f] = await Promise.all([
      sb.from("vehicle_product_map").select("*"),
      supabase.from("vehicle_makes").select("*").order("display_order"),
      supabase.from("vehicle_models").select("*").order("display_order"),
      supabase.from("products").select("id, name, images").order("name"),
      sb.from("configurator_questions").select("*"),
      sb.from("configurator_options").select("*").order("display_order"),
      sb.from("vehicle_question_flow").select("*").order("display_order"),
    ]);
    setItems((vpm.data as Mapping[]) ?? []);
    setMakes((ma.data as Make[]) ?? []);
    setModels((mo.data as Model[]) ?? []);
    setProducts((p.data as any) ?? []);
    setQuestions((q.data as Question[]) ?? []);
    setOptions((o.data as Option[]) ?? []);
    setFlows((f.data as Flow[]) ?? []);
    setMappedProductIds(new Set((vpm.data as any[])?.map(m => m.product_id).filter(Boolean)));
  };
  useEffect(() => { load(); }, []);

  const modelMakeMap = useMemo(() => new Map(models.map((m) => [m.id, m.make_id])), [models]);
  const normHay = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const searchTokens = search.trim().split(/\s+/).filter(Boolean).map(normHay);
  const searchYears = searchTokens
    .filter((t) => /^(19|20)\d{2}$/.test(t))
    .map((t) => parseInt(t, 10));
  const searchWords = searchTokens.filter((t) => !/^(19|20)\d{2}$/.test(t));

  const filtered = items.filter((it) => {
    if (filterMake) {
      const mk = it.model_id ? modelMakeMap.get(it.model_id) : null;
      if (mk !== filterMake) return false;
    }
    if (filterModel && it.model_id !== filterModel) return false;
    if (searchTokens.length === 0) return true;
    const model = it.model_id ? models.find((m) => m.id === it.model_id) : null;
    const make = model ? makes.find((m) => m.id === model.make_id) : null;
    const product = it.product_id ? products.find((p) => p.id === it.product_id) : null;
    const answerValues = Object.values(it.answers ?? {})
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .join(" ");
    const hay = normHay(
      `${make?.name ?? ""} ${model?.name ?? ""} ${product?.name ?? ""} ${answerValues}`,
    );
    const wordOk = searchWords.every((w) => hay.includes(w));
    if (!wordOk) return false;
    if (searchYears.length) {
      const yf = it.year_from ?? model?.year_from ?? 0;
      const yt = it.year_to ?? model?.year_to ?? 9999;
      if (!searchYears.some((y) => y >= yf && y <= yt)) return false;
    }
    return true;
  });


  const save = async () => {
    if (!editing?.model_id || !editing?.product_id) return toast.error("Modelo e produto são obrigatórios");
    
    // Validate year range
    if (editing.year_from && editing.year_to && editing.year_from > editing.year_to) {
      return toast.error("O ano inicial não pode ser maior que o ano final");
    }

    const allowedKeys = new Set(
      flows
        .filter((f) => f.model_id === editing.model_id && f.active)
        .map((f) => questions.find((q) => q.id === f.question_id)?.key)
        .filter(Boolean) as string[],
    );
    const cleanAnswers = Object.fromEntries(
      Object.entries(editing.answers ?? {}).filter(([key, value]) => allowedKeys.has(key) && !isWildcardCompatValue(value)),
    );
    const payload = {
      model_id: editing.model_id,
      cabin_type_id: editing.cabin_type_id ?? null,
      product_id: editing.product_id,
      year_from: editing.year_from ?? null,
      year_to: editing.year_to ?? null,
      active: editing.active ?? true,
      answers: cleanAnswers,
    };
    const res = editing.id
      ? await sb.from("vehicle_product_map").update(payload).eq("id", editing.id)
      : await sb.from("vehicle_product_map").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Compatibilidade salva"); setEditing(null); load();
  };
  const toggle = async (m: Mapping) => {
    const { error } = await sb.from("vehicle_product_map").update({ active: !m.active }).eq("id", m.id);
    if (showAdminError(error)) return;
    load();
  };
  const remove = async (m: Mapping) => {
    if (!confirm("Excluir esta compatibilidade?")) return;
    const { error } = await sb.from("vehicle_product_map").delete().eq("id", m.id);
    if (showAdminError(error)) return;
    toast.success("Compatibilidade excluída");
    load();
  };

  const editMakeId = editing?._make_id || (editing?.model_id ? modelMakeMap.get(editing.model_id) : "") || "";
  const modelOptions = editMakeId ? models.filter((m) => m.make_id === editMakeId) : models;

  // Dynamic questions of the selected model, filtered by year overlap with the compatibility range
  const modelFlowQuestions = useMemo(() => {
    if (!editing?.model_id) return [] as { q: Question; flow: any }[];
    const cYf = editing.year_from ?? null;
    const cYt = editing.year_to ?? null;
    const fs = flows
      .filter((f) => f.model_id === editing.model_id && f.active)
      .filter((f) => {
        const fYf = f.year_from ?? null;
        const fYt = f.year_to ?? null;
        // overlap test; null means open-ended on that side
        if (fYt != null && cYf != null && fYt < cYf) return false;
        if (fYf != null && cYt != null && fYf > cYt) return false;
        return true;
      })
      .sort((a, b) => a.display_order - b.display_order);
    return fs
      .map((f) => {
        const q = questions.find((x) => x.id === f.question_id);
        return q ? { q, flow: f } : null;
      })
      .filter(Boolean) as { q: Question; flow: any }[];
  }, [editing?.model_id, editing?.year_from, editing?.year_to, flows, questions]);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{filtered.length} compatibilidade(s)</h3>
        <div className="flex flex-wrap gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar (ex: saveiro 2007, saveiro crossover)…"
            className="w-64"
          />
          <select value={filterMake} onChange={(e) => { setFilterMake(e.target.value); setFilterModel(""); }} className="rounded border bg-background px-3 py-2 text-sm">
            <option value="">Todas as marcas</option>
            {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={filterModel} onChange={(e) => setFilterModel(e.target.value)} className="rounded border bg-background px-3 py-2 text-sm">
            <option value="">Todos os modelos</option>
            {(filterMake ? models.filter((m) => m.make_id === filterMake) : models).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Button onClick={() => setEditing({ active: true, answers: {} })}><Plus className="mr-1 h-4 w-4" /> Nova</Button>
        </div>
      </div>

      {editing && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Marca</Label>
              <select value={editMakeId} onChange={(e) => setEditing({ ...editing, _make_id: e.target.value, model_id: undefined, answers: {} })} className="w-full rounded border bg-background px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Modelo</Label>
              <select value={editing.model_id ?? ""} onChange={(e) => setEditing({ ...editing, model_id: e.target.value, answers: {} })} className="w-full rounded border bg-background px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Produto vinculado</Label>
              <Input
                list="vpm-products-list"
                placeholder="Digite para buscar…"
                value={(() => {
                  const p = products.find((x) => x.id === editing.product_id);
                  return p ? p.name : (editing as any)._product_search ?? "";
                })()}
                onChange={(e) => {
                  const val = e.target.value;
                  const match = products.find((p) => p.name === val);
                  setEditing({ ...editing, product_id: match ? match.id : null, _product_search: val } as any);
                }}
              />
              <datalist id="vpm-products-list">
                {products.map((p) => (
                  <option 
                    key={p.id} 
                    value={p.name} 
                    className={!mappedProductIds.has(p.id) ? "bg-red-50" : ""}
                  >
                    {!mappedProductIds.has(p.id) ? "🆕 " : ""}{p.name}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Ano inicial</Label><Input type="number" value={editing.year_from ?? ""} onChange={(e) => setEditing({ ...editing, year_from: e.target.value ? parseInt(e.target.value) : null })} /></div>
              <div><Label>Ano final</Label><Input type="number" value={editing.year_to ?? ""} onChange={(e) => setEditing({ ...editing, year_to: e.target.value ? parseInt(e.target.value) : null })} /></div>
            </div>
          </div>

          {editing.model_id && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <h4 className="text-sm font-semibold">Respostas que ativam este produto</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Marque uma ou mais respostas para limitar; deixe tudo desmarcado para "qualquer". Só perguntas configuradas no fluxo do modelo aparecem aqui.
              </p>
              {modelFlowQuestions.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Esse modelo ainda não tem perguntas no fluxo. Vá na aba <strong>Fluxos</strong> para configurar.</p>}
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {modelFlowQuestions.map(({ q, flow }) => {
                  const opts = options.filter((o) => o.question_id === q.id && o.active);
                  const raw = editing.answers?.[q.key];
                  const selected = new Set(
                    Array.isArray(raw) ? raw : raw ? [raw as string] : [],
                  );
                  const yrSuffix = flow.year_from || flow.year_to ? ` (${flow.year_from ?? "…"}–${flow.year_to ?? "…"})` : "";
                  const toggleValue = (value: string) => {
                    const next = { ...(editing.answers ?? {}) };
                    const set = new Set(selected);
                    if (set.has(value)) set.delete(value);
                    else set.add(value);
                    if (set.size === 0) delete next[q.key];
                    else next[q.key] = Array.from(set);
                    setEditing({ ...editing, answers: next });
                  };
                  return (
                    <div key={flow.id} className="rounded border border-border bg-background p-2">
                      <Label className="text-xs">{q.label}{yrSuffix}</Label>
                      {selected.size === 0 && (
                        <p className="text-[10px] text-muted-foreground">(qualquer)</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-2">
                        {opts.map((o) => (
                          <label key={o.id} className="flex cursor-pointer items-center gap-1 rounded border border-border bg-muted/40 px-2 py-1 text-xs">
                            <input
                              type="checkbox"
                              checked={selected.has(o.value)}
                              onChange={() => toggleValue(o.value)}
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> Ativa</label>
          <div className="flex gap-2"><Button onClick={save}>Salvar</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button></div>
        </Card>
      )}

      <div className="grid gap-2">
        {filtered.map((it) => {
          const model = models.find((m) => m.id === it.model_id);
          const make = model ? makes.find((m) => m.id === model.make_id) : null;
          const product = products.find((p) => p.id === it.product_id);
          const years = it.year_from || it.year_to ? `${it.year_from ?? "—"}–${it.year_to ?? "—"}` : "todos anos";
          const ansEntries = Object.entries(it.answers ?? {});
          return (
            <Card 
              key={it.id} 
              className={`flex flex-wrap items-center gap-3 p-3 transition-colors ${!it.product_id || !mappedProductIds.has(it.product_id) ? "border-red-200 bg-red-50/50" : ""}`}
            >
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded border border-border bg-muted">
                {(product as any)?.images?.[0] ? (
                  <a href={(product as any).images[0]} target="_blank" rel="noreferrer" title="Abrir imagem em nova aba">
                    <img src={(product as any).images[0]} alt={product?.name ?? ""} className="h-full w-full object-cover transition-transform hover:scale-105" loading="lazy" />
                  </a>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">sem foto</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{make?.name} {model?.name} · {years}</p>
                <p className="text-xs text-muted-foreground truncate">→ {product?.name ?? <span className="text-destructive">produto removido</span>}</p>
                {ansEntries.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ansEntries.map(([k, v]) => (
                      <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{k}: <strong>{Array.isArray(v) ? v.join(" | ") : v}</strong></span>
                    ))}
                  </div>
                )}
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
            Nenhuma compatibilidade cadastrada. Crie uma para que o configurador encontre o produto certo.
          </div>
        )}
      </div>
    </div>
  );
}

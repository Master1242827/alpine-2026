import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Check } from "lucide-react";
import { ProductCard } from "@/components/product-card";

export const Route = createFileRoute("/configurador")({ component: Configurator });

type ResultProduct = {
  slug: string;
  name: string;
  image?: string;
  priceCents: number;
  compareAtCents: number | null;
  featured: boolean;
};


type Make = { id: string; name: string; image_url: string | null };
type Model = { id: string; name: string; image_url: string | null; year_from: number | null; year_to: number | null };
type Question = { id: string; key: string; label: string; help_text: string | null };
type Option = { id: string; question_id: string; value: string; label: string; image_url: string | null };
type FlowItem = { question_id: string; display_order: number; required: boolean; year_from: number | null; year_to: number | null; hidden?: boolean; auto_answer?: string | null };

type Selection = {
  make?: { id: string; name: string };
  model?: Model;
  year?: number;
  answers: Record<string, { value: string; label: string }>;
};

const WILDCARD_VALUES = new Set(["", "*", "any", "all", "qualquer", "(qualquer)", "todos", "todas"]);

function normalizeCompatValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isWildcardCompatValue(value: unknown) {
  const normalized = normalizeCompatValue(value);
  return WILDCARD_VALUES.has(normalized) || normalized.replace(/[()]/g, "").trim() === "qualquer";
}

function Configurator() {
  const navigate = useNavigate();
  const [sel, setSel] = useState<Selection>({ answers: {} });
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [results, setResults] = useState<{ slug: string; name: string }[] | null>(null);

  // Step indexes:
  // 0: make, 1: model, 2: year, 3..N: dynamic questions, last: result
  const baseStep = !sel.make ? 0 : !sel.model ? 1 : !sel.year ? 2 : 3;

  const { data: makes } = useQuery({
    queryKey: ["cfg-makes"],
    queryFn: async () =>
      ((await supabase.from("vehicle_makes").select("id,name,image_url").eq("active", true).order("display_order")).data ?? []) as Make[],
  });
  const { data: models } = useQuery({
    queryKey: ["cfg-models", sel.make?.id],
    enabled: !!sel.make,
    queryFn: async () =>
      ((await supabase.from("vehicle_models").select("id,name,image_url,year_from,year_to").eq("make_id", sel.make!.id).eq("active", true).order("display_order")).data ?? []) as Model[],
  });

  // Load question flow for the selected model+year
  const { data: flow } = useQuery({
    queryKey: ["cfg-flow", sel.model?.id, sel.year],
    enabled: !!sel.model && !!sel.year,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vehicle_question_flow")
        .select("question_id, display_order, required, year_from, year_to, active, hidden, auto_answer")
        .eq("model_id", sel.model!.id)
        .eq("active", true)
        .order("display_order");
      const yr = sel.year!;
      return ((data ?? []) as FlowItem[]).filter((f) => {
        const yf = f.year_from ?? -Infinity;
        const yt = f.year_to ?? Infinity;
        return yr >= yf && yr <= yt;
      });
    },
  });

  const questionIds = useMemo(() => (flow ?? []).map((f) => f.question_id), [flow]);

  const { data: questions } = useQuery({
    queryKey: ["cfg-questions", questionIds.join(",")],
    enabled: questionIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("configurator_questions")
        .select("id,key,label,help_text")
        .in("id", questionIds)
        .eq("active", true);
      return (data ?? []) as Question[];
    },
  });

  const { data: options } = useQuery({
    queryKey: ["cfg-options", questionIds.join(",")],
    enabled: questionIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("configurator_options")
        .select("id,question_id,value,label,image_url,display_order")
        .in("question_id", questionIds)
        .eq("active", true)
        .order("display_order");
      return (data ?? []) as Option[];
    },
  });

  const orderedFlow = useMemo(() => (flow ?? []).slice().sort((a, b) => a.display_order - b.display_order), [flow]);
  // Questions visible to the customer: not hidden AND no auto-answer set
  const visibleFlow = useMemo(
    () => orderedFlow.filter((f) => !f.hidden && !f.auto_answer),
    [orderedFlow]
  );
  const dynamicSteps = visibleFlow.map((f) => questions?.find((q) => q.id === f.question_id)).filter(Boolean) as Question[];
  const flowQuestionKeys = useMemo(() => {
    return new Set(
      orderedFlow
        .map((f) => questions?.find((q) => q.id === f.question_id)?.key)
        .filter(Boolean) as string[],
    );
  }, [orderedFlow, questions]);

  // Auto-prefill answers for hidden / auto-answer questions so matching uses them
  useEffect(() => {
    if (!flow || !questions || !options) return;
    const additions: Record<string, { value: string; label: string }> = {};
    for (const f of orderedFlow) {
      if (!f.auto_answer) continue;
      const q = questions.find((x) => x.id === f.question_id);
      if (!q || sel.answers[q.key]) continue;
      const opt = options.find((o) => o.question_id === f.question_id && o.value === f.auto_answer);
      additions[q.key] = { value: f.auto_answer, label: opt?.label ?? f.auto_answer };
    }
    if (Object.keys(additions).length > 0) {
      setSel((s) => ({ ...s, answers: { ...s.answers, ...additions } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, questions, options]);

  // current step index: 3 + answeredCount, until all answered → final
  const answeredCount = dynamicSteps.filter((q) => sel.answers[q.key]).length;
  const dynamicIndex = answeredCount; // 0-based within dynamic
  const currentDynamic = baseStep === 3 ? dynamicSteps[dynamicIndex] : undefined;
  const isFinal = baseStep === 3 && dynamicSteps.length > 0 && answeredCount >= dynamicSteps.length;
  const isFinalNoQuestions = baseStep === 3 && dynamicSteps.length === 0 && flow !== undefined;

  const years = useMemo(() => {
    if (!sel.model) return [];
    const to = sel.model.year_to ?? new Date().getFullYear();
    const from = sel.model.year_from ?? to - 15;
    const out: number[] = [];
    for (let y = to; y >= from; y--) out.push(y);
    return out;
  }, [sel.model]);

  const resetTo = (level: "make" | "model" | "year" | number) => {
    setNotFound(false);
    setResults(null);
    if (level === "make") setSel({ answers: {} });
    else if (level === "model") setSel({ make: sel.make, answers: {} });
    else if (level === "year") setSel({ make: sel.make, model: sel.model, answers: {} });
    else if (typeof level === "number") {
      // reset answers from that question index onwards
      const keep: Record<string, { value: string; label: string }> = {};
      dynamicSteps.slice(0, level).forEach((q) => { if (sel.answers[q.key]) keep[q.key] = sel.answers[q.key]; });
      setSel({ ...sel, answers: keep });
    }
  };

  const findProducts = async () => {
    setSearching(true);
    setNotFound(false);
    setResults(null);
    const { data } = await supabase
      .from("vehicle_product_map")
      .select("product_id, year_from, year_to, answers, products(slug, name, active)")
      .eq("model_id", sel.model!.id)
      .eq("active", true);

    const yr = sel.year!;
    const userAns = Object.fromEntries(Object.entries(sel.answers).map(([k, v]) => [k, v.value]));
    for (const f of orderedFlow) {
      if (!f.auto_answer) continue;
      const q = questions?.find((x) => x.id === f.question_id);
      if (q && !userAns[q.key]) userAns[q.key] = f.auto_answer;
    }
    console.groupCollapsed("[Configurador] Compatibilidade");
    console.info("Seleção do cliente", { modelo: sel.model?.name, ano: yr, respostas: userAns });
    const matches = ((data ?? []) as any[]).filter((r) => {
      const productName = r.products?.name ?? r.product_id ?? "Produto sem nome";
      const yf = r.year_from ?? 0;
      const yt = r.year_to ?? 9999;
      if (!(yr >= yf && yr <= yt)) {
        console.debug("[Configurador] Produto rejeitado", { produto: productName, motivo: "ano fora da faixa", anoCliente: yr, anoInicial: yf, anoFinal: yt });
        return false;
      }
      if (!r.products?.active) {
        console.debug("[Configurador] Produto rejeitado", { produto: productName, motivo: "produto inativo" });
        return false;
      }
      const required = (r.answers ?? {}) as Record<string, string>;
      for (const k of Object.keys(required)) {
        const req = required[k];
        if (!flowQuestionKeys.has(k)) {
          console.debug("[Configurador] Filtro ignorado", { produto: productName, campo: k, valorAdmin: req, motivo: "campo não existe no fluxo ativo do modelo" });
          continue;
        }
        if (isWildcardCompatValue(req)) {
          console.debug("[Configurador] Filtro ignorado", { produto: productName, campo: k, valorAdmin: req, respostaCliente: userAns[k] });
          continue;
        }
        console.debug("[Configurador] Filtro aplicado", { produto: productName, campo: k, valorAdmin: req, respostaCliente: userAns[k] });
        if (normalizeCompatValue(userAns[k]) !== normalizeCompatValue(req)) {
          console.debug("[Configurador] Produto rejeitado", { produto: productName, motivo: "resposta diferente", campo: k, esperado: req, recebido: userAns[k] });
          return false;
        }
      }
      console.debug("[Configurador] Produto compatível", { produto: productName });
      return true;
    });
    console.info("Resultado da compatibilidade", { encontrados: matches.length, produtos: matches.map((m: any) => m.products?.name ?? m.product_id) });
    console.groupEnd();

    setSearching(false);
    if (matches.length === 1) {
      navigate({ to: "/produto/$slug", params: { slug: matches[0].products.slug } });
    } else if (matches.length > 1) {
      setResults(matches.map((m: any) => ({ slug: m.products.slug, name: m.products.name })));
    } else {
      setNotFound(true);
    }
  };

  // auto-trigger search when reaching final state
  useEffect(() => {
    if ((isFinal || isFinalNoQuestions) && !searching && !notFound && !results) {
      findProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinal, isFinalNoQuestions]);

  // Total visible steps (for the stepper)
  const totalSteps = 3 + (dynamicSteps.length || 0);
  const currentStepIndex = baseStep < 3 ? baseStep : 3 + answeredCount;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-6 md:mb-10">
        <h1 className="text-2xl font-bold md:text-4xl">Configurador de veículo</h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Responda algumas perguntas e encontramos a peça certa para a sua picape.
        </p>
      </div>

      <ProgressBar current={currentStepIndex} total={totalSteps} />
      <Breadcrumb sel={sel} dynamicSteps={dynamicSteps} onJump={resetTo} answeredCount={answeredCount} />

      <div key={`${baseStep}-${answeredCount}`} className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {baseStep === 0 && (
          <Section title="Qual a marca da sua picape?">
            <Grid>
              {makes?.map((m) => (
                <Tile key={m.id} label={m.name} image={m.image_url}
                  onClick={() => setSel({ make: { id: m.id, name: m.name }, answers: {} })} />
              ))}
              {makes && makes.length === 0 && <Empty>Nenhuma marca cadastrada ainda.</Empty>}
            </Grid>
          </Section>
        )}

        {baseStep === 1 && (
          <Section title="Qual o modelo?" onBack={() => resetTo("make")}>
            <Grid>
              {models?.map((m) => (
                <Tile key={m.id} label={m.name}
                  sub={m.year_from && m.year_to ? `${m.year_from}–${m.year_to}` : undefined}
                  image={m.image_url}
                  onClick={() => setSel((s) => ({ ...s, model: m, answers: {} }))} />
              ))}
              {models && models.length === 0 && <Empty>Nenhum modelo cadastrado para esta marca.</Empty>}
            </Grid>
          </Section>
        )}

        {baseStep === 2 && (
          <Section title="Qual o ano do veículo?" onBack={() => resetTo("model")}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {years.map((y) => (
                <button key={y}
                  onClick={() => setSel((s) => ({ ...s, year: y, answers: {} }))}
                  className="rounded-lg border border-border bg-card px-3 py-4 text-center font-semibold transition-all hover:border-primary hover:bg-primary/5 hover:-translate-y-0.5">
                  {y}
                </button>
              ))}
            </div>
          </Section>
        )}

        {baseStep === 3 && currentDynamic && !isFinal && (
          <DynamicQuestionStep
            question={currentDynamic}
            options={(options ?? []).filter((o) => o.question_id === currentDynamic.id)}
            onPick={(opt) => setSel((s) => ({ ...s, answers: { ...s.answers, [currentDynamic.key]: { value: opt.value, label: opt.label } } }))}
            onBack={() => {
              if (dynamicIndex === 0) resetTo("year");
              else resetTo(dynamicIndex - 1);
            }}
          />
        )}

        {baseStep === 3 && flow === undefined && (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Carregando perguntas…
          </div>
        )}

        {(isFinal || isFinalNoQuestions) && (
          <FinalStep
            sel={sel}
            searching={searching}
            notFound={notFound}
            results={results}
            onChangeAnswers={() => resetTo(0)}
            onRetry={findProducts}
            onBrowseAll={() => navigate({ to: "/produtos" })}
            onPickResult={(slug) => navigate({ to: "/produto/$slug", params: { slug } })}
          />
        )}
      </div>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Etapa {Math.min(current + 1, total)} de {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Breadcrumb({ sel, dynamicSteps, onJump, answeredCount }: {
  sel: Selection;
  dynamicSteps: Question[];
  answeredCount: number;
  onJump: (l: "make" | "model" | "year" | number) => void;
}) {
  const chips: { label: string; value: string; onClick: () => void }[] = [];
  if (sel.make) chips.push({ label: "Marca", value: sel.make.name, onClick: () => onJump("make") });
  if (sel.model) chips.push({ label: "Modelo", value: sel.model.name, onClick: () => onJump("model") });
  if (sel.year) chips.push({ label: "Ano", value: String(sel.year), onClick: () => onJump("year") });
  dynamicSteps.slice(0, answeredCount).forEach((q, i) => {
    const ans = sel.answers[q.key];
    if (ans) chips.push({ label: q.label, value: ans.label, onClick: () => onJump(i) });
  });

  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <button key={i} onClick={c.onClick}
          className="group inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary">
          <span className="text-muted-foreground">{c.label}:</span>
          <span className="font-semibold">{c.value}</span>
          <span className="text-muted-foreground group-hover:text-primary">×</span>
        </button>
      ))}
    </div>
  );
}

function DynamicQuestionStep({ question, options, onPick, onBack }: {
  question: Question;
  options: Option[];
  onPick: (o: Option) => void;
  onBack: () => void;
}) {
  return (
    <Section title={question.label} onBack={onBack}>
      {question.help_text && <p className="mb-3 text-sm text-muted-foreground">{question.help_text}</p>}
      <Grid>
        {options.map((o) => (
          <Tile key={o.id} label={o.label} image={o.image_url} onClick={() => onPick(o)} />
        ))}
        {options.length === 0 && <Empty>Nenhuma opção cadastrada para esta pergunta.</Empty>}
      </Grid>
    </Section>
  );
}

function FinalStep({ sel, searching, notFound, results, onChangeAnswers, onRetry, onBrowseAll, onPickResult }: {
  sel: Selection;
  searching: boolean;
  notFound: boolean;
  results: { slug: string; name: string }[] | null;
  onChangeAnswers: () => void;
  onRetry: () => void;
  onBrowseAll: () => void;
  onPickResult: (slug: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center md:p-10">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Check className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-xl font-bold md:text-2xl">Tudo certo!</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {sel.make?.name} {sel.model?.name} {sel.year}
        {Object.values(sel.answers).map((a) => ` · ${a.label}`).join("")}
      </p>

      {searching && <p className="mt-6 text-sm text-muted-foreground">Buscando produto compatível…</p>}

      {!searching && results && results.length > 1 && (
        <div className="mt-6 space-y-2 text-left">
          <p className="text-center text-sm font-semibold">Encontramos {results.length} produtos compatíveis:</p>
          {results.map((r) => (
            <button key={r.slug} onClick={() => onPickResult(r.slug)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary">
              <span className="font-medium">{r.name}</span>
              <span className="text-sm text-primary">Ver →</span>
            </button>
          ))}
        </div>
      )}

      {!searching && notFound && (
        <div className="mt-6 space-y-3">
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Não encontramos um produto cadastrado para essa combinação.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={onChangeAnswers}>Recomeçar</Button>
            <Button onClick={onBrowseAll}>Ver todos os produtos</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, onBack }: { title: string; children: React.ReactNode; onBack?: () => void }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
            <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
        )}
        <h2 className="text-lg font-bold md:text-xl">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function initials(s: string) {
  return s.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function colorFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 60% 45%)`;
}

function Tile({ label, sub, image, onClick }: { label: string; sub?: string; image?: string | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary hover:shadow-lg hover:-translate-y-1"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {image ? (
          <img src={image} alt={label} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-3xl font-black text-white md:text-4xl"
            style={{ background: `linear-gradient(135deg, ${colorFor(label)}, ${colorFor(label + "x")})` }}
            aria-hidden="true"
          >
            {initials(label)}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold leading-tight">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </button>
  );
}

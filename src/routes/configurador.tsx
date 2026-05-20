import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { ChevronLeft, Check } from "lucide-react";

export const Route = createFileRoute("/configurador")({ component: Configurator });

type Selection = {
  make?: { id: string; name: string };
  model?: { id: string; name: string; year_from: number | null; year_to: number | null };
  year?: number;
  cabin?: { id: string; name: string };
};

const STEPS = ["Marca", "Modelo", "Ano", "Cabine"] as const;

function Configurator() {
  const navigate = useNavigate();
  const [sel, setSel] = useState<Selection>({});
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const step = !sel.make ? 0 : !sel.model ? 1 : !sel.year ? 2 : !sel.cabin ? 3 : 4;

  const { data: makes } = useQuery({
    queryKey: ["cfg-makes"],
    queryFn: async () =>
      (await supabase.from("vehicle_makes").select("*").eq("active", true).order("display_order")).data ?? [],
  });
  const { data: models } = useQuery({
    queryKey: ["cfg-models", sel.make?.id],
    enabled: !!sel.make,
    queryFn: async () =>
      (await supabase.from("vehicle_models").select("*").eq("make_id", sel.make!.id).eq("active", true).order("display_order")).data ?? [],
  });
  const { data: cabins } = useQuery({
    queryKey: ["cfg-cabins"],
    queryFn: async () =>
      (await supabase.from("cabin_types").select("*").eq("active", true).order("display_order")).data ?? [],
  });

  const years = useMemo(() => {
    if (!sel.model) return [];
    const to = sel.model.year_to ?? new Date().getFullYear();
    const from = sel.model.year_from ?? to - 10;
    const out: number[] = [];
    for (let y = to; y >= from; y--) out.push(y);
    return out;
  }, [sel.model]);

  const reset = (level: "make" | "model" | "year" | "cabin") => {
    setNotFound(false);
    if (level === "make") setSel({});
    else if (level === "model") setSel((s) => ({ make: s.make }));
    else if (level === "year") setSel((s) => ({ make: s.make, model: s.model }));
    else setSel((s) => ({ make: s.make, model: s.model, year: s.year }));
  };

  const findProduct = async () => {
    setSearching(true);
    setNotFound(false);
    const { data } = await supabase
      .from("vehicle_product_map")
      .select("product_id, year_from, year_to, products(slug, active)")
      .eq("model_id", sel.model!.id)
      .eq("cabin_type_id", sel.cabin!.id)
      .eq("active", true);

    const yr = sel.year!;
    const match = (data ?? []).find((r: any) => {
      const yf = r.year_from ?? 0;
      const yt = r.year_to ?? 9999;
      return yr >= yf && yr <= yt && r.products?.active;
    });

    setSearching(false);
    if (match?.products?.slug) {
      navigate({ to: "/produto/$slug", params: { slug: match.products.slug } });
    } else {
      setNotFound(true);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-6 md:mb-10">
        <h1 className="text-2xl font-bold md:text-4xl">Configurador de veículo</h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Encontre a peça certa para a sua picape em 4 passos rápidos.
        </p>
      </div>

      <Stepper step={step} sel={sel} onJump={reset} />

      <div key={step} className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {step === 0 && (
          <Section title="Qual a marca da sua picape?">
            <Grid>
              {makes?.map((m) => (
                <Tile key={m.id} label={m.name} image={m.image_url}
                  onClick={() => setSel({ make: { id: m.id, name: m.name } })} />
              ))}
              {makes && makes.length === 0 && <Empty>Nenhuma marca cadastrada ainda.</Empty>}
            </Grid>
          </Section>
        )}

        {step === 1 && (
          <Section title="Qual o modelo?" onBack={() => reset("make")}>
            <Grid>
              {models?.map((m: any) => (
                <Tile key={m.id} label={m.name}
                  sub={m.year_range || (m.year_from && m.year_to ? `${m.year_from}–${m.year_to}` : undefined)}
                  image={m.image_url}
                  onClick={() => setSel((s) => ({ ...s, model: { id: m.id, name: m.name, year_from: m.year_from, year_to: m.year_to } }))} />
              ))}
              {models && models.length === 0 && <Empty>Nenhum modelo cadastrado para esta marca.</Empty>}
            </Grid>
          </Section>
        )}

        {step === 2 && (
          <Section title="Qual o ano do veículo?" onBack={() => reset("model")}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {years.map((y) => (
                <button key={y}
                  onClick={() => setSel((s) => ({ ...s, year: y }))}
                  className="rounded-lg border border-border bg-card px-3 py-4 text-center font-semibold transition-all hover:border-primary hover:bg-primary/5 hover:-translate-y-0.5">
                  {y}
                </button>
              ))}
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section title="Qual o tipo de cabine?" onBack={() => reset("year")}>
            <Grid>
              {cabins?.map((c) => (
                <Tile key={c.id} label={c.name} sub={c.description || undefined} image={c.image_url}
                  onClick={() => setSel((s) => ({ ...s, cabin: { id: c.id, name: c.name } }))} />
              ))}
            </Grid>
          </Section>
        )}

        {step === 4 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center md:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-xl font-bold md:text-2xl">Tudo certo!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {sel.make?.name} {sel.model?.name} {sel.year} · {sel.cabin?.name}
            </p>
            {!notFound ? (
              <Button size="lg" className="mt-6" onClick={findProduct} disabled={searching}>
                {searching ? "Buscando…" : "Ver produto compatível"}
              </Button>
            ) : (
              <div className="mt-6 space-y-3">
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  Não encontramos um produto cadastrado para essa combinação.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => reset("cabin")}>Trocar cabine</Button>
                  <Button onClick={() => navigate({ to: "/produtos" })}>Ver todos os produtos</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ step, sel, onJump }: { step: number; sel: Selection; onJump: (l: "make" | "model" | "year" | "cabin") => void }) {
  const labels = [
    sel.make?.name,
    sel.model?.name,
    sel.year ? String(sel.year) : undefined,
    sel.cabin?.name,
  ];
  const keys: ("make" | "model" | "year" | "cabin")[] = ["make", "model", "year", "cabin"];
  return (
    <div className="rounded-xl border border-border bg-card p-3 md:p-4">
      <div className="flex items-center gap-1 md:gap-2">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={label} className="flex flex-1 items-center gap-1 md:gap-2">
              <button
                disabled={!done}
                onClick={() => done && onJump(keys[i])}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors md:px-3 ${
                  active ? "bg-primary/10" : done ? "hover:bg-muted" : "opacity-60"
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold md:h-7 md:w-7 ${
                  done ? "bg-primary text-primary-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold md:text-sm">{label}</span>
                  {labels[i] && <span className="block truncate text-[10px] text-muted-foreground md:text-xs">{labels[i]}</span>}
                </span>
              </button>
              {i < STEPS.length - 1 && <div className="hidden h-px w-4 bg-border sm:block" />}
            </div>
          );
        })}
      </div>
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

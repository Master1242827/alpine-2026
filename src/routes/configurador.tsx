import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { resolveVehicleImage } from "@/lib/product-image";

export const Route = createFileRoute("/configurador")({ component: Configurator });

function Configurator() {
  const navigate = useNavigate();
  const [makeId, setMakeId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [cabinId, setCabinId] = useState<string | null>(null);

  const { data: makes } = useQuery({
    queryKey: ["makes"],
    queryFn: async () => (await supabase.from("vehicle_makes").select("*").order("display_order")).data,
  });
  const { data: models } = useQuery({
    queryKey: ["models", makeId], enabled: !!makeId,
    queryFn: async () => (await supabase.from("vehicle_models").select("*").eq("make_id", makeId!).order("display_order")).data,
  });
  const { data: cabins } = useQuery({
    queryKey: ["cabins"],
    queryFn: async () => (await supabase.from("cabin_types").select("*").order("display_order")).data,
  });

  const step = !makeId ? 1 : !modelId ? 2 : !cabinId ? 3 : 4;

  const findProduct = async () => {
    const { data } = await supabase.from("vehicle_product_map")
      .select("product_id, products(slug)").eq("model_id", modelId!).eq("cabin_type_id", cabinId!).maybeSingle();
    const slug = (data as any)?.products?.slug;
    if (slug) navigate({ to: "/produto/$slug", params: { slug } });
    else navigate({ to: "/produtos" });
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold md:text-3xl">Configurador de veículo</h1>
      <p className="mt-2 text-sm text-muted-foreground">Etapa {Math.min(step, 3)} de 3</p>

      {step === 1 && (
        <Section title="Qual a marca da sua picape?">
          <Grid>
            {makes?.map((m) => (
              <Tile key={m.id} label={m.name} image={m.image_url} kind="make" onClick={() => setMakeId(m.id)} />
            ))}
          </Grid>
        </Section>
      )}
      {step === 2 && (
        <Section title="Qual o modelo?" onBack={() => setMakeId(null)}>
          <Grid>
            {models?.map((m) => (
              <Tile key={m.id} label={m.name} sub={m.year_range || undefined} image={m.image_url} kind="model" onClick={() => setModelId(m.id)} />
            ))}
          </Grid>
        </Section>
      )}
      {step === 3 && (
        <Section title="Qual o tipo de cabine?" onBack={() => setModelId(null)}>
          <Grid>
            {cabins?.map((c) => (
              <Tile key={c.id} label={c.name} sub={c.description || undefined} image={c.image_url} kind="cabin" onClick={() => setCabinId(c.id)} />
            ))}
          </Grid>
        </Section>
      )}
      {step === 4 && (
        <div className="mt-8 rounded-lg border border-border bg-card p-6 text-center">
          <p className="font-semibold">Encontramos a capota ideal para o seu veículo!</p>
          <Button className="mt-4" onClick={findProduct}>Ver produto recomendado</Button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, onBack }: { title: string; children: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        {onBack && <button onClick={onBack} className="text-sm text-primary hover:underline">← Voltar</button>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>;
}

function initials(s: string) {
  return s.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function colorFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 60% 45%)`;
}

function Tile({ label, sub, image, kind, onClick }: { label: string; sub?: string; image?: string | null; kind: "make" | "model" | "cabin"; onClick: () => void }) {
  const src = resolveVehicleImage({ image, name: label, kind });
  return (
    <button
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:shadow-elevated hover:-translate-y-0.5"
    >
      <div className="relative aspect-square bg-muted">
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-cover" loading="lazy" />
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

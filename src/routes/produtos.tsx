import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/produtos")({
  component: ProductsPage,
  validateSearch: searchSchema,
});

function ProductsPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/produtos" });
  const term = (q ?? "").trim();

  const { data } = useQuery({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, short_description, price_cents, compare_at_cents, images, featured")
        .eq("active", true);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!term) return data;
    const t = term.toLowerCase();
    return data.filter(
      (p) =>
        p.name.toLowerCase().includes(t) ||
        (p.short_description ?? "").toLowerCase().includes(t) ||
        p.slug.toLowerCase().includes(t),
    );
  }, [data, term]);

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Todos os produtos</h1>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q ?? ""}
            onChange={(e) =>
              navigate({ search: { q: e.target.value || undefined }, replace: true })
            }
            placeholder="Buscar produtos…"
            className="pl-9 pr-9"
          />
          {q && (
            <button
              type="button"
              onClick={() => navigate({ search: {}, replace: true })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {term && (
        <p className="mb-4 text-sm text-muted-foreground">
          {filtered.length} resultado(s) para “{term}”
        </p>
      )}
      {filtered.length === 0 ? (
        <p className="text-muted-foreground">Nenhum produto encontrado.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              slug={p.slug}
              name={p.name}
              image={p.images?.[0]}
              priceCents={p.price_cents}
              compareAtCents={p.compare_at_cents}
              featured={p.featured}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { searchProducts, type SearchableProduct } from "@/lib/product-search";

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
    queryKey: ["all-products-search"],
    queryFn: async (): Promise<SearchableProduct[]> => {
      const [{ data: products, error }, { data: maps }, { data: models }, { data: makes }, { data: categories }] =
        await Promise.all([
          supabase
            .from("products")
            .select(
              "id, slug, name, short_description, description, price_cents, compare_at_cents, images, featured, category_id",
            )
            .eq("active", true),
          supabase
            .from("vehicle_product_map")
            .select("product_id, model_id, year_from, year_to")
            .eq("active", true),
          supabase.from("vehicle_models").select("id, name, make_id, year_from, year_to"),
          supabase.from("vehicle_makes").select("id, name"),
          supabase.from("categories").select("id, name"),
        ]);
      if (error) throw error;

      const makeById = new Map((makes ?? []).map((m) => [m.id, m.name]));
      const modelById = new Map(
        (models ?? []).map((m) => [m.id, { name: m.name, make_id: m.make_id, year_from: m.year_from, year_to: m.year_to }]),
      );
      const catById = new Map((categories ?? []).map((c) => [c.id, c.name]));
      const mapsByProduct = new Map<string, SearchableProduct["vehicles"]>();
      for (const m of maps ?? []) {
        if (!m.product_id) continue;
        const mdl = m.model_id ? modelById.get(m.model_id) : null;
        const make = mdl?.make_id ? makeById.get(mdl.make_id) ?? null : null;
        const list = mapsByProduct.get(m.product_id) ?? [];
        list!.push({
          make,
          model: mdl?.name ?? null,
          year_from: m.year_from ?? mdl?.year_from ?? null,
          year_to: m.year_to ?? mdl?.year_to ?? null,
        });
        mapsByProduct.set(m.product_id, list);
      }

      return (products ?? []).map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        short_description: p.short_description,
        price_cents: p.price_cents,
        compare_at_cents: p.compare_at_cents,
        images: p.images ?? [],
        featured: p.featured,
        category_name: p.category_id ? catById.get(p.category_id) ?? null : null,
        vehicles: mapsByProduct.get(p.id) ?? [],
      }));
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!term) return data;
    return searchProducts(data, term);
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
            placeholder="Ex: saveiro 2004, capota g1 quadrada…"
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
              categoryName={p.category_name ?? undefined}
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

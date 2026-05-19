import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/product-card";

export const Route = createFileRoute("/produtos")({ component: ProductsPage });

function ProductsPage() {
  const { data } = useQuery({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, price_cents, compare_at_cents, images, featured")
        .eq("active", true);
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">Todos os produtos</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {data?.map((p) => (
          <ProductCard key={p.id} slug={p.slug} name={p.name} image={p.images?.[0]}
            priceCents={p.price_cents} compareAtCents={p.compare_at_cents} featured={p.featured} />
        ))}
      </div>
    </div>
  );
}

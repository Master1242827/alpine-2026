import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { formatCents, formatPix } from "@/lib/format";
import { toast } from "sonner";
import { ShippingCalculator } from "@/components/shipping-calculator";
import { resolveProductImage } from "@/lib/product-image";

export const Route = createFileRoute("/produto/$slug")({ component: ProductDetail });

function ProductDetail() {
  const { slug } = Route.useParams();
  const { add } = useCart();
  const navigate = useNavigate();
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("slug", slug).eq("active", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="container mx-auto px-4 py-10">Carregando…</div>;
  if (!product) return <div className="container mx-auto px-4 py-10">Produto não encontrado.</div>;

  return (
    <div className="container mx-auto grid gap-8 px-4 py-10 md:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-lg bg-muted">
        <img
          src={resolveProductImage({ images: product.images, name: product.name })}
          alt={product.name}
          className="h-full w-full object-cover"
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fallback) {
              img.dataset.fallback = "1";
              img.src = "https://loremflickr.com/800/800/car,auto,parts";
            }
          }}
        />
      </div>
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{product.name}</h1>
        {product.short_description && <p className="mt-2 text-muted-foreground">{product.short_description}</p>}
        <div className="mt-6">
          {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
            <p className="text-sm text-muted-foreground line-through">{formatCents(product.compare_at_cents)}</p>
          )}
          <p className="text-3xl font-bold text-primary">10x de {formatCents(product.price_cents / 10)}</p>
          <p className="text-sm text-muted-foreground">ou <strong>{formatPix(product.price_cents)}</strong> no PIX (5% off)</p>
        </div>

        <div className="mt-6">
          <ShippingCalculator
            items={[{
              productId: product.id,
              priceCents: product.price_cents,
              quantity: 1,
              weightKg: Number(product.weight_kg),
              lengthCm: product.length_cm,
              widthCm: product.width_cm,
              heightCm: product.height_cm,
            }]}
          />
        </div>

        <Button size="lg" className="mt-6 w-full md:w-auto" onClick={() => {
          add({
            productId: product.id, slug: product.slug, name: product.name,
            image: product.images?.[0], priceCents: product.price_cents, quantity: 1,
            weightKg: Number(product.weight_kg), lengthCm: product.length_cm,
            widthCm: product.width_cm, heightCm: product.height_cm,
          });
          toast.success("Adicionado ao carrinho");
          navigate({ to: "/carrinho" });
        }}>
          Adicionar ao carrinho
        </Button>
        {product.description && (
          <div className="mt-8 whitespace-pre-line text-sm leading-relaxed">{product.description}</div>
        )}
        <Link to="/carrinho" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">Ver carrinho →</Link>
      </div>
    </div>
  );
}

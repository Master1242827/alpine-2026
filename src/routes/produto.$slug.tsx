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
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {(() => {
          const src = resolveProductImage({ images: product.images, name: product.name }, 800);
          return src ? (
            <img src={src} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm">
              <span className="text-3xl">🖼️</span>
              <span className="uppercase tracking-wide">Sem imagem</span>
            </div>
          );
        })()}
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
            selectable={false}
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
          <p className="mt-2 text-xs text-muted-foreground">
            Valor estimado para este produto. O frete final é calculado no carrinho com todos os itens.
          </p>
        </div>


        {product.stock <= 0 ? (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-destructive">Produto esgotado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Este item está temporariamente sem estoque. Entre em contato pelo WhatsApp para previsão de reposição.
            </p>
          </div>
        ) : (
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
        )}
        {(product.video_url || product.video_file_url) && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-bold">Vídeo do produto</h2>
            <ProductVideo url={product.video_url} file={product.video_file_url} />
          </div>
        )}
        {product.description && (
          <div className="mt-8 whitespace-pre-line text-sm leading-relaxed">{product.description}</div>
        )}

        <Link to="/carrinho" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">Ver carrinho →</Link>
      </div>
    </div>
  );
}

function ProductVideo({ url, file }: { url?: string | null; file?: string | null }) {
  const embed = url ? toEmbedUrl(url) : null;
  if (embed) {
    return (
      <div className="aspect-video overflow-hidden rounded-lg border">
        <iframe src={embed} className="h-full w-full" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Vídeo do produto" />
      </div>
    );
  }
  if (file) {
    return <video src={file} controls preload="metadata" className="aspect-video w-full rounded-lg border bg-black" />;
  }
  return null;
}

function toEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.hostname.includes("youtu.be")) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}


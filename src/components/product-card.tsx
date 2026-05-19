import { Link } from "@tanstack/react-router";
import { formatCents, formatPix } from "@/lib/format";
import { Star } from "lucide-react";
import { resolveProductImage } from "@/lib/product-image";

interface ProductCardProps {
  slug: string;
  name: string;
  image?: string;
  categoryName?: string;
  priceCents: number;
  compareAtCents?: number | null;
  featured?: boolean;
}

export function ProductCard({ slug, name, image, categoryName, priceCents, compareAtCents, featured }: ProductCardProps) {
  const src = resolveProductImage({ images: image ? [image] : [], name, categoryName });
  return (
    <Link
      to="/produto/$slug"
      params={{ slug }}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
    >
      <div className="relative aspect-square bg-muted">
        {featured && (
          <span className="absolute left-2 top-2 z-10 rounded bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
            Mais vendido
          </span>
        )}
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{name}</h3>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
          ))}
          <span>(128)</span>
        </div>
        <div className="mt-auto pt-2">
          {compareAtCents && compareAtCents > priceCents && (
            <p className="text-xs text-muted-foreground line-through">
              {formatCents(compareAtCents)}
            </p>
          )}
          <p className="text-base font-bold text-primary">10x de {formatCents(priceCents / 10)}</p>
          <p className="text-xs text-muted-foreground">
            ou <span className="font-semibold">{formatPix(priceCents)}</span> no PIX
          </p>
        </div>
      </div>
    </Link>
  );
}

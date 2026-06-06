import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { Shield, Gem, Wrench, ArrowRight, Truck, CreditCard, Lock, BadgePercent } from "lucide-react";
import heroImg from "@/assets/hero-truck.jpg";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { data: products } = useQuery({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, price_cents, compare_at_cents, images, featured")
        .eq("active", true)
        .eq("featured", true)
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const { data: heroUrl } = useQuery({
    queryKey: ["hero-image-url"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_hero_image_url");
      return (data as string | null) || null;
    },
    staleTime: 60_000,
  });

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-dark text-dark-foreground">
        <div className="absolute inset-0">
          <img src={heroUrl || heroImg} alt="" width={1600} height={1024} className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-r from-dark via-dark/80 to-transparent" />
        </div>

        <div className="container relative mx-auto px-4 py-20 md:py-28">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Capotas Marítimas <span className="text-dark-foreground">para sua picape</span>
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight md:text-6xl">
            Mais estilo.<br />Mais performance.
          </h1>
          <p className="mt-4 max-w-lg text-base text-dark-foreground/80">
            Os melhores acessórios para elevar sua picape a outro nível. Garantia, instalação rápida e frete para todo o Brasil.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
              <Link to="/configurador">
                Encontrar minha capota <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-dark-foreground/30 bg-transparent text-dark-foreground hover:bg-dark-foreground/10 hover:text-dark-foreground">
              <Link to="/produtos">Ver produtos</Link>
            </Button>
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { icon: Shield, title: "Proteção total", desc: "Contra sol, chuva e poeira" },
              { icon: Gem, title: "Acabamento", desc: "Premium e sofisticado" },
              { icon: Wrench, title: "Instalação", desc: "Rápida e sem furos" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <Icon className="h-6 w-6 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold">{title}</p>
                  <p className="text-xs text-dark-foreground/70">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-border bg-background">
        <div className="container mx-auto grid grid-cols-2 gap-4 px-4 py-6 md:grid-cols-4">
          {[
            { icon: Truck, title: "FRETE GRÁTIS", desc: "Para todo o Brasil" },
            { icon: CreditCard, title: "ATÉ 10X SEM JUROS", desc: "No cartão de crédito" },
            { icon: Lock, title: "COMPRA SEGURA", desc: "Ambiente 100% seguro" },
            { icon: BadgePercent, title: "5% OFF NO PIX", desc: "Desconto exclusivo" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center gap-3">
              <Icon className="h-6 w-6 text-primary" />
              <div>
                <p className="text-xs font-bold">{title}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Configurator CTA */}
      <section className="bg-muted py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold md:text-3xl">
            Encontre a capota <span className="text-primary">certa para sua picape</span>
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Responda algumas perguntas rápidas com imagens e veja exatamente o produto compatível com seu veículo.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/configurador">Iniciar configurador</Link>
          </Button>
        </div>
      </section>

      {/* Featured products */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-xl font-bold md:text-2xl">
              Produtos <span className="text-primary">mais vendidos</span>
            </h2>
            <Link to="/produtos" className="text-sm font-semibold text-primary hover:underline">
              Ver todos →
            </Link>
          </div>
          {products && products.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
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
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Carregando produtos…</p>
          )}
        </div>
      </section>
    </div>
  );
}

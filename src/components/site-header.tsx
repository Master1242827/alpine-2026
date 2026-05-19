import { Link } from "@tanstack/react-router";
import { ShoppingCart, Menu, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function SiteHeader() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="bg-dark text-dark-foreground text-xs">
        <div className="container mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-2">
          <span>FRETE GRÁTIS para todo o Brasil*</span>
          <span className="opacity-30">|</span>
          <span>Parcele em até 10x sem juros</span>
          <span className="opacity-30">|</span>
          <span>5% OFF no PIX</span>
        </div>
      </div>
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-baseline gap-1">
          <span className="text-xl font-black tracking-tight">AUTO</span>
          <span className="text-xl font-black tracking-tight text-primary">PREMIUM</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link to="/" className="hover:text-primary transition-colors">Início</Link>
          <Link to="/produtos" className="hover:text-primary transition-colors">Produtos</Link>
          <Link to="/configurador" className="hover:text-primary transition-colors">
            Configurador
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="icon" aria-label="Minha conta">
              <User className="h-5 w-5" />
            </Button>
          </Link>
          <Link to="/carrinho">
            <Button variant="ghost" size="icon" aria-label="Carrinho" className="relative">
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="container mx-auto flex flex-col px-4 py-3 text-sm font-medium">
            <Link to="/" className="py-2" onClick={() => setOpen(false)}>Início</Link>
            <Link to="/produtos" className="py-2" onClick={() => setOpen(false)}>Produtos</Link>
            <Link to="/configurador" className="py-2" onClick={() => setOpen(false)}>
              Configurador
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

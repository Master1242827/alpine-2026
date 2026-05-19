import { Link } from "@tanstack/react-router";
import { ShoppingCart, Menu, User, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import alpineLogo from "@/assets/alpine-logo.png";

export function SiteHeader() {
  const { count } = useCart();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const accountHref = user ? "/conta" : "/login";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="bg-dark text-dark-foreground text-xs">
        <div className="container mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-2">
          <span>FRETE GRÁTIS para todo o Brasil*</span>
          <span className="opacity-30 hidden sm:inline">|</span>
          <span className="hidden sm:inline">Parcele em até 10x sem juros</span>
          <span className="opacity-30 hidden sm:inline">|</span>
          <span>5% OFF no PIX</span>
        </div>
      </div>
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4">
        <Link to="/" className="flex items-center" aria-label="Alpine">
          <img src={alpineLogo} alt="Alpine" className="h-10 w-auto" />
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link to="/" className="hover:text-primary transition-colors">Início</Link>
          <Link to="/produtos" className="hover:text-primary transition-colors">Produtos</Link>
          <Link to="/configurador" className="hover:text-primary transition-colors">Configurador</Link>
        </nav>
        <div className="flex items-center gap-1">
          <Link to={accountHref} className="hidden sm:inline-flex">
            <Button variant="ghost" size="sm" aria-label="Minha conta">
              <User className="h-5 w-5 sm:mr-1" />
              <span className="hidden md:inline text-sm">{user ? "Minha conta" : "Entrar"}</span>
            </Button>
          </Link>
          <Link to={accountHref} className="sm:hidden">
            <Button variant="ghost" size="icon" aria-label="Minha conta"><User className="h-5 w-5" /></Button>
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
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="container mx-auto flex flex-col px-4 py-2 text-sm font-medium">
            <Link to="/" className="py-3 border-b border-border/50" onClick={() => setOpen(false)}>Início</Link>
            <Link to="/produtos" className="py-3 border-b border-border/50" onClick={() => setOpen(false)}>Produtos</Link>
            <Link to="/configurador" className="py-3 border-b border-border/50" onClick={() => setOpen(false)}>Configurador</Link>
            <Link to={accountHref} className="py-3" onClick={() => setOpen(false)}>
              {user ? "Minha conta" : "Entrar / Criar conta"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

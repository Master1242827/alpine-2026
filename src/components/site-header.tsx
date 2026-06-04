import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingCart, Menu, User, X, Search, Shield } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin } from "@/lib/admin.functions";
const alpineLogo = "/alpine-logo.png";

export function SiteHeader() {
  const { count } = useCart();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const check = useServerFn(checkIsAdmin);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setIsAdmin(false); return; }
    check()
      .then((r) => { if (!cancelled) setIsAdmin(!!r.isAdmin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [user, check]);

  const accountHref = user ? "/conta" : "/login";

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate({ to: "/produtos", search: term ? { q: term } : {} });
    setSearchOpen(false);
    setOpen(false);
  };


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
          <img src={alpineLogo} alt="Alpine" className="h-12 w-auto md:h-14" />
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link to="/" className="hover:text-primary transition-colors">Início</Link>
          <Link to="/produtos" className="hover:text-primary transition-colors">Produtos</Link>
          <Link to="/configurador" className="hover:text-primary transition-colors">Configurador</Link>
        </nav>
        <form onSubmit={submitSearch} className="hidden lg:flex relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produtos…"
            className="pl-9"
          />
        </form>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <Link to="/admin" className="hidden sm:inline-flex">
              <Button variant="outline" size="sm" aria-label="Painel administrativo">
                <Shield className="h-4 w-4 sm:mr-1" />
                <span className="hidden md:inline text-sm">Painel</span>
              </Button>
            </Link>
          )}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSearchOpen((s) => !s)} aria-label="Buscar">
            <Search className="h-5 w-5" />
          </Button>
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
      {searchOpen && (
        <div className="lg:hidden border-t border-border bg-background">
          <form onSubmit={submitSearch} className="container mx-auto flex items-center gap-2 px-4 py-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produtos…" className="pl-9" />
            </div>
            <Button type="submit" size="sm">Buscar</Button>
          </form>
        </div>
      )}
      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="container mx-auto flex flex-col px-4 py-2 text-sm font-medium">
            <Link to="/" className="py-3 border-b border-border/50" onClick={() => setOpen(false)}>Início</Link>
            <Link to="/produtos" className="py-3 border-b border-border/50" onClick={() => setOpen(false)}>Produtos</Link>
            <Link to="/configurador" className="py-3 border-b border-border/50" onClick={() => setOpen(false)}>Configurador</Link>
            <Link to={accountHref} className="py-3 border-b border-border/50" onClick={() => setOpen(false)}>
              {user ? "Minha conta" : "Entrar / Criar conta"}
            </Link>
            {isAdmin && (
              <Link to="/admin" className="py-3 font-semibold text-primary" onClick={() => setOpen(false)}>
                Painel administrativo
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

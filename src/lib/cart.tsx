import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  image?: string;
  priceCents: number;
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  vehicleConfig?: Record<string, string>;
}

export interface SelectedShipping {
  id: string;
  name: string;
  priceCents: number;
  deliveryDays: number | null;
  companyPicture: string | null;
  cep: string;
}

interface CartContextValue {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  subtotalCents: number;
  count: number;
  shipping: SelectedShipping | null;
  setShipping: (s: SelectedShipping | null) => void;
  cep: string;
  setCep: (c: string) => void;
  shippingCostCents: number;
  totalCents: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const KEY = "autopremium_cart_v1";
const SHIP_KEY = "autopremium_shipping_v1";
const CEP_KEY = "autopremium_cep_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [shipping, setShippingState] = useState<SelectedShipping | null>(null);
  const [cep, setCepState] = useState<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
      const s = localStorage.getItem(SHIP_KEY);
      if (s) setShippingState(JSON.parse(s));
      const c = localStorage.getItem(CEP_KEY);
      if (c) setCepState(c);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  }, [items]);

  const setShipping = (s: SelectedShipping | null) => {
    setShippingState(s);
    try {
      if (s) localStorage.setItem(SHIP_KEY, JSON.stringify(s));
      else localStorage.removeItem(SHIP_KEY);
    } catch {}
  };

  const setCep = (c: string) => {
    setCepState(c);
    try { localStorage.setItem(CEP_KEY, c); } catch {}
  };

  const add = (item: CartItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === item.productId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + item.quantity };
        return copy;
      }
      return [...prev, item];
    });
  };
  const remove = (productId: string) =>
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  const setQty = (productId: string, qty: number) =>
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i)),
    );
  const clear = () => {
    setItems([]);
    setShipping(null);
  };

  const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const shippingCostCents = shipping?.priceCents ?? 0;
  const totalCents = subtotalCents + shippingCostCents;

  return (
    <CartContext.Provider value={{
      items, add, remove, setQty, clear, subtotalCents, count,
      shipping, setShipping, cep, setCep, shippingCostCents, totalCents,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

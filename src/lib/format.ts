export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatCents = (cents: number) => BRL.format((cents || 0) / 100);
export const formatPix = (cents: number) => BRL.format(((cents || 0) * 0.95) / 100);

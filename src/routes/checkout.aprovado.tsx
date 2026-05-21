import { createFileRoute, useSearch } from "@tanstack/react-router";
import { CheckoutStatusCard } from "@/components/checkout-status-card";

export const Route = createFileRoute("/checkout/aprovado")({
  validateSearch: (s: Record<string, unknown>) => ({ order: String(s.order ?? "") }),
  component: () => {
    const { order } = useSearch({ from: "/checkout/aprovado" });
    return <CheckoutStatusCard orderId={order} variant="approved" />;
  },
});

import { createFileRoute, useSearch } from "@tanstack/react-router";
import { CheckoutStatusCard } from "@/components/checkout-status-card";

export const Route = createFileRoute("/checkout/recusado")({
  validateSearch: (s: Record<string, unknown>) => ({ order: String(s.order ?? "") }),
  component: () => {
    const { order } = useSearch({ from: "/checkout/recusado" });
    return <CheckoutStatusCard orderId={order} variant="rejected" />;
  },
});

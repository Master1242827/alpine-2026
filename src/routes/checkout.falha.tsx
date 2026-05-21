import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";

export const Route = createFileRoute("/checkout/falha")({
  validateSearch: (s: Record<string, unknown>) => ({ order: String(s.order ?? "") }),
  component: () => {
    const { order } = useSearch({ from: "/checkout/falha" });
    return <Navigate to="/checkout/recusado" search={{ order }} replace />;
  },
});

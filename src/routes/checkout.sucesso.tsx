import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";

export const Route = createFileRoute("/checkout/sucesso")({
  validateSearch: (s: Record<string, unknown>) => ({ order: String(s.order ?? "") }),
  component: () => {
    const { order } = useSearch({ from: "/checkout/sucesso" });
    return <Navigate to="/checkout/aprovado" search={{ order }} replace />;
  },
});

import { useEffect } from "react";
import { useStore } from "../store";

// Transient toast for stubbed actions ("… скоро"). Auto-dismisses.
export function Toast() {
  const toast = useStore((s) => s.toast);
  const clearToast = useStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 1600);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;
  return <div className="toast">{toast}</div>;
}

import { useEffect, useState } from "react";
import environmentContract from "../../shared/firebaseEnvironment.cjs";

export default function LocalEnvironmentNotice() {
  const [blocked, setBlocked] = useState(false);
  const local = process.env.NEXT_PUBLIC_FIREBASE_MODE === "emulators";
  useEffect(() => {
    if (!local) return;
    const allow = (value) => {
      try { environmentContract.assertLocalUrl(new URL(value, window.location.href).href); return true; }
      catch { setBlocked(true); return false; }
    };
    const click = (event) => {
      const link = event.target.closest?.("a[href]");
      if (link && !allow(link.href)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const originalOpen = window.open;
    const localOpen = (url, ...args) => !url || allow(url) ? originalOpen.call(window, url, ...args) : null;
    window.open = localOpen;
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("click", click, true);
      if (window.open === localOpen) window.open = originalOpen;
    };
  }, [local]);
  if (!local) return null;
  return <div role="status" style={{ position: "fixed", bottom: 8, left: 8, zIndex: 2147483647, padding: "8px 12px", background: "#172554", color: "white", borderRadius: 8, fontSize: 12 }}>
    {blocked ? "Enlace externo bloqueado en el entorno local." : "Entorno demo local · Pagos, IA y publicación deshabilitados"}
  </div>;
}

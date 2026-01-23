import { useEffect, useState, useCallback } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

/**
 * Lee y cachea claims del usuario logueado.
 * - esAdmin: token.claims.admin === true
 * - claims: objeto completo por si necesitás otros roles en el futuro
 * - loadingClaims: útil para no “parpadear” botones
 */
export function useAuthClaims() {
  const [user, setUser] = useState(null);
  const [claims, setClaims] = useState(null);
  const [loadingClaims, setLoadingClaims] = useState(true);

  const refreshClaims = useCallback(async () => {
    const auth = getAuth();
    const u = auth.currentUser;
    if (!u) {
      setClaims(null);
      setLoadingClaims(false);
      return null;
    }

    setLoadingClaims(true);
    try {
      // ✅ true fuerza refresh del token (cuando recién seteaste claims)
      const token = await u.getIdTokenResult(true);
      setClaims(token.claims || {});
      return token.claims || {};
    } catch (e) {
      console.error("❌ Error leyendo claims:", e);
      setClaims(null);
      return null;
    } finally {
      setLoadingClaims(false);
    }
  }, []);

  useEffect(() => {
    const auth = getAuth();

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (!u) {
        setClaims(null);
        setLoadingClaims(false);
        return;
      }

      // Cuando hay user, leemos claims una vez
      await refreshClaims();
    });

    return () => unsub();
  }, [refreshClaims]);

  const esAdmin = claims?.admin === true;

  return {
    user,
    claims,
    esAdmin,
    loadingClaims,
    refreshClaims, // por si querés forzarlo desde UI/acciones
  };
}

import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

export function useAdminAccess(user) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loadingAdminAccess, setLoadingAdminAccess] = useState(false);
  const [adminAccessError, setAdminAccessError] = useState(null);

  const reset = useCallback(() => {
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setAdminAccessError(null);
    setLoadingAdminAccess(false);
  }, []);

  const refreshAdminAccess = useCallback(async () => {
    if (!user) {
      reset();
      return null;
    }

    setLoadingAdminAccess(true);
    setAdminAccessError(null);

    try {
      const callable = httpsCallable(functions, "getAdminAccess");
      const result = await callable({});
      const data = result?.data || {};

      const nextIsSuperAdmin = data?.isSuperAdmin === true;
      const nextIsAdmin =
        data?.isAdmin === true || data?.adminClaim === true || nextIsSuperAdmin;

      setIsSuperAdmin(nextIsSuperAdmin);
      setIsAdmin(nextIsAdmin);

      return data;
    } catch (error) {
      console.error("❌ Error consultando acceso admin:", error);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminAccessError(
        getErrorMessage(error, "No se pudieron validar los permisos")
      );
      return null;
    } finally {
      setLoadingAdminAccess(false);
    }
  }, [reset, user]);

  useEffect(() => {
    if (!user) {
      reset();
      return;
    }

    refreshAdminAccess();
  }, [refreshAdminAccess, reset, user]);

  return {
    loadingAdminAccess,
    isAdmin,
    isSuperAdmin,
    canManageSite: isAdmin || isSuperAdmin,
    adminAccessError,
    refreshAdminAccess,
  };
}


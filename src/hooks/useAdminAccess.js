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
  const userUid = user?.uid || null;
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loadingAdminAccessRaw, setLoadingAdminAccessRaw] = useState(false);
  const [resolvedUid, setResolvedUid] = useState(null);
  const [adminAccessError, setAdminAccessError] = useState(null);

  const reset = useCallback(() => {
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setAdminAccessError(null);
    setLoadingAdminAccessRaw(false);
    setResolvedUid(null);
  }, []);

  const refreshAdminAccess = useCallback(async () => {
    if (!userUid) {
      reset();
      return null;
    }

    setLoadingAdminAccessRaw(true);
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
      setResolvedUid(userUid);
      setLoadingAdminAccessRaw(false);
    }
  }, [reset, userUid]);

  useEffect(() => {
    if (!userUid) {
      reset();
      return;
    }

    setResolvedUid((prev) => (prev === userUid ? prev : null));
    refreshAdminAccess();
  }, [refreshAdminAccess, reset, userUid]);

  const hasResolvedCurrentUser = !userUid || resolvedUid === userUid;
  const loadingAdminAccess = loadingAdminAccessRaw || !hasResolvedCurrentUser;

  return {
    loadingAdminAccess,
    isAdmin,
    isSuperAdmin,
    canManageSite: isAdmin || isSuperAdmin,
    adminAccessError,
    refreshAdminAccess,
  };
}

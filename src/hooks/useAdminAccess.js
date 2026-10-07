import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { createDashboardAuthRecovery } from "@/lib/auth/dashboardAuthRecovery";
import { isTransientDashboardReadError } from "@/domain/dashboard/readRecovery";

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

export function useAdminAccess(user, startupRecoveryGeneration = 0) {
  const userUid = user?.uid || null;
  const currentUidRef = useRef(userUid);
  currentUidRef.current = userUid;
  const requestRef = useRef(0);
  const recoveryRef = useRef(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loadingAdminAccessRaw, setLoadingAdminAccessRaw] = useState(false);
  const [resolvedUid, setResolvedUid] = useState(null);
  const [resolvedGeneration, setResolvedGeneration] = useState(null);
  const [adminAccessError, setAdminAccessError] = useState(null);
  const [adminRecoveryState, setAdminRecoveryState] = useState("idle");

  const reset = useCallback(() => {
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setAdminAccessError(null);
    setLoadingAdminAccessRaw(false);
    setResolvedUid(null);
    setAdminRecoveryState("idle");
  }, []);

  const refreshAdminAccess = useCallback(async () => {
    recoveryRef.current?.cancel();
    const request = ++requestRef.current;
    const isCurrent = () =>
      request === requestRef.current && currentUidRef.current === userUid;
    if (!userUid) {
      reset();
      return null;
    }

    setLoadingAdminAccessRaw(true);
    setAdminAccessError(null);
    setResolvedUid(null);
    setAdminRecoveryState("idle");

    try {
      const callable = httpsCallable(functions, "getAdminAccess");
      const recovery = createDashboardAuthRecovery({
        task: () => callable({}),
        shouldRetry: isTransientDashboardReadError,
        isCurrent,
        onStateChange: setAdminRecoveryState,
      });
      recoveryRef.current = recovery;
      const outcome = await recovery.promise;
      if (!isCurrent() || outcome.status !== "success") return null;
      const result = outcome.value;
      const data = result?.data || {};

      const nextIsSuperAdmin = data?.isSuperAdmin === true;
      const nextIsAdmin =
        data?.isAdmin === true || data?.adminClaim === true || nextIsSuperAdmin;

      setIsSuperAdmin(nextIsSuperAdmin);
      setIsAdmin(nextIsAdmin);

      return data;
    } catch (error) {
      if (!isCurrent()) return null;
      console.error("❌ Error consultando acceso admin:", error);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminAccessError(
        getErrorMessage(error, "No se pudieron validar los permisos")
      );
      return null;
    } finally {
      if (isCurrent()) {
        setResolvedUid(userUid);
        setResolvedGeneration(startupRecoveryGeneration);
        setLoadingAdminAccessRaw(false);
        setAdminRecoveryState("idle");
      }
    }
  }, [reset, userUid, startupRecoveryGeneration]);

  useEffect(() => {
    void refreshAdminAccess();
    return () => {
      requestRef.current += 1;
      recoveryRef.current?.cancel();
    };
  }, [refreshAdminAccess, startupRecoveryGeneration]);

  const hasResolvedCurrentUser = !userUid || (
    resolvedUid === userUid && resolvedGeneration === startupRecoveryGeneration
  );
  const loadingAdminAccess = loadingAdminAccessRaw || !hasResolvedCurrentUser;
  const currentIsAdmin = Boolean(userUid && hasResolvedCurrentUser && isAdmin);
  const currentIsSuperAdmin = Boolean(userUid && hasResolvedCurrentUser && isSuperAdmin);

  return {
    loadingAdminAccess,
    isAdmin: currentIsAdmin,
    isSuperAdmin: currentIsSuperAdmin,
    canManageSite: currentIsAdmin || currentIsSuperAdmin,
    adminAccessError,
    adminRecoveryState,
    refreshAdminAccess,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";
import {
  getErrorMessage,
  splitDisplayName,
} from "@/domain/dashboard/helpers";
import { handleDashboardStartupError } from "@/domain/dashboard/startupRecovery";
import { createDashboardAuthRecovery } from "@/lib/auth/dashboardAuthRecovery";
import { pushEditorBreadcrumb } from "@/lib/monitoring/editorIssueReporter";

const PROFILE_INITIAL_VALUES = Object.freeze({
  nombre: "",
  apellido: "",
  fechaNacimiento: "",
});

export function useDashboardAuthGate({ router }) {
  const [usuario, setUsuario] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authRecoveryState, setAuthRecoveryState] = useState("idle");
  const [startupRecoveryGeneration, setStartupRecoveryGeneration] = useState(0);
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [profileInitialValues, setProfileInitialValues] = useState(
    PROFILE_INITIAL_VALUES
  );

  const getMyProfileStatusCallable = useMemo(
    () => httpsCallable(cloudFunctions, "getMyProfileStatus"),
    []
  );
  const upsertUserProfileCallable = useMemo(
    () => httpsCallable(cloudFunctions, "upsertUserProfile"),
    []
  );

  const handleCompleteProfile = useCallback(
    async (payload) => {
      try {
        await upsertUserProfileCallable({
          ...payload,
          source: "profile-completion",
        });

        const auth = getAuth();
        if (auth.currentUser) {
          await auth.currentUser.reload();
        }

        setShowProfileCompletion(false);
      } catch (error) {
        throw new Error(
          getErrorMessage(error, "No se pudo actualizar tu perfil.")
        );
      }
    },
    [upsertUserProfileCallable]
  );

  useEffect(() => {
    const auth = getAuth();
    let mounted = true;
    let signOutRedirectPending = false;
    let authCheckVersion = 0;
    let activeRecovery = null;

    const handleAuthFailure = (error, context = {}) =>
      handleDashboardStartupError({
        error,
        operation: context.operation || "dashboard-auth-gate",
        module: "useDashboardAuthGate",
        phase: context.phase || "auth-state",
        authState: {
          hasUser: Boolean(context.user || auth.currentUser),
          checkingAuth: true,
          loadingAdminAccess: false,
        },
      });

    const signOutSafely = async (reason, user = null) => {
      // The caller owns the notice URL; the null-user event must not replace it.
      signOutRedirectPending = true;
      try {
        await signOut(auth);
        return true;
      } catch (error) {
        handleAuthFailure(error, {
          operation: "auth-sign-out",
          phase: reason,
          user,
        });
        return false;
      }
    };

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (!user && signOutRedirectPending) return;
        activeRecovery?.cancel();
        activeRecovery = null;
        const version = ++authCheckVersion;
        const isCurrentCheck = () => mounted && version === authCheckVersion;
        signOutRedirectPending = false;
        void (async () => {
          try {
            if (!isCurrentCheck()) return;
            setCheckingAuth(true);
            setAuthRecoveryState("idle");
            setShowProfileCompletion(false);

            if (!user) {
              setUsuario(null);
              void router.replace("/").catch((error) => {
                handleAuthFailure(error, {
                  operation: "auth-router-replace",
                  phase: "missing-session",
                });
                if (isCurrentCheck()) setCheckingAuth(false);
              });
              return;
            }

            const providerIds = (user.providerData || [])
              .map((provider) => provider?.providerId)
              .filter(Boolean);
            const hasPasswordProvider = providerIds.includes("password");
            const hasGoogleProvider = providerIds.includes("google.com");
            const hasOnlyPasswordProvider = hasPasswordProvider && !hasGoogleProvider;

            if (hasOnlyPasswordProvider && user.emailVerified !== true) {
              await signOutSafely("email-not-verified", user);
              if (!isCurrentCheck()) return;
              setShowProfileCompletion(false);
              setUsuario(null);
              setCheckingAuth(false);
              void router.replace("/?authNotice=email-not-verified").catch((error) => {
                handleAuthFailure(error, {
                  operation: "auth-router-replace",
                  phase: "email-not-verified",
                  user,
                });
              });
              return;
            }

            // Start authenticated reads in parallel. checkingAuth still keeps the
            // dashboard hidden and its entry actions blocked until profile validation.
            setUsuario(user);
            let validationPhase = "auth-token";
            try {
              let forceRefreshRequested = false;
              let forceRefreshPending = false;
              const recovery = createDashboardAuthRecovery({
                isCurrent: isCurrentCheck,
                onStateChange: setAuthRecoveryState,
                onRetry: ({ error, attempt, delayMs }) => {
                  pushEditorBreadcrumb("dashboard-auth-recovery", {
                    phase: validationPhase,
                    code: error?.code || "",
                    attempt,
                    delayMs,
                  });
                },
                task: async () => {
                  validationPhase = forceRefreshPending ? "auth-token-refresh" : "auth-token";
                  // A restored user may already have a usable token. Only a rejected
                  // callable credential warrants forcing a new one.
                  if (forceRefreshPending) await user.getIdToken(true);
                  else await user.getIdToken();
                  if (!isCurrentCheck()) return null;
                  forceRefreshPending = false;
                  validationPhase = "profile-validation";
                  try {
                    return await getMyProfileStatusCallable({});
                  } catch (error) {
                    if (!isCurrentCheck()) return null;
                    if (error?.code !== "functions/unauthenticated" || forceRefreshRequested) {
                      throw error;
                    }
                    forceRefreshRequested = true;
                    forceRefreshPending = true;
                    validationPhase = "auth-token-refresh";
                    pushEditorBreadcrumb("dashboard-auth-token-refresh", {
                      code: error.code,
                    });
                    await user.getIdToken(true);
                    if (!isCurrentCheck()) return null;
                    forceRefreshPending = false;
                    validationPhase = "profile-validation";
                    return getMyProfileStatusCallable({});
                  }
                },
              });
              activeRecovery = recovery;
              const outcome = await recovery.promise;
              if (activeRecovery === recovery) activeRecovery = null;

              if (!isCurrentCheck() || outcome.status !== "success") return;
              const statusData = outcome.value?.data || {};
              if (outcome.recovered || forceRefreshRequested) {
                setStartupRecoveryGeneration((current) => current + 1);
                pushEditorBreadcrumb("dashboard-auth-recovered", {});
              }

              if (statusData.profileComplete !== true) {
                const fallbackNames = splitDisplayName(
                  statusData?.profile?.nombreCompleto || user.displayName || ""
                );

                setProfileInitialValues({
                  nombre: statusData?.profile?.nombre || fallbackNames.nombre || "",
                  apellido:
                    statusData?.profile?.apellido || fallbackNames.apellido || "",
                  fechaNacimiento: statusData?.profile?.fechaNacimiento || "",
                  nombreCompleto:
                    statusData?.profile?.nombreCompleto || user.displayName || "",
                });
                setShowProfileCompletion(true);
              } else {
                setShowProfileCompletion(false);
              }

              setUsuario(user);
            } catch (error) {
              if (!isCurrentCheck()) return;
              console.error("Error validando estado de perfil:", error);
              const handled = handleAuthFailure(error, {
                operation: "profile-status-check",
                phase: validationPhase,
                user,
              });
              if (handled.isRecoverableStorageError) {
                if (!isCurrentCheck()) return;
                setShowProfileCompletion(false);
                setUsuario(user || auth.currentUser || null);
                setCheckingAuth(false);
                return;
              }

              await signOutSafely("profile-check-failed", user);
              if (!isCurrentCheck()) return;
              setShowProfileCompletion(false);
              setUsuario(null);
              void router.replace("/?authNotice=profile-check-failed").catch((error) => {
                handleAuthFailure(error, {
                  operation: "auth-router-replace",
                  phase: "profile-check-failed",
                  user,
                });
              });
            } finally {
              if (isCurrentCheck()) {
                setAuthRecoveryState("idle");
                setCheckingAuth(false);
              }
            }
          } catch (error) {
            if (!isCurrentCheck()) return;
            handleAuthFailure(error, {
              operation: "auth-state-callback",
              phase: "auth-callback",
              user,
            });
            if (!mounted) return;
            setUsuario(null);
            setShowProfileCompletion(false);
            setCheckingAuth(false);
          }
        })();
      },
      (error) => {
        activeRecovery?.cancel();
        activeRecovery = null;
        authCheckVersion += 1;
        handleAuthFailure(error, {
          operation: "auth-state-listener",
          phase: "auth-listener-error",
          user: auth.currentUser,
        });
        if (!mounted) return;
        setAuthRecoveryState("idle");
        setUsuario(null);
        setShowProfileCompletion(false);
        setCheckingAuth(false);
      }
    );

    return () => {
      mounted = false;
      activeRecovery?.cancel();
      unsubscribe();
    };
  }, [getMyProfileStatusCallable, router]);

  return {
    usuario,
    checkingAuth,
    authRecoveryState,
    startupRecoveryGeneration,
    showProfileCompletion,
    profileInitialValues,
    handleCompleteProfile,
  };
}

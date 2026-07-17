import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";
import {
  getErrorMessage,
  splitDisplayName,
} from "@/domain/dashboard/helpers";
import { handleDashboardStartupError } from "@/domain/dashboard/startupRecovery";

const PROFILE_INITIAL_VALUES = Object.freeze({
  nombre: "",
  apellido: "",
  fechaNacimiento: "",
});

export function useDashboardAuthGate({ router }) {
  const [usuario, setUsuario] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
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
        void (async () => {
          try {
        if (!mounted) return;
        setCheckingAuth(true);

        if (!user) {
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          setCheckingAuth(false);
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
          if (!mounted) return;
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

        try {
          await user.getIdToken();

          let result;
          try {
            result = await getMyProfileStatusCallable({});
          } catch {
            await user.getIdToken(true);
            await new Promise((resolve) => setTimeout(resolve, 700));
            result = await getMyProfileStatusCallable({});
          }

          const statusData = result?.data || {};

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
          console.error("Error validando estado de perfil:", error);
          const handled = handleAuthFailure(error, {
            operation: "profile-status-check",
            phase: "profile-validation",
            user,
          });
          if (handled.isRecoverableStorageError) {
            if (!mounted) return;
            setShowProfileCompletion(false);
            setUsuario(user || auth.currentUser || null);
            setCheckingAuth(false);
            return;
          }

          await signOutSafely("profile-check-failed", user);
          if (!mounted) return;
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
          if (mounted) {
            setCheckingAuth(false);
          }
        }
          } catch (error) {
            handleAuthFailure(error, {
              operation: "auth-state-callback",
              phase: "auth-callback",
              user,
            });
            if (!mounted) return;
            setCheckingAuth(false);
          }
        })();
      },
      (error) => {
        handleAuthFailure(error, {
          operation: "auth-state-listener",
          phase: "auth-listener-error",
          user: auth.currentUser,
        });
        if (!mounted) return;
        setCheckingAuth(false);
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [getMyProfileStatusCallable, router]);

  return {
    usuario,
    checkingAuth,
    showProfileCompletion,
    profileInitialValues,
    handleCompleteProfile,
  };
}

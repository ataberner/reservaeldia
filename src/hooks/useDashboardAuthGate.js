import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";
import {
  getErrorMessage,
  splitDisplayName,
} from "@/domain/dashboard/helpers";

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

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void (async () => {
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
          await signOut(auth);
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          setCheckingAuth(false);
          router.replace("/?authNotice=email-not-verified");
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
          await signOut(auth);
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          router.replace("/?authNotice=profile-check-failed");
        } finally {
          if (mounted) {
            setCheckingAuth(false);
          }
        }
      })();
    });

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

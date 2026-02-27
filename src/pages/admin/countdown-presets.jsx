import { useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/router";
import CountdownPresetBuilderPage from "@/components/admin/countdown/CountdownPresetBuilderPage";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export default function AdminCountdownPresetsPage() {
  const router = useRouter();
  const redirectingRef = useRef(false);
  const [authUser, setAuthUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const { loadingAdminAccess, isSuperAdmin } = useAdminAccess(authUser);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user || null);
      setCheckingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (checkingAuth || loadingAdminAccess) return;
    if (authUser && isSuperAdmin) return;
    if (redirectingRef.current) return;

    redirectingRef.current = true;
    alert("Solo superadmins pueden acceder a presets de countdown.");
    router.replace("/dashboard");
  }, [authUser, checkingAuth, isSuperAdmin, loadingAdminAccess, router]);

  if (checkingAuth || loadingAdminAccess) {
    return <p className="p-6 text-sm text-slate-600">Validando permisos...</p>;
  }

  if (!authUser || !isSuperAdmin) {
    return <p className="p-6 text-sm text-slate-600">Redirigiendo...</p>;
  }

  return (
    <main className="min-h-dvh overflow-y-auto bg-slate-50 px-2 sm:px-3 lg:h-dvh lg:overflow-hidden lg:px-4">
      <CountdownPresetBuilderPage />
    </main>
  );
}

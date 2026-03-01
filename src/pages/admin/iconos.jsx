import { useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/router";
import IconCatalogAdminPage from "@/components/admin/iconCatalog/IconCatalogAdminPage";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export default function AdminIconos() {
  const router = useRouter();
  const redirectingRef = useRef(false);
  const [authUser, setAuthUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const {
    loadingAdminAccess,
    canManageSite,
    isSuperAdmin,
  } = useAdminAccess(authUser);

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
    if (authUser && canManageSite) return;
    if (redirectingRef.current) return;

    redirectingRef.current = true;
    alert("No tenes permisos para acceder a esta seccion.");
    router.replace("/dashboard");
  }, [authUser, canManageSite, checkingAuth, loadingAdminAccess, router]);

  if (checkingAuth || loadingAdminAccess) {
    return <p className="p-6 text-sm text-slate-600">Validando permisos...</p>;
  }

  if (!authUser || !canManageSite) {
    return <p className="p-6 text-sm text-slate-600">Redirigiendo...</p>;
  }

  return (
    <main className="h-dvh overflow-hidden bg-slate-50">
      <IconCatalogAdminPage isSuperAdmin={isSuperAdmin} />
    </main>
  );
}

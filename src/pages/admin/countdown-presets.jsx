import { useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import CountdownPresetBuilderPage from "@/components/admin/countdown/CountdownPresetBuilderPage";
import { useAdminAccess } from "@/hooks/useAdminAccess";

const CountdownPhase0BaselineHarness = dynamic(
  () =>
    import(
      "@/components/admin/countdown/CountdownPhase0BaselineHarness"
    ),
  { ssr: false }
);

const CountdownFrameUploadRegressionHarness = dynamic(
  () =>
    import(
      "@/components/admin/countdown/CountdownFrameUploadRegressionHarness"
    ),
  { ssr: false }
);

export default function AdminCountdownPresetsPage() {
  const router = useRouter();
  const baselineRequested =
    process.env.NODE_ENV === "development" &&
    (
      router.query.countdownBaseline === "1" ||
      router.asPath.includes("countdownBaseline=1")
    );
  const frameUploadHarnessRequested =
    process.env.NODE_ENV === "development" &&
    (
      router.query.countdownFrameUploadHarness === "1" ||
      router.asPath.includes("countdownFrameUploadHarness=1")
    );

  if (frameUploadHarnessRequested) {
    return <CountdownFrameUploadRegressionHarness />;
  }

  if (baselineRequested) {
    return (
      <CountdownPhase0BaselineHarness
        stateId={router.query.state || "days"}
      />
    );
  }

  return <ProtectedAdminCountdownPresetsPage />;
}

function ProtectedAdminCountdownPresetsPage() {
  const router = useRouter();
  const redirectingRef = useRef(false);
  const [authUser, setAuthUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const { loadingAdminAccess, canManageSite } = useAdminAccess(authUser);

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
    router.replace("/dashboard");
  }, [authUser, canManageSite, checkingAuth, loadingAdminAccess, router]);

  if (checkingAuth || loadingAdminAccess) {
    return <p className="p-6 text-sm text-slate-600">Validando permisos...</p>;
  }

  if (!authUser || !canManageSite) {
    return (
      <p role="alert" className="p-6 text-sm text-rose-700">
        No tenés permisos para administrar presets de countdown. Redirigiendo…
      </p>
    );
  }

  return (
    <main className="min-h-dvh overflow-y-auto bg-slate-50 px-2 sm:px-3 lg:px-4">
      <CountdownPresetBuilderPage />
    </main>
  );
}

import { useEffect, useState } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import { useAdminAccess } from "@/hooks/useAdminAccess";

const ProfessionalsLanding = dynamic(
  () => import("@/components/professionals/ProfessionalsLanding"),
  { ssr: false, loading: () => <AccessStatus pending /> }
);

function AccessStatus({ pending = false, failed = false, signedIn = false }) {
  return (
    <main className="min-h-dvh bg-white px-6 py-24 text-center text-slate-700">
      <div className="mx-auto max-w-md">
        <p role="status" aria-live="polite" className="text-lg">
          {pending
            ? "Validando acceso…"
            : failed
              ? "No pudimos validar tu acceso."
              : "Esta vista está reservada para superadmin."}
        </p>
        {!pending && (
          <a
            href={failed ? "/profesionales/" : signedIn ? "/dashboard/" : "/?auth=login"}
            className="mt-4 inline-block rounded-full border border-purple-200 px-6 py-3 text-purple-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {failed ? "Volver a intentar" : signedIn ? "Volver a mis invitaciones" : "Iniciar sesión"}
          </a>
        )}
      </div>
    </main>
  );
}

export default function ProfessionalsPage() {
  const [session, setSession] = useState({ user: null, checking: true, failed: false });
  const { loadingAdminAccess, isSuperAdmin, adminAccessError } = useAdminAccess(session.user);

  useEffect(() => {
    return onAuthStateChanged(
      auth,
      (user) => setSession({ user: user || null, checking: false, failed: false }),
      () => setSession({ user: null, checking: false, failed: true })
    );
  }, []);

  const pending = session.checking || loadingAdminAccess;
  const failed = session.failed || Boolean(adminAccessError);
  // Reuse the existing backend-resolved role. Generic admin access is insufficient.
  // Static Hosting still serves the shell/assets; this gate controls the client view.
  const canView = !pending && !failed && Boolean(session.user) && isSuperAdmin === true;

  return (
    <>
      <Head>
        <title>Profesionales | Reserva el Día</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="googlebot" content="noindex, nofollow, noarchive" />
      </Head>
      {canView ? (
        <ProfessionalsLanding user={session.user} />
      ) : (
        <AccessStatus pending={pending} failed={failed} signedIn={Boolean(session.user)} />
      )}
    </>
  );
}

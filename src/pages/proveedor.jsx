import { useEffect, useState } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import { useAdminAccess } from "@/hooks/useAdminAccess";

const ProviderDirectoryDetail = dynamic(() => import("@/components/marketplace/ProviderDirectoryDetail"), { ssr: false, loading: () => <AccessStatus pending /> });

function AccessStatus({ pending = false, failed = false, signedIn = false }) {
  const actionClass = "mt-4 inline-block rounded-full border border-purple-200 px-6 py-3 text-purple-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";
  return <main className="min-h-dvh bg-white px-6 py-24 text-center text-slate-700"><div className="mx-auto max-w-md"><p role="status" className="text-lg">{pending ? "Validando acceso…" : failed ? "No pudimos validar tu acceso." : "Esta vista está reservada para superadmin."}</p>{!pending && (failed ? <button type="button" onClick={() => window.location.reload()} className={actionClass}>Volver a intentar</button> : <a href={signedIn ? "/dashboard/" : "/?auth=login"} className={actionClass}>{signedIn ? "Volver a mis invitaciones" : "Iniciar sesión"}</a>)}</div></main>;
}

export default function ProviderPage() {
  const [session, setSession] = useState({ user: null, checking: true, failed: false });
  const { loadingAdminAccess, isSuperAdmin, adminAccessError } = useAdminAccess(session.user);
  useEffect(() => onAuthStateChanged(auth, (user) => setSession({ user: user || null, checking: false, failed: false }), () => setSession({ user: null, checking: false, failed: true })), []);
  const pending = session.checking || loadingAdminAccess;
  const failed = session.failed || Boolean(adminAccessError);
  const canView = !pending && !failed && Boolean(session.user) && isSuperAdmin === true;
  return <><Head><title>Ficha del negocio | Reserva el Día</title><meta name="robots" content="noindex, nofollow, noarchive" /><meta name="googlebot" content="noindex, nofollow, noarchive" /></Head>{canView ? <ProviderDirectoryDetail user={session.user} key={session.user.uid} /> : <AccessStatus pending={pending} failed={failed} signedIn={Boolean(session.user)} />}</>;
}

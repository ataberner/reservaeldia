import { useEffect, useState } from "react";
import Head from "next/head";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import ProviderDirectoryAdmin from "@/components/admin/providers/ProviderDirectoryAdmin";
import styles from "@/components/admin/providers/ProviderAdmin.module.css";

export default function AdminProvidersPage() {
  const [session, setSession] = useState({ user: null, checking: true, failed: false });
  const { loadingAdminAccess, isSuperAdmin, adminAccessError, refreshAdminAccess } = useAdminAccess(session.user);
  useEffect(() => onAuthStateChanged(auth,
    (user) => setSession({ user, checking: false, failed: false }),
    () => setSession({ user: null, checking: false, failed: true })
  ), []);
  const checking = session.checking || loadingAdminAccess;
  const failed = session.failed || Boolean(adminAccessError);
  const authorized = !checking && !failed && session.user && isSuperAdmin === true;
  return (
    <main className={styles.root}>
      <Head><title>Administrar fichas | Reserva el Día</title><meta name="robots" content="noindex, nofollow, noarchive" /></Head>
      {authorized ? <ProviderDirectoryAdmin key={session.user.uid} /> : <div className={styles.shell}><div className={styles.panel}>
        <h1>Administración de fichas</h1>
        <p className={styles.notice} role="status">{checking ? "Validando permisos…" : failed ? "No pudimos comprobar tus permisos." : "Esta sección está reservada para superadmin."}</p>
        {!checking && <div className={styles.actions}>{failed && <button type="button" className={styles.button} onClick={() => void refreshAdminAccess()}>Volver a intentar</button>}<a className={styles.button} href={session.user ? "/dashboard/" : "/?auth=login"}>{session.user ? "Volver a mis invitaciones" : "Iniciar sesión"}</a></div>}
      </div></div>}
    </main>
  );
}

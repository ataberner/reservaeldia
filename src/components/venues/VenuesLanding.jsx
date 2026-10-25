import MarketplaceHeader from "../marketplace/MarketplaceHeader";
import { directoryCanFilter } from "@/domain/providers/directoryModel";
import ProviderDirectoryResults, { ProviderDirectoryFilters } from "../marketplace/ProviderDirectoryResults";
import useProviderDirectory from "../marketplace/useProviderDirectory";
import directoryStyles from "../marketplace/ProviderDirectory.module.css";
import styles from "./VenuesLanding.module.css";

export default function VenuesLanding({ user }) {
  const state = useProviderDirectory({ kind: "lugar", userUid: user.uid });
  return <>
    <MarketplaceHeader user={user} current="venues" />
    <div className={styles.root}>
      <main className={styles.main}>
        <section className={styles.searchSection} aria-labelledby="venues-title">
          <div className={styles.searchContent}>
            <h1 className={styles.pageTitle} id="venues-title">Encontrá el lugar para <span className={styles.gradientText}>tu casamiento</span></h1>
            <p className={styles.pageDescription}>Salones, quintas y estancias para celebrar a tu manera.</p>
            <p className={directoryStyles.notice}>Directorio privado · Sólo fichas aprobadas disponibles.</p>
            {directoryCanFilter(state) && <ProviderDirectoryFilters state={state} kind="lugar" />}
          </div>
        </section>
        <div className={styles.liveResults}>
          <h2 className={styles.resultsTitle}>Lugares para tu casamiento</h2>
          <ProviderDirectoryResults state={state} kind="lugar" />
        </div>
      </main>
    </div>
  </>;
}

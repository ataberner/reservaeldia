import { ArrowRight, Camera, Flower2, Heart, Music2, Sparkles, Utensils, BriefcaseBusiness } from "lucide-react";
import { directoryCanFilter } from "@/domain/providers/directoryModel";
import headerStyles from "../appHeader/AppHeader.module.css";
import MarketplaceHeader from "../marketplace/MarketplaceHeader";
import ProviderDirectoryResults, { ProviderDirectoryFilters } from "../marketplace/ProviderDirectoryResults";
import useProviderDirectory from "../marketplace/useProviderDirectory";
import directoryStyles from "../marketplace/ProviderDirectory.module.css";
import styles from "./ProfessionalsLanding.module.css";

const CATEGORY_ICONS = { "foto-video": Camera, catering: Utensils, ambientacion: Flower2, "musica-shows": Music2, "wedding-planners": Sparkles };

export default function ProfessionalsLanding({ user }) {
  const state = useProviderDirectory({ kind: "profesional", userUid: user.uid });
  function category(id) {
    void state.search({ ...state.filters, categoryId: id });
    document.getElementById("providers-title")?.scrollIntoView({ block: "start" });
  }
  return <>
    <MarketplaceHeader user={user} current="professionals" />
    <div className={styles.root}>
      <main>
        <section className={styles.hero} aria-labelledby="professionals-title">
          <div className={styles.heroCollage} aria-hidden="true">
            <div className={`${styles.heroPanel} ${styles.heroPanelOne} ${styles.photoFlowers}`} />
            <div className={`${styles.heroPanel} ${styles.heroPanelTwo} ${styles.photoVenue}`} />
            <div className={`${styles.heroPanel} ${styles.heroPanelThree} ${styles.photoCouple}`} />
            <div className={`${styles.heroPanel} ${styles.heroPanelFour} ${styles.photoFlowers}`} />
            <div className={`${styles.heroPanel} ${styles.heroPanelFive} ${styles.photoVenue}`} />
          </div>
          <div className={styles.heroCard}>
            <span className={styles.heroEyebrow}><Heart size={14} aria-hidden="true" />TODO EMPIEZA CON UN SÍ</span>
            <h1 className={styles.heroTitle} id="professionals-title">Tu casamiento,<br /><span className={styles.gradientText}>un equipo soñado.</span></h1>
            <p className={styles.heroDescription}>Encontrá los profesionales que van con vos.</p>
            <p className={directoryStyles.notice}>Directorio privado · Sólo fichas aprobadas disponibles.</p>
            {directoryCanFilter(state) && <ProviderDirectoryFilters state={state} kind="profesional" />}
          </div>
        </section>
        {directoryCanFilter(state) && <section className={styles.categories} aria-labelledby="categories-title">
          <div className={styles.contentWidth}>
            <h2 className={styles.sectionTitle} id="categories-title">Buscá por categoría</h2>
            <div className={styles.categoryGrid}>{state.catalog.categories.filter((entry) => entry.tipo === "profesional").map((entry) => {
              const Icon = CATEGORY_ICONS[entry.id] || BriefcaseBusiness;
              return <button key={entry.id} type="button" className={styles.categoryItem} disabled={state.busy} aria-pressed={state.filters.categoryId === entry.id} onClick={() => category(entry.id)}><span className={styles.categoryIcon}><Icon size={28} strokeWidth={1.4} aria-hidden="true" /></span><span>{entry.nombre}</span></button>;
            })}</div>
          </div>
        </section>}
        <section className={styles.providers} aria-labelledby="providers-title">
          <div className={styles.contentWidth}>
            <div className={styles.sectionHeadingRow}><div><h2 className={styles.sectionTitle} id="providers-title">Encontrá tu equipo ideal</h2><p className={styles.sectionDescription}>Propuestas aprobadas para hacer tu casamiento único.</p></div></div>
            <ProviderDirectoryResults state={state} kind="profesional" />
          </div>
        </section>
        <section className={styles.invitations} aria-labelledby="invitations-title">
          <div className={`${styles.contentWidth} ${styles.invitationInner}`}>
            <div className={styles.invitationCopy}><span className={styles.eyebrow}>INVITACIONES DIGITALES</span><h2 className={styles.invitationTitle} id="invitations-title">Y ahora,<br /><span className={styles.gradientText}>invitá a vivirlo.</span></h2><p className={styles.invitationDescription}>Creá la invitación de tu casamiento y compartí toda la información en un solo link.</p><a className={styles.invitationButton} href="/dashboard/">Mis invitaciones <ArrowRight size={17} aria-hidden="true" /></a></div>
            <div className={styles.invitationPreview}><img className={styles.invitationImage} src="/assets/img/Hero.webp" width="2048" height="629" alt="Diseños de invitaciones digitales de Reserva el Día" loading="lazy" /><span className={styles.invitationCaption}><Heart size={14} aria-hidden="true" />Tan única como ustedes.</span></div>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.contentWidth} ${styles.footerInner}`}><div className={styles.footerBrand}><a href="/" className={`${headerStyles.logoLink} ${styles.brandLink}`} aria-label="Reserva el Día, inicio"><span className={headerStyles.brandText}>Reserva el Día</span></a><p className={styles.footerTagline}>Todo para empezar su nueva historia.</p></div><nav className={styles.footerNavigation} aria-label="Navegación al pie"><a href="/" className={styles.footerLink}>Invitaciones digitales</a><a href="/dashboard/" className={styles.footerLink}>Mis invitaciones</a></nav></div>
        <div className={`${styles.contentWidth} ${styles.footerBottom}`}><span>Hecho con amor para tu gran día.</span><span>Directorio privado de profesionales</span></div>
      </footer>
    </div>
  </>;
}

import {
  ArrowRight,
  Camera,
  ChevronDown,
  Flower2,
  Heart,
  MapPin,
  Music2,
  Search,
  Sparkles,
  Utensils,
} from "lucide-react";
import headerStyles from "../appHeader/AppHeader.module.css";
import MarketplaceHeader from "../marketplace/MarketplaceHeader";
import styles from "./ProfessionalsLanding.module.css";

const PREVIEW_ACTION_TITLE = "Disponible en una próxima etapa";

const CATEGORIES = [
  { label: "Fotografía y video", icon: Camera },
  { label: "Catering", icon: Utensils },
  { label: "Ambientación", icon: Flower2 },
  { label: "Música y shows", icon: Music2 },
  { label: "Wedding planners", icon: Sparkles },
];

// Presentation examples only: this page does not consume the provider catalog.
const EXAMPLE_PROVIDERS = [
  {
    name: "Luz de Abril",
    category: "Fotografía y video",
    location: "Buenos Aires",
    photoClass: "photoCouple",
    photoDescription: "Una pareja de recién casados en un jardín",
  },
  {
    name: "Olivia Deco",
    category: "Ambientación",
    location: "La Plata, Buenos Aires",
    photoClass: "photoFlowers",
    photoDescription: "Mesa de casamiento con flores y velas",
  },
];

function BrandLink() {
  return (
    <a
      href="/"
      className={`${headerStyles.logoLink} ${styles.brandLink}`}
      aria-label="Reserva el Día, inicio"
    >
      <span className={headerStyles.brandText}>Reserva el Día</span>
    </a>
  );
}

function SearchPreview() {
  return (
    <div className={styles.searchPreview} aria-label="Vista previa del buscador">
      <button
        className={styles.searchField}
        type="button"
        disabled
        title={PREVIEW_ACTION_TITLE}
      >
        <Search size={19} aria-hidden="true" />
        <span>
          <span className={styles.fieldLabel}>¿Qué estás buscando?</span>
          <span className={styles.fieldValue}>Elegí una categoría</span>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <button
        className={styles.searchField}
        type="button"
        disabled
        title={PREVIEW_ACTION_TITLE}
      >
        <MapPin size={19} aria-hidden="true" />
        <span>
          <span className={styles.fieldLabel}>¿Dónde te casás?</span>
          <span className={styles.fieldValue}>Ciudad o provincia</span>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <button
        className={styles.searchButton}
        type="button"
        disabled
        title={PREVIEW_ACTION_TITLE}
      >
        <Search size={17} aria-hidden="true" />
        Buscar
      </button>
    </div>
  );
}

function ProviderCard({ provider }) {
  return (
    <article className={styles.providerCard}>
      <div className={styles.providerMedia}>
        <div
          className={`${styles.providerPhoto} ${styles[provider.photoClass]}`}
          role="img"
          aria-label={provider.photoDescription}
        />
        <button
          className={styles.favoriteButton}
          type="button"
          disabled
          title={PREVIEW_ACTION_TITLE}
          aria-label={`Guardar ${provider.name}`}
        >
          <Heart size={19} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.providerDetails}>
        <span className={styles.providerCategory}>{provider.category}</span>
        <h3 className={styles.providerName}>{provider.name}</h3>
        <p className={styles.providerLocation}>
          <MapPin size={14} aria-hidden="true" />
          {provider.location}
        </p>
      </div>
    </article>
  );
}

export default function ProfessionalsLanding({ user }) {
  return (
    <>
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
              <span className={styles.heroEyebrow}>
                <Heart size={14} aria-hidden="true" /> TODO EMPIEZA CON UN SÍ
              </span>
              <h1 className={styles.heroTitle} id="professionals-title">
                Tu casamiento,<br />
                <span className={styles.gradientText}>un equipo soñado.</span>
              </h1>
              <p className={styles.heroDescription}>
                Encontrá los profesionales que van con vos.
              </p>
              <SearchPreview />
            </div>
          </section>

          <section className={styles.categories} aria-labelledby="categories-title">
            <div className={styles.contentWidth}>
              <div className={styles.sectionHeadingRow}>
                <h2 className={styles.sectionTitle} id="categories-title">Todo lo que necesitás para tu gran día</h2>
                <button className={styles.allProviders} type="button" disabled title={PREVIEW_ACTION_TITLE}>
                  Ver categorías <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.categoryGrid}>
                {CATEGORIES.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    className={styles.categoryItem}
                    type="button"
                    disabled
                    title={PREVIEW_ACTION_TITLE}
                  >
                    <span className={styles.categoryIcon}><Icon size={28} strokeWidth={1.4} aria-hidden="true" /></span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.providers} aria-labelledby="providers-title">
            <div className={styles.contentWidth}>
              <div className={styles.sectionHeadingRow}>
                <div>
                  <h2 className={styles.sectionTitle} id="providers-title">Encontrá tu equipo ideal</h2>
                  <p className={styles.sectionDescription}>Descubrí propuestas para hacer tu casamiento único.</p>
                </div>
                <button className={styles.allProviders} type="button" disabled title={PREVIEW_ACTION_TITLE}>
                  Ver todos los profesionales <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.providerGrid}>
                {EXAMPLE_PROVIDERS.map((provider) => <ProviderCard key={provider.name} provider={provider} />)}
              </div>
            </div>
          </section>

          <section className={styles.invitations} aria-labelledby="invitations-title">
            <div className={`${styles.contentWidth} ${styles.invitationInner}`}>
              <div className={styles.invitationCopy}>
                <span className={styles.eyebrow}>INVITACIONES DIGITALES</span>
                <h2 className={styles.invitationTitle} id="invitations-title">
                  Y ahora,<br /><span className={styles.gradientText}>invitá a vivirlo.</span>
                </h2>
                <p className={styles.invitationDescription}>
                  Creá la invitación de tu casamiento y compartí toda la información en un solo link.
                </p>
                <a className={styles.invitationButton} href="/">
                  Crear mi invitación <ArrowRight size={17} aria-hidden="true" />
                </a>
              </div>
              <div className={styles.invitationPreview}>
                <img
                  className={styles.invitationImage}
                  src="/assets/img/Hero.webp"
                  width="2048"
                  height="629"
                  alt="Diseños de invitaciones digitales de Reserva el Día"
                  loading="lazy"
                />
                <span className={styles.invitationCaption}><Heart size={14} aria-hidden="true" /> Tan única como ustedes.</span>
              </div>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <div className={`${styles.contentWidth} ${styles.footerInner}`}>
            <div className={styles.footerBrand}>
              <BrandLink />
              <p className={styles.footerTagline}>Todo para empezar su nueva historia.</p>
            </div>
            <nav className={styles.footerNavigation} aria-label="Navegación al pie">
              <a href="/" className={styles.footerLink}>Invitaciones digitales</a>
              <a href="/dashboard/" className={styles.footerLink}>Mis invitaciones</a>
            </nav>
          </div>
          <div className={`${styles.contentWidth} ${styles.footerBottom}`}>
            <span>Hecho con amor para tu gran día.</span>
            <span>Vista de diseño · Profesionales de ejemplo</span>
          </div>
        </footer>
      </div>
    </>
  );
}

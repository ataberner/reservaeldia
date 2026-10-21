import {
  Building2,
  CalendarDays,
  ChevronDown,
  Heart,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import MarketplaceHeader from "../marketplace/MarketplaceHeader";
import VenuesMap from "./VenuesMap";
import styles from "./VenuesLanding.module.css";

const PREVIEW_ACTION_TITLE = "Disponible en una próxima etapa";

// Static presentation examples, shared with the illustrative map below.
const EXAMPLE_VENUES = [
  {
    name: "Estancia Los Olivos",
    location: "Pilar, Buenos Aires",
    capacity: "80–250 invitados",
    type: "Estancia",
    photoClass: "photoEstancia",
    mapClass: "pinPilar",
    photoDescription: "Estancia con jardín preparado para una ceremonia al atardecer",
  },
  {
    name: "Quinta La Arboleda",
    location: "Escobar, Buenos Aires",
    capacity: "100–300 invitados",
    type: "Quinta",
    photoClass: "photoQuinta",
    mapClass: "pinEscobar",
    photoDescription: "Mesas de casamiento bajo árboles y guirnaldas de luces",
  },
  {
    name: "Casa del Lago",
    location: "Tigre, Buenos Aires",
    capacity: "50–180 invitados",
    type: "Salón",
    photoClass: "photoLago",
    mapClass: "pinTigre",
    photoDescription: "Salón de casamiento con ventanales y vista al lago",
  },
  {
    name: "Jardín de Abril",
    location: "San Isidro, Buenos Aires",
    capacity: "60–150 invitados",
    type: "Jardín",
    photoClass: "photoJardin",
    mapClass: "pinSanIsidro",
    photoDescription: "Jardín de casamiento con mesas, flores y luces cálidas",
  },
];

const FILTERS = [
  { label: "Buenos Aires", icon: MapPin, className: "locationFilter", chevron: true },
  { label: "Fecha", icon: CalendarDays, chevron: true },
  { label: "Invitados", icon: Users, chevron: true },
  { label: "Tipo de lugar", icon: Building2, chevron: true },
  { label: "Más filtros", icon: SlidersHorizontal },
];

function VenueCard({ venue, featured }) {
  return (
    <article className={styles.venueCard}>
      <div className={styles.venueMedia}>
        <div
          className={`${styles.venuePhoto} ${styles[venue.photoClass]}`}
          role="img"
          aria-label={venue.photoDescription}
        />
        <button
          className={styles.favoriteButton}
          type="button"
          disabled
          title={PREVIEW_ACTION_TITLE}
          aria-label={`Guardar ${venue.name}`}
        >
          <Heart size={25} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.venueTitleRow}>
        <h3 className={`${styles.venueName} ${featured ? styles.featuredName : ""}`}>
          {venue.name}
        </h3>
        <span className={styles.venueType}>{venue.type}</span>
      </div>
      <div className={styles.venueMeta}>
        <p className={styles.venueDetail}>
          <MapPin size={15} strokeWidth={1.6} aria-hidden="true" />
          {venue.location}
        </p>
        <p className={styles.venueDetail}>
          <Users size={15} strokeWidth={1.6} aria-hidden="true" />
          {venue.capacity}
        </p>
      </div>
    </article>
  );
}

export default function VenuesLanding({ user }) {
  return (
    <>
      <MarketplaceHeader user={user} current="venues" />
      <div className={styles.root}>

        <main className={styles.main}>
          <section className={styles.searchSection} aria-labelledby="venues-title">
            <div className={styles.searchContent}>
              <h1 className={styles.pageTitle} id="venues-title">
                Encontrá el lugar para <span className={styles.gradientText}>tu casamiento</span>
              </h1>
              <p className={styles.pageDescription}>Salones, quintas y estancias para celebrar a tu manera.</p>
              <div className={styles.filters} role="group" aria-label="Vista previa de filtros de lugares">
                {FILTERS.map(({ label, icon: Icon, className, chevron }) => (
                  <button
                    key={label}
                    className={`${styles.filterButton} ${className ? styles[className] : ""}`}
                    type="button"
                    disabled
                    title={PREVIEW_ACTION_TITLE}
                  >
                    <Icon size={23} strokeWidth={1.6} className={styles.filterIcon} aria-hidden="true" />
                    <span>{label}</span>
                    {chevron ? <ChevronDown size={15} className={styles.filterChevron} aria-hidden="true" /> : null}
                  </button>
                ))}
                <button className={styles.searchButton} type="button" disabled title={PREVIEW_ACTION_TITLE}>
                  <Search size={22} aria-hidden="true" /> Buscar lugares
                </button>
              </div>
            </div>
          </section>

          <div className={styles.resultsLayout}>
            <section className={styles.results} aria-labelledby="results-title">
              <div className={styles.resultsHeading}>
                <div>
                  <h2 className={styles.resultsTitle} id="results-title">Lugares en Buenos Aires</h2>
                  <p className={styles.resultsDescription}>Encontrá tu espacio ideal.</p>
                </div>
                <div className={styles.sortPreview}>
                  <span className={styles.sortLabel}>Ordenar:</span>
                  <button className={styles.sortButton} type="button" disabled title={PREVIEW_ACTION_TITLE}>
                    Recomendados <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className={styles.venueGrid}>
                {EXAMPLE_VENUES.map((venue, index) => (
                  <VenueCard key={venue.name} venue={venue} featured={index === 0} />
                ))}
              </div>
            </section>

            <VenuesMap venues={EXAMPLE_VENUES} />
          </div>
        </main>
      </div>
    </>
  );
}

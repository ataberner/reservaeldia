import styles from "./LandingHero.module.css";

function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

const HERO_CORNER_MARKERS = [
  [
    "top-left",
    "hero-corner hero-corner-top-left",
    styles.heroCornerTopLeft,
  ],
  [
    "top-right",
    "hero-corner hero-corner-top-right",
    styles.heroCornerTopRight,
  ],
  [
    "bottom-left",
    "hero-corner hero-corner-bottom-left",
    styles.heroCornerBottomLeft,
  ],
  [
    "bottom-right",
    "hero-corner hero-corner-bottom-right",
    styles.heroCornerBottomRight,
  ],
];

export default function LandingHero({
  ctaHref = "#plantillas",
  ctaLabel = "Elegir dise\u00f1o",
  onCtaClick,
  className = "",
}) {
  const handleCtaClick = (event) => {
    if (typeof onCtaClick !== "function") return;

    event.preventDefault();
    onCtaClick(event);
  };

  return (
    <section className={joinClassNames("hero", styles.hero, className)}>
      <div className={joinClassNames("hero-content", styles.heroContent)}>
        {HERO_CORNER_MARKERS.map(([key, globalClassName, cornerClassName]) => (
          <span
            key={key}
            className={joinClassNames(
              globalClassName,
              styles.heroCorner,
              cornerClassName
            )}
            aria-hidden="true"
          />
        ))}

        <h1 className={styles.heroTitle}>
          Resolv&eacute; la{" "}
          <span
            className={joinClassNames(
              "landing-hero-title-gradient",
              styles.heroTitleGradient
            )}
          >
            invitaci&oacute;n de tu
          </span>
          <br />
          <span
            className={joinClassNames(
              "landing-hero-title-gradient",
              styles.heroTitleGradient
            )}
          >
            casamiento
          </span>{" "}
          hoy
        </h1>

        <p className={styles.heroSubtitle}>
          Tu invitaci&oacute;n y la gesti&oacute;n de tus invitados en un solo link.
          <br />
          Creala y enviala por whatsapp o email en minutos.
        </p>

        <a
          className={joinClassNames("landing-hero-cta", styles.heroCta)}
          href={ctaHref}
          onClick={handleCtaClick}
        >
          {ctaLabel}
        </a>
      </div>
    </section>
  );
}

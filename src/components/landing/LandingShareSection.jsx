import styles from "./LandingShareSection.module.css";

const SHARE_INVITATION_MOCKUP_SRC =
  "/assets/img/landing/compartir-invitacion-mockup.png";

export default function LandingShareSection({
  titleId = "landing-share-title",
  ctaHref = "#plantillas",
  onCtaClick,
}) {
  return (
    <section
      className={styles.shareSection}
      aria-labelledby={titleId}
    >
      <div className={styles.shareContainer}>
        <div className={styles.shareMedia}>
          <img
            src={SHARE_INVITATION_MOCKUP_SRC}
            alt="Mockup de invitación digital compartida en celular, tablet y tarjeta"
            className={styles.shareImage}
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className={styles.shareContent}>
          <h2 id={titleId} className={styles.shareTitle}>
            <span className={styles.shareHighlight}>
              Olvidate de repartir sobres.
            </span>{" "}
            Mandá una invitación que además te organiza la fiesta.
          </h2>

          <p className={styles.shareDescription}>
            Compartí un link único por{" "}
            <span className={styles.shareDescriptionHighlight}>
              WhatsApp, mail o redes sociales.
            </span>{" "}
            Tus invitados reciben la invitación al instante y vos empezás a
            recibir confirmaciones en tiempo real.
          </p>

          <a
            className={styles.shareButton}
            href={ctaHref}
            onClick={onCtaClick}
          >
            Elegir diseño
          </a>
        </div>
      </div>
    </section>
  );
}

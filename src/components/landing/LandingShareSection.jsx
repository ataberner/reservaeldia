import styles from "./LandingShareSection.module.css";

const SHARE_INVITATION_MOCKUP_SRC =
  "/assets/img/landing/compartir-invitacion-mockup.webp";

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
            alt="Mockup de invitacion digital compartida en celular, tablet y tarjeta"
            className={styles.shareImage}
            loading="lazy"
            decoding="async"
          />
        </div>

        <div className={styles.shareContent}>
          <h2 id={titleId} className={styles.shareTitle}>
            <span className={styles.shareHighlight}>
              Mand&aacute; tu invitaci&oacute;n por WhatsApp</span> y organiz&aacute; tu fiesta sin vueltas.
          </h2>

          <p className={styles.shareDescription}>
            <span className={styles.shareHighlight}>
              Compart&iacute; un link &uacute;nico por WhatsApp
            </span>, mail o redes sociales. Tus invitados reciben la invitaci&oacute;n
            al instante y vos control&aacute;s todas las confirmaciones en tiempo real.
          </p>

          <a
            className={styles.shareButton}
            href={ctaHref}
            onClick={onCtaClick}
          >
            Elegir dise&ntilde;o
          </a>
        </div>
      </div>
    </section>
  );
}

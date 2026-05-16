import styles from "./LandingFeatureDetails.module.css";

const FEATURE_DETAIL_CARDS = [
  {
    title: "Control de asistencia",
    description:
      "Llevá el registro de quién va, sus acompañantes y cuántas respuestas faltan en tiempo real.",
    imageSrc: "/assets/img/landing-funcionalidades/control-asistencia.jpg",
    imageAlt: "Detalle de una lista de invitados para organizar asistencias",
  },
  {
    title: "Logística y regalos",
    description:
      "Juntá la información clave: cuenta regresiva, mapas y tus datos bancarios integrados de forma sutil y directa.",
    imageSrc: "/assets/img/landing-funcionalidades/logistica-regalos.jpg",
    imageAlt: "Detalle de datos de logística y regalos para un casamiento",
  },
  {
    title: "Preguntas a medida",
    description:
      "Consultá sobre restricciones alimentarias o agregá preguntas específicas para organizar la logística.",
    imageSrc: "/assets/img/landing-funcionalidades/preguntas-a-medida.jpg",
    imageAlt: "Detalle de preguntas personalizadas para invitados",
  },
  {
    title: "Contá tu historia",
    description:
      "Personalizá la invitación sumando un álbum con las mejores fotos de la pareja.",
    imageSrc: "/assets/img/landing-funcionalidades/conta-tu-historia.jpg",
    imageAlt: "Pareja revisando fotos para contar su historia",
  },
];

export default function LandingFeatureDetails({
  titleId = "landing-feature-details-title",
  blendWithShareBackground = false,
}) {
  const sectionClassName = blendWithShareBackground
    ? `${styles.featureDetails} ${styles.featureDetailsShareBlend}`
    : styles.featureDetails;

  return (
    <section
      className={sectionClassName}
      aria-labelledby={titleId}
    >
      <div className={styles.featureDetailsInner}>
        <h2 id={titleId} className={styles.featureDetailsTitle}>
          Más que una imagen, una{" "}
          <span className={styles.featureDetailsTitleGradient}>
            herramienta
          </span>{" "}
          para tu casamiento
        </h2>

        <div className={styles.featureDetailsGrid}>
          {FEATURE_DETAIL_CARDS.map((feature) => (
            <article key={feature.title} className={styles.featureCard}>
              <img
                src={feature.imageSrc}
                alt={feature.imageAlt}
                className={styles.featureCardImage}
                loading="lazy"
              />
              <div className={styles.featureCardCopy}>
                <h3 className={styles.featureCardTitle}>{feature.title}</h3>
                <p className={styles.featureCardText}>
                  {feature.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

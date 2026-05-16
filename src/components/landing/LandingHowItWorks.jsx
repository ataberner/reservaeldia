import styles from "./LandingHowItWorks.module.css";

const HOW_IT_WORKS_STEPS = [
  {
    title: "Eleg\u00ed un dise\u00f1o",
    description:
      "Explor\u00e1 nuestro cat\u00e1logo y seleccion\u00e1 la plantilla que mejor se adapte al estilo de tu casamiento.",
  },
  {
    title: "Personaliz\u00e1 los detalles",
    description:
      "Carg\u00e1 tu informaci\u00f3n, sum\u00e1 fotos y activ\u00e1 solo los m\u00f3dulos que necesites (mapas, regalos, preguntas de asistencia).",
  },
  {
    title: "Envi\u00e1",
    description:
      "Envi\u00e1 la invitaci\u00f3n por WhatsApp o correo de forma masiva o personalizada.",
  },
  {
    title: "Gestion\u00e1 la asistencia",
    description:
      "Monitore\u00e1 las confirmaciones y organiz\u00e1 a tus invitados desde tu panel en tiempo real.",
  },
];

export default function LandingHowItWorks({ id = "como-funciona" }) {
  return (
    <section
      id={id || undefined}
      className={styles.howItWorksSection}
      aria-label="Como funciona"
    >
      <div className={styles.howItWorksInner}>
        <ol className={styles.howItWorksGrid}>
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <li key={step.title} className={styles.howItWorksStep}>
              <span className={styles.howItWorksMarker} aria-hidden="true">
                {index + 1}
              </span>
              <h3 className={styles.howItWorksStepTitle}>{step.title}</h3>
              <p className={styles.howItWorksStepText}>{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

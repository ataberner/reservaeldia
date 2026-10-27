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
      "Personaliz\u00e1 textos y fotos con ayuda del asistente de IA. Si prefer\u00eds, un dise\u00f1ador de nuestro equipo est\u00e1 a tu disposici\u00f3n para personalizar tu invitaci\u00f3n. Totalmente gratis.",
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

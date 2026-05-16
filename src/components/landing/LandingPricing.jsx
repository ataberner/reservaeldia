import styles from "./LandingPricing.module.css";

const PRICING_BENEFITS = [
  "Invitados ilimitados",
  "Todas las funciones incluidas",
  "Pagás solo al publicar",
];

export default function LandingPricing({ id = "precios" }) {
  const titleId = id === "precios" ? "landing-pricing-title" : `${id}-title`;

  return (
    <section
      id={id || undefined}
      className={styles.pricingSection}
      aria-labelledby={titleId}
    >
      <article className={styles.pricingCard}>
        <div className={styles.pricingTop}>
          <h2 id={titleId} className={styles.pricingHeading}>
            <span className={styles.pricingAmount}>$29.000</span>{" "}
            <span className={styles.pricingTitle}>
              Precio único por invitación. Sin vueltas.
            </span>
          </h2>

          <p className={styles.pricingDescription}>
            Sin suscripciones. Accedé a todas las funciones y gestioná tus
            invitados por un costo fijo.
          </p>
        </div>

        <ul className={styles.pricingBenefits} aria-label="Beneficios incluidos">
          {PRICING_BENEFITS.map((benefit) => (
            <li key={benefit} className={styles.pricingBenefit}>
              <span className={styles.pricingBenefitIcon} aria-hidden="true" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

import styles from "./LandingFooter.module.css";

const DEFAULT_NAV_ITEMS = [
  { label: "Inicio", href: "/" },
  { label: "Invitaciones", href: "#plantillas" },
  { label: "Preguntas Frecuentes", href: "#preguntas-frecuentes" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Contacto", href: "#contacto" },
];

const LEGAL_LINKS = [
  { label: "Política de privacidad", href: "#politica-de-privacidad" },
  { label: "Términos de uso", href: "#terminos-de-uso" },
];

export default function LandingFooter({
  id = "contacto",
  navItems = DEFAULT_NAV_ITEMS,
}) {
  return (
    <footer
      id={id}
      className={styles.landingFooter}
      aria-label="Pie de página"
    >
      <div className={styles.landingFooterInner}>
        <div className={styles.landingFooterBrand}>
          <a
            className={styles.landingFooterLogo}
            href="/"
            aria-label="Reserva el Día - inicio"
          >
            Reserva el Día
          </a>
          <p className={styles.landingFooterSubtitle}>
            Diseño y gestión integral de invitaciones digitales.
          </p>
        </div>

        <nav
          className={styles.landingFooterNav}
          aria-label="Navegación del pie de página"
        >
          {navItems.map((item, index) => (
            <span
              key={item.label}
              className={styles.landingFooterNavItem}
            >
              <a
                className={styles.landingFooterNavLink}
                href={item.href}
              >
                {item.label}
              </a>
              {index < navItems.length - 1 ? (
                <span
                  className={styles.landingFooterNavSeparator}
                  aria-hidden="true"
                >
                  |
                </span>
              ) : null}
            </span>
          ))}
        </nav>

        <div className={styles.landingFooterBottom}>
          <p className={styles.landingFooterCopyright}>
            © 2026 Reserva el Día. Todos los derechos reservados.
          </p>

          <div className={styles.landingFooterLegalLinks}>
            {LEGAL_LINKS.map((item, index) => (
              <span
                key={item.label}
                className={styles.landingFooterLegalItem}
              >
                <a href={item.href}>{item.label}</a>
                {index < LEGAL_LINKS.length - 1 ? (
                  <span
                    className={styles.landingFooterLegalSeparator}
                    aria-hidden="true"
                  >
                    |
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

export const LANDING_TEMPLATES_ANCHOR = "#plantillas";
export const LANDING_SITE_URL = "https://reservaeldia.com.ar";
export const LANDING_CANONICAL_URL = `${LANDING_SITE_URL}/`;
export const LANDING_BRAND_NAME = "Reserva el D\u00eda";
export const LANDING_TITLE =
  "Invitaciones digitales para casamientos | Reserva el D\u00eda";
export const LANDING_DESCRIPTION =
  "Cre\u00e1 tu invitaci\u00f3n digital de casamiento, compartila por WhatsApp y gestion\u00e1 confirmaciones, invitados, regalos, mapas y fotos desde un solo link.";
export const LANDING_SHARE_IMAGE_URL = `${LANDING_SITE_URL}/assets/img/og-home-2026.jpg`;
export const LANDING_LOGO_URL = `${LANDING_SITE_URL}/assets/img/logo-full.png`;
export const LANDING_HERO_IMAGE_PRELOAD_URL = "/assets/img/Imagen%20Hero.webp";

const ORGANIZATION_ID = `${LANDING_SITE_URL}/#organization`;
const WEBSITE_ID = `${LANDING_SITE_URL}/#website`;
const WEBPAGE_ID = `${LANDING_SITE_URL}/#webpage`;

export function buildLandingStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: LANDING_BRAND_NAME,
        url: LANDING_CANONICAL_URL,
        logo: {
          "@type": "ImageObject",
          url: LANDING_LOGO_URL,
        },
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: LANDING_BRAND_NAME,
        url: LANDING_CANONICAL_URL,
        inLanguage: "es-AR",
        publisher: {
          "@id": ORGANIZATION_ID,
        },
      },
      {
        "@type": "WebPage",
        "@id": WEBPAGE_ID,
        url: LANDING_CANONICAL_URL,
        name: LANDING_TITLE,
        description: LANDING_DESCRIPTION,
        inLanguage: "es-AR",
        isPartOf: {
          "@id": WEBSITE_ID,
        },
        about: {
          "@id": ORGANIZATION_ID,
        },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: LANDING_SHARE_IMAGE_URL,
          width: 1200,
          height: 630,
        },
      },
    ],
  };
}

export const LANDING_STRUCTURED_DATA = buildLandingStructuredData();

export function serializeLandingStructuredData(
  structuredData = LANDING_STRUCTURED_DATA
) {
  return JSON.stringify(structuredData);
}

import {
  LANDING_BRAND_NAME,
  LANDING_SHARE_IMAGE_URL,
  LANDING_SITE_URL,
} from "./landingMetadata.js";
import { FAQ_ITEMS } from "./faqContent.js";

export const FAQ_CANONICAL_URL = `${LANDING_SITE_URL}/preguntas-frecuentes/`;
export const FAQ_TITLE =
  "Preguntas frecuentes sobre invitaciones digitales | Reserva el Día";
export const FAQ_DESCRIPTION =
  "Respuestas sobre invitaciones digitales, RSVP, WhatsApp, plantillas, precios y publicación para bodas, 15 años, bautismos y otros eventos.";
export const FAQ_SHARE_IMAGE_URL = LANDING_SHARE_IMAGE_URL;

export function buildFaqStructuredData(faqItems = FAQ_ITEMS) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${FAQ_CANONICAL_URL}#faqpage`,
    url: FAQ_CANONICAL_URL,
    name: FAQ_TITLE,
    description: FAQ_DESCRIPTION,
    inLanguage: "es-AR",
    isPartOf: {
      "@id": `${LANDING_SITE_URL}/#website`,
    },
    about: {
      "@type": "Organization",
      name: LANDING_BRAND_NAME,
      url: `${LANDING_SITE_URL}/`,
    },
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export const FAQ_STRUCTURED_DATA = buildFaqStructuredData();

export function serializeFaqStructuredData(
  structuredData = FAQ_STRUCTURED_DATA
) {
  return JSON.stringify(structuredData).replace(/</g, "\\u003c");
}

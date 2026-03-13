import { normalizeTemplateEditorialState as normalizeSharedEditorialState } from "../../../shared/templates/contract.js";

export const TEMPLATE_EDITORIAL_STATE_ORDER = Object.freeze([
  "en_proceso",
  "en_revision",
  "publicada",
]);

export const TEMPLATE_EDITORIAL_STATE_META = Object.freeze({
  en_proceso: {
    label: "En proceso",
    shortLabel: "Proceso",
    sectionDescription: "Plantillas abiertas a edicion interna y ajustes de base.",
    badgeClass:
      "border-amber-200 bg-amber-50 text-amber-800",
    chipClass:
      "border-amber-200 bg-amber-50 text-amber-900",
  },
  en_revision: {
    label: "En revision",
    shortLabel: "Revision",
    sectionDescription: "Plantillas listas para validacion editorial antes de publicar.",
    badgeClass:
      "border-sky-200 bg-sky-50 text-sky-800",
    chipClass:
      "border-sky-200 bg-sky-50 text-sky-900",
  },
  publicada: {
    label: "Publicadas",
    shortLabel: "Publicada",
    sectionDescription: "Plantillas visibles para usuarios finales y protegidas por workflow.",
    badgeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800",
    chipClass:
      "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
});

export function normalizeTemplateEditorialState(value) {
  return normalizeSharedEditorialState(value);
}

export function getTemplateEditorialStateMeta(value) {
  const state = normalizeTemplateEditorialState(value);
  return TEMPLATE_EDITORIAL_STATE_META[state];
}

export function groupTemplatesByEditorialState(items) {
  const grouped = {
    en_proceso: [],
    en_revision: [],
    publicada: [],
  };

  (Array.isArray(items) ? items : []).forEach((item) => {
    const state = normalizeTemplateEditorialState(item?.estadoEditorial);
    grouped[state].push(item);
  });

  return grouped;
}

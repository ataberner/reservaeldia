import { normalizeRsvpConfig } from "../../../domain/rsvp/config.js";
import { normalizeGiftConfig } from "../../../domain/gifts/config.js";
import { normalizePantallaObjectPosition } from "../../../domain/drafts/pantallaPosition.js";
import { buildSectionDecorationsPayload } from "../../../domain/sections/backgrounds.js";
import { normalizeRenderAssetState } from "../../../../shared/renderAssetContract.js";

function normalizeCountdownObjectGeometry(obj) {
  if (!obj || obj.tipo !== "countdown") return obj;

  const scaleX = Number(obj.scaleX);
  const scaleY = Number(obj.scaleY);
  const hasScaleX = Number.isFinite(scaleX) && scaleX !== 1;
  const hasScaleY = Number.isFinite(scaleY) && scaleY !== 1;

  if (!hasScaleX && !hasScaleY) return obj;

  const next = { ...obj };
  const width = Number(obj.width);
  const height = Number(obj.height);

  if (Number.isFinite(width) && Number.isFinite(scaleX)) {
    next.width = Math.abs(width * scaleX);
  }

  if (Number.isFinite(height) && Number.isFinite(scaleY)) {
    next.height = Math.abs(height * scaleY);
  }

  next.scaleX = 1;
  next.scaleY = 1;

  return next;
}

function normalizeSectionPersistenceShape(section) {
  if (!section || typeof section !== "object" || Array.isArray(section)) return section;

  return {
    ...section,
    decoracionesFondo: buildSectionDecorationsPayload(section, {
      sectionHeight: section.altura,
    }),
  };
}

function cleanUndefinedDeep(value) {
  if (Array.isArray(value)) return value.map((item) => cleanUndefinedDeep(item));

  if (value !== null && typeof value === "object") {
    const cleaned = {};
    Object.keys(value).forEach((key) => {
      const nestedValue = value[key];
      if (nestedValue !== undefined) {
        cleaned[key] = cleanUndefinedDeep(nestedValue);
      }
    });
    return cleaned;
  }

  return value;
}

function normalizeTextObjectPersistence(obj) {
  return {
    ...obj,
    color: obj.colorTexto || obj.color || obj.fill || "#000000",
    stroke: obj.stroke || null,
    strokeWidth: obj.strokeWidth || 0,
    shadowColor: obj.shadowColor || null,
    shadowBlur: obj.shadowBlur || 0,
    shadowOffsetX: obj.shadowOffsetX || 0,
    shadowOffsetY: obj.shadowOffsetY || 0,
  };
}

function normalizePersistableObject(obj, { validarPuntosLinea, isGroupChild = false } = {}) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return obj;
  }

  let next = { ...obj };

  if (next.tipo === "grupo" && Array.isArray(next.children)) {
    next = {
      ...next,
      children: next.children.map((child) =>
        normalizePersistableObject(child, {
          validarPuntosLinea,
          isGroupChild: true,
        })
      ),
    };
  } else if (next.tipo === "countdown") {
    next = normalizeCountdownObjectGeometry(next);
  } else if (next.tipo === "forma" && next.figura === "line") {
    next = validarPuntosLinea(next);
  } else if (next.tipo === "texto") {
    next = normalizeTextObjectPersistence(next);
  }

  if (isGroupChild) {
    delete next.seccionId;
    delete next.anclaje;
    delete next.yNorm;
  }

  return next;
}

export function buildPersistableRenderState({
  objetos,
  secciones,
  rsvp,
  gifts,
  validarPuntosLinea,
  ALTURA_PANTALLA_EDITOR,
}) {
  const rawObjetos = Array.isArray(objetos) ? objetos : [];
  const rawSecciones = Array.isArray(secciones) ? secciones : [];
  const rawRsvp = rsvp && typeof rsvp === "object" ? rsvp : null;
  const rawGifts = gifts && typeof gifts === "object" ? gifts : null;

  const objetosValidados = rawObjetos.map((obj) =>
    normalizePersistableObject(obj, { validarPuntosLinea })
  );

  const seccionesBase = rawSecciones.map((section) =>
    normalizeSectionPersistenceShape(section)
  );
  const renderAssetState = normalizeRenderAssetState({
    objetos: objetosValidados,
    secciones: seccionesBase,
  });
  const seccionById = new Map(
    (Array.isArray(renderAssetState.secciones) ? renderAssetState.secciones : []).map(
      (section) => [section?.id, section]
    )
  );
  const countdownForAudit =
    objetosValidados.find((item) => item?.tipo === "countdown") || null;
  const objetosNormalizadosPantalla = renderAssetState.objetos.map((objeto) =>
    normalizePantallaObjectPosition(objeto, {
      sectionMode: seccionById.get(objeto?.seccionId)?.altoModo,
      alturaPantalla: ALTURA_PANTALLA_EDITOR,
    })
  );

  return {
    objetos: cleanUndefinedDeep(objetosNormalizadosPantalla),
    secciones: cleanUndefinedDeep(renderAssetState.secciones),
    rsvp: rawRsvp
      ? cleanUndefinedDeep(normalizeRsvpConfig(rawRsvp, { forceEnabled: false }))
      : null,
    gifts: rawGifts
      ? cleanUndefinedDeep(normalizeGiftConfig(rawGifts, { forceEnabled: false }))
      : null,
    countdownForAudit,
  };
}

export function buildLoadedEditorRenderState({
  objetos,
  secciones,
  ALTURA_PANTALLA_EDITOR,
}) {
  const renderAssetState = normalizeRenderAssetState({
    objetos: Array.isArray(objetos) ? objetos : [],
    secciones: Array.isArray(secciones) ? secciones : [],
  });
  const objetosCanonicos = renderAssetState.objetos;
  const seccionesCanonicas = renderAssetState.secciones;

  const seccionById = new Map(seccionesCanonicas.map((section) => [section?.id, section]));
  const objetosNormalizados = objetosCanonicos.map((objeto) =>
    normalizePantallaObjectPosition(objeto, {
      sectionMode: seccionById.get(objeto?.seccionId)?.altoModo,
      alturaPantalla: ALTURA_PANTALLA_EDITOR,
    })
  );

  const seccionesNormalizadas = seccionesCanonicas.map((section) =>
    normalizeSectionPersistenceShape(section)
  );

  return {
    objetos: objetosNormalizados,
    secciones: seccionesNormalizadas,
  };
}

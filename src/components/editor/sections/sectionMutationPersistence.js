import { buildDraftContentMeta } from "../../../domain/drafts/sourceOfTruth.js";
import { buildPersistableRenderState } from "../persistence/borradorSyncRenderState.js";

const ALTURA_PANTALLA_EDITOR_FALLBACK = 500;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function identityLineValidator(objeto) {
  return objeto;
}

function createSectionObjectId() {
  return `obj-${Date.now()}${Math.random().toString(36).substring(2, 6)}`;
}

export function buildNextSectionHeightState(
  secciones,
  {
    seccionId,
    altura,
  } = {}
) {
  const safeSecciones = asArray(secciones);
  const parsedHeight = Number(altura);

  if (!seccionId || !Number.isFinite(parsedHeight)) {
    return safeSecciones;
  }

  const nextHeight = Math.max(50, Math.round(parsedHeight));
  let changed = false;

  const nextSecciones = safeSecciones.map((section) => {
    if (section?.id !== seccionId) return section;
    if (Number(section?.altura) === nextHeight) return section;
    changed = true;
    return {
      ...section,
      altura: nextHeight,
    };
  });

  return changed ? nextSecciones : safeSecciones;
}

export function buildNextSectionModeState(
  secciones,
  {
    seccionId,
    normalizarAltoModo,
    ALTURA_REFERENCIA_PANTALLA,
  } = {}
) {
  const safeSecciones = asArray(secciones);
  if (!seccionId || typeof normalizarAltoModo !== "function") {
    return safeSecciones;
  }

  const pantallaHeight = Number(ALTURA_REFERENCIA_PANTALLA);
  let changed = false;

  const nextSecciones = safeSecciones.map((section) => {
    if (section?.id !== seccionId) return section;

    const modoActual = normalizarAltoModo(section?.altoModo);
    const modoNuevo = modoActual === "pantalla" ? "fijo" : "pantalla";
    const currentHeight = Number(section?.altura);
    const backupHeight = Number(section?.alturaFijoBackup);
    changed = true;

    if (modoNuevo === "pantalla") {
      return {
        ...section,
        altoModo: "pantalla",
        alturaFijoBackup: Number.isFinite(currentHeight) ? currentHeight : 600,
        altura: Number.isFinite(pantallaHeight) ? pantallaHeight : 500,
      };
    }

    const backup = Number.isFinite(backupHeight)
      ? backupHeight
      : currentHeight;
    const { alturaFijoBackup, ...rest } = section || {};

    return {
      ...rest,
      altoModo: "fijo",
      altura: Number.isFinite(backup) ? backup : 600,
    };
  });

  return changed ? nextSecciones : safeSecciones;
}

export function buildSectionCreationState(
  {
    datos,
    secciones,
    objetos,
    crearSeccion,
    createObjectId = createSectionObjectId,
  } = {}
) {
  const safeSecciones = asArray(secciones);
  const safeObjetos = asArray(objetos);

  if (typeof crearSeccion !== "function") {
    return {
      nuevaSeccion: null,
      nextSecciones: safeSecciones,
      nextObjetos: safeObjetos,
    };
  }

  const nuevaSeccion = crearSeccion(datos, safeSecciones);
  let objetosDesdePlantilla = [];

  if (datos?.desdePlantilla && Array.isArray(datos.objetos)) {
    objetosDesdePlantilla = datos.objetos.map((objeto) => ({
      ...objeto,
      id: createObjectId(),
      seccionId: nuevaSeccion.id,
    }));
  }

  return {
    nuevaSeccion,
    nextSecciones: [...safeSecciones, nuevaSeccion],
    nextObjetos: [...safeObjetos, ...objetosDesdePlantilla],
  };
}

export function shouldPersistSectionMutationSnapshot(
  {
    currentSecciones,
    currentObjetos,
    nextSecciones,
    nextObjetos,
  } = {}
) {
  return currentSecciones === nextSecciones && currentObjetos === nextObjetos;
}

export function buildSectionMutationWritePayload(
  {
    secciones,
    objetos,
    rsvp = null,
    gifts = null,
    reason = "section-mutation",
    includeObjetos = false,
    includeRsvp = false,
    includeGifts = false,
    validarPuntosLinea,
    ALTURA_PANTALLA_EDITOR = ALTURA_PANTALLA_EDITOR_FALLBACK,
    createTimestamp = () => null,
  } = {}
) {
  const persistedRenderState = buildPersistableRenderState({
    objetos: asArray(objetos),
    secciones: asArray(secciones),
    rsvp,
    gifts,
    validarPuntosLinea:
      typeof validarPuntosLinea === "function"
        ? validarPuntosLinea
        : identityLineValidator,
    ALTURA_PANTALLA_EDITOR,
  });

  const payload = {
    secciones: persistedRenderState.secciones,
    draftContentMeta: {
      ...buildDraftContentMeta({
        lastWriter: "canvas",
        reason,
      }),
      updatedAt: createTimestamp(),
    },
    ultimaEdicion: createTimestamp(),
  };

  if (includeObjetos) {
    payload.objetos = persistedRenderState.objetos;
  }

  if (includeRsvp) {
    payload.rsvp = persistedRenderState.rsvp;
  }

  if (includeGifts) {
    payload.gifts = persistedRenderState.gifts;
  }

  return {
    payload,
    persistedRenderState,
  };
}

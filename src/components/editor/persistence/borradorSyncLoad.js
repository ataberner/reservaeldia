import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "../../../firebase.js";
import { normalizeRsvpConfig } from "../../../domain/rsvp/config.js";
import { normalizeGiftConfig } from "../../../domain/gifts/config.js";
import { normalizeInvitationType } from "../../../domain/invitationTypes.js";
import { getTemplateEditorDocument } from "../../../domain/templates/adminService.js";
import { normalizeDraftRenderState } from "../../../domain/drafts/sourceOfTruth.js";
import { pushEditorBreadcrumb } from "../../../lib/monitoring/editorIssueReporter.js";
import { buildLoadedEditorRenderState } from "./borradorSyncRenderState.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function parseStorageLocationFromUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;

  try {
    const url = new URL(value);

    if (
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname.endsWith(".firebasestorage.app")
    ) {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/i);
      if (!match) return null;

      const bucketName = decodeURIComponent(match[1] || "");
      const path = decodeURIComponent(match[2] || "");
      if (!bucketName || !path) return null;
      return { bucketName, path };
    }

    if (url.hostname === "storage.googleapis.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return null;

      const bucketName = decodeURIComponent(segments[0] || "");
      const path = decodeURIComponent(segments.slice(1).join("/"));
      if (!bucketName || !path) return null;
      return { bucketName, path };
    }

    return null;
  } catch {
    return null;
  }
}

async function refreshStorageUrl(value, cache) {
  const location = parseStorageLocationFromUrl(value);
  if (!location) return value;

  const cacheKey = `${location.bucketName}/${location.path}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const gsUrl = `gs://${location.bucketName}/${location.path}`;
    const freshUrl = await getDownloadURL(storageRef(storage, gsUrl));
    cache.set(cacheKey, freshUrl);
    return freshUrl;
  } catch (error) {
    pushEditorBreadcrumb("storage-url-refresh-failed", {
      code: error?.code || null,
      bucketName: location.bucketName,
      path: location.path,
    });
    cache.set(cacheKey, value);
    return value;
  }
}

async function refreshUrlsDeep(value, cache) {
  if (typeof value === "string") {
    return refreshStorageUrl(value, cache);
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => refreshUrlsDeep(item, cache)));
  }

  if (value && typeof value === "object") {
    const pairs = await Promise.all(
      Object.entries(value).map(async ([key, nested]) => {
        const refreshed = await refreshUrlsDeep(nested, cache);
        return [key, refreshed];
      })
    );
    return Object.fromEntries(pairs);
  }

  return value;
}

export async function loadBorradorSyncState({
  session,
  readOnly = false,
  initialDraftData = null,
  initialEditorData = null,
  ALTURA_PANTALLA_EDITOR,
}) {
  const safeSession =
    session && typeof session === "object"
      ? session
      : { kind: "draft", id: "" };
  const hasInjectedDraft =
    (safeSession.kind === "template" ? initialEditorData : initialDraftData) &&
    typeof (safeSession.kind === "template" ? initialEditorData : initialDraftData) ===
      "object";
  let exists = false;
  let data = {};

  if (hasInjectedDraft) {
    exists = true;
    data = safeSession.kind === "template" ? initialEditorData : initialDraftData;
  } else if (safeSession.kind === "template") {
    const result = await getTemplateEditorDocument({
      templateId: safeSession.id,
    });
    data =
      result?.editorDocument && typeof result.editorDocument === "object"
        ? result.editorDocument
        : {};
    exists = Object.keys(data).length > 0;
  } else {
    const ref = doc(db, "borradores", safeSession.id);
    const snap = await getDoc(ref);
    exists = snap.exists();
    data = snap.exists() ? snap.data() || {} : {};
  }

  if (!exists) {
    return {
      exists: false,
      session: safeSession,
    };
  }

  const renderState = normalizeDraftRenderState(data);
  const plantillaId =
    safeSession.kind === "template"
      ? safeSession.id
      : typeof data?.plantillaId === "string"
        ? data.plantillaId.trim()
        : "";
  const rawRsvp = renderState.rsvp;
  const rawGifts = renderState.gifts;
  const tipoDraftRaw =
    typeof data?.tipoInvitacion === "string" ? data.tipoInvitacion : "";
  let tipoInvitacion = normalizeInvitationType(tipoDraftRaw);

  if (safeSession.kind !== "template" && !tipoDraftRaw && plantillaId) {
    try {
      const ref = doc(db, "borradores", safeSession.id);
      const plantillaSnap = await getDoc(doc(db, "plantillas", plantillaId));
      if (plantillaSnap.exists()) {
        const plantillaData = plantillaSnap.data() || {};
        tipoInvitacion = normalizeInvitationType(plantillaData?.tipo);

        if (tipoInvitacion && !readOnly) {
          await updateDoc(ref, {
            tipoInvitacion,
          });
        }
      }
    } catch (tipoError) {
      pushEditorBreadcrumb("tipo-invitacion-backfill-failed", {
        slug: safeSession.id,
        plantillaId: plantillaId || null,
        message: tipoError?.message || null,
      });
    }
  }

  const refreshCache = new Map();
  const [seccionesRefrescadas, objetosRefrescados] = await Promise.all([
    refreshUrlsDeep(renderState.secciones, refreshCache),
    refreshUrlsDeep(renderState.objetos, refreshCache),
  ]);
  const loadedRenderState = buildLoadedEditorRenderState({
    objetos: objetosRefrescados,
    secciones: seccionesRefrescadas,
    ALTURA_PANTALLA_EDITOR,
  });
  const hydratedObjetos = loadedRenderState.objetos;
  const hydratedSecciones = loadedRenderState.secciones;
  const countdown = hydratedObjetos.find((item) => item?.tipo === "countdown") || null;
  const altoModo = countdown
    ? normalizeText(
        hydratedSecciones.find((section) => section?.id === countdown?.seccionId)?.altoModo
      ).toLowerCase()
    : "";

  return {
    exists: true,
    session: safeSession,
    source: hasInjectedDraft
      ? "injected-readonly"
      : safeSession.kind === "template"
        ? "callable"
        : "firestore",
    plantillaId: plantillaId || null,
    hydratedObjetos,
    hydratedSecciones,
    rsvpForSetter:
      rawRsvp && typeof rawRsvp === "object"
        ? normalizeRsvpConfig(rawRsvp, { forceEnabled: false })
        : null,
    giftsForSetter:
      rawGifts && typeof rawGifts === "object"
        ? normalizeGiftConfig(rawGifts, { forceEnabled: false })
        : null,
    rawRsvp: rawRsvp && typeof rawRsvp === "object" ? rawRsvp : null,
    rawGifts: rawGifts && typeof rawGifts === "object" ? rawGifts : null,
    tipoInvitacion,
    templateWorkspace:
      data?.templateWorkspace && typeof data.templateWorkspace === "object"
        ? data.templateWorkspace
        : null,
    templateAuthoringDraft:
      data?.templateAuthoringDraft && typeof data.templateAuthoringDraft === "object"
        ? data.templateAuthoringDraft
        : null,
    countdownAudit: countdown
      ? {
          countdown,
          stage:
            safeSession.kind === "template"
              ? "template-persisted-document"
              : "draft-load-document",
          renderer: "persisted-document",
          sourceDocument:
            safeSession.kind === "template" ? "template-editor-document" : "borradores",
          viewport: "editor",
          wrapperScale: 1,
          usesRasterThumbnail: false,
          altoModo,
          sourceLabel: safeSession.id,
        }
      : null,
  };
}

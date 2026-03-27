import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase.js";
import { saveTemplateEditorDocument } from "../../../domain/templates/adminService.js";
import { buildDraftContentMeta } from "../../../domain/drafts/sourceOfTruth.js";
import { normalizeEditorSession } from "../../../domain/drafts/session.js";
import { recordCountdownAuditSnapshot } from "../../../domain/countdownAudit/runtime.js";
import { pushEditorBreadcrumb } from "../../../lib/monitoring/editorIssueReporter.js";
import { buildPersistableRenderState } from "./borradorSyncRenderState.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function isMobileRuntime() {
  if (typeof window === "undefined") return false;
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const ua = String(window.navigator?.userAgent || "");
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return coarsePointer || uaMobile;
}

export async function persistBorradorSyncState({
  state,
  readOnly = false,
  reason = "autosave",
  immediate = false,
  stageRef,
  validarPuntosLinea,
  ALTURA_PANTALLA_EDITOR,
}) {
  const safeState = state && typeof state === "object" ? state : {};
  const session = normalizeEditorSession(safeState.editorSession, safeState.slug);
  const safeSlug = normalizeText(session.id || safeState.slug);

  if (readOnly) {
    return {
      ok: false,
      reason: "read-only",
      error: "El borrador esta abierto en modo solo lectura.",
    };
  }

  if (!safeSlug) {
    return {
      ok: false,
      reason: "missing-slug",
      error: "Slug de borrador no disponible.",
    };
  }

  if (!safeState.cargado) {
    return {
      ok: false,
      reason: "draft-not-loaded",
      error: "El borrador todavia no termino de cargar.",
    };
  }

  if (window._resizeData?.isResizing) {
    return {
      ok: false,
      reason: "resize-in-progress",
      error: "Espera a que termine el ajuste de tamano en curso.",
    };
  }

  const persistedRenderState = buildPersistableRenderState({
    objetos: safeState.objetos,
    secciones: safeState.secciones,
    rsvp: safeState.rsvp,
    gifts: safeState.gifts,
    validarPuntosLinea,
    ALTURA_PANTALLA_EDITOR,
  });
  const seccionesLimpias = persistedRenderState.secciones;
  const objetosLimpios = persistedRenderState.objetos;
  const rsvpLimpio = persistedRenderState.rsvp;
  const giftsLimpios = persistedRenderState.gifts;
  const countdownForAudit = persistedRenderState.countdownForAudit;

  if (session.kind === "template") {
    await saveTemplateEditorDocument({
      templateId: safeSlug,
      document: {
        nombre: normalizeText(safeState.nombre) || undefined,
        objetos: objetosLimpios,
        secciones: seccionesLimpias,
        rsvp: rsvpLimpio,
        gifts: giftsLimpios,
      },
    });

    return {
      ok: true,
    };
  }

  const ref = doc(db, "borradores", safeSlug);
  await updateDoc(ref, {
    objetos: objetosLimpios,
    secciones: seccionesLimpias,
    rsvp: rsvpLimpio,
    gifts: giftsLimpios,
    draftContentMeta: {
      ...buildDraftContentMeta({
        lastWriter: "canvas",
        reason,
      }),
      updatedAt: serverTimestamp(),
    },
    ultimaEdicion: serverTimestamp(),
  });

  if (countdownForAudit) {
    const sectionMode = normalizeText(
      seccionesLimpias.find((section) => section?.id === countdownForAudit?.seccionId)?.altoModo
    ).toLowerCase();
    recordCountdownAuditSnapshot({
      countdown: countdownForAudit,
      stage: "draft-persist-write",
      renderer: "persisted-document",
      sourceDocument: "borradores",
      viewport: "editor",
      wrapperScale: 1,
      usesRasterThumbnail: false,
      altoModo: sectionMode,
      sourceLabel: safeSlug,
    });
  }

  if (!immediate && stageRef?.current && safeState.userId && safeSlug) {
    if (isMobileRuntime()) {
      pushEditorBreadcrumb("thumbnail-skip-mobile-runtime", { slug: safeSlug });
      return {
        ok: true,
      };
    }

    const { guardarThumbnailDesdeStage } = await import("../../../utils/guardarThumbnail.js");
    await guardarThumbnailDesdeStage({
      stageRef,
      uid: safeState.userId,
      slug: safeSlug,
    });
  }

  return {
    ok: true,
  };
}

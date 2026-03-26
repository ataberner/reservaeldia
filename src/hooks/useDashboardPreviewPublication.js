import { useCallback, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebase";
import { getErrorMessage } from "@/domain/dashboard/helpers";
import {
  buildDashboardPreviewRenderPayload,
  buildPreviewDisplayUrl,
  createPublicationPreviewState,
  isPublicacionActiva,
  overlayLiveEditorSnapshot,
} from "@/domain/dashboard/previewSession";
import { flushEditorPersistenceBeforeCriticalAction } from "@/domain/drafts/criticalFlush";
import {
  resolvePublicationLinkForDraftRead,
  sanitizeDraftSlug,
} from "@/domain/invitations/readResolution";
import { validateDraftForPublication } from "@/domain/publications/service";
import { getTemplateEditorDocument } from "@/domain/templates/adminService";
import {
  captureCountdownAuditFromHtmlString,
  captureCountdownAuditPublicationHtml,
} from "@/domain/countdownAudit/runtime";
import { readEditorRenderSnapshot } from "@/lib/editorSnapshotAdapter";
import {
  normalizePublicSlug,
  parseSlugFromPublicUrl,
} from "@/lib/publicSlug";
import { pushEditorBreadcrumb } from "@/lib/monitoring/editorIssueReporter";

function schedulePublishedCountdownAuditCapture(publicUrl, fallbackHtml = "") {
  const safePublicUrl = String(publicUrl || "").trim();
  const safeFallbackHtml = String(fallbackHtml || "").trim();

  if (safeFallbackHtml) {
    captureCountdownAuditFromHtmlString(safeFallbackHtml, {
      stage: "published-html",
      renderer: "dom-generated",
      sourceDocument: "publish-preview-html",
      viewport: "public",
      wrapperScale: 1,
      usesRasterThumbnail: false,
    });
  }

  if (typeof window === "undefined" || !safePublicUrl) return;

  [900, 2200, 5000].forEach((delayMs) => {
    window.setTimeout(() => {
      void captureCountdownAuditPublicationHtml(safePublicUrl).catch(() => {});
    }, delayMs);
  });
}

export function useDashboardPreviewPublication({
  slugInvitacion,
  modoEditor,
  editorSession,
} = {}) {
  const [previewState, setPreviewState] = useState(() =>
    createPublicationPreviewState()
  );

  const ensureDraftFlushBeforeCriticalAction = useCallback(
    async (reason) => {
      const safeSlug = sanitizeDraftSlug(slugInvitacion);
      pushEditorBreadcrumb("critical-action-flush-start", {
        slug: safeSlug || null,
        reason,
        sessionKind: editorSession?.kind || null,
      });

      const result = await flushEditorPersistenceBeforeCriticalAction({
        slug: safeSlug,
        reason,
        editorMode: modoEditor,
        editorSession,
        directFlush:
          typeof window !== "undefined" &&
          typeof window.canvasEditor?.flushPersistenceNow === "function"
            ? (options) => window.canvasEditor.flushPersistenceNow(options)
            : null,
        captureSnapshot: () => readEditorRenderSnapshot(),
      });

      pushEditorBreadcrumb(
        result.ok ? "critical-action-flush-success" : "critical-action-flush-failed",
        {
          slug: safeSlug || null,
          reason,
          sessionKind: result.sessionKind || editorSession?.kind || null,
          transport: result.transport || null,
          skipped: result.skipped === true,
          capturedCompatibilitySnapshot: Boolean(result.compatibilitySnapshot),
          failureReason: result.reason || null,
        }
      );

      return result;
    },
    [editorSession, modoEditor, slugInvitacion]
  );

  const refreshPublishValidation = useCallback(
    async (draftSlugOverride = null) => {
      if (editorSession?.kind === "template") {
        setPreviewState((prev) => ({
          ...prev,
          publishValidationResult: null,
          publishValidationPending: false,
        }));
        return null;
      }

      const safeDraftSlug = sanitizeDraftSlug(draftSlugOverride || slugInvitacion);
      if (!safeDraftSlug) {
        setPreviewState((prev) => ({
          ...prev,
          publishValidationResult: null,
          publishValidationPending: false,
        }));
        return null;
      }

      setPreviewState((prev) => ({
        ...prev,
        publishValidationPending: true,
      }));

      try {
        const result = await validateDraftForPublication({
          draftSlug: safeDraftSlug,
        });
        setPreviewState((prev) => ({
          ...prev,
          publishValidationResult: result || null,
        }));
        return result || null;
      } finally {
        setPreviewState((prev) => ({
          ...prev,
          publishValidationPending: false,
        }));
      }
    },
    [editorSession?.kind, slugInvitacion]
  );

  const generarVistaPrevia = useCallback(async () => {
    try {
      const flushResult = await ensureDraftFlushBeforeCriticalAction(
        "preview-before-open"
      );
      if (!flushResult.ok) {
        setPreviewState((prev) => ({
          ...prev,
          publicacionVistaPreviaError: flushResult.error || "",
          mostrarVistaPrevia: false,
        }));
        return;
      }

      setPreviewState(
        createPublicationPreviewState({
          mostrarVistaPrevia: true,
        })
      );

      const previewBoundarySnapshot =
        flushResult.compatibilitySnapshot &&
        typeof flushResult.compatibilitySnapshot === "object"
          ? flushResult.compatibilitySnapshot
          : null;

      let data = null;
      if (editorSession?.kind === "template") {
        const result = await getTemplateEditorDocument({
          templateId: slugInvitacion,
        });
        data =
          result?.editorDocument && typeof result.editorDocument === "object"
            ? result.editorDocument
            : null;
        if (!data) {
          alert("No se encontro la plantilla.");
          setPreviewState(createPublicationPreviewState());
          return;
        }
      } else {
        const ref = doc(db, "borradores", slugInvitacion);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          alert("No se encontro el borrador");
          setPreviewState(createPublicationPreviewState());
          return;
        }
        data = snap.data();
      }

      const liveEditorSnapshot =
        previewBoundarySnapshot || readEditorRenderSnapshot();
      const previewSourceData = overlayLiveEditorSnapshot(data, liveEditorSnapshot);
      const previewPayload = buildDashboardPreviewRenderPayload(previewSourceData);

      let urlPublicaDetectada = "";
      let slugPublicoDetectado = "";
      let publicacionNoVigenteDetectada = false;

      if (editorSession?.kind !== "template") {
        const publicationRead = await resolvePublicationLinkForDraftRead({
          draftSlug: slugInvitacion,
          draftData: previewSourceData,
          readPublicationBySlug: async (publicSlug) =>
            getDoc(doc(db, "publicadas", publicSlug)),
          queryPublicationBySlugOriginal: async (draftSlug) => {
            const qPublicadaPorOriginal = query(
              collection(db, "publicadas"),
              where("slugOriginal", "==", draftSlug),
              limit(1)
            );
            const snapPublicadaPorOriginal = await getDocs(qPublicadaPorOriginal);
            return snapPublicadaPorOriginal.empty
              ? null
              : snapPublicadaPorOriginal.docs[0];
          },
          isPublicationReadable: (publicationData) =>
            isPublicacionActiva(publicationData),
        });

        slugPublicoDetectado = String(publicationRead?.publicSlug || "").trim();
        urlPublicaDetectada = String(publicationRead?.publicUrl || "").trim();
        publicacionNoVigenteDetectada =
          publicationRead?.matchedInactive === true;
      }

      const slugPublicoNormalizado =
        normalizePublicSlug(slugPublicoDetectado) ||
        normalizePublicSlug(urlPublicaDetectada) ||
        null;

      const previewDebug = (() => {
        try {
          const qp = new URLSearchParams(window.location.search || "");
          return qp.get("previewDebug") === "1";
        } catch {
          return false;
        }
      })();

      try {
        const resumen = {};
        previewPayload.objetos.forEach((objeto) => {
          const sec = String(objeto?.seccionId || "sin-seccion");
          if (!resumen[sec]) resumen[sec] = { total: 0, tipos: {} };
          resumen[sec].total += 1;
          const tipo = String(objeto?.tipo || "sin-tipo");
          resumen[sec].tipos[tipo] = (resumen[sec].tipos[tipo] || 0) + 1;
        });
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const dpr = window.devicePixelRatio || 1;
        const ua = navigator.userAgent || "";
        const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        const mobileViewport = vw <= 767;
        const desktopMobilePreview = mobileViewport && !mobileUA;

        const filas = Object.keys(resumen)
          .sort((left, right) => {
            const totalLeft = resumen[left]?.total || 0;
            const totalRight = resumen[right]?.total || 0;
            if (totalRight !== totalLeft) return totalRight - totalLeft;
            return left.localeCompare(right);
          })
          .map((secId) => {
            const item = resumen[secId] || { total: 0, tipos: {} };
            const tiposTxt = Object.keys(item.tipos || {})
              .sort()
              .map((tipo) => `${tipo}:${item.tipos[tipo]}`)
              .join(", ");
            return `${secId} | total=${item.total} | tipos=${tiposTxt || "-"}`;
          });

        const header =
          `[PREVIEW] objetos por seccion (abierto)\n` +
          `viewport=${vw}x${vh} dpr=${Number(dpr).toFixed(2)} ` +
          `mobileViewport=${mobileViewport} desktopMobilePreview=${desktopMobilePreview} mobileUA=${mobileUA}\n` +
          `secciones=${Object.keys(resumen).length} objetos=${previewPayload.objetos.length}`;

        if (previewDebug) {
          console.log(`${header}\n${filas.join("\n")}`);
        }
      } catch (error) {
        if (previewDebug) {
          console.warn("[PREVIEW] no se pudo armar resumen de objetos", error);
        }
      }

      const { generarHTMLDesdeSecciones } = await import(
        "../../functions/src/utils/generarHTMLDesdeSecciones"
      );
      const slugPreview =
        slugPublicoNormalizado || sanitizeDraftSlug(slugInvitacion) || "";
      const htmlGenerado = generarHTMLDesdeSecciones(
        previewPayload.secciones,
        previewPayload.objetos,
        previewPayload.rsvpPreviewConfig,
        {
          slug: slugPreview,
          isPreview: true,
          gifts: previewPayload.giftPreviewConfig,
          rsvpSource: previewPayload.rawRsvp,
          giftsSource: previewPayload.rawGifts,
        }
      );

      setPreviewState((prev) => ({
        ...prev,
        htmlVistaPrevia: htmlGenerado,
        urlPublicaVistaPrevia: urlPublicaDetectada || null,
        slugPublicoVistaPrevia: slugPublicoNormalizado,
        puedeActualizarPublicacion: Boolean(slugPublicoNormalizado),
        publicacionVistaPreviaError:
          publicacionNoVigenteDetectada && !slugPublicoNormalizado
            ? "La publicacion anterior finalizo su vigencia. Puedes publicar nuevamente como nueva."
            : prev.publicacionVistaPreviaError,
      }));

      if (editorSession?.kind !== "template") {
        void refreshPublishValidation(slugInvitacion).catch((validationError) => {
          console.error("Error validando publicacion previa:", validationError);
        });
      }
    } catch (error) {
      console.error("Error generando vista previa:", error);
      alert("No se pudo generar la vista previa");
      setPreviewState(createPublicationPreviewState());
    }
  }, [
    editorSession,
    ensureDraftFlushBeforeCriticalAction,
    refreshPublishValidation,
    slugInvitacion,
  ]);

  const publicarDesdeVistaPrevia = useCallback(async () => {
    if (editorSession?.kind === "template") return;
    if (!slugInvitacion) return;

    const flushResult = await ensureDraftFlushBeforeCriticalAction(
      "checkout-before-open"
    );
    if (!flushResult.ok) {
      setPreviewState((prev) => ({
        ...prev,
        publicacionVistaPreviaError: flushResult.error || "",
        publicacionVistaPreviaOk: "",
        mostrarCheckoutPublicacion: false,
      }));
      return;
    }

    let validationResult = null;
    try {
      validationResult = await refreshPublishValidation(slugInvitacion);
    } catch (validationError) {
      setPreviewState((prev) => ({
        ...prev,
        publicacionVistaPreviaError: getErrorMessage(
          validationError,
          "No se pudo validar la compatibilidad de publish. Intenta nuevamente."
        ),
        publicacionVistaPreviaOk: "",
        mostrarCheckoutPublicacion: false,
      }));
      return;
    }

    if (
      Array.isArray(validationResult?.blockers) &&
      validationResult.blockers.length > 0
    ) {
      setPreviewState((prev) => ({
        ...prev,
        publicacionVistaPreviaError:
          validationResult?.summary?.blockingMessage ||
          "Hay contratos de render que todavia no son seguros para publicar.",
        publicacionVistaPreviaOk: "",
        mostrarCheckoutPublicacion: false,
      }));
      return;
    }

    setPreviewState((prev) => ({
      ...prev,
      publicacionVistaPreviaError: "",
      publicacionVistaPreviaOk: "",
      operacionCheckoutPublicacion: prev.puedeActualizarPublicacion
        ? "update"
        : "new",
      mostrarCheckoutPublicacion: true,
    }));
  }, [
    editorSession?.kind,
    ensureDraftFlushBeforeCriticalAction,
    refreshPublishValidation,
    slugInvitacion,
  ]);

  const handleCheckoutPublished = useCallback(
    (payload) => {
      const publicUrl = String(payload?.publicUrl || "").trim();
      const publicSlug =
        normalizePublicSlug(payload?.publicSlug) ||
        parseSlugFromPublicUrl(publicUrl);

      setPreviewState((prev) => ({
        ...prev,
        urlPublicaVistaPrevia: publicUrl || prev.urlPublicaVistaPrevia,
        urlPublicadaReciente: publicUrl || prev.urlPublicadaReciente,
        slugPublicoVistaPrevia: publicSlug || prev.slugPublicoVistaPrevia,
        puedeActualizarPublicacion: Boolean(
          publicSlug || prev.slugPublicoVistaPrevia
        ),
        publicacionVistaPreviaError: "",
        publicacionVistaPreviaOk:
          payload?.operation === "update"
            ? "Invitacion actualizada correctamente."
            : "Invitacion publicada correctamente.",
      }));

      schedulePublishedCountdownAuditCapture(
        publicUrl,
        previewState.htmlVistaPrevia
      );
    },
    [previewState.htmlVistaPrevia]
  );

  const closePreview = useCallback(() => {
    setPreviewState(createPublicationPreviewState());
  }, []);

  const closeCheckout = useCallback(() => {
    setPreviewState((prev) => ({
      ...prev,
      mostrarCheckoutPublicacion: false,
    }));
  }, []);

  const previewDisplayUrl = useMemo(
    () =>
      buildPreviewDisplayUrl({
        isTemplateEditorSession: editorSession?.kind === "template",
        urlPublicadaReciente: previewState.urlPublicadaReciente,
        urlPublicaVistaPrevia: previewState.urlPublicaVistaPrevia,
        slugPublicoVistaPrevia: previewState.slugPublicoVistaPrevia,
        slugInvitacion,
      }),
    [
      editorSession?.kind,
      previewState.slugPublicoVistaPrevia,
      previewState.urlPublicaVistaPrevia,
      previewState.urlPublicadaReciente,
      slugInvitacion,
    ]
  );

  return {
    ...previewState,
    previewDisplayUrl,
    ensureDraftFlushBeforeCriticalAction,
    refreshPublishValidation,
    generarVistaPrevia,
    publicarDesdeVistaPrevia,
    handleCheckoutPublished,
    closePreview,
    closeCheckout,
  };
}

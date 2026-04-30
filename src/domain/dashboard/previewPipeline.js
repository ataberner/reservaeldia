import {
  buildDashboardPreviewGeneratorInput,
  buildDashboardPreviewRenderPayload,
  generateDashboardPreviewHtmlFromRenderState,
  isPublicacionActiva,
  overlayLiveEditorSnapshot,
  PREVIEW_AUTHORITY,
} from "./previewSession.js";
import { resolvePublicationLinkForDraftRead } from "../invitations/readResolution.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function resolveTemplateEditorDocument(result) {
  const editorDocument = result?.editorDocument;
  return editorDocument && typeof editorDocument === "object"
    ? editorDocument
    : null;
}

function resolveDraftDocumentData(result) {
  if (!result) return null;

  if (typeof result.exists === "function") {
    if (!result.exists()) return null;
    return result.data && typeof result.data === "function"
      ? asRecord(result.data())
      : {};
  }

  if (result.exists === false) {
    return null;
  }

  if (result.data && typeof result.data === "function") {
    return asRecord(result.data());
  }

  if (result.data && typeof result.data === "object") {
    return asRecord(result.data);
  }

  return result && typeof result === "object" ? result : null;
}

function assertCurrentSession(assertCurrentSessionCallback) {
  if (typeof assertCurrentSessionCallback !== "function") return;
  assertCurrentSessionCallback();
}

export function buildDashboardPreviewDebugSummary({
  previewPayload,
  viewportWidth,
  viewportHeight,
  devicePixelRatio,
  userAgent,
} = {}) {
  const safePreviewPayload =
    previewPayload && typeof previewPayload === "object" ? previewPayload : {};
  const objetos = Array.isArray(safePreviewPayload.objetos)
    ? safePreviewPayload.objetos
    : [];
  const resumen = {};

  objetos.forEach((objeto) => {
    const sec = String(objeto?.seccionId || "sin-seccion");
    if (!resumen[sec]) resumen[sec] = { total: 0, tipos: {} };
    resumen[sec].total += 1;
    const tipo = String(objeto?.tipo || "sin-tipo");
    resumen[sec].tipos[tipo] = (resumen[sec].tipos[tipo] || 0) + 1;
  });

  const safeViewportWidth = Number(viewportWidth) || 0;
  const safeViewportHeight = Number(viewportHeight) || 0;
  const safeDevicePixelRatio = Number(devicePixelRatio) || 1;
  const safeUserAgent = normalizeText(userAgent);
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(safeUserAgent);
  const mobileViewport = safeViewportWidth <= 767;
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
    `viewport=${safeViewportWidth}x${safeViewportHeight} dpr=${safeDevicePixelRatio.toFixed(
      2
    )} ` +
    `mobileViewport=${mobileViewport} desktopMobilePreview=${desktopMobilePreview} mobileUA=${safeUserAgent}\n` +
    `secciones=${Object.keys(resumen).length} objetos=${objetos.length}`;

  return `${header}\n${filas.join("\n")}`;
}

export async function runDashboardPreviewPipeline({
  slugInvitacion,
  isTemplateSession = false,
  canUsePublishCompatibility = false,
  previewBoundarySnapshot = null,
  readTemplateEditorDocument,
  readDraftDocument,
  readLiveEditorSnapshot,
  readPublicationBySlug,
  queryPublicationBySlugOriginal,
  generateHtmlFromSections,
  prepareDraftPreviewRender,
  onBeforeGenerateHtml,
  assertCurrentSession: assertCurrentSessionCallback,
} = {}) {
  let data = null;
  const localPreviewAuthority = isTemplateSession
    ? PREVIEW_AUTHORITY.TEMPLATE_VISUAL
    : PREVIEW_AUTHORITY.LOCAL_FALLBACK;

  if (isTemplateSession) {
    const result =
      typeof readTemplateEditorDocument === "function"
        ? await readTemplateEditorDocument({
            templateId: slugInvitacion,
          })
        : null;
    assertCurrentSession(assertCurrentSessionCallback);

    data = resolveTemplateEditorDocument(result);
    if (!data) {
      return {
        status: "missing-template",
        previewAuthority: PREVIEW_AUTHORITY.TEMPLATE_VISUAL,
      };
    }
  } else {
    const result =
      typeof readDraftDocument === "function"
        ? await readDraftDocument({
            draftSlug: slugInvitacion,
          })
        : null;
    assertCurrentSession(assertCurrentSessionCallback);

    data = resolveDraftDocumentData(result);
    if (!data) {
      return {
        status: "missing-draft",
        previewAuthority: PREVIEW_AUTHORITY.LOCAL_FALLBACK,
      };
    }
  }

  const liveEditorSnapshot =
    previewBoundarySnapshot ||
    (typeof readLiveEditorSnapshot === "function"
      ? readLiveEditorSnapshot()
      : null);
  const previewSourceData = overlayLiveEditorSnapshot(data, liveEditorSnapshot);

  let urlPublicaDetectada = "";
  let slugPublicoDetectado = "";
  let publicacionNoVigenteDetectada = false;

  if (canUsePublishCompatibility) {
    const publicationRead = await resolvePublicationLinkForDraftRead({
      draftSlug: slugInvitacion,
      draftData: previewSourceData,
      readPublicationBySlug: async (publicSlug) =>
        (typeof readPublicationBySlug === "function"
          ? readPublicationBySlug(publicSlug)
          : null),
      queryPublicationBySlugOriginal: async (draftSlug) =>
        (typeof queryPublicationBySlugOriginal === "function"
          ? queryPublicationBySlugOriginal(draftSlug)
          : null),
      isPublicationReadable: (publicationData) =>
        isPublicacionActiva(publicationData),
    });
    assertCurrentSession(assertCurrentSessionCallback);

    slugPublicoDetectado = normalizeText(publicationRead?.publicSlug);
    urlPublicaDetectada = normalizeText(publicationRead?.publicUrl);
    publicacionNoVigenteDetectada = publicationRead?.matchedInactive === true;
  }

  if (
    !isTemplateSession &&
    canUsePublishCompatibility &&
    typeof prepareDraftPreviewRender === "function"
  ) {
    const { slugPreview } = buildDashboardPreviewGeneratorInput({
      slugPublicoDetectado,
      urlPublicaDetectada,
      slugInvitacion,
    });
    const preparedPreviewResult = await prepareDraftPreviewRender({
      draftSlug: slugInvitacion,
      slugPreview,
    });
    assertCurrentSession(assertCurrentSessionCallback);

    const validation = preparedPreviewResult?.validation || null;
    const previewAuthority = PREVIEW_AUTHORITY.DRAFT_AUTHORITATIVE;
    const previewPayload =
      preparedPreviewResult?.previewPayload &&
      typeof preparedPreviewResult.previewPayload === "object"
        ? preparedPreviewResult.previewPayload
        : buildDashboardPreviewRenderPayload(previewSourceData);

    if (typeof onBeforeGenerateHtml === "function") {
      onBeforeGenerateHtml({
        previewPayload,
      });
    }

    if (preparedPreviewResult?.blocked === true || validation?.canPublish === false) {
      return {
        status: "blocked",
        previewAuthority,
        previewPayload,
        htmlGenerado: "",
        validation,
        blockingMessage: validation?.summary?.blockingMessage || "",
        urlPublicaDetectada,
        slugPublicoDetectado,
        publicacionNoVigenteDetectada,
      };
    }

    const htmlGenerado = String(preparedPreviewResult?.htmlGenerado || "");
    if (!htmlGenerado) {
      throw new Error("No se pudo generar la vista previa preparada.");
    }

    return {
      status: "success",
      previewAuthority,
      previewPayload,
      htmlGenerado,
      validation,
      urlPublicaDetectada,
      slugPublicoDetectado,
      publicacionNoVigenteDetectada,
    };
  }

  const previewPayload = buildDashboardPreviewRenderPayload(previewSourceData);

  if (typeof onBeforeGenerateHtml === "function") {
    onBeforeGenerateHtml({
      previewPayload,
    });
  }

  const { htmlGenerado } = await generateDashboardPreviewHtmlFromRenderState({
    previewPayload,
    slugPublicoDetectado,
    urlPublicaDetectada,
    slugInvitacion,
    generateHtmlFromSections,
  });
  assertCurrentSession(assertCurrentSessionCallback);

  return {
    status: "success",
    previewAuthority: localPreviewAuthority,
    previewPayload,
    htmlGenerado,
    urlPublicaDetectada,
    slugPublicoDetectado,
    publicacionNoVigenteDetectada,
  };
}

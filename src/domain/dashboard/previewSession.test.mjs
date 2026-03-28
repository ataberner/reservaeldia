import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardPreviewCloseCheckoutStatePatch,
  buildDashboardPreviewCloseState,
  buildDashboardPreviewCheckoutClosedErrorStatePatch,
  buildDashboardPreviewCheckoutPublishedStatePatch,
  buildDashboardPreviewCheckoutReadyStatePatch,
  buildDashboardPreviewOpenFlushFailureStatePatch,
  buildDashboardPreviewOpenedState,
  buildDashboardPreviewPublishValidationIdleStatePatch,
  buildDashboardPreviewPublishValidationPendingStatePatch,
  buildDashboardPreviewPublishValidationResolvedStatePatch,
  buildDashboardPreviewPublishValidationSettledStatePatch,
  buildDashboardPreviewRenderPayload,
  buildDashboardPreviewGeneratorInput,
  buildDashboardPreviewSuccessStatePatch,
  buildPreviewDisplayUrl,
  createPublicationPreviewState,
  overlayLiveEditorSnapshot,
  prepareDashboardPreviewRenderState,
  PREVIEW_INACTIVE_PUBLICATION_MESSAGE,
} from "./previewSession.js";

test("preview state factory preserves current dashboard modal defaults", () => {
  assert.deepEqual(createPublicationPreviewState({ mostrarVistaPrevia: true }), {
    mostrarVistaPrevia: true,
    htmlVistaPrevia: null,
    urlPublicaVistaPrevia: null,
    slugPublicoVistaPrevia: null,
    puedeActualizarPublicacion: false,
    publicacionVistaPreviaError: "",
    publicacionVistaPreviaOk: "",
    publishValidationResult: null,
    publishValidationPending: false,
    urlPublicadaReciente: null,
    mostrarCheckoutPublicacion: false,
    operacionCheckoutPublicacion: "new",
  });
});

test("preview opened state preserves the current preview-open reset semantics", () => {
  assert.deepEqual(
    buildDashboardPreviewOpenedState(),
    createPublicationPreviewState({
      mostrarVistaPrevia: true,
    })
  );
});

test("preview close state preserves the current full reset semantics", () => {
  assert.deepEqual(buildDashboardPreviewCloseState(), createPublicationPreviewState());
  assert.deepEqual(buildDashboardPreviewCloseState(), {
    mostrarVistaPrevia: false,
    htmlVistaPrevia: null,
    urlPublicaVistaPrevia: null,
    slugPublicoVistaPrevia: null,
    puedeActualizarPublicacion: false,
    publicacionVistaPreviaError: "",
    publicacionVistaPreviaOk: "",
    publishValidationResult: null,
    publishValidationPending: false,
    urlPublicadaReciente: null,
    mostrarCheckoutPublicacion: false,
    operacionCheckoutPublicacion: "new",
  });
});

test("preview close-checkout patch only hides the checkout modal", () => {
  assert.deepEqual(buildDashboardPreviewCloseCheckoutStatePatch(), {
    mostrarCheckoutPublicacion: false,
  });
});

test("preview open flush-failure patch preserves the current preview-closed error semantics", () => {
  assert.deepEqual(
    buildDashboardPreviewOpenFlushFailureStatePatch({
      errorMessage: "flush-error",
    }),
    {
      publicacionVistaPreviaError: "flush-error",
      mostrarVistaPrevia: false,
    }
  );
  assert.deepEqual(buildDashboardPreviewOpenFlushFailureStatePatch(), {
    publicacionVistaPreviaError: "",
    mostrarVistaPrevia: false,
  });
});

test("checkout closed error patch preserves the current checkout-hidden error semantics", () => {
  assert.deepEqual(
    buildDashboardPreviewCheckoutClosedErrorStatePatch({
      errorMessage: "validation-error",
    }),
    {
      publicacionVistaPreviaError: "validation-error",
      publicacionVistaPreviaOk: "",
      mostrarCheckoutPublicacion: false,
    }
  );
  assert.deepEqual(buildDashboardPreviewCheckoutClosedErrorStatePatch(), {
    publicacionVistaPreviaError: "",
    publicacionVistaPreviaOk: "",
    mostrarCheckoutPublicacion: false,
  });
});

test("checkout ready patch preserves the current new vs update semantics", () => {
  assert.deepEqual(
    buildDashboardPreviewCheckoutReadyStatePatch({
      canUpdatePublication: false,
    }),
    {
      publicacionVistaPreviaError: "",
      publicacionVistaPreviaOk: "",
      operacionCheckoutPublicacion: "new",
      mostrarCheckoutPublicacion: true,
    }
  );
  assert.deepEqual(
    buildDashboardPreviewCheckoutReadyStatePatch({
      canUpdatePublication: true,
    }),
    {
      publicacionVistaPreviaError: "",
      publicacionVistaPreviaOk: "",
      operacionCheckoutPublicacion: "update",
      mostrarCheckoutPublicacion: true,
    }
  );
});

test("publish validation idle patch clears the current validation state", () => {
  assert.deepEqual(buildDashboardPreviewPublishValidationIdleStatePatch(), {
    publishValidationResult: null,
    publishValidationPending: false,
  });
});

test("publish validation pending patch preserves the current pending semantics", () => {
  assert.deepEqual(buildDashboardPreviewPublishValidationPendingStatePatch(), {
    publishValidationPending: true,
  });
});

test("publish validation resolved patch preserves the current validation result semantics", () => {
  const validationResult = {
    blockers: [],
    summary: {
      blockingMessage: "",
    },
  };

  assert.deepEqual(
    buildDashboardPreviewPublishValidationResolvedStatePatch({
      validationResult,
    }),
    {
      publishValidationResult: validationResult,
    }
  );
  assert.deepEqual(
    buildDashboardPreviewPublishValidationResolvedStatePatch({
      validationResult: null,
    }),
    {
      publishValidationResult: null,
    }
  );
});

test("publish validation settled patch preserves the current pending reset semantics", () => {
  assert.deepEqual(buildDashboardPreviewPublishValidationSettledStatePatch(), {
    publishValidationPending: false,
  });
});

test("live editor snapshots override persisted preview reads without dropping unrelated fields", () => {
  const merged = overlayLiveEditorSnapshot(
    {
      nombre: "Borrador",
      portada: "cover.jpg",
      objetos: [{ id: "persisted" }],
      secciones: [{ id: "persisted-section" }],
    },
    {
      objetos: [{ id: "live" }],
      secciones: [{ id: "live-section" }],
      rsvp: { enabled: true },
      gifts: { enabled: false },
    }
  );

  assert.deepEqual(merged, {
    nombre: "Borrador",
    portada: "cover.jpg",
    objetos: [{ id: "live" }],
    secciones: [{ id: "live-section" }],
    rsvp: { enabled: true },
    gifts: { enabled: false },
  });
});

test("preview render preparation keeps client-side asset normalization explicit", () => {
  const prepared = prepareDashboardPreviewRenderState({
    objetos: [
      {
        id: "img-1",
        tipo: "imagen",
        seccionId: "sec-1",
        url: "https://cdn.example.com/photo.jpg",
      },
      {
        id: "gallery-1",
        tipo: "galeria",
        seccionId: "sec-1",
        cells: [
          { url: "https://cdn.example.com/gallery-a.jpg" },
          { src: "https://cdn.example.com/gallery-b.jpg" },
        ],
      },
    ],
    secciones: [
      {
        id: "sec-1",
        orden: 1,
        fondoImagen: "https://cdn.example.com/background.jpg",
        decoracionesFondo: {
          superior: {
            url: "https://cdn.example.com/decor-top.png",
          },
          inferior: {
            src: "https://cdn.example.com/decor-bottom.png",
          },
        },
      },
    ],
    rsvp: {
      enabled: true,
      title: "Confirmacion",
    },
    gifts: {
      enabled: true,
      title: "Mesa de regalos",
    },
  });

  assert.equal(prepared.renderState.objetos[0].src, "https://cdn.example.com/photo.jpg");
  assert.equal(
    prepared.renderState.objetos[1].cells[0].mediaUrl,
    "https://cdn.example.com/gallery-a.jpg"
  );
  assert.equal(
    prepared.renderState.objetos[1].cells[1].mediaUrl,
    "https://cdn.example.com/gallery-b.jpg"
  );
  assert.equal(
    prepared.renderState.secciones[0].decoracionesFondo.superior.src,
    "https://cdn.example.com/decor-top.png"
  );
  assert.equal(
    prepared.renderState.secciones[0].decoracionesFondo.inferior.src,
    "https://cdn.example.com/decor-bottom.png"
  );
  assert.equal(prepared.rawRsvp.title, "Confirmacion");
  assert.equal(prepared.rawGifts.title, "Mesa de regalos");
});

test("preview render payload normalizes current draft render contracts for preview generation", () => {
  const payload = buildDashboardPreviewRenderPayload({
    objetos: [
      {
        id: "img-1",
        tipo: "imagen",
        seccionId: "sec-1",
        url: "https://cdn.example.com/photo.jpg",
      },
    ],
    secciones: [
      {
        id: "sec-1",
        orden: 1,
        decoracionesFondo: {
          superior: {
            url: "https://cdn.example.com/decor-top.png",
          },
        },
      },
    ],
    rsvp: {
      enabled: true,
      title: "Confirmacion",
      buttonText: "Confirmar",
    },
    gifts: {
      enabled: true,
      title: "Mesa de regalos",
    },
  });

  assert.equal(payload.objetos.length, 1);
  assert.equal(payload.secciones.length, 1);
  assert.equal(payload.renderState.objetos[0].src, "https://cdn.example.com/photo.jpg");
  assert.equal(
    payload.renderState.secciones[0].decoracionesFondo.superior.src,
    "https://cdn.example.com/decor-top.png"
  );
  assert.equal(payload.rawRsvp.title, "Confirmacion");
  assert.equal(payload.rawGifts.title, "Mesa de regalos");
  assert.equal(payload.rsvpPreviewConfig.enabled, true);
  assert.equal(payload.giftPreviewConfig.enabled, true);
});

test("preview render payload keeps normalized RSVP and gifts configs explicit for parity checks", () => {
  const payload = buildDashboardPreviewRenderPayload({
    objetos: [],
    secciones: [],
    rsvp: {
      enabled: false,
      presetId: "minimal",
      title: " Confirmacion RSVP ",
      subtitle: " Contanos si vienes ",
      buttonText: " Enviar respuesta ",
      primaryColor: "#1f6f78",
      sheetUrl: " https://example.com/rsvp-sheet ",
    },
    gifts: {
      enabled: true,
      introText: " Si desean regalarnos algo, aqui dejamos los datos. ",
      bank: {
        alias: " pareja.regalo ",
        cbu: "0001234500001234500012",
      },
      visibility: {
        alias: true,
        cbu: true,
        giftListLink: true,
      },
      giftListUrl: " lista.example.com/regalos ",
    },
  });

  assert.deepEqual(payload.rsvpPreviewConfig.modal, {
    title: "Confirmacion RSVP",
    subtitle: "Contanos si vienes",
    submitLabel: "Enviar respuesta",
    primaryColor: "#1f6f78",
  });
  assert.equal(payload.rsvpPreviewConfig.enabled, false);
  assert.equal(payload.rsvpPreviewConfig.sheetUrl, "https://example.com/rsvp-sheet");
  assert.equal(payload.giftPreviewConfig.enabled, true);
  assert.equal(
    payload.giftPreviewConfig.introText,
    "Si desean regalarnos algo, aqui dejamos los datos."
  );
  assert.equal(payload.giftPreviewConfig.bank.alias, "pareja.regalo");
  assert.equal(payload.giftPreviewConfig.visibility.giftListLink, true);
  assert.equal(
    payload.giftPreviewConfig.giftListUrl,
    "https://lista.example.com/regalos"
  );
});

test("preview display URL favors published URLs and keeps template sessions blank", () => {
  assert.equal(
    buildPreviewDisplayUrl({
      urlPublicadaReciente: "https://reservaeldia.com.ar/i/publico-ok",
      slugInvitacion: "draft-1",
    }),
    "https://reservaeldia.com.ar/i/publico-ok"
  );
  assert.equal(
    buildPreviewDisplayUrl({
      slugPublicoVistaPrevia: "Mi Slug Publico",
      slugInvitacion: "draft-1",
    }),
    "https://reservaeldia.com.ar/i/mi-slug-publico"
  );
  assert.equal(
    buildPreviewDisplayUrl({
      isTemplateEditorSession: true,
      slugInvitacion: "draft-1",
    }),
    ""
  );
});

test("preview generator input prefers the normalized public slug and falls back to the draft slug", () => {
  const explicitPublic = buildDashboardPreviewGeneratorInput({
    previewPayload: {
      giftPreviewConfig: { enabled: true },
      rawRsvp: { enabled: true },
      rawGifts: { enabled: false },
    },
    slugPublicoDetectado: "Mi Slug Publico",
    slugInvitacion: "draft-1",
  });
  const fallbackDraft = buildDashboardPreviewGeneratorInput({
    previewPayload: {
      giftPreviewConfig: null,
      rawRsvp: null,
      rawGifts: null,
    },
    slugInvitacion: "draft-1",
  });

  assert.equal(explicitPublic.slugPreview, "mi-slug-publico");
  assert.deepEqual(explicitPublic.generatorOptions, {
    slug: "mi-slug-publico",
    isPreview: true,
    gifts: { enabled: true },
    rsvpSource: { enabled: true },
    giftsSource: { enabled: false },
  });
  assert.equal(fallbackDraft.slugPreview, "draft-1");
});

test("preview success patch preserves current publication warning copy and update capability", () => {
  const inactivePatch = buildDashboardPreviewSuccessStatePatch({
    htmlGenerado: "<html><body>preview</body></html>",
    publicacionNoVigenteDetectada: true,
  });
  const linkedPatch = buildDashboardPreviewSuccessStatePatch({
    htmlGenerado: "<html><body>preview</body></html>",
    urlPublicaDetectada: "https://reservaeldia.com.ar/i/publico-ok",
    slugPublicoDetectado: "Publico OK",
    publicacionNoVigenteDetectada: true,
  });

  assert.equal(
    inactivePatch.publicacionVistaPreviaError,
    PREVIEW_INACTIVE_PUBLICATION_MESSAGE
  );
  assert.equal(linkedPatch.slugPublicoVistaPrevia, "publico-ok");
  assert.equal(linkedPatch.puedeActualizarPublicacion, true);
  assert.equal(linkedPatch.publicacionVistaPreviaError, "");
});

test("template preview success patch never enables publish compatibility fields", () => {
  const patch = buildDashboardPreviewSuccessStatePatch({
    htmlGenerado: "<html><body>template</body></html>",
    isTemplateEditorSession: true,
    urlPublicaDetectada: "https://reservaeldia.com.ar/i/publico-template",
    slugPublicoDetectado: "publico-template",
    publicacionNoVigenteDetectada: true,
    currentError: "persisted-error",
  });

  assert.deepEqual(patch, {
    htmlVistaPrevia: "<html><body>template</body></html>",
    urlPublicaVistaPrevia: null,
    slugPublicoVistaPrevia: null,
    puedeActualizarPublicacion: false,
    publicacionVistaPreviaError: "persisted-error",
  });
});

test("checkout published patch updates current preview publication fields for new publications", () => {
  const patch = buildDashboardPreviewCheckoutPublishedStatePatch({
    payload: {
      publicUrl: "https://reservaeldia.com.ar/i/Publico-OK",
      publicSlug: "Publico OK",
      operation: "new",
      receipt: {
        paymentId: "123",
      },
    },
  });

  assert.deepEqual(patch, {
    urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/Publico-OK",
    urlPublicadaReciente: "https://reservaeldia.com.ar/i/Publico-OK",
    slugPublicoVistaPrevia: "publico-ok",
    puedeActualizarPublicacion: true,
    publicacionVistaPreviaError: "",
    publicacionVistaPreviaOk: "Invitacion publicada correctamente.",
  });
});

test("checkout published patch keeps the current update success copy", () => {
  const patch = buildDashboardPreviewCheckoutPublishedStatePatch({
    payload: {
      publicUrl: "https://reservaeldia.com.ar/i/publico-ok",
      operation: "update",
    },
  });

  assert.equal(
    patch.publicacionVistaPreviaOk,
    "Invitacion actualizada correctamente."
  );
});

test("checkout published patch falls back to the public slug parsed from the public URL", () => {
  const patch = buildDashboardPreviewCheckoutPublishedStatePatch({
    payload: {
      publicUrl: "https://reservaeldia.com.ar/i/mi-slug-publico",
      operation: "new",
    },
  });

  assert.equal(patch.slugPublicoVistaPrevia, "mi-slug-publico");
  assert.equal(patch.puedeActualizarPublicacion, true);
});

test("checkout published patch preserves current preview publication values when the payload has no URL or slug", () => {
  const patch = buildDashboardPreviewCheckoutPublishedStatePatch({
    payload: {
      operation: "new",
    },
    currentPreviewPublicUrl: "https://reservaeldia.com.ar/i/publico-preview",
    currentPublishedUrl: "https://reservaeldia.com.ar/i/publicado-reciente",
    currentPublicSlug: "publico-existente",
  });

  assert.deepEqual(patch, {
    urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/publico-preview",
    urlPublicadaReciente: "https://reservaeldia.com.ar/i/publicado-reciente",
    slugPublicoVistaPrevia: "publico-existente",
    puedeActualizarPublicacion: true,
    publicacionVistaPreviaError: "",
    publicacionVistaPreviaOk: "Invitacion publicada correctamente.",
  });
});

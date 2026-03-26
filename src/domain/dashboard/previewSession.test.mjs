import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardPreviewRenderPayload,
  buildPreviewDisplayUrl,
  createPublicationPreviewState,
  overlayLiveEditorSnapshot,
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

test("preview render payload normalizes current draft render contracts for preview generation", () => {
  const payload = buildDashboardPreviewRenderPayload({
    objetos: [
      {
        id: "txt-1",
        tipo: "texto",
        seccionId: "sec-1",
      },
    ],
    secciones: [
      {
        id: "sec-1",
        orden: 1,
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
  assert.equal(payload.rawRsvp.title, "Confirmacion");
  assert.equal(payload.rawGifts.title, "Mesa de regalos");
  assert.equal(payload.rsvpPreviewConfig.enabled, true);
  assert.equal(payload.giftPreviewConfig.enabled, true);
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

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLoadedEditorRenderState,
  buildPersistableRenderState,
} from "./borradorSyncRenderState.js";

test("loaded render state preserves decoration payload shaping and pantalla hydration", () => {
  const result = buildLoadedEditorRenderState({
    objetos: [
      {
        id: "countdown-1",
        tipo: "countdown",
        seccionId: "pantalla-section",
        y: 125,
      },
      {
        id: "text-1",
        tipo: "texto",
        seccionId: "fixed-section",
        y: 30,
        yNorm: 0.8,
      },
    ],
    secciones: [
      {
        id: "pantalla-section",
        orden: 0,
        altura: 500,
        altoModo: "pantalla",
        decoracionesFondo: {
          superior: {
            src: "https://cdn.example.com/decor.png",
            x: 5,
            y: 10,
            width: 40,
            height: 50,
          },
        },
        decoracionesBorde: {
          top: {
            url: "https://cdn.example.com/edge-top.png",
            nombre: "Flor superior",
          },
        },
      },
      {
        id: "fixed-section",
        orden: 1,
        altura: 300,
        altoModo: "fijo",
      },
    ],
    ALTURA_PANTALLA_EDITOR: 500,
  });

  assert.equal(result.objetos[0].y, 125);
  assert.equal(result.objetos[0].yNorm, 0.25);
  assert.equal("yNorm" in result.objetos[1], false);
  assert.deepEqual(result.secciones[0].decoracionesFondo, {
    items: [
      {
        id: "legacy-superior",
        decorId: null,
        src: "https://cdn.example.com/decor.png",
        storagePath: null,
        nombre: "Decoracion",
        x: 5,
        y: 10,
        width: 40,
        height: 50,
        rotation: 0,
        orden: 0,
      },
    ],
    parallax: "none",
  });
  assert.deepEqual(result.secciones[0].decoracionesBorde, {
    top: {
      enabled: true,
      src: "https://cdn.example.com/edge-top.png",
      storagePath: null,
      decorId: null,
      nombre: "Flor superior",
      heightModel: "intrinsic-clamp",
      intrinsicWidth: null,
      intrinsicHeight: null,
      minHeightDesktopPx: 96,
      maxHeightDesktopPx: 280,
      maxSectionRatioDesktop: 0.3,
      minHeightMobilePx: 64,
      maxHeightMobilePx: 150,
      maxSectionRatioMobile: 0.24,
      heightDesktopRatio: 0.36,
      heightMobileRatio: 0.2,
      offsetDesktopPx: 0,
      offsetMobilePx: 0,
      mode: "cover-x",
    },
    layout: {
      maxCombinedSectionRatioDesktop: 0.58,
      maxCombinedSectionRatioMobile: 0.4,
    },
  });
});

test("persistable render state preserves the current normalization bundle", () => {
  const lineCalls = [];
  const result = buildPersistableRenderState({
    objetos: [
      {
        id: "countdown-1",
        tipo: "countdown",
        seccionId: "pantalla-section",
        width: 100,
        height: 50,
        scaleX: 2,
        scaleY: 3,
        y: 125,
      },
      {
        id: "line-1",
        tipo: "forma",
        figura: "line",
        seccionId: "fixed-section",
        points: [0, 0, 10, 10],
      },
      {
        id: "text-1",
        tipo: "texto",
        seccionId: "fixed-section",
        y: 30,
        yNorm: 0.8,
        colorTexto: "#123456",
        custom: {
          keep: 1,
          skip: undefined,
        },
        omit: undefined,
      },
    ],
    secciones: [
      {
        id: "pantalla-section",
        orden: 0,
        altura: 500,
        altoModo: "pantalla",
        decoracionesFondo: {
          items: [
            {
              id: "decor-1",
              src: "https://cdn.example.com/decor.png",
              x: 10,
              y: 15,
              width: 40,
              height: 50,
              rotation: 0,
            },
          ],
        },
        decoracionesBorde: {
          bottom: {
            enabled: false,
            src: "https://cdn.example.com/edge-bottom.png",
            storagePath: "borradores/edge-bottom.png",
            heightDesktopRatio: 0.9,
            heightMobileRatio: 0.02,
            offsetDesktopPx: 999,
            offsetMobilePx: -999,
            mode: "contain-x",
          },
        },
        transient: undefined,
      },
      {
        id: "fixed-section",
        orden: 1,
        altura: 300,
        altoModo: "fijo",
      },
    ],
    rsvp: {
      enabled: false,
      modal: {
        title: " Invitados ",
      },
    },
    gifts: {
      enabled: false,
      bank: {
        alias: " alias-regalos ",
      },
      visibility: {
        alias: true,
      },
    },
    validarPuntosLinea: (obj) => {
      lineCalls.push(obj.id);
      return {
        ...obj,
        validated: true,
      };
    },
    ALTURA_PANTALLA_EDITOR: 500,
  });

  assert.deepEqual(lineCalls, ["line-1"]);
  assert.deepEqual(result.objetos[0], {
    id: "countdown-1",
    tipo: "countdown",
    seccionId: "pantalla-section",
    width: 200,
    height: 150,
    scaleX: 1,
    scaleY: 1,
    y: 125,
    yNorm: 0.25,
  });
  assert.equal(result.countdownForAudit.scaleX, 1);
  assert.equal(result.countdownForAudit.scaleY, 1);
  assert.equal("yNorm" in result.countdownForAudit, false);
  assert.equal(result.objetos[1].validated, true);
  assert.deepEqual(result.objetos[2], {
    id: "text-1",
    tipo: "texto",
    seccionId: "fixed-section",
    y: 30,
    colorTexto: "#123456",
    color: "#123456",
    stroke: null,
    strokeWidth: 0,
    shadowColor: null,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    custom: {
      keep: 1,
    },
  });
  assert.equal(result.secciones[0].decoracionesFondo.items.length, 1);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.enabled, false);
  assert.equal(
    result.secciones[0].decoracionesBorde.bottom.src,
    "https://cdn.example.com/edge-bottom.png"
  );
  assert.equal(result.secciones[0].decoracionesBorde.bottom.heightDesktopRatio, 0.55);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.heightMobileRatio, 0.08);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.heightModel, "intrinsic-clamp");
  assert.equal(result.secciones[0].decoracionesBorde.bottom.minHeightDesktopPx, 96);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.maxHeightDesktopPx, 280);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.maxSectionRatioDesktop, 0.55);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.minHeightMobilePx, 64);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.maxHeightMobilePx, 150);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.maxSectionRatioMobile, 0.08);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.offsetDesktopPx, 240);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.offsetMobilePx, -240);
  assert.equal(result.secciones[0].decoracionesBorde.bottom.mode, "contain-x");
  assert.equal("transient" in result.secciones[0], false);
  assert.equal(result.rsvp.enabled, false);
  assert.equal(result.rsvp.modal.title, "Invitados");
  assert.equal(result.gifts.enabled, false);
  assert.equal(result.gifts.bank.alias, "alias-regalos");
});

test("persistable render state normalizes grouped children without reintroducing root-only fields", () => {
  const result = buildPersistableRenderState({
    objetos: [
      {
        id: "group-1",
        tipo: "grupo",
        seccionId: "pantalla-section",
        x: 100,
        y: 120,
        yNorm: 0.24,
        width: 240,
        height: 140,
        children: [
          {
            id: "child-text",
            tipo: "texto",
            x: 10,
            y: 20,
            seccionId: "pantalla-section",
            anclaje: "content",
            yNorm: 0.3,
            colorTexto: "#654321",
          },
          {
            id: "child-line",
            tipo: "forma",
            figura: "line",
            x: 20,
            y: 80,
            points: [0, 0, 20, 20],
          },
        ],
      },
    ],
    secciones: [
      {
        id: "pantalla-section",
        orden: 0,
        altura: 500,
        altoModo: "pantalla",
      },
    ],
    validarPuntosLinea: (obj) => ({
      ...obj,
      validated: true,
    }),
    ALTURA_PANTALLA_EDITOR: 500,
  });

  assert.equal(result.objetos[0].yNorm, 0.24);
  assert.equal(result.objetos[0].children[0].color, "#654321");
  assert.equal("seccionId" in result.objetos[0].children[0], false);
  assert.equal("anclaje" in result.objetos[0].children[0], false);
  assert.equal("yNorm" in result.objetos[0].children[0], false);
  assert.equal(result.objetos[0].children[1].validated, true);
});

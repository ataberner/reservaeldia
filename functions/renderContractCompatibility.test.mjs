import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRepresentativeCompatibilityWarningDraftFixture,
  createRepresentativePublishReadyDraftFixture,
} from "../shared/publicationPublishValidationFixtures.mjs";
import {
  createRepresentativePreviewPreparationStageState,
} from "../shared/renderAssetContractFixtures.mjs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function requireBuiltModule(relativePath) {
  const absolutePath = join(__dirname, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing built module '${relativePath}'. Run 'npm run build' inside functions before running this test.`
    );
  }
  return require(absolutePath);
}

const { generarHTMLDesdeObjetos } = requireBuiltModule("lib/utils/generarHTMLDesdeObjetos.js");
const { generarHTMLDesdeSecciones } = requireBuiltModule("lib/utils/generarHTMLDesdeSecciones.js");
const { resolveFunctionalCtaContract } = requireBuiltModule(
  "lib/utils/functionalCtaContract.js"
);

const FIXED_SECTION = [{ id: "section-1", orden: 1, altoModo: "fijo", altura: 600 }];
const CTA_SECTION = [{ id: "section-details", orden: 1, altoModo: "fijo", altura: 600 }];
const PANTALLA_SECTION = [{ id: "section-hero", orden: 1, altoModo: "pantalla", altura: 600 }];

function createPreservedTextDecorationGroup(overrides = {}) {
  return {
    id: "hero-copy-group",
    tipo: "grupo",
    seccionId: "section-hero",
    anclaje: "content",
    x: 118,
    y: 212,
    yNorm: 0.424,
    width: 360,
    height: 132,
    children: [
      {
        id: "hero-copy-star",
        tipo: "forma",
        figura: "star",
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        color: "#f0d36a",
      },
      {
        id: "hero-copy",
        tipo: "texto",
        x: 56,
        y: 42,
        width: 240,
        texto: "Celebremos juntos",
        fontSize: 30,
        fontFamily: "Cormorant Garamond",
        colorTexto: "#2f2a27",
      },
    ],
    ...deepClone(overrides),
  };
}

function createPreservedTextIconGroup(overrides = {}) {
  return {
    id: "ornament-title-group",
    tipo: "grupo",
    seccionId: "section-1",
    anclaje: "content",
    x: 72,
    y: 96,
    width: 280,
    height: 92,
    children: [
      {
        id: "ornament-icon",
        tipo: "icono-svg",
        x: 0,
        y: 12,
        width: 48,
        height: 48,
        color: "#111111",
        d: "M0 0 L10 10",
      },
      {
        id: "ornament-title",
        tipo: "texto",
        x: 64,
        y: 10,
        width: 200,
        texto: "Con musica en vivo",
        fontSize: 26,
        colorTexto: "#2f2a27",
      },
    ],
    ...deepClone(overrides),
  };
}

function createPreservedImageCaptionGroup(overrides = {}) {
  return {
    id: "photo-caption-group",
    tipo: "grupo",
    seccionId: "section-1",
    anclaje: "content",
    x: 64,
    y: 220,
    width: 260,
    height: 220,
    children: [
      {
        id: "photo-caption-image",
        tipo: "imagen",
        x: 0,
        y: 0,
        width: 220,
        height: 140,
        src: "https://cdn.example.com/group-photo.jpg",
      },
      {
        id: "photo-caption-text",
        tipo: "texto",
        x: 12,
        y: 156,
        width: 220,
        texto: "Ceremonia al aire libre",
        fontSize: 22,
        colorTexto: "#2f2a27",
      },
    ],
    ...deepClone(overrides),
  };
}

function createPreservedCountdownGalleryGroup(overrides = {}) {
  return {
    id: "countdown-gallery-group",
    tipo: "grupo",
    seccionId: "section-1",
    anclaje: "content",
    x: 72,
    y: 160,
    width: 340,
    height: 240,
    children: [
      {
        id: "countdown-child",
        tipo: "countdown",
        x: 0,
        y: 0,
        width: 240,
        height: 96,
        countdownSchemaVersion: 2,
        fechaObjetivo: "2026-05-10T20:00:00.000Z",
        frameSvgUrl: "https://cdn.example.com/frame.svg",
        visibleUnits: ["days", "hours", "minutes", "seconds"],
      },
      {
        id: "gallery-child",
        tipo: "galeria",
        x: 28,
        y: 112,
        width: 240,
        height: 128,
        rows: 1,
        cols: 2,
        gap: 8,
        cells: [
          { mediaUrl: "https://cdn.example.com/gallery-1.jpg", fit: "cover" },
          { mediaUrl: "https://cdn.example.com/gallery-2.jpg", fit: "cover" },
        ],
      },
    ],
    ...deepClone(overrides),
  };
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  Object.entries(value).forEach(([key, nestedValue]) => {
    next[key] = deepClone(nestedValue);
  });
  return next;
}

function pickAssetFields(source, keys) {
  const next = {};
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) {
      next[key] = deepClone(source[key]);
    }
  });
  return next;
}

function hydratePreviewAssetsIntoDraft(draft) {
  const previewState = createRepresentativePreviewPreparationStageState();
  const previewObjectById = new Map(
    (previewState.objetos || []).map((entry) => [entry?.id, entry])
  );
  const previewSectionById = new Map(
    (previewState.secciones || []).map((entry) => [entry?.id, entry])
  );

  return {
    ...deepClone(draft),
    objetos: (draft?.objetos || []).map((entry) => {
      const previewObject = previewObjectById.get(entry?.id);
      if (!previewObject) return deepClone(entry);

      return {
        ...deepClone(entry),
        ...pickAssetFields(previewObject, [
          "src",
          "url",
          "storagePath",
          "cells",
          "frameSvgUrl",
        ]),
      };
    }),
    secciones: (draft?.secciones || []).map((entry) => {
      const previewSection = previewSectionById.get(entry?.id);
      if (!previewSection) return deepClone(entry);

      return {
        ...deepClone(entry),
        ...pickAssetFields(previewSection, ["fondoImagen", "decoracionesFondo"]),
      };
    }),
  };
}

function renderRepresentativeDraft(draft) {
  const hydrated = hydratePreviewAssetsIntoDraft(draft);
  return generarHTMLDesdeSecciones(hydrated.secciones, hydrated.objetos, hydrated.rsvp, {
    gifts: hydrated.gifts,
  });
}

function extractBetween(html, startToken, endToken) {
  const startIndex = html.indexOf(startToken);
  assert.notEqual(startIndex, -1, `Missing token '${startToken}' in generated HTML`);

  const endIndex = html.indexOf(endToken, startIndex + startToken.length);
  assert.notEqual(endIndex, -1, `Missing token '${endToken}' in generated HTML`);

  return html.slice(startIndex, endIndex);
}

test("generates explicit countdown contract markers for v1 and v2 objects", () => {
  const legacyHtml = generarHTMLDesdeObjetos(
    [
      {
        id: "count-legacy",
        tipo: "countdown",
        seccionId: "section-1",
        fechaISO: "2026-05-10T20:00:00.000Z",
        width: 280,
        height: 96,
        color: "#111111",
      },
    ],
    FIXED_SECTION
  );

  assert.match(legacyHtml, /data-countdown-contract="v1"/);
  assert.match(legacyHtml, /data-countdown-target-source="fechaISO"/);
  assert.doesNotMatch(legacyHtml, /data-countdown-v2="1"/);

  const modernHtml = generarHTMLDesdeObjetos(
    [
      {
        id: "count-modern",
        tipo: "countdown",
        seccionId: "section-1",
        countdownSchemaVersion: 2,
        fechaObjetivo: "2026-05-10T20:00:00.000Z",
        width: 320,
        height: 120,
        frameSvgUrl: "https://cdn.example.com/frame.svg",
        visibleUnits: ["days", "hours", "minutes", "seconds"],
      },
    ],
    FIXED_SECTION
  );

  assert.match(modernHtml, /data-countdown-contract="v2"/);
  assert.match(modernHtml, /data-countdown-v2="1"/);
  assert.match(modernHtml, /data-countdown-target-source="fechaObjetivo"/);
});

test("injects runtime branching based on explicit countdown contracts", () => {
  const html = generarHTMLDesdeSecciones(
    FIXED_SECTION,
    [
      {
        id: "count-legacy",
        tipo: "countdown",
        seccionId: "section-1",
        fechaISO: "2026-05-10T20:00:00.000Z",
        width: 280,
        height: 96,
      },
      {
        id: "count-modern",
        tipo: "countdown",
        seccionId: "section-1",
        countdownSchemaVersion: 2,
        fechaObjetivo: "2026-05-10T20:00:00.000Z",
        width: 320,
        height: 120,
        visibleUnits: ["days", "hours", "minutes", "seconds"],
      },
    ],
    null,
    {}
  );

  assert.match(html, /function resolveCountdownContract\(root\)/);
  assert.match(html, /data-countdown-contract="v1"/);
  assert.match(html, /data-countdown-contract="v2"/);
  assert.match(html, /if \(resolveCountdownContract\(root\) === "v2"\)/);
});

test("renders pill editor shapes in published HTML with rounded geometry", () => {
  const html = generarHTMLDesdeObjetos(
    [
      {
        id: "shape-pill",
        tipo: "forma",
        figura: "pill",
        seccionId: "section-1",
        x: 120,
        y: 80,
        width: 170,
        height: 72,
        cornerRadius: 36,
        color: "#111111",
      },
    ],
    FIXED_SECTION
  );

  assert.match(html, /class="objeto"/);
  assert.match(html, /data-type="shape"/);
  assert.match(html, /width: calc\(var\(--s(?:x|final)\) \* 170px\)/);
  assert.match(html, /height: calc\(var\(--s(?:x|final)\) \* 72px\)/);
  assert.match(html, /background: #111111;/);
  assert.match(html, /border-radius: calc\(var\(--s(?:x|final)\) \* 36px\)/);
});

test("keeps representative fullbleed objects in the bleed lane and content objects in the content lane", () => {
  const html = renderRepresentativeDraft(createRepresentativeCompatibilityWarningDraftFixture());
  const bleedSegment = extractBetween(html, '<div class="sec-bleed">', '<div class="sec-content">');
  const contentSegment = extractBetween(html, '<div class="sec-content">', "</section>");

  assert.match(bleedSegment, /data-obj-id="hero-image"/);
  assert.doesNotMatch(bleedSegment, /data-obj-id="hero-title"/);
  assert.match(contentSegment, /data-obj-id="hero-title"/);
  assert.doesNotMatch(contentSegment, /data-obj-id="hero-image"/);
  assert.match(bleedSegment, /left: calc\(var\(--bx\) \* 24px\);/);
  assert.match(bleedSegment, /width: calc\(var\(--bx\) \* 320px\);/);
  assert.match(bleedSegment, /height: calc\(var\(--sx\) \* 440px\);/);
  assert.match(contentSegment, /left: calc\(var\(--sfinal\) \* 48px\);/);
});

test("renders preserved groups as isolated top-level layout units without exposing child objects to mobile reflow", () => {
  const html = generarHTMLDesdeSecciones(
    PANTALLA_SECTION,
    [createPreservedTextDecorationGroup()],
    null,
    {}
  );
  const bleedSegment = extractBetween(html, '<div class="sec-bleed">', '<div class="sec-content">');
  const contentSegment = extractBetween(html, '<div class="sec-content">', "</section>");
  const starIndex = contentSegment.indexOf('data-group-child-id="hero-copy-star"');
  const textIndex = contentSegment.indexOf('data-group-child-id="hero-copy"');

  assert.doesNotMatch(bleedSegment, /data-obj-id="hero-copy-group"/);
  assert.match(contentSegment, /data-obj-id="hero-copy-group"/);
  assert.match(contentSegment, /data-type="group"/);
  assert.match(contentSegment, /data-mobile-cluster="isolated"/);
  assert.match(contentSegment, /class="group-child-root"/);
  assert.doesNotMatch(contentSegment, /data-obj-id="hero-copy-star"/);
  assert.doesNotMatch(contentSegment, /data-obj-id="hero-copy"/);
  assert.notEqual(starIndex, -1);
  assert.notEqual(textIndex, -1);
  assert.equal(starIndex < textIndex, true);
});

test("keeps grouped text plus icon compositions nested under one authored object id", () => {
  const html = generarHTMLDesdeObjetos(
    [createPreservedTextIconGroup()],
    FIXED_SECTION
  );

  assert.match(html, /data-obj-id="ornament-title-group"/);
  assert.match(html, /data-group-child-id="ornament-icon"/);
  assert.match(html, /data-group-child-id="ornament-title"/);
  assert.doesNotMatch(html, /data-obj-id="ornament-icon"/);
  assert.doesNotMatch(html, /data-obj-id="ornament-title"/);
  assert.match(html, /class="group-child-root"/);
});

test("keeps grouped image plus caption compositions nested under one authored object id", () => {
  const html = generarHTMLDesdeObjetos(
    [createPreservedImageCaptionGroup()],
    FIXED_SECTION
  );

  assert.match(html, /data-obj-id="photo-caption-group"/);
  assert.match(html, /data-group-child-id="photo-caption-image"/);
  assert.match(html, /data-group-child-id="photo-caption-text"/);
  assert.doesNotMatch(html, /data-obj-id="photo-caption-image"/);
  assert.doesNotMatch(html, /data-obj-id="photo-caption-text"/);
  assert.match(html, /<div[^>]+data-group-child-id="photo-caption-image"[\s\S]*class="group-child-root image-object"/);
});

test("keeps grouped countdown and gallery compositions nested under one authored object id", () => {
  const html = generarHTMLDesdeObjetos(
    [createPreservedCountdownGalleryGroup()],
    FIXED_SECTION
  );

  assert.match(html, /data-obj-id="countdown-gallery-group"/);
  assert.match(html, /data-group-child-id="countdown-child"/);
  assert.match(html, /data-group-child-id="gallery-child"/);
  assert.doesNotMatch(html, /data-obj-id="countdown-child"/);
  assert.doesNotMatch(html, /data-obj-id="gallery-child"/);
  assert.match(html, /data-group-child-id="countdown-child"[\s\S]*data-countdown/);
  assert.match(html, /data-group-child-id="gallery-child"[\s\S]*class="group-child-root galeria/);
});

test("keeps pantalla positioning branches stable for yNorm objects and y fallback objects", () => {
  const html = renderRepresentativeDraft(createRepresentativeCompatibilityWarningDraftFixture());

  assert.match(html, /--pantalla-y-compact: 0;/);
  assert.match(html, /sec\.style\.setProperty\("--pantalla-y-base", pantallaYBasePx \+ "px"\);/);
  assert.match(
    html,
    /data-obj-id="hero-image"[\s\S]*calc\(0\.5 \+ \(\(0\.08\) - 0\.5\) \* \(1 - var\(--pantalla-y-compact, 0\)\)\)/
  );
  assert.match(
    html,
    /data-obj-id="hero-title"[\s\S]*calc\(0\.5 \+ \(\(0\.304\) - 0\.5\) \* \(1 - var\(--pantalla-y-compact, 0\)\)\)/
  );
});

test("keeps crop materialization and crop fallback markup distinct", () => {
  const cropReadyHtml = generarHTMLDesdeObjetos(
    [
      {
        id: "img-ready",
        tipo: "imagen",
        seccionId: "section-1",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        ancho: 400,
        alto: 200,
        cropX: 50,
        cropY: 20,
        cropWidth: 200,
        cropHeight: 100,
        src: "https://cdn.example.com/image.jpg",
      },
    ],
    FIXED_SECTION
  );

  const cropFallbackHtml = generarHTMLDesdeObjetos(
    [
      {
        id: "img-fallback",
        tipo: "imagen",
        seccionId: "section-1",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        cropX: 50,
        cropY: 20,
        cropWidth: 200,
        cropHeight: 100,
        src: "https://cdn.example.com/image.jpg",
      },
    ],
    FIXED_SECTION
  );

  assert.match(cropReadyHtml, /left: calc\(-100% \* 50 \/ 200\);/);
  assert.match(cropReadyHtml, /top: calc\(-100% \* 20 \/ 100\);/);
  assert.match(cropReadyHtml, /width: calc\(100% \* 400 \/ 200\);/);
  assert.doesNotMatch(cropReadyHtml, /object-fit: fill;/);
  assert.match(cropFallbackHtml, /object-fit: fill;/);
});

test("keeps CTA button output stable for ready, unavailable, and direct object rendering branches", () => {
  const ctaObjects = [
    {
      id: "rsvp-cta",
      tipo: "rsvp-boton",
      seccionId: "section-details",
      x: 72,
      y: 72,
      width: 240,
      height: 54,
      texto: "Confirmar asistencia",
    },
    {
      id: "gift-cta",
      tipo: "regalo-boton",
      seccionId: "section-details",
      x: 72,
      y: 156,
      width: 240,
      height: 54,
      texto: "Ver regalos",
    },
  ];

  const readyContract = resolveFunctionalCtaContract({
    objetos: ctaObjects,
    rsvpConfig: { enabled: true, presetId: "minimal" },
    giftsConfig: {
      enabled: true,
      bank: {
        holder: "",
        bank: "",
        alias: "alias.regalo",
        cbu: "0001234500001234500012",
        cuit: "",
      },
      visibility: {
        holder: false,
        bank: false,
        alias: true,
        cbu: true,
        cuit: false,
        giftListLink: false,
      },
      giftListUrl: "",
    },
  });
  const unavailableContract = resolveFunctionalCtaContract({
    objetos: ctaObjects,
    giftsConfig: {
      enabled: true,
      bank: {
        holder: "",
        bank: "",
        alias: "",
        cbu: "",
        cuit: "",
      },
      visibility: {
        holder: true,
        bank: false,
        alias: true,
        cbu: false,
        cuit: false,
        giftListLink: false,
      },
      giftListUrl: "",
    },
  });

  const readyHtml = generarHTMLDesdeObjetos(ctaObjects, CTA_SECTION, {
    functionalCtaContract: readyContract,
  });
  const unavailableHtml = generarHTMLDesdeObjetos(ctaObjects, CTA_SECTION, {
    functionalCtaContract: unavailableContract,
  });
  const defaultHtml = generarHTMLDesdeObjetos([ctaObjects[0]], CTA_SECTION);

  assert.match(readyHtml, /id="abrirModalRSVP"/);
  assert.match(readyHtml, /data-cta-state="ready"/);
  assert.match(readyHtml, /data-rsvp-open/);
  assert.match(readyHtml, /data-gift-open/);
  assert.match(unavailableHtml, /data-cta-state="unavailable"/);
  assert.match(unavailableHtml, /data-cta-reason="missing-root"/);
  assert.match(unavailableHtml, /data-cta-reason="no-usable-methods"/);
  assert.match(unavailableHtml, /title="No disponible"/);
  assert.match(defaultHtml, /data-cta-state="ready"/);
  assert.match(defaultHtml, /data-rsvp-open/);
});

test("keeps RSVP modal generation tied to ready root config in representative drafts", () => {
  const readyHtml = renderRepresentativeDraft(createRepresentativePublishReadyDraftFixture());
  const warningHtml = renderRepresentativeDraft(
    createRepresentativeCompatibilityWarningDraftFixture()
  );

  assert.match(readyHtml, /id="modal-rsvp"/);
  assert.match(readyHtml, /publicRsvpSubmit/);
  assert.doesNotMatch(warningHtml, /id="modal-rsvp"/);
  assert.match(warningHtml, /data-cta-state="unavailable"/);
  assert.match(warningHtml, /data-cta-reason="missing-root"/);
});

test("keeps legacy icon svg output markers and path rendering stable", () => {
  const html = generarHTMLDesdeObjetos(
    [
      {
        id: "icon-legacy",
        tipo: "icono-svg",
        seccionId: "section-1",
        width: 96,
        height: 96,
        color: "#111111",
        d: "M0 0 L10 10",
      },
    ],
    FIXED_SECTION
  );

  assert.match(html, /data-render-contract-id="icono_svg_legacy"/);
  assert.match(html, /data-render-contract-status="legacy_frozen_compat"/);
  assert.match(html, /<path d="M0 0 L10 10" \/>/);
  assert.match(html, /fill: #111111;/);
});

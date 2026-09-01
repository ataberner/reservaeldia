import {
  previewPublishSharedParityFixtures,
  previewPublishWarningParityFixtures,
} from "./previewPublishParityFixtures.mjs";

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

function findFixtureById(fixtures, id) {
  const fixture = (Array.isArray(fixtures) ? fixtures : []).find(
    (entry) => entry?.id === id
  );
  if (!fixture) {
    throw new Error(`Preview/publish parity fixture not found: ${id}`);
  }
  return deepClone(fixture);
}

function resequenceSections(secciones) {
  return (Array.isArray(secciones) ? secciones : []).map((section, index) => ({
    ...deepClone(section),
    orden: index + 1,
  }));
}

function selectDraftSlice(draft, { sectionIds = [], objectIds = null } = {}) {
  const next = deepClone(draft);
  const allowedSections = new Set(sectionIds);
  const allowedObjects = Array.isArray(objectIds) ? new Set(objectIds) : null;
  const secciones = resequenceSections(
    (next.secciones || []).filter((section) => allowedSections.has(section?.id))
  );
  const sectionIdSet = new Set(secciones.map((section) => section.id));

  return {
    ...next,
    secciones,
    objetos: (next.objetos || [])
      .filter((object) => {
        if (!sectionIdSet.has(object?.seccionId)) return false;
        if (!allowedObjects) return true;
        return allowedObjects.has(object?.id);
      })
      .map((object) => deepClone(object)),
  };
}

function withoutRootConfigs(draft) {
  const next = deepClone(draft);
  delete next.rsvp;
  delete next.gifts;
  return next;
}

function upsertObject(draft, object) {
  const next = deepClone(draft);
  const safeObject = deepClone(object);
  const current = Array.isArray(next.objetos) ? next.objetos : [];
  const index = current.findIndex((entry) => entry?.id === safeObject.id);

  if (index >= 0) {
    current[index] = safeObject;
  } else {
    current.push(safeObject);
  }

  next.objetos = current;
  return next;
}

function upsertObjects(draft, objects) {
  return (Array.isArray(objects) ? objects : []).reduce(
    (nextDraft, object) => upsertObject(nextDraft, object),
    draft
  );
}

function readFirstDecorationAsset(section, fallbackSlot) {
  const decorations = section?.decoracionesFondo;
  if (!decorations || typeof decorations !== "object") return null;

  const direct =
    fallbackSlot === "top"
      ? decorations.superior
      : decorations.inferior;
  if (direct && typeof direct === "object") return direct;

  const items = Array.isArray(decorations.items) ? decorations.items : [];
  return fallbackSlot === "top" ? items[0] || null : items[1] || null;
}

function withHeroEdgeDecorations(draft) {
  const next = deepClone(draft);
  next.secciones = (Array.isArray(next.secciones) ? next.secciones : []).map((section) => {
    if (section?.id !== "section-hero") return section;

    const top = readFirstDecorationAsset(section, "top");
    const bottom = readFirstDecorationAsset(section, "bottom");
    return {
      ...section,
      decoracionesBorde: {
        ...(top
          ? {
              top: {
                enabled: true,
                src: top.src || top.url || "",
                storagePath: top.storagePath || null,
                decorId: top.decorId || null,
                nombre: top.nombre || "Decoracion superior",
                heightDesktopRatio: 0.38,
                heightMobileRatio: 0.22,
                offsetDesktopPx: 0,
                offsetMobilePx: 0,
                mode: "cover-x",
              },
            }
          : {}),
        ...(bottom
          ? {
              bottom: {
                enabled: true,
                src: bottom.src || bottom.url || "",
                storagePath: bottom.storagePath || null,
                decorId: bottom.decorId || null,
                nombre: bottom.nombre || "Decoracion inferior",
                heightDesktopRatio: 0.34,
                heightMobileRatio: 0.18,
                offsetDesktopPx: 0,
                offsetMobilePx: 0,
                mode: "cover-x",
              },
            }
          : {}),
      },
    };
  });
  return next;
}

function withSectionWaveDividers(draft) {
  const next = deepClone(draft);
  next.secciones = (Array.isArray(next.secciones) ? next.secciones : []).map(
    (section) => {
      const normalized = { ...section };
      delete normalized.fondoTipo;
      delete normalized.fondoImagen;
      delete normalized.fondoImagenOffsetX;
      delete normalized.fondoImagenOffsetY;
      delete normalized.fondoImagenScale;
      delete normalized.decoracionesFondo;
      delete normalized.decoracionesBorde;

      if (section?.id === "section-hero") {
        return {
          ...normalized,
          fondo: "#f6d1e7",
          divisores: {
            top: "wave-soft",
            bottom: "wave-wide",
            height: 84,
          },
        };
      }

      if (section?.id === "section-gallery") {
        return {
          ...normalized,
          fondo: "#26356f",
          divisores: {
            top: "wave-asymmetric",
            bottom: "wave-double",
            height: 68,
          },
        };
      }

      return normalized;
    }
  );
  return next;
}

function createPantallaTextObject({
  id = "hero-title",
  texto = "Nos casamos",
  x = 96,
  y = 132,
  yNorm = 0.26,
  width = 420,
  fontSize = 42,
  fontFamily = "Cormorant Garamond",
  colorTexto = "#2f2a27",
} = {}) {
  return {
    id,
    tipo: "texto",
    seccionId: "section-hero",
    x,
    y,
    yNorm,
    width,
    texto,
    fontSize,
    fontFamily,
    colorTexto,
  };
}

function createPantallaCompositionTextObjects({ seccionId = "section-hero" } = {}) {
  return [
    {
      id: "pantalla-composition-title",
      tipo: "texto",
      seccionId,
      anclaje: "content",
      x: 6.858840771161169,
      y: 302.6077543409347,
      yNorm: 0.6052155086818695,
      texto: "Nos casamos",
      fontFamily: "Great Vibes, cursive",
      fontSize: 92.804,
      lineHeight: 1.2,
      align: "center",
      colorTexto: "#ecd4c3",
    },
    {
      id: "pantalla-composition-names",
      tipo: "texto",
      seccionId,
      anclaje: "content",
      x: 175.20039232325945,
      y: 387.8768467071258,
      yNorm: 0.7757536934142516,
      texto: "Juli & Manu",
      fontFamily: "Poppins",
      fontSize: 31.91,
      lineHeight: 1.2,
      align: "center",
      colorTexto: "#efdbcb",
    },
  ];
}

function createPreservedGroupObject({
  id = "hero-copy-group",
  seccionId = "section-hero",
  anclaje = "content",
  x = 118,
  y = 212,
  yNorm = 0.424,
  width = 360,
  height = 132,
  textId = "hero-copy",
  decorationId = "hero-copy-star",
  texto = "Celebremos juntos",
  fontSize = 30,
} = {}) {
  return {
    id,
    tipo: "grupo",
    seccionId,
    anclaje,
    x,
    y,
    yNorm,
    width,
    height,
    children: [
      {
        id: decorationId,
        tipo: "forma",
        figura: "star",
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        color: "#f0d36a",
      },
      {
        id: textId,
        tipo: "texto",
        x: 56,
        y: 42,
        width: 240,
        texto,
        fontSize,
        fontFamily: "Cormorant Garamond",
        colorTexto: "#2f2a27",
      },
    ],
  };
}

function createMobileReflowColumnObjects({ seccionId = "section-details" } = {}) {
  return [
    {
      id: "mobile-column-left-heading",
      tipo: "texto",
      seccionId,
      x: 48.306729625196596,
      y: 25.115696932074115,
      width: 360,
      texto: "Civil",
      fontSize: 19,
      align: "center",
      colorTexto: "#2f2a27",
    },
    {
      id: "mobile-column-left-date",
      tipo: "texto",
      seccionId,
      x: 48.899276377894324,
      y: 57.55460133936708,
      width: 360,
      texto: "6 de diciembre de 2026",
      fontSize: 43,
      align: "center",
      colorTexto: "#4c4640",
    },
    {
      id: "mobile-column-left-place",
      tipo: "texto",
      seccionId,
      x: 42.46019128631997,
      y: 136.90875672239713,
      width: 360,
      texto: "A confirmar",
      fontSize: 19,
      align: "center",
      colorTexto: "#2f2a27",
    },
    {
      id: "mobile-column-left-address",
      tipo: "texto",
      seccionId,
      x: 42.792,
      y: 158.316,
      width: 360,
      texto: "a confirmar",
      fontSize: 21,
      align: "center",
      colorTexto: "#4c4640",
    },
    {
      id: "mobile-column-left-time",
      tipo: "texto",
      seccionId,
      x: 42.23642614104017,
      y: 232.40408523659562,
      width: 360,
      texto: "18:00",
      fontSize: 21,
      align: "center",
      colorTexto: "#4c4640",
    },
    {
      id: "mobile-column-right-heading",
      tipo: "texto",
      seccionId,
      x: 396.5371511596004,
      y: 33.14013303872821,
      width: 360,
      texto: "Jupá y Fiesta",
      fontSize: 19,
      align: "center",
      colorTexto: "#2f2a27",
    },
    {
      id: "mobile-column-right-date",
      tipo: "texto",
      seccionId,
      x: 396.99077924040387,
      y: 74.6245298913891,
      width: 360,
      texto: "6 de diciembre de 2026",
      fontSize: 39,
      align: "center",
      colorTexto: "#4c4640",
    },
    {
      id: "mobile-column-right-place",
      tipo: "texto",
      seccionId,
      x: 396.3390527442324,
      y: 116.99827674968583,
      width: 360,
      texto: "Azahares de Escobar",
      fontSize: 27,
      align: "center",
      colorTexto: "#2f2a27",
    },
    {
      id: "mobile-column-right-address",
      tipo: "texto",
      seccionId,
      x: 382.87300000000005,
      y: 151.99800000000005,
      width: 360,
      texto: "Juan Mermoz Sur 1530, B1625 Belén de Escobar, Provincia de Buenos Aires",
      fontSize: 21,
      align: "center",
      colorTexto: "#4c4640",
    },
    {
      id: "mobile-column-right-time",
      tipo: "texto",
      seccionId,
      x: 389.554,
      y: 234.36900000000014,
      width: 360,
      texto: "18:00hs",
      fontSize: 21,
      align: "center",
      colorTexto: "#4c4640",
    },
  ];
}

function createMobileReflowTitleVisualColumnObjects({ seccionId = "section-details" } = {}) {
  const iconPath = "M5 5h14v14H5z";
  const iconViewBox = "0 0 24 24";

  const createColumn = ({ prefix, x, label, time, place }) => [
    {
      id: `${prefix}-icon`,
      tipo: "icono-svg",
      seccionId,
      x: x + 68,
      y: 120,
      width: 48,
      height: 48,
      viewBox: iconViewBox,
      d: iconPath,
      color: "#2f2a27",
    },
    {
      id: `${prefix}-label`,
      tipo: "texto",
      seccionId,
      x,
      y: 180,
      width: 184,
      texto: label,
      fontSize: 28,
      align: "center",
      colorTexto: "#2f2a27",
    },
    {
      id: `${prefix}-time`,
      tipo: "texto",
      seccionId,
      x,
      y: 224,
      width: 184,
      texto: time,
      fontSize: 19,
      align: "center",
      colorTexto: "#4c4640",
    },
    {
      id: `${prefix}-place`,
      tipo: "texto",
      seccionId,
      x,
      y: 254,
      width: 184,
      texto: place,
      fontSize: 18,
      align: "center",
      colorTexto: "#4c4640",
    },
  ];

  return [
    {
      id: "where-title",
      tipo: "texto",
      seccionId,
      x: 245,
      y: 34,
      width: 300,
      texto: "¿Dónde?",
      fontSize: 38,
      align: "center",
      colorTexto: "#2f2a27",
    },
    {
      id: "where-subtitle",
      tipo: "texto",
      seccionId,
      x: 190,
      y: 82,
      width: 420,
      texto: "Ceremonia y celebraciÃ³n",
      fontSize: 24,
      align: "center",
      colorTexto: "#4c4640",
    },
    ...createColumn({
      prefix: "ceremony",
      x: 92,
      label: "CEREMONIA",
      time: "Sábado 20 de julio - 17 hs",
      place: "Parroquia San José",
    }),
    ...createColumn({
      prefix: "party",
      x: 526,
      label: "FIESTA",
      time: "20 hs",
      place: "Salón Las Rosas",
    }),
  ];
}

function withCenteredGallerySideObject(draft) {
  const next = deepClone(draft);
  const gallery = (next.objetos || []).find((object) => object?.id === "gallery-main");
  if (!gallery) return next;

  Object.assign(gallery, {
    x: 120,
    y: 85,
    width: 560,
    widthPct: 70,
    height: 276,
    rows: 1,
    cols: 2,
    gap: 8,
    radius: 6,
    ratio: "1:1",
    galleryLayoutMode: "fixed",
    galleryLayoutType: "canvas_preserve",
    galleryLayoutBlueprint: null,
    currentLayout: "grid_2x1",
    defaultLayout: "grid_2x1",
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    cells: Array.isArray(gallery.cells) ? gallery.cells.slice(0, 2) : [],
  });

  next.objetos = (next.objetos || [])
    .filter((object) => object?.id !== "centered-gallery-side-ornament")
    .concat({
      id: "centered-gallery-side-ornament",
      tipo: "forma",
      figura: "rect",
      seccionId: gallery.seccionId,
      x: 650,
      y: 85,
      width: 120,
      height: 120,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      color: "rgba(119, 61, 190, 0.24)",
      cornerRadius: 24,
    });

  return next;
}

function createOverflowObjects({ seccionId = "section-details" } = {}) {
  return [
    {
      id: "overflow-title",
      tipo: "texto",
      seccionId,
      x: 80,
      y: 420,
      width: 320,
      texto: "Ultimos detalles",
      fontSize: 34,
      colorTexto: "#2f2a27",
    },
    {
      id: "overflow-copy",
      tipo: "texto",
      seccionId,
      x: 80,
      y: 502,
      width: 520,
      texto: "Este bloque protege la expansion mobile de secciones fijas cuando el contenido queda por debajo del alto base.",
      fontSize: 22,
      colorTexto: "#4c4640",
    },
  ];
}

function createGroupedCtaObject({
  id = "grouped-rsvp-visual",
  seccionId = "section-details",
} = {}) {
  return {
    id,
    tipo: "grupo",
    seccionId,
    anclaje: "content",
    x: 92,
    y: 84,
    width: 280,
    height: 152,
    children: [
      {
        id: `${id}-button`,
        tipo: "rsvp-boton",
        x: 18,
        y: 54,
        width: 240,
        height: 54,
        texto: "Confirmar asistencia",
      },
      {
        id: `${id}-ornament`,
        tipo: "forma",
        figura: "rect",
        x: 0,
        y: 40,
        width: 280,
        height: 86,
        color: "rgba(240,211,106,0.18)",
        cornerRadius: 18,
      },
    ],
  };
}

function createFullbleedMixedObjects({ seccionId = "section-details" } = {}) {
  return [
    {
      id: "fixed-fullbleed-band",
      tipo: "forma",
      figura: "rect",
      seccionId,
      anclaje: "fullbleed",
      x: 0,
      y: 36,
      width: 800,
      height: 220,
      color: "#edf7f8",
    },
    {
      id: "fixed-content-over-bleed",
      tipo: "texto",
      seccionId,
      anclaje: "content",
      x: 96,
      y: 104,
      width: 360,
      texto: "Contenido sobre banda fullbleed",
      fontSize: 32,
      colorTexto: "#2f2a27",
    },
  ];
}

function createVisualBaselineCase({
  id,
  label,
  purpose,
  sourceFixture,
  expectedParityMode,
  previewDraft,
  publishDraft,
  acceptedWarningCodes = [],
  focusCheckpoints = [],
  notes = [],
}) {
  return Object.freeze({
    id,
    label,
    purpose,
    sourceFixture,
    expectedParityMode,
    previewDraft: deepClone(previewDraft),
    publishDraft: deepClone(publishDraft),
    requiredViews: [...PREVIEW_PUBLISH_VISUAL_BASELINE_REQUIRED_VIEWS],
    acceptedWarningCodes: [...acceptedWarningCodes],
    focusCheckpoints: [...focusCheckpoints],
    notes: [...notes],
  });
}

const hydratedAssetParityFixture = findFixtureById(
  previewPublishSharedParityFixtures,
  "preview-publish-hydrated-asset-parity"
);
const warningOnlyParityFixture = findFixtureById(
  previewPublishWarningParityFixtures,
  "preview-publish-warning-only-parity"
);

export const PREVIEW_PUBLISH_VISUAL_BASELINE_REQUIRED_VIEWS = Object.freeze([
  "canvas-editor",
  "preview-desktop-frame",
  "preview-mobile-frame",
  "publish-desktop",
  "publish-mobile",
]);

export const PREVIEW_PUBLISH_VISUAL_BASELINE_ALLOWED_WARNING_CODES = Object.freeze([
  "pantalla-ynorm-missing",
  "pantalla-ynorm-drift",
  "fullbleed-editor-drift",
]);

const simplePantallaPreviewDraft = upsertObject(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  createPantallaTextObject()
);
const simplePantallaPublishDraft = upsertObject(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  createPantallaTextObject()
);

const decorativeFullbleedPreviewDraft = withoutRootConfigs(
  selectDraftSlice(warningOnlyParityFixture.previewDraft, {
    sectionIds: ["section-hero"],
    objectIds: ["hero-image"],
  })
);
const decorativeFullbleedPublishDraft = withoutRootConfigs(
  selectDraftSlice(warningOnlyParityFixture.publishDraft, {
    sectionIds: ["section-hero"],
    objectIds: ["hero-image"],
  })
);

const decoratedTextPreviewDraft = upsertObject(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  createPreservedGroupObject()
);
const decoratedTextPublishDraft = upsertObject(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  createPreservedGroupObject()
);

const galleryPreviewDraft = withoutRootConfigs(
  selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
    sectionIds: ["section-gallery"],
    objectIds: ["gallery-main"],
  })
);
const galleryPublishDraft = withoutRootConfigs(
  selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
    sectionIds: ["section-gallery"],
    objectIds: ["gallery-main"],
  })
);

const fixedCenteredGallerySideObjectPreviewDraft = withCenteredGallerySideObject(
  galleryPreviewDraft
);
const fixedCenteredGallerySideObjectPublishDraft = withCenteredGallerySideObject(
  galleryPublishDraft
);

const countdownPreviewDraft = withoutRootConfigs(
  selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
    sectionIds: ["section-hero"],
    objectIds: ["count-modern"],
  })
);
const countdownPublishDraft = withoutRootConfigs(
  selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
    sectionIds: ["section-hero"],
    objectIds: ["count-modern"],
  })
);

const mixedFixedAndScreenPreviewDraft = upsertObject(
  hydratedAssetParityFixture.previewDraft,
  createPantallaTextObject({
    id: "hero-title",
    texto: "Ana y Luis",
    x: 92,
    y: 118,
    yNorm: 0.236,
    width: 320,
    fontSize: 40,
  })
);
const mixedFixedAndScreenPublishDraft = upsertObject(
  hydratedAssetParityFixture.publishDraft,
  createPantallaTextObject({
    id: "hero-title",
    texto: "Ana y Luis",
    x: 92,
    y: 118,
    yNorm: 0.236,
    width: 320,
    fontSize: 40,
  })
);

const fixedReflowColumnsPreviewDraft = upsertObjects(
  selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createMobileReflowColumnObjects()
);
const fixedReflowColumnsPublishDraft = upsertObjects(
  selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createMobileReflowColumnObjects()
);

const fixedReflowTitleVisualColumnsPreviewDraft = upsertObjects(
  selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createMobileReflowTitleVisualColumnObjects()
);
const fixedReflowTitleVisualColumnsPublishDraft = upsertObjects(
  selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createMobileReflowTitleVisualColumnObjects()
);

const fixedOverflowPreviewDraft = upsertObjects(
  selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createOverflowObjects()
);
const fixedOverflowPublishDraft = upsertObjects(
  selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createOverflowObjects()
);

const groupedCtaPreviewDraft = upsertObject(
  selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createGroupedCtaObject()
);
const groupedCtaPublishDraft = upsertObject(
  selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createGroupedCtaObject()
);

const groupNestedChildrenPreviewDraft = upsertObject(
  selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createPreservedGroupObject({
    id: "mobile-group-nested-children",
    seccionId: "section-details",
    x: 96,
    y: 116,
  })
);
const groupNestedChildrenPublishDraft = upsertObject(
  selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createPreservedGroupObject({
    id: "mobile-group-nested-children",
    seccionId: "section-details",
    x: 96,
    y: 116,
  })
);

const fixedFullbleedMixedPreviewDraft = upsertObjects(
  selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createFullbleedMixedObjects()
);
const fixedFullbleedMixedPublishDraft = upsertObjects(
  selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
    sectionIds: ["section-details"],
    objectIds: [],
  }),
  createFullbleedMixedObjects()
);

const pantallaYNormPreviewDraft = upsertObjects(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  [
    createPantallaTextObject({
      id: "pantalla-ynorm-top",
      texto: "Arriba",
      x: 96,
      y: 96,
      yNorm: 0.19,
      width: 260,
      fontSize: 34,
    }),
    createPantallaTextObject({
      id: "pantalla-ynorm-bottom",
      texto: "Abajo",
      x: 96,
      y: 342,
      yNorm: 0.684,
      width: 260,
      fontSize: 34,
    }),
  ]
);
const pantallaYNormPublishDraft = upsertObjects(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  [
    createPantallaTextObject({
      id: "pantalla-ynorm-top",
      texto: "Arriba",
      x: 96,
      y: 96,
      yNorm: 0.19,
      width: 260,
      fontSize: 34,
    }),
    createPantallaTextObject({
      id: "pantalla-ynorm-bottom",
      texto: "Abajo",
      x: 96,
      y: 342,
      yNorm: 0.684,
      width: 260,
      fontSize: 34,
    }),
  ]
);

const pantallaCompositionPreviewDraft = upsertObjects(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  createPantallaCompositionTextObjects()
);
const pantallaCompositionPublishDraft = upsertObjects(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  createPantallaCompositionTextObjects()
);

const edgeDecorationsPreviewDraft = withHeroEdgeDecorations(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  )
);
const edgeDecorationsPublishDraft = withHeroEdgeDecorations(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  )
);
const sectionWaveDividersPreviewDraft = withSectionWaveDividers(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.previewDraft, {
      sectionIds: ["section-hero", "section-gallery"],
      objectIds: [],
    })
  )
);
const sectionWaveDividersPublishDraft = withSectionWaveDividers(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
      sectionIds: ["section-hero", "section-gallery"],
      objectIds: [],
    })
  )
);

export const previewPublishVisualBaselineFixtures = Object.freeze([
  createVisualBaselineCase({
    id: "edge-decorations-pantalla",
    label: "Edge decorations in pantalla section",
    purpose: "Freeze top and bottom section-owned edge ornaments as viewport-width non-object layers.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: edgeDecorationsPreviewDraft,
    publishDraft: edgeDecorationsPublishDraft,
    focusCheckpoints: [
      "top and bottom edge bands span the viewport width",
      "responsive edge heights remain balanced in desktop and mobile",
      "edge ornaments do not become .objeto nodes or smart-layout units",
      "pantalla zoom compensation keeps edge anchors stable in mobile preview and publish",
    ],
    notes: [
      "Uses the same decorative assets as the representative hero section but through decoracionesBorde.",
    ],
  }),
  createVisualBaselineCase({
    id: "section-wave-dividers",
    label: "Section wave dividers",
    purpose: "Freeze section-owned SVG dividers across adjacent contrasting backgrounds.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: sectionWaveDividersPreviewDraft,
    publishDraft: sectionWaveDividersPublishDraft,
    focusCheckpoints: [
      "top and bottom SVG paths match the centralized preset catalog",
      "each physical junction has one visible divider owner",
      "contrasting adjacent backgrounds meet without straight or white seams",
      "divider height scales without changing section or object layout",
      "desktop and mobile preserve the same section-owned boundary reading",
      "clean canvas capture includes dividers without editor controls",
    ],
    notes: [
      "Uses one pantalla section and one fixed section with deterministic solid backgrounds.",
    ],
  }),
  createVisualBaselineCase({
    id: "simple-pantalla-section",
    label: "Simple pantalla section",
    purpose: "Freeze the minimal pantalla text baseline without bleed or extra objects.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: simplePantallaPreviewDraft,
    publishDraft: simplePantallaPublishDraft,
    focusCheckpoints: [
      "pantalla viewport-fit behavior stays stable",
      "content-anchored text remains inside the section content flow",
      "desktop and mobile preserve the same authored text hierarchy",
    ],
    notes: [
      "Uses the current representative hero section with a single synthetic text object.",
      "Keeps section background and decoration metadata to preserve current pantalla context.",
    ],
  }),
  createVisualBaselineCase({
    id: "decorative-fullbleed",
    label: "Decorative fullbleed",
    purpose: "Freeze the current fullbleed anchor interpretation in a decorated pantalla section.",
    sourceFixture: "preview-publish-warning-only-parity",
    expectedParityMode: "warning-only",
    previewDraft: decorativeFullbleedPreviewDraft,
    publishDraft: decorativeFullbleedPublishDraft,
    acceptedWarningCodes: [
      "fullbleed-editor-drift",
      "pantalla-ynorm-drift",
    ],
    focusCheckpoints: [
      "fullbleed media stays in the bleed layer rather than collapsing into content width",
      "section decorations remain attached to the same section backdrop",
      "mobile keeps the same fullbleed reading, not a separate anchor interpretation",
    ],
    notes: [
      "Intentionally reuses the current warning-sensitive fullbleed path as a protected baseline.",
    ],
  }),
  createVisualBaselineCase({
    id: "text-with-decoration-behind",
    label: "Text with decoration behind",
    purpose: "Freeze a preserved text plus decoration composition as one atomic mobile layout unit.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: decoratedTextPreviewDraft,
    publishDraft: decoratedTextPublishDraft,
    focusCheckpoints: [
      "the preserved group stays in authored child order with the star behind the text",
      "mobile reflow moves the group as one composition instead of separating its children",
      "preview and publish keep the same content-lane anchor semantics for the group",
    ],
    notes: [
      "This is the first canonical preserved-group visual baseline case for Phase 4.",
    ],
  }),
  createVisualBaselineCase({
    id: "gallery",
    label: "Gallery",
    purpose: "Freeze the current gallery layout family and cell ordering semantics.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: galleryPreviewDraft,
    publishDraft: galleryPublishDraft,
    focusCheckpoints: [
      "gallery cell order remains stable",
      "layout mode and sizing pattern stay recognizable",
      "desktop/mobile preserve the same gallery layout family",
    ],
    notes: [
      "Reuses the current representative gallery object and canonical cell media mix.",
    ],
  }),
  createVisualBaselineCase({
    id: "fixed-reflow-centered-gallery-side-object",
    label: "Fixed centered Gallery plus lateral object",
    purpose: "Freeze vertical mobile distribution without moving an authored centered Gallery off the section axis.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: fixedCenteredGallerySideObjectPreviewDraft,
    publishDraft: fixedCenteredGallerySideObjectPublishDraft,
    focusCheckpoints: [
      "the desktop Gallery remains centered beside the authored lateral object",
      "mobile separates the ungrouped centered and lateral objects into vertical units",
      "the Gallery and lateral object are centered independently after reflow",
      "the two Gallery cells and generated viewer markers stay intact",
      "preview and publish keep identical final geometry at representative mobile viewports",
    ],
  }),
  createVisualBaselineCase({
    id: "countdown",
    label: "Countdown",
    purpose: "Freeze the current countdown frame and unit composition as a baseline reference.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: countdownPreviewDraft,
    publishDraft: countdownPublishDraft,
    focusCheckpoints: [
      "frame and unit composition stay intact",
      "desktop/mobile preserve the same countdown layout family",
      "no later parity work should change countdown structure accidentally",
    ],
    notes: [
      "Phase 1 records the case and capture slots only; it does not commit a screenshot binary.",
      "Deterministic countdown screenshots still require a later frozen-clock capture harness.",
    ],
  }),
  createVisualBaselineCase({
    id: "mixed-fijo-pantalla",
    label: "Mixed fijo plus pantalla",
    purpose: "Freeze cross-section ordering and parity across one pantalla section plus fixed sections.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: mixedFixedAndScreenPreviewDraft,
    publishDraft: mixedFixedAndScreenPublishDraft,
    focusCheckpoints: [
      "section order stays stable across pantalla and fijo sections",
      "pantalla hero rendering does not disturb downstream fixed sections",
      "cross-section relationships remain intact in desktop and mobile views",
    ],
    notes: [
      "Keeps the representative multi-section parity fixture intact and adds one pantalla title for legibility.",
    ],
  }),
  createVisualBaselineCase({
    id: "fixed-reflow-columns",
    label: "Fixed section reflow columns",
    purpose: "Freeze the two-column mobile smart-layout path for fixed sections.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: fixedReflowColumnsPreviewDraft,
    publishDraft: fixedReflowColumnsPublishDraft,
    focusCheckpoints: [
      "fixed sections remain the only smart-reflow section mode",
      "wide text boxes with weak gutter overlap stay in two inferred column units",
      "column groups preserve internal vectors and stack consistently in mobile preview and publish",
      "section height after reflow stays within the same geometry tolerance",
    ],
  }),
  createVisualBaselineCase({
    id: "fixed-reflow-title-visual-columns",
    label: "Fixed section heading composition plus visual columns",
    purpose: "Freeze a centered title/subtitle composition before two visual columns are stacked on mobile.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: fixedReflowTitleVisualColumnsPreviewDraft,
    publishDraft: fixedReflowTitleVisualColumnsPublishDraft,
    focusCheckpoints: [
      "the centered title/subtitle composition stays above the mobile flow",
      "heading geometry does not contaminate left/right lane bounding boxes",
      "spatially related objects preserve their internal vectors as one inferred composition unit",
      "ceremony and party visual columns both stack on the mobile center axis",
      "preview and publish keep the same centered-column geometry",
    ],
  }),
  createVisualBaselineCase({
    id: "fixed-overflow-expansion",
    label: "Fixed section overflow expansion",
    purpose: "Freeze fixed-section expansion when mobile content exceeds the authored height.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: fixedOverflowPreviewDraft,
    publishDraft: fixedOverflowPublishDraft,
    focusCheckpoints: [
      "overflowing content expands the fixed section consistently",
      "preview does not preserve stale embedded iframe gaps",
      "downstream section offsets stay stable after expansion",
    ],
  }),
  createVisualBaselineCase({
    id: "grouped-cta-fixed-section",
    label: "Grouped CTA in fixed section",
    purpose: "Freeze grouped functional CTA positioning and hit-layer preservation in mobile reflow.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: groupedCtaPreviewDraft,
    publishDraft: groupedCtaPublishDraft,
    focusCheckpoints: [
      "group wrapper remains the mobile layout unit",
      "CTA child remains nested and interactive",
      "decorative grouped siblings do not change CTA stacking",
    ],
  }),
  createVisualBaselineCase({
    id: "group-nested-children",
    label: "Group with nested children",
    purpose: "Freeze nested group child offsets relative to the group wrapper.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: groupNestedChildrenPreviewDraft,
    publishDraft: groupNestedChildrenPublishDraft,
    focusCheckpoints: [
      "children stay nested rather than becoming top-level mobile reflow objects",
      "child offsets remain relative to the group wrapper",
      "mobile reflow moves the group atomically",
    ],
  }),
  createVisualBaselineCase({
    id: "fixed-fullbleed-mixed-lanes",
    label: "Fixed fullbleed mixed lanes",
    purpose: "Freeze fullbleed/content lane separation inside a fixed section.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: fixedFullbleedMixedPreviewDraft,
    publishDraft: fixedFullbleedMixedPublishDraft,
    focusCheckpoints: [
      "fullbleed objects stay in the bleed lane",
      "content objects stay in the content lane",
      "fit scale does not collapse lane intent",
    ],
  }),
  createVisualBaselineCase({
    id: "pantalla-ynorm-positioning",
    label: "Pantalla yNorm positioning",
    purpose: "Freeze multiple yNorm positions in one pantalla section.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: pantallaYNormPreviewDraft,
    publishDraft: pantallaYNormPublishDraft,
    focusCheckpoints: [
      "pantalla sections do not enter fixed smart reflow",
      "yNorm objects keep relative vertical spacing",
      "viewport-fit formulas stay consistent between preview and publish",
    ],
  }),
  createVisualBaselineCase({
    id: "pantalla-composition-related-text",
    label: "Pantalla related text composition",
    purpose: "Freeze one screen-relative anchor plus content-scaled internal vectors for related pantalla text.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: pantallaCompositionPreviewDraft,
    publishDraft: pantallaCompositionPublishDraft,
    focusCheckpoints: [
      "the related text pair is inferred from authored 800x500 geometry",
      "the composition keeps one proportional vertical anchor on mobile pantalla",
      "internal text spacing scales with content width instead of viewport height",
      "pantalla does not enter fixed-section ordering, stacking, or height expansion",
      "desktop geometry and preview/publish parity stay unchanged",
    ],
  }),
]);

export const previewPublishVisualBaselineCaseIds = Object.freeze(
  previewPublishVisualBaselineFixtures.map((fixture) => fixture.id)
);

export function buildPreviewPublishVisualBaselineManifest() {
  return {
    manifestVersion: 1,
    generatedFrom: "shared/previewPublishVisualBaselineFixtures.mjs",
    cases: previewPublishVisualBaselineFixtures.map((fixture) => ({
      caseId: fixture.id,
      sourceFixture: fixture.sourceFixture,
      requiredViews: [...fixture.requiredViews],
      expectedParityMode: fixture.expectedParityMode,
      acceptedWarningCodes: [...fixture.acceptedWarningCodes],
      captureFocus: [...fixture.focusCheckpoints],
    })),
  };
}

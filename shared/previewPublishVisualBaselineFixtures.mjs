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
      id: "mobile-column-left-title",
      tipo: "texto",
      seccionId,
      x: 72,
      y: 78,
      width: 220,
      texto: "Ceremonia",
      fontSize: 30,
      colorTexto: "#2f2a27",
    },
    {
      id: "mobile-column-left-copy",
      tipo: "texto",
      seccionId,
      x: 72,
      y: 124,
      width: 220,
      texto: "La ceremonia comienza puntual.",
      fontSize: 20,
      colorTexto: "#4c4640",
    },
    {
      id: "mobile-column-right-title",
      tipo: "texto",
      seccionId,
      x: 458,
      y: 78,
      width: 220,
      texto: "Fiesta",
      fontSize: 30,
      colorTexto: "#2f2a27",
    },
    {
      id: "mobile-column-right-copy",
      tipo: "texto",
      seccionId,
      x: 458,
      y: 124,
      width: 220,
      texto: "Cena, musica y brindis.",
      fontSize: 20,
      colorTexto: "#4c4640",
    },
  ];
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
      "column groups stack consistently in mobile preview and publish",
      "section height after reflow stays within the same geometry tolerance",
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

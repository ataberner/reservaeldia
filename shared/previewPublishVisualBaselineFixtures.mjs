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
  createPantallaTextObject({
    id: "hero-copy",
    texto: "Celebremos juntos",
    x: 118,
    y: 212,
    yNorm: 0.424,
    width: 360,
    fontSize: 30,
  })
);
const decoratedTextPublishDraft = upsertObject(
  withoutRootConfigs(
    selectDraftSlice(hydratedAssetParityFixture.publishDraft, {
      sectionIds: ["section-hero"],
      objectIds: [],
    })
  ),
  createPantallaTextObject({
    id: "hero-copy",
    texto: "Celebremos juntos",
    x: 118,
    y: 212,
    yNorm: 0.424,
    width: 360,
    fontSize: 30,
  })
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

export const previewPublishVisualBaselineFixtures = Object.freeze([
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
    purpose: "Freeze text layering against current section background and decoration rendering.",
    sourceFixture: "preview-publish-hydrated-asset-parity",
    expectedParityMode: "shared-parity",
    previewDraft: decoratedTextPreviewDraft,
    publishDraft: decoratedTextPublishDraft,
    focusCheckpoints: [
      "text stays visually above background decorations",
      "decorations do not detach or jump in front of the text",
      "the case does not silently inherit bleed semantics",
    ],
    notes: [
      "This is a lightweight layering reference, not a grouping-model test.",
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

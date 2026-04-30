export const MOBILE_GEOMETRY_PARITY_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "mobile-390x844", width: 390, height: 844 }),
  Object.freeze({ id: "mobile-375x812", width: 375, height: 812 }),
  Object.freeze({ id: "mobile-414x896", width: 414, height: 896 }),
]);

export const MOBILE_GEOMETRY_PARITY_DEFAULT_TOLERANCE_PX = 2;

function round(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function rectToSnapshot(rect) {
  if (!rect) {
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  }
  return {
    left: round(rect.left),
    top: round(rect.top),
    width: round(rect.width),
    height: round(rect.height),
    right: round(rect.right),
    bottom: round(rect.bottom),
  };
}

function diffNumber(path, left, right, tolerancePx, diffs) {
  const delta = Math.abs(Number(left || 0) - Number(right || 0));
  if (delta <= tolerancePx) return;
  diffs.push({
    code: "geometry-value",
    path,
    preview: round(left),
    publish: round(right),
    delta: round(delta),
  });
}

function diffRect(path, leftRect, rightRect, tolerancePx, diffs) {
  ["left", "top", "width", "height", "right", "bottom"].forEach((key) => {
    diffNumber(`${path}.${key}`, leftRect?.[key], rightRect?.[key], tolerancePx, diffs);
  });
}

function indexBy(items, keyName) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [item?.[keyName], item]));
}

function diffKeyedRects({
  path,
  leftItems,
  rightItems,
  keyName = "id",
  tolerancePx,
  diffs,
  rectKey = "rect",
}) {
  const leftById = indexBy(leftItems, keyName);
  const rightById = indexBy(rightItems, keyName);
  const ids = [...new Set([...leftById.keys(), ...rightById.keys()])].filter(Boolean).sort();

  ids.forEach((id) => {
    const left = leftById.get(id);
    const right = rightById.get(id);
    if (!left || !right) {
      diffs.push({
        code: "geometry-missing-node",
        path: `${path}.${id}`,
        previewPresent: Boolean(left),
        publishPresent: Boolean(right),
      });
      return;
    }
    diffRect(`${path}.${id}`, left[rectKey], right[rectKey], tolerancePx, diffs);
  });
}

export function collectMobileGeometrySnapshotFromDocument() {
  const pickDataset = (node, key) =>
    String((node && node.dataset && node.dataset[key]) || "").trim();
  const pickCssVar = (node, key) => {
    try {
      return String(getComputedStyle(node).getPropertyValue(key) || "").trim();
    } catch (_error) {
      return "";
    }
  };
  const toRect = (node) => {
    if (!node || typeof node.getBoundingClientRect !== "function") {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    }
    const rect = node.getBoundingClientRect();
    return {
      left: Math.round(Number(rect.left || 0) * 100) / 100,
      top: Math.round(Number(rect.top || 0) * 100) / 100,
      width: Math.round(Number(rect.width || 0) * 100) / 100,
      height: Math.round(Number(rect.height || 0) * 100) / 100,
      right: Math.round(Number(rect.right || 0) * 100) / 100,
      bottom: Math.round(Number(rect.bottom || 0) * 100) / 100,
    };
  };

  const root = document.documentElement;
  const body = document.body;
  const sections = Array.from(document.querySelectorAll(".sec")).map((section, index) => {
    const content = section.querySelector(".sec-content");
    const bleed = section.querySelector(".sec-bleed");
    return {
      index,
      id: section.getAttribute("data-seccion-id") || `section-${index}`,
      modo: section.getAttribute("data-modo") || "",
      fitScale: section.getAttribute("data-msl-fit-scale") || "",
      heightModel: section.getAttribute("data-msl-height-model") || "",
      rect: toRect(section),
      contentRect: toRect(content),
      bleedRect: toRect(bleed),
      cssVars: {
        sx: pickCssVar(section, "--sx") || pickCssVar(root, "--sx"),
        bx: pickCssVar(section, "--bx") || pickCssVar(root, "--bx"),
        sfinal: pickCssVar(section, "--sfinal"),
        zoom: pickCssVar(section, "--zoom"),
        vhSafe: pickCssVar(section, "--vh-safe"),
        pantallaYBase: pickCssVar(section, "--pantalla-y-base"),
      },
    };
  });

  const objects = Array.from(document.querySelectorAll(".objeto")).map((object, index) => {
    const section = object.closest(".sec");
    return {
      index,
      id:
        object.getAttribute("data-obj-id") ||
        object.getAttribute("data-group-id") ||
        `object-${index}`,
      sectionId: section ? section.getAttribute("data-seccion-id") || "" : "",
      type: object.getAttribute("data-type") || "",
      lane: object.closest(".sec-bleed") ? "bleed" : "content",
      mobileCluster: object.getAttribute("data-mobile-cluster") || "",
      mobileFit: object.getAttribute("data-mobile-fit") || "",
      rect: toRect(object),
    };
  });

  const edgeDecorations = Array.from(document.querySelectorAll(".sec-edge-decor")).map(
    (decoration, index) => {
      const section = decoration.closest(".sec");
      return {
        index,
        id: `${section ? section.getAttribute("data-seccion-id") || "" : ""}:${decoration.getAttribute("data-edge-slot") || index}`,
        sectionId: section ? section.getAttribute("data-seccion-id") || "" : "",
        slot: decoration.getAttribute("data-edge-slot") || "",
        rect: toRect(decoration),
      };
    }
  );

  const groupChildren = Array.from(document.querySelectorAll("[data-group-child-id]")).map(
    (child, index) => {
      const group = child.closest("[data-obj-id]");
      const groupRect = toRect(group);
      const childRect = toRect(child);
      return {
        index,
        id: `${child.getAttribute("data-group-id") || ""}:${child.getAttribute("data-group-child-id") || ""}`,
        groupId: child.getAttribute("data-group-id") || "",
        childId: child.getAttribute("data-group-child-id") || "",
        rect: childRect,
        relativeRect: {
          left: Math.round((childRect.left - groupRect.left) * 100) / 100,
          top: Math.round((childRect.top - groupRect.top) * 100) / 100,
          width: childRect.width,
          height: childRect.height,
          right: Math.round((childRect.right - groupRect.left) * 100) / 100,
          bottom: Math.round((childRect.bottom - groupRect.top) * 100) / 100,
        },
      };
    }
  );

  return {
    viewport: {
      innerWidth: Math.round(Number(window.innerWidth || 0) * 100) / 100,
      innerHeight: Math.round(Number(window.innerHeight || 0) * 100) / 100,
      visualViewportWidth: Math.round(Number(window.visualViewport?.width || 0) * 100) / 100,
      visualViewportHeight: Math.round(Number(window.visualViewport?.height || 0) * 100) / 100,
      scrollHeight: Math.round(Number(root?.scrollHeight || body?.scrollHeight || 0) * 100) / 100,
      previewViewport: pickDataset(root, "previewViewport") || pickDataset(body, "previewViewport"),
      previewLayoutMode:
        pickDataset(root, "previewLayoutMode") || pickDataset(body, "previewLayoutMode"),
    },
    sections,
    objects,
    edgeDecorations,
    groupChildren,
  };
}

export function diffMobileGeometrySnapshots(
  previewSnapshot,
  publishSnapshot,
  { tolerancePx = MOBILE_GEOMETRY_PARITY_DEFAULT_TOLERANCE_PX } = {}
) {
  const diffs = [];

  diffNumber(
    "viewport.scrollHeight",
    previewSnapshot?.viewport?.scrollHeight,
    publishSnapshot?.viewport?.scrollHeight,
    tolerancePx,
    diffs
  );

  const previewSectionIds = (previewSnapshot?.sections || []).map((section) => section.id);
  const publishSectionIds = (publishSnapshot?.sections || []).map((section) => section.id);
  if (JSON.stringify(previewSectionIds) !== JSON.stringify(publishSectionIds)) {
    diffs.push({
      code: "geometry-section-order",
      path: "sections",
      preview: previewSectionIds,
      publish: publishSectionIds,
    });
  }

  diffKeyedRects({
    path: "sections",
    leftItems: previewSnapshot?.sections,
    rightItems: publishSnapshot?.sections,
    tolerancePx,
    diffs,
  });
  diffKeyedRects({
    path: "objects",
    leftItems: previewSnapshot?.objects,
    rightItems: publishSnapshot?.objects,
    tolerancePx,
    diffs,
  });
  diffKeyedRects({
    path: "edgeDecorations",
    leftItems: previewSnapshot?.edgeDecorations,
    rightItems: publishSnapshot?.edgeDecorations,
    tolerancePx,
    diffs,
  });
  diffKeyedRects({
    path: "groupChildren.relative",
    leftItems: previewSnapshot?.groupChildren,
    rightItems: publishSnapshot?.groupChildren,
    tolerancePx,
    diffs,
    rectKey: "relativeRect",
  });

  return diffs;
}

export function createSyntheticGeometrySnapshot({
  scrollHeight = 844,
  sections = [],
  objects = [],
  edgeDecorations = [],
  groupChildren = [],
} = {}) {
  return {
    viewport: {
      innerWidth: 390,
      innerHeight: 844,
      visualViewportWidth: 390,
      visualViewportHeight: 844,
      scrollHeight: round(scrollHeight),
      previewViewport: "",
      previewLayoutMode: "",
    },
    sections: sections.map((section) => ({
      id: normalizeText(section.id),
      modo: normalizeText(section.modo),
      rect: rectToSnapshot(section.rect),
      contentRect: rectToSnapshot(section.contentRect || section.rect),
      bleedRect: rectToSnapshot(section.bleedRect || section.rect),
      cssVars: section.cssVars || {},
    })),
    objects: objects.map((object) => ({
      id: normalizeText(object.id),
      sectionId: normalizeText(object.sectionId),
      type: normalizeText(object.type),
      lane: normalizeText(object.lane),
      rect: rectToSnapshot(object.rect),
    })),
    edgeDecorations: edgeDecorations.map((decoration) => ({
      id: normalizeText(decoration.id),
      sectionId: normalizeText(decoration.sectionId),
      slot: normalizeText(decoration.slot),
      rect: rectToSnapshot(decoration.rect),
    })),
    groupChildren: groupChildren.map((child) => ({
      id: normalizeText(child.id),
      groupId: normalizeText(child.groupId),
      childId: normalizeText(child.childId),
      rect: rectToSnapshot(child.rect),
      relativeRect: rectToSnapshot(child.relativeRect),
    })),
  };
}

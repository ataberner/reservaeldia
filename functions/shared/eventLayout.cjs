const { EVENT_DETAILS_MODES, normalizeEventDetailsMode } = require("./eventDetailsConfig.cjs");
const { applyFunctionalAssociationsToRenderState, normalizeFunctionalAssociation } = require("./functionalAssociations.cjs");
const {
  EVENT_LAYOUT_VERSION,
  getSectionEventLayout,
  captureEventLayoutPositions,
  applyEventLayoutPose,
  stripEventLayoutTransientFields,
} = require("./eventLayoutState.cjs");

const AUTOMATIC_POSITION_REASONS = new Set(["legacy-group-align", "text-center-preservation"]);
const MANUAL_GEOMETRY_FIELDS = ["width", "height", "scaleX", "scaleY", "rotation", "radius", "fontSize"];
const array = value => Array.isArray(value) ? value : [];
const isEventAssociation = value => ["ceremony", "party"].includes(normalizeFunctionalAssociation(value));
const coordinate = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function eligibleSectionIds(objetos, secciones) {
  const ids = new Set(array(secciones).filter(section =>
    getSectionEventLayout(section) || isEventAssociation(section?.functionalAssociation)
  ).map(section => section.id));
  array(objetos).forEach(object => {
    if (isEventAssociation(object?.functionalAssociation)) ids.add(object.seccionId);
  });
  return ids;
}

function withMode(eventDetails, mode) {
  return { ...(eventDetails || {}), mode };
}

function initializeSelectedLayouts({ objetos, secciones, eventDetails, rsvp, gifts, sectionIds }, eligible) {
  const objects = array(objetos);
  const sections = array(secciones);
  const mode = normalizeEventDetailsMode(eventDetails?.mode);
  const requested = sectionIds == null ? null : new Set(array(sectionIds));
  const selected = sections.filter(section => eligible.has(section?.id) &&
    (!requested || requested.has(section.id)) && !getSectionEventLayout(section));
  if (!selected.length) return { objetos: objects, secciones: sections, eventDetails };

  // Both initial presentations are computed before any pose is materialized.
  const renderedByMode = Object.fromEntries(EVENT_DETAILS_MODES.map(targetMode => [targetMode,
    applyFunctionalAssociationsToRenderState({ objetos: objects, secciones: sections,
      eventDetails: withMode(eventDetails, targetMode), rsvp, gifts, materializeOffsets: true }).objetos,
  ]));
  const nextLayouts = new Map(selected.map(section => {
    const original = captureEventLayoutPositions(objects, section.id);
    const initialPositionsByMode = Object.fromEntries(EVENT_DETAILS_MODES.map(targetMode => [targetMode, {
      ...original,
      ...captureEventLayoutPositions(renderedByMode[targetMode], section.id),
    }]));
    return [section.id, {
      version: EVENT_LAYOUT_VERSION,
      materializedMode: mode,
      positionsByMode: Object.fromEntries(EVENT_DETAILS_MODES.filter(targetMode => targetMode !== mode)
        .map(targetMode => [targetMode, structuredClone(initialPositionsByMode[targetMode])])),
      initialPositionsByMode,
    }];
  }));
  return {
    objetos: objects.map(object => {
      const layout = nextLayouts.get(object?.seccionId);
      return layout ? stripEventLayoutTransientFields(applyEventLayoutPose(object, layout.initialPositionsByMode[mode][object.id])) : object;
    }),
    secciones: sections.map(section => nextLayouts.has(section?.id)
      ? { ...section, eventLayout: nextLayouts.get(section.id) } : section),
    eventDetails,
  };
}

function initializeEventLayouts(options = {}) {
  return initializeSelectedLayouts(options, eligibleSectionIds(options.objetos, options.secciones));
}

function transitionEventLayoutMode(options = {}) {
  const targetMode = normalizeEventDetailsMode(options.nextMode);
  const currentMode = normalizeEventDetailsMode(options.eventDetails?.mode);
  const current = { objetos: array(options.objetos), secciones: array(options.secciones), eventDetails: options.eventDetails };
  const hasMismatchedLayout = current.secciones.some(section => {
    const layout = getSectionEventLayout(section);
    return layout && layout.materializedMode !== targetMode;
  });
  if (targetMode === currentMode && !hasMismatchedLayout) return current;
  // Hydration and history may reconcile existing checkpoints, but must never
  // initialize legacy sections or derive a new presentation just by loading.
  const initialized = options.initializeMissing === false ? current : initializeEventLayouts(options);
  const nextLayouts = new Map();
  const existingLayouts = new Map(initialized.secciones.map(section => [section?.id, getSectionEventLayout(section)]));
  const nextObjects = initialized.objetos.map(object => {
    const layout = existingLayouts.get(object?.seccionId);
    if (!layout || layout.materializedMode === targetMode) return object;
    return applyEventLayoutPose(object, layout.positionsByMode[targetMode]?.[object.id]);
  });
  initialized.secciones.forEach(section => {
    const layout = getSectionEventLayout(section);
    if (!layout || layout.materializedMode === targetMode) return;
    const saved = captureEventLayoutPositions(initialized.objetos, section.id);
    nextLayouts.set(section.id, {
      ...layout,
      materializedMode: targetMode,
      positionsByMode: { [layout.materializedMode]: saved },
    });
  });
  return {
    objetos: nextLayouts.size ? nextObjects : initialized.objetos,
    secciones: nextLayouts.size ? initialized.secciones.map(section => nextLayouts.has(section?.id)
      ? { ...section, eventLayout: nextLayouts.get(section.id) } : section) : initialized.secciones,
    eventDetails: withMode(options.eventDetails, targetMode),
  };
}

function resetEventLayouts(options = {}) {
  const initialized = initializeEventLayouts(options);
  const mode = normalizeEventDetailsMode(options.eventDetails?.mode);
  const requested = options.sectionIds == null ? null : new Set(array(options.sectionIds));
  const layouts = new Map(initialized.secciones.filter(section => !requested || requested.has(section?.id))
    .map(section => [section?.id, getSectionEventLayout(section)]));
  return {
    ...initialized,
    objetos: initialized.objetos.map(object => {
      const layout = layouts.get(object?.seccionId);
      return layout ? applyEventLayoutPose(object, layout.initialPositionsByMode[mode]?.[object.id]) : object;
    }),
  };
}

function reconcileEventLayoutMembership({ previousObjects, nextObjects, secciones } = {}) {
  const previous = array(previousObjects);
  const next = array(nextObjects);
  const sections = array(secciones);
  const nextById = new Map(next.map(object => [object?.id, object]));
  const affected = new Set();
  previous.forEach(object => {
    if (nextById.get(object?.id)?.seccionId !== object?.seccionId) affected.add(object?.seccionId);
  });
  if (!affected.size) return sections;
  const rootsBySection = new Map();
  next.forEach(object => {
    if (!affected.has(object?.seccionId)) return;
    if (!rootsBySection.has(object.seccionId)) rootsBySection.set(object.seccionId, new Set());
    rootsBySection.get(object.seccionId).add(object.id);
  });
  let changed = false;
  const nextSections = sections.map(section => {
    if (!affected.has(section?.id)) return section;
    const layout = getSectionEventLayout(section);
    if (!layout) return section;
    const rootIds = rootsBySection.get(section.id) || new Set();
    let pruned = false;
    const pruneModes = modes => Object.fromEntries(Object.entries(modes).map(([mode, poses]) => [mode,
      Object.fromEntries(Object.entries(poses).filter(([id]) => {
        if (rootIds.has(id)) return true;
        pruned = true;
        return false;
      })),
    ]));
    const positionsByMode = pruneModes(layout.positionsByMode);
    const initialPositionsByMode = pruneModes(layout.initialPositionsByMode);
    if (!pruned) return section;
    changed = true;
    return { ...section, eventLayout: { ...layout, positionsByMode, initialPositionsByMode } };
  });
  return changed ? nextSections : sections;
}

function applyEventLayoutObjectMutation(options = {}) {
  const previous = array(options.previousObjects);
  const next = array(options.nextObjects);
  const sections = array(options.secciones);
  const previousById = new Map(previous.map(object => [object?.id, object]));
  const membershipChanged = previous.length !== next.length || next.some(object =>
    !previousById.has(object?.id) || previousById.get(object.id)?.seccionId !== object?.seccionId);
  const reconcileSections = value => membershipChanged
    ? reconcileEventLayoutMembership({ previousObjects: previous, nextObjects: next, secciones: value })
    : value;
  const affected = new Set();
  if (!AUTOMATIC_POSITION_REASONS.has(options.reason)) next.forEach(object => {
    const before = previousById.get(object?.id);
    if (!before) return;
    const manualGeometryChanged = options.reason === "manual-transform" && (
      MANUAL_GEOMETRY_FIELDS.some(field => before[field] !== object[field]) ||
      (before.points !== object.points && !(Array.isArray(before.points) && Array.isArray(object.points) &&
        before.points.length === object.points.length && before.points.every((value, index) => value === object.points[index])))
    );
    if (!manualGeometryChanged && before.x === object.x && before.y === object.y && before.yNorm === object.yNorm && before.seccionId === object.seccionId) return;
    affected.add(before.seccionId);
    affected.add(object.seccionId);
  });
  if (!affected.size) return { objetos: next, secciones: reconcileSections(sections), eventDetails: options.eventDetails };
  const eligible = eligibleSectionIds([...previous, ...next], sections);
  const initialized = initializeSelectedLayouts({ ...options, objetos: previous, sectionIds: [...affected] }, eligible);
  const initializedById = new Map(initialized.objetos.map(object => [object?.id, object]));
  const nextObjects = next.map(object => {
    const before = previousById.get(object?.id);
    const materialized = initializedById.get(object?.id);
    if (!before || !materialized || materialized === before) return object;
    // Input patches are in the old canonical frame. Transfer its displacement to
    // the frozen presentation, including when the object changes section.
    return {
      ...stripEventLayoutTransientFields(object),
      x: materialized.x + (coordinate(object.x) - coordinate(before.x)),
      y: materialized.y + (coordinate(object.y) - coordinate(before.y)),
    };
  });
  return { objetos: nextObjects, secciones: reconcileSections(initialized.secciones), eventDetails: options.eventDetails };
}

module.exports = { initializeEventLayouts, transitionEventLayoutMode, resetEventLayouts, applyEventLayoutObjectMutation, reconcileEventLayoutMembership };

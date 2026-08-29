const PLACE_SELECTION_LEAF = /^event\.(ceremony|party)\.place_selection$/;

function normalizeText(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildDesignerAiLocationSearchQuery(location) {
  const source = asRecord(location);
  return [normalizeText(source.venueName), normalizeText(source.address)]
    .filter(Boolean)
    .join(", ");
}

export function getDesignerAiLocationPhaseLabel(phase, eventMode) {
  if (phase === "party") return "fiesta";
  return eventMode === "single" ? "evento" : "ceremonia";
}

export function resolveDesignerAiLocationDecisions(result, snapshot) {
  const safeResult = asRecord(result);
  const safeSnapshot = asRecord(snapshot);
  const values = asRecord(safeSnapshot.values);
  const availability = asRecord(safeSnapshot.availability);
  const explicitControlPhase = safeResult.controlRequest?.type === "google_place_picker"
    ? safeResult.controlRequest.phase
    : "";
  const resolutionByPhase = new Map();

  for (const resolution of Array.isArray(safeResult.resolutions) ? safeResult.resolutions : []) {
    const match = PLACE_SELECTION_LEAF.exec(normalizeText(resolution?.leafId));
    if (!match) continue;
    resolutionByPhase.set(match[1], resolution);
  }

  const actionPhases = new Set(
    (Array.isArray(safeResult.actions) ? safeResult.actions : [])
      .filter((action) => action?.type === "event.set_location_text")
      .map((action) => normalizeText(action?.arguments?.phase))
      .filter((phase) => phase === "ceremony" || phase === "party")
  );

  return ["ceremony", "party"].flatMap((phase) => {
    if (phase === explicitControlPhase) return [];
    if (phase === "ceremony" && availability.ceremonyLocation !== true) return [];
    if (phase === "party" && availability.partyLocation !== true) return [];
    const location = asRecord(values[phase]);
    if (location.placeSelected === true) return [];
    const resolution = resolutionByPhase.get(phase);
    const decisionPending = resolution?.status === "needs_clarification";
    const alreadyResolved = resolution?.status === "resolved_by_rule";
    if (alreadyResolved || (!decisionPending && !actionPhases.has(phase))) return [];
    const query = buildDesignerAiLocationSearchQuery(location);
    if (!query) return [];
    return [{
      phase,
      eventMode: values.eventMode === "ceremony_party" ? "ceremony_party" : "single",
      label: getDesignerAiLocationPhaseLabel(phase, values.eventMode),
      query,
      venueName: normalizeText(location.venueName),
      address: normalizeText(location.address),
      cancelled: false,
    }];
  });
}

export function buildDesignerAiGooglePlaceControlState(decision, snapshot) {
  const phase = decision?.phase === "party" ? "party" : "ceremony";
  const leafId = `event.${phase}.place_selection`;
  const leaf = snapshot?.ledger?.leaves?.find((entry) => entry?.id === leafId);
  return {
    request: { type: "google_place_picker", phase },
    leafIds: [leafId],
    baselineFingerprints: { [leafId]: normalizeText(leaf?.fingerprint) },
    initialQuery: normalizeText(decision?.query),
    eventMode: decision?.eventMode === "ceremony_party" ? "ceremony_party" : "single",
  };
}

export function buildDesignerAiManualLocationReply(decision) {
  const label = normalizeText(decision?.label) || "evento";
  return `Prefiero cargar manualmente la dirección de ${label}, sin usar Google Maps.`;
}

export function buildDesignerAiManualLocationResolution(decision) {
  const phase = decision?.phase === "party" ? "party" : "ceremony";
  return {
    leafId: `event.${phase}.place_selection`,
    status: "resolved_by_rule",
    rule: "leave_empty",
  };
}

export function isDesignerAiGooglePlaceSelectionReflected(persistedLocation, expectedLocation) {
  const persisted = asRecord(persistedLocation);
  const expected = asRecord(expectedLocation);
  const expectedPlaceId = normalizeText(expected.googlePlaceId);
  return Boolean(
    expectedPlaceId &&
    normalizeText(persisted.googlePlaceId) === expectedPlaceId &&
    normalizeText(persisted.venueName) === normalizeText(expected.venueName) &&
    normalizeText(persisted.address) === normalizeText(expected.address)
  );
}

export function isDesignerAiGooglePlaceControlReflected({
  snapshot,
  persistedLocation,
  phase,
  expectedLocation,
} = {}) {
  const safePhase = phase === "party" ? "party" : "ceremony";
  const snapshotLocation = asRecord(snapshot?.values?.[safePhase]);
  const expected = asRecord(expectedLocation);
  return Boolean(
    isDesignerAiGooglePlaceSelectionReflected(persistedLocation, expected) &&
      snapshotLocation.placeSelected === true &&
      normalizeText(snapshotLocation.venueName) === normalizeText(expected.venueName) &&
      normalizeText(snapshotLocation.address) === normalizeText(expected.address)
  );
}

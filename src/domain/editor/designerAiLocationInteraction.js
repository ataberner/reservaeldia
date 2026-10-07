import { buildDesignerAiNextStep, DESIGNER_AI_PROVENANCE, isTerminalDesignerAiLedgerStatus } from "../../../shared/designerAiConversationLedger.js";

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
  const leaves = Array.isArray(safeSnapshot.ledger?.leaves) ? safeSnapshot.ledger.leaves : [];
  const guided = safeSnapshot.conversation?.mode !== "editing";
  const nextStep = guided ? buildDesignerAiNextStep(safeSnapshot) : null;
  if (guided && !["location_method", "place_selection"].includes(nextStep?.kind)) return [];
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
    if (guided && phase !== nextStep.phase) return [];
    if (phase === explicitControlPhase) return [];
    if (phase === "ceremony" && availability.ceremonyLocation !== true) return [];
    if (phase === "party" && availability.partyLocation !== true) return [];
    const location = asRecord(values[phase]);
    if (location.placeSelected === true) return [];
    // The reread ledger owns earlier decisions too. Updating manual text does
    // not by itself reopen a Maps choice that the user already resolved.
    const selectionLeaf = leaves.find((leaf) => leaf.id === `event.${phase}.place_selection`);
    if (isTerminalDesignerAiLedgerStatus(selectionLeaf?.status)) return [];
    const resolution = resolutionByPhase.get(phase);
    const decisionPending = resolution?.status === "needs_clarification";
    const alreadyResolved = resolution?.status === "resolved_by_rule";
    if (!guided && (alreadyResolved || (!decisionPending && !actionPhases.has(phase)))) return [];
    // Passive guided controls follow the same fresh step as the question, even
    // on entry with no model actions. Template text is never a search preload.
    const trustedValue = (field, value) => {
      const leaf = leaves.find((entry) => entry.id === `event.${phase}.${field}`);
      return isTerminalDesignerAiLedgerStatus(leaf?.status) &&
        [DESIGNER_AI_PROVENANCE.USER_CURRENT_SESSION, DESIGNER_AI_PROVENANCE.EXISTING_USER_DATA].includes(leaf?.provenance)
        ? normalizeText(value) : "";
    };
    const venueName = guided ? trustedValue("venue_name", location.venueName) : normalizeText(location.venueName);
    const address = guided ? trustedValue("address", location.address) : normalizeText(location.address);
    const query = buildDesignerAiLocationSearchQuery({ venueName, address });
    if (!guided && !query) return [];
    return [{
      phase,
      eventMode: values.eventMode === "ceremony_party" ? "ceremony_party" : "single",
      label: getDesignerAiLocationPhaseLabel(phase, values.eventMode),
      query,
      venueName,
      address,
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

// Use only after the location owner's durable write. A selected place confirms
// the supplied text too, even when it happens to equal the template/baseline.
export function getDesignerAiGooglePlaceVerifiedLeafIds(input = {}) {
  const { snapshot, phase, expectedLocation } = input;
  if (!["ceremony", "party"].includes(phase) || !isDesignerAiGooglePlaceControlReflected(input)) return [];
  const expected = asRecord(expectedLocation);
  const eligible = new Set((snapshot?.ledger?.leaves || [])
    .filter(leaf => !["unavailable", "not_applicable_by_dependency"].includes(leaf.status))
    .map(leaf => leaf.id));
  const selectionId = `event.${phase}.place_selection`;
  if (!eligible.has(selectionId)) return [];
  return [selectionId,
    ...(normalizeText(expected.googleDisplayName) && normalizeText(expected.venueName) ? [`event.${phase}.venue_name`] : []),
    ...(normalizeText(expected.googleFormattedAddress) && normalizeText(expected.address) ? [`event.${phase}.address`] : []),
  ].filter(id => eligible.has(id));
}

const LEDGER_VERSION = 3;

const DESIGNER_AI_LEDGER_STATUSES = Object.freeze({
  UNAVAILABLE: "unavailable",
  PENDING: "pending",
  NEEDS_CLARIFICATION: "needs_clarification",
  REQUIRES_CONTROL: "requires_control",
  RESOLVED_FROM_USER: "resolved_from_user",
  RESOLVED_FROM_EXISTING_USER_DATA: "resolved_from_existing_user_data",
  RESOLVED_BY_RULE: "resolved_by_rule",
  RESOLVED_BY_CONTROL: "resolved_by_control",
  NOT_APPLICABLE_BY_DEPENDENCY: "not_applicable_by_dependency",
});

const DESIGNER_AI_PROVENANCE = Object.freeze({
  USER_CURRENT_SESSION: "user_current_session",
  EXISTING_USER_DATA: "existing_user_data",
  AUTOMATIC_RULE: "automatic_rule",
  SYSTEM_DEFAULT: "system_default",
  TEMPLATE_VALUE: "template_value",
  PLACEHOLDER_OR_SAMPLE: "placeholder_or_sample",
  UNKNOWN: "unknown",
});

const DESIGNER_AI_RESOLUTION_RULES = Object.freeze({
  AUTOMATIC_EVENT_NAME: "automatic_event_name",
  OPTIONAL_END_TIME_OMITTED: "optional_end_time_omitted",
  OPTIONAL_VENUE_NAME_OMITTED: "optional_venue_name_omitted",
  SAME_DAY_PARTY: "same_day_party",
  CATALOG_DEFAULTS: "catalog_defaults",
  SYSTEM_DEFAULT: "system_default",
  PRESERVE_WHILE_INACTIVE: "preserve_while_inactive",
  KEEP_EXISTING: "keep_existing",
  LEAVE_EMPTY: "leave_empty",
  RECOMMENDED_ORDER: "recommended_order",
});

const TERMINAL_STATUSES = new Set([
  DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_USER,
  DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_EXISTING_USER_DATA,
  DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE,
  DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL,
  DESIGNER_AI_LEDGER_STATUSES.NOT_APPLICABLE_BY_DEPENDENCY,
]);

const GUIDED_FLOW_BLOCKS = Object.freeze([
  { id: "names", label: "nombres de quienes se casan" },
  { id: "event_structure", label: "estructura del evento" },
  { id: "event_data", label: "fecha, horarios y lugares del evento" },
  { id: "gifts", label: "regalos" },
  { id: "dress_code", label: "dress code" },
  { id: "cover", label: "foto de portada" },
  { id: "galleries", label: "fotos de Galleries" },
]);

// Alias conservado para consumidores existentes. Esta lista es la única
// prioridad ejecutable del recorrido guiado.
const CONVERSATION_BLOCKS = GUIDED_FLOW_BLOCKS;

const RSVP_SYSTEM_DEFAULTS = Object.freeze({
  modalTitle: "Confirmar asistencia",
  modalSubtitle: "Completa el formulario para confirmar tu presencia.",
  submitLabel: "Enviar",
  primaryColor: "#773dbe",
});
const GIFTS_SYSTEM_DEFAULTS = Object.freeze({
  introText: "Lo mas importante es compartir este dia con ustedes. Si ademas desean hacernos un regalo, pueden hacerlo por alguno de los siguientes medios.",
  buttonText: "Ver regalos",
});

const PLACEHOLDER_PATTERNS = [
  /borgo(?:n|ñ)a/i,
  /floral contempor/i,
  /nombre (?:de la |de el |de |del |la )?(?:novi|pareja|persona)/i,
  /sal[oó]n (?:de )?(?:ejemplo|demo)/i,
  /direcci[oó]n (?:de )?(?:ejemplo|demo)/i,
  /lorem ipsum/i,
  /texto de (?:ejemplo|muestra)/i,
  /^(?:borrador|mi invitaci[oó]n|sin t[ií]tulo)$/i,
];

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildDesignerAiGalleryCompletionLeafId(galleryId) {
  const normalizedGalleryId = normalizeText(galleryId);
  return normalizedGalleryId
    ? `media.gallery.${normalizedGalleryId}.guided_completion`
    : "";
}

function fingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `dai-${(hash >>> 0).toString(36)}`;
}

function isTerminalDesignerAiLedgerStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

function isLikelyPlaceholder(value) {
  const text = normalizeText(value);
  return Boolean(text && PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)));
}

function hasMeaningfulValue(value) {
  if (typeof value === "string") return normalizeText(value).length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "present")) return value.present === true;
    if (Object.prototype.hasOwnProperty.call(value, "occupied")) return value.occupied === true;
    return Object.values(value).some(hasMeaningfulValue);
  }
  return false;
}

function buildAutomaticEventName(primaryName, secondaryName) {
  const primary = normalizeText(primaryName);
  const secondary = normalizeText(secondaryName);
  if (!primary || !secondary || isLikelyPlaceholder(primary) || isLikelyPlaceholder(secondary)) {
    return "";
  }
  return `Casamiento ${primary} y ${secondary}`;
}

function normalizeDesignerAiConversationState(value) {
  const source = asRecord(value);
  const namePolicySource = asRecord(source.namePolicy);
  const usageSource = asRecord(source.usage);
  const mode = ["automatic", "explicit", "unknown"].includes(namePolicySource.mode)
    ? namePolicySource.mode
    : "unknown";
  const resolutions = (Array.isArray(source.resolutions) ? source.resolutions : [])
    .filter((item) => normalizeText(item?.leafId))
    .slice(0, 700)
    .map((item) => ({
      leafId: normalizeText(item.leafId).slice(0, 180),
      status: normalizeText(item.status),
      provenance: normalizeText(item.provenance),
      rule: normalizeText(item.rule) || null,
      fingerprint: normalizeText(item.fingerprint).slice(0, 120),
    }));
  const baseline = (Array.isArray(source.baseline) ? source.baseline : [])
    .filter((item) => normalizeText(item?.leafId))
    .slice(0, 700)
    .map((item) => ({
      leafId: normalizeText(item.leafId).slice(0, 180),
      fingerprint: normalizeText(item.fingerprint).slice(0, 120),
      provenance: Object.values(DESIGNER_AI_PROVENANCE).includes(item.provenance)
        ? item.provenance
        : DESIGNER_AI_PROVENANCE.UNKNOWN,
    }));
  return {
    version: LEDGER_VERSION,
    usage: {
      hasStarted: usageSource.hasStarted === true,
    },
    namePolicy: {
      mode,
      lastAutomaticName: normalizeText(namePolicySource.lastAutomaticName).slice(0, 120),
    },
    baseline,
    resolutions,
  };
}

function prepareDesignerAiConversationEntry(value) {
  const requestState = normalizeDesignerAiConversationState(value);
  const entryMode = requestState.usage.hasStarted === true
    ? "reentry"
    : "first_entry";
  return {
    entryMode,
    requestState,
    persistedState: normalizeDesignerAiConversationState({
      ...requestState,
      usage: { hasStarted: true },
    }),
  };
}

function resolutionForLeaf(conversationState, leafId, valueFingerprint) {
  const resolution = conversationState.resolutions.find((item) => item.leafId === leafId);
  if (!resolution || resolution.fingerprint !== valueFingerprint) return null;
  if (!isTerminalDesignerAiLedgerStatus(resolution.status) && ![
    DESIGNER_AI_LEDGER_STATUSES.NEEDS_CLARIFICATION,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL,
  ].includes(resolution.status)) return null;
  return resolution;
}

function baselineForLeaf(conversationState, leafId) {
  return conversationState.baseline.find((item) => item.leafId === leafId) || null;
}

function hasDemonstrableExistingValue({ leafId, value, sourceContext, conversationState }) {
  if (!hasMeaningfulValue(value)) return false;
  const valueFingerprint = fingerprint(value);
  const baseline = baselineForLeaf(conversationState, leafId);
  if (baseline && baseline.fingerprint !== valueFingerprint) return true;
  const changedKeys = new Set(Array.isArray(sourceContext.changedKeys) ? sourceContext.changedKeys : []);
  const dynamicKeyByLeaf = {
    "event.people.primary_name": "event_primary_person_name",
    "event.people.secondary_name": "event_secondary_person_name",
    "event.ceremony.date": "event_ceremony_date",
    "event.ceremony.start_time": "event_ceremony_start_time",
    "event.ceremony.end_time": "event_ceremony_end_time",
    "event.ceremony.venue_name": "event_ceremony_venue_name",
    "event.ceremony.address": "event_ceremony_venue_address",
    "event.party.date": "event_party_date",
    "event.party.start_time": "event_party_start_time",
    "event.party.end_time": "event_party_end_time",
    "event.party.venue_name": "event_party_venue_name",
    "event.party.address": "event_party_venue_address",
    "event.dress_code.value": "dress_code",
    "story.text": "texto_historia",
  };
  if (changedKeys.has(dynamicKeyByLeaf[leafId])) return true;
  if (sourceContext.templateDerived === true) return false;
  return normalizeText(value).length > 0 && !isLikelyPlaceholder(value);
}

function provenanceForInitialValue({ leafId, value, sourceContext, conversationState, systemDefault = false }) {
  if (isLikelyPlaceholder(value)) return DESIGNER_AI_PROVENANCE.PLACEHOLDER_OR_SAMPLE;
  if (systemDefault) return DESIGNER_AI_PROVENANCE.SYSTEM_DEFAULT;
  if (hasDemonstrableExistingValue({ leafId, value, sourceContext, conversationState })) {
    return DESIGNER_AI_PROVENANCE.EXISTING_USER_DATA;
  }
  if (sourceContext.templateDerived === true && normalizeText(value)) {
    return DESIGNER_AI_PROVENANCE.TEMPLATE_VALUE;
  }
  return DESIGNER_AI_PROVENANCE.UNKNOWN;
}

function createLeaf({
  id,
  block,
  value,
  available = true,
  sourceContext,
  conversationState,
  defaultRequiresControl = false,
  existingCanResolve = true,
  systemDefault = false,
}) {
  const valueFingerprint = fingerprint(value);
  if (!available) {
    return { id, block, status: DESIGNER_AI_LEDGER_STATUSES.UNAVAILABLE, provenance: DESIGNER_AI_PROVENANCE.UNKNOWN, rule: null, fingerprint: valueFingerprint };
  }
  const persisted = resolutionForLeaf(conversationState, id, valueFingerprint);
  if (persisted) {
    return { id, block, status: persisted.status, provenance: persisted.provenance, rule: persisted.rule, fingerprint: valueFingerprint };
  }
  const provenance = provenanceForInitialValue({ leafId: id, value, sourceContext, conversationState, systemDefault });
  if (existingCanResolve && provenance === DESIGNER_AI_PROVENANCE.EXISTING_USER_DATA) {
    return { id, block, status: DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_EXISTING_USER_DATA, provenance, rule: null, fingerprint: valueFingerprint };
  }
  return {
    id,
    block,
    status: defaultRequiresControl ? DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL : DESIGNER_AI_LEDGER_STATUSES.PENDING,
    provenance,
    rule: null,
    fingerprint: valueFingerprint,
  };
}

function applyDependency(leaf, dependencyResolved, applicable) {
  if (!dependencyResolved) return leaf;
  if (applicable) {
    return leaf.status === DESIGNER_AI_LEDGER_STATUSES.NOT_APPLICABLE_BY_DEPENDENCY
      ? { ...leaf, status: DESIGNER_AI_LEDGER_STATUSES.PENDING, provenance: DESIGNER_AI_PROVENANCE.UNKNOWN, rule: null }
      : leaf;
  }
  return { ...leaf, status: DESIGNER_AI_LEDGER_STATUSES.NOT_APPLICABLE_BY_DEPENDENCY, provenance: DESIGNER_AI_PROVENANCE.AUTOMATIC_RULE, rule: "parent_inactive" };
}

function buildDesignerAiGuidedFlow({ leaves, values }) {
  const byId = new Map(leaves.map((leaf) => [leaf.id, leaf]));
  const leafIds = [];
  const include = (leafId) => {
    const leaf = byId.get(leafId);
    if (!leaf || leaf.status === DESIGNER_AI_LEDGER_STATUSES.UNAVAILABLE) return;
    if (!leafIds.includes(leafId)) leafIds.push(leafId);
  };
  const includePrefix = (prefix) => {
    for (const leaf of leaves) {
      if (leaf.id.startsWith(prefix)) include(leaf.id);
    }
  };

  include("event.people.primary_name");
  include("event.people.secondary_name");
  include("event.mode");

  includePrefix("event.ceremony.");
  const modeLeaf = byId.get("event.mode");
  if (
    values.eventMode === "ceremony_party" &&
    isTerminalDesignerAiLedgerStatus(modeLeaf?.status)
  ) {
    includePrefix("event.party.");
  }

  include("gifts.enabled");
  const giftsEnabledLeaf = byId.get("gifts.enabled");
  if (
    values.gifts?.enabled === true &&
    isTerminalDesignerAiLedgerStatus(giftsEnabledLeaf?.status)
  ) {
    includePrefix("gifts.method.");
    include("gifts.intro_text");
    include("gifts.button_text");
  }

  include("event.dress_code.enabled");
  const dressEnabledLeaf = byId.get("event.dress_code.enabled");
  if (
    values.dressCode?.enabled === true &&
    isTerminalDesignerAiLedgerStatus(dressEnabledLeaf?.status)
  ) {
    include("event.dress_code.value");
  }

  include("media.cover");
  for (const gallery of Array.isArray(values.galleries) ? values.galleries : []) {
    const galleryId = normalizeText(gallery?.id);
    if (!galleryId) continue;
    include(buildDesignerAiGalleryCompletionLeafId(galleryId));
  }

  const unresolvedLeafIds = leafIds.filter(
    (leafId) => !isTerminalDesignerAiLedgerStatus(byId.get(leafId)?.status)
  );
  return {
    leafIds,
    completion: {
      availableCount: leafIds.length,
      terminalCount: leafIds.length - unresolvedLeafIds.length,
      unresolvedLeafIds,
      complete: unresolvedLeafIds.length === 0,
    },
  };
}

function buildDesignerAiLedger({ availability = {}, values = {}, conversationState = {}, sourceContext = {} } = {}) {
  const state = normalizeDesignerAiConversationState(conversationState);
  const source = {
    templateDerived: sourceContext?.templateDerived === true,
    changedKeys: Array.isArray(sourceContext?.changedKeys) ? sourceContext.changedKeys.map(normalizeText) : [],
  };
  const leaves = [];
  const add = (input) => leaves.push(createLeaf({ ...input, sourceContext: source, conversationState: state }));
  const people = asRecord(values.people);
  const ceremony = asRecord(values.ceremony);
  const party = asRecord(values.party);
  const dressCode = asRecord(values.dressCode);

  add({ id: "document.name", block: "outside_guided_flow", value: values.documentName, available: availability.documentName, existingCanResolve: true });
  add({ id: "event.people.primary_name", block: "names", value: people.primaryName, available: availability.people });
  add({ id: "event.people.secondary_name", block: "names", value: people.secondaryName, available: availability.people });
  add({ id: "event.mode", block: "event_structure", value: values.eventMode, available: availability.eventMode, existingCanResolve: false });

  for (const [phase, data, datetimeAvailable, locationAvailable] of [
    ["ceremony", ceremony, availability.ceremonyDatetime, availability.ceremonyLocation],
    ["party", party, availability.partyDatetime, availability.partyLocation],
  ]) {
    add({ id: `event.${phase}.date`, block: "event_data", value: data.date, available: datetimeAvailable });
    add({ id: `event.${phase}.start_time`, block: "event_data", value: data.startTime, available: datetimeAvailable });
    add({ id: `event.${phase}.end_time`, block: "event_data", value: data.endTime, available: datetimeAvailable });
    add({ id: `event.${phase}.venue_name`, block: "event_data", value: data.venueName, available: locationAvailable });
    add({ id: `event.${phase}.address`, block: "event_data", value: data.address, available: locationAvailable });
    add({ id: `event.${phase}.place_selection`, block: "event_data", value: data.placeSelected === true, available: locationAvailable, defaultRequiresControl: Boolean(normalizeText(data.address)) && data.placeSelected !== true, existingCanResolve: data.placeSelected === true });
  }

  add({ id: "event.dress_code.enabled", block: "dress_code", value: dressCode.enabled === true, available: availability.dressCode, existingCanResolve: false });
  add({ id: "event.dress_code.value", block: "dress_code", value: dressCode.value, available: availability.dressCode });
  add({ id: "story.text", block: "outside_guided_flow", value: values.story, available: availability.story });
  add({ id: "media.cover", block: "cover", value: { present: values.media?.hasCover === true, revision: values.media?.contentRevision || "" }, available: availability.cover, defaultRequiresControl: availability.cover === true });

  for (const gallery of Array.isArray(values.galleries) ? values.galleries : []) {
    const galleryId = normalizeText(gallery?.id);
    if (!galleryId) continue;
    const gallerySlots = Array.isArray(gallery.slots) ? gallery.slots : [];
    add({
      id: buildDesignerAiGalleryCompletionLeafId(galleryId),
      block: "galleries",
      value: { galleryId, applicable: gallerySlots.length > 0 },
      available: gallerySlots.length > 0,
      defaultRequiresControl: true,
      existingCanResolve: false,
    });
    const occupiedCount = gallerySlots.filter((slot) => slot?.occupied === true).length;
    for (const slot of gallerySlots) {
      const slotKey = normalizeText(slot?.cellId) || String(slot?.index ?? "");
      add({ id: `media.gallery.${galleryId}.slot.${slotKey}`, block: "outside_guided_flow", value: { occupied: slot?.occupied === true, revision: slot?.contentRevision || "" }, available: true, defaultRequiresControl: true });
    }
    add({ id: `media.gallery.${galleryId}.order`, block: "outside_guided_flow", value: gallery.slots, available: true, existingCanResolve: false });
    const orderLeaf = leaves[leaves.length - 1];
    if (occupiedCount < 2) Object.assign(orderLeaf, { status: DESIGNER_AI_LEDGER_STATUSES.NOT_APPLICABLE_BY_DEPENDENCY, provenance: DESIGNER_AI_PROVENANCE.AUTOMATIC_RULE, rule: "fewer_than_two_photos" });
  }

  const rsvp = asRecord(values.rsvp);
  add({ id: "rsvp.enabled", block: "outside_guided_flow", value: rsvp.enabled === true, available: availability.rsvp, existingCanResolve: false });
  add({ id: "rsvp.questions.order", block: "outside_guided_flow", value: (rsvp.questions || []).map((question) => question.id), available: availability.rsvp, existingCanResolve: false });
  for (const question of Array.isArray(rsvp.questions) ? rsvp.questions : []) {
    const prefix = `rsvp.question.${question.id}`;
    add({ id: `${prefix}.active`, block: "outside_guided_flow", value: question.active === true, available: availability.rsvp, existingCanResolve: false });
    add({ id: `${prefix}.label`, block: "outside_guided_flow", value: question.label, available: availability.rsvp });
    add({ id: `${prefix}.type`, block: "outside_guided_flow", value: question.type, available: availability.rsvp, existingCanResolve: false });
    add({ id: `${prefix}.required`, block: "outside_guided_flow", value: question.required === true, available: availability.rsvp, existingCanResolve: false });
    add({ id: `${prefix}.options`, block: "outside_guided_flow", value: question.options, available: availability.rsvp, existingCanResolve: false });
  }

  const modal = asRecord(rsvp.modal);
  add({ id: "rsvp.modal.title", block: "outside_guided_flow", value: modal.title, available: availability.rsvp, systemDefault: normalizeText(modal.title) === RSVP_SYSTEM_DEFAULTS.modalTitle });
  add({ id: "rsvp.modal.subtitle", block: "outside_guided_flow", value: modal.subtitle, available: availability.rsvp, systemDefault: normalizeText(modal.subtitle) === RSVP_SYSTEM_DEFAULTS.modalSubtitle });
  add({ id: "rsvp.modal.submit_label", block: "outside_guided_flow", value: modal.submitLabel, available: availability.rsvp, systemDefault: normalizeText(modal.submitLabel) === RSVP_SYSTEM_DEFAULTS.submitLabel });
  add({ id: "rsvp.modal.primary_color", block: "outside_guided_flow", value: modal.primaryColor, available: availability.rsvp, systemDefault: normalizeText(modal.primaryColor).toLowerCase() === RSVP_SYSTEM_DEFAULTS.primaryColor });

  const gifts = asRecord(values.gifts);
  add({ id: "gifts.enabled", block: "gifts", value: gifts.enabled === true, available: availability.gifts, existingCanResolve: false });
  for (const [method, data] of Object.entries(asRecord(gifts.methods))) {
    add({ id: `gifts.method.${method}.visible`, block: "gifts", value: data?.visible === true, available: availability.gifts, existingCanResolve: false });
    add({ id: `gifts.method.${method}.value`, block: "gifts", value: method === "giftListLink" ? data?.configured === true : data?.value, available: availability.gifts });
  }
  add({ id: "gifts.intro_text", block: "gifts", value: gifts.introText, available: availability.gifts, systemDefault: normalizeText(gifts.introText) === GIFTS_SYSTEM_DEFAULTS.introText });
  add({ id: "gifts.button_text", block: "gifts", value: gifts.buttonText, available: availability.gifts, systemDefault: normalizeText(gifts.buttonText) === GIFTS_SYSTEM_DEFAULTS.buttonText });

  const byId = new Map(leaves.map((leaf) => [leaf.id, leaf]));
  const modeLeaf = byId.get("event.mode");
  const modeResolved = modeLeaf && isTerminalDesignerAiLedgerStatus(modeLeaf.status);
  for (const leaf of leaves.filter((item) => item.id.startsWith("event.party."))) {
    Object.assign(leaf, applyDependency(leaf, modeResolved, values.eventMode === "ceremony_party"));
  }
  const dressEnabledLeaf = byId.get("event.dress_code.enabled");
  const dressValueLeaf = byId.get("event.dress_code.value");
  if (dressValueLeaf) Object.assign(dressValueLeaf, applyDependency(dressValueLeaf, isTerminalDesignerAiLedgerStatus(dressEnabledLeaf?.status), dressCode.enabled === true));

  for (const question of Array.isArray(rsvp.questions) ? rsvp.questions : []) {
    const activeLeaf = byId.get(`rsvp.question.${question.id}.active`);
    const activeResolved = isTerminalDesignerAiLedgerStatus(activeLeaf?.status);
    for (const suffix of ["label", "type", "required", "options"]) {
      const leaf = byId.get(`rsvp.question.${question.id}.${suffix}`);
      if (!leaf) continue;
      const applicable = question.active === true && (suffix !== "options" || question.type === "single_select");
      Object.assign(leaf, applyDependency(leaf, activeResolved, applicable));
    }
  }
  const questionActiveLeaves = (Array.isArray(rsvp.questions) ? rsvp.questions : [])
    .map((question) => byId.get(`rsvp.question.${question.id}.active`))
    .filter(Boolean);
  const questionOrderLeaf = byId.get("rsvp.questions.order");
  if (
    questionOrderLeaf &&
    questionActiveLeaves.length > 0 &&
    questionActiveLeaves.every((leaf) => isTerminalDesignerAiLedgerStatus(leaf.status)) &&
    (Array.isArray(rsvp.questions) ? rsvp.questions : []).filter((question) => question.active === true).length < 2
  ) {
    Object.assign(questionOrderLeaf, {
      status: DESIGNER_AI_LEDGER_STATUSES.NOT_APPLICABLE_BY_DEPENDENCY,
      provenance: DESIGNER_AI_PROVENANCE.AUTOMATIC_RULE,
      rule: "fewer_than_two_active_questions",
    });
  }

  const rsvpEnabledLeaf = byId.get("rsvp.enabled");
  if (rsvp.enabled === true && isTerminalDesignerAiLedgerStatus(rsvpEnabledLeaf?.status)) {
    for (const leaf of leaves.filter((item) => item.id.startsWith("rsvp.") && item.id !== "rsvp.enabled")) {
      if (leaf.rule === DESIGNER_AI_RESOLUTION_RULES.PRESERVE_WHILE_INACTIVE) {
        Object.assign(leaf, { status: DESIGNER_AI_LEDGER_STATUSES.PENDING, provenance: DESIGNER_AI_PROVENANCE.UNKNOWN, rule: null });
      }
    }
  }
  const giftsEnabledLeaf = byId.get("gifts.enabled");
  if (gifts.enabled === true && isTerminalDesignerAiLedgerStatus(giftsEnabledLeaf?.status)) {
    for (const leaf of leaves.filter((item) => item.id.startsWith("gifts.") && item.id !== "gifts.enabled")) {
      if (leaf.rule === DESIGNER_AI_RESOLUTION_RULES.PRESERVE_WHILE_INACTIVE) {
        Object.assign(leaf, { status: DESIGNER_AI_LEDGER_STATUSES.PENDING, provenance: DESIGNER_AI_PROVENANCE.UNKNOWN, rule: null });
      }
    }
  }
  if (gifts.enabled === true && isTerminalDesignerAiLedgerStatus(giftsEnabledLeaf?.status)) {
    const hasCompleteVisibleMethod = Object.values(asRecord(gifts.methods)).some((method) => (
      method?.visible === true && (
        method?.configured === true || normalizeText(method?.value).length > 0
      )
    ));
    if (!hasCompleteVisibleMethod) {
      Object.assign(giftsEnabledLeaf, {
        status: DESIGNER_AI_LEDGER_STATUSES.NEEDS_CLARIFICATION,
        rule: null,
      });
    }
  }

  const availableLeaves = leaves.filter((leaf) => leaf.status !== DESIGNER_AI_LEDGER_STATUSES.UNAVAILABLE);
  const unresolvedLeafIds = availableLeaves.filter((leaf) => !isTerminalDesignerAiLedgerStatus(leaf.status)).map((leaf) => leaf.id);
  const guidedFlow = buildDesignerAiGuidedFlow({ leaves, values });
  return {
    version: LEDGER_VERSION,
    leaves,
    completion: {
      availableCount: availableLeaves.length,
      terminalCount: availableLeaves.length - unresolvedLeafIds.length,
      unresolvedLeafIds,
      complete: unresolvedLeafIds.length === 0,
    },
    guidedFlow,
  };
}

function buildDesignerAiConversationBrief(snapshot) {
  const leaves = Array.isArray(snapshot?.ledger?.leaves) ? snapshot.ledger.leaves : [];
  const guidedLeafIds = new Set(
    Array.isArray(snapshot?.ledger?.guidedFlow?.leafIds)
      ? snapshot.ledger.guidedFlow.leafIds
      : []
  );
  const unresolved = leaves.filter((leaf) => (
    guidedLeafIds.has(leaf.id) &&
    leaf.status !== DESIGNER_AI_LEDGER_STATUSES.UNAVAILABLE &&
    !isTerminalDesignerAiLedgerStatus(leaf.status)
  ));
  const blocks = CONVERSATION_BLOCKS.map((block) => ({
    id: block.id,
    label: block.label,
    leafIds: unresolved.filter((leaf) => leaf.block === block.id).map((leaf) => leaf.id),
  })).filter((block) => block.leafIds.length > 0);
  return {
    nextBlock: blocks[0] || null,
    needsAttention: blocks,
    unresolvedLeafIds: unresolved.map((leaf) => leaf.id),
    complete: snapshot?.ledger?.guidedFlow?.completion?.complete === true,
  };
}

function mapActionToLeafIds(action) {
  const args = asRecord(action?.arguments);
  switch (action?.type) {
    case "document.set_name": return ["document.name"];
    case "event.set_people": return ["event.people.primary_name", "event.people.secondary_name"];
    case "event.set_mode": return ["event.mode"];
    case "event.set_datetime": return ["date", "startTime", "endTime"].filter((key) => args[key] !== null && args[key] !== undefined).map((key) => `event.${args.phase}.${key === "startTime" ? "start_time" : key === "endTime" ? "end_time" : "date"}`);
    case "event.set_location_text": return [
      ...(normalizeText(args.venueName) ? [`event.${args.phase}.venue_name`] : []),
      ...(normalizeText(args.address) ? [`event.${args.phase}.address`] : []),
    ];
    case "event.set_dress_code": return ["event.dress_code.enabled", ...(args.enabled ? ["event.dress_code.value"] : [])];
    case "story.set_text": return ["story.text"];
    case "gallery.move_photo": return [`media.gallery.${args.galleryId}.order`];
    case "rsvp.set_enabled": return ["rsvp.enabled"];
    case "rsvp.set_question_active": return [`rsvp.question.${args.questionId}.active`];
    case "rsvp.update_question": return [
      ...(args.label !== null ? [`rsvp.question.${args.questionId}.label`] : []),
      ...(args.questionType !== null ? [`rsvp.question.${args.questionId}.type`] : []),
      ...(args.required !== null ? [`rsvp.question.${args.questionId}.required`] : []),
    ];
    case "rsvp.move_question": return ["rsvp.questions.order"];
    case "rsvp.add_option":
    case "rsvp.rename_option":
    case "rsvp.remove_option": return [`rsvp.question.${args.questionId}.options`];
    case "rsvp.update_modal": return [
      ...(args.title !== null ? ["rsvp.modal.title"] : []),
      ...(args.subtitle !== null ? ["rsvp.modal.subtitle"] : []),
      ...(args.submitLabel !== null ? ["rsvp.modal.submit_label"] : []),
      ...(args.primaryColor !== null ? ["rsvp.modal.primary_color"] : []),
    ];
    case "gifts.set_enabled": return ["gifts.enabled"];
    case "gifts.set_method": return [`gifts.method.${args.method}.visible`, ...(args.value !== null ? [`gifts.method.${args.method}.value`] : [])];
    case "gifts.set_intro_text": return ["gifts.intro_text"];
    case "gifts.set_button_text": return ["gifts.button_text"];
    default: return [];
  }
}

function reconcileDesignerAiConversationState({ snapshot, previousState, actions = [], resolutions = [], controlLeafIds = [] } = {}) {
  const state = normalizeDesignerAiConversationState(previousState);
  const nextSnapshot = snapshot || {};
  const leaves = Array.isArray(nextSnapshot?.ledger?.leaves) ? nextSnapshot.ledger.leaves : [];
  const leafById = new Map(leaves.map((leaf) => [leaf.id, leaf]));
  const updates = new Map();
  for (const action of Array.isArray(actions) ? actions : []) {
    for (const leafId of mapActionToLeafIds(action)) {
      updates.set(leafId, { leafId, status: DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_USER, provenance: DESIGNER_AI_PROVENANCE.USER_CURRENT_SESSION, rule: null });
    }
  }
  for (const resolution of Array.isArray(resolutions) ? resolutions : []) {
    const leafId = normalizeText(resolution?.leafId);
    if (!leafById.has(leafId)) continue;
    const status = resolution?.status;
    const rule = normalizeText(resolution?.rule) || null;
    const provenance = status === DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE
      ? (rule === DESIGNER_AI_RESOLUTION_RULES.SYSTEM_DEFAULT || rule === DESIGNER_AI_RESOLUTION_RULES.CATALOG_DEFAULTS ? DESIGNER_AI_PROVENANCE.SYSTEM_DEFAULT : DESIGNER_AI_PROVENANCE.AUTOMATIC_RULE)
      : DESIGNER_AI_PROVENANCE.USER_CURRENT_SESSION;
    updates.set(leafId, { leafId, status, provenance, rule });
  }
  for (const leafId of Array.isArray(controlLeafIds) ? controlLeafIds : []) {
    if (!leafById.has(leafId)) continue;
    updates.set(leafId, { leafId, status: DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL, provenance: DESIGNER_AI_PROVENANCE.USER_CURRENT_SESSION, rule: null });
  }
  const existing = new Map(state.resolutions.map((item) => [item.leafId, item]));
  for (const [leafId, update] of updates) {
    const leaf = leafById.get(leafId);
    if (!leaf) continue;
    existing.set(leafId, { ...update, fingerprint: leaf.fingerprint });
  }
  const baseline = state.baseline.length > 0 ? state.baseline : leaves.map((leaf) => ({ leafId: leaf.id, fingerprint: leaf.fingerprint, provenance: leaf.provenance || DESIGNER_AI_PROVENANCE.UNKNOWN }));
  const nameAction = (Array.isArray(actions) ? actions : []).find((action) => action?.type === "document.set_name");
  const automaticResolution = (Array.isArray(resolutions) ? resolutions : []).find((item) => item?.leafId === "document.name" && item?.rule === DESIGNER_AI_RESOLUTION_RULES.AUTOMATIC_EVENT_NAME);
  const namePolicy = nameAction
    ? automaticResolution
      ? { mode: "automatic", lastAutomaticName: normalizeText(nameAction.arguments?.name) }
      : { mode: "explicit", lastAutomaticName: state.namePolicy.lastAutomaticName }
    : state.namePolicy;
  return normalizeDesignerAiConversationState({ ...state, baseline, resolutions: [...existing.values()], namePolicy });
}

module.exports = {
  CONVERSATION_BLOCKS,
  GUIDED_FLOW_BLOCKS,
  DESIGNER_AI_LEDGER_STATUSES,
  DESIGNER_AI_PROVENANCE,
  DESIGNER_AI_RESOLUTION_RULES,
  LEDGER_VERSION,
  buildAutomaticEventName,
  buildDesignerAiGalleryCompletionLeafId,
  buildDesignerAiConversationBrief,
  buildDesignerAiLedger,
  fingerprintDesignerAiValue: fingerprint,
  isLikelyDesignerAiPlaceholder: isLikelyPlaceholder,
  isTerminalDesignerAiLedgerStatus,
  mapDesignerAiActionToLeafIds: mapActionToLeafIds,
  normalizeDesignerAiConversationState,
  prepareDesignerAiConversationEntry,
  reconcileDesignerAiConversationState,
};

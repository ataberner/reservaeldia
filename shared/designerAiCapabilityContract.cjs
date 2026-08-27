const conversationLedger = require("./designerAiConversationLedger.cjs");

const DESIGNER_AI_CONTRACT_VERSION = "2.0.0";

const DESIGNER_AI_ACTION_ORIGINS = Object.freeze({
  MODEL: "model",
  TRUSTED_CONTROL: "trusted_control",
});

const DESIGNER_AI_MODEL_ACTION_TYPES = Object.freeze([
  "document.set_name",
  "event.set_people",
  "event.set_mode",
  "event.set_datetime",
  "event.set_location_text",
  "event.set_dress_code",
  "story.set_text",
  "gallery.move_photo",
  "rsvp.set_enabled",
  "rsvp.set_question_active",
  "rsvp.update_question",
  "rsvp.move_question",
  "rsvp.add_option",
  "rsvp.rename_option",
  "rsvp.remove_option",
  "rsvp.update_modal",
  "gifts.set_enabled",
  "gifts.set_method",
  "gifts.set_intro_text",
  "gifts.set_button_text",
]);

const DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES = Object.freeze([
  "media.replace_cover",
  "media.set_gallery_cell",
  "event.select_google_place",
]);

const DESIGNER_AI_CONTROL_TYPES = Object.freeze([
  "cover_upload",
  "gallery_cell_upload",
  "google_place_picker",
]);

const MODEL_ACTION_SET = new Set(DESIGNER_AI_MODEL_ACTION_TYPES);
const TRUSTED_ACTION_SET = new Set(DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES);
const CONTROL_SET = new Set(DESIGNER_AI_CONTROL_TYPES);
const EVENT_PHASE_SET = new Set(["ceremony", "party"]);
const EVENT_MODE_SET = new Set(["single", "ceremony_party"]);
const RSVP_QUESTION_TYPE_SET = new Set([
  "short_text",
  "long_text",
  "single_select",
  "boolean",
  "number",
  "phone",
]);
const GIFT_METHOD_SET = new Set([
  "holder",
  "bank",
  "alias",
  "cbu",
  "cuit",
  "giftListLink",
]);

const MODEL_RESOLUTION_STATUS_SET = new Set([
  conversationLedger.DESIGNER_AI_LEDGER_STATUSES.NEEDS_CLARIFICATION,
  conversationLedger.DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL,
  conversationLedger.DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_USER,
  conversationLedger.DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE,
]);
const RESOLUTION_RULE_SET = new Set(Object.values(conversationLedger.DESIGNER_AI_RESOLUTION_RULES));

const SNAPSHOT_AVAILABILITY_KEYS = Object.freeze([
  "documentName",
  "people",
  "eventMode",
  "ceremonyDatetime",
  "partyDatetime",
  "ceremonyLocation",
  "partyLocation",
  "dressCode",
  "story",
  "cover",
  "gallery",
  "rsvp",
  "gifts",
]);

const FORBIDDEN_SNAPSHOT_KEY = /^(objetos|objects|secciones|sections|canvas|geometry|x|y|width|height|rotation|url|mediaurl|src|storagepath|downloadurl)$/i;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function hasExactKeys(value, keys) {
  const record = asRecord(value);
  if (!record) return false;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isString(value, maxLength = 1000) {
  return typeof value === "string" && value.length <= maxLength;
}

function isNonEmptyString(value, maxLength = 1000) {
  return isString(value, maxLength) && value.trim().length > 0;
}

function isNullableString(value, maxLength = 1000) {
  return value === null || isString(value, maxLength);
}

function isBoolean(value) {
  return typeof value === "boolean";
}

function isInteger(value) {
  return Number.isInteger(value);
}

function validateActionShape(action) {
  const record = asRecord(action);
  if (!record || !isNonEmptyString(record.type, 80)) {
    return "Cada acción debe declarar un type válido.";
  }

  const args = asRecord(record.arguments);
  if (!args) return `La acción ${record.type} requiere arguments.`;

  switch (record.type) {
    case "document.set_name":
      return hasExactKeys(args, ["name"]) && isNonEmptyString(args.name, 120)
        ? null
        : "document.set_name requiere name.";
    case "event.set_people":
      return hasExactKeys(args, ["primaryName", "secondaryName"]) &&
        isString(args.primaryName, 120) &&
        isString(args.secondaryName, 120)
        ? null
        : "event.set_people requiere primaryName y secondaryName.";
    case "event.set_mode":
      return hasExactKeys(args, ["mode"]) && EVENT_MODE_SET.has(args.mode)
        ? null
        : "event.set_mode requiere mode válido.";
    case "event.set_datetime":
      return hasExactKeys(args, ["phase", "date", "startTime", "endTime"]) &&
        EVENT_PHASE_SET.has(args.phase) &&
        isNullableString(args.date, 10) &&
        isNullableString(args.startTime, 5) &&
        isNullableString(args.endTime, 5) &&
        [args.date, args.startTime, args.endTime].some((value) => value !== null)
        ? null
        : "event.set_datetime requiere phase y valores de fecha/hora válidos.";
    case "event.set_location_text":
      return hasExactKeys(args, ["phase", "venueName", "address"]) &&
        EVENT_PHASE_SET.has(args.phase) &&
        isString(args.venueName, 180) &&
        isString(args.address, 240)
        ? null
        : "event.set_location_text requiere phase, venueName y address.";
    case "event.set_dress_code":
      return hasExactKeys(args, ["enabled", "value"]) &&
        isBoolean(args.enabled) &&
        isString(args.value, 240)
        ? null
        : "event.set_dress_code requiere enabled y value.";
    case "story.set_text":
      return hasExactKeys(args, ["text"]) && isString(args.text, 4000)
        ? null
        : "story.set_text requiere text.";
    case "gallery.move_photo":
      return hasExactKeys(args, ["galleryId", "sourceCellId", "sourceIndex", "targetCellId", "targetIndex"]) &&
        isNonEmptyString(args.galleryId, 160) &&
        isNullableString(args.sourceCellId, 160) &&
        isInteger(args.sourceIndex) && args.sourceIndex >= 0 &&
        isNullableString(args.targetCellId, 160) &&
        isInteger(args.targetIndex) && args.targetIndex >= 0
        ? null
        : "gallery.move_photo requiere una Gallery y slots válidos.";
    case "rsvp.set_enabled":
      return hasExactKeys(args, ["enabled"]) && isBoolean(args.enabled)
        ? null
        : "rsvp.set_enabled requiere enabled.";
    case "rsvp.set_question_active":
      return hasExactKeys(args, ["questionId", "active"]) &&
        isNonEmptyString(args.questionId, 120) && isBoolean(args.active)
        ? null
        : "rsvp.set_question_active requiere questionId y active.";
    case "rsvp.update_question":
      return hasExactKeys(args, ["questionId", "label", "questionType", "required"]) &&
        isNonEmptyString(args.questionId, 120) &&
        isNullableString(args.label, 120) &&
        (args.questionType === null || RSVP_QUESTION_TYPE_SET.has(args.questionType)) &&
        (args.required === null || isBoolean(args.required)) &&
        [args.label, args.questionType, args.required].some((value) => value !== null)
        ? null
        : "rsvp.update_question contiene valores inválidos.";
    case "rsvp.move_question":
      return hasExactKeys(args, ["questionId", "targetQuestionId", "placement"]) &&
        isNonEmptyString(args.questionId, 120) &&
        isNonEmptyString(args.targetQuestionId, 120) &&
        ["before", "after"].includes(args.placement)
        ? null
        : "rsvp.move_question requiere preguntas y placement válidos.";
    case "rsvp.add_option":
      return hasExactKeys(args, ["questionId", "label"]) &&
        isNonEmptyString(args.questionId, 120) && isNonEmptyString(args.label, 80)
        ? null
        : "rsvp.add_option requiere questionId y label.";
    case "rsvp.rename_option":
      return hasExactKeys(args, ["questionId", "optionId", "label"]) &&
        isNonEmptyString(args.questionId, 120) &&
        isNonEmptyString(args.optionId, 120) &&
        isNonEmptyString(args.label, 80)
        ? null
        : "rsvp.rename_option requiere questionId, optionId y label.";
    case "rsvp.remove_option":
      return hasExactKeys(args, ["questionId", "optionId"]) &&
        isNonEmptyString(args.questionId, 120) && isNonEmptyString(args.optionId, 120)
        ? null
        : "rsvp.remove_option requiere questionId y optionId.";
    case "rsvp.update_modal":
      return hasExactKeys(args, ["title", "subtitle", "submitLabel", "primaryColor"]) &&
        isNullableString(args.title, 80) &&
        isNullableString(args.subtitle, 160) &&
        isNullableString(args.submitLabel, 30) &&
        isNullableString(args.primaryColor, 7) &&
        [args.title, args.subtitle, args.submitLabel, args.primaryColor].some((value) => value !== null)
        ? null
        : "rsvp.update_modal contiene valores inválidos.";
    case "gifts.set_enabled":
      return hasExactKeys(args, ["enabled"]) && isBoolean(args.enabled)
        ? null
        : "gifts.set_enabled requiere enabled.";
    case "gifts.set_method":
      return hasExactKeys(args, ["method", "value", "visible"]) &&
        GIFT_METHOD_SET.has(args.method) &&
        isNullableString(args.value, 240) &&
        isBoolean(args.visible)
        ? null
        : "gifts.set_method requiere método, valor y visibilidad válidos.";
    case "gifts.set_intro_text":
      return hasExactKeys(args, ["text"]) && isString(args.text, 480)
        ? null
        : "gifts.set_intro_text requiere text.";
    case "gifts.set_button_text":
      return hasExactKeys(args, ["text"]) && isNonEmptyString(args.text, 80)
        ? null
        : "gifts.set_button_text requiere text.";
    case "media.replace_cover":
      return hasExactKeys(args, []) ? null : "media.replace_cover no acepta datos del modelo.";
    case "media.set_gallery_cell":
      return hasExactKeys(args, ["galleryId", "cellId", "cellIndex"]) &&
        isNonEmptyString(args.galleryId, 160) &&
        isNullableString(args.cellId, 160) &&
        isInteger(args.cellIndex) && args.cellIndex >= 0
        ? null
        : "media.set_gallery_cell requiere un slot existente.";
    case "event.select_google_place":
      return hasExactKeys(args, ["phase"]) && EVENT_PHASE_SET.has(args.phase)
        ? null
        : "event.select_google_place requiere phase.";
    default:
      return `La acción ${record.type} no está permitida.`;
  }
}

function collectSnapshotIds(snapshot) {
  const galleryIds = new Set();
  const galleryCells = new Map();
  const questionIds = new Set();
  const optionIds = new Map();
  const values = asRecord(snapshot?.values) || {};

  for (const gallery of Array.isArray(values.galleries) ? values.galleries : []) {
    if (!isNonEmptyString(gallery?.id, 160)) continue;
    galleryIds.add(gallery.id);
    const cells = new Set();
    for (const slot of Array.isArray(gallery.slots) ? gallery.slots : []) {
      if (isNonEmptyString(slot?.cellId, 160)) cells.add(slot.cellId);
    }
    galleryCells.set(gallery.id, cells);
  }

  for (const question of Array.isArray(values.rsvp?.questions) ? values.rsvp.questions : []) {
    if (!isNonEmptyString(question?.id, 120)) continue;
    questionIds.add(question.id);
    optionIds.set(
      question.id,
      new Set(
        (Array.isArray(question.options) ? question.options : [])
          .map((option) => option?.id)
          .filter((id) => isNonEmptyString(id, 120))
      )
    );
  }

  return { galleryIds, galleryCells, questionIds, optionIds };
}

function validateActionAgainstSnapshot(action, snapshot) {
  const availability = asRecord(snapshot?.availability) || {};
  const args = action.arguments;
  const ids = collectSnapshotIds(snapshot);
  const capabilityByAction = {
    "document.set_name": "documentName",
    "event.set_people": "people",
    "event.set_mode": "eventMode",
    "event.set_datetime": args.phase === "party" ? "partyDatetime" : "ceremonyDatetime",
    "event.set_location_text": args.phase === "party" ? "partyLocation" : "ceremonyLocation",
    "event.set_dress_code": "dressCode",
    "story.set_text": "story",
    "gallery.move_photo": "gallery",
    "media.replace_cover": "cover",
    "media.set_gallery_cell": "gallery",
    "event.select_google_place": args.phase === "party" ? "partyLocation" : "ceremonyLocation",
    "rsvp.set_enabled": "rsvp",
    "rsvp.set_question_active": "rsvp",
    "rsvp.update_question": "rsvp",
    "rsvp.move_question": "rsvp",
    "rsvp.add_option": "rsvp",
    "rsvp.rename_option": "rsvp",
    "rsvp.remove_option": "rsvp",
    "rsvp.update_modal": "rsvp",
    "gifts.set_enabled": "gifts",
    "gifts.set_method": "gifts",
    "gifts.set_intro_text": "gifts",
    "gifts.set_button_text": "gifts",
  }[action.type];

  if (!capabilityByAction || availability[capabilityByAction] !== true) {
    return `La capacidad ${capabilityByAction || action.type} no está disponible en este borrador.`;
  }

  if (["gallery.move_photo", "media.set_gallery_cell"].includes(action.type)) {
    if (!ids.galleryIds.has(args.galleryId)) return "La Gallery indicada no existe en el snapshot vigente.";
    const knownCells = ids.galleryCells.get(args.galleryId) || new Set();
    for (const cellId of [args.sourceCellId, args.targetCellId, args.cellId]) {
      if (cellId && !knownCells.has(cellId)) return "La celda indicada no existe en la Gallery vigente.";
    }
    const gallery = (Array.isArray(snapshot?.values?.galleries) ? snapshot.values.galleries : [])
      .find((entry) => entry?.id === args.galleryId);
    const slots = Array.isArray(gallery?.slots) ? gallery.slots : [];
    if (action.type === "gallery.move_photo") {
      const source = slots.find((slot) =>
        (args.sourceCellId && slot?.cellId === args.sourceCellId) || slot?.index === args.sourceIndex
      );
      const target = slots.find((slot) =>
        (args.targetCellId && slot?.cellId === args.targetCellId) || slot?.index === args.targetIndex
      );
      if (!source?.occupied || !target || source === target) {
        return "El movimiento requiere un origen ocupado y un slot de destino distinto.";
      }
    }
  }

  if (["rsvp.set_question_active", "rsvp.update_question", "rsvp.move_question", "rsvp.add_option", "rsvp.rename_option", "rsvp.remove_option"].includes(action.type)) {
    if (!ids.questionIds.has(args.questionId)) return "La pregunta RSVP indicada no existe en el snapshot vigente.";
    if (args.targetQuestionId && !ids.questionIds.has(args.targetQuestionId)) {
      return "La pregunta RSVP de destino no existe en el snapshot vigente.";
    }
    if (args.optionId && !(ids.optionIds.get(args.questionId) || new Set()).has(args.optionId)) {
      return "La opción RSVP indicada no existe en el snapshot vigente.";
    }
  }

  if (action.type === "event.set_datetime") {
    if (args.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      return "La fecha debe usar YYYY-MM-DD.";
    }
    for (const value of [args.startTime, args.endTime]) {
      if (value !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        return "Las horas deben usar HH:MM.";
      }
    }
  }

  if (action.type === "rsvp.update_modal" && args.primaryColor !== null && !/^#[0-9a-f]{6}$/i.test(args.primaryColor)) {
    return "El color primario RSVP debe ser hexadecimal de seis dígitos.";
  }

  return null;
}

function validateDesignerAiActionBatch(actions, { origin, snapshot } = {}) {
  if (!Array.isArray(actions) || actions.length > 20) {
    return { ok: false, errors: ["El lote de acciones debe contener entre 0 y 20 acciones."] };
  }
  if (![DESIGNER_AI_ACTION_ORIGINS.MODEL, DESIGNER_AI_ACTION_ORIGINS.TRUSTED_CONTROL].includes(origin)) {
    return { ok: false, errors: ["El origen del lote no es válido."] };
  }

  const errors = [];
  actions.forEach((action, index) => {
    const type = action?.type;
    const allowedForOrigin = origin === DESIGNER_AI_ACTION_ORIGINS.MODEL
      ? MODEL_ACTION_SET.has(type)
      : TRUSTED_ACTION_SET.has(type);
    if (!allowedForOrigin) {
      errors.push(`Acción ${index}: ${type || "desconocida"} no está permitida para ${origin}.`);
      return;
    }
    const shapeError = validateActionShape(action);
    if (shapeError) {
      errors.push(`Acción ${index}: ${shapeError}`);
      return;
    }
    const snapshotError = validateActionAgainstSnapshot(action, snapshot);
    if (snapshotError) errors.push(`Acción ${index}: ${snapshotError}`);
  });

  if (origin === DESIGNER_AI_ACTION_ORIGINS.MODEL) {
    const eventModeActions = actions.filter((action) => action?.type === "event.set_mode");
    const effectiveEventMode = eventModeActions.length
      ? eventModeActions[eventModeActions.length - 1]?.arguments?.mode
      : snapshot?.values?.eventMode;
    const partyEnabled = effectiveEventMode === "ceremony_party";
    actions.forEach((action, index) => {
      if (
        ["event.set_datetime", "event.set_location_text"].includes(action?.type) &&
        action?.arguments?.phase === "party" &&
        !partyEnabled
      ) {
        errors.push(`Acción ${index}: Party debe activarse mediante event.set_mode en el mismo lote o previamente.`);
      }
    });

    const giftEnabledActions = actions.filter((action) => action?.type === "gifts.set_enabled");
    const giftsWillBeEnabled = giftEnabledActions.length
      ? giftEnabledActions[giftEnabledActions.length - 1]?.arguments?.enabled === true
      : snapshot?.values?.gifts?.enabled === true;
    actions.forEach((action, index) => {
      if (
        action?.type === "gifts.set_button_text" &&
        !snapshot?.values?.gifts?.buttonText &&
        !giftsWillBeEnabled
      ) {
        errors.push(`Acción ${index}: el botón de Regalos debe existir o crearse activando Regalos en el mismo lote.`);
      }
    });

    const rsvpQuestions = new Map(
      (Array.isArray(snapshot?.values?.rsvp?.questions) ? snapshot.values.rsvp.questions : [])
        .map((question) => [question?.id, {
          type: question?.type,
          optionIds: new Set(
            (Array.isArray(question?.options) ? question.options : [])
              .map((option) => option?.id)
              .filter(Boolean)
          ),
          optionCount: Array.isArray(question?.options) ? question.options.length : 0,
        }])
    );
    actions.forEach((action, index) => {
      const args = action?.arguments || {};
      const question = rsvpQuestions.get(args.questionId);
      if (!question) return;
      if (action.type === "rsvp.update_question" && args.questionType !== null) {
        question.type = args.questionType;
      } else if (action.type === "rsvp.add_option") {
        if (question.type !== "single_select") {
          errors.push(`Accion ${index}: solo una pregunta single_select puede recibir opciones.`);
        } else {
          question.optionCount += 1;
        }
      } else if (action.type === "rsvp.remove_option") {
        if (!question.optionIds.has(args.optionId)) {
          errors.push(`Accion ${index}: la opcion RSVP ya no existe en el estado secuencial del lote.`);
        } else if (question.optionCount <= 1) {
          errors.push(`Accion ${index}: una pregunta single_select debe conservar al menos una opcion.`);
        } else {
          question.optionIds.delete(args.optionId);
          question.optionCount -= 1;
        }
      } else if (action.type === "rsvp.rename_option" && !question.optionIds.has(args.optionId)) {
        errors.push(`Accion ${index}: la opcion RSVP ya no existe en el estado secuencial del lote.`);
      } else if (action.type === "rsvp.move_question" && args.questionId === args.targetQuestionId) {
        errors.push(`Accion ${index}: una pregunta RSVP no puede moverse respecto de si misma.`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

function sanitizeString(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function sanitizeCapabilitySnapshot(input) {
  const source = asRecord(input) || {};
  const availabilitySource = asRecord(source.availability) || {};
  const availability = Object.fromEntries(
    SNAPSHOT_AVAILABILITY_KEYS.map((key) => [key, availabilitySource[key] === true])
  );
  const valuesSource = asRecord(source.values) || {};

  const galleries = (Array.isArray(valuesSource.galleries) ? valuesSource.galleries : [])
    .slice(0, 20)
    .map((gallery) => ({
      id: sanitizeString(gallery?.id, 160),
      slots: (Array.isArray(gallery?.slots) ? gallery.slots : []).slice(0, 24).map((slot, index) => ({
        cellId: isNonEmptyString(slot?.cellId, 160) ? slot.cellId : null,
        index: Number.isInteger(slot?.index) && slot.index >= 0 ? slot.index : index,
        occupied: slot?.occupied === true,
        contentRevision: sanitizeString(slot?.contentRevision, 120),
      })),
    }))
    .filter((gallery) => gallery.id);

  const rsvpSource = asRecord(valuesSource.rsvp) || {};
  const rsvpQuestions = (Array.isArray(rsvpSource.questions) ? rsvpSource.questions : [])
    .slice(0, 20)
    .map((question) => ({
      id: sanitizeString(question?.id, 120),
      active: question?.active === true,
      label: sanitizeString(question?.label, 120),
      type: RSVP_QUESTION_TYPE_SET.has(question?.type) ? question.type : "short_text",
      required: question?.required === true,
      options: (Array.isArray(question?.options) ? question.options : []).slice(0, 20).map((option) => ({
        id: sanitizeString(option?.id, 120),
        label: sanitizeString(option?.label, 80),
      })).filter((option) => option.id),
    }))
    .filter((question) => question.id);

  const giftsSource = asRecord(valuesSource.gifts) || {};
  const giftMethodsSource = asRecord(giftsSource.methods) || {};
  const methods = Object.fromEntries([...GIFT_METHOD_SET].map((method) => {
    const methodSource = asRecord(giftMethodsSource[method]) || {};
    const rawValue = sanitizeString(methodSource.value, 240);
    return [method, {
      value: method === "giftListLink" ? "" : rawValue,
      visible: methodSource.visible === true,
      configured: methodSource.configured === true || rawValue.length > 0,
    }];
  }));

  const safe = {
    revision: sanitizeString(source.revision, 120),
    availability,
    values: {
      documentName: sanitizeString(valuesSource.documentName, 120),
      people: {
        primaryName: sanitizeString(valuesSource.people?.primaryName, 120),
        secondaryName: sanitizeString(valuesSource.people?.secondaryName, 120),
      },
      eventMode: EVENT_MODE_SET.has(valuesSource.eventMode) ? valuesSource.eventMode : "single",
      ceremony: sanitizeEventPhase(valuesSource.ceremony),
      party: sanitizeEventPhase(valuesSource.party),
      dressCode: {
        enabled: valuesSource.dressCode?.enabled === true,
        value: sanitizeString(valuesSource.dressCode?.value, 240),
      },
      story: sanitizeString(valuesSource.story, 4000),
      media: {
        hasCover: valuesSource.media?.hasCover === true,
        contentRevision: sanitizeString(valuesSource.media?.contentRevision, 120),
      },
      galleries,
      rsvp: {
        enabled: rsvpSource.enabled === true,
        questions: rsvpQuestions,
        modal: {
          title: sanitizeString(rsvpSource.modal?.title, 80),
          subtitle: sanitizeString(rsvpSource.modal?.subtitle, 160),
          submitLabel: sanitizeString(rsvpSource.modal?.submitLabel, 30),
          primaryColor: sanitizeString(rsvpSource.modal?.primaryColor, 7),
        },
      },
      gifts: {
        enabled: giftsSource.enabled === true,
        introText: sanitizeString(giftsSource.introText, 480),
        buttonText: sanitizeString(giftsSource.buttonText, 80),
        methods,
      },
    },
    ledger: sanitizeLedger(source.ledger),
    conversation: {
      namePolicy: {
        mode: ["automatic", "explicit", "unknown"].includes(source.conversation?.namePolicy?.mode)
          ? source.conversation.namePolicy.mode
          : "unknown",
        lastAutomaticName: sanitizeString(source.conversation?.namePolicy?.lastAutomaticName, 120),
      },
    },
  };

  return safe;
}

function sanitizeLedger(value) {
  const source = asRecord(value) || {};
  const leaves = (Array.isArray(source.leaves) ? source.leaves : [])
    .slice(0, 700)
    .map((leaf) => ({
      id: sanitizeString(leaf?.id, 180),
      block: sanitizeString(leaf?.block, 40),
      status: Object.values(conversationLedger.DESIGNER_AI_LEDGER_STATUSES).includes(leaf?.status)
        ? leaf.status
        : conversationLedger.DESIGNER_AI_LEDGER_STATUSES.PENDING,
      provenance: Object.values(conversationLedger.DESIGNER_AI_PROVENANCE).includes(leaf?.provenance)
        ? leaf.provenance
        : conversationLedger.DESIGNER_AI_PROVENANCE.UNKNOWN,
      rule: isNullableString(leaf?.rule, 80) ? leaf.rule : null,
      fingerprint: sanitizeString(leaf?.fingerprint, 120),
    }))
    .filter((leaf) => leaf.id);
  const availableLeaves = leaves.filter(
    (leaf) => leaf.status !== conversationLedger.DESIGNER_AI_LEDGER_STATUSES.UNAVAILABLE
  );
  const unresolvedLeafIds = availableLeaves
    .filter((leaf) => !conversationLedger.isTerminalDesignerAiLedgerStatus(leaf.status))
    .map((leaf) => leaf.id);
  return {
    version: Number.isInteger(source.version) ? source.version : conversationLedger.LEDGER_VERSION,
    leaves,
    completion: {
      availableCount: availableLeaves.length,
      terminalCount: availableLeaves.length - unresolvedLeafIds.length,
      unresolvedLeafIds,
      complete: unresolvedLeafIds.length === 0,
    },
  };
}

function sanitizeEventPhase(value) {
  const source = asRecord(value) || {};
  return {
    date: sanitizeString(source.date, 10),
    startTime: sanitizeString(source.startTime, 5),
    endTime: sanitizeString(source.endTime, 5),
    venueName: sanitizeString(source.venueName, 180),
    address: sanitizeString(source.address, 240),
    placeSelected: source.placeSelected === true,
  };
}

function sanitizeCapabilityIdList(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => isNonEmptyString(item, 120))
    .slice(0, 40);
}

function validateDesignerAiResolutionUpdates(resolutions, snapshot) {
  if (!Array.isArray(resolutions) || resolutions.length > 120) {
    return { ok: false, errors: ["Las resoluciones deben contener entre 0 y 120 elementos."] };
  }
  const knownLeafIds = new Set(
    (Array.isArray(snapshot?.ledger?.leaves) ? snapshot.ledger.leaves : [])
      .filter((leaf) => leaf?.status !== conversationLedger.DESIGNER_AI_LEDGER_STATUSES.UNAVAILABLE)
      .map((leaf) => leaf?.id)
      .filter(Boolean)
  );
  const errors = [];
  resolutions.forEach((resolution, index) => {
    const record = asRecord(resolution);
    if (!record || !hasExactKeys(record, ["leafId", "status", "rule"])) {
      errors.push(`Resolucion ${index}: shape invalido.`);
      return;
    }
    if (!knownLeafIds.has(record.leafId)) {
      errors.push(`Resolucion ${index}: la hoja no existe en el ledger vigente.`);
    }
    if (!MODEL_RESOLUTION_STATUS_SET.has(record.status)) {
      errors.push(`Resolucion ${index}: estado no permitido.`);
    }
    if (record.status === conversationLedger.DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE) {
      if (!RESOLUTION_RULE_SET.has(record.rule)) {
        errors.push(`Resolucion ${index}: regla no permitida.`);
      } else if (!isResolutionRuleCompatible(record.leafId, record.rule)) {
        errors.push(`Resolucion ${index}: la regla no corresponde a esa hoja.`);
      }
    } else if (record.rule !== null) {
      errors.push(`Resolucion ${index}: rule solo aplica a resolved_by_rule.`);
    }
  });
  return { ok: errors.length === 0, errors };
}

function isResolutionRuleCompatible(leafId, rule) {
  const id = String(leafId || "");
  const rules = conversationLedger.DESIGNER_AI_RESOLUTION_RULES;
  switch (rule) {
    case rules.AUTOMATIC_EVENT_NAME:
      return id === "document.name";
    case rules.OPTIONAL_END_TIME_OMITTED:
      return id.endsWith(".end_time");
    case rules.OPTIONAL_VENUE_NAME_OMITTED:
      return id.endsWith(".venue_name");
    case rules.SAME_DAY_PARTY:
      return id === "event.party.date";
    case rules.CATALOG_DEFAULTS:
      return id.startsWith("rsvp.question.") || id === "rsvp.questions.order";
    case rules.SYSTEM_DEFAULT:
      return id.startsWith("rsvp.modal.") || id === "gifts.intro_text" || id === "gifts.button_text";
    case rules.PRESERVE_WHILE_INACTIVE:
      return (id.startsWith("rsvp.") && id !== "rsvp.enabled") || (id.startsWith("gifts.") && id !== "gifts.enabled");
    case rules.RECOMMENDED_ORDER:
      return id === "rsvp.questions.order" || /^media\.gallery\..+\.order$/.test(id);
    case rules.LEAVE_EMPTY:
      return id === "story.text" || id.endsWith(".end_time") || id.endsWith(".venue_name") || id.endsWith(".place_selection") || /^media\.gallery\..+\.slot\./.test(id);
    case rules.KEEP_EXISTING:
      return true;
    default:
      return false;
  }
}

function containsForbiddenSnapshotData(value, seen = new Set()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_SNAPSHOT_KEY.test(key) || containsForbiddenSnapshotData(child, seen)
  );
}

function validateDesignerAiControlRequest(controlRequest, snapshot) {
  if (controlRequest == null) return { ok: true, errors: [] };
  const request = asRecord(controlRequest);
  if (!request || !CONTROL_SET.has(request.type)) {
    return { ok: false, errors: ["El control solicitado no está permitido."] };
  }
  const expectedKeys = request.type === "cover_upload"
    ? ["type"]
    : request.type === "gallery_cell_upload"
      ? ["type", "galleryId", "cellId", "cellIndex"]
      : ["type", "phase"];
  if (!hasExactKeys(request, expectedKeys)) {
    return { ok: false, errors: ["El control solicitado contiene propiedades no permitidas."] };
  }
  let action;
  if (request.type === "cover_upload") {
    action = { type: "media.replace_cover", arguments: {} };
  } else if (request.type === "gallery_cell_upload") {
    action = {
      type: "media.set_gallery_cell",
      arguments: {
        galleryId: request.galleryId,
        cellId: request.cellId ?? null,
        cellIndex: request.cellIndex,
      },
    };
  } else {
    action = {
      type: "event.select_google_place",
      arguments: { phase: request.phase },
    };
  }
  return validateDesignerAiActionBatch([action], {
    origin: DESIGNER_AI_ACTION_ORIGINS.TRUSTED_CONTROL,
    snapshot,
  });
}

const STRING = (maxLength) => ({ type: "string", maxLength });
const NULLABLE_STRING = (maxLength) => ({ type: ["string", "null"], maxLength });
const BOOLEAN = { type: "boolean" };
const NULLABLE_BOOLEAN = { type: ["boolean", "null"] };
const INTEGER = { type: "integer", minimum: 0 };

function actionSchema(type, properties, required = Object.keys(properties)) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", const: type },
      arguments: {
        type: "object",
        additionalProperties: false,
        properties,
        required,
      },
    },
    required: ["type", "arguments"],
  };
}

const DESIGNER_AI_MODEL_ACTION_SCHEMA = {
  anyOf: [
    actionSchema("document.set_name", { name: STRING(120) }),
    actionSchema("event.set_people", { primaryName: STRING(120), secondaryName: STRING(120) }),
    actionSchema("event.set_mode", { mode: { type: "string", enum: [...EVENT_MODE_SET] } }),
    actionSchema("event.set_datetime", { phase: { type: "string", enum: [...EVENT_PHASE_SET] }, date: NULLABLE_STRING(10), startTime: NULLABLE_STRING(5), endTime: NULLABLE_STRING(5) }),
    actionSchema("event.set_location_text", { phase: { type: "string", enum: [...EVENT_PHASE_SET] }, venueName: STRING(180), address: STRING(240) }),
    actionSchema("event.set_dress_code", { enabled: BOOLEAN, value: STRING(240) }),
    actionSchema("story.set_text", { text: STRING(4000) }),
    actionSchema("gallery.move_photo", { galleryId: STRING(160), sourceCellId: NULLABLE_STRING(160), sourceIndex: INTEGER, targetCellId: NULLABLE_STRING(160), targetIndex: INTEGER }),
    actionSchema("rsvp.set_enabled", { enabled: BOOLEAN }),
    actionSchema("rsvp.set_question_active", { questionId: STRING(120), active: BOOLEAN }),
    actionSchema("rsvp.update_question", { questionId: STRING(120), label: NULLABLE_STRING(120), questionType: { anyOf: [{ type: "string", enum: [...RSVP_QUESTION_TYPE_SET] }, { type: "null" }] }, required: NULLABLE_BOOLEAN }),
    actionSchema("rsvp.move_question", { questionId: STRING(120), targetQuestionId: STRING(120), placement: { type: "string", enum: ["before", "after"] } }),
    actionSchema("rsvp.add_option", { questionId: STRING(120), label: STRING(80) }),
    actionSchema("rsvp.rename_option", { questionId: STRING(120), optionId: STRING(120), label: STRING(80) }),
    actionSchema("rsvp.remove_option", { questionId: STRING(120), optionId: STRING(120) }),
    actionSchema("rsvp.update_modal", { title: NULLABLE_STRING(80), subtitle: NULLABLE_STRING(160), submitLabel: NULLABLE_STRING(30), primaryColor: NULLABLE_STRING(7) }),
    actionSchema("gifts.set_enabled", { enabled: BOOLEAN }),
    actionSchema("gifts.set_method", { method: { type: "string", enum: [...GIFT_METHOD_SET] }, value: NULLABLE_STRING(240), visible: BOOLEAN }),
    actionSchema("gifts.set_intro_text", { text: STRING(480) }),
    actionSchema("gifts.set_button_text", { text: STRING(80) }),
  ],
};

const DESIGNER_AI_CONTROL_REQUEST_SCHEMA = {
  anyOf: [
    { type: "null" },
    { type: "object", additionalProperties: false, properties: { type: { type: "string", const: "cover_upload" } }, required: ["type"] },
    { type: "object", additionalProperties: false, properties: { type: { type: "string", const: "gallery_cell_upload" }, galleryId: STRING(160), cellId: NULLABLE_STRING(160), cellIndex: INTEGER }, required: ["type", "galleryId", "cellId", "cellIndex"] },
    { type: "object", additionalProperties: false, properties: { type: { type: "string", const: "google_place_picker" }, phase: { type: "string", enum: [...EVENT_PHASE_SET] } }, required: ["type", "phase"] },
  ],
};

const DESIGNER_AI_RESOLUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    leafId: STRING(180),
    status: { type: "string", enum: [...MODEL_RESOLUTION_STATUS_SET] },
    rule: { anyOf: [{ type: "string", enum: [...RESOLUTION_RULE_SET] }, { type: "null" }] },
  },
  required: ["leafId", "status", "rule"],
};

const DESIGNER_AI_TOOL = Object.freeze({
  type: "function",
  name: "submit_designer_ai_result",
  description: "Devuelve únicamente acciones autorizadas del Asistente o solicita un control local confiable.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string", enum: ["apply", "clarify", "out_of_scope"] },
      assistantMessage: STRING(700),
      actions: { type: "array", maxItems: 19, items: DESIGNER_AI_MODEL_ACTION_SCHEMA },
      controlRequest: DESIGNER_AI_CONTROL_REQUEST_SCHEMA,
      resolutions: { type: "array", maxItems: 120, items: DESIGNER_AI_RESOLUTION_SCHEMA },
    },
    required: ["intent", "assistantMessage", "actions", "controlRequest", "resolutions"],
  },
});

module.exports = {
  DESIGNER_AI_ACTION_ORIGINS,
  DESIGNER_AI_CONTRACT_VERSION,
  DESIGNER_AI_CONTROL_TYPES,
  DESIGNER_AI_MODEL_ACTION_SCHEMA,
  DESIGNER_AI_MODEL_ACTION_TYPES,
  DESIGNER_AI_TOOL,
  DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES,
  SNAPSHOT_AVAILABILITY_KEYS,
  containsForbiddenSnapshotData,
  sanitizeCapabilitySnapshot,
  validateDesignerAiActionBatch,
  validateDesignerAiControlRequest,
  validateDesignerAiResolutionUpdates,
};

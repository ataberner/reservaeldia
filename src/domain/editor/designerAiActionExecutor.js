import {
  DESIGNER_AI_ACTION_ORIGINS,
  validateDesignerAiActionBatch,
} from "../../../shared/designerAiCapabilityContract.js";
import { normalizeEventDetailsConfig } from "../../../shared/eventDetailsConfig.js";
import {
  buildCountdownTargetIsoFromLocalParts,
} from "../../../shared/countdownEventDetails.js";
import { requestDashboardDocumentNameUpdate } from "../../lib/dashboardDocumentNameBridge.js";
import { EDITOR_BRIDGE_EVENTS } from "../../lib/editorBridgeContracts.js";
import {
  readCanvasEditorMethod,
  readEditorObjects,
} from "../../lib/editorRuntimeBridge.js";
import { readEditorRenderSnapshot } from "../../lib/editorSnapshotAdapter.js";
import { EVENT_DETAIL_FEATURES } from "../eventDetails/features.js";
import { resolveEventDateSidebarBinding } from "../eventDetails/date.js";
import { applyManualEventLocationText } from "../eventDetails/locationAuthoring.js";
import { resolveDressCodeSidebarBinding, resolveStoryTextSidebarBinding } from "../templates/storyText.js";
import { moveGalleryPhotoToSlot } from "../gallery/galleryMutations.js";
import {
  getOrderedQuestions,
  normalizeRsvpConfig,
} from "../rsvp/config.js";
import {
  addQuestionOption,
  moveQuestion,
  removeQuestionOption,
  setModalSettings,
  setQuestionLabel,
  setQuestionOptionLabel,
  setQuestionRequired,
  setQuestionType,
  toggleQuestionActive,
} from "../rsvp/editorOps.js";
import { normalizeGiftConfig } from "../gifts/config.js";
import {
  buildFunctionalCtaButtonPayload,
  buildFunctionalCtaVisibilityPatch,
  findFunctionalCtaButtonByType,
} from "../functionalCtaButtons.js";

const ACTION_OWNER_ORDER = Object.freeze({
  document: 10,
  event: 20,
  story: 30,
  gallery: 40,
  rsvp: 50,
  gifts: 60,
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getActionOwner(type) {
  return String(type || "").split(".")[0];
}

function createRuntimeEvent(targetWindow, name, detail) {
  const EventCtor = targetWindow?.CustomEvent || globalThis.CustomEvent;
  if (typeof EventCtor === "function") return new EventCtor(name, { detail });
  const event = new targetWindow.Event(name);
  event.detail = detail;
  return event;
}

function dispatchRuntimeEvent(targetWindow, name, detail) {
  targetWindow.dispatchEvent(createRuntimeEvent(targetWindow, name, detail));
}

function readAuthoringSnapshot(targetWindow) {
  const reader = readCanvasEditorMethod("getTemplateAuthoringSnapshot", targetWindow);
  return typeof reader === "function" ? reader() || {} : {};
}

function requireBridgeMethod(name, targetWindow) {
  const method = readCanvasEditorMethod(name, targetWindow);
  if (typeof method !== "function") {
    throw new Error(`El editor no expuso la capacidad ${name}.`);
  }
  return method;
}

async function executeEventAction(action, targetWindow) {
  const args = action.arguments;
  if (action.type === "event.set_people") {
    await requireBridgeMethod("updateTemplateAuthoringEventPersonNames", targetWindow)({
      primaryName: args.primaryName,
      secondaryName: args.secondaryName,
    });
    return;
  }

  if (action.type === "event.set_mode") {
    const render = readEditorRenderSnapshot(targetWindow) || {};
    const config = normalizeEventDetailsConfig({
      ...asRecord(render.eventDetails),
      mode: args.mode,
    });
    await requireBridgeMethod("updateEventDetailsConfig", targetWindow)(config);
    return;
  }

  if (action.type === "event.set_datetime") {
    const feature = args.phase === "party"
      ? EVENT_DETAIL_FEATURES.PARTY
      : EVENT_DETAIL_FEATURES.CEREMONY;
    const snapshot = readAuthoringSnapshot(targetWindow);
    const objects = readEditorObjects(targetWindow);
    const baseBinding = resolveEventDateSidebarBinding({
      fieldsSchema: snapshot.fieldsSchema,
      defaults: Object.prototype.hasOwnProperty.call(snapshot, "values")
        ? snapshot.values
        : snapshot.defaults,
      objetos: objects,
      feature,
    });
    const currentPhase = asRecord(
      action.__currentValues?.[feature === EVENT_DETAIL_FEATURES.PARTY ? "party" : "ceremony"]
    );
    const date = args.date ?? currentPhase.date ?? "";
    const startTime = args.startTime ?? currentPhase.startTime ?? "";
    const endTime = args.endTime ?? currentPhase.endTime ?? "";

    const rolePrefix = feature === EVENT_DETAIL_FEATURES.PARTY ? "party" : "ceremony";
    const fieldKeyByRole = new Map(
      (Array.isArray(snapshot.fieldsSchema) ? snapshot.fieldsSchema : [])
        .map((field) => [String(field?.eventDetailsRole || "").trim().toLowerCase(), field])
        .filter(([role]) => Boolean(role))
    );
    const valuesPatch = {};
    if (baseBinding.fieldKey) {
      const fieldType = String(baseBinding.field?.type || "date").trim().toLowerCase();
      valuesPatch[baseBinding.fieldKey] = fieldType === "datetime"
        ? buildCountdownTargetIsoFromLocalParts({ date, time: startTime }) || ""
        : date;
    }
    const startField = fieldKeyByRole.get(`${rolePrefix}_start_time`);
    const endField = fieldKeyByRole.get(`${rolePrefix}_end_time`);
    if (startField?.key) valuesPatch[startField.key] = startTime;
    if (endField?.key) valuesPatch[endField.key] = endTime;
    if (Object.keys(valuesPatch).length > 0) {
      await requireBridgeMethod("updateTemplateFieldValues", targetWindow)(valuesPatch, {
        applyTargets: true,
        reason: "designer-ai-event-datetime",
      });
    }
    return;
  }

  if (action.type === "event.set_location_text") {
    const feature = args.phase === "party"
      ? EVENT_DETAIL_FEATURES.PARTY
      : EVENT_DETAIL_FEATURES.CEREMONY;
    await applyManualEventLocationText({
      targetWindow,
      feature,
      venueName: args.venueName,
      address: args.address,
    });
    return;
  }

  if (action.type === "event.set_dress_code") {
    const render = readEditorRenderSnapshot(targetWindow) || {};
    const authoring = readAuthoringSnapshot(targetWindow);
    const objects = readEditorObjects(targetWindow);
    const binding = resolveDressCodeSidebarBinding({
      fieldsSchema: authoring.fieldsSchema,
      defaults: Object.prototype.hasOwnProperty.call(authoring, "values")
        ? authoring.values
        : authoring.defaults,
      objetos: objects,
    });
    if (binding.fieldKey) {
      await requireBridgeMethod("updateTemplateAuthoringDefault", targetWindow)(
        binding.fieldKey,
        args.value,
        {
          applyTargets: true,
          eventDetailsPatch: {
            dressCode: { enabled: args.enabled },
          },
        }
      );
    } else {
      const config = normalizeEventDetailsConfig({
        ...asRecord(render.eventDetails),
        dressCode: { enabled: args.enabled, value: args.value },
      });
      await requireBridgeMethod("updateEventDetailsConfig", targetWindow)(config);
    }
    return;
  }

  throw new Error(`Acción de evento no implementada: ${action.type}`);
}

async function executeStoryAction(action, targetWindow) {
  const authoring = readAuthoringSnapshot(targetWindow);
  const binding = resolveStoryTextSidebarBinding({
    fieldsSchema: authoring.fieldsSchema,
    defaults: Object.prototype.hasOwnProperty.call(authoring, "values")
      ? authoring.values
      : authoring.defaults,
    objetos: readEditorObjects(targetWindow),
  });
  if (!binding.fieldKey) {
    throw new Error("El texto de historia no esta declarado en el schema vigente.");
  }
  await requireBridgeMethod("updateTemplateAuthoringDefault", targetWindow)(
    binding.fieldKey,
    action.arguments.text,
    { applyTargets: true }
  );
}

function executeGalleryAction(action, targetWindow) {
  const objects = readEditorObjects(targetWindow);
  const gallery = objects.find(
    (object) => object?.tipo === "galeria" && object?.id === action.arguments.galleryId
  );
  if (!gallery) throw new Error("La Gallery dejó de estar disponible.");
  const result = moveGalleryPhotoToSlot(
    gallery,
    { cellId: action.arguments.sourceCellId, sourceIndex: action.arguments.sourceIndex },
    { cellId: action.arguments.targetCellId, sourceIndex: action.arguments.targetIndex }
  );
  if (!result.changed) throw new Error(`No se pudo mover la foto: ${result.reason || "sin cambios"}.`);
  dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
    id: gallery.id,
    cambios: result.gallery,
  });
}

function moveRsvpQuestionToPlacement(config, questionId, targetQuestionId, placement) {
  let next = config;
  const maxSteps = getOrderedQuestions(next).length + 1;
  for (let step = 0; step < maxSteps; step += 1) {
    const rows = getOrderedQuestions(next);
    const sourceIndex = rows.findIndex((question) => question.id === questionId);
    const targetIndex = rows.findIndex((question) => question.id === targetQuestionId);
    const desired = placement === "after" ? targetIndex + 1 : targetIndex;
    const adjustedDesired = sourceIndex < desired ? desired - 1 : desired;
    if (sourceIndex === adjustedDesired) return next;
    next = moveQuestion(next, questionId, sourceIndex < adjustedDesired ? "down" : "up");
  }
  return next;
}

function applyRsvpAction(config, action) {
  const args = action.arguments;
  switch (action.type) {
    case "rsvp.set_enabled":
      return normalizeRsvpConfig({ ...config, enabled: args.enabled }, { forceEnabled: false });
    case "rsvp.set_question_active":
      return toggleQuestionActive(config, args.questionId, args.active);
    case "rsvp.update_question": {
      let next = config;
      if (args.label !== null) next = setQuestionLabel(next, args.questionId, args.label);
      if (args.questionType !== null) next = setQuestionType(next, args.questionId, args.questionType);
      if (args.required !== null) next = setQuestionRequired(next, args.questionId, args.required);
      return next;
    }
    case "rsvp.move_question":
      return moveRsvpQuestionToPlacement(config, args.questionId, args.targetQuestionId, args.placement);
    case "rsvp.add_option": {
      const before = new Set(
        getOrderedQuestions(config).find((question) => question.id === args.questionId)?.options?.map((option) => option.id) || []
      );
      let next = addQuestionOption(config, args.questionId);
      const added = getOrderedQuestions(next)
        .find((question) => question.id === args.questionId)?.options
        ?.find((option) => !before.has(option.id));
      if (added) next = setQuestionOptionLabel(next, args.questionId, added.id, args.label);
      return next;
    }
    case "rsvp.rename_option":
      return setQuestionOptionLabel(config, args.questionId, args.optionId, args.label);
    case "rsvp.remove_option":
      return removeQuestionOption(config, args.questionId, args.optionId);
    case "rsvp.update_modal":
      return setModalSettings(config, Object.fromEntries(
        Object.entries({
          title: args.title,
          subtitle: args.subtitle,
          submitLabel: args.submitLabel,
          primaryColor: args.primaryColor,
        }).filter(([, value]) => value !== null)
      ));
    default:
      return config;
  }
}

function applyGiftAction(config, action) {
  const args = action.arguments;
  if (action.type === "gifts.set_enabled") {
    return normalizeGiftConfig({ ...config, enabled: args.enabled }, { forceEnabled: false });
  }
  if (action.type === "gifts.set_method") {
    const isLink = args.method === "giftListLink";
    const nextValue = args.value === null
      ? isLink
        ? config.giftListUrl
        : config.bank[args.method]
      : args.value;
    return normalizeGiftConfig({
      ...config,
      ...(isLink
        ? { giftListUrl: nextValue }
        : { bank: { ...config.bank, [args.method]: nextValue } }),
      visibility: { ...config.visibility, [args.method]: args.visible },
    }, { forceEnabled: false });
  }
  if (action.type === "gifts.set_intro_text") {
    return normalizeGiftConfig({ ...config, introText: args.text }, { forceEnabled: false });
  }
  return config;
}

function synchronizeFunctionalCta(targetWindow, type, enabled, text = "") {
  const button = findFunctionalCtaButtonByType(readEditorObjects(targetWindow), type);
  if (button) {
    const cambios = {
      ...buildFunctionalCtaVisibilityPatch(enabled),
      ...(text ? { texto: text } : {}),
    };
    dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
      id: button.id,
      cambios,
    });
    return;
  }
  if (enabled) {
    dispatchRuntimeEvent(
      targetWindow,
      EDITOR_BRIDGE_EVENTS.INSERT_ELEMENT,
      buildFunctionalCtaButtonPayload(type, { text })
    );
  }
}

async function executeConfigOwners(actions, targetWindow, onOwnerApplied = () => {}) {
  const render = readEditorRenderSnapshot(targetWindow) || {};
  const rsvpActions = actions.filter((action) => getActionOwner(action.type) === "rsvp");
  if (rsvpActions.length) {
    let config = normalizeRsvpConfig(render.rsvp, { forceEnabled: false });
    for (const action of rsvpActions) config = applyRsvpAction(config, action);
    dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.RSVP_CONFIG_UPDATE, { config });
    synchronizeFunctionalCta(targetWindow, "rsvp-boton", config.enabled);
    onOwnerApplied(rsvpActions);
  }

  const giftActions = actions.filter((action) => getActionOwner(action.type) === "gifts");
  if (giftActions.length) {
    let config = normalizeGiftConfig(render.gifts, { forceEnabled: false });
    let requestedButtonText = "";
    for (const action of giftActions) {
      config = applyGiftAction(config, action);
      if (action.type === "gifts.set_button_text") {
        requestedButtonText = action.arguments.text;
      }
    }
    dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.GIFT_CONFIG_UPDATE, { config });
    synchronizeFunctionalCta(targetWindow, "regalo-boton", config.enabled, requestedButtonText);
    onOwnerApplied(giftActions);
  }
}

export async function executeDesignerAiActionBatch(
  actions,
  {
    snapshot,
    targetWindow = typeof window !== "undefined" ? window : null,
    isSessionCurrent = () => true,
    designerAiConversation = null,
  } = {}
) {
  if (!targetWindow) throw new Error("El runtime del editor no está disponible.");
  const validation = validateDesignerAiActionBatch(actions, {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot,
  });
  if (!validation.ok) {
    const error = new Error(validation.errors.join(" "));
    error.code = "designer-ai/prevalidation-failed";
    throw error;
  }

  const ordered = actions
    .map((action, index) => ({ ...action, __index: index, __currentValues: snapshot.values }))
    .sort((left, right) => {
      const ownerDelta = ACTION_OWNER_ORDER[getActionOwner(left.type)] - ACTION_OWNER_ORDER[getActionOwner(right.type)];
      return ownerDelta || left.__index - right.__index;
    });
  const nonConfigActions = ordered.filter((action) => !["rsvp", "gifts"].includes(getActionOwner(action.type)));
  const applied = [];

  for (const action of nonConfigActions) {
    if (!isSessionCurrent()) {
      const error = new Error("La sesión del borrador cambió antes de aplicar el lote.");
      error.code = "designer-ai/stale-session";
      error.appliedActions = applied;
      throw error;
    }
    try {
      if (action.type === "document.set_name") {
        requestDashboardDocumentNameUpdate({
          name: action.arguments.name,
          persist: true,
          source: "designer-ai",
          ...(designerAiConversation ? { designerAiConversation } : {}),
        }, targetWindow);
      } else if (getActionOwner(action.type) === "event") {
        await executeEventAction(action, targetWindow);
      } else if (getActionOwner(action.type) === "story") {
        await executeStoryAction(action, targetWindow);
      } else if (getActionOwner(action.type) === "gallery") {
        executeGalleryAction(action, targetWindow);
      }
      applied.push(action.type);
    } catch (error) {
      error.appliedActions = applied;
      throw error;
    }
  }

  if (ordered.some((action) => ["rsvp", "gifts"].includes(getActionOwner(action.type)))) {
    if (!isSessionCurrent()) {
      const error = new Error("La sesión del borrador cambió antes de aplicar configuraciones.");
      error.code = "designer-ai/stale-session";
      error.appliedActions = applied;
      throw error;
    }
    try {
      await executeConfigOwners(ordered, targetWindow, (ownerActions) => {
        ownerActions.forEach((action) => applied.push(action.type));
      });
    } catch (error) {
      error.appliedActions = applied;
      throw error;
    }
  }

  return { appliedActions: applied };
}

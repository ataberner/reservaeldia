import {
  DESIGNER_AI_ACTION_ORIGINS,
  validateDesignerAiActionBatch,
} from "../../../shared/designerAiCapabilityContract.js";
import { normalizeEventDetailsConfig } from "../../../shared/eventDetailsConfig.js";
import {
  buildCountdownTargetIsoFromLocalParts,
} from "../../../shared/countdownEventDetails.js";
import { persistDashboardDocumentUpdate } from "../../lib/dashboardDocumentNameBridge.js";
import { confirmDesignerAiPersistence, isDesignerAiActionEffective, readDesignerAiActionEvidence, waitForDesignerAiEffect } from "./designerAiActionEvidence.js";
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
import { normalizeRsvpConfig } from "../rsvp/config.js";
import configReducers from "../../../shared/designerAiConfigReducers.cjs";
import actionProjection from "../../../shared/designerAiActionProjection.cjs";
const { applyRsvpAction, applySelectedGiftAction, confirmedGiftMethods: readConfirmedGiftMethods } = configReducers;
const { orderDesignerAiActions } = actionProjection;
import { normalizeGiftConfig } from "../gifts/config.js";
import { captureDesignerAiActionEvidence, matchesDesignerAiActionEvidence, fingerprintDesignerAiValue } from "../../../shared/designerAiConversationLedger.js";
import {
  buildFunctionalCtaButtonPayload,
  buildFunctionalCtaVisibilityPatch,
  findFunctionalCtaButtonByType,
} from "../functionalCtaButtons.js";


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
      readDesignerAiActionEvidence(targetWindow).snapshot.values[feature === EVENT_DETAIL_FEATURES.PARTY ? "party" : "ceremony"]
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
      if (args.date !== null || (fieldType === "datetime" && args.startTime !== null)) {
        valuesPatch[baseBinding.fieldKey] = fieldType === "datetime"
          ? buildCountdownTargetIsoFromLocalParts({ date, time: startTime }) || ""
          : date;
      }
    }
    const startField = fieldKeyByRole.get(`${rolePrefix}_start_time`);
    const endField = fieldKeyByRole.get(`${rolePrefix}_end_time`);
    if (startField?.key && args.startTime !== null) valuesPatch[startField.key] = startTime;
    if (endField?.key && args.endTime !== null) valuesPatch[endField.key] = endTime;
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
  return { gallery: result.gallery };
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

async function executeConfigOwners(actions, targetWindow, confirmedGiftMethods) {
  const expected = {};
  const render = readEditorRenderSnapshot(targetWindow) || {};
  const rsvpActions = actions.filter((action) => getActionOwner(action.type) === "rsvp");
  if (rsvpActions.length) {
    let config = normalizeRsvpConfig(render.rsvp, { forceEnabled: false });
    for (const action of rsvpActions) config = applyRsvpAction(config, action);
    dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.RSVP_CONFIG_UPDATE, { config });
    synchronizeFunctionalCta(targetWindow, "rsvp-boton", config.enabled);
    expected.rsvp = config;
  }

  const giftActions = actions.filter((action) => getActionOwner(action.type) === "gifts");
  if (giftActions.length) {
    let config = normalizeGiftConfig(render.gifts, { forceEnabled: false });
    let requestedButtonText = "";
    for (const action of giftActions) {
      config = applySelectedGiftAction(config, action, confirmedGiftMethods);
      if (action.type === "gifts.set_button_text") {
        requestedButtonText = action.arguments.text;
      }
    }
    dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.GIFT_CONFIG_UPDATE, { config });
    synchronizeFunctionalCta(targetWindow, "regalo-boton", config.enabled, requestedButtonText);
    expected.gifts = config;
  }
  return expected;
}

function recoveryStateFingerprint(snapshot) {
  return fingerprintDesignerAiValue({ document: snapshot.documentIdentity, availability: snapshot.availability, values: snapshot.values });
}

function recoveryConflict() {
  return Object.assign(new Error("El estado cambió o no permite reanudar con seguridad. Enviá una nueva solicitud para interpretar el estado actual."), { code: "designer-ai/recovery-conflict" });
}

export async function executeDesignerAiActionBatch(
  actions,
  {
    snapshot,
    targetWindow = typeof window !== "undefined" ? window : null,
    isSessionCurrent = () => true,
    waitFrame,
    evidenceAttempts = 120,
    recovery = null,
    onProgress = () => {},
  } = {}
) {
  if (!targetWindow) throw new Error("El runtime del editor no está disponible.");
  const ordered = orderDesignerAiActions(actions);
  const actualSnapshot = readDesignerAiActionEvidence(targetWindow).snapshot;
  if (recovery && (!isSessionCurrent() || !recovery.isSessionCurrent() ||
      recovery.stateFingerprint !== recoveryStateFingerprint(actualSnapshot) ||
      JSON.stringify(recovery.actions) !== JSON.stringify(ordered))) throw recoveryConflict();
  if (recovery) {
    for (const receipt of recovery.actionResults) {
      if (receipt.effective && !matchesDesignerAiActionEvidence(receipt.action, receipt.evidence, actualSnapshot)) throw recoveryConflict();
      if (receipt.executed && !receipt.effective && receipt.beforeStateFingerprint !== recovery.stateFingerprint) throw recoveryConflict();
    }
  }
  const pendingActions = recovery ? recovery.actionResults.filter((r) => !r.effective).map((r) => r.action) : actions;
  const validation = validateDesignerAiActionBatch(pendingActions, {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot,
  });
  if (!validation.ok) {
    const error = new Error(validation.errors.join(" "));
    error.code = "designer-ai/prevalidation-failed";
    throw error;
  }

  const applied = recovery ? recovery.actionResults.filter((r) => r.persisted && !r.error).map((r) => r.action.type) : [];
  const confirmedGiftMethods = recovery ? new Set(recovery.confirmedGiftMethods) : readConfirmedGiftMethods(snapshot);
  const actionResults = recovery ? structuredClone(recovery.actionResults) : ordered.map((action) => ({
    action, requested: true, executed: false, effective: false, persisted: false, error: null,
  }));
  const captureRecovery = (expectedRender = {}) => ({
    actions: ordered, actionResults: structuredClone(actionResults), expectedRender,
    confirmedGiftMethods: [...confirmedGiftMethods], isSessionCurrent,
    stateFingerprint: recoveryStateFingerprint(readDesignerAiActionEvidence(targetWindow).snapshot),
  });

  for (let index = 0; index < ordered.length; index += 1) {
    const action = ordered[index];
    const receipt = actionResults[index];
    if (receipt.persisted && !receipt.error) continue;
    let persistenceError = null;
    let expectedRender = receipt.effective ? recovery.expectedRender : {};
    try {
      if (!isSessionCurrent()) throw Object.assign(new Error("La sesión del borrador cambió antes de aplicar el lote."), { code: "designer-ai/stale-session" });
      const persistOnly = receipt.effective;
      receipt.beforeStateFingerprint = recoveryStateFingerprint(readDesignerAiActionEvidence(targetWindow).snapshot);
      receipt.executed = true;
      receipt.error = null;
      onProgress(persistOnly ? "saving" : "applying");
      if (action.type === "document.set_name") {
        try { await persistDashboardDocumentUpdate({
          name: action.arguments.name,
          source: "designer-ai",
        }, targetWindow); } catch (error) { persistenceError = error; }
      } else if (persistOnly) {
        // The effect is still exact; retry its existing writer, never the additive mutation.
      } else if (getActionOwner(action.type) === "event") {
        try { await executeEventAction(action, targetWindow); } catch (error) { persistenceError = error; }
      } else if (getActionOwner(action.type) === "story") {
        try { await executeStoryAction(action, targetWindow); } catch (error) { persistenceError = error; }
      } else if (getActionOwner(action.type) === "gallery") {
        expectedRender = executeGalleryAction(action, targetWindow);
      } else {
        expectedRender = await executeConfigOwners([action], targetWindow, confirmedGiftMethods);
      }
      const reflected = () => {
        const { snapshot: current, render } = readDesignerAiActionEvidence(targetWindow);
        return isDesignerAiActionEffective(action, current, render, expectedRender);
      };
      await waitForDesignerAiEffect(reflected, { isSessionCurrent, waitFrame, attempts: evidenceAttempts });
      receipt.effective = true;
      receipt.evidence = captureDesignerAiActionEvidence(receipt.action, readDesignerAiActionEvidence(targetWindow).snapshot);
      if (persistenceError) throw persistenceError;
      if (action.type !== "document.set_name") {
        onProgress("saving");
        const persisted = await confirmDesignerAiPersistence(targetWindow, isSessionCurrent);
        if (!isDesignerAiActionEffective(action, persisted.snapshot, persisted.render, expectedRender)) {
          throw Object.assign(new Error("El guardado no contiene el efecto solicitado."), { code: "designer-ai/persistence-failed" });
        }
        if (!matchesDesignerAiActionEvidence(receipt.action, receipt.evidence, persisted.snapshot)) {
          throw Object.assign(new Error("El guardado no acredita el mismo valor observado."), { code: "designer-ai/persistence-conflict" });
        }
      }
      if (!isSessionCurrent()) throw new Error("La sesión del borrador cambió.");
      receipt.persisted = true;
      if (!matchesDesignerAiActionEvidence(receipt.action, receipt.evidence, readDesignerAiActionEvidence(targetWindow).snapshot)) {
        throw Object.assign(new Error("El valor cambió durante el guardado. Volvé a indicar el cambio que necesitás."), { code: "designer-ai/evidence-conflict" });
      }
      applied.push(action.type);
    } catch (error) {
      receipt.error = error.code || "designer-ai/action-failed";
      error.appliedActions = applied;
      error.actionResults = actionResults;
      error.recovery = captureRecovery(expectedRender);
      throw error;
    }
  }
  return { appliedActions: applied, actionResults, recovery: captureRecovery() };
}

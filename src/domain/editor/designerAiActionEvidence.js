import { buildDesignerAiCapabilitySnapshot, readDesignerAiCapabilitySnapshot } from "./designerAiCapabilities.js";
import { readEditorRenderSnapshot } from "../../lib/editorSnapshotAdapter.js";
import { readDashboardDocumentNameState } from "../../lib/dashboardDocumentNameBridge.js";
import { readCanvasEditorMethod } from "../../lib/editorRuntimeBridge.js";
import { normalizeGiftConfig } from "../gifts/config.js";
import { normalizeRsvpConfig } from "../rsvp/config.js";
import { findFunctionalCtaButtonByType } from "../functionalCtaButtons.js";
import valueNormalization from "../../../shared/authoringValueNormalization.cjs";
const { normalizeAuthoringText, normalizeStoryTextValue } = valueNormalization;

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const requested = (actual, args, keys) => keys.every((key) => args[key] == null || actual?.[key] === args[key]);

// Predicates describe the requested effect, not a changed global revision.
// expectedRender is produced by the existing domain reducer for compound actions.
export function isDesignerAiActionEffective(action, snapshot, render, expectedRender = {}) {
  const a = action.arguments;
  const v = snapshot.values;
  if (expectedRender.gifts && !equal(normalizeGiftConfig(render.gifts, { forceEnabled: false }), expectedRender.gifts)) return false;
  switch (action.type) {
    case "document.set_name": return v.documentName === normalizeAuthoringText(a.name);
    case "event.set_people": return v.people.primaryName === normalizeAuthoringText(a.primaryName) && v.people.secondaryName === normalizeAuthoringText(a.secondaryName);
    case "event.set_mode": return v.eventMode === a.mode;
    case "event.set_datetime": return requested(v[a.phase], a, ["date", "startTime", "endTime"]);
    case "event.set_location_text": return requested(v[a.phase], { venueName: normalizeAuthoringText(a.venueName), address: normalizeAuthoringText(a.address) }, ["venueName", "address"]) && !v[a.phase].placeSelected;
    case "event.set_dress_code": return requested(v.dressCode, { enabled: a.enabled, value: normalizeStoryTextValue(a.value) }, ["enabled", "value"]);
    case "story.set_text": return v.story === normalizeStoryTextValue(a.text);
    case "gallery.move_photo": return equal(render.objetos?.find((o) => o.id === a.galleryId), expectedRender.gallery);
    case "rsvp.set_enabled": return v.rsvp.enabled === a.enabled && ctaReflected(render, "rsvp-boton", a.enabled);
    case "rsvp.set_question_active":
    case "rsvp.update_question":
    case "rsvp.move_question":
    case "rsvp.remove_option":
    case "rsvp.add_option":
    case "rsvp.rename_option":
    case "rsvp.update_modal": return equal(normalizeRsvpConfig(render.rsvp, { forceEnabled: false }), expectedRender.rsvp);
    case "gifts.set_enabled": return v.gifts.enabled === a.enabled && ctaReflected(render, "regalo-boton", a.enabled);
    case "gifts.set_method": {
      const config = normalizeGiftConfig(render.gifts, { forceEnabled: false });
      const value = a.method === "giftListLink" ? config.giftListUrl : config.bank[a.method];
      const accepted = normalizeGiftConfig(a.method === "giftListLink"
        ? { giftListUrl: a.value }
        : { bank: { [a.method]: a.value } }, { forceEnabled: false });
      const expected = a.method === "giftListLink" ? accepted.giftListUrl : accepted.bank[a.method];
      // A nonempty URL rejected by the domain is not a successful clear.
      if (a.method === "giftListLink" && a.value && !expected) return false;
      return config.visibility[a.method] === a.visible && (a.value === null || value === expected);
    }
    case "gifts.set_intro_text": return v.gifts.introText === normalizeGiftConfig({ introText: a.text }).introText;
    case "gifts.set_button_text": return v.gifts.buttonText === a.text;
    default: return false;
  }
}

function ctaReflected(render, type, enabled) {
  const button = findFunctionalCtaButtonByType(render.objetos || [], type);
  return enabled ? Boolean(button && button.hidden !== true) : !button || button.hidden === true;
}

export async function waitForDesignerAiEffect(predicate, {
  isSessionCurrent, waitFrame = () => new Promise((resolve) => setTimeout(resolve, 16)), attempts = 120,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isSessionCurrent()) throw Object.assign(new Error("La sesión del borrador cambió."), { code: "designer-ai/stale-session" });
    if (predicate()) {
      // Authoring refs can advance before React commits the render state used by
      // the existing flush owner. Yield a commit boundary, then recheck the effect.
      await waitFrame();
      if (!isSessionCurrent()) throw Object.assign(new Error("La sesión del borrador cambió."), { code: "designer-ai/stale-session" });
      if (predicate()) return;
      continue;
    }
    await waitFrame();
  }
  throw Object.assign(new Error("El editor no confirmó el efecto solicitado."), { code: "designer-ai/evidence-missing" });
}

export async function confirmDesignerAiPersistence(targetWindow, isSessionCurrent) {
  if (!isSessionCurrent()) throw new Error("La sesión del borrador cambió.");
  const documentId = readDashboardDocumentNameState(targetWindow).documentId;
  const flush = readCanvasEditorMethod("flushPersistenceNow", targetWindow);
  if (!flush) throw new Error("El editor no expuso confirmación de guardado.");
  const receipt = await flush({ reason: "designer-ai-evidence", immediate: true });
  if (!isSessionCurrent()) throw new Error("La sesión del borrador cambió.");
  if (!receipt?.ok || !receipt.persistedState || receipt.documentId !== documentId) {
    throw Object.assign(new Error("No se confirmó el guardado del efecto solicitado."), { code: "designer-ai/persistence-failed" });
  }
  const render = receipt.persistedState;
  const authoring = render.templateAuthoringDraft || {};
  const snapshot = buildDesignerAiCapabilitySnapshot({
    renderSnapshot: render,
    authoringSnapshot: { ...authoring, values: render.templateInput?.values || authoring.defaults },
    documentNameState: readDashboardDocumentNameState(targetWindow),
  });
  return { render, snapshot };
}

export function readDesignerAiActionEvidence(targetWindow) {
  return { snapshot: readDesignerAiCapabilitySnapshot(targetWindow), render: readEditorRenderSnapshot(targetWindow) || {} };
}

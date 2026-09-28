const { normalizeRsvpConfig } = require("./rsvpConfig.cjs");
const { normalizeGiftConfig } = require("./giftsConfig.cjs");
const { applyRsvpAction, applySelectedGiftAction, confirmedGiftMethods } = require("./designerAiConfigReducers.cjs");
const { normalizeAuthoringText, normalizeStoryTextValue } = require("./authoringValueNormalization.cjs");
const { moveArrayItem } = require("./gallerySlotOrder.cjs");

const OWNER_ORDER = { document: 10, event: 20, story: 30, gallery: 40, rsvp: 50, gifts: 60 };
function orderDesignerAiActions(actions) {
  return [...actions].sort((a, b) => OWNER_ORDER[a.type.split(".")[0]] - OWNER_ORDER[b.type.split(".")[0]]);
}

// Projection changes functional values only, never canvas or persistence. Config
// actions use the exact reducers used by dispatch. Unknown/masked gift values are
// retained as unknown; projection must not invent data hidden from the provider.
function projectDesignerAiValues(snapshot, actions) {
  const values = JSON.parse(JSON.stringify(snapshot.values || {}));
  const confirmed = confirmedGiftMethods(snapshot);
  for (const action of orderDesignerAiActions(actions)) {
    const a = action.arguments;
    switch (action.type) {
      case "document.set_name": values.documentName = normalizeAuthoringText(a.name); break;
      case "event.set_people": values.people = { primaryName: normalizeAuthoringText(a.primaryName), secondaryName: normalizeAuthoringText(a.secondaryName) }; break;
      case "event.set_mode": values.eventMode = a.mode; break;
      case "event.set_datetime":
        values[a.phase] = { ...values[a.phase], ...Object.fromEntries(["date", "startTime", "endTime"].filter((key) => a[key] != null).map((key) => [key, a[key]])) }; break;
      case "event.set_location_text":
        values[a.phase] = { ...values[a.phase], venueName: normalizeAuthoringText(a.venueName), address: normalizeAuthoringText(a.address), placeSelected: false }; break;
      case "event.set_dress_code": values.dressCode = { enabled: a.enabled, value: normalizeStoryTextValue(a.value) }; break;
      case "story.set_text": values.story = normalizeStoryTextValue(a.text); break;
      case "gallery.move_photo": {
        const gallery = values.galleries.find((entry) => entry.id === a.galleryId);
        if (!gallery) break;
        const positions = gallery.slots.map((slot) => slot.index);
        const from = gallery.slots.findIndex((slot) => slot.index === a.sourceIndex && (!a.sourceCellId || slot.cellId === a.sourceCellId));
        const to = gallery.slots.findIndex((slot) => slot.index === a.targetIndex && (!a.targetCellId || slot.cellId === a.targetCellId));
        if (from >= 0 && to >= 0) gallery.slots = moveArrayItem(gallery.slots, from, to).map((slot, index) => ({ ...slot, index: positions[index] }));
        break;
      }
      default:
        if (action.type.startsWith("rsvp.")) {
          const config = normalizeRsvpConfig({ ...values.rsvp, questions: values.rsvp.questions.map((q, order) => ({ ...q, order })) }, { forceEnabled: false });
          const next = applyRsvpAction(config, action);
          values.rsvp = { enabled: next.enabled, modal: next.modal, questions: next.questions.map((q) => ({ id: q.id, active: q.active, label: q.label, type: q.type, required: q.required, options: (q.options || []).map((o) => ({ id: o.id, label: o.label })) })) };
        } else if (action.type.startsWith("gifts.")) {
          const methods = values.gifts.methods || {};
          const config = normalizeGiftConfig({ enabled: values.gifts.enabled, introText: values.gifts.introText,
            bank: Object.fromEntries(Object.entries(methods).map(([key, data]) => [key, data.value])),
            visibility: Object.fromEntries(Object.entries(methods).map(([key, data]) => [key, data.visible])),
          }, { forceEnabled: false });
          const next = applySelectedGiftAction(config, action, confirmed);
          values.gifts.enabled = next.enabled;
          values.gifts.introText = next.introText;
          for (const [method, visible] of Object.entries(next.visibility)) {
            methods[method] = { ...methods[method], visible };
          }
          if (action.type === "gifts.set_method" && a.value !== null) {
            if (a.method === "giftListLink") methods[a.method] = { ...methods[a.method], value: "", configured: Boolean(next.giftListUrl) };
            else methods[a.method].value = next.bank[a.method];
          }
          if (action.type === "gifts.set_button_text") values.gifts.buttonText = normalizeAuthoringText(a.text);
          else if (next.enabled && !values.gifts.buttonText) values.gifts.buttonText = "Ver regalos";
          values.gifts.methods = methods;
        }
    }
  }
  return values;
}

module.exports = { orderDesignerAiActions, projectDesignerAiValues };

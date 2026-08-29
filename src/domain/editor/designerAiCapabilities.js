import {
  DESIGNER_AI_CONTRACT_VERSION,
  sanitizeCapabilitySnapshot,
} from "../../../shared/designerAiCapabilityContract.js";
import {
  buildDesignerAiLedger,
  normalizeDesignerAiConversationState,
} from "../../../shared/designerAiConversationLedger.js";
import { normalizeEventDetailsConfig } from "../../../shared/eventDetailsConfig.js";
import {
  buildDynamicCountdownEventDetails,
  splitCountdownTargetIso,
} from "../../../shared/countdownEventDetails.js";
import {
  collectEventPersonNameFields,
  resolveEventPersonNamesFromAuthoring,
} from "../eventDetails/personNames.js";
import { EVENT_DETAIL_FEATURES } from "../eventDetails/features.js";
import {
  resolveEventDateSidebarBinding,
} from "../eventDetails/date.js";
import {
  collectEventTimeFields,
  resolveEventTimeFieldFeature,
  resolveEventTimesFromAuthoring,
} from "../eventDetails/time.js";
import {
  collectEventLocationFields,
  resolveEventLocationFieldFeature,
  resolveEventLocationFromAuthoring,
} from "../eventDetails/location.js";
import {
  resolveDressCodeSidebarBinding,
  resolveStoryTextSidebarBinding,
} from "../templates/storyText.js";
import { normalizeRsvpConfig } from "../rsvp/config.js";
import { normalizeGiftConfig } from "../gifts/config.js";
import { getGallerySidebarCandidates } from "../gallery/sidebarModel.js";
import { getGallerySlots } from "../gallery/galleryMutations.js";
import { findFunctionalCtaButtonByType } from "../functionalCtaButtons.js";
import { readDashboardDocumentNameState } from "../../lib/dashboardDocumentNameBridge.js";
import { readEditorRenderSnapshot } from "../../lib/editorSnapshotAdapter.js";
import {
  readCanvasEditorMethod,
  readEditorCoverImage,
} from "../../lib/editorRuntimeBridge.js";

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function hasFeatureFields(fields, resolver, feature) {
  return fields.some((field) => resolver(field) === feature);
}

function resolvePhaseState({ authoringSnapshot, objects, feature }) {
  const fieldsSchema = Array.isArray(authoringSnapshot.fieldsSchema)
    ? authoringSnapshot.fieldsSchema
    : [];
  const defaults = asRecord(authoringSnapshot.defaults);
  const baseDate = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults,
    objetos: objects,
    feature,
  });
  const countdown = buildDynamicCountdownEventDetails({
    fieldsSchema,
    objetos: objects,
    fieldKey: baseDate.fieldKey,
  });
  const dateBinding = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults,
    countdownDetails: countdown,
    objetos: objects,
    feature,
  });
  const dateParts = splitCountdownTargetIso(dateBinding.targetISO);
  const times = resolveEventTimesFromAuthoring({
    fieldsSchema,
    defaults,
    fallbackStartTime: dateParts.time,
    feature,
  });
  const location = resolveEventLocationFromAuthoring({
    fieldsSchema,
    defaults,
    objetos: objects,
    feature,
  });
  const timeFields = collectEventTimeFields(fieldsSchema);
  const locationFields = collectEventLocationFields(fieldsSchema);

  return {
    values: {
      date: dateParts.date || normalizeText(dateBinding.targetISO).slice(0, 10),
      startTime: times.startTime,
      endTime: times.endTime,
      venueName: location.venueName,
      address: location.address,
      placeSelected: Boolean(location.googlePlaceId),
    },
    availability: {
      datetime:
        dateBinding.hasBinding === true ||
        hasFeatureFields(timeFields, resolveEventTimeFieldFeature, feature),
      location: hasFeatureFields(
        locationFields,
        resolveEventLocationFieldFeature,
        feature
      ),
    },
  };
}

function buildGallerySnapshot(objects) {
  return getGallerySidebarCandidates(objects).map((gallery) => ({
    id: normalizeText(gallery.id),
    slots: getGallerySlots(gallery, { visibleOnly: true }).map((slot, index) => ({
      cellId: normalizeText(slot.cellId) || null,
      index: Number.isInteger(slot.sourceIndex) ? slot.sourceIndex : index,
      occupied: slot.isPopulated === true,
      contentRevision: fingerprint(
        slot.mediaUrl || ""
      ),
    })),
  }));
}

function buildRsvpSnapshot(rawConfig) {
  const config = normalizeRsvpConfig(rawConfig, { forceEnabled: false });
  return {
    enabled: config.enabled === true,
    questions: config.questions.map((question) => ({
      id: question.id,
      active: question.active === true,
      label: question.label,
      type: question.type,
      required: question.required === true,
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({ id: option.id, label: option.label }))
        : [],
    })),
    modal: { ...config.modal },
  };
}

function buildGiftSnapshot(rawConfig, objects) {
  const config = normalizeGiftConfig(rawConfig, { forceEnabled: false });
  const giftButton = findFunctionalCtaButtonByType(objects, "regalo-boton");
  const methods = {
    holder: { value: config.bank.holder, visible: config.visibility.holder },
    bank: { value: config.bank.bank, visible: config.visibility.bank },
    alias: { value: config.bank.alias, visible: config.visibility.alias },
    cbu: { value: config.bank.cbu, visible: config.visibility.cbu },
    cuit: { value: config.bank.cuit, visible: config.visibility.cuit },
    giftListLink: {
      value: config.giftListUrl,
      visible: config.visibility.giftListLink,
      configured: Boolean(normalizeText(config.giftListUrl)),
    },
  };
  return {
    enabled: config.enabled === true,
    introText: config.introText,
    buttonText: normalizeText(giftButton?.texto),
    methods,
  };
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

export function buildDesignerAiCapabilitySnapshot({
  documentNameState = {},
  renderSnapshot = {},
  authoringSnapshot = {},
  coverImage = "",
  conversationState = documentNameState.designerAiConversation,
  sourceContext = documentNameState.designerAiSourceContext,
} = {}) {
  const render = asRecord(renderSnapshot);
  const authoring = asRecord(authoringSnapshot);
  const objects = Array.isArray(render.objetos)
    ? render.objetos
    : Array.isArray(authoring.objetos)
      ? authoring.objetos
      : [];
  const fieldsSchema = Array.isArray(authoring.fieldsSchema) ? authoring.fieldsSchema : [];
  const defaults = asRecord(authoring.defaults);
  const authoringWithObjects = { ...authoring, objetos: objects };
  const people = resolveEventPersonNamesFromAuthoring({ fieldsSchema, defaults, objetos: objects });
  const ceremony = resolvePhaseState({
    authoringSnapshot: authoringWithObjects,
    objects,
    feature: EVENT_DETAIL_FEATURES.CEREMONY,
  });
  const party = resolvePhaseState({
    authoringSnapshot: authoringWithObjects,
    objects,
    feature: EVENT_DETAIL_FEATURES.PARTY,
  });
  const eventDetails = normalizeEventDetailsConfig(render.eventDetails);
  const story = resolveStoryTextSidebarBinding({ fieldsSchema, defaults, objetos: objects });
  const dressCode = resolveDressCodeSidebarBinding({ fieldsSchema, defaults, objetos: objects });
  const galleries = buildGallerySnapshot(objects);

  const availability = {
    documentName:
      documentNameState.documentKind !== "template" && documentNameState.editable === true,
    people: collectEventPersonNameFields(fieldsSchema).length > 0,
    eventMode: true,
    ceremonyDatetime: ceremony.availability.datetime,
    partyDatetime: party.availability.datetime,
    ceremonyLocation: ceremony.availability.location,
    partyLocation: party.availability.location,
    dressCode: dressCode.hasBinding === true,
    story: story.hasBinding === true,
    cover: Boolean(normalizeText(coverImage)),
    gallery: galleries.length > 0,
    rsvp: true,
    gifts: true,
  };

  const values = {
    documentName: normalizeText(documentNameState.name),
    people,
    eventMode: eventDetails.mode,
    ceremony: ceremony.values,
    party: party.values,
    dressCode: {
      enabled: eventDetails.dressCode.enabled === true,
      value: dressCode.value || eventDetails.dressCode.value,
    },
    story: story.value,
    media: {
      hasCover: Boolean(normalizeText(coverImage)),
      contentRevision: fingerprint(normalizeText(coverImage)),
    },
    galleries,
    rsvp: buildRsvpSnapshot(render.rsvp),
    gifts: buildGiftSnapshot(render.gifts, objects),
  };
  const normalizedConversationState = normalizeDesignerAiConversationState(conversationState);
  const ledger = buildDesignerAiLedger({
    availability,
    values,
    conversationState: normalizedConversationState,
    sourceContext,
  });
  const safe = sanitizeCapabilitySnapshot({
    revision: "pending",
    availability,
    values,
    ledger,
    conversation: {
      usage: normalizedConversationState.usage,
      namePolicy: normalizedConversationState.namePolicy,
    },
  });
  safe.revision = fingerprint({
    availability: safe.availability,
    values: safe.values,
    ledger: safe.ledger,
    conversation: { namePolicy: safe.conversation.namePolicy },
  });
  return safe;
}

export function readDesignerAiCapabilitySnapshot(targetWindow, options = {}) {
  const getAuthoringSnapshot = readCanvasEditorMethod(
    "getTemplateAuthoringSnapshot",
    targetWindow
  );
  const renderSnapshot = readEditorRenderSnapshot(targetWindow) || {};
  const authoringSnapshot = typeof getAuthoringSnapshot === "function"
    ? getAuthoringSnapshot() || {}
    : {};
  return buildDesignerAiCapabilitySnapshot({
    documentNameState: readDashboardDocumentNameState(targetWindow),
    renderSnapshot,
    authoringSnapshot,
    coverImage: readEditorCoverImage(targetWindow),
    conversationState: options.conversationState,
    sourceContext: options.sourceContext,
  });
}

export function buildDesignerAiCallablePayload({
  clientMessageId,
  message,
  recentTurns = [],
  snapshot,
  entryMode = "continuation",
} = {}) {
  const safeSnapshot = sanitizeCapabilitySnapshot(snapshot);
  const capabilitySnapshot = {
    ...safeSnapshot,
    values: {
      ...safeSnapshot.values,
      media: { hasCover: safeSnapshot.values.media.hasCover },
      galleries: safeSnapshot.values.galleries.map((gallery) => ({
        id: gallery.id,
        slots: gallery.slots.map((slot) => ({
          cellId: slot.cellId,
          index: slot.index,
          occupied: slot.occupied,
        })),
      })),
    },
    ledger: {
      ...safeSnapshot.ledger,
      leaves: safeSnapshot.ledger.leaves.map((leaf) => ({
        ...leaf,
        fingerprint: "",
      })),
    },
  };
  return {
    contractVersion: DESIGNER_AI_CONTRACT_VERSION,
    clientMessageId: normalizeText(clientMessageId),
    entryMode: ["first_entry", "reentry", "continuation"].includes(entryMode)
      ? entryMode
      : "continuation",
    message: String(message || "").trim(),
    recentTurns: (Array.isArray(recentTurns) ? recentTurns : [])
      .slice(-6)
      .map((turn) => ({
        role: turn?.role === "assistant" ? "assistant" : "user",
        content: String(turn?.content || "").slice(0, 700),
      })),
    capabilitySnapshot,
  };
}

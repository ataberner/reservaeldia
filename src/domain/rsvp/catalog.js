// Canonical pure domain implementation shared with server-side AI validation.
import runtime from "../../../shared/rsvpCatalog.cjs";
export const RSVP_VERSION = runtime.RSVP_VERSION;
export const RSVP_LIMITS = runtime.RSVP_LIMITS;
export const RSVP_CUSTOM_IDS = runtime.RSVP_CUSTOM_IDS;
export const RSVP_PRESETS = runtime.RSVP_PRESETS;
export const listCatalogQuestionTemplates = runtime.listCatalogQuestionTemplates;
export const listQuestionTemplates = runtime.listQuestionTemplates;
export const resolvePresetId = runtime.resolvePresetId;
export const getPresetDefinition = runtime.getPresetDefinition;
export const getQuestionTemplate = runtime.getQuestionTemplate;
export const isCustomQuestionId = runtime.isCustomQuestionId;
export const createQuestionsForPreset = runtime.createQuestionsForPreset;

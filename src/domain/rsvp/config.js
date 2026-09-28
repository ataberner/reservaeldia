// Canonical pure domain implementation shared with server-side AI validation.
import runtime from "../../../shared/rsvpConfig.cjs";
export const RSVP_DEFAULT_MODAL = runtime.RSVP_DEFAULT_MODAL;
export const RSVP_QUESTION_TYPES = runtime.RSVP_QUESTION_TYPES;
export const isRsvpConfigV2 = runtime.isRsvpConfigV2;
export const createDefaultRsvpConfig = runtime.createDefaultRsvpConfig;
export const normalizeRsvpConfig = runtime.normalizeRsvpConfig;
export const getOrderedQuestions = runtime.getOrderedQuestions;
export const getQuestionById = runtime.getQuestionById;
export const countActiveQuestions = runtime.countActiveQuestions;
export const countActiveCustomQuestions = runtime.countActiveCustomQuestions;
export const hasActiveQuestion = runtime.hasActiveQuestion;

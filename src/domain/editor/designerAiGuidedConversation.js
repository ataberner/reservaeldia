import { buildDesignerAiConversationBrief, buildDesignerAiGalleryCompletionLeafId } from "../../../shared/designerAiConversationLedger.js";
import { getDesignerAiLocationPhaseLabel } from "./designerAiLocationInteraction.js";

export const DESIGNER_AI_GALLERY_HELP_QUESTION = "¿Querés que te ayude a cambiar las fotos de las galerías?";
export const DESIGNER_AI_GALLERY_HELP_LATER = "Podés cambiar las fotos más adelante desde el asistente o desde el tab Fotos.";
export const DESIGNER_AI_COVER_HELP_QUESTION = "¿Querés cambiar la foto de portada actual?";
export const DESIGNER_AI_COVER_HELP_LATER = "Conservamos la portada actual. Podés pedirme cambiarla más adelante o hacerlo desde el tab Fotos.";

export function resolveDesignerAiCoverHelp({ result, snapshot, decision = {}, userReply = false }) {
  const guided = snapshot.conversation.mode !== "editing";
  const step = buildDesignerAiConversationBrief(snapshot).nextStep;
  // Automatic continuation can offer only the current guided step. A human
  // request remains reactive, including deliberate changes made out of order.
  const controlRequest = result.controlRequest?.type === "cover_upload" && guided && !userReply && step?.kind !== "cover"
    ? null : result.controlRequest;
  const coverRequest = controlRequest?.type === "cover_upload";
  const deferred = !coverRequest && result.resolutions?.some((resolution) =>
    resolution.leafId === "media.cover" && resolution.status === "deferred_by_user");
  // A user-requested control is consent; an auto-start/continuation request is
  // only an offer. Neither opening nor declining confirms an image replacement.
  const accepted = !deferred && (decision.accepted === true || (coverRequest && userReply));
  const offer = !accepted && !deferred && (coverRequest ||
    (!decision.offered && !controlRequest && guided && step?.kind === "cover"));
  return {
    offer, deferred,
    decision: { offered: !deferred && (offer || decision.offered === true), accepted },
    controlRequest: coverRequest && !accepted ? null : controlRequest,
  };
}

// Presentation handshake only. The existing ledger owns durable deferrals and
// completion; the model interprets the user's answer, as with the Maps decision.
export function resolveDesignerAiGalleryHelp({ result, snapshot, decision = {}, userReply = false }) {
  const guided = snapshot.conversation.mode !== "editing";
  const step = buildDesignerAiConversationBrief(snapshot).nextStep;
  const matchesStep = step?.kind === "gallery" &&
    step.leafIds.includes(buildDesignerAiGalleryCompletionLeafId(result.controlRequest?.galleryId));
  const controlRequest = result.controlRequest?.type === "gallery_cell_upload" && guided && !userReply && !matchesStep
    ? null : result.controlRequest;
  const galleryRequest = controlRequest?.type === "gallery_cell_upload";
  const deferred = !galleryRequest && result.resolutions?.some((resolution) =>
    /^media\.gallery\..+\.guided_completion$/.test(resolution.leafId) && resolution.status === "deferred_by_user");
  const accepted = !deferred && (decision.accepted === true || (galleryRequest && userReply &&
    (decision.offered === true || snapshot.conversation.mode === "editing")));
  const offer = !accepted && !deferred && (galleryRequest ||
    (!decision.offered && !controlRequest && guided && step?.kind === "gallery"));
  return {
    offer,
    deferred,
    decision: { offered: !deferred && (offer || decision.offered === true), accepted },
    controlRequest: galleryRequest && !accepted ? null : controlRequest,
  };
}

// The ledger chooses both the block and the concrete datum. This adapter owns
// only its wording; neither model prose nor template text can choose a question.
export function buildDesignerAiGuidedQuestion(snapshot, { clarification } = {}) {
  const step = buildDesignerAiConversationBrief(snapshot).nextStep;
  if (!step) return "";
  const label = getDesignerAiLocationPhaseLabel(step.phase, snapshot.values.eventMode);
  const event = label === "evento" ? "el evento" : `la ${label}`;
  const eventOwner = label === "evento" ? "del evento" : `de la ${label}`;
  if (step.kind === "date" && step.leafIds.includes(clarification?.leafId)) {
    if (clarification.kind === "missing_year") return `¿De qué año es la fecha ${eventOwner}?`;
    if (clarification.kind === "invalid_date") return `Necesito confirmar la fecha. ¿Qué día, mes y año es ${event}?`;
  }
  switch (step.kind) {
    case "names": return step.leafIds.length === 1 ||
      (clarification?.kind === "missing_value" && step.leafIds.includes(clarification.leafId))
      ? "¿Cómo se llama la otra persona que se casa?"
      : "¿Me compartís los nombres de quienes se casan?";
    case "event_structure": return "¿Van a tener ceremonia y fiesta o un único evento?";
    case "date": return `¿Qué día es ${event}?`;
    case "start_time": return `¿A qué hora empieza ${event}?`;
    case "venue_name": return `¿Cómo se llama el lugar ${eventOwner}?`;
    case "location_method": return "¿Querés buscar el lugar en Google Maps o cargar la dirección manualmente?";
    case "address": return `¿Cuál es la dirección ${eventOwner}?`;
    case "place_selection": return "¿Querés verificar la ubicación en Google Maps o conservar los datos manuales?";
    case "dress_code_enabled": return "¿Quieren incluir Dress Code?";
    case "dress_code_value": return "¿Qué Dress Code quieren indicar?";
    case "rsvp_enabled": return "¿Quieren que los invitados confirmen asistencia desde la invitación?";
    case "gift_bank_details": return "Pasame los datos bancarios que quieran mostrar. Con un alias alcanza.";
    case "gift_external_list": return "Pasame el enlace de la lista de regalos.";
    case "gift_method_values": {
      const labels = { alias: "el alias", cbu: "el CBU o CVU", cuit: "el CUIT", holder: "el titular", bank: "el banco o billetera", giftListLink: "el enlace de la lista" };
      return `Pasame ${step.leafIds.map((id) => labels[id.split(".")[2]]).join(" y ")} que quieran mostrar.`;
    }
    case "gifts_choice": return snapshot.values.gifts.enabled
        ? "¿Quieren compartir una lista externa de regalos o datos bancarios? Pasame el enlace o los datos que quieran mostrar."
        : "¿Quieren incluir una sección de regalos, con una lista externa o datos bancarios?";
    case "cover": return DESIGNER_AI_COVER_HELP_QUESTION;
    case "gallery": return DESIGNER_AI_GALLERY_HELP_QUESTION;
    default: return "";
  }
}

// A verified local control needs presentation of the current ledger, not another
// model proposal. This never creates actions, resolutions or completion evidence.
export function buildDesignerAiLocalContinuation(snapshot, { acknowledgement = "Sigamos con tu invitación.", galleryHelp = {} } = {}) {
  if (snapshot.conversation.mode === "editing") {
    return { assistantMessage: acknowledgement, controlRequest: null, galleryHelp };
  }
  const nextBlock = buildDesignerAiConversationBrief(snapshot).nextBlock;
  let controlRequest = null;
  let question = buildDesignerAiGuidedQuestion(snapshot);
  let nextGalleryHelp = galleryHelp;
  if (nextBlock?.id === "galleries") {
    const gallery = snapshot.values.galleries.find((item) =>
      nextBlock.leafIds.includes(buildDesignerAiGalleryCompletionLeafId(item.id)));
    const slot = gallery?.slots?.[0];
    if (galleryHelp.accepted && slot) {
      // Consent already covers the galleries. This only opens the existing panel;
      // the human still selects photos and explicitly finishes each gallery.
      controlRequest = { type: "gallery_cell_upload", galleryId: gallery.id, cellId: slot.cellId, cellIndex: slot.index };
      question = "Sigamos con las fotos de la galería.";
    } else {
      nextGalleryHelp = { ...galleryHelp, offered: true };
    }
  }
  return { assistantMessage: [acknowledgement, question].filter(Boolean).join(" "), controlRequest, galleryHelp: nextGalleryHelp };
}

export function resolveDesignerAiEntryGreeting(result) {
  // This optional public field is emitted only by the backend opening path,
  // outside the model's output schema. Legacy responses have no safe prose
  // boundary, so do not try to extract a greeting from arbitrary questions.
  return typeof result?.entryGreeting === "string" && result.entryGreeting.trim()
    ? result.entryGreeting.trim() : "¡Hola! Sigamos con tu invitación.";
}

// End time is deliberately outside the guided journey. Only an explicit human
// request about ending permits its local clarification; a model hint alone
// must never insert this optional question into the proactive sequence.
function buildReactiveEndTimeQuestion(snapshot, result, userMessage) {
  const clarification = result?.clarification;
  const match = /^event\.(ceremony|party)\.end_time$/.exec(clarification?.leafId || "");
  if (clarification?.kind !== "missing_value" || !match ||
      !/\b(?:termin(?:a|an|ar)|finaliz(?:a|an|ar)|hora(?:rio)?\s+(?:de\s+)?fin|hasta\s+(?:las?|qu[eé]\s+hora))\b/i.test(userMessage)) return "";
  const leaf = snapshot.ledger.leaves.find((item) => item.id === clarification.leafId);
  if (!leaf || leaf.status !== "needs_clarification" || !result.resolutions?.some((item) =>
    item.leafId === leaf.id && item.status === "needs_clarification")) return "";
  const phase = match[1];
  if (snapshot.values.eventMode === "single") return phase === "ceremony" ? "¿A qué hora termina el evento?" : "";
  const ceremony = /\bceremonia\b/i.test(userMessage);
  const party = /\bfiesta\b/i.test(userMessage);
  if (ceremony === party) return "Indicame a qué hora termina la ceremonia o la fiesta y cuál querés cambiar.";
  if ((ceremony ? "ceremony" : "party") !== phase) return "";
  return `¿A qué hora termina la ${ceremony ? "ceremonia" : "fiesta"}?`;
}

export function buildDesignerAiScopeNotice(result) {
  return result?.intent === "out_of_scope" || result?.notice === "unsupported_request"
    ? "Para esos ajustes, usá los controles del editor. Desde acá puedo ayudarte con los datos y las funciones disponibles de la invitación." : "";
}

export function withDesignerAiGuidedContinuation(message, { previousSnapshot, snapshot, result, verifiedContinuation = false, entryMode = "continuation", executionFeedback = "", trustedAcknowledgement = "", userMessage = "" } = {}) {
  // An entry response is a safe greeting supplied by the backend. The ledger,
  // not the model or old chat history, chooses the first pending question. This
  // branch is only used for the panel's automatic entry request, never for a
  // human reply or an in-block clarification.
  if (["first_entry", "reentry"].includes(entryMode)) {
    if (snapshot?.conversation?.mode === "editing") {
      return typeof result?.entryGreeting === "string" && result.entryGreeting.trim()
        ? resolveDesignerAiEntryGreeting(result)
        : `${resolveDesignerAiEntryGreeting(result)} Contame qué querés ajustar.`;
    }
    return [resolveDesignerAiEntryGreeting(result), buildDesignerAiGuidedQuestion(snapshot)].filter(Boolean).join(" ");
  }
  const editing = previousSnapshot?.conversation?.mode === "editing";
  if (editing && !verifiedContinuation) return message;
  const deferred = result?.resolutions?.some((resolution) => resolution.status === "deferred_by_user" &&
    snapshot.ledger.leaves.some((leaf) => leaf.id === resolution.leafId && leaf.status === "deferred_by_user"));
  const acknowledgement = [...new Set([executionFeedback, trustedAcknowledgement].filter(Boolean))].join(" ") ||
    (verifiedContinuation ? "Listo." : deferred ? "Lo dejamos para más adelante." : "");
  const notice = buildDesignerAiScopeNotice(result);
  const controlCopy = {
    google_place_picker: "Buscá y seleccioná el lugar en Google Maps desde este panel.",
    cover_upload: "Podés cargar la nueva foto de portada desde este panel.",
    gallery_cell_upload: "Podés cambiar las fotos de la galería desde este panel.",
  }[result?.controlRequest?.type];
  // Never concatenate model prose with a local question: punctuation and intent
  // labels cannot prove what that prose asks or whether its claimed change saved.
  const question = editing ? "" : controlCopy || buildReactiveEndTimeQuestion(snapshot, result, userMessage) ||
    buildDesignerAiGuidedQuestion(snapshot, { clarification: result?.clarification });
  return [acknowledgement, notice, question].filter(Boolean).join(" ") || "Sigamos ajustando tu invitación.";
}

export function buildDesignerAiCompletionMessage(snapshot) {
  const deferred = buildDesignerAiConversationBrief(snapshot).deferredLeafIds;
  const pending = [...new Set(deferred.map((id) => {
    if (/^event\.(ceremony|party)\./.test(id)) {
      const [, phase, field] = id.split(".");
      const label = getDesignerAiLocationPhaseLabel(phase, snapshot.values.eventMode);
      const owner = label === "evento" ? "del evento" : `de la ${label}`;
      const item = ["venue_name", "address", "place_selection"].includes(field) ? "el lugar" : field === "date" ? "la fecha" : "el horario";
      return `${item} ${owner}`;
    }
    return snapshot.ledger.leaves.find((leaf) => leaf.id === id)?.block === "galleries" ? "las fotos de la galería"
      : id.startsWith("rsvp.") ? "la confirmación de asistencia" : id.startsWith("gifts.") ? "los regalos"
        : id.startsWith("event.dress_code.") ? "el Dress Code" : id === "media.cover" ? "la foto de portada"
          : id === "event.mode" ? "la estructura del evento" : "los nombres";
  }))];
  const reminder = pending.length ? ` Quedó pendiente para más adelante: ${pending.join(", ")}.` : "";
  return `¡Listo! Ya recorrimos lo principal de la invitación.${reminder}\n\nPodés ver cómo quedó en la vista previa, seguir ajustándola desde el sidebar o pedirme cualquier cambio por acá.`;
}

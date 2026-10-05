import { buildDesignerAiConversationBrief, buildDesignerAiGalleryCompletionLeafId } from "../../../shared/designerAiConversationLedger.js";
import { getDesignerAiLocationPhaseLabel } from "./designerAiLocationInteraction.js";

export const DESIGNER_AI_GALLERY_HELP_QUESTION = "¿Querés que te ayude a cambiar las fotos de las galerías?";
export const DESIGNER_AI_GALLERY_HELP_LATER = "Podés cambiar las fotos más adelante desde el asistente o desde el tab Fotos.";
export const DESIGNER_AI_COVER_HELP_QUESTION = "¿Querés cambiar la foto de portada actual?";
export const DESIGNER_AI_COVER_HELP_LATER = "Conservamos la portada actual. Podés pedirme cambiarla más adelante o hacerlo desde el tab Fotos.";

export function resolveDesignerAiCoverHelp({ result, snapshot, decision = {}, userReply = false }) {
  const coverRequest = result.controlRequest?.type === "cover_upload";
  const deferred = !coverRequest && result.resolutions?.some((resolution) =>
    resolution.leafId === "media.cover" && resolution.status === "deferred_by_user");
  // A user-requested control is consent; an auto-start/continuation request is
  // only an offer. Neither opening nor declining confirms an image replacement.
  const accepted = !deferred && (decision.accepted === true || (coverRequest && userReply));
  const offer = !accepted && !deferred && (coverRequest ||
    (!decision.offered && !result.controlRequest && snapshot.conversation.mode !== "editing" &&
      buildDesignerAiConversationBrief(snapshot).nextBlock?.id === "cover"));
  return {
    offer, deferred,
    decision: { offered: !deferred && (offer || decision.offered === true), accepted },
    controlRequest: coverRequest && !accepted ? null : result.controlRequest,
  };
}

// Presentation handshake only. The existing ledger owns durable deferrals and
// completion; the model interprets the user's answer, as with the Maps decision.
export function resolveDesignerAiGalleryHelp({ result, snapshot, decision = {}, userReply = false }) {
  const galleryRequest = result.controlRequest?.type === "gallery_cell_upload";
  const deferred = !galleryRequest && result.resolutions?.some((resolution) =>
    /^media\.gallery\..+\.guided_completion$/.test(resolution.leafId) && resolution.status === "deferred_by_user");
  const accepted = !deferred && (decision.accepted === true || (galleryRequest && userReply &&
    (decision.offered === true || snapshot.conversation.mode === "editing")));
  const offer = !accepted && !deferred && (galleryRequest ||
    (!decision.offered && !result.controlRequest && buildDesignerAiConversationBrief(snapshot).nextBlock?.id === "galleries"));
  return {
    offer,
    deferred,
    decision: { offered: !deferred && (offer || decision.offered === true), accepted },
    controlRequest: galleryRequest && !accepted ? null : result.controlRequest,
  };
}

// The ledger owns membership, priority and completion. This adapter only supplies
// a question when a verified transition needs one, including a model early stop.
export function buildDesignerAiGuidedQuestion(snapshot) {
  const block = buildDesignerAiConversationBrief(snapshot).nextBlock;
  if (!block) return "";
  switch (block.id) {
    case "names": return "¿Me compartís los nombres de quienes se casan?";
    case "event_structure": return "¿Van a tener ceremonia y fiesta o un único evento?";
    case "dress_code": return block.leafIds.includes("event.dress_code.enabled")
      ? "¿Quieren incluir Dress Code?" : "¿Qué Dress Code quieren indicar?";
    case "rsvp": return "¿Quieren que los invitados confirmen asistencia desde la invitación?";
    case "gifts": {
      const missingMethods = block.leafIds.filter((id) => /^gifts\.method\.[^.]+\.value$/.test(id));
      if (missingMethods.length) {
        const labels = { alias: "el alias", cbu: "el CBU o CVU", cuit: "el CUIT", holder: "el titular", bank: "el banco o billetera", giftListLink: "el enlace de la lista" };
        return `Pasame ${missingMethods.map((id) => labels[id.split(".")[2]]).join(" y ")} que quieran mostrar.`;
      }
      return snapshot.values.gifts.enabled
        ? "¿Quieren compartir una lista externa de regalos o datos bancarios? Pasame el enlace o los datos que quieran mostrar."
        : "¿Quieren incluir una sección de regalos, con una lista externa o datos bancarios?";
    }
    case "cover": return DESIGNER_AI_COVER_HELP_QUESTION;
    case "galleries": return DESIGNER_AI_GALLERY_HELP_QUESTION;
    case "event_data": {
      const phase = block.leafIds[0].split(".")[1];
      const ids = new Set(block.leafIds.filter((id) => id.startsWith(`event.${phase}.`)).map((id) => id.split(".")[2]));
      const label = getDesignerAiLocationPhaseLabel(phase, snapshot.values.eventMode);
      const event = label === "evento" ? "el evento" : `la ${label}`;
      if (ids.has("date")) return `¿Qué día es ${event}?`;
      if (ids.has("start_time")) return ids.has("address")
        ? `¿A qué hora empieza ${event} y dónde es?` : `¿A qué hora empieza ${event}?`;
      if (ids.has("address")) return snapshot.values[phase]?.venueName
        ? "¿Querés buscar el lugar en Google Maps o cargar la dirección manualmente?"
        : `¿Dónde es ${event}?`;
      if (ids.has("venue_name")) return "¿Cómo se llama el lugar?";
      return "¿Quieren buscar o verificar la ubicación en Google Maps?";
    }
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

export function withDesignerAiGuidedContinuation(message, { previousSnapshot, snapshot, result, verifiedContinuation = false } = {}) {
  if (result?.intent === "out_of_scope" || result?.controlRequest) return message;
  // After a verified local decision, the ledger owns the next question even
  // inside the same block. Keep the acknowledgement before the first question;
  // stale follow-up questions (and their connecting phrases) must not survive.
  if (verifiedContinuation) {
    const acknowledgement = String(message || "").split("¿")[0].trim() || "Listo.";
    const question = previousSnapshot?.conversation?.mode === "editing" ? "" : buildDesignerAiGuidedQuestion(snapshot);
    return [acknowledgement, question].filter(Boolean).join(" ");
  }
  if (previousSnapshot?.conversation?.mode === "editing") return message;
  const previous = buildDesignerAiConversationBrief(previousSnapshot).nextBlock;
  const next = buildDesignerAiConversationBrief(snapshot).nextBlock;
  if (!next) return message;
  const deferred = result?.resolutions?.some((r) => r.status === "deferred_by_user");
  // Preserve the model's minimal clarification inside the same block (e.g. year
  // after a partial date). Cross-block questions must reflect the reread ledger.
  const requestsInput = /[?¿]/.test(message) || /\b(?:pasame|compartime|indicame|decime|enviame)\b/i.test(message);
  if (!deferred && previous?.id === next.id && requestsInput) return message;
  if (!deferred && previous?.id === next.id && !result?.actions?.length && !result?.resolutions?.length) {
    return `${message}\n\n${buildDesignerAiGuidedQuestion(snapshot)}`;
  }
  const confirmation = String(message).replace(/¿[^?]+\?/g, "").trim();
  return [confirmation, buildDesignerAiGuidedQuestion(snapshot)].filter(Boolean).join(" ");
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

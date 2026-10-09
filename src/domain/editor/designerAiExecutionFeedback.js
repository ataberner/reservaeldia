import { getDesignerAiLocationPhaseLabel } from "./designerAiLocationInteraction.js";
import { matchesDesignerAiActionEvidence } from "../../../shared/designerAiConversationLedger.js";

const methodNames = { holder: "Titular", bank: "Banco", alias: "Alias", cbu: "CBU", cuit: "CUIT", giftListLink: "Lista de regalos" };

function confirmedBankValue(receipt, snapshot) {
  const action = receipt?.action;
  const args = action?.arguments || {};
  if (action?.type !== "gifts.set_method" || !Object.hasOwn(methodNames, args.method) || args.method === "giftListLink" ||
      typeof args.value !== "string" || !args.value.trim() || args.visible !== true ||
      !receipt.requested || !receipt.effective || !receipt.persisted || receipt.error ||
      snapshot?.values?.gifts?.enabled !== true) return "";
  const current = snapshot.values.gifts.methods?.[args.method];
  // Read only the saved, still-current value. A visibility-only action does not
  // prove a value, and an earlier receipt cannot confirm a later edit.
  return current?.visible === true && typeof current.value === "string" &&
    matchesDesignerAiActionEvidence(action, receipt.evidence, snapshot)
    ? current.value : "";
}

function describeReceipt(receipt, snapshot) {
  const value = confirmedBankValue(receipt, snapshot);
  return value ? `${methodNames[receipt.action.arguments.method]} ${value}` : describeAction(receipt.action, snapshot);
}

export function buildDesignerAiExecutionProgress(action, snapshot) {
  const args = action?.arguments || {};
  switch (action?.type) {
    case "document.set_name": return "Actualizando el nombre de la invitación…";
    case "event.set_people": return "Actualizando los nombres…";
    case "event.set_mode": return "Organizando el evento…";
    case "event.set_datetime": {
      const hasDate = args.date != null;
      const hasTime = args.startTime != null || args.endTime != null;
      if (hasDate && hasTime) return "Actualizando la fecha y el horario…";
      if (hasDate) return "Actualizando la fecha…";
      if (hasTime) return "Actualizando el horario…";
      return "Haciendo los cambios…";
    }
    case "event.set_location_text": {
      const current = snapshot?.values?.[args.phase];
      const hasLocation = current?.venueName || current?.address || current?.placeSelected;
      return !hasLocation && (args.venueName || args.address)
        ? "Agregando la ubicación…"
        : "Actualizando la ubicación…";
    }
    case "event.set_dress_code": return "Actualizando el código de vestimenta…";
    case "story.set_text": return "Actualizando la historia…";
    case "gallery.move_photo": return "Reordenando las fotos…";
    case "rsvp.set_enabled":
    case "rsvp.set_question_active":
    case "rsvp.update_question":
    case "rsvp.move_question":
    case "rsvp.add_option":
    case "rsvp.rename_option":
    case "rsvp.remove_option":
    case "rsvp.update_modal": return "Actualizando la confirmación de asistencia…";
    case "gifts.set_enabled":
    case "gifts.set_method":
    case "gifts.set_intro_text":
    case "gifts.set_button_text": return "Actualizando los regalos…";
    default: return "Haciendo los cambios…";
  }
}

function describeAction(action, snapshot) {
  const a = action.arguments || {};
  const questionLabel = snapshot?.values?.rsvp?.questions?.find((q) => q.id === a.questionId)?.label;
  const question = questionLabel ? `Pregunta «${questionLabel}»` : "Pregunta de RSVP";
  switch (action.type) {
    case "document.set_name": return "Nombre de la invitación actualizado";
    case "event.set_people": return `Nombres: ${a.primaryName} y ${a.secondaryName}`;
    case "event.set_mode": return a.mode === "single" ? "Evento único configurado" : "Ceremonia y fiesta configuradas";
    case "event.set_datetime": {
      const parts = [];
      if (a.date) parts.push(`Fecha: ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${a.date}T12:00:00Z`))}`);
      if (a.startTime != null) parts.push(`Hora: ${a.startTime || "pendiente"}`);
      if (a.endTime != null) parts.push(`Hora de fin: ${a.endTime || "sin indicar"}`);
      const label = getDesignerAiLocationPhaseLabel(a.phase, snapshot?.values?.eventMode);
      return `${label[0].toUpperCase()}${label.slice(1)} · ${parts.join(" · ")}`;
    }
    case "event.set_location_text": {
      const label = getDesignerAiLocationPhaseLabel(a.phase, snapshot?.values?.eventMode);
      return `Ubicación ${label === "evento" ? "del evento" : `de la ${label}`} actualizada`;
    }
    case "event.set_dress_code": return a.enabled ? `Dress Code: ${a.value}` : "Dress Code desactivado";
    case "story.set_text": return "Historia actualizada";
    case "gallery.move_photo": return "Foto de la galería movida";
    case "rsvp.set_enabled": return `RSVP ${a.enabled ? "activado" : "desactivado"}`;
    case "rsvp.set_question_active": return `${question} ${a.active ? "activada" : "desactivada"}`;
    case "rsvp.update_question": return `${question} actualizada`;
    case "rsvp.move_question": return "Orden de preguntas actualizado";
    case "rsvp.add_option": return "Opción de RSVP agregada";
    case "rsvp.rename_option": return "Opción de RSVP renombrada";
    case "rsvp.remove_option": return "Opción de RSVP eliminada";
    case "rsvp.update_modal": return "Formulario de RSVP actualizado";
    case "gifts.set_enabled": return `Regalos ${a.enabled ? "activados" : "desactivados"}`;
    case "gifts.set_method": return `${methodNames[a.method] || "Método de regalos"}: ${!a.visible ? "oculto" : a.value === "" ? "valor eliminado" : a.value === null ? "visible" : "actualizado"}`;
    case "gifts.set_intro_text": return "Texto de regalos actualizado";
    case "gifts.set_button_text": return "Texto del botón de regalos actualizado";
    default: return "Cambio solicitado";
  }
}

function visibleReceipts(results, snapshot, includeAutomaticName = false) {
  return (Array.isArray(results) ? results : []).filter((r) => r.requested &&
    (includeAutomaticName || r.action.type !== "document.set_name" ||
      snapshot?.conversation?.namePolicy?.mode !== "automatic"));
}

function isBankAcknowledgement(text) {
  return /^(?:(?:ya|te|lo)\s+)*(?:guardado|confirmado|confirmé|registré|configuré|actualicé|guardé|dejé|anoté|agregué)(?=\s|[,:]|$)/.test(text) ||
    /^(?:(?:el|los|tu|tus)\s+)?(?:cbu|cvu|cuit|alias|titular|banco|datos|cambio)\b.*\b(?:quedó|quedaron|está|están|fue|fueron)\s+(?:guardad|actualizad|confirmad|registrad|configurad)/.test(text) ||
    /^(?:cbu|cvu|cuit|alias|titular|banco)\s*:/.test(text);
}

function withoutLeadingConfirmation(message, receipts, snapshot, bankConfirmation = false) {
  let remainder = String(message).trim();
  const descriptions = receipts.map((r) => describeReceipt(r, snapshot).toLowerCase());
  while (remainder) {
    const sentence = /^[^¿?]*?(?:[.!](?=\s|$)|$)/.exec(remainder)?.[0];
    if (!sentence) break;
    const text = sentence.replace(/[.!]$/, "").trim().toLowerCase();
    const bankAcknowledgement = bankConfirmation && isBankAcknowledgement(text);
    if (!bankAcknowledgement && !/^(listo|hecho|perfecto|agregué|activé|desactivé|actualicé|cambié|guardé|configuré|datos actualizados)\b/.test(text) && !descriptions.includes(text)) break;
    remainder = remainder.slice(sentence.length).trim();
  }
  return remainder;
}

export function buildDesignerAiExecutionFeedback(results, { partial = false, snapshot, structured = false } = {}) {
  // A failed secondary effect matters; successful automatic names do not need
  // repeated user-facing credit. Receipts themselves are never filtered/mutated.
  const requested = visibleReceipts(results, snapshot, partial);
  if (!requested.length) return "";
  const confirmed = requested.filter((r) => r.effective && r.persisted && !r.error);
  if (!partial && confirmed.length !== requested.length) return "";
  if (!partial && !structured && confirmed.length === 1) return `${confirmedBankValue(confirmed[0], snapshot) ? "Confirmado:" : "Listo."} ${describeReceipt(confirmed[0], snapshot)}.`;
  const heading = partial ? `Se guardaron ${confirmed.length} de ${requested.length} cambios:` : `Listo, guardé ${confirmed.length} cambios:`;
  return [heading, ...requested.map((r) => confirmed.includes(r)
    ? `✓ ${describeReceipt(r, snapshot)}`
    : `⚠ ${r.executed ? "No pude confirmar el guardado del cambio" : "Quedó pendiente el cambio"}: ${describeAction(r.action, snapshot)}`)].join("\n");
}

export function withDesignerAiExecutionFeedback(message, results, snapshot, { userMessage = "" } = {}) {
  const requested = (results || []).filter((r) => r.requested);
  if (requested.some((r) => !r.effective || !r.persisted || r.error)) {
    return buildDesignerAiExecutionFeedback(results, { snapshot, partial: true });
  }
  const visible = visibleReceipts(results, snapshot);
  const structured = visible.length >= 3 || /qu[eé]\s+(?:cambi[oó]|cambiaste|cambios)|resum[ií]|resumen/i.test(userMessage);
  const summary = buildDesignerAiExecutionFeedback(results, { snapshot, structured });
  if (!summary) return message;
  const bankConfirmation = visible.some((r) => confirmedBankValue(r, snapshot));
  const conciseSummary = visible.length === 1 ? summary
    : `${bankConfirmation ? "Confirmado:" : "Listo."} ${visible.map((r) => describeReceipt(r, snapshot)).join(". ")}.`;
  const generic = /^(listo|hecho|cambios confirmados|datos actualizados|cambios guardados)[.!]?$/i.test(String(message).trim());
  if (structured || bankConfirmation) {
    // Keep explanations of unsupported parts/recovery as well as questions.
    const followUp = withoutLeadingConfirmation(message, visible, snapshot, bankConfirmation);
    return [structured ? summary : conciseSummary, followUp].filter(Boolean).join("\n\n");
  }
  if (generic) return conciseSummary;
  return message;
}

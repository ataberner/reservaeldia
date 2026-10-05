import { getDesignerAiLocationPhaseLabel } from "./designerAiLocationInteraction.js";

const methodNames = { holder: "Titular", bank: "Banco", alias: "Alias", cbu: "CBU", cuit: "CUIT", giftListLink: "Lista de regalos" };

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

function withoutLeadingConfirmation(message, receipts, snapshot) {
  let remainder = String(message).trim();
  const descriptions = receipts.map((r) => describeAction(r.action, snapshot).toLowerCase());
  while (remainder) {
    const sentence = /^[^¿?]*?(?:[.!](?=\s|$)|$)/.exec(remainder)?.[0];
    if (!sentence) break;
    const text = sentence.replace(/[.!]$/, "").trim().toLowerCase();
    if (!/^(listo|hecho|perfecto|agregué|activé|desactivé|actualicé|cambié|guardé|configuré|datos actualizados)\b/.test(text) && !descriptions.includes(text)) break;
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
  if (!partial && !structured && confirmed.length === 1) return `Listo. ${describeAction(confirmed[0].action, snapshot)}.`;
  const heading = partial ? `Se guardaron ${confirmed.length} de ${requested.length} cambios:` : `Listo, guardé ${confirmed.length} cambios:`;
  return [heading, ...requested.map((r) => confirmed.includes(r)
    ? `✓ ${describeAction(r.action, snapshot)}`
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
  const generic = /^(listo|hecho|cambios confirmados|datos actualizados|cambios guardados)[.!]?$/i.test(String(message).trim());
  if (structured) {
    // Keep explanations of unsupported parts/recovery as well as questions.
    const followUp = withoutLeadingConfirmation(message, visible, snapshot);
    return [summary, followUp].filter(Boolean).join("\n\n");
  }
  if (generic) return visible.length === 1 ? summary : `Listo. ${visible.map((r) => describeAction(r.action, snapshot)).join(". ")}.`;
  return message;
}

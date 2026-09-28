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
      return `${a.phase === "party" ? "Fiesta" : "Ceremonia"} · ${parts.join(" · ")}`;
    }
    case "event.set_location_text": return `Ubicación de ${a.phase === "party" ? "la fiesta" : "la ceremonia"} actualizada`;
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

export function buildDesignerAiExecutionFeedback(results, { partial = false, snapshot } = {}) {
  const requested = (Array.isArray(results) ? results : []).filter((r) => r.requested);
  if (!requested.length) return "";
  const confirmed = requested.filter((r) => r.effective && r.persisted && !r.error);
  if (!partial && confirmed.length !== requested.length) return "";
  if (!partial && confirmed.length === 1) return `Listo. ${describeAction(confirmed[0].action, snapshot)}.`;
  const heading = partial ? `Se guardaron ${confirmed.length} de ${requested.length} cambios:` : `Listo, guardé ${confirmed.length} cambios:`;
  return [heading, ...requested.map((r) => confirmed.includes(r)
    ? `✓ ${describeAction(r.action, snapshot)}`
    : `⚠ ${r.executed ? "No pude confirmar el guardado del cambio" : "Quedó pendiente el cambio"}: ${describeAction(r.action, snapshot)}`)].join("\n");
}

export function withDesignerAiExecutionFeedback(message, results, snapshot) {
  const summary = buildDesignerAiExecutionFeedback(results, { snapshot });
  if (!summary) return message;
  const generic = /^(listo|hecho|cambios confirmados|datos actualizados|cambios guardados)[.!]?$/i.test(String(message).trim());
  if (generic) return summary;
  return results.length > 1 ? `${summary}\n\n${message}` : message;
}

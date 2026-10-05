// Anonymized production exchange: synthetic names, venue/address, no account,
// draft ID, provider data, bank details or private media. Provider interpretations
// are explicit fixtures; this exercises orchestration, not live-model quality.
const action = (type, args) => ({ type, arguments: args });
const resolution = (leafId, status, rule = null) => ({ leafId, status, rule });
const datetime = (date, startTime = null) => action("event.set_datetime", { phase: "ceremony", date, startTime, endTime: null });
export const deferredLocation = ["venue_name", "address", "place_selection"].map((id) => resolution(`event.ceremony.${id}`, "deferred_by_user"));
export const manualLocation = [action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "Calle Ejemplo 123" })];
export const manualDecision = resolution("event.ceremony.place_selection", "resolved_by_rule", "leave_empty");

export function productionConversation({ placeKnown = false, rsvp = false, gifts = false, combinedTime = false, shortDate = false } = {}) {
  return [
    { user: null, assistantMessage: "¡Hola! ¿Me compartís los nombres de quienes se casan?" },
    { user: "Somo Ana y Luz", assistantMessage: "¡Perfecto, Ana y Luz! ¿Van a tener ceremonia y fiesta o un único evento?", actions: [action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" })] },
    { user: "Solo fiesta", assistantMessage: "Perfecto. ¿Qué día es la fiesta?", actions: [action("event.set_mode", { mode: "single" })] },
    ...(shortDate ? [] : [{ user: "es el 24 de diceimbre", assistantMessage: "¿De qué año?", resolutions: [resolution("event.ceremony.date", "needs_clarification")] }]),
    { user: shortDate ? "24/12/26" : "2026", assistantMessage: "Perfecto, 24 de diciembre de 2026. ¿A qué hora empieza y dónde es?", actions: [datetime("2026-12-24")] },
    { user: combinedTime ? "A las 20. El lugar todavía no lo definimos." : "es a las 20:00", assistantMessage: combinedTime ? "Perfecto, dejo el lugar pendiente." : "Perfecto, queda a las 20:00. ¿En qué lugar es la fiesta?", actions: [datetime(null, "20:00")], resolutions: combinedTime ? deferredLocation : [] },
    ...(combinedTime ? [] : [{ user: placeKnown ? "Salón de prueba, Calle Ejemplo 123. Sin Maps." : "aun no lo definimos", assistantMessage: placeKnown ? "Listo, cargué el lugar." : "Está perfecto, lo dejamos pendiente por ahora.", actions: placeKnown ? manualLocation : [], resolutions: placeKnown ? [manualDecision] : deferredLocation }]),
    { user: "Si, es cocktail", assistantMessage: "Perfecto, agregué el dress code Cocktail. Cuando definan el lugar, pasame el nombre o la dirección y lo incorporamos.", actions: [action("event.set_dress_code", { enabled: true, value: "Cocktail" })] },
    { user: "ok", assistantMessage: "Perfecto, lo dejamos así por ahora." },
    { user: rsvp ? "Sí, que confirmen asistencia." : "No queremos confirmación de asistencia.", assistantMessage: rsvp ? "Listo, activé la confirmación de asistencia." : "Perfecto, sin confirmación de asistencia.", actions: [action("rsvp.set_enabled", { enabled: rsvp })] },
    { user: gifts ? "Sí, una lista. https://example.com/regalos" : "Regalos no.", assistantMessage: gifts ? "Agregué la lista de regalos." : "Perfecto, sin regalos.", actions: [action("gifts.set_enabled", { enabled: gifts }), ...(gifts ? [action("gifts.set_method", { method: "giftListLink", value: "https://example.com/regalos", visible: true })] : [])] },
  ];
}

export function templateDraft(dateText = "18|10|26") {
  const fieldsSchema = ["primary_person_name", "secondary_person_name", "ceremony_date", "ceremony_start_time", "ceremony_end_time", "ceremony_venue_name", "ceremony_venue_address", "dress_code"].map((role) => ({ key: `event_${role}`, eventDetailsRole: role, type: role.endsWith("date") ? "date" : role.endsWith("time") ? "time" : "text", applyTargets: [] }));
  fieldsSchema.find((f) => f.type === "date").applyTargets = [{ scope: "objeto", id: "date-view", path: "texto" }];
  fieldsSchema.find((f) => f.eventDetailsRole === "ceremony_start_time").applyTargets = [{ scope: "objeto", id: "time-view", path: "texto" }];
  return { sourceContext: { templateDerived: true, changedKeys: [] }, authoring: { fieldsSchema, defaults: {} },
    render: { objetos: [{ id: "date-view", tipo: "texto", texto: dateText, fontSize: 28, fontFamily: "Georgia", fill: "#663355", x: 10, y: 10 }, { id: "time-view", tipo: "texto", texto: "18.30 hs.", fontSize: 20 }], secciones: [], rsvp: { enabled: false }, gifts: { enabled: false }, eventDetails: { mode: "single" } } };
}

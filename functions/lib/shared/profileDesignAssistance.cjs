// Optional human design assistance belongs to the user's private profile.
// An omitted patch preserves the preference written by newer clients.
function validateDesignAssistance(raw) {
  if (raw === undefined) return { value: undefined, error: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.requested !== "boolean") {
    return { value: undefined, error: "La solicitud de asistencia no es válida." };
  }
  if (!raw.requested) return { value: { requested: false, whatsapp: null }, error: null };
  if (raw.whatsapp == null || raw.whatsapp === "") {
    return { value: { requested: true, whatsapp: null }, error: null };
  }
  if (typeof raw.whatsapp !== "string" || raw.whatsapp.length > 40) {
    return { value: undefined, error: "Ingresá un WhatsApp válido con código de país, por ejemplo +54 9 11 1234 5678." };
  }
  const phone = raw.whatsapp.trim();
  if (!phone) return { value: { requested: true, whatsapp: null }, error: null };
  const normalized = phone.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return { value: undefined, error: "Ingresá un WhatsApp válido con código de país, por ejemplo +54 9 11 1234 5678." };
  }
  return { value: { requested: true, whatsapp: normalized }, error: null };
}

function readDesignAssistance(raw) {
  const result = validateDesignAssistance(raw);
  return result.value || { requested: false, whatsapp: null };
}

module.exports = { validateDesignAssistance, readDesignAssistance };

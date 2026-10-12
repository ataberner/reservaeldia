import { normalizeGiftConfig } from "../gifts/config.js";
import reducers from "../../../shared/designerAiConfigReducers.cjs";
import projection from "../../../shared/designerAiActionProjection.cjs";

const { applySelectedGiftAction, confirmedGiftMethods } = reducers;
const { orderDesignerAiActions } = projection;
const sensitiveMethods = ["giftListLink"];
const bankMethods = ["holder", "bank", "alias", "cbu", "cuit"];
const labels = { holder: "Titular", bank: "Banco", alias: "Alias", cbu: "CBU / CVU", cuit: "CUIT", giftListLink: "Lista de regalos" };
const proposals = new WeakMap();
const approvals = new WeakMap();
const valueOf = (config, method) => method === "giftListLink" ? config.giftListUrl : config.bank[method];
const fail = (code, message) => Object.assign(new Error(message), { code });
const contextKey = ({ actions, snapshot, rawGifts, recovery }) => JSON.stringify({
  actions: orderDesignerAiActions(actions),
  document: snapshot.documentIdentity,
  availability: snapshot.availability,
  values: snapshot.values,
  gifts: normalizeGiftConfig(rawGifts, { forceEnabled: false }),
  confirmedMethods: [...(recovery?.confirmedGiftMethods || confirmedGiftMethods(snapshot))].sort(),
  recovery: recovery?.actionResults?.map(({ action, effective, persisted, error }) => ({ action, effective, persisted, error })) || null,
});

export function resolveDesignerAiBankInput({ actions, snapshot, conversationState, recovery }) {
  const confirmed = new Set(bankMethods.filter(method => {
    const leaf = snapshot.ledger.leaves.find(item => item.id === `gifts.method.${method}.value`);
    const stored = conversationState?.resolutions?.find(item => item.leafId === leaf?.id && item.fingerprint === leaf.fingerprint);
    const optimisticPreservation = recovery?.actionResults?.some(receipt => receipt.effective && !receipt.persisted &&
      receipt.action.type === "gifts.set_method" && receipt.action.arguments.method === method && receipt.action.arguments.value === null);
    return [optimisticPreservation ? null : leaf, stored].some(item => ["resolved_from_user", "resolved_from_existing_user_data"].includes(item?.status) &&
      ["user_current_session", "existing_user_data"].includes(item?.provenance));
  }));
  const rejected = new Set();
  const missing = new Set();
  for (const [index, action] of orderDesignerAiActions(actions).entries()) {
    if (recovery?.actionResults?.[index]?.persisted || action.type !== "gifts.set_method" || !bankMethods.includes(action.arguments.method)) continue;
    const { method, value, visible } = action.arguments;
    if (value !== null) {
      if (String(value).trim()) { confirmed.add(method); missing.delete(method); }
      else confirmed.delete(method);
    } else if (visible && !confirmed.has(method)) {
      if (snapshot.values.gifts.methods?.[method]?.value?.trim()) rejected.add(action);
      missing.add(method);
    }
  }
  return { actions: actions.filter(action => !rejected.has(action)), missingMethods: [...missing],
    blockedMethods: [...new Set([...rejected].map(action => action.arguments.method))],
    clarification: missing.size ? `Pasame ${[...missing].map(method => labels[method]).join(" y ")} que quieran mostrar.` : "" };
}

export function describeDesignerAiProposedAction(action) {
  const a = action.arguments;
  switch (action.type) {
    case "document.set_name": return `Nombre de la invitación: ${a.name}`;
    case "event.set_people": return `Nombres: ${a.primaryName} y ${a.secondaryName}`;
    case "event.set_mode": return a.mode === "single" ? "Configurar un evento único" : "Configurar ceremonia y fiesta";
    case "event.set_datetime": return `Fecha y horarios (${a.phase === "party" ? "fiesta" : "evento"}): ${[a.date, a.startTime, a.endTime].filter(v => v !== null).map(v => v || "sin indicar").join(" · ")}`;
    case "event.set_location_text": return `Ubicación: ${a.venueName} · ${a.address}`;
    case "event.set_dress_code": return a.enabled ? `Código de vestimenta: ${a.value}` : "Ocultar el código de vestimenta";
    case "story.set_text": return "Actualizar el texto de la historia";
    case "gallery.move_photo": return "Reordenar una foto de la galería";
    case "rsvp.set_enabled": return `${a.enabled ? "Activar" : "Desactivar"} la confirmación de asistencia`;
    case "rsvp.remove_option": return "Eliminar una opción de confirmación de asistencia";
    case "gifts.set_enabled": return `${a.enabled ? "Activar" : "Desactivar"} Regalos`;
    case "gifts.set_method": return `Actualizar ${labels[a.method] || "un método de regalos"}`;
    case "gifts.set_intro_text": return "Actualizar el texto de Regalos";
    case "gifts.set_button_text": return `Texto del botón de Regalos: ${a.text}`;
    default: return "Actualizar el formulario de confirmación de asistencia";
  }
}

// Only a local view of the existing reducers. No configuration is written here,
// and the full URLs/values used for review never enter the model snapshot.
export function createDesignerAiGiftProposal(context, isSessionCurrent = () => true) {
  const { actions, snapshot, rawGifts, recovery } = context;
  let config = normalizeGiftConfig(rawGifts, { forceEnabled: false });
  const confirmed = new Set(recovery?.confirmedGiftMethods || confirmedGiftMethods(snapshot));
  const explicitlyChangesList = actions.some(action => action.type === "gifts.set_method" && action.arguments.method === "giftListLink");
  const steps = [];
  const pending = [];
  let required = false;
  for (const [index, action] of orderDesignerAiActions(actions).entries()) {
    const receipt = recovery?.actionResults?.[index];
    if (receipt?.persisted && !receipt.error) continue;
    if (action.type !== "gifts.set_method" || !bankMethods.includes(action.arguments.method)) {
      pending.push(describeDesignerAiProposedAction(action));
    }
    if (!action.type.startsWith("gifts.")) continue;
    const next = receipt?.effective ? config : applySelectedGiftAction(config, action, confirmed);
    // A locally reflected effect is not a saved effect. On retry, the original
    // visibility may already be gone, so review retained destinations too.
    const retryMethods = receipt?.effective && ["gifts.set_enabled", "gifts.set_method"].includes(action.type);
    // Choosing bank details also hides unconfirmed template methods through the
    // existing reducer. That implicit cleanup is not a requested URL change.
    const implicitlyHidesUnconfirmedList = !explicitlyChangesList && !confirmed.has("giftListLink") &&
      ((action.type === "gifts.set_enabled" && action.arguments.enabled) ||
        (action.type === "gifts.set_method" && bankMethods.includes(action.arguments.method))) &&
      config.giftListUrl === next.giftListUrl && next.visibility.giftListLink === false;
    const rows = sensitiveMethods.filter(method => !implicitlyHidesUnconfirmedList && (valueOf(config, method) !== valueOf(next, method) ||
      config.visibility[method] !== next.visibility[method] ||
      (config.enabled !== next.enabled && (config.visibility[method] || next.visibility[method]) && (valueOf(config, method) || valueOf(next, method))) ||
      (receipt?.effective && action.type === "gifts.set_method" && action.arguments.method === method) ||
      (retryMethods && sensitiveMethods.includes(method) && valueOf(config, method))))
      .map(method => ({ method, label: labels[method], before: valueOf(config, method), after: valueOf(next, method),
        beforeVisible: config.enabled && config.visibility[method], afterVisible: next.enabled && next.visibility[method],
        beforeSelected: config.visibility[method], afterSelected: next.visibility[method] }));
    if (rows.some(row => sensitiveMethods.includes(row.method) && (row.before || row.after || retryMethods))) required = true;
    if (rows.length || config.enabled !== next.enabled) steps.push({ label: action.type === "gifts.set_method" && bankMethods.includes(action.arguments.method)
      ? "Actualizar la visibilidad de la lista externa" : describeDesignerAiProposedAction(action), rows,
      beforeEnabled: config.enabled, afterEnabled: next.enabled, persistOnly: receipt?.effective === true });
    config = next;
  }
  if (!required) return null;
  const proposal = { documentName: snapshot.values.documentName || "Esta invitación", steps, summary: pending,
    savedCount: recovery?.actionResults?.filter(r => r.persisted && !r.error).length || 0 };
  proposals.set(proposal, { key: contextKey(context), isSessionCurrent });
  return proposal;
}

export function approveDesignerAiGiftProposal(proposal, context) {
  const record = proposals.get(proposal);
  proposals.delete(proposal);
  if (!record || !record.isSessionCurrent() || record.key !== contextKey(context)) {
    throw fail("designer-ai/stale-snapshot", "La invitación cambió. Enviá una nueva solicitud antes de confirmar.");
  }
  const approval = Object.freeze({});
  approvals.set(approval, record);
  return approval;
}

export function discardDesignerAiGiftProposal(proposal) { proposals.delete(proposal); }

export function isDesignerAiGiftProposalCurrent(proposal, context) {
  const record = proposals.get(proposal);
  return Boolean(record && record.isSessionCurrent() && record.key === contextKey(context));
}

export function requireDesignerAiGiftApproval(context, approval) {
  if (resolveDesignerAiBankInput(context).blockedMethods.length) {
    throw fail("designer-ai/bank-value-required", "Indicá por chat los datos bancarios que quieras mostrar.");
  }
  const proposal = createDesignerAiGiftProposal(context);
  if (!proposal) return;
  proposals.delete(proposal);
  const record = approval && approvals.get(approval);
  if (approval) approvals.delete(approval);
  if (!record || !record.isSessionCurrent() || record.key !== contextKey(context)) {
    throw fail("designer-ai/gift-approval-required", "Revisá y confirmá los cambios de Regalos antes de aplicarlos.");
  }
}
